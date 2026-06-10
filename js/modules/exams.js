/**
 * Rajarata Campus Life Manager - Exam Modules
 * Handles Examination Scheduling, Countdowns, and Calendar data mappings
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const ExamsModule = {
  countdownIntervals: [],

  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());
  },

  bindEvents() {
    const form = document.getElementById('exam-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveExam(e));
    }

    const addBtn = document.getElementById('btn-add-exam');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('exam-subject');
    if (!dropdown) return;

    try {
      const subjects = await Database.getAll('subjects');
      dropdown.innerHTML = subjects.map(s => `
        <option value="${s.code}">${s.code} - ${s.name}</option>
      `).join('') || '<option value="">No course units added</option>';
    } catch (err) {
      console.error('Load exam subjects dropdown failed:', err);
    }
  },

  async render() {
    const container = document.getElementById('exams-list-container');
    if (!container) return;

    // Clear active timers
    this.countdownIntervals.forEach(clearInterval);
    this.countdownIntervals = [];

    try {
      const exams = await Database.getAll('exams');
      if (exams.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No upcoming examinations logged.
          </div>
        `;
        return;
      }

      container.innerHTML = exams.map(ex => {
        return `
          <div class="card col-6" id="exam-card-${ex.id}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <span class="badge" style="background-color: var(--accent-glow); color: var(--accent); margin-bottom: 6px; display: inline-block;">${ex.type || 'Final Exam'}</span>
                <h3 style="font-size: 1.1rem; font-weight: 700;">${ex.name}</h3>
                <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px;">Subject: ${ex.subjectCode}</h4>
              </div>
              <div style="text-align: right;">
                <div class="exam-countdown" id="countdown-val-${ex.id}" style="font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 1.1rem; color: var(--warning);">--:--:--</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Remaining</div>
              </div>
            </div>
            
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 8px; font-size: 0.8rem; color: var(--text-secondary); display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
              <span><strong>Date & Time:</strong> ${ex.date} @ ${ex.time}</span>
              <span><strong>Venue:</strong> ${ex.venue || 'N/A'}</span>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 12px;">
              <button class="btn-outline btn-sm edit-exam-btn" data-id="${ex.id}" style="flex: 1; padding: 4px 8px; font-size: 0.75rem;">Edit</button>
              <button class="btn-outline btn-sm delete-exam-btn" data-id="${ex.id}" style="border-color: var(--danger); color: var(--danger); padding: 4px 8px; font-size: 0.75rem;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Launch timers
      exams.forEach(ex => {
        this.startCountdownTimer(ex.id, `${ex.date}T${ex.time || '08:30'}`);
      });

      // Bind edits
      container.querySelectorAll('.edit-exam-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openModal(id);
        });
      });

      // Bind deletes
      container.querySelectorAll('.delete-exam-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (confirm('Delete exam schedule entry?')) {
            this.handleDeleteExam(id);
          }
        });
      });

    } catch (err) {
      console.error('Render exams failed:', err);
    }
  },

  startCountdownTimer(id, targetDateStr) {
    const el = document.getElementById(`countdown-val-${id}`);
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
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      el.innerText = `${days}d ${hours}h ${mins}m ${secs}s`;
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    this.countdownIntervals.push(interval);
  },

  async openModal(id = null) {
    const modal = document.getElementById('exam-modal');
    const form = document.getElementById('exam-form');
    if (!modal || !form) return;

    await this.populateSubjectsDropdown();
    form.reset();
    
    document.getElementById('exam-modal-title').innerText = id ? 'Edit Exam' : 'Schedule Exam';
    document.getElementById('exam-mode').value = id ? 'edit' : 'add';
    document.getElementById('exam-id').value = id || '';

    if (id) {
      try {
        const ex = await Database.get('exams', id);
        if (ex) {
          document.getElementById('exam-name').value = ex.name;
          document.getElementById('exam-subject').value = ex.subjectCode;
          document.getElementById('exam-date').value = ex.date;
          document.getElementById('exam-time').value = ex.time;
          document.getElementById('exam-venue').value = ex.venue;
          document.getElementById('exam-type').value = ex.type;
        }
      } catch (err) {
        console.error('Load exam details failed:', err);
      }
    } else {
      document.getElementById('exam-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('exam-time').value = '08:30';
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('exam-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSaveExam(e) {
    e.preventDefault();
    const mode = document.getElementById('exam-mode').value;
    const id = document.getElementById('exam-id').value || 'ex-' + Date.now();
    const name = document.getElementById('exam-name').value.trim();
    const subjectCode = document.getElementById('exam-subject').value;
    const date = document.getElementById('exam-date').value;
    const time = document.getElementById('exam-time').value;
    const venue = document.getElementById('exam-venue').value.trim();
    const type = document.getElementById('exam-type').value;

    if (!name || !subjectCode || !date) {
      alert('Required fields missing.');
      return;
    }

    const examData = { id, name, subjectCode, date, time, venue, type };

    try {
      if (mode === 'add') {
        await Database.add('exams', examData);
        NotificationService.show('Exam Scheduled', `${name} scheduled for ${date}.`, 'exam');
      } else {
        await Database.put('exams', examData);
        NotificationService.show('Exam Updated', `${name} details updated.`, 'exam');
      }

      this.closeModal();
      this.render();
      
      // Notify calendar
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));

    } catch (err) {
      console.error('Save exam failed:', err);
    }
  },

  async handleDeleteExam(id) {
    try {
      await Database.delete('exams', id);
      NotificationService.show('Exam Deleted', 'Exam record deleted successfully.', 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
    } catch (err) {
      console.error('Delete exam failed:', err);
    }
  }
};
