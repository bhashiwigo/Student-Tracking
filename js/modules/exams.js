/**
 * Rajarata Campus Life Manager - Exam Modules
 * Handles Examination Scheduling, Countdowns, and Calendar data mappings
 * UPGRADED: Gantt Project Roadmap, Priority stagger logic, and interactive milestone checklists
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
      
      // Render visual Gantt roadmap at the top
      this.renderGantt(exams);

      if (exams.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No upcoming examinations logged.
          </div>
        `;
        return;
      }

      container.innerHTML = exams.map(ex => {
        const priority = ex.priority || 'Medium';
        const priorityClasses = { Low: 'low', Medium: 'medium', High: 'high' };
        const priorityClass = priorityClasses[priority] || 'medium';

        // Retrieve milestones (with fallback defaults for premium experience)
        const milestones = Array.isArray(ex.milestones) ? ex.milestones : [
          { label: 'Review lecture notes', done: false },
          { label: 'Revise lab components', done: false },
          { label: 'Solve past papers', done: false }
        ];
        const doneCount = milestones.filter(m => m.done).length;

        return `
          <div class="card col-6" id="exam-card-${ex.id}" style="display: flex; flex-direction: column; gap: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div>
                <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
                  <span class="badge" style="background-color: var(--accent-glow); color: var(--accent);">${ex.type || 'Final Exam'}</span>
                  <span class="badge ${priorityClass}">${priority} Priority</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 700;">${ex.name}</h3>
                <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px;">Subject: ${ex.subjectCode}</h4>
              </div>
              <div style="text-align: right;">
                <div class="exam-countdown" id="countdown-val-${ex.id}" style="font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 1.1rem; color: var(--warning);">--:--:--</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase;">Remaining</div>
              </div>
            </div>
            
            <div style="border-top: 1px solid var(--border-color); padding-top: 10px; font-size: 0.8rem; color: var(--text-secondary); display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
              <span><strong>Date & Time:</strong> ${ex.date} @ ${ex.time}</span>
              <span><strong>Venue:</strong> ${ex.venue || 'N/A'}</span>
            </div>

            <!-- Milestone Checklist Block -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.04em;">Revision Sub-Goals</span>
                <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600;">${doneCount}/${milestones.length} done</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 5px; max-height: 120px; overflow-y: auto;">
                ${milestones.map((m, idx) => `
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: ${m.done ? 'var(--text-muted)' : 'var(--text-primary)'};">
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; text-decoration: ${m.done ? 'line-through' : 'none'}; flex: 1;">
                      <input type="checkbox" class="exam-milestone-check" data-exam-id="${ex.id}" data-idx="${idx}" ${m.done ? 'checked' : ''}
                        style="width: 13px; height: 13px; accent-color: var(--accent); cursor: pointer;">
                      ${m.label}
                    </label>
                    <button class="delete-milestone-btn" data-exam-id="${ex.id}" data-idx="${idx}"
                      style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.75rem; padding: 2px 6px; opacity: 0.7;">✕</button>
                  </div>
                `).join('')}
              </div>
              <div style="display: flex; gap: 6px; margin-top: 2px;">
                <input type="text" class="input-text add-milestone-input" placeholder="Slice unit milestone..." style="font-size: 0.75rem; padding: 4px 8px; height: 26px;">
                <button class="btn-outline add-milestone-btn" data-exam-id="${ex.id}" style="padding: 4px 8px; font-size: 0.72rem; height: 26px; font-weight: 700;">Add</button>
              </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 12px;">
              <button class="btn-outline btn-sm edit-exam-btn" data-id="${ex.id}" style="flex: 1; padding: 5px 8px; font-size: 0.75rem;">Edit</button>
              <button class="btn-outline btn-sm delete-exam-btn" data-id="${ex.id}" style="border-color: var(--danger); color: var(--danger); padding: 5px 8px; font-size: 0.75rem;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Launch timers
      exams.forEach(ex => {
        this.startCountdownTimer(ex.id, `${ex.date}T${ex.time || '08:30'}`);
      });

      // Bind milestone checkboxes
      container.querySelectorAll('.exam-milestone-check').forEach(chk => {
        chk.addEventListener('change', async (e) => {
          const examId = chk.getAttribute('data-exam-id');
          const idx = parseInt(chk.getAttribute('data-idx'));
          await this.toggleMilestone(examId, idx, e.target.checked);
        });
      });

      // Bind milestone deletes
      container.querySelectorAll('.delete-milestone-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const examId = btn.getAttribute('data-exam-id');
          const idx = parseInt(btn.getAttribute('data-idx'));
          await this.deleteMilestone(examId, idx);
        });
      });

      // Bind milestone adds
      container.querySelectorAll('.add-milestone-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const examId = btn.getAttribute('data-exam-id');
          const input = btn.previousElementSibling;
          this.addMilestone(examId, input);
        });
      });

      container.querySelectorAll('.add-milestone-input').forEach(input => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const examId = input.nextElementSibling.getAttribute('data-exam-id');
            this.addMilestone(examId, input);
          }
        });
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

  renderGantt(exams) {
    const ganttContainer = document.getElementById('exams-gantt-container');
    if (!ganttContainer) return;

    if (!exams || exams.length === 0) {
      ganttContainer.style.display = 'none';
      return;
    }

    ganttContainer.style.display = 'block';

    const timelineData = exams.map(ex => {
      const deadline = new Date(`${ex.date}T${ex.time || '08:30'}`);
      const priority = ex.priority || 'Medium';
      const prepDays = priority === 'High' ? 7 : priority === 'Medium' ? 4 : 2;
      const startDate = new Date(deadline.getTime() - prepDays * 24 * 60 * 60 * 1000);
      
      return {
        id: ex.id,
        name: ex.name,
        subject: ex.subjectCode,
        priority: priority,
        startDate: startDate,
        deadline: deadline,
        dateStr: ex.date
      };
    });

    timelineData.sort((a, b) => a.deadline - b.deadline);

    const minS = new Date(Math.min(...timelineData.map(d => d.startDate.getTime())));
    minS.setHours(0,0,0,0);
    
    const maxD = new Date(Math.max(...timelineData.map(d => d.deadline.getTime())));
    maxD.setHours(23,59,59,999);

    const totalDuration = maxD.getTime() - minS.getTime() || 86400000;

    const numMarkers = 6;
    const markers = [];
    for (let i = 0; i < numMarkers; i++) {
      const time = minS.getTime() + (totalDuration * i) / (numMarkers - 1);
      const d = new Date(time);
      markers.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
    }

    const rowsHtml = timelineData.map(item => {
      const leftPct = (item.startDate.getTime() - minS.getTime()) / totalDuration * 100;
      const widthPct = (item.deadline.getTime() - item.startDate.getTime()) / totalDuration * 100;

      const priorityColors = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--accent)' };
      const color = priorityColors[item.priority] || 'var(--accent)';

      return `
        <div style="display: flex; align-items: center; gap: 12px; min-width: 600px;">
          <div style="width: 180px; flex-shrink: 0; font-size: 0.78rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
            <strong style="color: var(--text-primary);">${item.subject}</strong> - <span style="color: var(--text-secondary);">${item.name}</span>
          </div>
          <div style="flex: 1; height: 30px; background: rgba(255,255,255,0.02); border-radius: 4px; position: relative; border: 1px solid var(--border-color);">
            <div style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 4px; height: 20px; background: ${color}; opacity: 0.35; border-radius: 3px; border-left: 3px solid ${color}; display: flex; align-items: center; padding: 0 6px; box-sizing: border-box;">
              <span style="font-size: 0.65rem; font-weight: 700; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                ${item.priority} Prep (until ${item.dateStr})
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    ganttContainer.innerHTML = `
      <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-x: auto; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--accent);">
            🗓️ Visual Gantt Exam Preparation Roadmap
          </span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500;">
            Staggered preparation ranges dynamically calculated by priority levels
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 600px;">
            <div style="width: 180px; flex-shrink: 0;"></div>
            <div style="flex: 1; display: flex; justify-content: space-between; padding: 0 4px; font-size: 0.68rem; color: var(--text-muted); font-weight: 600;">
              ${markers.map(m => `<span>${m}</span>`).join('')}
            </div>
          </div>
          ${rowsHtml}
        </div>
      </div>
    `;
  },

  async toggleMilestone(examId, idx, done) {
    try {
      const ex = await Database.get('exams', examId);
      if (ex) {
        if (!Array.isArray(ex.milestones)) ex.milestones = [];
        if (ex.milestones[idx]) {
          ex.milestones[idx].done = done;
        }
        await Database.put('exams', ex);
        this.render();
      }
    } catch (err) {
      console.error(err);
    }
  },

  async deleteMilestone(examId, idx) {
    try {
      const ex = await Database.get('exams', examId);
      if (ex && Array.isArray(ex.milestones)) {
        ex.milestones.splice(idx, 1);
        await Database.put('exams', ex);
        this.render();
      }
    } catch (err) {
      console.error(err);
    }
  },

  async addMilestone(examId, input) {
    const val = input.value.trim();
    if (!val) return;
    try {
      const ex = await Database.get('exams', examId);
      if (ex) {
        if (!Array.isArray(ex.milestones)) {
          ex.milestones = [
            { label: 'Review lecture notes', done: false },
            { label: 'Revise lab components', done: false },
            { label: 'Solve past papers', done: false }
          ];
        }
        ex.milestones.push({ label: val, done: false });
        await Database.put('exams', ex);
        input.value = '';
        this.render();
      }
    } catch (err) {
      console.error(err);
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
          document.getElementById('exam-priority').value = ex.priority || 'Medium';
        }
      } catch (err) {
        console.error('Load exam details failed:', err);
      }
    } else {
      document.getElementById('exam-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('exam-time').value = '08:30';
      document.getElementById('exam-priority').value = 'Medium';
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
    const priority = document.getElementById('exam-priority').value;

    if (!name || !subjectCode || !date) {
      alert('Required fields missing.');
      return;
    }

    const examData = { id, name, subjectCode, date, time, venue, type, priority };

    try {
      const existing = await Database.get('exams', id) || {};
      examData.milestones = existing.milestones || [
        { label: 'Review lecture notes', done: false },
        { label: 'Revise lab components', done: false },
        { label: 'Solve past papers', done: false }
      ];

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
