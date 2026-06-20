/**
 * Rajarata Campus Life Manager - Firestore Sync Service
 * Handles bidirectional sync between IndexedDB and Firebase Firestore.
 *
 * Architecture:
 *   IndexedDB = always primary (instant reads/writes, fully offline)
 *   Firestore  = cloud backup + multi-device sync layer
 *
 * All Firestore calls are fire-and-forget from CRUD operations.
 * The app never waits for Firestore before responding to the user.
 */

import { Database } from './db.js';
import { Auth } from '../auth.js';

/**
 * Recursively sort keys of an object to perform deep JSON comparisons.
 */
const canonicalStringify = (obj) => {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => {
    return JSON.stringify(k) + ':' + canonicalStringify(obj[k]);
  });
  return '{' + parts.join(',') + '}';
};

// Stores to sync (exclude 'students' — handled via users collection)
const SYNC_STORES = [
  'subjects', 'exams', 'practicals', 'assignments',
  'attendance', 'sports', 'studyplans', 'notes', 'settings', 'resources'
];

// Primary key field for each store (used as Firestore document ID)
const STORE_KEYS = {
  subjects:    'code',
  exams:       'id',
  practicals:  'id',
  assignments: 'id',
  sports:      'id',
  studyplans:  'id',
  notes:       'id',
  attendance:  'subjectCode',
  settings:    'key',
  resources:   'id'
};

// Lazy-load Firestore SDK functions from window.__firestore context
const getFirestoreFns = () => {
  if (!window.__firebaseSDK) return null;
  return window.__firebaseSDK;
};

export const FirestoreSync = {
  /**
   * Verify Firestore is available and the user is logged in.
   * @returns {boolean}
   */
  isReady() {
    return !!(window.__firestore && Auth.getCurrentUserId());
  },

  /**
   * Build the Firestore collection path for a given store + current user.
   * Path: users/{userId}/{storeName}
   */
  getUserCollectionPath(storeName) {
    const userId = Auth.getCurrentUserId();
    if (!userId) return null;
    return `users/${userId}/${storeName}`;
  },

  /**
   * Push all local IndexedDB data for the current user up to Firestore.
   * Used for initial sync or manual full-push.
   * @returns {Promise<{success: boolean, synced: number, reason?: string}>}
   */
  async pushAllToCloud() {
    if (!this.isReady()) return { success: false, reason: 'Firebase not available or not logged in' };
    const fns = getFirestoreFns();
    if (!fns) return { success: false, reason: 'Firebase SDK not loaded' };

    const { doc, setDoc, serverTimestamp, collection, getDocs } = fns;
    const db = window.__firestore;
    const userId = Auth.getCurrentUserId();

    let synced = 0;

    // Helper to extract timestamp in ms from record defensively
    const getTimestampMs = (record) => {
      if (!record) return 0;
      if (record._updatedAt) {
        const parsed = Date.parse(record._updatedAt);
        if (!isNaN(parsed)) return parsed;
      }
      if (record._syncedAt) {
        if (typeof record._syncedAt.toDate === 'function') {
          return record._syncedAt.toDate().getTime();
        }
        if (record._syncedAt.seconds) {
          return record._syncedAt.seconds * 1000;
        }
        const parsed = Date.parse(record._syncedAt);
        if (!isNaN(parsed)) return parsed;
      }
      return 0;
    };

    // Set app sync flag to prevent local write cycles from overwriting timestamps
    sessionStorage.setItem('is_app_syncing', 'true');

    try {
      // Sync each store bidirectionally using LWW
      for (const storeName of SYNC_STORES) {
        try {
          const localRecords = await Database.getAll(storeName);
          const userLocalRecords = storeName === 'settings'
            ? localRecords.filter(r => !r.userId || r.userId === userId)
            : localRecords.filter(r => r.userId === userId);

          const colPath = this.getUserCollectionPath(storeName);
          if (!colPath) continue;

          // Fetch all remote records from Firestore
          const snapshot = await getDocs(collection(db, colPath));
          const remoteRecords = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
          }));

          const keyField = STORE_KEYS[storeName];

          // Map local records
          const localMap = new Map();
          userLocalRecords.forEach(r => {
            const id = String(r[keyField] || r.id);
            localMap.set(id, r);
          });

          // Map remote records
          const remoteMap = new Map();
          remoteRecords.forEach(r => {
            const id = String(r[keyField] || r.id);
            remoteMap.set(id, r);
          });

          // Union of keys
          const allKeys = new Set([...localMap.keys(), ...remoteMap.keys()]);

          for (const key of allKeys) {
            const localRec = localMap.get(key);
            const remoteRec = remoteMap.get(key);

            if (localRec && !remoteRec) {
              // Exists locally only -> push to cloud
              const docRef = doc(db, colPath, key);
              await setDoc(docRef, { ...localRec, _syncedAt: serverTimestamp() });
              synced++;
            } else if (!localRec && remoteRec) {
              // Exists remotely only -> pull to local
              const { _syncedAt, ...cleanData } = remoteRec;
              await Database.put(storeName, cleanData);
              synced++;
            } else if (localRec && remoteRec) {
              // Exists in both -> resolve via LWW conflict resolution
              const localTime = getTimestampMs(localRec);
              const remoteTime = getTimestampMs(remoteRec);

              if (localTime > remoteTime) {
                // Local is newer -> push to cloud
                const docRef = doc(db, colPath, key);
                await setDoc(docRef, { ...localRec, _syncedAt: serverTimestamp() });
                synced++;
              } else if (remoteTime > localTime) {
                // Remote is newer -> pull to local
                const { _syncedAt, ...cleanData } = remoteRec;
                await Database.put(storeName, cleanData);
                synced++;
              } else {
                // Same timestamp or fallback -> check payload equality
                if (canonicalStringify(localRec) !== canonicalStringify(remoteRec)) {
                  // Fallback: push local to remote
                  const docRef = doc(db, colPath, key);
                  await setDoc(docRef, { ...localRec, _syncedAt: serverTimestamp() });
                  synced++;
                }
              }
            }
          }
        } catch (err) {
          console.warn(`[FirestoreSync] Bidirectional sync failed for store "${storeName}":`, err.message);
        }
      }

      // Push user profile document
      try {
        const allUsers = await Database.getAll('users');
        const user = allUsers.find(u => u.userId === userId);
        if (user) {
          await setDoc(doc(db, 'users', userId), {
            ...user, _syncedAt: serverTimestamp()
          });
          synced++;
        }
      } catch (err) {
        console.warn('[FirestoreSync] User profile push failed:', err.message);
      }
    } finally {
      sessionStorage.removeItem('is_app_syncing');
    }

    return { success: true, synced };
  },

  /**
   * Pull all data from Firestore for the current user into IndexedDB.
   * Called on first login when local data is empty.
   * @returns {Promise<{success: boolean, restored: number, reason?: string}>}
   */
  async pullFromCloud() {
    if (!this.isReady()) return { success: false, reason: 'Firebase not available or not logged in' };
    const fns = getFirestoreFns();
    if (!fns) return { success: false, reason: 'Firebase SDK not loaded' };

    const { collection, getDocs } = fns;
    const db = window.__firestore;
    const userId = Auth.getCurrentUserId();

    let restored = 0;

    sessionStorage.setItem('is_app_syncing', 'true');
    try {
      for (const storeName of SYNC_STORES) {
        try {
          const colPath = this.getUserCollectionPath(storeName);
          if (!colPath) continue;

          const snapshot = await getDocs(collection(db, colPath));
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            // Strip Firestore-only metadata before writing to IndexedDB
            const { _syncedAt, ...cleanData } = data;
            
            // Perform deep comparison check
            const keyField = STORE_KEYS[storeName];
            const docId = cleanData[keyField];
            if (docId) {
              const localRecord = await Database.get(storeName, docId);
              if (localRecord) {
                if (canonicalStringify(localRecord) === canonicalStringify(cleanData)) {
                  continue; // Abort local write, payloads match 100%
                }
              }
            }

            try {
              await Database.put(storeName, cleanData);
              restored++;
            } catch (e) {
              console.warn(`[FirestoreSync] IndexedDB put failed for ${storeName}:`, e.message);
            }
          }
        } catch (err) {
          console.warn(`[FirestoreSync] Pull failed for store "${storeName}":`, err.message);
        }
      }

      // Pull user profile
      try {
        const { doc, getDoc } = fns;
        const userDocSnap = await getDoc(doc(db, 'users', userId));
        if (userDocSnap.exists()) {
          const { _syncedAt, ...userData } = userDocSnap.data();
          const localUser = await Database.get('users', userId);
          let shouldUpdate = true;
          if (localUser) {
            if (canonicalStringify(localUser) === canonicalStringify(userData)) {
              shouldUpdate = false;
            }
          }
          if (shouldUpdate) {
            await Database.put('users', userData);
            restored++;
          }
        }
      } catch (err) {
        console.warn('[FirestoreSync] User profile pull failed:', err.message);
      }
    } finally {
      sessionStorage.removeItem('is_app_syncing');
    }

    return { success: true, restored };
  },

  /**
   * Sync a single record to Firestore immediately.
   * Called after every successful IndexedDB write.
   * Silently swallows errors — IndexedDB is always source of truth.
   *
   * @param {string} storeName
   * @param {object} record
   * @returns {Promise<void>}
   */
  async syncRecord(storeName, record) {
    if (!this.isReady()) return;
    if (!SYNC_STORES.includes(storeName)) return;

    const fns = getFirestoreFns();
    if (!fns) return;

    const { doc, setDoc, serverTimestamp } = fns;
    const db = window.__firestore;
    const colPath = this.getUserCollectionPath(storeName);
    if (!colPath) return;

    const keyField = STORE_KEYS[storeName];
    const docId = String(record[keyField] || record.id || `doc_${Date.now()}`);

    try {
      await setDoc(doc(db, colPath, docId), {
        ...record, _syncedAt: serverTimestamp()
      });
    } catch (err) {
      // Silently fail — data is already saved locally
      console.debug(`[FirestoreSync] Background sync failed (${storeName}/${docId}):`, err.message);
    }
  },

  /**
   * Delete a record from Firestore.
   * @param {string} storeName
   * @param {string|number} keyValue
   * @returns {Promise<void>}
   */
  async deleteRecord(storeName, keyValue) {
    if (!this.isReady()) return;
    if (!SYNC_STORES.includes(storeName)) return;

    const fns = getFirestoreFns();
    if (!fns) return;

    const { doc, deleteDoc } = fns;
    const db = window.__firestore;
    const colPath = this.getUserCollectionPath(storeName);
    if (!colPath) return;

    try {
      await deleteDoc(doc(db, colPath, String(keyValue)));
    } catch (err) {
      console.debug(`[FirestoreSync] Background delete failed (${storeName}/${keyValue}):`, err.message);
    }
  },

  /**
   * Check if a user has any existing cloud data (for restore prompt).
   * @param {string} userId
   * @returns {Promise<boolean>}
   */
  async hasCloudData(userId) {
    if (!window.__firestore) return false;
    const fns = getFirestoreFns();
    if (!fns) return false;

    try {
      const { collection, getDocs, query, limit } = fns;
      const db = window.__firestore;
      const colPath = `users/${userId}/subjects`;
      const snapshot = await getDocs(query(collection(db, colPath), limit(1)));
      return !snapshot.empty;
    } catch {
      return false;
    }
  }
};
