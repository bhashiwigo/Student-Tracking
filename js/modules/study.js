/**
 * Rajarata Campus Life Manager - Study Planner Modules
 * Handles Daily/Weekly schedule entries, Focus sessions, and Pomodoro timer logic
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const StudyModule = {
  pomodoroTimer: null,
  timeLeft: 25 * 60, // Default 25 minutes
  isTimerRunning: false,
  timerType: 'focus', // focus, shortBreak, longBreak

  init() {
    this.bindEvents();
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
          const id = chk.getAttribute('data-id');
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
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Delete study plan entry?')) {
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
    document.getElementById('study-plan-start').value = '19:00'; // Sri Lankan standard night study slot
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

  /**
   * Pomodoro Timer Logic
   */
  togglePomodoro() {
    const startBtn = document.getElementById('pomo-start');
    if (this.isTimerRunning) {
      // Pause
      clearInterval(this.pomodoroTimer);
      this.isTimerRunning = false;
      if (startBtn) startBtn.innerText = 'Start Session';
    } else {
      // Start
      this.isTimerRunning = true;
      if (startBtn) startBtn.innerText = 'Pause Session';
      this.pomodoroTimer = setInterval(() => this.tickTimer(), 1000);
    }
  },

  resetPomodoro() {
    clearInterval(this.pomodoroTimer);
    this.isTimerRunning = false;
    this.timeLeft = this.timerType === 'focus' ? 25 * 60 : 5 * 60;
    
    const startBtn = document.getElementById('pomo-start');
    if (startBtn) startBtn.innerText = 'Start Session';
    
    this.updatePomoDisplay();
  },

  startBreak() {
    clearInterval(this.pomodoroTimer);
    this.isTimerRunning = false;
    this.timerType = this.timerType === 'focus' ? 'break' : 'focus';
    this.timeLeft = this.timerType === 'focus' ? 25 * 60 : 5 * 60;

    const startBtn = document.getElementById('pomo-start');
    if (startBtn) startBtn.innerText = 'Start Session';

    const typeLabel = document.getElementById('pomo-type-label');
    if (typeLabel) {
      typeLabel.innerText = this.timerType === 'focus' ? 'Focus Interval' : 'Short Rest Break';
    }

    const breakBtn = document.getElementById('pomo-break');
    if (breakBtn) {
      breakBtn.innerText = this.timerType === 'focus' ? 'Take Break' : 'Focus Mode';
    }

    this.updatePomoDisplay();
  },

  tickTimer() {
    if (this.timeLeft > 0) {
      this.timeLeft--;
      this.updatePomoDisplay();
    } else {
      // Interval finished
      clearInterval(this.pomodoroTimer);
      this.isTimerRunning = false;
      
      const alarmTitle = this.timerType === 'focus' ? 'Focus Interval Complete!' : 'Break Over!';
      const alarmMsg = this.timerType === 'focus' ? 'Well done, take a rest.' : 'Ready to resume focus?';
      
      NotificationService.show(alarmTitle, alarmMsg, 'study');
      
      // Auto toggle state
      this.startBreak();
    }
  },

  updatePomoDisplay() {
    const mins = Math.floor(this.timeLeft / 60);
    const secs = this.timeLeft % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    // Update standard dashboard element
    const widgetDisplay = document.getElementById('pomo-time-display');
    if (widgetDisplay) widgetDisplay.innerText = timeStr;

    // Update full-screen Focus Mode element if visible
    const focusTimerDisplay = document.getElementById('focus-overlay-timer');
    if (focusTimerDisplay) focusTimerDisplay.innerText = timeStr;

    // Update document title for background tracking
    document.title = `(${timeStr}) Rajarata Life`;
  },

  /**
   * Fullscreen HUD Focus Mode
   */
  enterFullscreenFocus() {
    const overlay = document.getElementById('focus-hud-overlay');
    if (overlay) {
      overlay.classList.add('active');
      this.updatePomoDisplay();
      
      // Auto run timer if it wasn't running
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
  }
};
