/**
 * Rajarata Campus Life Manager - Research Project & Tasks Dashboard
 * Coordinates tracking of thesis projects, custom headings, and milestone sub-tasks
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

const DEFAULT_HEADINGS = [
  "Common Project 1",
  "Lamarck Project",
  "Research Project 2",
  "Research Project"
];

export const ResearchModule = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const projectForm = document.getElementById('research-project-form');
    if (projectForm) {
      projectForm.addEventListener('submit', (e) => this.handleSaveDetails(e));
    }

    const headingsForm = document.getElementById('research-headings-form');
    if (headingsForm) {
      headingsForm.addEventListener('submit', (e) => this.handleSaveHeadings(e));
    }

    const taskForm = document.getElementById('research-task-form');
    if (taskForm) {
      taskForm.addEventListener('submit', (e) => this.handleSaveTask(e));
    }
  },

  async render() {
    const titleInput = document.getElementById('research-title');
    const supervisorInput = document.getElementById('research-supervisor');
    
    const h1Input = document.getElementById('research-heading-1');
    const h2Input = document.getElementById('research-heading-2');
    const h3Input = document.getElementById('research-heading-3');
    const h4Input = document.getElementById('research-heading-4');
    
    const taskHeadingSelect = document.getElementById('research-task-heading');

    try {
      // 1. Fetch or scaffold headings configuration from researchConfig
      let config = await Database.get('researchConfig', 'headingsConfig');
      if (!config) {
        config = {
          id: 'headingsConfig',
          headings: [...DEFAULT_HEADINGS]
        };
        await Database.add('researchConfig', config);
      }
      const headings = config.headings || DEFAULT_HEADINGS;

      // Populate Headings inputs
      if (h1Input) h1Input.value = headings[0] || '';
      if (h2Input) h2Input.value = headings[1] || '';
      if (h3Input) h3Input.value = headings[2] || '';
      if (h4Input) h4Input.value = headings[3] || '';

      // Populate Task Category dropdown select
      if (taskHeadingSelect) {
        taskHeadingSelect.innerHTML = headings.map(h => `
          <option value="${h}">${h}</option>
        `).join('');
      }

      // 2. Fetch or scaffold project details from researchProject
      let projectDetails = await Database.get('researchProject', 'project1');
      if (!projectDetails) {
        projectDetails = {
          id: 'project1',
          title: '',
          supervisor: ''
        };
        await Database.add('researchProject', projectDetails);
      }

      // Populate input text elements
      if (titleInput) titleInput.value = projectDetails.title || '';
      if (supervisorInput) supervisorInput.value = projectDetails.supervisor || '';

      // 3. Render the Workspace tracking dashboard grid columns
      await this.renderDashboard(headings);

    } catch (err) {
      console.error('Render research project view failed:', err);
    }
  },

  async renderDashboard(headings) {
    const listH1 = document.getElementById('list-h1');
    const listH2 = document.getElementById('list-h2');
    const listH3 = document.getElementById('list-h3');
    const listH4 = document.getElementById('list-h4');

    const titleH1 = document.getElementById('title-h1');
    const titleH2 = document.getElementById('title-h2');
    const titleH3 = document.getElementById('title-h3');
    const titleH4 = document.getElementById('title-h4');

    if (!listH1 || !listH2 || !listH3 || !listH4) return;

    // Set column headings titles
    if (titleH1) titleH1.innerText = headings[0];
    if (titleH2) titleH2.innerText = headings[1];
    if (titleH3) titleH3.innerText = headings[2];
    if (titleH4) titleH4.innerText = headings[3];

    // Clear column contents
    listH1.innerHTML = '';
    listH2.innerHTML = '';
    listH3.innerHTML = '';
    listH4.innerHTML = '';

    try {
      // Fetch all tasks (exclude the details record 'project1')
      const allRecords = await Database.getAll('researchProject');
      const tasks = allRecords.filter(r => r.id !== 'project1');

      tasks.forEach(task => {
        const completed = task.completed === true;
        const taskCard = `
          <div class="card" style="padding: 12px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 8px; box-shadow: var(--shadow-sm);">
            <div>
              <span class="badge" style="background: #000000; color: #ffffff; border: 1px solid rgba(255,255,255,0.25); font-size: 0.65rem; font-weight: 800; display: inline-block; padding: 2px 6px; border-radius: 4px; margin-bottom: 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Cat: ${task.heading}</span>
              <h4 style="font-size: 0.85rem; font-weight: 800; color: var(--text-primary); margin: 0; line-height: 1.3;">${task.title}</h4>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="background: #000000; color: #ffffff; border: 1px solid rgba(255,255,255,0.15); font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; width: fit-content;">Due: ${task.dueDate}</span>
              <span style="background: #000000; color: #ffffff; border: 1px solid rgba(255,255,255,0.15); font-size: 0.68rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: inline-block; width: fit-content; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Supervisor: ${task.supervisor}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; gap: 8px;">
              <label style="display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 0.72rem; color: ${completed ? 'var(--text-muted)' : 'var(--text-primary)'}; font-weight: 700; user-select: none; margin: 0;">
                <input type="checkbox" class="toggle-task-status" data-id="${task.id}" ${completed ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent); margin: 0;">
                ${completed ? 'Completed' : 'Pending'}
              </label>
              <button type="button" class="btn-outline btn-sm delete-task-btn" data-id="${task.id}" style="background: rgba(30, 30, 30, 0.85); border-color: rgba(255,255,255,0.15); color: #ffffff; font-size: 0.65rem; padding: 4px 8px; border-radius: 4px; border: 1px solid; cursor: pointer; font-weight: 700;">Delete Task</button>
            </div>
          </div>
        `;

        if (task.heading === headings[0]) {
          listH1.insertAdjacentHTML('beforeend', taskCard);
        } else if (task.heading === headings[1]) {
          listH2.insertAdjacentHTML('beforeend', taskCard);
        } else if (task.heading === headings[2]) {
          listH3.insertAdjacentHTML('beforeend', taskCard);
        } else if (task.heading === headings[3]) {
          listH4.insertAdjacentHTML('beforeend', taskCard);
        }
      });

      // Bind status switches
      document.querySelectorAll('.toggle-task-status').forEach(chk => {
        chk.addEventListener('change', async () => {
          const id = chk.getAttribute('data-id');
          const isChecked = chk.checked;
          
          try {
            const task = await Database.get('researchProject', id);
            if (task) {
              task.completed = isChecked;
              await Database.put('researchProject', task);
              NotificationService.show('Task Updated', `Task status marked as ${isChecked ? 'Completed' : 'Pending'}.`, 'success');
              
              await this.render();
              window.dispatchEvent(new CustomEvent('subjectsUpdated'));
            }
          } catch (err) {
            console.error('Failed to toggle task status:', err);
          }
        });
      });

      // Bind deletes
      document.querySelectorAll('.delete-task-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Delete this research sub-task?')) {
            try {
              await Database.delete('researchProject', id);
              NotificationService.show('Task Deleted', 'Research sub-task removed.', 'warning');
              
              await this.render();
              window.dispatchEvent(new CustomEvent('subjectsUpdated'));
            } catch (err) {
              console.error('Failed to delete task:', err);
            }
          }
        });
      });

    } catch (err) {
      console.error('Load dashboard tasks failed:', err);
    }
  },

  async handleSaveDetails(e) {
    e.preventDefault();
    const title = document.getElementById('research-title').value.trim();
    const supervisor = document.getElementById('research-supervisor').value.trim();

    try {
      const project = await Database.get('researchProject', 'project1') || { id: 'project1' };
      project.title = title;
      project.supervisor = supervisor;
      
      await Database.put('researchProject', project);
      NotificationService.show('Project Details Saved', 'Research project details successfully updated.', 'success');
      
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      this.render();
    } catch (err) {
      console.error('Save research project details failed:', err);
      alert('Could not save details.');
    }
  },

  async handleSaveHeadings(e) {
    e.preventDefault();
    const h1 = document.getElementById('research-heading-1').value.trim();
    const h2 = document.getElementById('research-heading-2').value.trim();
    const h3 = document.getElementById('research-heading-3').value.trim();
    const h4 = document.getElementById('research-heading-4').value.trim();

    if (!h1 || !h2 || !h3 || !h4) {
      alert('All headings are required.');
      return;
    }

    try {
      const config = {
        id: 'headingsConfig',
        headings: [h1, h2, h3, h4]
      };
      await Database.put('researchConfig', config);
      NotificationService.show('Headings Configured', 'Roadmap flow headings successfully customized.', 'success');
      
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      this.render();
    } catch (err) {
      console.error('Save headings failed:', err);
      alert('Could not save headings.');
    }
  },

  async handleSaveTask(e) {
    e.preventDefault();
    const heading = document.getElementById('research-task-heading').value;
    const title = document.getElementById('research-task-title').value.trim();
    const dueDate = document.getElementById('research-task-date').value;
    const supervisor = document.getElementById('research-task-supervisor').value.trim();

    if (!heading || !title || !dueDate || !supervisor) {
      alert('Required task fields missing.');
      return;
    }

    const taskId = 'task-' + Date.now();
    const taskData = {
      id: taskId,
      heading,
      title,
      dueDate,
      supervisor,
      completed: false
    };

    try {
      await Database.add('researchProject', taskData);
      NotificationService.show('Task Created', `"${title}" added under milestone category.`, 'success');
      
      document.getElementById('research-task-form').reset();
      
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      this.render();
    } catch (err) {
      console.error('Create research task failed:', err);
      alert('Could not create sub-task.');
    }
  }
};
