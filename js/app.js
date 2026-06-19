/**
 * Rajarata Campus Life Manager - Main Application Orchestrator
 * Coordinates Navigation, Search Palette, Auth Gate, Calendar, and Module bootstrap
 */

import { Database, checkAndRestoreFromCloud, triggerBackgroundSync } from './database/db.js';
import { Auth } from './auth.js';
import { UserDatabase } from './database/userdb.js';
import { BackupService } from './services/backup.js';
import { NotificationService } from './services/notifications.js';

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

const App = {
  currentView: 'dashboard',
  currentDate: new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Colombo' })),
  _initialized: false, // Guard against double-bootstrap on re-init after login

  async init() {
    this.registerServiceWorker();
    this.setupSyncIndicatorListener();

    // ── Live DOM Reactivity — re-render dashboard charts and rings whenever
    //    any IndexedDB write completes (dispatched by Database.add/put/delete).
    //    Debounced to 80 ms so rapid sequential writes (e.g. during registration)
    //    collapse into a single render pass instead of firing 4-5 times.
    let _dashDebounceTimer = null;
    window.addEventListener('subjectsUpdated', () => {
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
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('Initial cloud sync check failed:', err);
    }

    // ── App Bootstrap ─────────────────────────────────────────────────────────
    await this.setupProfileOnboarding();
    await this.setupTheme();
    await this.setupTypography();
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

          const authOverlay = document.getElementById('auth-overlay');
          if (authOverlay) authOverlay.classList.remove('active');

          // Re-run init with session now set
          this._initialized = false;
          await this.init();
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

          const authOverlay = document.getElementById('auth-overlay');
          if (authOverlay) authOverlay.classList.remove('active');

          this._initialized = false;
          await this.init();
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

        try {
          const profile = await Database.get('students', 'profile') || { id: 'profile' };
          profile.name = name;
          profile.university = university;
          profile.faculty = faculty;
          profile.admissionYear = year;
          profile.currentSemester = sem;
          await Database.put('students', profile);

          await Database.put('settings', { key: 'currentSemester', value: sem });
          await Database.put('settings', { key: 'gpaTarget', value: target });

          NotificationService.show('Settings Saved', 'Profile configuration updated successfully.', 'success');

          const userBadge = document.getElementById('user-profile-badge');
          if (userBadge) userBadge.innerText = name;
          const facultyEl = document.getElementById('user-profile-faculty');
          if (facultyEl) facultyEl.innerText = faculty;
          const universityEl = document.getElementById('user-profile-university');
          if (universityEl) universityEl.innerText = university;

          // Update top-bar semester chip live
          this.updateSemesterChip(sem);

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

        if (await window.showCustomConfirm('Import Backup', 'Import backup data? This clears and replaces all current logbooks.', true)) {
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
          requestAnimationFrame(() => AnalyticsModule.render());
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
          requestAnimationFrame(() => AnalyticsModule.render());
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
    else if (this.currentView === 'academic') { AcademicModule.render(); }
    else if (this.currentView === 'exams') { ExamsModule.render(); }
    else if (this.currentView === 'practicals') { PracticalsModule.render(); }
    else if (this.currentView === 'assignments') { AssignmentsModule.render(); }
    else if (this.currentView === 'gpa') { GPAModule.render(); }
    else if (this.currentView === 'attendance') { AttendanceModule.render(); }
    else if (this.currentView === 'sports') { SportsModule.render(); }
    else if (this.currentView === 'study') { StudyModule.render(); }
    else if (this.currentView === 'notes') { NotesModule.render(); }
    else if (this.currentView === 'research') { ResearchModule.render(); }
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
      subjects, attendance, exams, assignments, practicals
    ] = await Promise.all([
      Database.getAll('subjects'),
      Database.getAll('attendance'),
      Database.getAll('exams'),
      Database.getAll('assignments'),
      Database.getAll('practicals'),
    ]);

    const gpaStats = await GPAModule.calculateGPAs(subjects);
    document.getElementById('dash-metric-gpa').innerText = gpaStats.overall.toFixed(2);
    document.getElementById('dash-metric-sem-gpa').innerText = gpaStats.currentSemester.toFixed(2);

    let totalAttended = 0;
    let totalSessions = 0;
    attendance.forEach(a => {
      totalAttended += (a.lecturesAttended || 0) + (a.practicalsAttended || 0);
      totalSessions += (a.lecturesTotal || 0) + (a.practicalsTotal || 0);
    });
    const attPct = totalSessions > 0 ? (totalAttended / totalSessions) * 100 : 0;
    document.getElementById('dash-metric-att').innerText = `${attPct.toFixed(0)}%`;

    const pendingEx = exams.length;
    const pendingPrac = practicals.length;
    const pendingAssign = assignments.filter(a => a.status !== 'Completed').length;

    document.getElementById('dash-pending-exams').innerText = pendingEx;
    document.getElementById('dash-pending-pracs').innerText = pendingPrac;
    document.getElementById('dash-pending-assigns').innerText = pendingAssign;

    const scheduleBox = document.getElementById('dash-weekly-schedule-list');
    if (scheduleBox) {
      const allUpcoming = [];
      exams.forEach(x => allUpcoming.push({ title: `📝 ${x.name} (${x.type})`, date: x.date }));
      practicals.forEach(p => allUpcoming.push({ title: `🔬 ${p.name} (Lab: ${p.labName})`, date: p.date }));
      assignments.forEach(a => {
        if (a.status !== 'Completed') {
          allUpcoming.push({ title: `📬 Assignment: ${a.title}`, date: a.date });
        }
      });

      allUpcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
      const nextItems = allUpcoming.slice(0, 4);

      scheduleBox.innerHTML = nextItems.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; border-bottom:1px solid var(--border-color); padding: 8px 0;">
          <span>${item.title}</span>
          <span style="color:var(--text-muted); font-size:0.75rem;">${new Date(item.date + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'Asia/Colombo' })}</span>
        </div>
      `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem;">No academic events scheduled.</div>';
    }

    // Call AnalyticsModule.render() to ensure all dashboard charts, balance bars, and progress trackers are updated
    await AnalyticsModule.render();
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
      exams.forEach(x => { if (x.date === dateStr) list.push({ text: `📝 ${x.name}`, color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.15)' }); });
      practicals.forEach(p => { if (p.date === dateStr) list.push({ text: `🔬 ${p.name}`, color: 'var(--accent)', bg: 'var(--accent-glow)' }); });
      assignments.forEach(a => { if (a.date === dateStr) list.push({ text: `📬 ${a.title}`, color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.15)' }); });
      sports.forEach(s => { if (s.scheduleDate === dateStr) list.push({ text: `🏆 ${s.goalText}`, color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.15)' }); });
      studyplans.forEach(pl => { if (pl.date === dateStr) list.push({ text: `📚 ${pl.title}`, color: 'var(--accent)', bg: 'var(--accent-glow)' }); });
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
        pill.innerText = evt.text;
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
