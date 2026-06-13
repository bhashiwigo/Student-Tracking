/**
 * Rajarata Campus Life Manager - Academic Modules
 * Handles Semester, Course Unit, and Lecturer Information
 * UPGRADED: Syllabus checkpoint arrays, completion progress rings, topic milestone tracking
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

// Default syllabus checkpoint template per standard semester topic arc
const DEFAULT_SYLLABUS_CHECKPOINTS = [
  'Introduction & Core Concepts',
  'Theoretical Framework',
  'Primary Literature Review',
  'Intermediate Concepts',
  'Applied Methods',
  'Case Studies / Lab Work',
  'Advanced Topics',
  'Revision & Integration'
];

export const AcademicModule = {
  activeSemester: '1-1', // Year-Semester

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const form = document.getElementById('subject-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveSubject(e));
    }

    const filter = document.getElementById('subject-semester-filter');
    if (filter) {
      filter.addEventListener('change', (e) => {
        this.activeSemester = e.target.value;
        this.render();
      });
    }

    const addBtn = document.getElementById('btn-add-subject');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }
  },

  /**
   * Calculate syllabus completion percentage from checkpoint array
   */
  _calcSyllabusCompletion(checkpoints) {
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) return 0;
    const done = checkpoints.filter(cp => cp.done).length;
    return Math.round((done / checkpoints.length) * 100);
  },

  /**
   * Render a mini SVG circular progress ring
   */
  _renderProgressRing(pct, size = 44) {
    const radius = (size / 2) - 5;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';

    return `
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="var(--border-color)" stroke-width="3"/>
        <circle cx="${size/2}" cy="${size/2}" r="${radius}" fill="none" stroke="${color}" stroke-width="3"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          style="transition: stroke-dashoffset 0.4s ease; stroke-linecap: round;"/>
        <text x="${size/2}" y="${size/2}" text-anchor="middle" dominant-baseline="central"
          style="transform: rotate(90deg); transform-origin: center; font-size: ${size < 40 ? '7' : '8'}px; font-weight: 700; fill: var(--text-primary);">${pct}%</text>
      </svg>
    `;
  },

  async render() {
    const container = document.getElementById('subjects-list-container');
    if (!container) return;

    try {
      const subjects = await Database.getAll('subjects');
      // Filter by active semester
      const filtered = subjects.filter(s => s.semester === this.activeSemester);

      if (filtered.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No course units logged for Semester ${this.activeSemester}.
          </div>
        `;
        return;
      }

      container.innerHTML = filtered.map(sub => {
        // Ensure syllabusCheckpoints exist on record (backward-compatible)
        const checkpoints = Array.isArray(sub.syllabusCheckpoints) && sub.syllabusCheckpoints.length > 0
          ? sub.syllabusCheckpoints
          : DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));

        const syllPct = this._calcSyllabusCompletion(checkpoints);
        const doneCount = checkpoints.filter(c => c.done).length;

        return `
          <div class="card col-4" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Header Row -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
              <div style="flex: 1;">
                <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--accent);">${sub.code}</h3>
                <h4 style="font-size: 0.9rem; font-weight: 600; margin-top: 2px; color: var(--text-primary);">${sub.name}</h4>
              </div>
              <span class="badge low" style="background-color: var(--accent-glow); color: var(--accent); white-space: nowrap;">${sub.credits} Cr</span>
            </div>

            <!-- Meta Row -->
            <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 3px;">
              <span><strong>Lecturer:</strong> ${sub.lecturer || 'Not assigned'}</span>
              <span><strong>Info:</strong> ${sub.info || 'N/A'}</span>
            </div>

            <!-- Syllabus Progress Block -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary);">Syllabus Progress</span>
                <span style="font-size: 0.72rem; color: var(--text-muted);">${doneCount}/${checkpoints.length} topics</span>
              </div>

              <!-- Progress bar -->
              <div style="height: 5px; background: var(--border-color); border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                <div style="width: ${syllPct}%; height: 100%; background: ${syllPct >= 80 ? 'var(--success)' : syllPct >= 50 ? 'var(--warning)' : 'var(--accent)'}; border-radius: 3px; transition: width 0.4s ease;"></div>
              </div>

              <!-- Checkpoint Checklist (collapsed, max 4 shown) -->
              <div class="syllabus-checkpoints" data-code="${sub.code}" style="display: flex; flex-direction: column; gap: 4px;">
                ${checkpoints.slice(0, 4).map((cp, idx) => `
                  <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.75rem; color: ${cp.done ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${cp.done ? 'line-through' : 'none'};">
                    <input type="checkbox" class="syll-check" data-code="${sub.code}" data-idx="${idx}" ${cp.done ? 'checked' : ''}
                      style="width: 12px; height: 12px; cursor: pointer; accent-color: var(--accent);">
                    ${cp.label}
                  </label>
                `).join('')}
                ${checkpoints.length > 4 ? `
                  <button class="btn-link syll-expand-btn" data-code="${sub.code}" style="font-size:0.72rem; color:var(--accent); text-align:left; padding: 2px 0; background:none; border:none; cursor:pointer;">
                    + ${checkpoints.length - 4} more topics
                  </button>
                ` : ''}
              </div>
            </div>

            <!-- Action Buttons -->
            <div style="display: flex; gap: 8px; margin-top: 2px;">
              <button class="btn-outline btn-sm edit-sub-btn" data-code="${sub.code}" style="flex: 1; padding: 5px 8px; font-size: 0.75rem;">Edit</button>
              <button class="btn-outline btn-sm delete-sub-btn" data-code="${sub.code}" style="border-color: var(--danger); color: var(--danger); padding: 5px 8px; font-size: 0.75rem;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind syllabus checkpoint toggles
      container.querySelectorAll('.syll-check').forEach(chk => {
        chk.addEventListener('change', async () => {
          const code = chk.getAttribute('data-code');
          const idx  = parseInt(chk.getAttribute('data-idx'));
          await this._toggleCheckpoint(code, idx, chk.checked);
        });
      });

      // Bind expand buttons
      container.querySelectorAll('.syll-expand-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          await this._expandCheckpoints(code, btn);
        });
      });

      // Bind edits
      container.querySelectorAll('.edit-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          this.openModal(code);
        });
      });

      // Bind deletes
      container.querySelectorAll('.delete-sub-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          if (confirm(`Delete course unit ${code}? This deletes all related marks and attendance records.`)) {
            this.handleDeleteSubject(code);
          }
        });
      });

    } catch (err) {
      console.error('Render subjects failed:', err);
    }
  },

  async _toggleCheckpoint(code, idx, checked) {
    try {
      const sub = await Database.get('subjects', code);
      if (!sub) return;

      if (!Array.isArray(sub.syllabusCheckpoints) || sub.syllabusCheckpoints.length === 0) {
        sub.syllabusCheckpoints = DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
      }

      if (sub.syllabusCheckpoints[idx]) {
        sub.syllabusCheckpoints[idx].done = checked;
      }

      await Database.put('subjects', sub);

      // Check if all done → congratulate
      const allDone = sub.syllabusCheckpoints.every(c => c.done);
      if (allDone) {
        NotificationService.show('Syllabus Complete!', `All topics covered for ${code}. Excellent work!`, 'success');
      }

      this.render();
    } catch (err) {
      console.error('Toggle syllabus checkpoint failed:', err);
    }
  },

  async _expandCheckpoints(code, btn) {
    try {
      const sub = await Database.get('subjects', code);
      if (!sub) return;

      const checkpoints = Array.isArray(sub.syllabusCheckpoints) && sub.syllabusCheckpoints.length > 0
        ? sub.syllabusCheckpoints
        : DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));

      const container = btn.closest('.syllabus-checkpoints');
      if (!container) return;

      const remaining = checkpoints.slice(4);
      const fragment = remaining.map((cp, relIdx) => {
        const idx = relIdx + 4;
        return `
          <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.75rem; color: ${cp.done ? 'var(--text-muted)' : 'var(--text-primary)'}; text-decoration: ${cp.done ? 'line-through' : 'none'};">
            <input type="checkbox" class="syll-check" data-code="${code}" data-idx="${idx}" ${cp.done ? 'checked' : ''}
              style="width: 12px; height: 12px; cursor: pointer; accent-color: var(--accent);">
            ${cp.label}
          </label>
        `;
      }).join('');

      btn.insertAdjacentHTML('beforebegin', fragment);
      btn.remove();

      // Re-bind newly inserted checkboxes
      container.querySelectorAll('.syll-check').forEach(chk => {
        chk.addEventListener('change', async () => {
          const c = chk.getAttribute('data-code');
          const i = parseInt(chk.getAttribute('data-idx'));
          await this._toggleCheckpoint(c, i, chk.checked);
        });
      });
    } catch (err) {
      console.error('Expand checkpoints failed:', err);
    }
  },

  async openModal(code = null) {
    const modal = document.getElementById('subject-modal');
    const form  = document.getElementById('subject-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('subject-modal-title').innerText = code ? 'Edit Course Unit' : 'New Course Unit';
    document.getElementById('subject-mode').value = code ? 'edit' : 'add';

    const codeInput = document.getElementById('sub-code');
    if (code) {
      codeInput.setAttribute('readonly', 'true');
      try {
        const sub = await Database.get('subjects', code);
        if (sub) {
          codeInput.value = sub.code;
          document.getElementById('sub-name').value    = sub.name;
          document.getElementById('sub-credits').value = sub.credits;
          document.getElementById('sub-semester').value = sub.semester;
          document.getElementById('sub-lecturer').value = sub.lecturer || '';
          document.getElementById('sub-info').value     = sub.info || '';
          document.getElementById('sub-theory-weight').value    = sub.theoryWeight    !== undefined ? sub.theoryWeight    : 70;
          document.getElementById('sub-practical-weight').value = sub.practicalWeight !== undefined ? sub.practicalWeight : 30;
          document.getElementById('sub-ca-marks').value   = (sub.internalMarks && sub.internalMarks.ca)   !== undefined ? sub.internalMarks.ca   : 80;
          document.getElementById('sub-quiz-marks').value = (sub.internalMarks && sub.internalMarks.quiz) !== undefined ? sub.internalMarks.quiz : 80;
          document.getElementById('sub-lab-marks').value  = (sub.internalMarks && sub.internalMarks.lab)  !== undefined ? sub.internalMarks.lab  : 80;
        }
      } catch (err) {
        console.error('Load subject details failed:', err);
      }
    } else {
      codeInput.removeAttribute('readonly');
      document.getElementById('sub-semester').value         = this.activeSemester;
      document.getElementById('sub-theory-weight').value    = 70;
      document.getElementById('sub-practical-weight').value = 30;
      document.getElementById('sub-ca-marks').value         = 80;
      document.getElementById('sub-quiz-marks').value       = 80;
      document.getElementById('sub-lab-marks').value        = 80;
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('subject-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSaveSubject(e) {
    e.preventDefault();
    const mode     = document.getElementById('subject-mode').value;
    const code     = document.getElementById('sub-code').value.trim().toUpperCase();
    const name     = document.getElementById('sub-name').value.trim();
    const credits  = parseInt(document.getElementById('sub-credits').value);
    const semester = document.getElementById('sub-semester').value;
    const lecturer = document.getElementById('sub-lecturer').value.trim();
    const info     = document.getElementById('sub-info').value.trim();
    const theoryWeight    = parseFloat(document.getElementById('sub-theory-weight').value)    || 70;
    const practicalWeight = parseFloat(document.getElementById('sub-practical-weight').value) || 30;
    const caMarks   = parseFloat(document.getElementById('sub-ca-marks').value)   || 0;
    const quizMarks = parseFloat(document.getElementById('sub-quiz-marks').value) || 0;
    const labMarks  = parseFloat(document.getElementById('sub-lab-marks').value)  || 0;

    if (!code || !name) {
      alert('Code and Name are required.');
      return;
    }

    const subjectData = {
      code,
      name,
      credits,
      semester,
      lecturer,
      info,
      theoryWeight,
      practicalWeight,
      internalMarks: { ca: caMarks, quiz: quizMarks, lab: labMarks }
    };

    try {
      if (mode === 'add') {
        const existing = await Database.get('subjects', code);
        if (existing) {
          alert(`Subject code ${code} already exists.`);
          return;
        }
        // Inject default syllabus checkpoint array on creation
        subjectData.syllabusCheckpoints = DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));

        await Database.add('subjects', subjectData);

        // Add related attendance record skeleton
        const attRecord = {
          subjectCode: code,
          lecturesAttended: 0,
          lecturesTotal: 30,
          practicalsAttended: 0,
          practicalsTotal: 10
        };
        await Database.add('attendance', attRecord);
        NotificationService.show('Course Unit Added', `${code} was successfully created with ${DEFAULT_SYLLABUS_CHECKPOINTS.length} syllabus checkpoints.`, 'success');
      } else {
        const existing = await Database.get('subjects', code) || {};
        // Preserve existing syllabusCheckpoints if already set
        if (!subjectData.syllabusCheckpoints) {
          subjectData.syllabusCheckpoints = existing.syllabusCheckpoints ||
            DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
        }
        const updatedData = { ...existing, ...subjectData };
        await Database.put('subjects', updatedData);
        NotificationService.show('Course Unit Updated', `${code} was successfully saved.`, 'success');
      }

      this.closeModal();
      this.render();

      const updateEvent = new CustomEvent('subjectsUpdated');
      window.dispatchEvent(updateEvent);

    } catch (err) {
      console.error('Save subject failed:', err);
      alert('Could not save subject data.');
    }
  },

  async handleDeleteSubject(code) {
    try {
      await Database.delete('subjects', code);
      await Database.delete('attendance', code);
      NotificationService.show('Course Unit Deleted', `${code} has been removed.`, 'warning');
      this.render();

      const updateEvent = new CustomEvent('subjectsUpdated');
      window.dispatchEvent(updateEvent);
    } catch (err) {
      console.error('Delete subject failed:', err);
    }
  }
};
