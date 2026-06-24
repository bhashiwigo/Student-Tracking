/**
 * Rajarata Campus Life Manager - Sports Management Modules
 * Logs Match schedules, Fitness logs, and Training sessions
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const SportsModule = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const form = document.getElementById('sport-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveSport(e));
    }

    const addBtn = document.getElementById('btn-add-sport');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }
  },

  async render() {
    const trainingContainer = document.getElementById('sports-training-sessions');
    const matchesContainer = document.getElementById('sports-matches-gamedays');
    const fitnessText = document.getElementById('sports-fitness-goals');

    if (!fitnessText || !trainingContainer || !matchesContainer) return;

    try {
      const records = await Database.getAll('sports');

      // Update fitness goals summary separately if element exists
      const goals = records.filter(r => r.activityType === 'Goal');
      fitnessText.innerHTML = goals.map(g => `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding: 8px 0; font-family: var(--font-family-app) !important;">
          <span style="font-size:0.85rem; display:flex; align-items:center; gap:8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
            ${g.goalText}
          </span>
          <button class="btn-icon delete-sport-goal-btn" data-id="${g.id}" style="width:20px; height:20px; display:flex; align-items:center; justify-content:center;">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="close-svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem; padding: 12px 0;">No fitness goals set. Add a Goal below.</div>';

      // Scope delete listener to fitnessText, not document (avoids duplicate bindings)
      fitnessText.querySelectorAll('.delete-sport-goal-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete this fitness goal?')) {
            this.handleDeleteSport(id);
          }
        });
      });

      // Update training sessions list
      const trainings = records.filter(r => r.activityType === 'Training');
      trainingContainer.innerHTML = trainings.map(sp => `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px; font-family: var(--font-family-app) !important; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h4 style="font-size: 0.95rem; font-weight: 700; margin: 0; color: var(--text-primary);">${sp.goalText || 'Training Session'}</h4>
            <span style="font-family:'JetBrains Mono', monospace; font-size: 0.85rem; font-weight:700; color:var(--accent);">${sp.trainingHours || 0} hrs</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
            <span><strong>Scheduled Date:</strong> ${sp.scheduleDate}</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 6px;">
            <button class="btn-outline btn-sm edit-sport-btn" data-id="${sp.id}" style="flex: 1; padding: 4px 8px; font-size: 0.72rem;">Edit</button>
            <button class="btn-outline btn-sm delete-sport-btn" data-id="${sp.id}" style="border-color: var(--danger); color: var(--danger); padding: 4px 8px; font-size: 0.72rem;">Delete</button>
          </div>
        </div>
      `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem; padding: 12px 0;">No training sessions recorded.</div>';

      // Update matches list
      const matches = records.filter(r => r.activityType === 'Match');
      matchesContainer.innerHTML = matches.map(sp => `
        <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; margin-bottom: 10px; font-family: var(--font-family-app) !important; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <h4 style="font-size: 0.95rem; font-weight: 700; margin: 0; color: var(--text-primary);">${sp.goalText || 'Match'}</h4>
            <span style="font-family:'JetBrains Mono', monospace; font-size: 0.85rem; font-weight:700; color:var(--accent);">${sp.trainingHours || 0} hrs</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
            <span><strong>Scheduled Date:</strong> ${sp.scheduleDate}</span>
            <span><strong>Competition Level:</strong> ${sp.competitionLevel || 'N/A'}</span>
            <span><strong>Achievement Level:</strong> ${sp.achievementLevel || 'N/A'}</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 6px;">
            <button class="btn-outline btn-sm edit-sport-btn" data-id="${sp.id}" style="flex: 1; padding: 4px 8px; font-size: 0.72rem;">Edit</button>
            <button class="btn-outline btn-sm delete-sport-btn" data-id="${sp.id}" style="border-color: var(--danger); color: var(--danger); padding: 4px 8px; font-size: 0.72rem;">Delete</button>
          </div>
        </div>
      `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem; padding: 12px 0;">No match schedules recorded.</div>';

      // Bind action listeners for Trainings and Matches
      const bindListeners = (el) => {
        el.querySelectorAll('.delete-sport-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            if (await window.authenticateDestructiveAction('Delete this sports entry?')) {
              this.handleDeleteSport(id);
            }
          });
        });

        el.querySelectorAll('.edit-sport-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            this.openModal(id);
          });
        });
      };

      bindListeners(trainingContainer);
      bindListeners(matchesContainer);

    } catch (err) {
      console.error('Sports render failed:', err);
    }
  },

  async openModal(id = null) {
    const modal = document.getElementById('sport-modal');
    const form = document.getElementById('sport-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('sport-modal-title').innerText = id ? 'Edit Sports Log' : 'New Sports Log';
    document.getElementById('sport-mode').value = id ? 'edit' : 'add';
    document.getElementById('sport-id').value = id || '';

    if (id) {
      try {
        const sp = await Database.get('sports', id);
        if (sp) {
          document.getElementById('sport-type').value = sp.activityType;
          document.getElementById('sport-date').value = sp.scheduleDate || '';
          document.getElementById('sport-hours').value = sp.trainingHours || '';
          const compEl = document.getElementById('sport-competition-level');
          if (compEl) compEl.value = sp.competitionLevel || 'University';
          const achEl = document.getElementById('sport-achievement-level');
          if (achEl) achEl.value = sp.achievementLevel || 'Participation';
          document.getElementById('sport-details').value = sp.goalText;
        }
      } catch (err) {
        console.error('Load sports details failed:', err);
      }
    } else {
      document.getElementById('sport-date').value = new Date().toISOString().slice(0, 10);
      const compEl = document.getElementById('sport-competition-level');
      if (compEl) compEl.value = 'University';
      const achEl = document.getElementById('sport-achievement-level');
      if (achEl) achEl.value = 'Participation';
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('sport-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSaveSport(e) {
    e.preventDefault();
    const mode = document.getElementById('sport-mode').value;
    const id = document.getElementById('sport-id').value || 'sp-' + Date.now();

    const activityType = document.getElementById('sport-type').value;
    const scheduleDate = document.getElementById('sport-date').value;
    const trainingHours = parseFloat(document.getElementById('sport-hours').value) || 0;
    const competitionLevel = document.getElementById('sport-competition-level').value;
    const achievementLevel = document.getElementById('sport-achievement-level').value;
    const goalText = document.getElementById('sport-details').value.trim();

    if (!goalText) {
      alert('Details text is required.');
      return;
    }

    const sportData = { id, activityType, scheduleDate, trainingHours, competitionLevel, achievementLevel, goalText };

    try {
      if (mode === 'add') {
        await Database.add('sports', sportData);
        NotificationService.show('Sports Activity Logged', 'New sports schedule updated.', 'sports');
      } else {
        await Database.put('sports', sportData);
        NotificationService.show('Sports Activity Saved', 'Sports log was updated.', 'sports');
      }

      this.closeModal();
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));

      if (window.AcademicModule) {
        window.AcademicModule.updateSpecialEligibilityHUD();
      }

    } catch (err) {
      console.error('Save sports failed:', err);
    }
  },

  async handleDeleteSport(id) {
    try {
      await Database.delete('sports', id);
      NotificationService.show('Sports Log Deleted', 'The sports record was removed.', 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
      
      if (window.AcademicModule) {
        window.AcademicModule.updateSpecialEligibilityHUD();
      }
    } catch (err) {
      console.error('Delete sports failed:', err);
    }
  }
};

window.SportsModule = SportsModule;
