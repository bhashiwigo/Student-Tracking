/**
 * Rajarata Campus Life Manager - Exam Modules
 * Handles Examination Scheduling, Countdowns, and Calendar data mappings
 * UPGRADED: Gantt Project Roadmap, Priority stagger logic, and interactive milestone checklists
 */

import { Database, getSubjectDisplayName } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';
import { Auth } from '../auth.js';

export const ExamsModule = {
  countdownIntervals: [],
  reminderTimeouts: [],
  activeSemester: localStorage.getItem('rusl_active_semester') || '1-1',

  async init() {
    // Seed active semester from global setting
    this.activeSemester = localStorage.getItem('rusl_active_semester') || '1-1';

    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());
    window.addEventListener('data-registry-update', () => {
      this.populateSubjectsDropdown();
      this.render();
    });

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

    // Semester filter — wire up change handler and seed value
    const semFilter = document.getElementById('exam-semester-filter');
    if (semFilter) {
      semFilter.value = this.activeSemester;
      semFilter.addEventListener('change', (e) => {
        this.activeSemester = e.target.value;
        // Persist so the filter survives page refresh / navigation
        localStorage.setItem('rusl_active_semester', this.activeSemester);
        this.populateSubjectsDropdown();
        this.render();
      });
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('exam-subject');
    if (!dropdown) return;

    try {
      const allSubjects = await Database.getAll('subjects');

      // Context-aware: only show subjects from the currently selected semester.
      // A subject's semester is derived from its own `semester` field or from its
      // parent subject if it is a submodule.
      const semesterSubjects = allSubjects.filter(s => {
        const sem = s.semester || '';
        return sem === this.activeSemester;
      });

      const list = semesterSubjects.length > 0 ? semesterSubjects : allSubjects;

      dropdown.innerHTML = list.map(s => {
        const parentName = getSubjectDisplayName(s.isSubmodule ? s.parentSubjectCode : s.code);
        const subName = s.isSubmodule ? getSubjectDisplayName(s.code) : '';
        const displayLabel = s.isSubmodule ? `${parentName} — ${subName}` : parentName;
        return `
          <option value="${s.code}" style="font-family: var(--font-family-app) !important;">${displayLabel}</option>
        `;
      }).join('') || '<option value="" style="font-family: var(--font-family-app) !important;">No course units for this semester</option>';
    } catch (err) {
      console.error('Load exam subjects dropdown failed:', err);
    }
  },

  async render() {
    const container = document.getElementById('exams-list-container');
    if (!container) return;

    // Sync semester filter UI with current state
    const semFilter = document.getElementById('exam-semester-filter');
    if (semFilter && semFilter.value !== this.activeSemester) {
      semFilter.value = this.activeSemester;
    }

    // Clear active timers
    this.countdownIntervals.forEach(clearInterval);
    this.countdownIntervals = [];

    try {
      const allExams = await Database.getAll('exams');
      const subjects = await Database.getAll('subjects');

      // Build a lookup: subjectCode → subject record (for semester resolution)
      const subjectMap = {};
      subjects.forEach(s => { subjectMap[s.code] = s; });

      // Filter exams to the active semester.
      // Strategy (two-pass for backward compat):
      //   1. If the exam record carries its own `semester` field (new schema), use it.
      //   2. Otherwise resolve via the linked subject's semester field (legacy schema).
      const exams = allExams.filter(ex => {
        // Fast path: exam was saved with its own semester tag
        if (ex.semester) {
          return ex.semester === this.activeSemester;
        }
        // Fallback: look up the linked subject
        const code = ex.courseId || ex.subjectCode || '';
        const sub = subjectMap[code];
        if (!sub) return true; // no subject linked — show it (safer UX)
        const subSem = sub.semester || '';
        return subSem === this.activeSemester;
      });

      // Schedule reminders on unfiltered full list
      this.scheduleReminders(allExams);

      // Render visual Gantt roadmap at the top (filtered set)
      this.renderGantt(exams, subjects);

      if (exams.length === 0) {
        const [yr, sem] = this.activeSemester.split('-');
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No examinations logged for Year ${yr} — Semester ${sem === '1' ? 'I' : 'II'}.
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
        const parentName = getSubjectDisplayName(sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : courseLabel);
        const subName = sub && sub.isSubmodule ? getSubjectDisplayName(sub.code) : '';
        const resolvedDisplayName = subName ? `${parentName} — ${subName}` : parentName;

        return `
          <div class="card col-6" id="exam-card-${ex.id}" style="display: flex; flex-direction: column; gap: 14px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; font-family: var(--font-family-app) !important;">
              <div style="font-family: var(--font-family-app) !important;">
                <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-family: var(--font-family-app) !important;">
                  <span class="badge" style="background-color: var(--accent-glow); color: var(--accent); font-family: var(--font-family-app) !important;">${typeLabel}</span>
                  <span class="badge ${priorityClass}" style="font-family: var(--font-family-app) !important;">${priority} Priority</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 700; font-family: var(--font-family-app) !important;">${resolvedDisplayName} : ${titleLabel}</h3>
                <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px; font-family: var(--font-family-app) !important;">Course: ${resolvedDisplayName}</h4>
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
                      style="background: none; border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 2px 6px; opacity: 0.7; font-family: var(--font-family-app) !important;">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="close-svg"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
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

    const now = Date.now();

    // ── Build timeline data ────────────────────────────────────────────────────
    // Bar start  = date the exam was added (derived from the 'ex-<timestamp>' id
    //              or the ex.createdAt field if present). Falls back to today.
    // Bar end    = exam deadline.
    // This gives a true "preparation window" proportional bar.
    const timelineData = exams.map(ex => {
      const deadline = new Date(`${ex.date}T${ex.time || '08:30'}`);
      const priority = ex.priority || 'Medium';

      // Derive bar-start from record creation timestamp
      let barStart;
      if (ex.createdAt) {
        barStart = new Date(ex.createdAt);
      } else if (ex.id && ex.id.startsWith('ex-')) {
        const ts = parseInt(ex.id.replace('ex-', ''), 10);
        barStart = isNaN(ts) ? new Date(now) : new Date(ts);
      } else {
        barStart = new Date(now);
      }

      // If barStart is somehow after deadline, clamp it to 2 days before
      if (barStart >= deadline) {
        barStart = new Date(deadline.getTime() - 2 * 86400000);
      }

      const courseLabel = ex.courseId || ex.subjectCode || 'N/A';
      const sub = subjects.find(s => s.code === courseLabel);
      const parentName = getSubjectDisplayName(sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : courseLabel);
      const subName = sub && sub.isSubmodule ? getSubjectDisplayName(sub.code) : '';
      const resolvedDisplayName = subName ? `${parentName} — ${subName}` : parentName;

      return {
        id: ex.id,
        name: ex.title || ex.name || 'Untitled Exam',
        subject: resolvedDisplayName,
        priority,
        barStart,
        deadline,
        dateStr: ex.date
      };
    });

    // Sort by deadline ascending
    timelineData.sort((a, b) => a.deadline - b.deadline);

    // ── Global timeline bounds ─────────────────────────────────────────────────
    const globalStart = new Date(Math.min(...timelineData.map(d => d.barStart.getTime())));
    globalStart.setHours(0, 0, 0, 0);

    const globalEnd = new Date(Math.max(...timelineData.map(d => d.deadline.getTime())));
    globalEnd.setHours(23, 59, 59, 999);

    const totalDuration = globalEnd.getTime() - globalStart.getTime() || 86400000;

    // ── Date markers (6 evenly spaced ticks) ──────────────────────────────────
    const NUM_MARKERS = 6;
    const markers = Array.from({ length: NUM_MARKERS }, (_, i) => {
      const t = globalStart.getTime() + (totalDuration * i) / (NUM_MARKERS - 1);
      return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });

    // ── Render rows ────────────────────────────────────────────────────────────
    const rowsHtml = timelineData.map(item => {
      // Proportional bar positioning
      // leftPct  = (barStart  - globalStart) / totalDuration × 100
      // widthPct = (deadline  - barStart)   / totalDuration × 100
      const leftPct = Math.max(0, (item.barStart.getTime() - globalStart.getTime()) / totalDuration * 100);
      const widthPct = Math.min(100 - leftPct, (item.deadline.getTime() - item.barStart.getTime()) / totalDuration * 100);

      // Dynamic Priority Decay: auto-upgrade to High if exam is ≤ 7 days away
      const daysUntil = Math.ceil((item.deadline.getTime() - now) / 86400000);
      const effectivePriority = daysUntil <= 7 ? 'High' : item.priority;

      // Calm-Contrast palette
      const COLORS = {
        High: 'rgba(220, 38, 38, 0.7)',   // Deep Rose / Muted Crimson
        Medium: 'rgba(217, 119, 6, 0.7)',   // Soft Amber / Honey
        Low: 'rgba(20, 184, 26, 0.7);'   // Soft Green (Theme-compliant Teal/Green)
      };
      const color = COLORS[effectivePriority] || COLORS.Low;

      // Each row is a .gantt-row — 32px height locked by CSS, flex:0 0 32px prevents grow/shrink
      return `
        <div class="gantt-row" style="min-width: 640px;">
          <!-- Label column: 200px strict, single-line + ellipsis -->
          <div class="gantt-row-label">
            <strong title="${item.name}">${item.name}</strong>
          </div>
          <!-- Proportional bar track -->
          <div class="gantt-track">
            <div class="gantt-bar" style="left: ${leftPct.toFixed(2)}%; width: ${Math.max(widthPct, 1).toFixed(2)}%; background: ${color}; border-left: 3px solid ${color};">
              <span class="gantt-bar-label">
                ${effectivePriority}${daysUntil <= 7 ? ' ⚠' : ''} · until ${item.dateStr}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    ganttContainer.innerHTML = `
      <div class="card gantt-card gantt-card-wrapper">
        <!-- Sticky Header & Dates Wrapper -->
        <div class="gantt-header-sticky">
          <!-- Header row -->
          <div class="gantt-header-row" style="padding: 0 4px 8px 4px; flex-shrink:0;">
            <span class="gantt-title-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
              Visual Gantt Exam Preparation Roadmap
            </span>
            <span class="gantt-subtitle-label">Proportional preparation windows · priority-decayed</span>
          </div>

          <!-- Date marker ruler — flex-shrink:0 keeps it above the scroll viewport -->
          <div class="gantt-ruler" style="min-width: 640px; padding: 0 4px 6px 4px; flex-shrink:0;">
            <div class="gantt-ruler-spacer"></div>
            <div class="gantt-ruler-ticks">
              ${markers.map(m => `<span>${m}</span>`).join('')}
            </div>
          </div>
        </div>

        <!-- Scrollable rows viewport — this is the ONLY element that scrolls -->
        <div class="gantt-scroll-body">
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
          try { currentSent = JSON.parse(localStorage.getItem('exam_reminders_sent') || '{}'); } catch (e) { }
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
          try { currentSent = JSON.parse(localStorage.getItem('exam_reminders_sent') || '{}'); } catch (e) { }
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
          warningBanner.style.display = 'flex';
          warningBanner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg" style="vertical-align: middle; margin-right: 6px; flex-shrink: 0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>Examination Admission Barred: Attendance Below 80% Bounds.</span>`;
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
          warningBanner.style.display = 'flex';
          warningBanner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg" style="vertical-align: middle; margin-right: 6px; flex-shrink: 0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>Examination Admission Barred: Attendance Below 80% Bounds.</span>`;
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

    // Re-populate dropdown filtered to the currently active semester
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
      // Store the active semester so filtering works even if subject is renamed/moved
      semester: this.activeSemester,
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
