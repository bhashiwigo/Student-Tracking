/**
 * Rajarata Campus Life Manager - Notes System Modules
 * Handles rich text subject notes logging and dynamic tag queries
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const NotesModule = {
  activeNoteId: null,

  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.populateSubjectsDropdown());
  },

  bindEvents() {
    const searchInput = document.getElementById('note-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.renderList());
    }

    const saveBtn = document.getElementById('btn-save-note');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.handleSaveNote());
    }

    const newBtn = document.getElementById('btn-new-note');
    if (newBtn) {
      newBtn.addEventListener('click', () => this.initNewNote());
    }

    const deleteBtn = document.getElementById('btn-delete-note');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (this.activeNoteId && confirm('Delete this note permanent?')) {
          this.handleDeleteNote();
        }
      });
    }
  },

  async populateSubjectsDropdown() {
    const dropdown = document.getElementById('note-subject-select');
    if (!dropdown) return;

    try {
      const subjects = await Database.getAll('subjects');
      dropdown.innerHTML = `
        <option value="">No Course Unit Tag</option>
        ${subjects.map(s => `<option value="${s.code}">${s.code} - ${s.name}</option>`).join('')}
      `;
    } catch (err) {
      console.error('Load note subjects failed:', err);
    }
  },

  async render() {
    await this.populateSubjectsDropdown();
    this.renderList();
    this.initNewNote();
  },

  async renderList() {
    const sidebar = document.getElementById('notes-sidebar-list');
    const searchVal = document.getElementById('note-search')?.value.toLowerCase() || '';
    if (!sidebar) return;

    try {
      const notes = await Database.getAll('notes');
      
      const filtered = notes.filter(n => {
        const titleMatch = n.title.toLowerCase().includes(searchVal);
        const bodyMatch = n.content?.toLowerCase().includes(searchVal);
        const tagMatch = n.tags?.some(t => t.toLowerCase().includes(searchVal));
        return titleMatch || bodyMatch || tagMatch;
      });

      if (filtered.length === 0) {
        sidebar.innerHTML = `
          <div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:12px 0;">No notes found.</div>
        `;
        return;
      }

      sidebar.innerHTML = filtered.map(n => `
        <div class="note-item-link ${n.id === this.activeNoteId ? 'active' : ''}" data-id="${n.id}">
          <div style="font-weight:600; text-overflow:ellipsis; overflow:hidden;">${n.title || 'Untitled Note'}</div>
          <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
            ${n.subjectCode ? n.subjectCode : 'General'} • ${n.date}
          </div>
        </div>
      `).join('');

      // Bind select triggers
      sidebar.querySelectorAll('.note-item-link').forEach(link => {
        link.addEventListener('click', () => {
          const id = link.getAttribute('data-id');
          this.loadNote(id);
        });
      });

    } catch (err) {
      console.error('Notes list load failed:', err);
    }
  },

  initNewNote() {
    this.activeNoteId = null;
    document.getElementById('note-title').value = '';
    document.getElementById('note-subject-select').value = '';
    document.getElementById('note-body').value = '';
    document.getElementById('note-tags').value = '';
    
    const deleteBtn = document.getElementById('btn-delete-note');
    if (deleteBtn) deleteBtn.style.display = 'none';

    // Deselect sidebar items
    document.querySelectorAll('.note-item-link').forEach(link => link.classList.remove('active'));
  },

  async loadNote(id) {
    this.activeNoteId = id;
    try {
      const note = await Database.get('notes', id);
      if (note) {
        document.getElementById('note-title').value = note.title;
        document.getElementById('note-subject-select').value = note.subjectCode || '';
        document.getElementById('note-body').value = note.content || '';
        document.getElementById('note-tags').value = note.tags ? note.tags.join(', ') : '';

        const deleteBtn = document.getElementById('btn-delete-note');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        // Set active sidebar element
        document.querySelectorAll('.note-item-link').forEach(link => {
          const linkId = link.getAttribute('data-id');
          link.classList.toggle('active', linkId === id);
        });
      }
    } catch (err) {
      console.error('Load note error:', err);
    }
  },

  async handleSaveNote() {
    const title = document.getElementById('note-title').value.trim() || 'Untitled Note';
    const subjectCode = document.getElementById('note-subject-select').value;
    const content = document.getElementById('note-body').value;
    
    const tagsString = document.getElementById('note-tags').value.trim();
    const tags = tagsString ? tagsString.split(',').map(t => t.trim()) : [];

    const id = this.activeNoteId || 'note-' + Date.now();
    const date = new Date().toISOString().slice(0, 10);

    const noteData = { id, title, subjectCode, content, tags, date };

    try {
      if (this.activeNoteId) {
        await Database.put('notes', noteData);
        NotificationService.show('Note Saved', 'Notebook page was saved.', 'success');
      } else {
        await Database.add('notes', noteData);
        NotificationService.show('Note Created', 'Logged a new notebook page.', 'success');
        this.activeNoteId = id;
      }

      this.renderList();
      this.loadNote(id);
    } catch (err) {
      console.error('Save note failed:', err);
    }
  },

  async handleDeleteNote() {
    try {
      await Database.delete('notes', this.activeNoteId);
      NotificationService.show('Note Deleted', 'Note page was removed.', 'warning');
      this.initNewNote();
      this.renderList();
    } catch (err) {
      console.error('Delete note failed:', err);
    }
  }
};
