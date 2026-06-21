/**
 * Rajarata Campus Life Manager - Exam Modules
 * Handles Examination Scheduling, Countdowns, and Calendar data mappings
 * UPGRADED: Gantt Project Roadmap, Priority stagger logic, and interactive milestone checklists
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';
import { Auth } from '../auth.js';

export const ExamsModule = {
  countdownIntervals: [],
  reminderTimeouts: [],

  async init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());

    // Schedule reminders on startup
    try {
      const exams = await Database.getAll('exams');
      this.scheduleReminders(exams);
    } catch (err) {
      console.error('Init reminders failed:', err);
    }
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

    const subjectSelect = document.getElementById('exam-subject');
    if (subjectSelect) {
      subjectSelect.addEventListener('change', (e) => {
        this.checkAttendanceEligibility(e.target.value);
      });
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('exam-subject');
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
      const subjects = await Database.getAll('subjects');

      // Schedule reminders when we fetch the exams
      this.scheduleReminders(exams);
      
      // Render visual Gantt roadmap at the top
      this.renderGantt(exams, subjects);

      if (exams.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
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

        const typeLabel = ex.examType || ex.type || 'THEORY';
        const titleLabel = ex.title || ex.name || 'Untitled Exam';
        const courseLabel = ex.courseId || ex.subjectCode || 'N/A';

        const sub = subjects.find(s => s.code === courseLabel);
        let resolvedCode = sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : courseLabel;
        if (resolvedCode && (resolvedCode.startsWith('sub_') || resolvedCode.startsWith('SUB_'))) {
          resolvedCode = 'Unknown Course';
        }

        return `
          <div class="card col-6" id="exam-card-${ex.id}" style="display: flex; flex-direction: column; gap: 14px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; font-family: var(--font-family-app) !important;">
              <div style="font-family: var(--font-family-app) !important;">
                <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-family: var(--font-family-app) !important;">
                  <span class="badge" style="background-color: var(--accent-glow); color: var(--accent); font-family: var(--font-family-app) !important;">${typeLabel}</span>
                  <span class="badge ${priorityClass}" style="font-family: var(--font-family-app) !important;">${priority} Priority</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 700; font-family: var(--font-family-app) !important;">${resolvedCode} : ${titleLabel}</h3>
                <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px; font-family: var(--font-family-app) !important;">Course: ${resolvedCode}</h4>
              </div>
              <div style="text-align: right; font-family: var(--font-family-app) !important;">
                <div class="exam-countdown" id="countdown-val-${ex.id}" style="font-family: 'JetBrains Mono', monospace, var(--font-family-app) !important; font-weight: 700; font-size: 1.1rem; color: var(--warning);">--:--</div>
                <div style="font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; font-family: var(--font-family-app) !important;">Remaining</div>
              </div>
            </div>
            
            <div style="border-top: 1px solid var(--border-color); padding-top: 10px; font-size: 0.8rem; color: var(--text-secondary); display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-family: var(--font-family-app) !important;">
              <span style="font-family: var(--font-family-app) !important;"><strong style="font-family: var(--font-family-app) !important;">Date & Time:</strong> ${ex.date} @ ${ex.time}</span>
              <span style="font-family: var(--font-family-app) !important;"><strong style="font-family: var(--font-family-app) !important;">Venue:</strong> ${ex.venue || 'N/A'}</span>
            </div>

            <!-- Milestone Checklist Block -->
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; flex-direction: column; gap: 8px; font-family: var(--font-family-app) !important;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-family: var(--font-family-app) !important;">
                <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.04em; font-family: var(--font-family-app) !important;">Revision Sub-Goals</span>
                <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; font-family: var(--font-family-app) !important;">${doneCount}/${milestones.length} done</span>
              </div>
              <div style="display: flex; flex-direction: column; gap: 5px; max-height: 120px; overflow-y: auto; font-family: var(--font-family-app) !important;">
                ${milestones.map((m, idx) => `
                  <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: ${m.done ? 'var(--text-muted)' : 'var(--text-primary)'}; font-family: var(--font-family-app) !important;">
                    <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; text-decoration: ${m.done ? 'line-through' : 'none'}; flex: 1; font-family: var(--font-family-app) !important;">
                      <input type="checkbox" class="exam-milestone-check" data-exam-id="${ex.id}" data-idx="${idx}" ${m.done ? 'checked' : ''}
                        style="width: 13px; height: 13px; accent-color: var(--accent); cursor: pointer; font-family: var(--font-family-app) !important;">
                      ${m.label}
                    </label>
                    <button class="delete-milestone-btn" data-exam-id="${ex.id}" data-idx="${idx}"
                      style="background: none; border: none; color: var(--danger); cursor: pointer; font-size: 0.75rem; padding: 2px 6px; opacity: 0.7; font-family: var(--font-family-app) !important;">✕</button>
                  </div>
                `).join('')}
              </div>
              <div style="display: flex; gap: 6px; margin-top: 2px; font-family: var(--font-family-app) !important;">
                <input type="text" class="input-text add-milestone-input" placeholder="Slice unit milestone..." style="font-size: 0.75rem; padding: 4px 8px; height: 26px; font-family: var(--font-family-app) !important;">
                <button class="btn-outline add-milestone-btn" data-exam-id="${ex.id}" style="padding: 4px 8px; font-size: 0.72rem; height: 26px; font-weight: 700; font-family: var(--font-family-app) !important;">Add</button>
              </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 12px; font-family: var(--font-family-app) !important;">
              <button class="btn-outline btn-sm edit-exam-btn" data-id="${ex.id}" style="flex: 1; padding: 5px 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Edit</button>
              <button class="btn-outline btn-sm delete-exam-btn" data-id="${ex.id}" style="border-color: var(--danger); color: var(--danger); padding: 5px 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Delete</button>
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
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete exam schedule entry?')) {
            this.handleDeleteExam(id);
          }
        });
      });

    } catch (err) {
      console.error('Render exams failed:', err);
    }
  },

  renderGantt(exams, subjects = []) {
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
      
      const courseLabel = ex.courseId || ex.subjectCode || 'N/A';
      const sub = subjects.find(s => s.code === courseLabel);
      let resolvedCode = sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : courseLabel;
      if (resolvedCode && (resolvedCode.startsWith('sub_') || resolvedCode.startsWith('SUB_'))) {
        resolvedCode = 'Unknown Course';
      }

      return {
        id: ex.id,
        name: ex.title || ex.name || 'Untitled Exam',
        subject: resolvedCode,
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
        <div style="display: flex; align-items: center; gap: 12px; min-width: 600px; font-family: var(--font-family-app) !important;">
          <div style="width: 180px; flex-shrink: 0; font-size: 0.78rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-family: var(--font-family-app) !important;">
            <strong style="color: var(--text-primary); font-family: var(--font-family-app) !important;">${item.subject}</strong> - <span style="color: var(--text-secondary); font-family: var(--font-family-app) !important;">${item.name}</span>
          </div>
          <div style="flex: 1; height: 30px; background: rgba(255,255,255,0.02); border-radius: 4px; position: relative; border: 1px solid var(--border-color); font-family: var(--font-family-app) !important;">
            <div style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 4px; height: 20px; background: ${color}; opacity: 0.35; border-radius: 3px; border-left: 3px solid ${color}; display: flex; align-items: center; padding: 0 6px; box-sizing: border-box; font-family: var(--font-family-app) !important;">
              <span style="font-size: 0.65rem; font-weight: 700; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--font-family-app) !important;">
                ${item.priority} Prep (until ${item.dateStr})
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    ganttContainer.innerHTML = `
      <div class="card" style="padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-x: auto; margin-bottom: 24px; font-family: var(--font-family-app) !important;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-family: var(--font-family-app) !important;">
          <span style="font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--accent); font-family: var(--font-family-app) !important;">
            🗓️ Visual Gantt Exam Preparation Roadmap
          </span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500; font-family: var(--font-family-app) !important;">
            Staggered preparation ranges dynamically calculated by priority levels
          </span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-family: var(--font-family-app) !important;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 600px; font-family: var(--font-family-app) !important;">
            <div style="width: 180px; flex-shrink: 0; font-family: var(--font-family-app) !important;"></div>
            <div style="flex: 1; display: flex; justify-content: space-between; padding: 0 4px; font-size: 0.68rem; color: var(--text-muted); font-weight: 600; font-family: var(--font-family-app) !important;">
              ${markers.map(m => `<span style="font-family: var(--font-family-app) !important;">${m}</span>`).join('')}
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

      el.innerText = `${days}d ${hours}h ${mins}m`;
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    this.countdownIntervals.push(interval);
  },

  scheduleReminders(exams) {
    // Clear existing reminder timeouts
    if (this.reminderTimeouts) {
      this.reminderTimeouts.forEach(clearTimeout);
    }
    this.reminderTimeouts = [];

    const now = Date.now();

    // Retrieve/parse send log from localStorage
    let sentReminders = {};
    try {
      sentReminders = JSON.parse(localStorage.getItem('exam_reminders_sent') || '{}');
    } catch (e) {
      sentReminders = {};
    }

    exams.forEach(ex => {
      const examTime = new Date(`${ex.date}T${ex.time || '08:30'}`).getTime();
      if (isNaN(examTime) || examTime <= now) return;

      const title = ex.title || ex.name || 'Exam';

      // 3-day reminder (259200000 ms before)
      const time3d = examTime - 3 * 24 * 60 * 60 * 1000;
      const key3d = `${ex.id}_3d`;
      if (time3d > now && !sentReminders[key3d]) {
        const delay = time3d - now;
        const timerId = setTimeout(() => {
          let currentSent = {};
          try { currentSent = JSON.parse(localStorage.getItem('exam_reminders_sent') || '{}'); } catch(e){}
          if (!currentSent[key3d]) {
            NotificationService.show('Exam Scheduled', `Upcoming Exam: ${title} is scheduled in 3 days.`, 'exam');
            currentSent[key3d] = true;
            localStorage.setItem('exam_reminders_sent', JSON.stringify(currentSent));
          }
        }, delay);
        this.reminderTimeouts.push(timerId);
      }

      // 24-hour reminder (86400000 ms before)
      const time24h = examTime - 24 * 60 * 60 * 1000;
      const key24h = `${ex.id}_24h`;
      if (time24h > now && !sentReminders[key24h]) {
        const delay = time24h - now;
        const timerId = setTimeout(() => {
          let currentSent = {};
          try { currentSent = JSON.parse(localStorage.getItem('exam_reminders_sent') || '{}'); } catch(e){}
          if (!currentSent[key24h]) {
            NotificationService.show('Exam Warning', `Critical Warning: ${title} starts in 24 hours!`, 'warning');
            currentSent[key24h] = true;
            localStorage.setItem('exam_reminders_sent', JSON.stringify(currentSent));
          }
        }, delay);
        this.reminderTimeouts.push(timerId);
      }
    });
  },

  async checkAttendanceEligibility(subjectCode) {
    const warningBanner = document.getElementById('exam-validation-warning');
    const saveBtn = document.querySelector('#exam-form button[type="submit"]');
    
    if (!subjectCode) {
      if (warningBanner) warningBanner.style.display = 'none';
      if (saveBtn) saveBtn.removeAttribute('disabled');
      return true;
    }

    try {
      const records = await Database.getAll('attendance');
      const rec = records.find(r => r.subjectCode === subjectCode || r.courseId === subjectCode);
      if (!rec) {
        if (warningBanner) {
          warningBanner.style.display = 'block';
          warningBanner.innerText = '⚠️ Examination Admission Barred: Attendance Below 80% Bounds.';
        }
        if (saveBtn) saveBtn.setAttribute('disabled', 'true');
        return false;
      }

      let attended = 0;
      let total = 0;
      if (rec.lecture && rec.practical && rec.fieldWork) {
        attended = (rec.lecture.present || 0) + (rec.practical.present || 0) + (rec.fieldWork.present || 0);
        total = (rec.lecture.total || 0) + (rec.practical.total || 0) + (rec.fieldWork.total || 0);
      } else {
        attended = (rec.lecturesAttended || 0) + (rec.practicalsAttended || 0);
        total = (rec.lecturesTotal || 0) + (rec.practicalsTotal || 0);
      }
      const medical = rec.approvedMedicalSessions || 0;
      const pct = total > 0 ? ((attended + medical) / total) * 100 : 100;

      if (pct < 80) {
        if (warningBanner) {
          warningBanner.style.display = 'block';
          warningBanner.innerText = '⚠️ Examination Admission Barred: Attendance Below 80% Bounds.';
        }
        if (saveBtn) saveBtn.setAttribute('disabled', 'true');
        return false;
      } else {
        if (warningBanner) warningBanner.style.display = 'none';
        if (saveBtn) saveBtn.removeAttribute('disabled');
        return true;
      }
    } catch (err) {
      console.error('Check attendance eligibility failed:', err);
      return true;
    }
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
          document.getElementById('exam-name').value = ex.title || ex.name || '';
          document.getElementById('exam-subject').value = ex.courseId || ex.subjectCode || '';
          document.getElementById('exam-date').value = ex.date;
          document.getElementById('exam-time').value = ex.time;
          document.getElementById('exam-venue').value = ex.venue || '';
          document.getElementById('exam-type').value = ex.examType || ex.type || 'THEORY';
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

    const selectedCode = document.getElementById('exam-subject').value;
    await this.checkAttendanceEligibility(selectedCode);

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

    const isEligible = await this.checkAttendanceEligibility(subjectCode);
    if (!isEligible) {
      alert('Examination Admission Barred: Attendance Below 80% Bounds.');
      return;
    }

    // Check enum constraint
    const allowedTypes = ['THEORY', 'PRACTICAL', 'REPEAT'];
    if (!allowedTypes.includes(type)) {
      alert(`Invalid Exam Type: must be one of ${allowedTypes.join(', ')}`);
      return;
    }

    const userId = Auth.getCurrentUserId() || '';
    const examData = {
      id,
      // new schema keys
      title: name,
      courseId: subjectCode,
      examType: type,
      date,
      time,
      venue,
      priority,
      userId,
      // legacy keys for backward compatibility
      name,
      subjectCode,
      type
    };

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
      
      // Notify calendar and main dashboard
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
      window.dispatchEvent(new CustomEvent('subjectsUpdated')); // trigger app.js to reload renderDashboard

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
      window.dispatchEvent(new CustomEvent('subjectsUpdated')); // trigger app.js to reload renderDashboard
    } catch (err) {
      console.error('Delete exam failed:', err);
    }
  }
};
