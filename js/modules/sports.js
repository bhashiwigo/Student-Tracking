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
    const container = document.getElementById('sports-list-container');
    const fitnessText = document.getElementById('sports-fitness-goals');
    
    if (!container) return;

    try {
      const records = await Database.getAll('sports');
      
      // Update fitness summary separately if element exists
      const goals = records.filter(r => r.activityType === 'Goal');
      if (fitnessText) {
        fitnessText.innerHTML = goals.map(g => `
          <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding: 8px 0;">
            <span style="font-size:0.85rem;">🎯 ${g.goalText}</span>
            <button class="btn-icon delete-sport-btn" data-id="${g.id}" style="width:20px; height:20px; font-size:0.7rem;">✕</button>
          </div>
        `).join('') || '<div style="color:var(--text-muted); font-size:0.8rem;">No fitness goals set. Add a Goal below.</div>';
      }

      // Filter events/training list (excludes Goals)
      const events = records.filter(r => r.activityType !== 'Goal');

      if (events.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-size:0.85rem;">
            No sports training or match matches scheduled.
          </div>
        `;
        return;
      }

      container.innerHTML = events.map(sp => {
        const typeBadge = sp.activityType === 'Match' 
          ? `<span class="badge high">Match</span>` 
          : `<span class="badge low">Training</span>`;

        return `
          <div class="card col-6">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                ${typeBadge}
                <h3 style="font-size: 1.05rem; font-weight: 700; margin-top: 6px;">${sp.goalText || 'Sports Session'}</h3>
              </div>
              <div style="text-align: right;">
                <span style="font-family:'JetBrains Mono', monospace; font-size: 1rem; font-weight:700; color:var(--accent);">${sp.trainingHours || 0} hrs</span>
                <div style="font-size:0.65rem; color:var(--text-muted); text-transform:uppercase;">Duration</div>
              </div>
            </div>

            <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
              <span><strong>Scheduled Date:</strong> ${sp.scheduleDate}</span>
              <span><strong>Performance rating:</strong> ${sp.performanceScore ? sp.performanceScore + '/10' : 'N/A'}</span>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
              <button class="btn-outline btn-sm edit-sport-btn" data-id="${sp.id}" style="flex: 1; padding: 4px 8px; font-size: 0.75rem;">Edit</button>
              <button class="btn-outline btn-sm delete-sport-btn" data-id="${sp.id}" style="border-color: var(--danger); color: var(--danger); padding: 4px 8px; font-size: 0.75rem;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind deletes (for both goals and events)
      document.querySelectorAll('.delete-sport-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Delete this sports entry?')) {
            this.handleDeleteSport(id);
          }
        });
      });

      // Bind edits
      container.querySelectorAll('.edit-sport-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openModal(id);
        });
      });

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
          document.getElementById('sport-rating').value = sp.performanceScore || '';
          document.getElementById('sport-details').value = sp.goalText;
        }
      } catch (err) {
        console.error('Load sports details failed:', err);
      }
    } else {
      document.getElementById('sport-date').value = new Date().toISOString().slice(0, 10);
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
    const performanceScore = parseInt(document.getElementById('sport-rating').value) || 0;
    const goalText = document.getElementById('sport-details').value.trim();

    if (!goalText) {
      alert('Details text is required.');
      return;
    }

    const sportData = { id, activityType, scheduleDate, trainingHours, performanceScore, goalText };

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
    } catch (err) {
      console.error('Delete sports failed:', err);
    }
  }
};
