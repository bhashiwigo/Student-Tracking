/**
 * Rajarata Campus Life Manager - Main Application Orchestrator
 * Coordinates Navigation, Search Palette, Auth Gate, Calendar, and Module bootstrap
 */

import { Database, checkAndRestoreFromCloud, triggerBackgroundSync } from './database/db.js';
import { Auth } from './auth.js';
import { UserDatabase } from './database/userdb.js';
import { BackupService } from './services/backup.js';
import { NotificationService } from './services/notifications.js';
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { AcademicModule } from './modules/academic.js';
import { ExamsModule } from './modules/exams.js';
import { PracticalsModule } from './modules/practicals.js';
import { AssignmentsModule } from './modules/assignments.js';
import { GPAModule } from './modules/gpa.js';
import { AttendanceModule } from './modules/attendance.js';
import { SportsModule } from './modules/sports.js';
import { StudyModule } from './modules/study.js';
import { NotesModule } from './modules/notes.js';
import { AnalyticsModule } from './modules/analytics.js';
import { ResearchModule } from './modules/research.js';
import { ResourcesModule } from './modules/resources.js';

window.getCurrentThemeColors = function() {
  const theme = document.body.getAttribute('data-studio-theme') || 'space-gravity';
  const colors = {
    'space-gravity': { accent: '#00e5ff', secondary: '#00e676', glow: 'rgba(0, 229, 255, 0.2)' },
    'emerald-aurora': { accent: '#45dfb1', secondary: '#80ed99', glow: 'rgba(69, 223, 177, 0.22)' },
    'sunset-amethyst': { accent: '#e3b6b1', secondary: '#522c5d', glow: 'rgba(227, 182, 177, 0.22)' },
    'deep-indigo': { accent: '#00b4d8', secondary: '#90e0ef', glow: 'rgba(0, 180, 216, 0.22)' },
    'steel-slate': { accent: '#aab7b7', secondary: '#d4d8dd', glow: 'rgba(170, 183, 183, 0.25)' },
    'crimson-obsidian': { accent: '#d00018', secondary: '#ff5252', glow: 'rgba(208, 0, 24, 0.28)' }
  };
  return colors[theme] || colors['space-gravity'];
};

try {
  const firebaseApp = getApps().length === 0 ? initializeApp({
    apiKey: "AIzaSyB_nhE7dhy1gYPJxRuScPZ9khXnPT5te_E",
    authDomain: "student-tracking-app-f4570.firebaseapp.com",
    projectId: "student-tracking-app-f4570",
    storageBucket: "student-tracking-app-f4570.firebasestorage.app",
    messagingSenderId: "878719441575",
    appId: "1:878719441575:web:c37c72c27423e250909982"
  }) : getApp();
  if (!window.__firestore) {
    window.__firestore = getFirestore(firebaseApp);
  }
  console.log('[Firebase] Cloud sync layer attached successfully.');
} catch (e) {
  console.warn('[Firebase] Fallback activated — running in offline-only mode.', e.message);
}

window.showCustomConfirm = function(title, message, isDestructive = false) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-custom-confirm');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const actionBtn = document.getElementById('btn-custom-confirm-action');
    const cancelBtn = document.getElementById('btn-custom-confirm-cancel');
    const closeBtn = modal ? modal.querySelector('.modal-close-btn') : null;

    if (!modal || !titleEl || !messageEl || !actionBtn) {
      console.warn('Custom confirm elements missing, falling back to native confirm.');
      resolve(confirm(message));
      return;
    }

    // Populate inputs
    titleEl.innerText = title;
    messageEl.innerText = message;

    // Apply color styling dynamically based on isDestructive
    if (isDestructive) {
      actionBtn.style.setProperty('background', 'var(--danger)', 'important');
      actionBtn.style.setProperty('border-color', 'var(--danger)', 'important');
      actionBtn.style.setProperty('color', '#ffffff', 'important');
      actionBtn.style.setProperty('box-shadow', '0 0 10px rgba(239, 68, 68, 0.4)', 'important');
    } else {
      actionBtn.style.setProperty('background', 'var(--accent)', 'important');
      actionBtn.style.setProperty('border-color', 'var(--accent)', 'important');
      actionBtn.style.setProperty('color', '#000000', 'important');
      actionBtn.style.setProperty('box-shadow', '0 0 10px rgba(0, 229, 255, 0.3)', 'important');
    }

    // Open modal
    modal.classList.add('visible');

    const cleanup = (value) => {
      actionBtn.removeEventListener('click', onConfirm);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      if (closeBtn) closeBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlayClick);
      modal.classList.remove('visible');
      resolve(value);
    };

    function onConfirm() {
      cleanup(true);
    }

    function onCancel() {
      cleanup(false);
    }

    function onOverlayClick(e) {
      if (e.target === modal) {
        cleanup(false);
      }
    }

    actionBtn.addEventListener('click', onConfirm);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    if (closeBtn) closeBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlayClick);
  });
};

window.authenticateDestructiveAction = function(promptMessage) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-secure-delete-gate');
    const msgEl = document.getElementById('secure-delete-prompt-message');
    const pinInput = document.getElementById('secure-delete-pin-input');
    const errorEl = document.getElementById('secure-delete-error-message');
    const purgeBtn = document.getElementById('btn-auth-secure-purge');
    const cancelBtn = document.getElementById('btn-secure-delete-cancel');
    const closeBtn = modal ? modal.querySelector('.modal-close-btn') : null;

    if (!modal || !msgEl || !pinInput || !errorEl || !purgeBtn) {
      console.warn('Security PIN gate elements missing, falling back to showCustomConfirm.');
      resolve(window.showCustomConfirm('Verify Action', promptMessage, true));
      return;
    }

    // Reset fields
    msgEl.innerText = promptMessage;
    pinInput.value = '';
    pinInput.style.borderColor = 'var(--border-color)';
    pinInput.style.boxShadow = 'none';
    errorEl.innerText = '';

    // Show modal
    modal.classList.add('visible');
    setTimeout(() => pinInput.focus(), 200);

    const cleanup = (value) => {
      purgeBtn.removeEventListener('click', onVerify);
      pinInput.removeEventListener('keydown', onKeyDown);
      if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
      if (closeBtn) closeBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onOverlayClick);
      modal.classList.remove('visible');
      resolve(value);
    };

    async function onVerify() {
      const pin = pinInput.value;
      if (!pin || pin.length !== 4) {
        showError('Please enter a 4-digit PIN.');
        return;
      }

      try {
        const userId = Auth.getCurrentUserId();
        if (!userId) {
          showError('No active user session found.');
          return;
        }

        const user = await Database.get('users', userId);
        if (!user) {
          showError('User profile not found in database.');
          return;
        }

        if (Auth.verifyPin(pin, user.pinHash)) {
          cleanup(true);
        } else {
          showError('Authentication Failure: Invalid Sign-In PIN');
        }
      } catch (err) {
        console.error('Security verification failed:', err);
        showError('System Error: Try again.');
      }
    }

    function onCancel() {
      cleanup(false);
    }

    function onOverlayClick(e) {
      if (e.target === modal) {
        cleanup(false);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Enter') {
        onVerify();
      }
    }

    function showError(msg) {
      errorEl.innerText = msg;
      pinInput.style.borderColor = 'var(--danger)';
      pinInput.style.boxShadow = '0 0 8px rgba(239, 68, 68, 0.3)';
      
      // Trigger shake animation
      pinInput.classList.remove('shake');
      void pinInput.offsetWidth; // Force repaint
      pinInput.classList.add('shake');
    }

    purgeBtn.addEventListener('click', onVerify);
    pinInput.addEventListener('keydown', onKeyDown);
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    if (closeBtn) closeBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onOverlayClick);
  });
};

const App = {
  currentView: 'dashboard',
  currentDate: new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })),
  _initialized: false, // Guard against double-bootstrap on re-init after login

  async init() {
    // Set up theme and typography immediately to avoid white flash/background mismatch on load
    try {
      await this.setupTheme();
      await this.setupTypography();
    } catch (e) {
      console.warn('Initial theme setup warning:', e);
    }

    this.registerServiceWorker();
    this.setupSyncIndicatorListener();

    // ── Live DOM Reactivity — re-render dashboard charts and rings whenever
    //    any IndexedDB write completes (dispatched by Database.add/put/delete).
    //    Debounced to 80 ms so rapid sequential writes (e.g. during registration)
    //    collapse into a single render pass instead of firing 4-5 times.
    let _dashDebounceTimer = null;
    window.addEventListener('subjectsUpdated', () => {
      if (sessionStorage.getItem('is_app_syncing') === 'true') return;
      clearTimeout(_dashDebounceTimer);
      _dashDebounceTimer = setTimeout(() => {
        if (App.currentView === 'dashboard') {
          App.renderDashboard();
        }
      }, 80);
    });

    // ── Auth Gate ─────────────────────────────────────────────────────────────
    // Must be logged in before any app content is accessible
    if (!Auth.isLoggedIn()) {
      this.showAuthGate();
      return;
    }

    // Prevent double-bootstrapping when init() is called again after login
    if (this._initialized) return;
    this._initialized = true;

    // ── Cloud Restore ─────────────────────────────────────────────────────────
    try {
      const restored = await checkAndRestoreFromCloud();
      if (restored) {
        if (!localStorage.getItem('app_cloud_restore_executed')) {
          localStorage.setItem('app_cloud_restore_executed', 'true');
          window.location.reload();
          return;
        }
      } else {
        localStorage.removeItem('app_cloud_restore_executed');
      }
    } catch (err) {
      console.error('Initial cloud sync check failed:', err);
    }

    // ── App Bootstrap ─────────────────────────────────────────────────────────
    await this.setupProfileOnboarding();
    await this.setupThemeStudio();

    // Bootstrap modules
    AcademicModule.init();
    ExamsModule.init();
    PracticalsModule.init();
    AssignmentsModule.init();
    await GPAModule.init();
    AttendanceModule.init();
    SportsModule.init();
    StudyModule.init();
    NotesModule.init();
    AnalyticsModule.init();
    ResearchModule.init();
    ResourcesModule.init();

    // Trigger initial rendering pass instantly upon bootstrapping
    await this.renderDashboard();

    // If user has no active subject components in store, guarantee that all balance arrays and progress trackers default smoothly to 0%
    const subjects = await Database.getAll('subjects');
    if (subjects.length === 0) {
      document.querySelectorAll('.balance-bar-fill').forEach(el => {
        el.style.width = '0%';
      });
      document.querySelectorAll('.balance-header span:last-child').forEach(el => {
        el.innerText = '0%';
      });
      document.querySelectorAll('.lab-bar-fill').forEach(el => {
        el.style.width = '0%';
      });
      document.querySelectorAll('.lab-header span:last-child').forEach(el => {
        el.innerText = '0%';
      });
    }

    this.bindEvents();
    this.renderActiveView();
  },

  // ────────────────────────────────────────────────────────────────────────────
  // AUTH GATE METHODS
  // ────────────────────────────────────────────────────────────────────────────

  showAuthGate() {
    // Hide the legacy onboarding overlay if still present
    const legacyOnboarding = document.getElementById('onboarding-overlay');
    if (legacyOnboarding) legacyOnboarding.style.display = 'none';

    const authOverlay = document.getElementById('auth-overlay');
    if (authOverlay) authOverlay.classList.add('active');
    this.bindAuthEvents();
  },

  bindAuthEvents() {
    // ── Sign In handler ───────────────────────────────────────────────────────
    const signinBtn = document.getElementById('btn-auth-signin');
    if (signinBtn) {
      signinBtn.addEventListener('click', async () => {
        const identifier = (document.getElementById('auth-signin-identifier')?.value || '').trim();
        const pin = (document.getElementById('auth-signin-pin')?.value || '').trim();
        const rememberMe = document.getElementById('auth-remember-me')?.checked ?? true;

        if (!identifier || pin.length !== 4) {
          NotificationService.show('Sign In Failed', 'Enter your name or Reg. No. and a 4-digit PIN.', 'error');
          return;
        }

        try {
          const allUsers = await Database.getAll('users');
          let user = allUsers.find(u =>
            u.name.toLowerCase() === identifier.toLowerCase() ||
            (u.studentId || '').toLowerCase() === identifier.toLowerCase()
          );

          let fromCloud = false;

          // If user is not found locally, query remote Firestore collection 'users'
          if (!user) {
            const db = window.__firestore;
            const fns = window.__firebaseSDK;
            if (db && fns) {
              const { collection, query, where, getDocs } = fns;
              
              const lower = identifier.toLowerCase();
              const upper = identifier.toUpperCase();
              const title = identifier.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
              const searchValues = Array.from(new Set([identifier, lower, upper, title]));
              
              const queries = [];
              for (const val of searchValues) {
                queries.push(getDocs(query(collection(db, 'users'), where('name', '==', val))));
                queries.push(getDocs(query(collection(db, 'users'), where('studentId', '==', val))));
              }
              
              const snapshots = await Promise.all(queries);
              for (const snap of snapshots) {
                if (!snap.empty) {
                  user = snap.docs[0].data();
                  fromCloud = true;
                  break;
                }
              }
            }
          }

          if (!user || !Auth.verifyPin(pin, user.pinHash)) {
            NotificationService.show('Sign In Failed', 'Incorrect name/Reg. No. or PIN.', 'error');
            return;
          }

          if (fromCloud) {
            // Write user back into local IndexedDB 'users' and 'students' stores
            await Database.put('users', user);
            await Database.put('students', {
              id: 'profile',
              userId: user.userId,
              name: user.name,
              university: user.university || 'Rajarata University of Sri Lanka',
              faculty: user.faculty || 'Faculty of Applied Sciences',
              degree: user.course || '',
              admissionYear: user.admissionYear || '2024',
              currentSemester: user.currentSemester || '1-1'
            });

            // Set session
            Auth.setSession(user.userId, rememberMe);

            // Instantly invoke checkAndRestoreFromCloud()
            NotificationService.show('Restoring Profile', 'Restoring your cloud data...', 'info');
            try {
              const restored = await checkAndRestoreFromCloud();
              if (restored) {
                window.location.reload();
                return;
              }
            } catch (restoreErr) {
              console.error('Cloud restore failed during login recovery:', restoreErr);
            }
          } else {
            Auth.setSession(user.userId, rememberMe);
          }

          // Re-run init with session now set
          this._initialized = false;
          await this.init();

          const authOverlay = document.getElementById('auth-overlay');
          if (authOverlay) authOverlay.classList.remove('active');
        } catch (err) {
          console.error('Sign in error:', err);
          NotificationService.show('Sign In Error', err.message, 'error');
        }
      });

      const handleEnterKey = (e) => {
        if (e.key === 'Enter') {
          signinBtn.click();
        }
      };
      document.getElementById('auth-signin-identifier')?.addEventListener('keydown', handleEnterKey);
      document.getElementById('auth-signin-pin')?.addEventListener('keydown', handleEnterKey);
    }

    // ── Register handler ──────────────────────────────────────────────────────
    const registerBtn = document.getElementById('btn-auth-register');
    if (registerBtn) {
      registerBtn.addEventListener('click', async () => {
        const name = (document.getElementById('auth-reg-name')?.value || '').trim();
        const studentId = (document.getElementById('auth-reg-studentid')?.value || '').trim();
        const dob = document.getElementById('auth-reg-dob')?.value || '';
        const university = (document.getElementById('auth-reg-university')?.value || '').trim();
        const faculty = (document.getElementById('auth-reg-faculty')?.value || '').trim();
        const courseSelect = document.getElementById('auth-reg-course')?.value || '';
        const courseOther = (document.getElementById('auth-reg-course-other')?.value || '').trim();
        const course = courseSelect === 'Other' ? courseOther : courseSelect;
        const specialization = (document.getElementById('auth-reg-specialization')?.value || '').trim();
        const admissionYear = document.getElementById('auth-reg-admyear')?.value || '2024';
        const semester = document.getElementById('auth-reg-semester')?.value || '1-1';
        const pin = (document.getElementById('auth-reg-pin')?.value || '').trim();
        const pinConfirm = (document.getElementById('auth-reg-pin-confirm')?.value || '').trim();

        if (!name || !studentId || !course || pin.length !== 4) {
          NotificationService.show('Validation Error', 'Fill all required fields and set a 4-digit PIN.', 'error');
          return;
        }
        if (pin !== pinConfirm) {
          NotificationService.show('PIN Mismatch', 'PINs do not match. Please try again.', 'error');
          return;
        }

        try {
          // Check if student ID already exists
          const allUsers = await Database.getAll('users');
          if (allUsers.find(u => (u.studentId || '').toLowerCase() === studentId.toLowerCase())) {
            NotificationService.show('Already Registered', 'This Reg. No. already has an account. Sign in instead.', 'error');
            return;
          }

          const userId = Auth.generateUserId();
          const newUser = {
            userId, name, studentId, dob, university, faculty, course,
            specialization, admissionYear, currentSemester: semester,
            pinHash: Auth.hashPin(pin),
            createdAt: new Date().toISOString()
          };

          await Database.add('users', newUser);

          // Create legacy student profile for backward compatibility
          await Database.put('students', {
            id: 'profile',
            userId,
            name, university, faculty,
            degree: course,
            admissionYear,
            currentSemester: semester
          });

          // Save default settings
          await Database.put('settings', { key: 'currentSemester', value: semester });
          await Database.put('settings', { key: 'gpaTarget', value: 3.70 });
          await Database.put('settings', { key: 'themeMode', value: 'dark' });

          Auth.setSession(userId, true);
          NotificationService.show('Account Created!', `Welcome to Campus Life, ${name}!`, 'success');

          this._initialized = false;
          await this.init();

          const authOverlay = document.getElementById('auth-overlay');
          if (authOverlay) authOverlay.classList.remove('active');
        } catch (err) {
          console.error('Registration error:', err);
          NotificationService.show('Registration Failed', err.message, 'error');
        }
      });
    }

    // ── Panel switch links ────────────────────────────────────────────────────
    document.querySelector('[data-switch-to="register"]')
      ?.addEventListener('click', (e) => { e.preventDefault(); this.switchAuthPanel('register'); });
    document.querySelector('[data-switch-to="signin"]')
      ?.addEventListener('click', (e) => { e.preventDefault(); this.switchAuthPanel('signin'); });

    // ── "Other" course input toggle ───────────────────────────────────────────
    document.getElementById('auth-reg-course')
      ?.addEventListener('change', (e) => {
        const otherGroup = document.getElementById('auth-reg-course-other-group');
        if (otherGroup) otherGroup.style.display = e.target.value === 'Other' ? 'block' : 'none';
      });

    // ── Multi-step form navigation ────────────────────────────────────────────
    document.getElementById('btn-reg-next-1')
      ?.addEventListener('click', () => this.switchRegStep(2));
    document.getElementById('btn-reg-next-2')
      ?.addEventListener('click', () => this.switchRegStep(3));
    document.getElementById('btn-reg-back-2')
      ?.addEventListener('click', () => this.switchRegStep(1));
    document.getElementById('btn-reg-back-3')
      ?.addEventListener('click', () => this.switchRegStep(2));
  },

  switchAuthPanel(panel) {
    const signin = document.getElementById('auth-panel-signin');
    const register = document.getElementById('auth-panel-register');
    if (signin) signin.style.display = panel === 'signin' ? 'flex' : 'none';
    if (register) register.style.display = panel === 'register' ? 'flex' : 'none';
  },

  switchRegStep(step) {
    [1, 2, 3].forEach(n => {
      const el = document.getElementById(`auth-reg-step-${n}`);
      if (el) el.style.display = n === step ? 'flex' : 'none';
    });
    // Update step indicator dots
    document.querySelectorAll('.auth-step-dot').forEach(dot => {
      const s = parseInt(dot.getAttribute('data-step'));
      dot.classList.toggle('active', s === step);
      dot.classList.toggle('done', s < step);
    });
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SERVICE WORKER
  // ────────────────────────────────────────────────────────────────────────────

  registerServiceWorker() {
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(key => {
          // BUG FIX: Must match the CACHE_NAME in service-worker.js (was v10, now v11)
          if (key !== 'campus-life-cache-v11') {
            caches.delete(key);
          }
        });
      });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.update();
        }
      });
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js?v=9')
          .then(reg => {
            console.log('SW: Registered successfully', reg.scope);
            reg.onupdatefound = () => {
              const installingWorker = reg.installing;
              if (installingWorker) {
                installingWorker.onstatechange = () => {
                  if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    window.location.reload();
                  }
                };
              }
            };
          })
          .catch(err => console.error('SW: Registration failed', err));
      });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SYNC INDICATOR
  // ────────────────────────────────────────────────────────────────────────────

  setupSyncIndicatorListener() {
    let debounceTimer = null;
    window.addEventListener('syncStatusChanged', (e) => {
      const status = e.detail;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const indicator = document.getElementById('cloud-sync-indicator');
        if (!indicator) return;

        const text = indicator.querySelector('.sync-text');

        // Reset classes
        indicator.className = 'sync-indicator';

        if (status === 'syncing') {
          indicator.classList.add('state-syncing');
          if (text) text.innerText = 'Syncing...';
        } else if (status === 'synced') {
          indicator.classList.add('state-synced');
          if (text) text.innerText = 'Cloud Synced';
        } else if (status === 'error') {
          indicator.classList.add('state-error');
          if (text) text.innerText = 'Sync Error';
        } else {
          indicator.classList.add('state-offline');
          if (text) text.innerText = 'Offline Mode';
        }
      }, 300);
    });

    // Initial trigger
    triggerBackgroundSync();

    // Wire network online/offline listeners to auto-trigger synchronization on connection state changes
    window.addEventListener('online', () => {
      triggerBackgroundSync();
    });
    window.addEventListener('offline', () => {
      window.dispatchEvent(new CustomEvent('syncStatusChanged', { detail: 'offline' }));
    });
  },

  // ────────────────────────────────────────────────────────────────────────────
  // PROFILE — Populate sidebar after login (B8)
  // ────────────────────────────────────────────────────────────────────────────

  async setupProfileOnboarding() {
    // Auth is already validated before init() reaches here — just populate UI
    const userId = Auth.getCurrentUserId();

    try {
      const allUsers = await Database.getAll('users');
      const user = allUsers.find(u => u.userId === userId);

      if (user) {
        const userBadge = document.getElementById('user-profile-badge');
        if (userBadge) userBadge.innerText = user.name;

        const studentIdEl = document.getElementById('user-profile-studentid');
        if (studentIdEl) studentIdEl.innerText = user.studentId || '';

        const courseEl = document.getElementById('user-profile-course');
        if (courseEl) courseEl.innerText = user.course || 'B.Sc. Biological Science';

        const facultyEl = document.getElementById('user-profile-faculty');
        if (facultyEl) facultyEl.innerText = user.faculty || 'Faculty of Applied Sciences';

        const universityEl = document.getElementById('user-profile-university');
        if (universityEl) universityEl.innerText = user.university || 'Rajarata University';

        // Persist semester + GPA target to settings for module access
        await Database.put('settings', { key: 'currentSemester', value: user.currentSemester });
        await Database.put('settings', { key: 'gpaTarget', value: 3.70 });
        localStorage.setItem('rusl_active_semester', user.currentSemester || '1-1');
        this.updateSemesterChip(user.currentSemester);
      } else {
        // Fallback: check legacy students store
        const student = await Database.get('students', 'profile');
        if (student) {
          const userBadge = document.getElementById('user-profile-badge');
          if (userBadge) userBadge.innerText = student.name || 'Student';
          const facultyEl = document.getElementById('user-profile-faculty');
          if (facultyEl) facultyEl.innerText = student.faculty || 'Faculty of Applied Sciences';
          const universityEl = document.getElementById('user-profile-university');
          if (universityEl) universityEl.innerText = student.university || 'Rajarata University';

          localStorage.setItem('rusl_active_semester', student.currentSemester || '1-1');
          this.updateSemesterChip(student.currentSemester);
        }
      }
    } catch (err) {
      console.error('setupProfileOnboarding failed:', err);
    }

    // Bind Sign Out button in sidebar footer
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (await window.showCustomConfirm('Sign Out', 'Sign out? Your data is saved locally and will sync when you return.', false)) {
          localStorage.removeItem('app_cloud_restore_executed');
          Auth.clearSession();
          window.location.reload();
        }
      });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SEMESTER CHIP — update the top-bar pill with a human-readable label
  // ────────────────────────────────────────────────────────────────────────────

  updateSemesterChip(semCode) {
    const chipLabel = document.getElementById('semester-chip-label');
    if (!chipLabel) return;
    if (!semCode) { chipLabel.innerText = 'Sem —'; return; }

    // Convert e.g. '1-2'  →  'Year 1 · Sem 2'
    const MAP = {
      '1-1': 'Year 1 · Sem 1', '1-2': 'Year 1 · Sem 2',
      '2-1': 'Year 2 · Sem 1', '2-2': 'Year 2 · Sem 2',
      '3-1': 'Year 3 · Sem 1', '3-2': 'Year 3 · Sem 2',
      '4-1': 'Year 4 · Sem 1', '4-2': 'Year 4 · Sem 2',
    };
    chipLabel.innerText = MAP[semCode] || `Sem ${semCode}`;
  },

  // ────────────────────────────────────────────────────────────────────────────
  // THEME SETUP
  // ────────────────────────────────────────────────────────────────────────────

  async setupTheme() {
    let themeSetting = await Database.get('settings', 'themeMode');
    if (!themeSetting) {
      themeSetting = { key: 'themeMode', value: 'dark' };
      await Database.put('settings', themeSetting);
    }
    document.body.setAttribute('data-theme', themeSetting.value);
  },

  async setupTypography() {
    let sizeSetting = await Database.get('settings', 'fontSize');
    let familySetting = await Database.get('settings', 'fontFamily');

    if (!sizeSetting) {
      sizeSetting = { key: 'fontSize', value: 'medium' };
      await Database.put('settings', sizeSetting);
    }
    if (!familySetting) {
      familySetting = { key: 'fontFamily', value: 'Inter' };
      await Database.put('settings', familySetting);
    }

    this.applyTypography(familySetting.value, sizeSetting.value);
  },

  applyTypography(family, size) {
    const root = document.documentElement;

    const fontMap = {
      'Inter': "'Inter', sans-serif",
      'Poppins': "'Poppins', sans-serif",
      'Roboto': "'Roboto', sans-serif",
      'Open Sans': "'Open Sans', sans-serif",
      'Nunito': "'Nunito', sans-serif",
      'Montserrat': "'Montserrat', sans-serif"
    };

    const fontFamilyValue = fontMap[family] || fontMap['Inter'];
    root.style.setProperty('--font-family-app', fontFamilyValue);

    const sizeMap = {
      'small': '14px',
      'medium': '16px',
      'large': '18px',
      'xlarge': '20px'
    };

    const fontSizeValue = sizeMap[size] || sizeMap['medium'];
    root.style.setProperty('--font-size-base', fontSizeValue);

    const fontSelect = document.getElementById('settings-font-family');
    const sizeSelect = document.getElementById('settings-font-size');
    if (fontSelect) fontSelect.value = family;
    if (sizeSelect) sizeSelect.value = size;
  },

  async setupThemeStudio() {
    let activeTheme = await Database.get('settings', 'studioTheme');
    let glow = await Database.get('settings', 'studioGlow');
    let hover = await Database.get('settings', 'studioHover');
    let reflections = await Database.get('settings', 'studioReflections');
    let accentLighting = await Database.get('settings', 'studioAccentLighting');

    if (!activeTheme) activeTheme = { key: 'studioTheme', value: 'space-gravity' };
    if (!glow) glow = { key: 'studioGlow', value: true };
    if (!hover) hover = { key: 'studioHover', value: true };
    if (!reflections) reflections = { key: 'studioReflections', value: true };
    if (!accentLighting) accentLighting = { key: 'studioAccentLighting', value: true };

    this.applyThemeStudio(
      activeTheme.value,
      glow.value,
      hover.value,
      reflections.value,
      accentLighting.value
    );
  },

  applyThemeStudio(theme, glow, hover, reflections, accentLighting) {
    const body = document.body;

    if (theme === 'space-gravity') {
      body.removeAttribute('data-studio-theme');
    } else {
      body.setAttribute('data-studio-theme', theme);
    }

    body.classList.toggle('no-glows', !glow);
    body.classList.toggle('no-hover-animations', !hover);
    body.classList.toggle('no-reflections', !reflections);
    body.classList.toggle('no-accent-lighting', !accentLighting);

    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(swatch => {
      const match = swatch.getAttribute('data-theme-id') === theme;
      swatch.classList.toggle('active', match);
    });

    const toggleGlow = document.getElementById('toggle-glow');
    const toggleHover = document.getElementById('toggle-hover-anims');
    const toggleReflections = document.getElementById('toggle-reflections');
    const toggleAccent = document.getElementById('toggle-accent-lighting');

    if (toggleGlow) toggleGlow.checked = glow;
    if (toggleHover) toggleHover.checked = hover;
    if (toggleReflections) toggleReflections.checked = reflections;
    if (toggleAccent) toggleAccent.checked = accentLighting;

    this.updatePreviewPanel(theme, glow, hover, reflections, accentLighting);
  },

  updatePreviewPanel(theme, glow, hover, reflections, accentLighting) {
    const previewBox = document.getElementById('theme-preview-box');
    if (!previewBox) return;

    const isLight = document.body.getAttribute('data-theme') === 'light';
    const themeVars = isLight ? {
      'space-gravity': {
        '--bg-app': '#e7e7e7',
        '--bg-card': 'rgba(255, 255, 255, 0.75)',
        '--bg-input': '#ffffff',
        '--border-color': 'rgba(0, 229, 255, 0.15)',
        '--accent': '#006064',
        '--accent-glow': 'rgba(0, 96, 100, 0.08)',
        '--accent-secondary': '#c62828',
        '--accent-secondary-glow': 'rgba(198, 40, 40, 0.06)',
        '--text-primary': '#000000',
        '--text-secondary': '#222222',
        '--text-muted': '#555555',
        '--preview-btn-text': '#ffffff'
      },
      'emerald-aurora': {
        '--bg-app': '#e8f5e9',
        '--bg-card': 'rgba(255, 255, 255, 0.75)',
        '--bg-input': '#ffffff',
        '--border-color': 'rgba(46, 125, 50, 0.15)',
        '--accent': '#2e7d32',
        '--accent-glow': 'rgba(46, 125, 50, 0.08)',
        '--accent-secondary': '#1565c0',
        '--accent-secondary-glow': 'rgba(21, 101, 192, 0.06)',
        '--text-primary': '#000000',
        '--text-secondary': '#222222',
        '--text-muted': '#555555',
        '--preview-btn-text': '#ffffff'
      },
      'sunset-amethyst': {
        '--bg-app': '#f3e5f5',
        '--bg-card': 'rgba(255, 255, 255, 0.75)',
        '--bg-input': '#ffffff',
        '--border-color': 'rgba(106, 27, 154, 0.15)',
        '--accent': '#6a1b9a',
        '--accent-glow': 'rgba(106, 27, 154, 0.08)',
        '--accent-secondary': '#ad1457',
        '--accent-secondary-glow': 'rgba(173, 20, 87, 0.06)',
        '--text-primary': '#000000',
        '--text-secondary': '#222222',
        '--text-muted': '#555555',
        '--preview-btn-text': '#ffffff'
      },
      'deep-indigo': {
        '--bg-app': '#e8eaf6',
        '--bg-card': 'rgba(255, 255, 255, 0.75)',
        '--bg-input': '#ffffff',
        '--border-color': 'rgba(40, 53, 147, 0.15)',
        '--accent': '#283593',
        '--accent-glow': 'rgba(40, 53, 147, 0.08)',
        '--accent-secondary': '#00838f',
        '--accent-secondary-glow': 'rgba(0, 131, 143, 0.06)',
        '--text-primary': '#000000',
        '--text-secondary': '#222222',
        '--text-muted': '#555555',
        '--preview-btn-text': '#ffffff'
      },
      'steel-slate': {
        '--bg-app': '#eceff1',
        '--bg-card': 'rgba(255, 255, 255, 0.75)',
        '--bg-input': '#ffffff',
        '--border-color': 'rgba(55, 71, 79, 0.15)',
        '--accent': '#37474f',
        '--accent-glow': 'rgba(55, 71, 79, 0.08)',
        '--accent-secondary': '#4e342e',
        '--accent-secondary-glow': 'rgba(78, 52, 46, 0.06)',
        '--text-primary': '#000000',
        '--text-secondary': '#222222',
        '--text-muted': '#555555',
        '--preview-btn-text': '#ffffff'
      },
      'crimson-obsidian': {
        '--bg-app': '#ffebee',
        '--bg-card': 'rgba(255, 255, 255, 0.75)',
        '--bg-input': '#ffffff',
        '--border-color': 'rgba(198, 40, 40, 0.15)',
        '--accent': '#c62828',
        '--accent-glow': 'rgba(198, 40, 40, 0.08)',
        '--accent-secondary': '#37474f',
        '--accent-secondary-glow': 'rgba(55, 71, 79, 0.06)',
        '--text-primary': '#000000',
        '--text-secondary': '#222222',
        '--text-muted': '#555555',
        '--preview-btn-text': '#ffffff'
      }
    } : {
      'space-gravity': {
        '--bg-app': '#0a0f1d',
        '--bg-card': 'rgba(18, 30, 66, 0.48)',
        '--bg-input': 'rgba(12, 19, 41, 0.65)',
        '--border-color': 'rgba(0, 229, 255, 0.1)',
        '--accent': '#00e5ff',
        '--accent-glow': 'rgba(0, 229, 255, 0.16)',
        '--accent-secondary': '#ff5252',
        '--accent-secondary-glow': 'rgba(255, 82, 82, 0.16)',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#475569',
        '--preview-btn-text': '#050608'
      },
      'emerald-aurora': {
        '--bg-app': '#0e1d20',
        '--bg-card': 'rgba(20, 60, 75, 0.48)',
        '--bg-input': 'rgba(8, 25, 35, 0.65)',
        '--border-color': 'rgba(69, 223, 177, 0.12)',
        '--accent': '#45dfb1',
        '--accent-glow': 'rgba(69, 223, 177, 0.2)',
        '--accent-secondary': '#80ed99',
        '--accent-secondary-glow': 'rgba(128, 237, 153, 0.16)',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#475569',
        '--preview-btn-text': '#050608'
      },
      'sunset-amethyst': {
        '--bg-app': '#0f0714',
        '--bg-card': 'rgba(82, 44, 93, 0.42)',
        '--bg-input': 'rgba(25, 10, 40, 0.65)',
        '--border-color': 'rgba(227, 182, 177, 0.15)',
        '--accent': '#e3b6b1',
        '--accent-glow': 'rgba(227, 182, 177, 0.2)',
        '--accent-secondary': '#522c5d',
        '--accent-secondary-glow': 'rgba(82, 44, 93, 0.2)',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#475569',
        '--preview-btn-text': '#050608'
      },
      'deep-indigo': {
        '--bg-app': '#030430',
        '--bg-card': 'rgba(0, 119, 182, 0.35)',
        '--bg-input': 'rgba(2, 3, 50, 0.65)',
        '--border-color': 'rgba(0, 180, 216, 0.15)',
        '--accent': '#00b4d8',
        '--accent-glow': 'rgba(0, 180, 216, 0.2)',
        '--accent-secondary': '#90e0ef',
        '--accent-secondary-glow': 'rgba(144, 224, 239, 0.16)',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#475569',
        '--preview-btn-text': '#050608'
      },
      'steel-slate': {
        '--bg-app': '#121a24',
        '--bg-card': 'rgba(46, 65, 86, 0.45)',
        '--bg-input': 'rgba(18, 30, 45, 0.65)',
        '--border-color': 'rgba(170, 183, 183, 0.18)',
        '--accent': '#aab7b7',
        '--accent-glow': 'rgba(170, 183, 183, 0.22)',
        '--accent-secondary': '#d4d8dd',
        '--accent-secondary-glow': 'rgba(212, 216, 221, 0.16)',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#475569',
        '--preview-btn-text': '#050608'
      },
      'crimson-obsidian': {
        '--bg-app': '#080002',
        '--bg-card': 'rgba(104, 0, 12, 0.28)',
        '--bg-input': 'rgba(15, 0, 2, 0.65)',
        '--border-color': 'rgba(208, 0, 24, 0.18)',
        '--accent': '#d00018',
        '--accent-glow': 'rgba(208, 0, 24, 0.25)',
        '--accent-secondary': '#ff5252',
        '--accent-secondary-glow': 'rgba(255, 82, 82, 0.25)',
        '--text-primary': '#f8fafc',
        '--text-secondary': '#94a3b8',
        '--text-muted': '#475569',
        '--preview-btn-text': '#050608'
      }
    };

    const activeVars = themeVars[theme] || themeVars['space-gravity'];
    for (const [key, value] of Object.entries(activeVars)) {
      previewBox.style.setProperty(key, value);
    }

    previewBox.classList.toggle('no-glows', !glow);
    previewBox.classList.toggle('no-hover-animations', !hover);
    previewBox.classList.toggle('no-reflections', !reflections);
    previewBox.classList.toggle('no-accent-lighting', !accentLighting);
  },

  // ────────────────────────────────────────────────────────────────────────────
  // EVENT BINDINGS
  // ────────────────────────────────────────────────────────────────────────────

  bindEvents() {
    // Navigation routing
    const links = document.querySelectorAll('.nav-link');
    links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.getAttribute('data-target');
        this.navigateTo(target);
      });
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => this.toggleTheme());
    }

    // Modal close triggers
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-overlay').classList.remove('visible');
      });
    });



    // Command Palette shortcut
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        this.toggleCommandPalette();
      }
    });

    const searchTrigger = document.getElementById('search-trigger-btn');
    if (searchTrigger) {
      searchTrigger.addEventListener('click', () => this.toggleCommandPalette());
    }

    const paletteOverlay = document.getElementById('command-palette-overlay');
    if (paletteOverlay) {
      paletteOverlay.addEventListener('click', (e) => {
        if (e.target.id === 'command-palette-overlay') {
          paletteOverlay.classList.remove('visible');
        }
      });

      const paletteInput = document.getElementById('command-palette-input');
      if (paletteInput) {
        paletteInput.addEventListener('input', (e) => this.filterCommandPalette(e.target.value));
        paletteInput.addEventListener('keydown', (e) => this.handleCommandPaletteKey(e));
      }
    }

    // Calendar refresh listener
    window.addEventListener('calendarItemsUpdated', () => this.renderCalendar());

    // Settings Profile save
    const settingsForm = document.getElementById('settings-profile-form');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('settings-name').value.trim();
        const university = document.getElementById('settings-university').value.trim();
        const faculty = document.getElementById('settings-faculty').value.trim();
        const year = document.getElementById('settings-year').value;
        const sem = document.getElementById('settings-semester').value;
        const target = parseFloat(document.getElementById('settings-target-gpa').value) || 3.70;

        const hackathons = parseInt(document.getElementById('enrichment-hackathons').value) || 0;
        const societies = parseInt(document.getElementById('enrichment-societies').value) || 0;
        const industry = parseInt(document.getElementById('enrichment-industry').value) || 0;

        const getVal = (id) => {
          const el = document.getElementById(id);
          return el ? el.value.trim() : '';
        };

        try {
          const profile = await Database.get('students', 'profile') || { id: 'profile' };
          profile.name = name;
          profile.university = university;
          profile.faculty = faculty;
          profile.admissionYear = year;
          profile.currentSemester = sem;
          profile.enrichment = {
            hackathons,
            societies,
            industry
          };

          // Safely build the extended studentInfo structure
          profile.studentInfo = {
            studentId: getVal('settings-student-id'),
            registrationNumber: getVal('settings-reg-num'),
            degreeProgramme: getVal('settings-degree'),
            department: getVal('settings-dept'),
            batch: getVal('settings-batch'),
            academicYear: year,
            semester: sem,
            faculty: faculty,
            email: getVal('settings-email'),
            phone: getVal('settings-phone'),
            mentor: {
              name: getVal('settings-mentor-name'),
              email: getVal('settings-mentor-email'),
              contact: getVal('settings-mentor-contact')
            },
            academicAdvisor: {
              name: getVal('settings-advisor-name'),
              email: getVal('settings-advisor-email'),
              contact: getVal('settings-advisor-contact')
            }
          };

          await Database.put('students', profile);

          // Update corresponding record in the local 'users' store
          const userId = Auth.getCurrentUserId();
          if (userId) {
            const allUsers = await Database.getAll('users');
            const user = allUsers.find(u => u.userId === userId);
            if (user) {
              user.name = name;
              user.university = university;
              user.faculty = faculty;
              user.course = getVal('settings-degree');
              user.admissionYear = year;
              user.currentSemester = sem;

              user.studentId = getVal('settings-student-id');
              user.registrationNumber = getVal('settings-reg-num');
              user.degreeProgramme = getVal('settings-degree');
              user.department = getVal('settings-dept');
              user.batch = getVal('settings-batch');
              user.email = getVal('settings-email');
              user.phone = getVal('settings-phone');

              user.mentorName = getVal('settings-mentor-name');
              user.mentorEmail = getVal('settings-mentor-email');
              user.mentorContact = getVal('settings-mentor-contact');

              user.advisorName = getVal('settings-advisor-name');
              user.advisorEmail = getVal('settings-advisor-email');
              user.advisorContact = getVal('settings-advisor-contact');

              await Database.put('users', user);
            }
          }

          await Database.put('settings', { key: 'currentSemester', value: sem });
          await Database.put('settings', { key: 'gpaTarget', value: target });

          const targetedSemesterValue = document.getElementById('settings-semester').value;
          localStorage.setItem('rusl_active_semester', targetedSemesterValue);

          // Propagate the active semester to modular filters
          const subjectFilter = document.getElementById('subject-semester-filter');
          if (subjectFilter) {
            subjectFilter.value = targetedSemesterValue;
          }
          AcademicModule.activeSemester = targetedSemesterValue;

          const attendanceFilter = document.getElementById('attendance-semester-filter');
          if (attendanceFilter) {
            attendanceFilter.value = targetedSemesterValue;
          }
          AttendanceModule.activeSemester = targetedSemesterValue;

          // Trigger view update routines
          if (typeof AcademicModule.renderSubjects === 'function') {
            AcademicModule.renderSubjects();
          }
          if (window.AcademicModule && typeof window.AcademicModule.updateSpecialEligibilityHUD === 'function') {
            window.AcademicModule.updateSpecialEligibilityHUD();
          }
          if (typeof AttendanceModule.render === 'function') {
            AttendanceModule.render();
          }

          NotificationService.show('Settings Saved', 'Profile configuration updated successfully.', 'success');

          const userBadge = document.getElementById('user-profile-badge');
          if (userBadge) userBadge.innerText = name;
          const facultyEl = document.getElementById('user-profile-faculty');
          if (facultyEl) facultyEl.innerText = faculty;
          const universityEl = document.getElementById('user-profile-university');
          if (universityEl) universityEl.innerText = university;

          // Update top-bar semester chip live
          this.updateSemesterChip(targetedSemesterValue);

          window.dispatchEvent(new CustomEvent('subjectsUpdated'));
        } catch (err) {
          console.error(err);
        }
      });
    }

    // Settings page Sign Out button (B9)
    const settingsLogoutBtn = document.getElementById('btn-settings-logout');
    if (settingsLogoutBtn) {
      settingsLogoutBtn.addEventListener('click', async () => {
        if (await window.showCustomConfirm('Sign Out', 'Sign out? Your data is saved and will sync when you return.', false)) {
          localStorage.removeItem('app_cloud_restore_executed');
          Auth.clearSession();
          window.location.reload();
        }
      });
    }

    // Import/Export
    const exportBtn = document.getElementById('btn-backup-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          await BackupService.exportBackup();
          NotificationService.show('Backup Successful', 'Academic data file downloaded.', 'success');
        } catch (err) {
          alert('Export failed: ' + err.message);
        }
      });
    }

    const importInput = document.getElementById('backup-import-file');
    if (importInput) {
      importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (await window.authenticateDestructiveAction('Import backup data? This clears and replaces all current logbooks.')) {
          try {
            await BackupService.importBackup(file);
            NotificationService.show('Restore Successful', 'Database records rebuilt.', 'success');
            setTimeout(() => window.location.reload(), 1000);
          } catch (err) {
            alert('Import failed: ' + err.message);
          }
        }
      });
    }

    const fontSelect = document.getElementById('settings-font-family');
    if (fontSelect) {
      fontSelect.addEventListener('change', async (e) => {
        const family = e.target.value;
        const sizeSetting = await Database.get('settings', 'fontSize') || { key: 'fontSize', value: 'medium' };
        await Database.put('settings', { key: 'fontFamily', value: family });
        this.applyTypography(family, sizeSetting.value);
        NotificationService.show('Font Updated', `Font family set to ${family}.`, 'success');
      });
    }

    const sizeSelect = document.getElementById('settings-font-size');
    if (sizeSelect) {
      sizeSelect.addEventListener('change', async (e) => {
        const size = e.target.value;
        const familySetting = await Database.get('settings', 'fontFamily') || { key: 'fontFamily', value: 'Inter' };
        await Database.put('settings', { key: 'fontSize', value: size });
        this.applyTypography(familySetting.value, size);
        NotificationService.show('Font Size Updated', `Font size set to ${size}.`, 'success');
      });
    }

    // Theme Studio
    let selectedThemeId = 'space-gravity';
    const activeSwatch = document.querySelector('.theme-swatch.active');
    if (activeSwatch) {
      selectedThemeId = activeSwatch.getAttribute('data-theme-id');
    }

    const getActiveToggles = () => ({
      glow: (document.getElementById('toggle-glow')?.checked ?? true),
      hover: (document.getElementById('toggle-hover-anims')?.checked ?? true),
      reflections: (document.getElementById('toggle-reflections')?.checked ?? true),
      accentLighting: (document.getElementById('toggle-accent-lighting')?.checked ?? true)
    });

    const updatePreview = () => {
      const toggles = getActiveToggles();
      this.updatePreviewPanel(selectedThemeId, toggles.glow, toggles.hover, toggles.reflections, toggles.accentLighting);
    };

    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        swatches.forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        selectedThemeId = swatch.getAttribute('data-theme-id');
        updatePreview();
      });
    });

    ['toggle-glow', 'toggle-hover-anims', 'toggle-reflections', 'toggle-accent-lighting'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', updatePreview);
    });

    const applyBtn = document.getElementById('btn-apply-theme');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const toggles = getActiveToggles();
        try {
          await Database.put('settings', { key: 'studioTheme', value: selectedThemeId });
          await Database.put('settings', { key: 'studioGlow', value: toggles.glow });
          await Database.put('settings', { key: 'studioHover', value: toggles.hover });
          await Database.put('settings', { key: 'studioReflections', value: toggles.reflections });
          await Database.put('settings', { key: 'studioAccentLighting', value: toggles.accentLighting });

          this.applyThemeStudio(selectedThemeId, toggles.glow, toggles.hover, toggles.reflections, toggles.accentLighting);
          NotificationService.show('Theme Applied', 'Theme Studio settings updated.', 'success');
          // Wait one animation frame so the browser commits the new
          // data-studio-theme CSS variables before charts sample getColor().
          requestAnimationFrame(() => {
            AnalyticsModule.render();
            GPAModule.render();
            AcademicModule.render();
            AttendanceModule.render();
          });
        } catch (err) {
          console.error('Save Theme Studio settings error:', err);
        }
      });
    }

    const resetBtn = document.getElementById('btn-reset-theme');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        selectedThemeId = 'space-gravity';
        try {
          await Database.put('settings', { key: 'studioTheme', value: 'space-gravity' });
          await Database.put('settings', { key: 'studioGlow', value: true });
          await Database.put('settings', { key: 'studioHover', value: true });
          await Database.put('settings', { key: 'studioReflections', value: true });
          await Database.put('settings', { key: 'studioAccentLighting', value: true });

          this.applyThemeStudio('space-gravity', true, true, true, true);
          NotificationService.show('Theme Reset', 'Default Space Gravity theme restored.', 'info');
          // Wait one frame so CSS variable reset propagates before charts recolor.
          requestAnimationFrame(() => {
            AnalyticsModule.render();
            GPAModule.render();
            AcademicModule.render();
            AttendanceModule.render();
          });
        } catch (err) {
          console.error(err);
        }
      });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // THEME TOGGLE
  // ────────────────────────────────────────────────────────────────────────────

  async toggleTheme() {
    const themeSetting = await Database.get('settings', 'themeMode');
    const newTheme = (themeSetting?.value === 'dark') ? 'light' : 'dark';
    await Database.put('settings', { key: 'themeMode', value: newTheme });
    document.body.setAttribute('data-theme', newTheme);

    // Update aria-label for accessibility
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
      themeBtn.setAttribute('aria-label', newTheme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
    }

    const label = newTheme === 'light' ? '☀️ Light Mode' : '🌙 Dark Mode';
    NotificationService.show('Theme Changed', `Switched to ${label}`, 'info');

    // Force redraw of active views and charts with new colors
    this.renderActiveView();
    if (this.currentView === 'dashboard' || this.currentView === 'analytics') {
      requestAnimationFrame(() => {
        AnalyticsModule.render();
      });
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // NAVIGATION
  // ────────────────────────────────────────────────────────────────────────────

  navigateTo(viewId) {
    if (viewId === 'focus') {
      viewId = 'study';
    }
    this.currentView = viewId;

    // Use cached NodeList — avoids re-querying the DOM on every nav click
    if (!this._navLinks) this._navLinks = document.querySelectorAll('.nav-link');
    this._navLinks.forEach(l => {
      const match = l.getAttribute('data-target') === viewId;
      l.classList.toggle('active', match);
    });

    this.renderActiveView();
  },

  renderActiveView() {
    if (!this._pageViews) this._pageViews = document.querySelectorAll('.page-view');
    this._pageViews.forEach(v => {
      const isActive = v.id === `view-${this.currentView}`;
      v.classList.toggle('active', isActive);
    });

    if (this.currentView === 'dashboard') { this.renderDashboard(); }
    else if (this.currentView === 'academic') {
      const defaultSemester = localStorage.getItem('rusl_active_semester') || '1-1';
      const filter = document.getElementById('subject-semester-filter');
      if (filter) {
        filter.value = defaultSemester;
      }
      AcademicModule.activeSemester = defaultSemester;
      AcademicModule.renderSubjects();
    }
    else if (this.currentView === 'exams') { ExamsModule.render(); }
    else if (this.currentView === 'practicals') { PracticalsModule.render(); }
    else if (this.currentView === 'assignments') { AssignmentsModule.render(); }
    else if (this.currentView === 'gpa') { GPAModule.render(); }
    else if (this.currentView === 'attendance') {
      const defaultSemester = localStorage.getItem('rusl_active_semester') || '1-1';
      const filter = document.getElementById('attendance-semester-filter');
      if (filter) {
        filter.value = defaultSemester;
      }
      AttendanceModule.activeSemester = defaultSemester;
      AttendanceModule.render();
    }
    else if (this.currentView === 'sports') { SportsModule.render(); }
    else if (this.currentView === 'study') { StudyModule.render(); }
    else if (this.currentView === 'notes') { NotesModule.render(); }
    else if (this.currentView === 'research') { ResearchModule.render(); }
    else if (this.currentView === 'resources') { ResourcesModule.render(); }
    else if (this.currentView === 'analytics') { AnalyticsModule.render(); }
    else if (this.currentView === 'calendar') { this.renderCalendar(); }
    else if (this.currentView === 'settings') { this.renderSettings(); }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ────────────────────────────────────────────────────────────────────────────

  async renderDashboard() {
    // Fetch all stores in parallel — saves ~5 sequential round-trips
    const [
      subjects, attendance, exams, assignments, practicals, submodules
    ] = await Promise.all([
      Database.getAll('subjects'),
      Database.getAll('attendance'),
      Database.getAll('exams'),
      Database.getAll('assignments'),
      Database.getAll('practicals'),
      Database.getAll('submodules'),
    ]);

    const gpaStats = await GPAModule.calculateGPAs(subjects);
    const overallGpa = gpaStats.overall || 0.00;
    const semGpa = gpaStats.currentSemester || 0.00;

    const gpaValEl = document.getElementById('dash-metric-gpa');
    if (gpaValEl) gpaValEl.innerText = overallGpa.toFixed(2);

    const gpaSubEl = document.getElementById('dash-metric-gpa-sub');
    if (gpaSubEl) gpaSubEl.innerText = overallGpa.toFixed(2);

    const semGpaEl = document.getElementById('dash-metric-sem-gpa');
    if (semGpaEl) {
      semGpaEl.innerText = semGpa.toFixed(2);
      semGpaEl.style.display = 'inline';
    }

    let totalAttended = 0;
    let totalSessions = 0;
    attendance.forEach(a => {
      if (a.lecture && a.practical && a.fieldWork) {
        totalAttended += (a.lecture.present || 0) + (a.practical.present || 0) + (a.fieldWork.present || 0);
        totalSessions += (a.lecture.total || 0) + (a.practical.total || 0) + (a.fieldWork.total || 0);
      } else {
        totalAttended += (a.lecturesAttended || 0) + (a.practicalsAttended || 0) + (a.approvedMedicalSessions || 0);
        totalSessions += (a.lecturesTotal || 0) + (a.practicalsTotal || 0);
      }
    });
    const attPct = totalSessions > 0 ? (totalAttended / totalSessions) * 100 : 0;
    
    const attValEl = document.getElementById('dash-metric-att');
    if (attValEl) attValEl.innerText = `${attPct.toFixed(0)}%`;

    const attTextValEl = document.getElementById('dashboard-attendance-text-val');
    if (attTextValEl) attTextValEl.innerText = `${attPct.toFixed(0)}%`;

    const attSubEl = document.getElementById('dash-metric-att-sub');
    if (attSubEl) attSubEl.innerText = `${attPct.toFixed(0)}%`;

    // Apply dynamic border warning glow states on Attendance Summary Widget card
    const attCard = document.getElementById('dashboard-attendance-summary-card');
    if (attCard) {
      attCard.style.transition = 'border 0.3s ease, box-shadow 0.3s ease';
      if (attPct >= 80) {
        attCard.style.border = '1px solid var(--success, #00e676)';
        attCard.style.boxShadow = '0 0 15px rgba(0, 230, 118, 0.25)';
      } else if (attPct >= 60) {
        attCard.style.border = '1px solid var(--warning, #ffd600)';
        attCard.style.boxShadow = '0 0 15px rgba(255, 214, 0, 0.25)';
      } else {
        attCard.style.border = '1px solid var(--danger, #ff1744)';
        attCard.style.boxShadow = '0 0 15px rgba(255, 23, 68, 0.25)';
      }
    }

    // Process Academic Progress Metrics: Credits & monochromatic rail
    let completedCredits = 0;
    let remainingCredits = 0;
    subjects.forEach(sub => {
      const credits = sub.credits || 0;
      if (sub.grade) {
        completedCredits += credits;
      } else {
        remainingCredits += credits;
      }
    });
    const totalCredits = completedCredits + remainingCredits;
    const completionPct = totalCredits > 0 ? (completedCredits / totalCredits) * 100 : 0;

    const compCrEl = document.getElementById('progress-completed-credits');
    if (compCrEl) compCrEl.innerText = `${completedCredits} Cr`;

    const remCrEl = document.getElementById('progress-remaining-credits');
    if (remCrEl) remCrEl.innerText = `${remainingCredits} Cr`;

    const pctEl = document.getElementById('progress-completion-pct');
    if (pctEl) pctEl.innerText = `${completionPct.toFixed(1)}%`;

    const fillEl = document.getElementById('progress-completion-fill');
    if (fillEl) fillEl.style.width = `${completionPct}%`;

    // Hydrate the expanded progress metrics
    try {
      const semSetting = await Database.get('settings', 'currentSemester');
      const activeSemester = semSetting ? semSetting.value : '1-1';
      
      const activeSemesterSubmodules = (submodules || []).filter(sub => sub.semester === activeSemester);
      const activeModulesEl = document.getElementById('progress-active-modules');
      if (activeModulesEl) {
        activeModulesEl.innerText = `${activeSemesterSubmodules.length} Active Units`;
      }
      
      // Calculate Core vs Optional Credit Ratio
      const subjectTypeMap = {};
      (subjects || []).forEach(s => {
        if (!s.isSubmodule) {
          subjectTypeMap[s.code] = (s.courseType || s.type || 'CORE').toUpperCase();
        }
      });
      
      let coreCredits = 0;
      let optionalCredits = 0;
      (subjects || []).forEach(sub => {
        let typeStr = 'CORE';
        if (sub.isSubmodule && sub.parentSubjectCode) {
          typeStr = subjectTypeMap[sub.parentSubjectCode] || 'CORE';
        } else {
          typeStr = (sub.courseType || sub.type || 'CORE').toUpperCase();
        }
        
        const credits = sub.credits || 0;
        if (typeStr === 'OPTIONAL') {
          optionalCredits += credits;
        } else {
          coreCredits += credits;
        }
      });
      
      const ratioEl = document.getElementById('progress-core-optional-ratio');
      if (ratioEl) {
        ratioEl.innerText = `Core: ${coreCredits} Cr | Optional: ${optionalCredits} Cr`;
      }
      
      // Degree Standing Benchmark
      let standing = 'Year 1 General';
      if (completedCredits <= 30) {
        standing = 'Year 1 General';
      } else if (completedCredits <= 60) {
        standing = 'Year 2 Intermediate';
      } else if (completedCredits <= 90) {
        standing = 'Year 3 Advanced';
      } else {
        standing = 'Year 4 Honours';
      }
      
      const standingEl = document.getElementById('progress-degree-standing');
      if (standingEl) {
        standingEl.innerText = standing;
      }
    } catch (metricErr) {
      console.warn('Failed to calculate expanded progress metrics:', metricErr);
    }

    const pendingEx = exams.length;
    const pendingPrac = practicals.length;
    const pendingAssign = assignments.filter(a => a.status !== 'Completed').length;

    const penExEl = document.getElementById('dash-pending-exams');
    if (penExEl) penExEl.innerText = pendingEx;

    const penPrEl = document.getElementById('dash-pending-pracs');
    if (penPrEl) penPrEl.innerText = pendingPrac;

    const penAsEl = document.getElementById('dash-pending-assigns');
    if (penAsEl) penAsEl.innerText = pendingAssign;

    const scheduleBox = document.getElementById('dash-weekly-schedule-list');
    if (scheduleBox) {
      const allUpcoming = [];
      exams.forEach(x => allUpcoming.push({ title: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>${x.name} (${x.type})`, date: x.date }));
      practicals.forEach(p => allUpcoming.push({ title: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M6 3h12"></path><path d="M19 18v-3c0-2.23-1.47-4.11-3.5-4.72V4H8.5v6.28C6.47 10.89 5 12.77 5 15v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4z"></path></svg>${p.name} (Lab: ${p.labName})`, date: p.date }));
      assignments.forEach(a => {
        if (a.status !== 'Completed') {
          allUpcoming.push({ title: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>Assignment: ${a.title}`, date: a.date });
        }
      });

      allUpcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
      const nextItems = allUpcoming.slice(0, 4);

      scheduleBox.innerHTML = nextItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; border-bottom:1px solid var(--border-color); padding: 8px 0; font-family: var(--font-family-app) !important;">
          <span style="font-family: var(--font-family-app) !important;">${item.title}</span>
          <span style="color:var(--text-muted); font-size:0.75rem; font-family: var(--font-family-app) !important;">${new Date(item.date + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'Asia/Colombo' })}</span>
        </div>
      `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem; font-family: var(--font-family-app) !important;">No academic events scheduled.</div>';
    }

    // Render upcoming assignments widget
    const assignContainer = document.getElementById('dashboard-assignments-container');
    if (assignContainer) {
      const pendingAssignments = assignments.filter(a => a.status !== 'Completed');
      pendingAssignments.sort((a, b) => {
        const dateA = new Date(a.deadline || a.date || '9999-12-31');
        const dateB = new Date(b.deadline || b.date || '9999-12-31');
        return dateA - dateB;
      });

      const topAssignments = pendingAssignments.slice(0, 3);

      if (topAssignments.length === 0) {
        assignContainer.innerHTML = `
          <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-family-app) !important;">
            No pending coursework assignments.
          </div>
        `;
      } else {
        assignContainer.innerHTML = topAssignments.map(as => {
          const priorityClasses = {
            Low: 'low',
            Medium: 'medium',
            High: 'high'
          };
          const priorityClass = priorityClasses[as.priority] || 'low';

          const statusColors = {
            'Pending': 'background-color: var(--border-color); color: var(--text-secondary);',
            'Submitted': 'background-color: var(--accent-glow); color: var(--accent);',
            'Completed': 'background-color: rgba(16, 185, 129, 0.15); color: var(--success);'
          };
          const statusStyle = statusColors[as.status] || 'background-color: var(--border-color); color: var(--text-secondary);';

          const deadlineVal = as.deadline || as.date || 'N/A';
          const courseVal = as.courseId || as.subjectCode || 'N/A';
          const matchedSubject = subjects.find(s => s.code === courseVal);
          let displayLabel = courseVal;
          if (matchedSubject) {
            displayLabel = matchedSubject.isSubmodule 
              ? (matchedSubject.name || matchedSubject.moduleTitle || 'Unknown Sub-Module') 
              : `${matchedSubject.code} — ${matchedSubject.name}`;
          }
          if (displayLabel.startsWith('sub_') || displayLabel.startsWith('SUB_')) {
            displayLabel = 'Unknown Course';
          }

          return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255, 255, 255, 0.02); font-family: var(--font-family-app) !important;">
              <div style="font-family: var(--font-family-app) !important; min-width: 0; flex: 1;">
                <div style="font-size: 0.72rem; font-weight: 700; color: var(--accent); font-family: var(--font-family-app) !important; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${displayLabel}
                </div>
                <div style="font-size: 0.9rem; font-weight: 800; color: var(--text-primary); font-family: var(--font-family-app) !important; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  ${as.title}
                </div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-family-app) !important; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  Deadline: ${deadlineVal}
                </div>
              </div>
              <div style="text-align: right; font-family: var(--font-family-app) !important; flex-shrink: 0; margin-left: 12px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span class="badge" style="${statusStyle} font-family: var(--font-family-app) !important; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;">${as.status}</span>
                <span class="badge ${priorityClass}" style="font-family: var(--font-family-app) !important; font-size: 0.65rem; padding: 2px 6px; border-radius: 4px;">${as.priority}</span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Call AnalyticsModule.render() to ensure all dashboard charts, balance bars, and progress trackers are updated
    await AnalyticsModule.render();

    // Render upcoming exams widget on dashboard
    await this.renderDashboardExams(exams, subjects);
  },

  async renderDashboardExams(exams, subjects) {
    const container = document.getElementById('dashboard-exams-container');
    if (!container) return;

    if (!subjects) {
      try {
        subjects = await Database.getAll('subjects');
      } catch (err) {
        console.error('Fetch subjects for dashboard exams failed:', err);
        subjects = [];
      }
    }

    // Clear active dashboard countdown intervals
    if (this.dashboardCountdownIntervals) {
      this.dashboardCountdownIntervals.forEach(clearInterval);
    }
    this.dashboardCountdownIntervals = [];

    const now = Date.now();

    // Filter for future-dated exams
    const futureExams = exams.filter(ex => {
      const examTime = new Date(`${ex.date}T${ex.time || '08:30'}`).getTime();
      return !isNaN(examTime) && examTime > now;
    });

    // Sort chronologically (earliest first)
    futureExams.sort((a, b) => {
      const timeA = new Date(`${a.date}T${a.time || '08:30'}`).getTime();
      const timeB = new Date(`${b.date}T${b.time || '08:30'}`).getTime();
      return timeA - timeB;
    });

    // Take top 3 nearest upcoming exams
    const topExams = futureExams.slice(0, 3);

    if (topExams.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.8rem; font-family: var(--font-family-app) !important;">
          No upcoming examinations scheduled.
        </div>
      `;
      return;
    }

    container.innerHTML = topExams.map(ex => {
      const typeLabel = ex.examType || ex.type || 'THEORY';
      const courseLabel = ex.courseId || ex.subjectCode || 'N/A';
      const matchedSubject = subjects ? subjects.find(s => s.code === courseLabel) : null;
      let displayLabel = courseLabel;
      if (matchedSubject) {
        displayLabel = matchedSubject.isSubmodule 
          ? (matchedSubject.name || matchedSubject.moduleTitle || 'Unknown Sub-Module') 
          : `${matchedSubject.code} — ${matchedSubject.name}`;
      }
      if (displayLabel.startsWith('sub_') || displayLabel.startsWith('SUB_')) {
        displayLabel = 'Unknown Course';
      }
      const titleLabel = ex.title || ex.name || 'Untitled Exam';
      const venueLabel = ex.venue || 'N/A';
      const dateLabel = ex.date;
      const timeLabel = ex.time || 'N/A';

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid var(--border-color); border-radius: 8px; background: rgba(255, 255, 255, 0.02); font-family: var(--font-family-app) !important;">
          <div style="font-family: var(--font-family-app) !important; min-width: 0; flex: 1;">
            <div style="font-size: 0.72rem; font-weight: 700; color: var(--accent); font-family: var(--font-family-app) !important; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${typeLabel} | ${displayLabel}
            </div>
            <div style="font-size: 0.9rem; font-weight: 800; color: var(--text-primary); font-family: var(--font-family-app) !important; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${titleLabel}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-family-app) !important; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${dateLabel} @ ${timeLabel} | Venue: ${venueLabel}
            </div>
          </div>
          <div style="text-align: right; font-family: var(--font-family-app) !important; flex-shrink: 0; margin-left: 12px;">
            <div class="dash-exam-countdown" id="dash-countdown-val-${ex.id}" style="font-family: 'JetBrains Mono', monospace, var(--font-family-app) !important; font-weight: 700; font-size: 0.95rem; color: var(--warning);">
              --:--
            </div>
            <div style="font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; font-family: var(--font-family-app) !important;">Remaining</div>
          </div>
        </div>
      `;
    }).join('');

    // Launch countdown timers
    topExams.forEach(ex => {
      this.startDashboardCountdownTimer(ex.id, `${ex.date}T${ex.time || '08:30'}`);
    });
  },

  startDashboardCountdownTimer(id, targetDateStr) {
    const el = document.getElementById(`dash-countdown-val-${id}`);
    if (!el) return;

    const targetTime = new Date(targetDateStr).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = targetTime - now;

      if (diff <= 0) {
        el.innerText = 'STARTED / PASSED';
        el.style.color = 'var(--text-muted)';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      el.innerText = `${days}d ${hours}h ${mins}m`;
    };

    updateTimer();
    const interval = setInterval(updateTimer, 10000); // 10s updates are fine
    if (!this.dashboardCountdownIntervals) this.dashboardCountdownIntervals = [];
    this.dashboardCountdownIntervals.push(interval);
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SETTINGS (B9 — Account Information card)
  // ────────────────────────────────────────────────────────────────────────────

  async renderSettings() {
    const student = await Database.get('students', 'profile');
    const targetGpaSetting = await Database.get('settings', 'gpaTarget');
    const fontSizeSetting = await Database.get('settings', 'fontSize');
    const fontFamilySetting = await Database.get('settings', 'fontFamily');
    const activeTheme = await Database.get('settings', 'studioTheme');
    const glowSetting = await Database.get('settings', 'studioGlow');
    const hoverSetting = await Database.get('settings', 'studioHover');
    const reflectionsSetting = await Database.get('settings', 'studioReflections');
    const accentSetting = await Database.get('settings', 'studioAccentLighting');

    // ── Populate Account Information card (B9) ────────────────────────────────
    try {
      const userId = Auth.getCurrentUserId();
      const allUsers = await Database.getAll('users');
      const user = allUsers.find(u => u.userId === userId);

      if (user) {
        const set = (id, val) => {
          const el = document.getElementById(id);
          if (el) el.innerText = val || '—';
        };
        set('settings-display-name', user.name);
        set('settings-display-studentid', user.studentId);
        set('settings-display-course', user.course);
        set('settings-display-faculty', user.faculty);
        set('settings-display-university', user.university);
        set('settings-display-admyear', user.admissionYear);
      }
    } catch (err) {
      console.warn('Could not populate account info:', err);
    }

    // ── Profile form ──────────────────────────────────────────────────────────
    if (student) {
      document.getElementById('settings-name').value = student.name || '';
      document.getElementById('settings-year').value = student.admissionYear || '';
      document.getElementById('settings-semester').value = student.currentSemester || '1-1';
      const univEl = document.getElementById('settings-university');
      if (univEl) univEl.value = student.university || '';
      const facEl = document.getElementById('settings-faculty');
      if (facEl) facEl.value = student.faculty || '';

      // Populate new extended studentInfo fields safely from users store/info
      const info = student.studentInfo || {};
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || '';
      };
      
      const userId = Auth.getCurrentUserId();
      const allUsers = await Database.getAll('users');
      const user = allUsers.find(u => u.userId === userId) || {};

      setVal('settings-student-id', user.studentId || info.studentId || student.studentId || '');
      setVal('settings-reg-num', user.registrationNumber || info.registrationNumber || '');
      setVal('settings-degree', user.degreeProgramme || user.course || info.degreeProgramme || student.degree || '');
      setVal('settings-dept', user.department || info.department || '');
      setVal('settings-batch', user.batch || info.batch || '');
      setVal('settings-email', user.email || info.email || '');
      setVal('settings-phone', user.phone || info.phone || '');

      setVal('settings-mentor-name', user.mentorName || (info.mentor && info.mentor.name) || '');
      setVal('settings-mentor-email', user.mentorEmail || (info.mentor && info.mentor.email) || '');
      setVal('settings-mentor-contact', user.mentorContact || (info.mentor && info.mentor.contact) || '');

      setVal('settings-advisor-name', user.advisorName || (info.academicAdvisor && info.academicAdvisor.name) || '');
      setVal('settings-advisor-email', user.advisorEmail || (info.academicAdvisor && info.academicAdvisor.email) || '');
      setVal('settings-advisor-contact', user.advisorContact || (info.academicAdvisor && info.academicAdvisor.contact) || '');

      // Populate academic enrichment fields
      const enrichment = student.enrichment || {};
      setVal('enrichment-hackathons', enrichment.hackathons !== undefined ? enrichment.hackathons : 0);
      setVal('enrichment-societies', enrichment.societies !== undefined ? enrichment.societies : 0);
      setVal('enrichment-industry', enrichment.industry !== undefined ? enrichment.industry : 0);
    }
    if (targetGpaSetting) {
      document.getElementById('settings-target-gpa').value = targetGpaSetting.value;
    }

    const sizeVal = fontSizeSetting ? fontSizeSetting.value : 'medium';
    const familyVal = fontFamilySetting ? fontFamilySetting.value : 'Inter';

    const fontSelect = document.getElementById('settings-font-family');
    if (fontSelect) fontSelect.value = familyVal;
    const sizeSelect = document.getElementById('settings-font-size');
    if (sizeSelect) sizeSelect.value = sizeVal;

    this.applyTypography(familyVal, sizeVal);

    const themeVal = activeTheme ? activeTheme.value : 'space-gravity';
    const glowVal = glowSetting ? glowSetting.value : true;
    const hoverVal = hoverSetting ? hoverSetting.value : true;
    const reflectionsVal = reflectionsSetting ? reflectionsSetting.value : true;
    const accentVal = accentSetting ? accentSetting.value : true;

    const toggleGlow = document.getElementById('toggle-glow');
    const toggleHover = document.getElementById('toggle-hover-anims');
    const toggleReflections = document.getElementById('toggle-reflections');
    const toggleAccent = document.getElementById('toggle-accent-lighting');

    if (toggleGlow) toggleGlow.checked = glowVal;
    if (toggleHover) toggleHover.checked = hoverVal;
    if (toggleReflections) toggleReflections.checked = reflectionsVal;
    if (toggleAccent) toggleAccent.checked = accentVal;

    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(swatch => {
      const match = swatch.getAttribute('data-theme-id') === themeVal;
      swatch.classList.toggle('active', match);
    });

    this.updatePreviewPanel(themeVal, glowVal, hoverVal, reflectionsVal, accentVal);
  },

  // ────────────────────────────────────────────────────────────────────────────
  // CALENDAR
  // ────────────────────────────────────────────────────────────────────────────

  async renderCalendar() {
    const grid = document.getElementById('calendar-grid-container');
    const headerTitle = document.getElementById('calendar-month-year-label');
    if (!grid || !headerTitle) return;

    grid.innerHTML = '';
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    headerTitle.innerText = `${monthNames[month]} ${year}`;

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(day => {
      const headerCell = document.createElement('div');
      headerCell.className = 'calendar-day-header';
      headerCell.innerText = day;
      grid.appendChild(headerCell);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const exams = await Database.getAll('exams');
    const practicals = await Database.getAll('practicals');
    const assignments = await Database.getAll('assignments');
    const sports = await Database.getAll('sports');
    const studyplans = await Database.getAll('studyplans');

    const getEventsForDate = (dateStr) => {
      const list = [];
      exams.forEach(x => { if (x.date === dateStr) list.push({ text: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>${x.name}`, color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.15)' }); });
      practicals.forEach(p => { if (p.date === dateStr) list.push({ text: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M6 3h12"></path><path d="M19 18v-3c0-2.23-1.47-4.11-3.5-4.72V4H8.5v6.28C6.47 10.89 5 12.77 5 15v3a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4z"></path></svg>${p.name}`, color: 'var(--accent)', bg: 'var(--accent-glow)' }); });
      assignments.forEach(a => { if (a.date === dateStr) list.push({ text: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"></polyline><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"></path></svg>${a.title}`, color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.15)' }); });
      sports.forEach(s => { if (s.scheduleDate === dateStr) list.push({ text: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"></path><path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z"></path></svg>${s.goalText}`, color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.15)' }); });
      studyplans.forEach(pl => { if (pl.date === dateStr) list.push({ text: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px; display: inline-block;"><path d="m16 6 4 14"></path><path d="M12 6v14"></path><path d="M8 8v12"></path><path d="M4 4v16"></path></svg>${pl.title}`, color: 'var(--accent)', bg: 'var(--accent-glow)' }); });
      return list;
    };

    for (let i = firstDay - 1; i >= 0; i--) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell other-month';
      cell.innerHTML = `<span class="calendar-date-number">${prevMonthDays - i}</span>`;
      grid.appendChild(cell);
    }

    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell';

      const isToday = today.getDate() === d && today.getMonth() === month && today.getFullYear() === year;
      if (isToday) cell.classList.add('today');

      const dateString = `${year}-${(month + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      cell.innerHTML = `<span class="calendar-date-number">${d}</span>`;

      // Heatmap Workload Density (Exams + Labs/Practicals + Assignments)
      let density = 0;
      exams.forEach(x => { if (x.date === dateString) density++; });
      practicals.forEach(p => { if (p.date === dateString) density++; });
      assignments.forEach(a => { if (a.date === dateString) density++; });

      if (density > 0) {
        const theme = document.body.getAttribute('data-theme') || 'dark';
        let cellBg = 'transparent';
        if (theme === 'light') {
          if (density === 1) cellBg = 'rgba(0, 0, 0, 0.05)';
          else if (density === 2) cellBg = 'rgba(0, 0, 0, 0.12)';
          else if (density === 3) cellBg = 'rgba(0, 0, 0, 0.22)';
          else cellBg = 'rgba(0, 0, 0, 0.35)'; // density >= 4
        } else {
          if (density === 1) cellBg = 'rgba(255, 255, 255, 0.04)';
          else if (density === 2) cellBg = 'rgba(255, 255, 255, 0.09)';
          else if (density === 3) cellBg = 'rgba(255, 255, 255, 0.18)';
          else cellBg = 'rgba(255, 255, 255, 0.28)'; // density >= 4
        }
        cell.style.backgroundColor = cellBg;

        // Add workload indicator badge/dot
        const dot = document.createElement('span');
        dot.style.cssText = `position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: ${theme === 'light' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.4)'};`;
        cell.style.position = 'relative';
        cell.appendChild(dot);
      }

      getEventsForDate(dateString).forEach(evt => {
        const pill = document.createElement('div');
        pill.className = 'calendar-event-pill';
        pill.innerHTML = evt.text;
        pill.style.color = evt.color;
        pill.style.backgroundColor = evt.bg;
        cell.appendChild(pill);
      });

      grid.appendChild(cell);
    }

    const totalCellsUsed = firstDay + daysInMonth;
    const nextCellsNeeded = 42 - totalCellsUsed;
    for (let n = 1; n <= nextCellsNeeded; n++) {
      const cell = document.createElement('div');
      cell.className = 'calendar-cell other-month';
      cell.innerHTML = `<span class="calendar-date-number">${n}</span>`;
      grid.appendChild(cell);
    }

    // --- Month Selector Dropdown ---
    const selector = document.getElementById('calendar-month-selector');
    if (selector) {
      if (selector.options.length === 0) {
        const today = new Date();
        // Generate options: 12 months past, current, 12 months future
        for (let i = -12; i <= 12; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
          const opt = document.createElement('option');
          opt.value = `${d.getFullYear()}-${d.getMonth()}`;
          opt.innerText = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
          selector.appendChild(opt);
        }

        selector.addEventListener('change', (e) => {
          const [y, m] = e.target.value.split('-').map(Number);
          this.currentDate.setFullYear(y);
          this.currentDate.setMonth(m);
          this.renderCalendar();
        });
      }
      selector.value = `${year}-${month}`;
    }

    // --- Monthly Historical Review HUD Card ---
    try {
      const focusSessions = await Database.getAll('focus_sessions');
      const userId = Auth.getCurrentUserId();

      // Focus hours in the selected month
      const monthFocus = focusSessions.filter(s => {
        if (!s.date || s.userId !== userId) return false;
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const totalFocusMinutes = monthFocus.reduce((sum, s) => sum + (s.duration || 0), 0);
      const focusHours = (totalFocusMinutes / 60).toFixed(1);

      // Tasks in the selected month (assignments + study plans)
      const monthAssignments = assignments.filter(a => {
        if (!a.deadline || a.userId !== userId) return false;
        const d = new Date(a.deadline);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      const monthStudyPlans = studyplans.filter(p => {
        if (!p.date) return false;
        const d = new Date(p.date);
        return d.getFullYear() === year && d.getMonth() === month;
      });

      const totalTasks = monthAssignments.length + monthStudyPlans.length;
      const completedTasks = monthAssignments.filter(a => a.status === 'Completed').length + monthStudyPlans.filter(p => p.completed).length;
      const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

      // Overdue, missed, or uncompleted tasks from previous months
      const prevDateThreshold = new Date(year, month, 1);
      const overdueAssignments = assignments.filter(a => {
        if (!a.deadline || a.userId !== userId) return false;
        const d = new Date(a.deadline);
        return d < prevDateThreshold && a.status !== 'Completed';
      });
      const overdueStudyPlans = studyplans.filter(p => {
        if (!p.date) return false;
        const d = new Date(p.date);
        return d < prevDateThreshold && !p.completed;
      });

      const reviewCard = document.getElementById('calendar-monthly-review-card');
      if (reviewCard) {
        let overdueHTML = '';
        if (overdueAssignments.length === 0 && overdueStudyPlans.length === 0) {
          overdueHTML = `
            <div style="font-size: 0.78rem; color: var(--success); font-weight: 600; font-family: var(--font-family-app) !important;">
              ✓ No overdue or missed tasks from previous months.
            </div>
          `;
        } else {
          overdueHTML = `
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 120px; overflow-y: auto;">
              ${overdueAssignments.map(a => `
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #ff5252; font-family: var(--font-family-app) !important;">
                  <span style="font-family: var(--font-family-app) !important;">📬 Assignment: ${a.title} (due ${a.deadline})</span>
                  <strong>MISSED</strong>
                </div>
              `).join('')}
              ${overdueStudyPlans.map(p => `
                <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: #ff5252; font-family: var(--font-family-app) !important;">
                  <span style="font-family: var(--font-family-app) !important;">📚 Study Plan: ${p.title} (date ${p.date})</span>
                  <strong>INCOMPLETE</strong>
                </div>
              `).join('')}
            </div>
          `;
        }

        reviewCard.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 12px; width: 100%;">
            <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--accent); font-family: var(--font-family-app) !important; display: inline-flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
              <span>Monthly Historical Review HUD</span>
            </span>
            <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-family-app) !important;">Completion Rate: <span style="color: var(--accent);">${completionRate}%</span></span>
          </div>
          
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; width: 100%; margin-top: 4px;">
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 0.85rem; border-right: 1px solid rgba(255, 255, 255, 0.05); padding-right: 20px;">
              <div style="display: flex; justify-content: space-between; font-family: var(--font-family-app) !important;">
                <span style="color: var(--text-secondary); font-family: var(--font-family-app) !important;">Completed Tasks:</span>
                <strong style="font-family: var(--font-family-app) !important;">${completedTasks} / ${totalTasks}</strong>
              </div>
              <div style="display: flex; justify-content: space-between; font-family: var(--font-family-app) !important;">
                <span style="color: var(--text-secondary); font-family: var(--font-family-app) !important;">Focus Hours Logged:</span>
                <strong style="font-family: var(--font-family-app) !important;">${focusHours} hrs</strong>
              </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <div style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.5px; margin-bottom: 4px; font-family: var(--font-family-app) !important;">Overdue & Missed Items</div>
              ${overdueHTML}
            </div>
          </div>
        `;
      }
    } catch (err) {
      console.error('Failed to render Monthly Historical Review HUD:', err);
    }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // COMMAND PALETTE
  // ────────────────────────────────────────────────────────────────────────────

  toggleCommandPalette() {
    const palette = document.getElementById('command-palette-overlay');
    if (!palette) return;

    const isVisible = palette.classList.toggle('visible');
    if (isVisible) {
      const input = document.getElementById('command-palette-input');
      input.value = '';
      this.filterCommandPalette('');
      setTimeout(() => input.focus(), 50);
    }
  },

  filterCommandPalette(query) {
    const list = document.getElementById('command-palette-list-container');
    if (!list) return;

    const commands = [
      { text: 'Go to Dashboard', action: () => this.navigateTo('dashboard'), shortcut: 'G + D' },
      { text: 'Manage Course Units (Subjects)', action: () => this.navigateTo('academic'), shortcut: 'G + A' },
      { text: 'Check Exams Schedules', action: () => this.navigateTo('exams'), shortcut: 'G + E' },
      { text: 'Review Practical Classes', action: () => this.navigateTo('practicals'), shortcut: 'G + P' },
      { text: 'Track Assignment Submissions', action: () => this.navigateTo('assignments'), shortcut: 'G + T' },
      { text: 'Open GPA Calculator', action: () => this.navigateTo('gpa'), shortcut: 'G + G' },
      { text: 'Log Subject Attendance', action: () => this.navigateTo('attendance'), shortcut: 'G + L' },
      { text: 'Sports & Training Schedules', action: () => this.navigateTo('sports'), shortcut: 'G + S' },
      { text: 'Enter Study Focus Planner', action: () => this.navigateTo('study'), shortcut: 'G + F' },
      { text: 'Read Subject Notes Pages', action: () => this.navigateTo('notes'), shortcut: 'G + N' },
      { text: 'View Performance Analytics Charts', action: () => this.navigateTo('analytics'), shortcut: 'G + C' },
      { text: 'Toggle Application Theme Mode', action: () => this.toggleTheme(), shortcut: 'T + T' },
      { text: 'Unified Calendar Planner', action: () => this.navigateTo('calendar'), shortcut: 'G + Y' },
      { text: 'System Configuration Settings', action: () => this.navigateTo('settings'), shortcut: 'G + O' }
    ];

    const match = commands.filter(c => c.text.toLowerCase().includes(query.toLowerCase()));

    list.innerHTML = match.map((cmd, idx) => `
      <div class="command-palette-item ${idx === 0 ? 'selected' : ''}" data-index="${idx}">
        <span>${cmd.text}</span>
        <span class="command-palette-hint">${cmd.shortcut}</span>
      </div>
    `).join('');

    this.paletteFilteredActions = match.map(c => c.action);

    list.querySelectorAll('.command-palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'));
        const act = this.paletteFilteredActions[idx];
        if (act) {
          act();
          this.toggleCommandPalette();
        }
      });
    });
  },

  handleCommandPaletteKey(e) {
    const items = document.querySelectorAll('.command-palette-item');
    let selected = document.querySelector('.command-palette-item.selected');
    let index = selected ? parseInt(selected.getAttribute('data-index')) : 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        if (selected) selected.classList.remove('selected');
        index = (index + 1) % items.length;
        items[index].classList.add('selected');
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        if (selected) selected.classList.remove('selected');
        index = (index - 1 + items.length) % items.length;
        items[index].classList.add('selected');
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.paletteFilteredActions && this.paletteFilteredActions[index]) {
        this.paletteFilteredActions[index]();
        this.toggleCommandPalette();
      }
    } else if (e.key === 'Escape') {
      this.toggleCommandPalette();
    }
  }
};

// Start Application on Load
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
