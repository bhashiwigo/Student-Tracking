/**
 * Rajarata Campus Life Manager - Notes System Modules
 * Handles rich text subject notes logging and dynamic tag queries
 * UPGRADED: Simple Markdown parser layer & live HTML preview tabs
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

/**
 * Simple Markdown Parser Engine
 * Converts # Headers, **bold**, *italics*, `code`, > quotes, and lists into HTML
 */
function parseMarkdown(md) {
  if (!md) return '<p style="color:var(--text-muted);">No content to preview.</p>';
  
  // Escape HTML to prevent XSS
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 style="font-size:1rem; font-weight:700; color:var(--accent); margin:12px 0 6px 0;">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 style="font-size:1.15rem; font-weight:700; color:var(--accent); margin:16px 0 8px 0;">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 style="font-size:1.3rem; font-weight:800; color:var(--accent); margin:20px 0 10px 0; border-bottom:1px solid var(--border-color); padding-bottom:4px;">$1</h1>');

  // Bold (**text** or __text__)
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight:700; color:var(--text-primary);">$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong style="font-weight:700; color:var(--text-primary);">$1</strong>');

  // Italic (*text* or _text_)
  html = html.replace(/\*(.*?)\*/g, '<em style="font-style:italic;">$1</em>');
  html = html.replace(/_(.*?)_/g, '<em style="font-style:italic;">$1</em>');

  // Inline Code (`code`)
  html = html.replace(/`(.*?)`/g, '<code style="background:rgba(255,255,255,0.06); padding:2px 5px; border-radius:4px; font-family:\'JetBrains Mono\', monospace; font-size:0.82rem; color:var(--accent); border:1px solid var(--border-color);">$1</code>');

  // Blockquotes (starts with >)
  html = html.replace(/^\s*&gt;\s+(.*$)/gim, '<blockquote style="border-left:3px solid var(--accent); padding:4px 0 4px 12px; margin:10px 0; color:var(--text-secondary); background:rgba(255,255,255,0.01); font-style:italic;">$1</blockquote>');

  // Unordered Lists (unordered lists starting with - or *)
  html = html.replace(/^\s*[-\*]\s+(.*$)/gim, '<ul style="list-style-type:disc; padding-left:20px; margin:6px 0;">\n<li style="margin-bottom:3px;">$1</li>\n</ul>');
  // Combine adjacent list tags
  html = html.replace(/<\/ul>\s*<ul style="list-style-type:disc; padding-left:20px; margin:6px 0;">/g, '');

  // Line breaks
  html = html.replace(/\n/g, '<br />');

  return html;
}

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
      deleteBtn.addEventListener('click', async () => {
        if (this.activeNoteId && await window.showCustomConfirm('Delete Note', 'Delete this note permanent?', true)) {
          this.handleDeleteNote();
        }
      });
    }

    // Bind Edit/Preview tabs
    const writeTab = document.getElementById('note-tab-write');
    const previewTab = document.getElementById('note-tab-preview');
    const bodyTextarea = document.getElementById('note-body');
    const previewArea = document.getElementById('note-preview-area');

    if (writeTab && previewTab && bodyTextarea && previewArea) {
      writeTab.addEventListener('click', () => {
        writeTab.classList.add('active');
        previewTab.classList.remove('active');
        bodyTextarea.style.display = 'block';
        previewArea.style.display = 'none';
      });

      previewTab.addEventListener('click', () => {
        previewTab.classList.add('active');
        writeTab.classList.remove('active');
        bodyTextarea.style.display = 'none';
        
        // Parse markdown to HTML and show
        const parsedHtml = parseMarkdown(bodyTextarea.value);
        previewArea.innerHTML = parsedHtml;
        previewArea.style.display = 'block';
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
        const titleMatch = (n.title || '').toLowerCase().includes(searchVal);
        const bodyMatch = (n.content || '').toLowerCase().includes(searchVal);
        const subjectMatch = (n.subjectCode || '').toLowerCase().includes(searchVal);
        
        let tagMatch = false;
        if (Array.isArray(n.tags)) {
          tagMatch = n.tags.some(t => t && String(t).toLowerCase().includes(searchVal));
        } else if (typeof n.tags === 'string') {
          tagMatch = n.tags.toLowerCase().includes(searchVal);
        }
        
        return titleMatch || bodyMatch || subjectMatch || tagMatch;
      });

      if (filtered.length === 0) {
        sidebar.innerHTML = `
          <div style="color:var(--text-muted); font-size:0.75rem; text-align:center; padding:12px 0;">No notes found.</div>
        `;
        return;
      }

      sidebar.innerHTML = filtered.map(n => {
        const displayTitle = n.title ? n.title.trim() : (n.subjectCode ? n.subjectCode + ' Note' : 'Untitled Note');
        return `
          <div class="note-item-link ${n.id === this.activeNoteId ? 'active' : ''}" data-id="${n.id}">
            <div style="font-weight:600; text-overflow:ellipsis; overflow:hidden;">${displayTitle}</div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
              ${n.subjectCode ? n.subjectCode : 'General'} • ${n.date}
            </div>
          </div>
        `;
      }).join('');

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

  resetTabs() {
    const writeTab = document.getElementById('note-tab-write');
    const previewTab = document.getElementById('note-tab-preview');
    const bodyTextarea = document.getElementById('note-body');
    const previewArea = document.getElementById('note-preview-area');

    if (writeTab && previewTab && bodyTextarea && previewArea) {
      writeTab.classList.add('active');
      previewTab.classList.remove('active');
      bodyTextarea.style.display = 'block';
      previewArea.style.display = 'none';
      previewArea.innerHTML = '';
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

    this.resetTabs();
  },

  async loadNote(id) {
    this.activeNoteId = id;
    try {
      const note = await Database.get('notes', id);
      if (note) {
        document.getElementById('note-title').value = note.title || '';
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

        this.resetTabs();
      }
    } catch (err) {
      console.error('Load note error:', err);
    }
  },

  async handleSaveNote() {
    const title = document.getElementById('note-title').value.trim();
    const subjectCode = document.getElementById('note-subject-select').value;
    const content = document.getElementById('note-body').value;
    
    const tagsString = document.getElementById('note-tags').value.trim();
    const tags = tagsString ? tagsString.split(',').map(t => t.trim()) : [];

    const id = this.activeNoteId || 'note-' + Date.now();
    const date = new Date().toISOString().slice(0, 10);

    const noteData = { id, title, subjectCode, content, tags, date };

    // Instant markdown to HTML layer on save action for notification info
    const summaryHtml = parseMarkdown(content.slice(0, 150) + '...');

    try {
      if (this.activeNoteId) {
        await Database.put('notes', noteData);
        NotificationService.show('Note Saved', 'Notebook page was saved with parsed markdown structures.', 'success');
      } else {
        await Database.add('notes', noteData);
        NotificationService.show('Note Created', 'Logged a new notebook page with parsed markdown structures.', 'success');
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
