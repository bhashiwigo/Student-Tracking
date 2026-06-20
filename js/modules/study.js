/**
 * Rajarata Campus Life Manager - Study Planner Modules
 * Handles Daily/Weekly schedule entries, Focus sessions, and Pomodoro timer logic
 * UPGRADED: Window blur detection, distraction logs, and Focus Quality Index metrics
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const StudyModule = {
  pomodoroTimer: null,
  timeLeft: 25 * 60, // Default 25 minutes
  isTimerRunning: false,
  timerType: 'focus', // focus, break

  interruptionDuration: 0,
  blurStartTime: null,
  blurCount: 0,
  sessionTotalSeconds: 25 * 60,

  init() {
    this.bindEvents();
    this.resetFocusStats(25 * 60);
    this.populatePomoSubjectsDropdown();

    window.addEventListener('subjectsUpdated', () => this.populatePomoSubjectsDropdown());

    // Focus Quality Interruption hooks
    window.addEventListener('blur', () => this.handleWindowBlur());
    window.addEventListener('focus', () => this.handleWindowFocus());
  },

  resetFocusStats(totalSeconds = 25 * 60) {
    this.interruptionDuration = 0;
    this.blurStartTime = null;
    this.blurCount = 0;
    this.sessionTotalSeconds = totalSeconds;
    this.updateQualityDisplay();
  },

  handleWindowBlur() {
    if (this.isTimerRunning && this.timerType === 'focus') {
      this.blurStartTime = Date.now();
      this.blurCount++;
      NotificationService.show('Focus Interruption Detected', '⚠️ Stay focused on your studies! Avoid leaving the workspace tab.', 'warning');
    }
  },

  handleWindowFocus() {
    if (this.isTimerRunning && this.timerType === 'focus' && this.blurStartTime) {
      const elapsed = (Date.now() - this.blurStartTime) / 1000;
      this.interruptionDuration += elapsed;
      this.blurStartTime = null;
      this.updateQualityDisplay();
    }
  },

  updateQualityDisplay() {
    let quality = 100;
    if (this.timerType === 'focus') {
      const elapsed = this.sessionTotalSeconds - this.timeLeft;
      if (elapsed > 0) {
        let currentBlur = 0;
        if (this.blurStartTime) {
          currentBlur = (Date.now() - this.blurStartTime) / 1000;
        }
        const totalInterrupt = this.interruptionDuration + currentBlur;
        quality = Math.max(0, Math.round(((elapsed - totalInterrupt) / elapsed) * 100));
      }
    }

    const color = quality >= 85 ? 'var(--success)' : quality >= 60 ? 'var(--warning)' : 'var(--danger)';
    
    const inlineVal = document.getElementById('pomo-quality-val');
    if (inlineVal) {
      inlineVal.innerText = `${quality}%`;
      inlineVal.style.color = color;
    }

    const overlayVal = document.getElementById('focus-overlay-quality-val');
    if (overlayVal) {
      overlayVal.innerText = `${quality}%`;
      overlayVal.style.color = color;
    }
  },

  bindEvents() {
    const form = document.getElementById('study-plan-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSavePlan(e));
    }

    const addBtn = document.getElementById('btn-add-study');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }

    // Pomodoro Timer Controls
    const startBtn = document.getElementById('pomo-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.togglePomodoro());
    }

    const resetBtn = document.getElementById('pomo-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetPomodoro());
    }

    const breakBtn = document.getElementById('pomo-break');
    if (breakBtn) {
      breakBtn.addEventListener('click', () => this.startBreak());
    }

    // Focus Mode Overlays
    const enterFocusBtn = document.getElementById('btn-enter-focus');
    if (enterFocusBtn) {
      enterFocusBtn.addEventListener('click', () => this.enterFullscreenFocus());
    }

    const exitFocusBtn = document.getElementById('btn-exit-focus');
    if (exitFocusBtn) {
      exitFocusBtn.addEventListener('click', () => this.exitFullscreenFocus());
    }
  },

  async render() {
    const container = document.getElementById('study-plans-list-container');
    if (!container) return;

    try {
      const plans = await Database.getAll('studyplans');
      if (plans.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-size:0.85rem;">
            No study planner events logged. Plan a study session below.
          </div>
        `;
        return;
      }

      // Sort: incomplete first, then by date
      const sorted = plans.sort((a, b) => {
        if (a.completed && !b.completed) return 1;
        if (!a.completed && b.completed) return -1;
        return new Date(a.date) - new Date(b.date);
      });

      container.innerHTML = sorted.map(pl => `
        <div class="task-item col-12 ${pl.completed ? 'completed' : ''}" style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <input type="checkbox" class="deadline-checkbox toggle-plan-status" data-id="${pl.id}" ${pl.completed ? 'checked' : ''} style="margin:0;">
            <div>
              <h4 class="task-label" style="font-weight:600; font-size:0.95rem;">${pl.title}</h4>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                Date: ${pl.date} @ ${pl.startHour} • Duration: ${pl.duration} hrs • Focus target: ${pl.focusDuration || 0} mins
              </div>
            </div>
          </div>
          <div style="display:flex; gap:4px;">
            <button class="btn-icon delete-plan-btn" data-id="${pl.id}" style="width:28px; height:28px; font-size:0.8rem; color:var(--danger);">✕</button>
          </div>
        </div>
      `).join('');

      // Bind status toggle
      container.querySelectorAll('.toggle-plan-status').forEach(chk => {
        chk.addEventListener('change', async (e) => {
          const id = String(chk.getAttribute('data-id'));
          const isChecked = e.target.checked;
          try {
            const pl = await Database.get('studyplans', id);
            if (pl) {
              pl.completed = isChecked;
              await Database.put('studyplans', pl);
              NotificationService.show('Study Plan Completed', `Great job! Session completed.`, 'success');
              this.render();
            }
          } catch (err) {
            console.error('Toggle study plan failed:', err);
          }
        });
      });

      // Bind delete
      container.querySelectorAll('.delete-plan-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete study plan entry?')) {
            this.handleDeletePlan(id);
          }
        });
      });

    } catch (err) {
      console.error('Study plans render failed:', err);
    }
  },

  async openModal() {
    const modal = document.getElementById('study-plan-modal');
    const form = document.getElementById('study-plan-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('study-plan-date').value = new Date().toISOString().slice(0, 10);
    document.getElementById('study-plan-start').value = '19:00';
    document.getElementById('study-plan-duration').value = '2';
    document.getElementById('study-plan-focus').value = '45';

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('study-plan-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSavePlan(e) {
    e.preventDefault();
    const id = 'pl-' + Date.now();
    const title = document.getElementById('study-plan-title').value.trim();
    const date = document.getElementById('study-plan-date').value;
    const startHour = document.getElementById('study-plan-start').value;
    const duration = parseFloat(document.getElementById('study-plan-duration').value) || 1;
    const focusDuration = parseInt(document.getElementById('study-plan-focus').value) || 25;

    if (!title || !date) {
      alert('Required fields missing.');
      return;
    }

    const planData = { id, title, date, startHour, duration, focusDuration, completed: false };

    try {
      await Database.add('studyplans', planData);
      NotificationService.show('Study Session Planned', `Logged session: ${title}`, 'study');
      
      this.closeModal();
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
    } catch (err) {
      console.error('Save study plan failed:', err);
    }
  },

  async handleDeletePlan(id) {
    try {
      await Database.delete('studyplans', id);
      NotificationService.show('Study Plan Removed', 'Plan removed.', 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
    } catch (err) {
      console.error('Delete study plan failed:', err);
    }
  },

  togglePomodoro() {
    const startBtn = document.getElementById('pomo-start');
    if (this.isTimerRunning) {
      // Pause
      clearInterval(this.pomodoroTimer);
      this.isTimerRunning = false;
      if (this.blurStartTime) {
        const elapsed = (Date.now() - this.blurStartTime) / 1000;
        this.interruptionDuration += elapsed;
        this.blurStartTime = null;
      }
      if (startBtn) startBtn.innerText = 'Start Session';
    } else {
      // Start
      this.isTimerRunning = true;
      if (startBtn) startBtn.innerText = 'Pause Session';
      this.pomodoroTimer = setInterval(() => this.tickTimer(), 1000);
    }
    this.updateQualityDisplay();
  },

  resetPomodoro() {
    clearInterval(this.pomodoroTimer);
    this.isTimerRunning = false;
    this.timeLeft = this.timerType === 'focus' ? 25 * 60 : 5 * 60;
    this.resetFocusStats(this.timeLeft);
    
    const startBtn = document.getElementById('pomo-start');
    if (startBtn) startBtn.innerText = 'Start Session';
    
    const typeLabel = document.getElementById('pomo-type-label');
    if (typeLabel) {
      typeLabel.innerText = this.timerType === 'focus' ? 'Focus Interval' : 'Short Rest Break';
    }

    const typeLabelMain = document.getElementById('pomo-type-label-main');
    if (typeLabelMain) {
      typeLabelMain.innerText = this.timerType === 'focus' ? 'Pomodoro Timer (Focus)' : 'Pomodoro Timer (Break)';
    }

    this.updatePomoDisplay();
  },

  startBreak() {
    clearInterval(this.pomodoroTimer);
    this.isTimerRunning = false;
    this.timerType = this.timerType === 'focus' ? 'break' : 'focus';
    this.timeLeft = this.timerType === 'focus' ? 25 * 60 : 5 * 60;
    this.resetFocusStats(this.timeLeft);

    const startBtn = document.getElementById('pomo-start');
    if (startBtn) startBtn.innerText = 'Start Session';

    const typeLabel = document.getElementById('pomo-type-label');
    if (typeLabel) {
      typeLabel.innerText = this.timerType === 'focus' ? 'Focus Interval' : 'Short Rest Break';
    }

    const typeLabelMain = document.getElementById('pomo-type-label-main');
    if (typeLabelMain) {
      typeLabelMain.innerText = this.timerType === 'focus' ? 'Pomodoro Timer (Focus)' : 'Pomodoro Timer (Break)';
    }

    const breakBtn = document.getElementById('pomo-break');
    if (breakBtn) {
      breakBtn.innerText = this.timerType === 'focus' ? 'Take Break' : 'Focus Mode';
    }

    this.updatePomoDisplay();
  },

  async tickTimer() {
    if (this.timeLeft > 0) {
      this.timeLeft--;
      this.updatePomoDisplay();
      this.updateQualityDisplay();
    } else {
      clearInterval(this.pomodoroTimer);
      this.isTimerRunning = false;
      
      const alarmTitle = this.timerType === 'focus' ? 'Focus Interval Complete!' : 'Break Over!';
      const alarmMsg = this.timerType === 'focus' ? 'Well done, take a rest.' : 'Ready to resume focus?';
      
      NotificationService.show(alarmTitle, alarmMsg, 'study');
      
      if (this.timerType === 'focus') {
        await this.saveFocusMinutes();
      }
      this.startBreak();
    }
  },

  updatePomoDisplay() {
    const mins = Math.floor(this.timeLeft / 60);
    const secs = this.timeLeft % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const widgetDisplay = document.getElementById('pomo-time-display');
    if (widgetDisplay) widgetDisplay.innerText = timeStr;

    const focusTimerDisplay = document.getElementById('focus-overlay-timer');
    if (focusTimerDisplay) focusTimerDisplay.innerText = timeStr;

    document.title = `(${timeStr}) Rajarata Life`;
  },

  enterFullscreenFocus() {
    const overlay = document.getElementById('focus-hud-overlay');
    if (overlay) {
      overlay.classList.add('active');
      this.updatePomoDisplay();
      this.updateQualityDisplay();
      
      if (!this.isTimerRunning) {
        this.togglePomodoro();
      }
    }
  },

  exitFullscreenFocus() {
    const overlay = document.getElementById('focus-hud-overlay');
    if (overlay) {
      overlay.classList.remove('active');
    }
  },

  async populatePomoSubjectsDropdown() {
    const select = document.getElementById('pomo-subject-select');
    if (!select) return;
    try {
      const submodules = await Database.getAll('subjects');
      const subs = submodules.filter(s => s.isSubmodule);
      const prevVal = select.value;
      
      select.innerHTML = subs.map(s => `
        <option value="${s.id}">${s.parentSubjectCode} - ${s.name}</option>
      `).join('') || '<option value="">No sub-modules added</option>';

      if (prevVal && subs.some(s => s.id === prevVal)) {
        select.value = prevVal;
      }
    } catch (err) {
      console.error('Failed to populate Pomodoro subjects dropdown:', err);
    }
  },

  async saveFocusMinutes() {
    const select = document.getElementById('pomo-subject-select');
    if (!select) return;
    const subId = select.value;
    if (!subId) return;

    try {
      const sub = await Database.get('subjects', subId);
      if (sub) {
        const completedMinutes = Math.round(this.sessionTotalSeconds / 60);
        sub.studyMinutes = (sub.studyMinutes || 0) + completedMinutes;
        await Database.put('subjects', sub);
        window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      }
    } catch (err) {
      console.error('Failed to save focus minutes:', err);
    }
  }
};
