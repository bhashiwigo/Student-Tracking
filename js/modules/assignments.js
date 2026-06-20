/**
 * Rajarata Campus Life Manager - Assignment Modules
 * Handles Assignments, Submission statuses, and Priority flags
 * UPGRADED: Visual Gantt Project Roadmap timeline
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';
import { Auth } from '../auth.js';

export const AssignmentsModule = {
  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());
  },

  bindEvents() {
    const form = document.getElementById('assignment-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveAssignment(e));
    }

    const addBtn = document.getElementById('btn-add-assignment');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('assign-subject');
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
      console.error('Load assignment subjects dropdown failed:', err);
    }
  },

  async render() {
    const container = document.getElementById('assignments-list-container');
    if (!container) return;

    try {
      const assignments = await Database.getAll('assignments');
      const subjects = await Database.getAll('subjects');
      
      // Render visual Gantt roadmap for assignments
      this.renderGantt(assignments, subjects);

      if (assignments.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No course assignments logged.
          </div>
        `;
        return;
      }

      // Sort assignments: incomplete first, then by deadline date
      const sorted = assignments.sort((a, b) => {
        if (a.status === 'Completed' && b.status !== 'Completed') return 1;
        if (a.status !== 'Completed' && b.status === 'Completed') return -1;
        const dateA = a.deadline || a.date;
        const dateB = b.deadline || b.date;
        return new Date(dateA) - new Date(dateB);
      });

      container.innerHTML = sorted.map(as => {
        const priorityClasses = {
          Low: 'low',
          Medium: 'medium',
          High: 'high'
        };
        const priorityClass = priorityClasses[as.priority] || 'low';

        const statusBadges = {
          'Pending': `<span class="badge" style="background-color: var(--border-color); color: var(--text-secondary); font-family: var(--font-family-app) !important;">${as.status}</span>`,
          'Submitted': `<span class="badge" style="background-color: var(--accent-glow); color: var(--accent); font-family: var(--font-family-app) !important;">${as.status}</span>`,
          'Completed': `<span class="badge" style="background-color: rgba(16, 185, 129, 0.15); color: var(--success); font-family: var(--font-family-app) !important;">${as.status}</span>`
        };
        const statusBadge = statusBadges[as.status] || as.status;

        const deadlineVal = as.deadline || as.date || 'N/A';
        const courseVal = as.courseId || as.subjectCode || 'N/A';
        const sub = subjects.find(s => s.code === courseVal);
        const resolvedCode = sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : courseVal;

        return `
          <div class="task-item col-12 ${as.status === 'Completed' ? 'completed' : ''}" style="display: flex; align-items: center; justify-content: space-between; gap: 16px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; align-items: center; gap: 12px; font-family: var(--font-family-app) !important;">
              <input type="checkbox" class="deadline-checkbox toggle-assign-status" data-id="${as.id}" ${as.status === 'Completed' ? 'checked' : ''} style="margin: 0; font-family: var(--font-family-app) !important;">
              <div style="font-family: var(--font-family-app) !important;">
                <h4 class="task-label" style="font-weight: 600; font-size: 0.95rem; font-family: var(--font-family-app) !important;">${resolvedCode} : ${as.title}</h4>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; font-family: var(--font-family-app) !important;">
                  Subject: ${resolvedCode} • Deadline: ${deadlineVal}
                </div>
              </div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 12px; font-family: var(--font-family-app) !important;">
              <span class="badge ${priorityClass}" style="font-family: var(--font-family-app) !important;">${as.priority} Priority</span>
              ${statusBadge}
              <div style="display: flex; gap: 4px; font-family: var(--font-family-app) !important;">
                <button class="btn-icon edit-assign-btn" data-id="${as.id}" style="width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-family: var(--font-family-app) !important;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="font-family: var(--font-family-app) !important;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon delete-assign-btn" data-id="${as.id}" style="width: 28px; height: 28px; font-size: 0.8rem; color: var(--danger); display: flex; align-items: center; justify-content: center; font-family: var(--font-family-app) !important;">✕</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Bind check-handlers to toggle status completed/pending
      container.querySelectorAll('.toggle-assign-status').forEach(chk => {
        chk.addEventListener('change', async (e) => {
          const id = chk.getAttribute('data-id');
          const isChecked = e.target.checked;
          try {
            const as = await Database.get('assignments', id);
            if (as) {
              as.status = isChecked ? 'Completed' : 'Pending';
              await Database.put('assignments', as);
              NotificationService.show('Assignment Updated', `Status set to ${as.status}.`, isChecked ? 'success' : 'info');
              this.render();
              window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
            }
          } catch (err) {
            console.error('Toggle assignment status failed:', err);
          }
        });
      });

      // Bind edits
      container.querySelectorAll('.edit-assign-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openModal(id);
        });
      });

      // Bind deletes
      container.querySelectorAll('.delete-assign-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete assignment entry?')) {
            this.handleDeleteAssignment(id);
          }
        });
      });

    } catch (err) {
      console.error('Render assignments failed:', err);
    }
  },

  renderGantt(assignments, subjects = []) {
    const ganttContainer = document.getElementById('assignments-gantt-container');
    if (!ganttContainer) return;

    if (!assignments || assignments.length === 0) {
      ganttContainer.style.display = 'none';
      return;
    }

    ganttContainer.style.display = 'block';

    const timelineData = assignments.map(as => {
      const deadlineVal = as.deadline || as.date;
      const deadline = new Date(`${deadlineVal}T23:59:59`);
      const priority = as.priority || 'Medium';
      const prepDays = priority === 'High' ? 5 : priority === 'Medium' ? 3 : 1;
      const startDate = new Date(deadline.getTime() - prepDays * 24 * 60 * 60 * 1000);
      
      const courseVal = as.courseId || as.subjectCode || 'N/A';
      const sub = subjects.find(s => s.code === courseVal);
      const resolvedCode = sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : courseVal;

      return {
        id: as.id,
        title: as.title,
        subject: resolvedCode,
        priority: priority,
        status: as.status,
        startDate: startDate,
        deadline: deadline,
        dateStr: deadlineVal
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

      let color = 'var(--accent)';
      if (item.status === 'Completed') {
        color = 'var(--success)';
      } else {
        const priorityColors = { High: 'var(--danger)', Medium: 'var(--warning)', Low: 'var(--accent)' };
        color = priorityColors[item.priority] || 'var(--accent)';
      }

      return `
        <div style="display: flex; align-items: center; gap: 12px; min-width: 600px; font-family: var(--font-family-app) !important;">
          <div style="width: 180px; flex-shrink: 0; font-size: 0.78rem; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; font-family: var(--font-family-app) !important; ${item.status === 'Completed' ? 'text-decoration: line-through; opacity: 0.5;' : ''}">
            <strong style="color: var(--text-primary); font-family: var(--font-family-app) !important;">${item.subject}</strong> - <span style="color: var(--text-secondary); font-family: var(--font-family-app) !important;">${item.title}</span>
          </div>
          <div style="flex: 1; height: 30px; background: rgba(255,255,255,0.02); border-radius: 4px; position: relative; border: 1px solid var(--border-color); font-family: var(--font-family-app) !important;">
            <div style="position: absolute; left: ${leftPct}%; width: ${widthPct}%; top: 4px; height: 20px; background: ${color}; opacity: ${item.status === 'Completed' ? 0.2 : 0.35}; border-radius: 3px; border-left: 3px solid ${color}; display: flex; align-items: center; padding: 0 6px; box-sizing: border-box; font-family: var(--font-family-app) !important;">
              <span style="font-size: 0.65rem; font-weight: 700; color: #ffffff; text-shadow: 0 1px 2px rgba(0,0,0,0.5); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--font-family-app) !important;">
                ${item.status === 'Completed' ? '✓ Completed' : `${item.priority} Prep`} (due ${item.dateStr})
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
            🗓️ Visual Gantt Assignment Roadmap
          </span>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 500; font-family: var(--font-family-app) !important;">
            Preparation timelines staggered by assignment priority and completion status
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

  async openModal(id = null) {
    const modal = document.getElementById('assignment-modal');
    const form = document.getElementById('assignment-form');
    if (!modal || !form) return;

    await this.populateSubjectsDropdown();
    form.reset();

    document.getElementById('assignment-modal-title').innerText = id ? 'Edit Assignment' : 'Add Assignment';
    document.getElementById('assignment-mode').value = id ? 'edit' : 'add';
    document.getElementById('assignment-id').value = id || '';

    if (id) {
      try {
        const as = await Database.get('assignments', id);
        if (as) {
          document.getElementById('assign-title').value = as.title || '';
          document.getElementById('assign-subject').value = as.courseId || as.subjectCode || '';
          document.getElementById('assign-date').value = as.deadline || as.date || '';
          document.getElementById('assign-priority').value = as.priority || 'Medium';
          let currentStatus = as.status || 'Pending';
          if (currentStatus === 'In Progress') currentStatus = 'Submitted';
          document.getElementById('assign-status').value = currentStatus;
        }
      } catch (err) {
        console.error('Load assignment details failed:', err);
      }
    } else {
      document.getElementById('assign-date').value = new Date().toISOString().slice(0, 10);
      document.getElementById('assign-priority').value = 'Medium';
      document.getElementById('assign-status').value = 'Pending';
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('assignment-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSaveAssignment(e) {
    e.preventDefault();
    const mode = document.getElementById('assignment-mode').value;
    const id = document.getElementById('assignment-id').value || 'as-' + Date.now();
    const title = document.getElementById('assign-title').value.trim();
    const subjectCode = document.getElementById('assign-subject').value;
    const date = document.getElementById('assign-date').value;
    const priority = document.getElementById('assign-priority').value;
    const status = document.getElementById('assign-status').value;

    if (!title || !subjectCode || !date) {
      alert('Required fields missing.');
      return;
    }

    const allowedStatuses = ['Pending', 'Submitted', 'Completed'];
    if (!allowedStatuses.includes(status)) {
      alert(`Invalid Assignment Status: must be one of ${allowedStatuses.join(', ')}`);
      return;
    }

    const userId = Auth.getCurrentUserId() || '';
    const assignmentData = {
      id,
      title,
      courseId: subjectCode,
      deadline: date,
      priority,
      status,
      userId,
      // Legacy fields for backward compatibility
      subjectCode,
      date
    };

    try {
      if (mode === 'add') {
        await Database.add('assignments', assignmentData);
        NotificationService.show('Assignment Added', `${title} logged successfully.`, 'assignment');
      } else {
        await Database.put('assignments', assignmentData);
        NotificationService.show('Assignment Updated', `${title} details updated.`, 'assignment');
      }

      this.closeModal();
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));

    } catch (err) {
      console.error('Save assignment failed:', err);
    }
  },

  async handleDeleteAssignment(id) {
    try {
      await Database.delete('assignments', id);
      NotificationService.show('Assignment Removed', 'Assignment task removed.', 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
    } catch (err) {
      console.error('Delete assignment failed:', err);
    }
  }
};
