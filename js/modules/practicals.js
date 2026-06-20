/**
 * Rajarata Campus Life Manager - Practical Modules
 * Handles Laboratory Practical Classes, Lab names, and Required Materials
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const PracticalsModule = {
  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());
  },

  bindEvents() {
    const form = document.getElementById('practical-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSavePractical(e));
    }

    const addBtn = document.getElementById('btn-add-practical');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('prac-subject');
    if (!dropdown) return;

    try {
      const subjects = await Database.getAll('subjects');
      dropdown.innerHTML = subjects.map(s => {
        const displayCode = s.isSubmodule ? s.parentSubjectCode : s.code;
        const displayName = s.name || s.moduleTitle || 'Unknown';
        return `
          <option value="${s.code}" style="font-family: var(--font-family-app) !important;">${displayCode} — ${displayName}</option>
        `;
      }).join('') || '<option value="" style="font-family: var(--font-family-app) !important;">No course units added</option>';
    } catch (err) {
      console.error('Load practical subjects dropdown failed:', err);
    }
  },

  async render() {
    const container = document.getElementById('practicals-list-container');
    if (!container) return;

    try {
      const practicals = await Database.getAll('practicals');
      const subjects = await Database.getAll('subjects');

      if (practicals.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No laboratory practical classes logged.
          </div>
        `;
        return;
      }

      container.innerHTML = practicals.map(pr => {
        const completed = pr.completed === true;
        const subjectCode = pr.subjectCode;
        const sub = subjects.find(s => s.code === subjectCode);
        const resolvedCode = sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : subjectCode;

        return `
          <div class="card col-6" style="display: flex; flex-direction: column; gap: 14px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; font-family: var(--font-family-app) !important;">
              <div style="font-family: var(--font-family-app) !important;">
                <span class="badge" style="background-color: var(--accent-glow); color: var(--accent); margin-bottom: 6px; display: inline-block; font-family: var(--font-family-app) !important;">Lab: ${pr.labName || 'N/A'}</span>
                <h3 style="font-size: 1.1rem; font-weight: 700; font-family: var(--font-family-app) !important;">${resolvedCode} : ${pr.name}</h3>
                <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px; font-family: var(--font-family-app) !important;">Subject: ${resolvedCode}</h4>
              </div>
            </div>
            
            <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px; font-family: var(--font-family-app) !important;">
              <span style="font-family: var(--font-family-app) !important;"><strong style="font-family: var(--font-family-app) !important;">Date & Time:</strong> ${pr.date} @ ${pr.time}</span>
              <span style="font-family: var(--font-family-app) !important;"><strong style="font-family: var(--font-family-app) !important;">Required Materials:</strong> ${pr.materials || 'None listed'}</span>
              <span style="font-family: var(--font-family-app) !important;"><strong style="font-family: var(--font-family-app) !important;">Lab Notes:</strong> ${pr.notes || 'No notes added'}</span>
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 6px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 6px; font-family: var(--font-family-app) !important;">
              <input type="checkbox" class="toggle-practical-status" data-id="${pr.id}" ${completed ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent); margin: 0; font-family: var(--font-family-app) !important;">
              <label style="font-size: 0.75rem; font-weight: 700; color: ${completed ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${completed ? 'line-through' : 'none'}; cursor: pointer; margin: 0; user-select: none; font-family: var(--font-family-app) !important;">
                ${completed ? 'Verified / Completed' : 'Mark as Verified / Completed'}
              </label>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px; font-family: var(--font-family-app) !important;">
              <button class="btn-outline btn-sm edit-prac-btn" data-id="${pr.id}" style="flex: 1; padding: 4px 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Edit</button>
              <button class="btn-outline btn-sm delete-prac-btn" data-id="${pr.id}" style="border-color: var(--danger); color: var(--danger); padding: 4px 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind edits
      container.querySelectorAll('.edit-prac-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openModal(id);
        });
      });

      // Bind deletes
      container.querySelectorAll('.delete-prac-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete practical class schedule entry?')) {
            this.handleDeletePractical(id);
          }
        });
      });

      // Bind check-handlers to toggle status completed/pending
      container.querySelectorAll('.toggle-practical-status').forEach(chk => {
        chk.addEventListener('change', async () => {
          const id = chk.getAttribute('data-id');
          const isChecked = chk.checked;
          try {
            const pr = await Database.get('practicals', id);
            if (pr) {
              pr.completed = isChecked;
              await Database.put('practicals', pr);
              NotificationService.show('Practical Updated', `Practical session marked as ${isChecked ? 'Completed' : 'Pending'}.`, 'success');
              this.render();
              window.dispatchEvent(new CustomEvent('subjectsUpdated'));
            }
          } catch (err) {
            console.error('Toggle practical status failed:', err);
          }
        });
      });

    } catch (err) {
      console.error('Render practicals failed:', err);
    }
  },

  async openModal(id = null) {
    const modal = document.getElementById('practical-modal');
    const form = document.getElementById('practical-form');
    if (!modal || !form) return;

    await this.populateSubjectsDropdown();
    form.reset();

    document.getElementById('practical-modal-title').innerText = id ? 'Edit Practical Session' : 'Add Practical Session';
    document.getElementById('practical-mode').value = id ? 'edit' : 'add';
    document.getElementById('practical-id').value = id || '';

    if (id) {
      try {
        const pr = await Database.get('practicals', id);
        if (pr) {
          document.getElementById('prac-name').value = pr.name;
          document.getElementById('prac-subject').value = pr.subjectCode;
          document.getElementById('prac-lab').value = pr.labName;
          document.getElementById('prac-date').value = pr.date;
          document.getElementById('prac-time').value = pr.time;
          document.getElementById('prac-materials').value = pr.materials || '';
          document.getElementById('prac-notes').value = pr.notes || '';
        }
      } catch (err) {
        console.error('Load practical details failed:', err);
      }
    } else {
      document.getElementById('prac-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('prac-time').value = '13:30'; // Normal practical class afternoon time slot in Sri Lanka
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('practical-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSavePractical(e) {
    e.preventDefault();
    const mode = document.getElementById('practical-mode').value;
    const id = document.getElementById('practical-id').value || 'pr-' + Date.now();
    const name = document.getElementById('prac-name').value.trim();
    const subjectCode = document.getElementById('prac-subject').value;
    const labName = document.getElementById('prac-lab').value.trim();
    const date = document.getElementById('prac-date').value;
    const time = document.getElementById('prac-time').value;
    const materials = document.getElementById('prac-materials').value.trim();
    const notes = document.getElementById('prac-notes').value.trim();

    if (!name || !subjectCode || !date) {
      alert('Required fields missing.');
      return;
    }

    try {
      let completed = false;
      if (mode === 'edit') {
        const existing = await Database.get('practicals', id);
        if (existing) {
          completed = existing.completed ?? false;
        }
      }

      const practicalData = { id, name, subjectCode, labName, date, time, materials, notes, completed };

      if (mode === 'add') {
        await Database.add('practicals', practicalData);
        NotificationService.show('Practical Class Scheduled', `${name} scheduled for ${date}.`, 'practical');
      } else {
        await Database.put('practicals', practicalData);
        NotificationService.show('Practical Class Updated', `${name} details updated.`, 'practical');
      }

      this.closeModal();
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));

    } catch (err) {
      console.error('Save practical failed:', err);
    }
  },

  async handleDeletePractical(id) {
    try {
      await Database.delete('practicals', id);
      NotificationService.show('Practical Session Deleted', 'Practical session removed.', 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    } catch (err) {
      console.error('Delete practical failed:', err);
    }
  }
};
