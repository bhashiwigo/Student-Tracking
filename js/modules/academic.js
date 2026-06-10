/**
 * Rajarata Campus Life Manager - Academic Modules
 * Handles Semester, Course Unit, and Lecturer Information
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

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

      container.innerHTML = filtered.map(sub => `
        <div class="card col-4">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--accent);">${sub.code}</h3>
              <h4 style="font-size: 0.95rem; font-weight: 600; margin-top: 2px;">${sub.name}</h4>
            </div>
            <span class="badge low" style="background-color: var(--accent-glow); color: var(--accent);">${sub.credits} Credits</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 4px;">
            <span><strong>Lecturer:</strong> ${sub.lecturer || 'Not assigned'}</span>
            <span><strong>Syllabus/Info:</strong> ${sub.info || 'N/A'}</span>
          </div>
          <div style="display: flex; gap: 10px; margin-top: 10px;">
            <button class="btn-outline btn-sm edit-sub-btn" data-code="${sub.code}" style="flex: 1; padding: 4px 8px; font-size: 0.75rem;">Edit</button>
            <button class="btn-outline btn-sm delete-sub-btn" data-code="${sub.code}" style="border-color: var(--danger); color: var(--danger); padding: 4px 8px; font-size: 0.75rem;">Delete</button>
          </div>
        </div>
      `).join('');

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

  async openModal(code = null) {
    const modal = document.getElementById('subject-modal');
    const form = document.getElementById('subject-form');
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
          document.getElementById('sub-name').value = sub.name;
          document.getElementById('sub-credits').value = sub.credits;
          document.getElementById('sub-semester').value = sub.semester;
          document.getElementById('sub-lecturer').value = sub.lecturer || '';
          document.getElementById('sub-info').value = sub.info || '';
          document.getElementById('sub-theory-weight').value = sub.theoryWeight !== undefined ? sub.theoryWeight : 70;
          document.getElementById('sub-practical-weight').value = sub.practicalWeight !== undefined ? sub.practicalWeight : 30;
          document.getElementById('sub-ca-marks').value = (sub.internalMarks && sub.internalMarks.ca) !== undefined ? sub.internalMarks.ca : 80;
          document.getElementById('sub-quiz-marks').value = (sub.internalMarks && sub.internalMarks.quiz) !== undefined ? sub.internalMarks.quiz : 80;
          document.getElementById('sub-lab-marks').value = (sub.internalMarks && sub.internalMarks.lab) !== undefined ? sub.internalMarks.lab : 80;
        }
      } catch (err) {
        console.error('Load subject details failed:', err);
      }
    } else {
      codeInput.removeAttribute('readonly');
      document.getElementById('sub-semester').value = this.activeSemester;
      document.getElementById('sub-theory-weight').value = 70;
      document.getElementById('sub-practical-weight').value = 30;
      document.getElementById('sub-ca-marks').value = 80;
      document.getElementById('sub-quiz-marks').value = 80;
      document.getElementById('sub-lab-marks').value = 80;
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('subject-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSaveSubject(e) {
    e.preventDefault();
    const mode = document.getElementById('subject-mode').value;
    const code = document.getElementById('sub-code').value.trim().toUpperCase();
    const name = document.getElementById('sub-name').value.trim();
    const credits = parseInt(document.getElementById('sub-credits').value);
    const semester = document.getElementById('sub-semester').value;
    const lecturer = document.getElementById('sub-lecturer').value.trim();
    const info = document.getElementById('sub-info').value.trim();
    const theoryWeight = parseFloat(document.getElementById('sub-theory-weight').value) || 70;
    const practicalWeight = parseFloat(document.getElementById('sub-practical-weight').value) || 30;
    const caMarks = parseFloat(document.getElementById('sub-ca-marks').value) || 0;
    const quizMarks = parseFloat(document.getElementById('sub-quiz-marks').value) || 0;
    const labMarks = parseFloat(document.getElementById('sub-lab-marks').value) || 0;

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
        // Confirm uniqueness
        const existing = await Database.get('subjects', code);
        if (existing) {
          alert(`Subject code ${code} already exists.`);
          return;
        }
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
        NotificationService.show('Course Unit Added', `${code} was successfully created.`, 'success');
      } else {
        const existing = await Database.get('subjects', code) || {};
        const updatedData = {
          ...existing,
          ...subjectData
        };
        await Database.put('subjects', updatedData);
        NotificationService.show('Course Unit Updated', `${code} was successfully saved.`, 'success');
      }

      this.closeModal();
      this.render();
      
      // Update other dynamic dropdown references
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
