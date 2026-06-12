/**
 * Rajarata Campus Life Manager - Database Services
 * Promise-based IndexedDB Wrapper supporting CRUD transactions
 * v2: Added 'users' store for multi-account auth support
 */

import { Auth } from '../auth.js';
import { FirestoreSync } from './firestore-sync.js';

const DB_NAME = 'RajarataCampusLifeDB';
const DB_VERSION = 2; // Bumped from 1 → 2 to add 'users' store

let dbInstance = null;

// Cross-module boolean lock: prevents nested background sync execution waves.
let isSyncingActive = false;

export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Users Authentication Store (NEW in v2)
      if (!db.objectStoreNames.contains('users')) {
        db.createObjectStore('users', { keyPath: 'userId' });
      }

      // Students Profile Store (legacy — kept for backward compatibility)
      if (!db.objectStoreNames.contains('students')) {
        db.createObjectStore('students', { keyPath: 'id' });
      }

      // Academic Subjects Store
      if (!db.objectStoreNames.contains('subjects')) {
        db.createObjectStore('subjects', { keyPath: 'code' });
      }

      // Examination Records Store
      if (!db.objectStoreNames.contains('exams')) {
        db.createObjectStore('exams', { keyPath: 'id' });
      }

      // Practical Labs Sessions Store
      if (!db.objectStoreNames.contains('practicals')) {
        db.createObjectStore('practicals', { keyPath: 'id' });
      }

      // Course Assignments Store
      if (!db.objectStoreNames.contains('assignments')) {
        db.createObjectStore('assignments', { keyPath: 'id' });
      }

      // Attendance Records Store
      if (!db.objectStoreNames.contains('attendance')) {
        db.createObjectStore('attendance', { keyPath: 'subjectCode' });
      }

      // Sports Training and Match Store
      if (!db.objectStoreNames.contains('sports')) {
        db.createObjectStore('sports', { keyPath: 'id' });
      }

      // Study Planner Store
      if (!db.objectStoreNames.contains('studyplans')) {
        db.createObjectStore('studyplans', { keyPath: 'id' });
      }

      // Academic Notes Store
      if (!db.objectStoreNames.contains('notes')) {
        db.createObjectStore('notes', { keyPath: 'id' });
      }

      // Settings Store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };

    request.onsuccess = (e) => {
      dbInstance = e.target.result;
      resolve(dbInstance);
    };

    request.onerror = (e) => {
      console.error('IndexedDB error:', e.target.error);
      reject(e.target.error);
    };
  });
};

/**
 * Standard CRUD Operations
 */
export const dbOperation = (storeName, mode, callback) => {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let request;
      
      try {
        request = callback(store);
      } catch (err) {
        return reject(err);
      }

      transaction.oncomplete = () => {
        resolve(request ? request.result : null);
      };

      transaction.onerror = (e) => {
        reject(e.target.error);
      };
      
      if (request) {
        request.onerror = (e) => {
          reject(e.target.error);
        };
      }
    });
  });
};

/**
 * Trigger background Firestore sync.
 * - Dispatches 'offline' if the browser has no network connection.
 * - Dispatches 'syncing' → then 'synced' or 'error' based on FirestoreSync.pushAllToCloud().
 * - Falls back to 'synced' (local-only mode) when FirestoreSync is not ready.
 */
export const triggerBackgroundSync = async () => {
  const dispatch = (status) =>
    window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: status }));

  // State guard: abort immediately if a sync wave is already in flight
  // to prevent thread flooding and infinite settings-store write cascades.
  // Must check BEFORE dispatching 'syncing' to avoid false status flicker.
  if (isSyncingActive) return;

  // If the device is completely offline, reflect that immediately.
  if (!navigator.onLine) {
    dispatch('offline');
    return;
  }

  // If FirestoreSync isn't initialised yet (SDK not loaded / not logged in),
  // show 'synced' to indicate local data is intact.
  if (!FirestoreSync.isReady()) {
    dispatch('synced');
    return;
  }

  // Announce sync attempt only once all guards pass.
  dispatch('syncing');

  // Full cloud push wrapped in the mutex lock.
  isSyncingActive = true;
  try {
    const result = await FirestoreSync.pushAllToCloud();
    if (result.success) {
      dispatch('synced');
    } else {
      console.warn('[DB] Background sync incomplete:', result.reason);
      dispatch('error');
    }
  } catch (err) {
    console.error('[DB] Background sync threw:', err);
    dispatch('error');
  } finally {
    // Always release the lock so subsequent writes can trigger sync again.
    isSyncingActive = false;
  }
};

/**
 * Check Firestore for existing cloud data and restore to IndexedDB if found.
 * Only runs when the user has no local data yet (first login on new device).
 * @returns {Promise<boolean>} true if data was restored (app should reload)
 */
export const checkAndRestoreFromCloud = async () => {
  const userId = Auth.getCurrentUserId();
  if (!userId) return false;

  try {
    // Only restore if local subjects store is empty for this user
    const localSubjects = await Database.getAll('subjects');
    const userLocalSubjects = localSubjects.filter(s => s.userId === userId);
    if (userLocalSubjects.length > 0) return false;

    // Check cloud
    const hasCloud = await FirestoreSync.hasCloudData(userId);
    if (!hasCloud) return false;

    // Pull from cloud into IndexedDB
    const result = await FirestoreSync.pullFromCloud();
    if (result.success && result.restored > 0) {
      console.log(`[DB] Restored ${result.restored} records from Firestore`);
      return true; // Caller should reload
    }
  } catch (err) {
    console.warn('[DB] Cloud restore check failed:', err.message);
  }
  return false;
};

export const Database = {
  getAll(storeName) {
    return dbOperation(storeName, 'readonly', (store) => store.getAll());
  },

  get(storeName, key) {
    return dbOperation(storeName, 'readonly', (store) => store.get(key));
  },

  add(storeName, data) {
    return dbOperation(storeName, 'readwrite', (store) => store.add(data))
      .then(async (result) => {
        // Explicitly invoke Firestore sync for this record and surface the outcome.
        window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'syncing' }));
        try {
          await FirestoreSync.syncRecord(storeName, data);
          window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'synced' }));
        } catch (err) {
          console.warn('[DB] add() cloud sync failed:', err.message);
          window.dispatchEvent(new CustomEvent('syncStatusChanged', {
            detail: navigator.onLine ? 'error' : 'offline'
          }));
        }
        // Force immediate UI module refresh for all stores except 'settings'
        // (settings writes must not cascade into another subjectsUpdated loop).
        if (storeName !== 'settings') {
          window.dispatchEvent(new CustomEvent('subjectsUpdated'));
        }
        return result;
      });
  },

  put(storeName, data) {
    return dbOperation(storeName, 'readwrite', (store) => store.put(data))
      .then(async (result) => {
        // Explicitly invoke Firestore sync for this record and surface the outcome.
        window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'syncing' }));
        try {
          await FirestoreSync.syncRecord(storeName, data);
          window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'synced' }));
        } catch (err) {
          console.warn('[DB] put() cloud sync failed:', err.message);
          window.dispatchEvent(new CustomEvent('syncStatusChanged', {
            detail: navigator.onLine ? 'error' : 'offline'
          }));
        }
        // Force immediate UI module refresh for all stores except 'settings'
        // (settings writes must not cascade into another subjectsUpdated loop).
        if (storeName !== 'settings') {
          window.dispatchEvent(new CustomEvent('subjectsUpdated'));
        }
        return result;
      });
  },

  delete(storeName, key) {
    return dbOperation(storeName, 'readwrite', (store) => store.delete(key))
      .then(async (result) => {
        // Explicitly invoke Firestore delete and surface the outcome.
        window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'syncing' }));
        try {
          await FirestoreSync.deleteRecord(storeName, key);
          window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'synced' }));
        } catch (err) {
          console.warn('[DB] delete() cloud sync failed:', err.message);
          window.dispatchEvent(new CustomEvent('syncStatusChanged', {
            detail: navigator.onLine ? 'error' : 'offline'
          }));
        }
        // Force immediate UI module refresh for all stores except 'settings'.
        if (storeName !== 'settings') {
          window.dispatchEvent(new CustomEvent('subjectsUpdated'));
        }
        return result;
      });
  },

  clear(storeName) {
    return dbOperation(storeName, 'readwrite', (store) => store.clear())
      .then((result) => {
        triggerBackgroundSync();
        return result;
      });
  }
};
