/**
 * Rajarata Campus Life Manager - Database Services
 * Promise-based IndexedDB Wrapper supporting CRUD transactions
 */



const DB_NAME = 'RajarataCampusLifeDB';
const DB_VERSION = 1;

let dbInstance = null;

export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Students Profile Store
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
      const store = transaction.objectStore(requestStoreName(transaction, storeName));
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

// Helper because Safari / Chrome handle multiple stores mapping differently occasionally
const requestStoreName = (transaction, name) => {
  return name;
};

export const triggerBackgroundSync = async () => {
  window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'offline' }));
};

export const checkAndRestoreFromCloud = async () => {
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
      .then((result) => {
        triggerBackgroundSync();
        return result;
      });
  },

  put(storeName, data) {
    return dbOperation(storeName, 'readwrite', (store) => store.put(data))
      .then((result) => {
        triggerBackgroundSync();
        return result;
      });
  },

  delete(storeName, key) {
    return dbOperation(storeName, 'readwrite', (store) => store.delete(key))
      .then((result) => {
        triggerBackgroundSync();
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
