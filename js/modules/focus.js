/**
 * Rajarata Campus Life Manager - Pomodoro Focus Engine
 * Precise offline-first Pomodoro Timer (25m/5m configuration)
 * Dual-chime audio synthesizer via Web Audio API.
 * Streaks tracker & reflection notes saver.
 */

import { Database, getSubjectDisplayName } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';
import { Auth } from '../auth.js';

export const FocusModule = {
  pomodoroTimer: null,
  timeLeft: 25 * 60, // Default 25 minutes (1500 seconds)
  isTimerRunning: false,
  timerType: 'focus', // 'focus' or 'break'
  currentStreak: 0,

  init() {
    this.bindEvents();
    this.updateStreakCount();
    this.populateSubmoduleDropdown();

    window.addEventListener('subjectsUpdated', () => {
      this.populateSubmoduleDropdown();
    });
    window.addEventListener('data-registry-update', () => {
      this.populateSubmoduleDropdown();
      this.renderHistoryList();
    });
  },

  bindEvents() {
    const startBtn = document.getElementById('focus-start-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggleTimer());
    }

    const resetBtn = document.getElementById('focus-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetTimer());
    }

    const fsBtn = document.getElementById('focus-fs-btn');
    if (fsBtn) {
      fsBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    const refForm = document.getElementById('focus-reflection-form');
    if (refForm) {
      refForm.addEventListener('submit', (e) => this.handleSaveReflection(e));
    }

    const closeRefBtn = document.getElementById('focus-reflection-close');
    if (closeRefBtn) {
      closeRefBtn.addEventListener('click', () => {
        const modal = document.getElementById('focus-reflection-modal');
        if (modal) modal.classList.remove('visible');
      });
    }
  },

  async render() {
    this.updateStreakCount();
    this.populateSubmoduleDropdown();
    this.renderHistoryList();
    this.updateDisplay();
  },

  async updateStreakCount() {
    const userId = Auth.getCurrentUserId();
    if (!userId) return;

    try {
      const sessions = await Database.getAll('focus_sessions');
      const userSessions = sessions.filter(s => s.userId === userId);

      // Sort sessions descending by date
      userSessions.sort((a, b) => new Date(b.date) - new Date(a.date));

      let streak = 0;
      if (userSessions.length > 0) {
        // Calculate consecutive days
        let tempStreak = 0;
        let lastDate = null;

        // Filter unique dates to find daily streaks
        const uniqueDates = [];
        const dateSet = new Set();
        userSessions.forEach(s => {
          const dStr = s.date.slice(0, 10);
          if (!dateSet.has(dStr)) {
            dateSet.add(dStr);
            uniqueDates.push(new Date(dStr));
          }
        });

        if (uniqueDates.length > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          let checkDate = new Date(uniqueDates[0]);
          const diff = Math.abs(today - checkDate);
          const diffDays = diff / (1000 * 60 * 60 * 24);

          // If the last session is today or yesterday, streak is active
          if (diffDays <= 1) {
            tempStreak = 1;
            for (let i = 1; i < uniqueDates.length; i++) {
              const prev = new Date(uniqueDates[i - 1]);
              const curr = new Date(uniqueDates[i]);
              const dayDiff = (prev - curr) / (1000 * 60 * 60 * 24);
              if (dayDiff <= 1.1) { // roughly 1 day difference
                tempStreak++;
              } else {
                break;
              }
            }
          }
        }
        streak = tempStreak;
      }

      this.currentStreak = streak;
      const streakValEl = document.getElementById('focus-streak-val');
      if (streakValEl) {
        streakValEl.innerText = `${streak}`;
      }
    } catch (err) {
      console.error('Failed to calculate focus streak:', err);
    }
  },

  async populateSubmoduleDropdown() {
    const select = document.getElementById('focus-submodule-select');
    if (!select) return;

    try {
      // Database.getAll('subjects') returns flattened submodules (from academic.js override)
      const submodules = await Database.getAll('subjects');
      const filtered = submodules.filter(s => s.isSubmodule);
      const prevVal = select.value;

      select.innerHTML = filtered.map(s => {
        const parentName = getSubjectDisplayName(s.parentSubjectCode || 'CORE');
        const submoduleName = getSubjectDisplayName(s.code);
        return `
          <option value="${s.id}" style="font-family: var(--font-family-app) !important;">${parentName} — ${submoduleName} (${s.type || 'theory'})</option>
        `;
      }).join('') || '<option value="" style="font-family: var(--font-family-app) !important;">No submodules registered</option>';

      if (prevVal && filtered.some(s => s.id === prevVal)) {
        select.value = prevVal;
      }
    } catch (err) {
      console.error('Failed to load focus submodules dropdown:', err);
    }
  },

  toggleTimer() {
    const startBtn = document.getElementById('focus-start-btn');
    if (this.isTimerRunning) {
      clearInterval(this.pomodoroTimer);
      this.isTimerRunning = false;
      if (startBtn) startBtn.innerText = 'Start Focus';
      NotificationService.show('Timer Paused', 'Your Pomodoro session has been paused.', 'info');
    } else {
      this.isTimerRunning = true;
      if (startBtn) startBtn.innerText = 'Pause Focus';
      this.pomodoroTimer = setInterval(() => this.tick(), 1000);
      NotificationService.show('Timer Started', this.timerType === 'focus' ? 'Deep study session activated.' : 'Take a short break.', 'success');
    }
  },

  resetTimer() {
    clearInterval(this.pomodoroTimer);
    this.isTimerRunning = false;
    this.timeLeft = this.timerType === 'focus' ? 25 * 60 : 5 * 60;

    const startBtn = document.getElementById('focus-start-btn');
    if (startBtn) startBtn.innerText = 'Start Focus';

    this.updateDisplay();
  },

  tick() {
    if (this.timeLeft > 0) {
      this.timeLeft--;
      this.updateDisplay();
    } else {
      clearInterval(this.pomodoroTimer);
      this.isTimerRunning = false;

      this.playChime();

      if (this.timerType === 'focus') {
        this.openReflectionModal();
      } else {
        // Break over, reset to focus
        this.timerType = 'focus';
        this.timeLeft = 25 * 60;
        const typeLabel = document.getElementById('focus-timer-type-label');
        if (typeLabel) typeLabel.innerText = 'FOCUSING SESSION';
        NotificationService.show('Break Completed', 'Ready to begin focusing again?', 'success');
        this.resetTimer();
      }
    }
  },

  updateDisplay() {
    const mins = Math.floor(this.timeLeft / 60);
    const secs = this.timeLeft % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    const display = document.getElementById('focus-timer-time');
    if (display) display.innerText = timeStr;

    // Sync browser tab title
    document.title = `(${timeStr}) Focus Engine`;
  },

  playChime() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Dual chime chine wave synthesis
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
      osc1.start(audioCtx.currentTime);
      osc1.stop(audioCtx.currentTime + 0.6);

      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // E5
      gain2.gain.setValueAtTime(0.15, audioCtx.currentTime + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.75);
      osc2.start(audioCtx.currentTime + 0.15);
      osc2.stop(audioCtx.currentTime + 0.75);
    } catch (err) {
      console.warn('Ambient chime audio failed:', err);
    }
  },

  openReflectionModal() {
    const modal = document.getElementById('focus-reflection-modal');
    const form = document.getElementById('focus-reflection-form');
    if (modal && form) {
      form.reset();
      modal.classList.add('visible');
    }
  },

  async handleSaveReflection(e) {
    e.preventDefault();
    const subSelect = document.getElementById('focus-submodule-select');
    const noteInput = document.getElementById('focus-reflection-notes');
    if (!subSelect || !noteInput) return;

    const subModuleId = subSelect.value;
    const notes = noteInput.value.trim();
    const duration = 25; // 25 minutes logged
    const date = new Date().toISOString();
    const userId = Auth.getCurrentUserId() || '';

    // Calculate streak
    await this.updateStreakCount();
    const newStreak = this.currentStreak + 1;

    const sessionData = {
      id: 'fs-' + Date.now(),
      subModuleId,
      duration,
      date,
      notes,
      streak: newStreak,
      userId
    };

    try {
      // 1. Commit to focus_sessions
      await Database.add('focus_sessions', sessionData);

      // 2. Increment sub-module self-study minutes
      if (subModuleId) {
        const sub = await Database.get('subjects', subModuleId);
        if (sub) {
          sub.studyMinutes = (sub.studyMinutes || 0) + duration;
          await Database.put('subjects', sub);
        }
      }

      // Hide modal
      const modal = document.getElementById('focus-reflection-modal');
      if (modal) modal.classList.remove('visible');

      NotificationService.show('Session Saved', 'Great job! Focus session details logged.', 'success');

      // Switch to break mode
      this.timerType = 'break';
      this.timeLeft = 5 * 60;
      const typeLabel = document.getElementById('focus-timer-type-label');
      if (typeLabel) typeLabel.innerText = 'SMART BREAK';

      this.resetTimer();
      this.render();

      // Trigger redraw of analytics / contribution grids
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      window.dispatchEvent(new CustomEvent('focusSessionsUpdated'));

    } catch (err) {
      console.error('Failed to save focus session:', err);
    }
  },

  toggleFullscreen() {
    const focusView = document.getElementById('view-focus');
    if (!focusView) return;

    const isFs = focusView.classList.toggle('fullscreen-mode');
    const fsBtn = document.getElementById('focus-fs-btn');
    if (fsBtn) {
      fsBtn.innerText = isFs ? 'Exit Fullscreen' : 'Fullscreen Focus';
    }
  },

  async renderHistoryList() {
    const historyContainer = document.getElementById('focus-history-list');
    if (!historyContainer) return;

    const userId = Auth.getCurrentUserId();
    if (!userId) return;

    try {
      const sessions = await Database.getAll('focus_sessions');
      const submodules = await Database.getAll('subjects');
      const userSessions = sessions.filter(s => s.userId === userId);

      userSessions.sort((a, b) => new Date(b.date) - new Date(a.date));

      if (userSessions.length === 0) {
        historyContainer.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 20px;">
            No sessions completed yet. Start your first Pomodoro session!
          </div>
        `;
        return;
      }

      historyContainer.innerHTML = userSessions.slice(0, 10).map(s => {
        const sub = submodules.find(sub => sub.id === s.subModuleId);
        const parentName = sub ? getSubjectDisplayName(sub.parentSubjectCode || 'CORE') : 'CORE';
        const submoduleName = sub ? getSubjectDisplayName(sub.code) : '';
        const subName = sub ? `${parentName} — ${submoduleName}` : 'General study';
        const formattedDate = new Date(s.date).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        return `
          <div class="task-item" style="padding: 10px; border-bottom: 1px solid var(--border-color); font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; color: var(--text-primary); font-family: var(--font-family-app) !important;">
              <span style="font-family: var(--font-family-app) !important;">${subName}</span>
              <span style="font-family: var(--font-family-app) !important; color: var(--accent);">${s.duration} mins</span>
            </div>
            <div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 2px; font-family: var(--font-family-app) !important;">
              ${formattedDate} • Streak: ${s.streak} 
            </div>
            ${s.notes ? `<div style="font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin-top: 4px; font-family: var(--font-family-app) !important;">Notes: "${s.notes}"</div>` : ''}
          </div>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to render focus history:', err);
    }
  }
};
