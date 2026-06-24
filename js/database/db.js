/**
 * Rajarata Campus Life Manager - Database Services
 * Promise-based IndexedDB Wrapper supporting CRUD transactions
 * v2: Added 'users' store for multi-account auth support
 */

import { Auth } from '../auth.js';
import { FirestoreSync } from './firestore-sync.js';

const DB_NAME = 'RajarataCampusLifeDB';
const DB_VERSION = 14; // Bumped to 14 to support focus_sessions and user_habits stores

let dbInstance = null;

// Cross-module session lock: prevents nested background sync execution waves.
// Clear any stale lock on startup after page reload with a short delay (processing interval safety).
setTimeout(() => {
  sessionStorage.removeItem('is_app_syncing');
}, 3000);

export const initDB = () => {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const oldVersion = e.oldVersion;

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

      // Research Project Store (v4)
      if (!db.objectStoreNames.contains('researchProject')) {
        db.createObjectStore('researchProject', { keyPath: 'id' });
      }

      // Research Config Store (v5)
      if (!db.objectStoreNames.contains('researchConfig')) {
        db.createObjectStore('researchConfig', { keyPath: 'id' });
      }

      // Academic Resources Store (v11)
      if (!db.objectStoreNames.contains('resources')) {
        db.createObjectStore('resources', { keyPath: 'id' });
      }

      // Focus Sessions Store (v14)
      if (!db.objectStoreNames.contains('focus_sessions')) {
        db.createObjectStore('focus_sessions', { keyPath: 'id' });
      }

      // User Habits Store (v14)
      if (!db.objectStoreNames.contains('user_habits')) {
        db.createObjectStore('user_habits', { keyPath: 'id' });
      }

      // v6: Student Profile Migration pass
      if (oldVersion > 0 && oldVersion < 6) {
        const trans = request.transaction;
        if (db.objectStoreNames.contains('students')) {
          const store = trans.objectStore('students');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              if (!record.studentInfo) {
                record.studentInfo = {
                  studentId: record.studentId || '',
                  registrationNumber: '',
                  degreeProgramme: record.degree || '',
                  department: '',
                  batch: '',
                  academicYear: record.admissionYear || '',
                  semester: record.currentSemester || '1-1',
                  faculty: record.faculty || '',
                  email: '',
                  phone: '',
                  mentor: { name: '', email: '', contact: '' },
                  academicAdvisor: { name: '', email: '', contact: '' }
                };
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // v7: Course/Subject Profile Migration pass
      if (oldVersion > 0 && oldVersion < 7) {
        const trans = request.transaction;
        if (db.objectStoreNames.contains('subjects')) {
          const store = trans.objectStore('subjects');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;
              if (record.isParent) {
                if (!record.courseCode) { record.courseCode = record.code || ''; updated = true; }
                if (!record.courseTitle) { record.courseTitle = record.name || ''; updated = true; }
                if (!record.department) { record.department = ''; updated = true; }
                if (!record.year) { record.year = '1'; updated = true; }
                if (!record.courseType) { record.courseType = 'CORE'; updated = true; }
                if (!record.prerequisites) { record.prerequisites = []; updated = true; }
                if (!record.corequisites) { record.corequisites = []; updated = true; }
              }
              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // v8: GPA Engine Upgrade Migration pass (grade, gradePoint, credits per record row)
      if (oldVersion > 0 && oldVersion < 8) {
        const trans = request.transaction;
        if (db.objectStoreNames.contains('subjects')) {
          const store = trans.objectStore('subjects');
          const GRADE_MAP = {
            'A+': 4.00, 'A': 4.00, 'A-': 3.70,
            'B+': 3.30, 'B': 3.00, 'B-': 2.70,
            'C+': 2.30, 'C': 2.00, 'C-': 1.70,
            'D+': 1.30, 'D': 1.00, 'E': 0.00
          };
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;

              // Ensure parent attributes exist
              if (record.grade === undefined) { record.grade = ''; updated = true; }
              if (record.gradePoint === undefined) { record.gradePoint = 0.00; updated = true; }
              if (record.credits === undefined) { record.credits = 0; updated = true; }

              // Ensure nested submodules attributes exist
              if (Array.isArray(record.submodules)) {
                record.submodules.forEach(sub => {
                  if (sub.grade === undefined) { sub.grade = ''; updated = true; }
                  if (sub.gradePoint === undefined) {
                    sub.gradePoint = (sub.grade && GRADE_MAP[sub.grade] !== undefined) ? GRADE_MAP[sub.grade] : 0.00;
                    updated = true;
                  }
                  if (sub.credits === undefined) { sub.credits = 3; updated = true; }
                });
              }

              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // v9: Attendance multi-track nested structure (lecture, practical, fieldWork)
      if (oldVersion > 0 && oldVersion < 9) {
        const trans = request.transaction;
        if (db.objectStoreNames.contains('attendance')) {
          const store = trans.objectStore('attendance');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;

              if (!record.courseId) {
                record.courseId = record.subjectCode || '';
                updated = true;
              }
              if (!record.lecture) {
                record.lecture = {
                  total: record.lecturesTotal !== undefined ? record.lecturesTotal : 30,
                  present: record.lecturesAttended !== undefined ? record.lecturesAttended : 0
                };
                updated = true;
              }
              if (!record.practical) {
                record.practical = {
                  total: record.practicalsTotal !== undefined ? record.practicalsTotal : 10,
                  present: record.practicalsAttended !== undefined ? record.practicalsAttended : 0
                };
                updated = true;
              }
              if (!record.fieldWork) {
                record.fieldWork = {
                  total: 0,
                  present: 0
                };
                updated = true;
              }

              // Keep backward compatibility fields in sync
              if (record.lecturesTotal !== record.lecture.total) {
                record.lecturesTotal = record.lecture.total;
                updated = true;
              }
              if (record.lecturesAttended !== record.lecture.present) {
                record.lecturesAttended = record.lecture.present;
                updated = true;
              }
              if (record.practicalsTotal !== (record.practical.total + record.fieldWork.total)) {
                record.practicalsTotal = record.practical.total + record.fieldWork.total;
                updated = true;
              }
              if (record.practicalsAttended !== (record.practical.present + record.fieldWork.present)) {
                record.practicalsAttended = record.practical.present + record.fieldWork.present;
                updated = true;
              }
              if (record.approvedMedicalSessions !== 0) {
                record.approvedMedicalSessions = 0;
                updated = true;
              }

              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // v10: Exam model schema extension (courseId, title, date, time, venue, examType)
      if (oldVersion > 0 && oldVersion < 10) {
        const trans = request.transaction;
        if (db.objectStoreNames.contains('exams')) {
          const store = trans.objectStore('exams');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;

              if (record.courseId === undefined) {
                record.courseId = record.subjectCode || '';
                updated = true;
              }
              if (record.title === undefined) {
                record.title = record.name || '';
                updated = true;
              }
              if (record.examType === undefined) {
                // Enum constraint check: THEORY, PRACTICAL, REPEAT
                const typeUpper = (record.type || '').toUpperCase();
                if (typeUpper.includes('PRACTICAL')) {
                  record.examType = 'PRACTICAL';
                } else if (typeUpper.includes('REPEAT')) {
                  record.examType = 'REPEAT';
                } else {
                  record.examType = 'THEORY'; // Default Theory
                }
                updated = true;
              }

              // Keep legacy fields in sync for backward compatibility
              if (record.name === undefined) {
                record.name = record.title || '';
                updated = true;
              }
              if (record.subjectCode === undefined) {
                record.subjectCode = record.courseId || '';
                updated = true;
              }
              if (record.type === undefined) {
                record.type = record.examType || '';
                updated = true;
              }

              // Sync userId if not set
              const userId = Auth.getCurrentUserId();
              if (record.userId === undefined && userId) {
                record.userId = userId;
                updated = true;
              }

              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // v11: Academic Resources metadata store + Assignments entity schema upgrade
      if (oldVersion > 0 && oldVersion < 11) {
        const trans = request.transaction;
        if (db.objectStoreNames.contains('assignments')) {
          const store = trans.objectStore('assignments');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;

              // Map old subjectCode to courseId
              if (record.courseId === undefined) {
                record.courseId = record.subjectCode || '';
                updated = true;
              }
              // Map old date to deadline
              if (record.deadline === undefined) {
                record.deadline = record.date || '';
                updated = true;
              }
              // Validate status enum: [Pending, Submitted, Completed]
              const oldStatus = record.status || 'Pending';
              let newStatus = 'Pending';
              if (oldStatus === 'Completed') {
                newStatus = 'Completed';
              } else if (oldStatus === 'In Progress' || oldStatus === 'Submitted') {
                newStatus = 'Submitted';
              } else {
                newStatus = 'Pending';
              }
              if (record.status !== newStatus) {
                record.status = newStatus;
                updated = true;
              }

              // Sync userId if not set
              const userId = Auth.getCurrentUserId();
              if (record.userId === undefined && userId) {
                record.userId = userId;
                updated = true;
              }

              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // v13: Safe Database Version Bump & Migration Orchestration
      if (oldVersion > 0 && oldVersion < 13) {
        const trans = request.transaction;
        
        // 1. Migrate Attendance store records
        if (db.objectStoreNames.contains('attendance')) {
          const store = trans.objectStore('attendance');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;

              if (!record.courseId) {
                record.courseId = record.subjectCode || '';
                updated = true;
              }
              if (!record.lecture) {
                record.lecture = {
                  total: record.lecturesTotal !== undefined ? record.lecturesTotal : 0,
                  present: record.lecturesAttended !== undefined ? record.lecturesAttended : 0
                };
                updated = true;
              } else {
                if (record.lecture.total === undefined) { record.lecture.total = record.lecturesTotal !== undefined ? record.lecturesTotal : 0; updated = true; }
                if (record.lecture.present === undefined) { record.lecture.present = record.lecturesAttended !== undefined ? record.lecturesAttended : 0; updated = true; }
              }
              if (!record.practical) {
                record.practical = {
                  total: record.practicalsTotal !== undefined ? record.practicalsTotal : 0,
                  present: record.practicalsAttended !== undefined ? record.practicalsAttended : 0
                };
                updated = true;
              } else {
                if (record.practical.total === undefined) { record.practical.total = record.practicalsTotal !== undefined ? record.practicalsTotal : 0; updated = true; }
                if (record.practical.present === undefined) { record.practical.present = record.practicalsAttended !== undefined ? record.practicalsAttended : 0; updated = true; }
              }
              if (!record.fieldWork) {
                record.fieldWork = { total: 0, present: 0 };
                updated = true;
              } else {
                if (record.fieldWork.total === undefined) { record.fieldWork.total = 0; updated = true; }
                if (record.fieldWork.present === undefined) { record.fieldWork.present = 0; updated = true; }
              }

              // Sync legacy fields
              if (record.lecturesTotal !== record.lecture.total) { record.lecturesTotal = record.lecture.total; updated = true; }
              if (record.lecturesAttended !== record.lecture.present) { record.lecturesAttended = record.lecture.present; updated = true; }
              if (record.practicalsTotal !== (record.practical.total + record.fieldWork.total)) {
                record.practicalsTotal = record.practical.total + record.fieldWork.total;
                updated = true;
              }
              if (record.practicalsAttended !== (record.practical.present + record.fieldWork.present)) {
                record.practicalsAttended = record.practical.present + record.fieldWork.present;
                updated = true;
              }

              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }

        // 2. Migrate Subjects store records
        if (db.objectStoreNames.contains('subjects')) {
          const store = trans.objectStore('subjects');
          store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
              const record = cursor.value;
              let updated = false;

              if (record.grade === undefined) { record.grade = ''; updated = true; }
              if (record.gradePoint === undefined) { record.gradePoint = 0.00; updated = true; }
              if (record.credits === undefined) { record.credits = 3; updated = true; }
              if (record.targetGrade === undefined) { record.targetGrade = ''; updated = true; }
              if (record.theoryWeight === undefined) { record.theoryWeight = 70; updated = true; }
              if (record.practicalWeight === undefined) { record.practicalWeight = 30; updated = true; }
              
              if (!record.internalMarks) {
                record.internalMarks = { ca: 0, quiz: 0, lab: 0 };
                updated = true;
              } else {
                if (record.internalMarks.ca === undefined) { record.internalMarks.ca = 0; updated = true; }
                if (record.internalMarks.quiz === undefined) { record.internalMarks.quiz = 0; updated = true; }
                if (record.internalMarks.lab === undefined) { record.internalMarks.lab = 0; updated = true; }
              }

              if (!record.submodules) {
                record.submodules = [];
                updated = true;
              }

              // Add active user's userId if not present
              const userId = Auth.getCurrentUserId();
              if (record.userId === undefined && userId) {
                record.userId = userId;
                updated = true;
              }

              if (updated) {
                store.put(record);
              }
              cursor.continue();
            }
          };
        }
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

const sanitizeRow = (storeName, row) => {
  if (!row || typeof row !== 'object') return;

  if (storeName === 'subjects') {
    if (row.grade === undefined) row.grade = '';
    if (row.gradePoint === undefined) row.gradePoint = 0.00;
    if (row.credits === undefined) row.credits = 3;
    if (row.targetGrade === undefined) row.targetGrade = '';
    if (row.theoryWeight === undefined) row.theoryWeight = 70;
    if (row.practicalWeight === undefined) row.practicalWeight = 30;
    if (!row.internalMarks) {
      row.internalMarks = { ca: 0, quiz: 0, lab: 0 };
    } else {
      if (row.internalMarks.ca === undefined) row.internalMarks.ca = 0;
      if (row.internalMarks.quiz === undefined) row.internalMarks.quiz = 0;
      if (row.internalMarks.lab === undefined) row.internalMarks.lab = 0;
    }
    if (!row.submodules) row.submodules = [];
  }

  if (storeName === 'attendance') {
    if (!row.courseId) row.courseId = row.subjectCode || '';
    if (!row.lecture) {
      row.lecture = {
        total: row.lecturesTotal !== undefined ? row.lecturesTotal : 0,
        present: row.lecturesAttended !== undefined ? row.lecturesAttended : 0
      };
    } else {
      if (row.lecture.total === undefined) row.lecture.total = 0;
      if (row.lecture.present === undefined) row.lecture.present = 0;
    }
    if (!row.practical) {
      row.practical = {
        total: row.practicalsTotal !== undefined ? row.practicalsTotal : 0,
        present: row.practicalsAttended !== undefined ? row.practicalsAttended : 0
      };
    } else {
      if (row.practical.total === undefined) row.practical.total = 0;
      if (row.practical.present === undefined) row.practical.present = 0;
    }
    if (!row.fieldWork) {
      row.fieldWork = { total: 0, present: 0 };
    } else {
      if (row.fieldWork.total === undefined) row.fieldWork.total = 0;
      if (row.fieldWork.present === undefined) row.fieldWork.present = 0;
    }
  }

  if (storeName === 'exams') {
    if (row.courseId === undefined) row.courseId = row.subjectCode || '';
    if (row.title === undefined) row.title = row.name || '';
    if (row.examType === undefined) {
      const typeUpper = (row.type || '').toUpperCase();
      if (typeUpper.includes('PRACTICAL')) row.examType = 'PRACTICAL';
      else if (typeUpper.includes('REPEAT')) row.examType = 'REPEAT';
      else row.examType = 'THEORY';
    }
    if (row.date === undefined) row.date = '';
    if (row.time === undefined) row.time = '08:30';
    if (row.venue === undefined) row.venue = 'N/A';
  }

  if (storeName === 'assignments') {
    if (row.courseId === undefined) row.courseId = row.subjectCode || '';
    if (row.deadline === undefined) row.deadline = row.date || '';
    if (row.status === undefined) row.status = 'Pending';
    if (row.priority === undefined) row.priority = 'Low';
  }

  if (storeName === 'focus_sessions') {
    if (row.subModuleId === undefined) row.subModuleId = '';
    if (row.duration === undefined) row.duration = 25;
    if (row.date === undefined) row.date = '';
    if (row.notes === undefined) row.notes = '';
    if (row.streak === undefined) row.streak = 0;
  }

  if (storeName === 'user_habits') {
    if (row.habitName === undefined) row.habitName = '';
    if (row.completionDatesArray === undefined) row.completionDatesArray = [];
  }
};

/**
 * Standard CRUD Operations
 */
export const dbOperation = (storeName, mode, callback) => {
  return initDB().then((db) => {
    return new Promise((resolve, reject) => {
      let transaction;
      try {
        transaction = db.transaction(storeName, mode);
      } catch (err) {
        console.warn(`[DB] Transaction start failed on store "${storeName}":`, err.message);
        return resolve(null);
      }

      const store = transaction.objectStore(storeName);
      let request;
      
      try {
        request = callback(store);
      } catch (err) {
        console.warn(`[DB] Callback execution failed on store "${storeName}":`, err.message);
        return resolve(null);
      }

      transaction.oncomplete = () => {
        let result = request ? request.result : null;
        try {
          if (result) {
            if (Array.isArray(result)) {
              result = result.map(row => {
                if (row && typeof row === 'object') {
                  const cloned = JSON.parse(JSON.stringify(row));
                  sanitizeRow(storeName, cloned);
                  return cloned;
                }
                return row;
              });
            } else if (typeof result === 'object') {
              const cloned = JSON.parse(JSON.stringify(result));
              sanitizeRow(storeName, cloned);
              result = cloned;
            }
          }
        } catch (sanitizeErr) {
          console.warn('[DB] Dynamic sanitization error:', sanitizeErr.message);
        }
        resolve(result);
      };

      transaction.onerror = (e) => {
        console.warn(`[DB] Transaction error on store "${storeName}":`, e.target.error);
        resolve(null);
      };
      
      if (request) {
        request.onerror = (e) => {
          console.warn(`[DB] Request error on store "${storeName}":`, e.target.error);
          resolve(null);
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
  if (sessionStorage.getItem('is_app_syncing') === 'true') return;

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
  sessionStorage.setItem('is_app_syncing', 'true');
  let syncSuccess = false;
  try {
    const result = await FirestoreSync.pushAllToCloud();
    if (result.success) {
      dispatch('synced');
      syncSuccess = true;
    } else {
      console.warn('[DB] Background sync incomplete:', result.reason);
      dispatch('error');
    }
  } catch (err) {
    console.error('[DB] Background sync threw:', err);
    dispatch('error');
  } finally {
    // Always release the lock so subsequent writes can trigger sync again.
    sessionStorage.removeItem('is_app_syncing');
    if (syncSuccess) {
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    }
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
    if (sessionStorage.getItem('is_app_syncing') !== 'true') {
      if (storeName !== 'users') {
        data._updatedAt = new Date().toISOString();
      }
    }
    return dbOperation(storeName, 'readwrite', (store) => store.add(data))
      .then(async (result) => {
        // Skip cloud sync if a sync operation is already in flight (prevents recursive loops)
        if (sessionStorage.getItem('is_app_syncing') === 'true') {
          return result;
        }

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
    if (sessionStorage.getItem('is_app_syncing') !== 'true') {
      if (storeName !== 'users') {
        data._updatedAt = new Date().toISOString();
      }
    }
    return dbOperation(storeName, 'readwrite', (store) => store.put(data))
      .then(async (result) => {
        // Skip cloud sync if a sync operation is already in flight (prevents recursive loops)
        if (sessionStorage.getItem('is_app_syncing') === 'true') {
          return result;
        }

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
        // Skip cloud sync if a sync operation is already in flight (prevents recursive loops)
        if (sessionStorage.getItem('is_app_syncing') === 'true') {
          return result;
        }

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

export const DegreeRequirements = {
  bscTotal: 90,
  honoursTotal: 120,
  activeCoreTarget: 80
};

export const getDegreeConfig = async () => {
  try {
    const config = await Database.get('settings', 'degreeRequirements');
    if (config && config.value) {
      DegreeRequirements.bscTotal = Number(config.value.bscTotal) || 90;
      DegreeRequirements.honoursTotal = Number(config.value.honoursTotal) || 120;
      DegreeRequirements.activeCoreTarget = Number(config.value.activeCoreTarget) || 80;
    } else {
      // Initialize settings if missing in IndexedDB
      await Database.put('settings', { key: 'degreeRequirements', value: { ...DegreeRequirements } });
    }
  } catch (err) {
    console.error('Failed to get degree requirements config:', err);
  }
  return DegreeRequirements;
};
