/**
 * Rajarata Campus Life Manager - Academic Resources Module
 * Handles Resource scheduling, CRUD actions, and metadata links
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';
import { Auth } from '../auth.js';

export const ResourcesModule = {
  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());
  },

  bindEvents() {
    const form = document.getElementById('resource-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveResource(e));
    }

    const addBtn = document.getElementById('btn-add-resource');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openModal());
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('resource-subject');
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
      console.error('Load resource subjects dropdown failed:', err);
    }
  },

  async render() {
    const container = document.getElementById('resources-list-container');
    if (!container) return;

    try {
      const resources = await Database.getAll('resources');
      const subjects = await Database.getAll('subjects');
      
      if (resources.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No academic resources logged. Click '+ Add Resource' to add reference links.
          </div>
        `;
        return;
      }

      // Sort by createdAt descending
      const sorted = resources.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      container.innerHTML = sorted.map(res => {
        const typeLabels = {
          'PDF Link': '📄 PDF Link',
          'Lecture Slide Link': '🛝 Lecture Slide',
          'Video Tutorial Link': '🎥 Video Tutorial',
          'Online Guide Link': '🌐 Online Guide',
          'Reference Link': '🔗 Reference Link'
        };
        const typeLabel = typeLabels[res.type] || '🔗 Link';

        const subjectCode = res.courseId;
        const sub = subjects.find(s => s.code === subjectCode);
        let resolvedCode = sub ? (sub.isSubmodule ? sub.parentSubjectCode : sub.code) : subjectCode;
        if (resolvedCode && (resolvedCode.startsWith('sub_') || resolvedCode.startsWith('SUB_'))) {
          resolvedCode = 'Unknown Course';
        }

        return `
          <div class="card col-6" id="resource-card-${res.id}" style="display: flex; flex-direction: column; gap: 14px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; font-family: var(--font-family-app) !important;">
              <div style="font-family: var(--font-family-app) !important;">
                <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px; font-family: var(--font-family-app) !important;">
                  <span class="badge" style="background-color: var(--accent-glow); color: var(--accent); font-family: var(--font-family-app) !important;">${typeLabel}</span>
                </div>
                <h3 style="font-size: 1.1rem; font-weight: 700; font-family: var(--font-family-app) !important;">${resolvedCode} : ${res.title}</h3>
                <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500; margin-top: 2px; font-family: var(--font-family-app) !important;">Course: ${resolvedCode}</h4>
              </div>
            </div>
            
            <div style="border-top: 1px solid var(--border-color); padding-top: 12px; font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-family-app) !important; display: flex; flex-direction: column; gap: 8px;">
              <div style="font-family: var(--font-family-app) !important; display: flex; align-items: center; gap: 6px; word-break: break-all;">
                <strong style="font-family: var(--font-family-app) !important;">Link URL:</strong>
                <a href="${res.url}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: underline; font-family: var(--font-family-app) !important;">
                  ${res.url}
                </a>
              </div>
              <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-family-app) !important;">
                Added: ${new Date(res.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 4px; border-top: 1px solid var(--border-color); padding-top: 12px; font-family: var(--font-family-app) !important;">
              <button class="btn-outline btn-sm edit-resource-btn" data-id="${res.id}" style="flex: 1; padding: 5px 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Edit</button>
              <button class="btn-outline btn-sm delete-resource-btn" data-id="${res.id}" style="border-color: var(--danger); color: var(--danger); padding: 5px 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Delete</button>
            </div>
          </div>
        `;
      }).join('');

      // Bind edits
      container.querySelectorAll('.edit-resource-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openModal(id);
        });
      });

      // Bind deletes
      container.querySelectorAll('.delete-resource-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete this academic resource pointer?')) {
            this.handleDeleteResource(id);
          }
        });
      });

    } catch (err) {
      console.error('Render resources failed:', err);
    }
  },

  async openModal(id = null) {
    const modal = document.getElementById('resource-modal');
    const form = document.getElementById('resource-form');
    if (!modal || !form) return;

    await this.populateSubjectsDropdown();
    form.reset();
    
    document.getElementById('resource-modal-title').innerText = id ? 'Edit Resource' : 'Add Resource';
    document.getElementById('resource-mode').value = id ? 'edit' : 'add';
    document.getElementById('resource-id').value = id || '';

    if (id) {
      try {
        const res = await Database.get('resources', id);
        if (res) {
          document.getElementById('resource-title').value = res.title || '';
          document.getElementById('resource-subject').value = res.courseId || '';
          document.getElementById('resource-type').value = res.type || 'PDF Link';
          document.getElementById('resource-url').value = res.url || '';
        }
      } catch (err) {
        console.error('Load resource details failed:', err);
      }
    }

    modal.classList.add('visible');
  },

  closeModal() {
    const modal = document.getElementById('resource-modal');
    if (modal) modal.classList.remove('visible');
  },

  async handleSaveResource(e) {
    e.preventDefault();
    const mode = document.getElementById('resource-mode').value;
    const id = document.getElementById('resource-id').value || 'res-' + Date.now();
    const title = document.getElementById('resource-title').value.trim();
    const courseId = document.getElementById('resource-subject').value;
    const type = document.getElementById('resource-type').value;
    const url = document.getElementById('resource-url').value.trim();

    if (!title || !courseId || !url) {
      alert('Required fields missing.');
      return;
    }

    const userId = Auth.getCurrentUserId() || '';
    const resourceData = {
      id,
      title,
      courseId,
      type,
      url,
      userId
    };

    try {
      if (mode === 'add') {
        resourceData.createdAt = new Date().toISOString();
        await Database.add('resources', resourceData);
        NotificationService.show('Resource Added', `${title} saved successfully.`, 'success');
      } else {
        const existing = await Database.get('resources', id) || {};
        resourceData.createdAt = existing.createdAt || new Date().toISOString();
        await Database.put('resources', resourceData);
        NotificationService.show('Resource Updated', `${title} details updated.`, 'success');
      }

      this.closeModal();
      this.render();

    } catch (err) {
      console.error('Save resource failed:', err);
    }
  },

  async handleDeleteResource(id) {
    try {
      await Database.delete('resources', id);
      NotificationService.show('Resource Removed', 'Academic resource record deleted.', 'warning');
      this.render();
    } catch (err) {
      console.error('Delete resource failed:', err);
    }
  }
};
