/**
 * Rajarata Campus Life Manager - Academic Modules
 * Handles Semester, Course Unit, and Lecturer Information
 * UPGRADED: Syllabus checkpoint arrays, completion progress rings, topic milestone tracking
 * DECOUPLED: Decouples parent Subject metadata from child Sub-Module operational parameters
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';
import { GPAModule } from './gpa.js';

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

// ── Database overrides for decoupling subjects and sub-modules ────────────────
const originalGetAll = Database.getAll;
const originalGet = Database.get;
const originalPut = Database.put;
const originalAdd = Database.add;
const originalDelete = Database.delete;

Database.getAll = function(storeName) {
  const stack = new Error().stack || '';
  const isSync = stack.includes('firestore-sync.js') || stack.includes('backup.js') || stack.includes('db.js');
  
  if (storeName === 'subjects-raw') {
    return originalGetAll.call(Database, 'subjects');
  }
  
  if ((storeName === 'subjects' || storeName === 'researchProject/modules') && !isSync) {
    return originalGetAll.call(Database, 'subjects').then(records => {
      const submodules = [];
      (records || []).forEach(parent => {
        if (parent.isParent && Array.isArray(parent.submodules)) {
          parent.submodules.forEach(sub => {
            submodules.push({
              code: sub.id,
              id: sub.id,
              name: sub.moduleTitle,
              moduleTitle: sub.moduleTitle,
              credits: sub.credits,
              semester: sub.semester,
              lecturer: sub.lecturerName,
              info: sub.lecturerContact,
              theoryWeight: sub.theoryWeight,
              practicalWeight: sub.practicalWeight,
              grade: sub.grade || '',
              internalMarks: sub.internalMarks || { ca: 0, quiz: 0, lab: 0 },
              syllabusCheckpoints: sub.syllabusCheckpoints || [],
              parentSubjectCode: parent.code,
              isSubmodule: true,
              userId: parent.userId || '',
              targetGrade: sub.targetGrade || ''
            });
          });
        } else if (!parent.isParent) {
          submodules.push(parent);
        }
      });
      return submodules;
    });
  }
  return originalGetAll.call(Database, storeName);
};

Database.get = function(storeName, key) {
  const stack = new Error().stack || '';
  const isSync = stack.includes('firestore-sync.js') || stack.includes('backup.js') || stack.includes('db.js');
  
  if (storeName === 'subjects-raw') {
    return originalGet.call(Database, 'subjects', key);
  }
  
  if ((storeName === 'subjects' || storeName === 'researchProject/modules') && !isSync) {
    if (typeof key === 'string' && key.startsWith('sub_')) {
      return originalGetAll.call(Database, 'subjects').then(records => {
        let found = null;
        (records || []).forEach(parent => {
          if (parent.isParent && Array.isArray(parent.submodules)) {
            const sub = parent.submodules.find(s => s.id === key);
            if (sub) {
              found = {
                code: sub.id,
                id: sub.id,
                name: sub.moduleTitle,
                moduleTitle: sub.moduleTitle,
                credits: sub.credits,
                semester: sub.semester,
                lecturer: sub.lecturerName,
                info: sub.lecturerContact,
                theoryWeight: sub.theoryWeight,
                practicalWeight: sub.practicalWeight,
                grade: sub.grade || '',
                internalMarks: sub.internalMarks || { ca: 0, quiz: 0, lab: 0 },
                syllabusCheckpoints: sub.syllabusCheckpoints || [],
                parentSubjectCode: parent.code,
                isSubmodule: true,
                userId: parent.userId || '',
                targetGrade: sub.targetGrade || ''
              };
            }
          }
        });
        return found;
      });
    }
  }
  return originalGet.call(Database, storeName, key);
};

Database.put = function(storeName, value) {
  if (storeName === 'subjects') {
    if (value.isParent || !value.parentSubjectCode) {
      return originalPut.call(Database, 'subjects', value);
    } else {
      const parentCode = value.parentSubjectCode;
      return originalGet.call(Database, 'subjects', parentCode).then(parent => {
        if (!parent) return originalPut.call(Database, 'subjects', value);
        if (!Array.isArray(parent.submodules)) parent.submodules = [];
        
        const idx = parent.submodules.findIndex(s => s.id === value.id);
        const subPayload = {
          id: value.id,
          moduleTitle: value.name || value.moduleTitle,
          credits: value.credits,
          semester: value.semester,
          lecturerName: value.lecturer || value.lecturerName,
          lecturerContact: value.info || value.lecturerContact,
          theoryWeight: value.theoryWeight,
          practicalWeight: value.practicalWeight,
          grade: value.grade,
          internalMarks: value.internalMarks,
          syllabusCheckpoints: value.syllabusCheckpoints,
          targetGrade: value.targetGrade
        };
        
        if (idx !== -1) {
          parent.submodules[idx] = subPayload;
        } else {
          parent.submodules.push(subPayload);
        }
        return originalPut.call(Database, 'subjects', parent);
      });
    }
  }
  return originalPut.call(Database, storeName, value);
};

Database.add = function(storeName, value) {
  if (storeName === 'subjects') {
    if (value.isParent || !value.parentSubjectCode) {
      return originalAdd.call(Database, 'subjects', value);
    } else {
      const parentCode = value.parentSubjectCode;
      return originalGet.call(Database, 'subjects', parentCode).then(parent => {
        if (!parent) return originalAdd.call(Database, 'subjects', value);
        if (!Array.isArray(parent.submodules)) parent.submodules = [];
        
        const subPayload = {
          id: value.id,
          moduleTitle: value.name || value.moduleTitle,
          credits: value.credits,
          semester: value.semester,
          lecturerName: value.lecturer || value.lecturerName,
          lecturerContact: value.info || value.lecturerContact,
          theoryWeight: value.theoryWeight,
          practicalWeight: value.practicalWeight,
          grade: value.grade || '',
          internalMarks: value.internalMarks || { ca: 0, quiz: 0, lab: 0 },
          syllabusCheckpoints: value.syllabusCheckpoints || [],
          targetGrade: value.targetGrade || ''
        };
        
        parent.submodules.push(subPayload);
        return originalPut.call(Database, 'subjects', parent);
      });
    }
  }
  return originalAdd.call(Database, storeName, value);
};

Database.delete = function(storeName, key) {
  if (storeName === 'subjects') {
    if (typeof key === 'string' && key.startsWith('sub_')) {
      return originalGetAll.call(Database, 'subjects').then(records => {
        let targetParent = null;
        (records || []).forEach(parent => {
          if (parent.isParent && Array.isArray(parent.submodules)) {
            const idx = parent.submodules.findIndex(s => s.id === key);
            if (idx !== -1) {
              parent.submodules.splice(idx, 1);
              targetParent = parent;
            }
          }
        });
        if (targetParent) {
          return originalPut.call(Database, 'subjects', targetParent);
        }
      });
    }
  }
  return originalDelete.call(Database, storeName, key);
};

// ── AcademicModule Definition ──────────────────────────────────────────────────
export const AcademicModule = {
  activeSemester: '1-1',

  init() {
    this.bindEvents();
  },

  bindEvents() {
    const subForm = document.getElementById('subject-form');
    if (subForm) {
      subForm.addEventListener('submit', (e) => this.handleSaveSubject(e));
    }

    const subModuleForm = document.getElementById('sub-module-form');
    if (subModuleForm) {
      subModuleForm.addEventListener('submit', (e) => this.handleSaveSubModule(e));
    }

    const filter = document.getElementById('subject-semester-filter');
    if (filter) {
      filter.addEventListener('change', (e) => {
        this.activeSemester = e.target.value;
        this.render();
      });
    }

    const addMainBtn = document.getElementById('btn-add-main-subject');
    if (addMainBtn) {
      addMainBtn.addEventListener('click', () => this.openModal());
    }

    const addSubBtn = document.getElementById('btn-add-sub-module');
    if (addSubBtn) {
      addSubBtn.addEventListener('click', () => this.openSubModuleModal());
    }

    const shortcutBtn = document.getElementById('btn-shortcut-add-subject');
    if (shortcutBtn) {
      shortcutBtn.addEventListener('click', () => {
        this.openModal();
      });
    }

    window.addEventListener('subjectsUpdated', async (e) => {
      const subModuleModal = document.getElementById('sub-module-modal');
      if (subModuleModal && subModuleModal.classList.contains('visible')) {
        const selectCode = e.detail?.code || null;
        await this.refreshParentSubjectSelect(selectCode);
      }
      this.render();
    });
  },

  _calcSyllabusCompletion(checkpoints) {
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) return 0;
    const done = checkpoints.filter(cp => cp.done).length;
    return Math.round((done / checkpoints.length) * 100);
  },

  async _getGPADetails() {
    try {
      const submodules = await Database.getAll('subjects');
      const gradeMap = (GPAModule && GPAModule.gradeMap) || {
        'A+': 4.00, 'A': 4.00, 'A-': 3.70,
        'B+': 3.30, 'B': 3.00, 'B-': 2.70,
        'C+': 2.30, 'C': 2.00, 'C-': 1.70,
        'D+': 1.30, 'D': 1.00, 'E': 0.00
      };
      
      let overallCredits = 0;
      let overallGP = 0;
      let threeYearCredits = 0;
      let threeYearGP = 0;
      
      (submodules || []).forEach(sub => {
        if (sub.grade) {
          const gp = gradeMap[sub.grade] !== undefined ? gradeMap[sub.grade] : 0.00;
          overallCredits += sub.credits || 0;
          overallGP += gp * (sub.credits || 0);
          
          const sem = sub.semester;
          if (sem && (sem.startsWith('1-') || sem.startsWith('2-') || sem.startsWith('3-'))) {
            threeYearCredits += sub.credits || 0;
            threeYearGP += gp * (sub.credits || 0);
          }
        }
      });
      
      const overallCGPA = overallCredits > 0 ? (overallGP / overallCredits) : 0.00;
      const threeYearCGPA = threeYearCredits > 0 ? (threeYearGP / threeYearCredits) : 0.00;
      
      return { overallCGPA, threeYearCGPA };
    } catch (err) {
      console.error("Failed to calculate GPA details:", err);
      return { overallCGPA: 0.00, threeYearCGPA: 0.00 };
    }
  },

  updateSpecialEligibilityHUD(stats) {
    const cgpaDisplay = document.getElementById('global-cgpa-display');
    const statusBadge = document.getElementById('special-status-badge');
    const progressFill = document.getElementById('hud-progress-fill');
    const progressText = document.getElementById('hud-progress-text');
    
    if (!cgpaDisplay || !statusBadge || !progressFill || !progressText) return;
    
    const cgpa3Year = stats.threeYearCGPA;
    const cgpaOverall = stats.overallCGPA;
    
    cgpaDisplay.innerText = `3-Yr GPA: ${cgpa3Year.toFixed(2)} (Overall: ${cgpaOverall.toFixed(2)})`;
    
    const pct = Math.min(100, (cgpa3Year / 3.00) * 100);
    progressFill.style.width = `${pct}%`;
    progressText.innerText = `${pct.toFixed(1)}%`;
    
    if (cgpa3Year >= 3.00) {
      statusBadge.innerHTML = '🔓 Special Honours Eligible';
      statusBadge.style.background = 'rgba(0, 229, 255, 0.15)';
      statusBadge.style.color = 'var(--accent)';
      statusBadge.style.border = '1px solid var(--accent)';
      statusBadge.style.boxShadow = '0 0 10px rgba(0, 229, 255, 0.25)';
      progressFill.style.backgroundColor = 'var(--success)';
    } else {
      statusBadge.innerHTML = '🔒 General Bound (GPA &lt; 3.0)';
      statusBadge.style.background = 'rgba(255, 255, 255, 0.08)';
      statusBadge.style.color = 'var(--text-secondary)';
      statusBadge.style.border = '1px solid var(--border-color)';
      statusBadge.style.boxShadow = 'none';
      progressFill.style.backgroundColor = 'var(--accent)';
    }
    
    this.updateYear4DropdownOptions(cgpa3Year);
  },

  updateYear4DropdownOptions(cgpa3Year) {
    const filter = document.getElementById('subject-semester-filter');
    if (!filter) return;
    const isSpecial = cgpa3Year >= 3.00;
    
    const opt41 = filter.querySelector('option[value="4-1"]');
    if (opt41) {
      opt41.innerText = isSpecial ? 'Year 4 (Special Honours) - Semester I' : 'Year 4 (General - Extended) - Semester I';
    }
    
    const opt42 = filter.querySelector('option[value="4-2"]');
    if (opt42) {
      opt42.innerText = isSpecial ? 'Year 4 (Special Honours) - Semester II' : 'Year 4 (General - Extended) - Semester II';
    }
  },

  async render() {
    const container = document.getElementById('subjects-list-container');
    if (!container) return;

    try {
      const gpaStats = await this._getGPADetails();
      this.updateSpecialEligibilityHUD(gpaStats);

      const allSubjects = await originalGetAll.call(Database, 'subjects');
      const parents = allSubjects.filter(s => s.isParent);

      const filteredParents = parents.filter(p => {
        const hasSemModules = Array.isArray(p.submodules) && p.submodules.some(s => s.semester === this.activeSemester);
        const hasNoModules = !Array.isArray(p.submodules) || p.submodules.length === 0;
        return hasSemModules || hasNoModules;
      });

      if (filteredParents.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No custom subject units logged. Click '+ Add Subject' to configure your academic roadmap.
          </div>
        `;
        return;
      }

      const gradeMap = (GPAModule && GPAModule.gradeMap) || {
        'A+': 4.00, 'A': 4.00, 'A-': 3.70,
        'B+': 3.30, 'B': 3.00, 'B-': 2.70,
        'C+': 2.30, 'C': 2.00, 'C-': 1.70,
        'D+': 1.30, 'D': 1.00, 'E': 0.00
      };

      container.innerHTML = filteredParents.map(parent => {
        const semesterSubmodules = (parent.submodules || []).filter(s => s.semester === this.activeSemester);
        
        let totalCoreCredits = 0;
        let weightedCoreGP = 0;
        (parent.submodules || []).forEach(sub => {
          if (sub.grade) {
            const gp = gradeMap[sub.grade] !== undefined ? gradeMap[sub.grade] : 0.00;
            totalCoreCredits += sub.credits || 0;
            weightedCoreGP += gp * (sub.credits || 0);
          }
        });
        const coreGPA = totalCoreCredits > 0 ? (weightedCoreGP / totalCoreCredits).toFixed(2) : 'N/A';

        let submodulesHTML = '';
        if (semesterSubmodules.length === 0) {
          submodulesHTML = `
            <div style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; padding: 12px; text-align: center; font-family: var(--font-family-app) !important;">
              No sub-modules configured for this semester. Click "+ Add Modules" above to configure.
            </div>
          `;
        } else {
          submodulesHTML = semesterSubmodules.map(sub => {
            const checkpoints = Array.isArray(sub.syllabusCheckpoints) && sub.syllabusCheckpoints.length > 0
              ? sub.syllabusCheckpoints
              : DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
            
            const syllPct = this._calcSyllabusCompletion(checkpoints);
            const doneCount = checkpoints.filter(c => c.done).length;

            return `
              <div class="sub-module-isolated-card" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-top: 12px; box-shadow: var(--shadow-sm); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); display: flex; flex-direction: column; gap: 12px; font-family: var(--font-family-app) !important;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="flex: 1;">
                    <div class="sub-modules-hub-badge" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 229, 255, 0.18); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; font-weight: 600; color: var(--accent); font-family: var(--font-family-app) !important; margin-bottom: 6px;">
                      Sub-Modules Hub
                    </div>
                    <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0; font-family: var(--font-family-app) !important;">${sub.moduleTitle}</h4>
                  </div>
                  <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                    <span class="badge low" style="background-color: var(--accent-glow); color: var(--accent); white-space: nowrap; font-family: var(--font-family-app) !important;">${sub.credits} Cr</span>
                    <span class="badge low" style="background-color: rgba(255, 255, 255, 0.05); color: var(--text-secondary); text-transform: uppercase; font-size: 0.65rem; font-family: var(--font-family-app) !important;">${sub.type}</span>
                  </div>
                </div>

                <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 3px; font-family: var(--font-family-app) !important;">
                  <span><strong>Lecturer:</strong> ${sub.lecturerName || 'Not assigned'}</span>
                  <span><strong>Contact:</strong> ${sub.lecturerContact || 'N/A'}</span>
                </div>

                <div style="margin-top: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span class="syllabus-progress-header" data-sub-id="${sub.id}" style="font-size: 0.75rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-family-app) !important;">
                      Syllabus Progress: ${doneCount}/${checkpoints.length} topics (${syllPct}%)
                    </span>
                  </div>
                  <div style="height: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 3px; overflow: hidden; margin-bottom: 12px;">
                    <div class="syllabus-progress-bar" data-sub-id="${sub.id}" style="width: ${syllPct}%; height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s ease;"></div>
                  </div>
                  <div class="syllabus-checkpoints-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-family: var(--font-family-app) !important;">
                    ${checkpoints.map((cp, idx) => `
                      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.75rem; color: ${cp.done ? 'var(--text-secondary)' : 'var(--text-primary)'}; font-family: var(--font-family-app) !important;">
                        <input type="checkbox" class="syll-check" data-sub-id="${sub.id}" data-idx="${idx}" ${cp.done ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent);">
                        <span style="font-family: var(--font-family-app) !important; text-decoration: ${cp.done ? 'line-through' : 'none'};">${cp.label}</span>
                      </label>
                    `).join('')}
                  </div>
                </div>

                <div class="marks-matrix" style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; font-family: var(--font-family-app) !important;">
                  <div class="module-section-title" style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-family-app) !important;">Theory & Internal Assessments Matrix</div>
                  
                  <div class="marks-progress-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">
                    <span class="marks-progress-label" style="width: 70px; color: var(--text-secondary); font-family: var(--font-family-app) !important;">CA Marks</span>
                    <div class="marks-progress-bar-bg" style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 3px; overflow: hidden;">
                      <div class="marks-progress-bar-fill" style="width: ${sub.internalMarks?.ca || 0}%; height: 100%; background: var(--accent); border-radius: 3px;"></div>
                    </div>
                    <span class="marks-progress-value" style="width: 45px; text-align: right; color: var(--text-primary); font-family: var(--font-family-app) !important;">${sub.internalMarks?.ca || 0}/100</span>
                  </div>

                  <div class="marks-progress-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">
                    <span class="marks-progress-label" style="width: 70px; color: var(--text-secondary); font-family: var(--font-family-app) !important;">Quiz Marks</span>
                    <div class="marks-progress-bar-bg" style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 3px; overflow: hidden;">
                      <div class="marks-progress-bar-fill" style="width: ${sub.internalMarks?.quiz || 0}%; height: 100%; background: var(--accent); border-radius: 3px;"></div>
                    </div>
                    <span class="marks-progress-value" style="width: 45px; text-align: right; color: var(--text-primary); font-family: var(--font-family-app) !important;">${sub.internalMarks?.quiz || 0}/100</span>
                  </div>

                  <div class="marks-progress-row" style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">
                    <span class="marks-progress-label" style="width: 70px; color: var(--text-secondary); font-family: var(--font-family-app) !important;">Lab Marks</span>
                    <div class="marks-progress-bar-bg" style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 3px; overflow: hidden;">
                      <div class="marks-progress-bar-fill" style="width: ${sub.internalMarks?.lab || 0}%; height: 100%; background: var(--accent); border-radius: 3px;"></div>
                    </div>
                    <span class="marks-progress-value" style="width: 45px; text-align: right; color: var(--text-primary); font-family: var(--font-family-app) !important;">${sub.internalMarks?.lab || 0}/100</span>
                  </div>
                </div>

                <div style="display: flex; gap: 8px; margin-top: 12px;">
                  <button class="btn-outline btn-sm edit-submodule-btn" data-id="${sub.id}" style="flex: 1; padding: 6px 10px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Edit Sub-Module</button>
                  <button class="btn-outline btn-sm delete-submodule-btn" data-id="${sub.id}" style="border-color: var(--danger); color: var(--danger); padding: 6px 10px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Delete Sub-Module</button>
                </div>
              </div>
            `;
          }).join('');
        }

        return `
          <div class="card col-12" style="display: flex; flex-direction: column; gap: 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
              <div>
                <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent); margin: 0; font-family: var(--font-family-app) !important;">${parent.code}</h3>
                <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-top: 4px; font-family: var(--font-family-app) !important;">${parent.name}</h4>
              </div>
              <div style="display: flex; align-items: center; gap: 12px; font-family: var(--font-family-app) !important;">
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 6px; font-family: var(--font-family-app) !important;">
                  Core GPA: <span style="color: var(--accent); font-family: var(--font-family-app) !important;">${coreGPA}</span>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: rgba(0, 229, 255, 0.18); border: 1px solid rgba(0, 229, 255, 0.3); font-size: 0.8rem; font-weight: 700; color: var(--accent); font-family: var(--font-family-app) !important;">
                  ${semesterSubmodules.length}
                </div>
              </div>
            </div>

            ${parent.description ? `<p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0; font-family: var(--font-family-app) !important; line-height: 1.5;">${parent.description}</p>` : ''}

            <div style="display: flex; gap: 12px; align-items: center; width: 100%; margin-top: 8px;">
              <button class="btn-outline toggle-submodules-btn" data-code="${parent.code}" style="flex: 1; padding: 8px 16px; font-size: 0.8rem; font-weight: 600; background: rgba(0, 229, 255, 0.08); border-color: rgba(0, 229, 255, 0.2); color: var(--accent); font-family: var(--font-family-app) !important; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all 0.2s;">
                Sub-Modules Hub <span class="arrow-indicator">▼</span>
              </button>
              <button class="btn-outline edit-subject-btn" data-code="${parent.code}" style="padding: 8px 16px; font-size: 0.8rem; font-family: var(--font-family-app) !important; border-radius: 8px; white-space: nowrap;">Edit Subject</button>
              <button class="btn-outline delete-subject-btn" data-code="${parent.code}" style="border-color: var(--danger); color: var(--danger); padding: 8px 16px; font-size: 0.8rem; font-family: var(--font-family-app) !important; border-radius: 8px; white-space: nowrap;">Delete</button>
            </div>

            <div class="submodules-wrapper" id="submodules-wrapper-${parent.code}" style="display: none; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px; margin-top: 8px;">
              <h5 style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-family-app) !important;">Sub-Modules Hierarchy</h5>
              ${submodulesHTML}
            </div>
          </div>
        `;
      }).join('');

      // Bind syllabus checkpoint toggles
      container.querySelectorAll('.syll-check').forEach(chk => {
        chk.addEventListener('change', async () => {
          const subId = chk.getAttribute('data-sub-id');
          const idx = parseInt(chk.getAttribute('data-idx'));
          await this._toggleCheckpoint(subId, idx, chk.checked);
        });
      });

      // Bind toggle submodules buttons
      container.querySelectorAll('.toggle-submodules-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          const wrapper = document.getElementById(`submodules-wrapper-${code}`);
          const arrow = btn.querySelector('.arrow-indicator');
          if (wrapper) {
            if (wrapper.style.display === 'none') {
              wrapper.style.display = 'block';
              if (arrow) arrow.textContent = '▲';
            } else {
              wrapper.style.display = 'none';
              if (arrow) arrow.textContent = '▼';
            }
          }
        });
      });

      // Bind parent subject edits
      container.querySelectorAll('.edit-subject-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          this.openModal(code);
        });
      });

      // Bind parent subject deletes
      container.querySelectorAll('.delete-subject-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          if (confirm("Are you sure you want to completely delete this subject?")) {
            this.handleDeleteSubject(code);
          }
        });
      });

      // Bind submodule edits
      container.querySelectorAll('.edit-submodule-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          this.openSubModuleModal(id);
        });
      });

      // Bind submodule deletes
      container.querySelectorAll('.delete-submodule-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          if (confirm("Are you sure you want to delete this sub-module?")) {
            this.handleDeleteSubModule(id);
          }
        });
      });

    } catch (err) {
      console.error('Render subjects failed:', err);
    }
  },

  async _toggleCheckpoint(subId, idx, checked) {
    try {
      const sub = await Database.get('subjects', subId);
      if (!sub) return;

      if (!Array.isArray(sub.syllabusCheckpoints) || sub.syllabusCheckpoints.length === 0) {
        sub.syllabusCheckpoints = DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
      }

      if (sub.syllabusCheckpoints[idx]) {
        sub.syllabusCheckpoints[idx].done = checked;
      }

      await Database.put('subjects', sub);

      // Instantly update progress bar and label text in the DOM to prevent visual lag
      const progressLabel = document.querySelector(`.syllabus-progress-header[data-sub-id="${subId}"]`);
      const progressBar = document.querySelector(`.syllabus-progress-bar[data-sub-id="${subId}"]`);
      
      const doneCount = sub.syllabusCheckpoints.filter(c => c.done).length;
      const pct = Math.round((doneCount / sub.syllabusCheckpoints.length) * 100);

      if (progressLabel) {
        progressLabel.innerText = `Syllabus Progress: ${doneCount}/${sub.syllabusCheckpoints.length} topics (${pct}%)`;
      }
      if (progressBar) {
        progressBar.style.width = `${pct}%`;
      }

      // If all done, show notification
      const allDone = sub.syllabusCheckpoints.every(c => c.done);
      if (allDone) {
        NotificationService.show('Syllabus Complete!', `All topics covered for "${sub.moduleTitle}". Excellent work!`, 'success');
      }

      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    } catch (err) {
      console.error('Toggle syllabus checkpoint failed:', err);
    }
  },

  async openModal(code = null) {
    const modal = document.getElementById('subject-modal');
    const form = document.getElementById('subject-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('subject-modal-title').innerText = code ? 'Edit Subject' : 'New Subject';
    document.getElementById('subject-mode').value = code ? 'edit' : 'add';

    const codeInput = document.getElementById('sub-code');
    if (code) {
      codeInput.setAttribute('readonly', 'true');
      try {
        const sub = await Database.get('subjects-raw', code);
        if (sub) {
          codeInput.value = sub.code || '';
          document.getElementById('sub-name').value = sub.name || '';
          document.getElementById('sub-description').value = sub.description || '';
        }
      } catch (err) {
        console.error('Load subject details failed:', err);
      }
    } else {
      codeInput.removeAttribute('readonly');
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
    const description = document.getElementById('sub-description').value.trim();

    if (!code || !name) {
      alert('Subject Code and Title are required.');
      return;
    }

    const subjectData = {
      code,
      name,
      description,
      subjectCode: code,
      subjectTitle: name,
      subjectDescription: description,
      isParent: true,
      userId: ''
    };

    try {
      if (mode === 'add') {
        const existing = await originalGet.call(Database, 'subjects', code);
        if (existing) {
          alert(`Subject code ${code} already exists.`);
          return;
        }
        subjectData.submodules = [];
        await originalPut.call(Database, 'subjects', subjectData);
        NotificationService.show('Subject Added', `Main Subject "${name}" created successfully.`, 'success');
      } else {
        const existing = await originalGet.call(Database, 'subjects', code) || {};
        const updatedData = {
          ...existing,
          name,
          description,
          subjectCode: code,
          subjectTitle: name,
          subjectDescription: description,
          isParent: true,
          submodules: existing.submodules || []
        };
        await originalPut.call(Database, 'subjects', updatedData);
        NotificationService.show('Subject Updated', `Subject ${code} saved successfully.`, 'success');
      }

      this.closeModal();
      this.render();

      const updateEvent = new CustomEvent('subjectsUpdated', { detail: { code } });
      window.dispatchEvent(updateEvent);

    } catch (err) {
      console.error('Save subject failed:', err);
      alert('Could not save subject data.');
    }
  },

  async openSubModuleModal(id = null) {
    const modal = document.getElementById('sub-module-modal');
    const form = document.getElementById('sub-module-form');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('sub-module-modal-title').innerText = id ? 'Edit Sub-Module' : 'Add Sub-Module';
    document.getElementById('sub-module-mode').value = id ? 'edit' : 'add';
    document.getElementById('sub-module-id').value = id || '';

    await this.refreshParentSubjectSelect();

    if (id) {
      try {
        const sub = await Database.get('subjects', id);
        if (sub) {
          document.getElementById('module-parent-subject-select').value = sub.parentSubjectCode || '';
          document.getElementById('sub-module-title').value = sub.moduleTitle || sub.name || '';
          document.getElementById('module-credits-select').value = sub.credits || '3';
          document.getElementById('module-semester-select').value = sub.semester || this.activeSemester;
          document.getElementById('module-lecturer-name').value = sub.lecturerName || sub.lecturer || '';
          document.getElementById('module-lecturer-contact').value = sub.lecturerContact || sub.info || '';
          document.getElementById('sub-module-type').value = sub.type || 'theory';
          document.getElementById('module-theory-weight').value = sub.theoryWeight !== undefined ? sub.theoryWeight : '70';
          document.getElementById('module-practical-weight').value = sub.practicalWeight !== undefined ? sub.practicalWeight : '30';

          const ca = sub.internalMarks?.ca !== undefined ? sub.internalMarks.ca : 0;
          const quiz = sub.internalMarks?.quiz !== undefined ? sub.internalMarks.quiz : 0;
          const lab = sub.internalMarks?.lab !== undefined ? sub.internalMarks.lab : 0;

          document.getElementById('module-ca-marks').value = ca;
          document.getElementById('module-quiz-marks').value = quiz;
          document.getElementById('module-lab-marks').value = lab;
        }
      } catch (err) {
        console.error('Load sub-module details failed:', err);
      }
    } else {
      document.getElementById('module-semester-select').value = this.activeSemester;
      document.getElementById('module-theory-weight').value = '70';
      document.getElementById('module-practical-weight').value = '30';
      document.getElementById('module-ca-marks').value = '0';
      document.getElementById('module-quiz-marks').value = '0';
      document.getElementById('module-lab-marks').value = '0';
    }

    modal.classList.add('visible');
  },

  closeSubModuleModal() {
    const modal = document.getElementById('sub-module-modal');
    if (modal) modal.classList.remove('visible');
  },

  async refreshParentSubjectSelect(selectValueToSet = null) {
    const select = document.getElementById('module-parent-subject-select');
    if (!select) return;

    try {
      const subjects = await originalGetAll.call(Database, 'subjects');
      const parents = subjects.filter(s => s.isParent);

      select.innerHTML = '<option value="" disabled selected>Select Parent Subject...</option>';
      parents.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.code;
        opt.innerText = `${sub.code} - ${sub.name}`;
        select.appendChild(opt);
      });

      if (selectValueToSet) {
        select.value = selectValueToSet;
      }
    } catch (err) {
      console.error('Failed to refresh parent subject select:', err);
    }
  },

  async handleSaveSubModule(e) {
    e.preventDefault();
    const mode = document.getElementById('sub-module-mode').value;
    const id = document.getElementById('sub-module-id').value || 'sub_' + Date.now();
    const parentCode = document.getElementById('module-parent-subject-select').value;
    const title = document.getElementById('sub-module-title').value.trim();
    const credits = parseInt(document.getElementById('module-credits-select').value) || 3;
    const semester = document.getElementById('module-semester-select').value;
    const lecturerName = document.getElementById('module-lecturer-name').value.trim();
    const lecturerContact = document.getElementById('module-lecturer-contact').value.trim();
    const type = document.getElementById('sub-module-type').value;
    const theoryWeight = parseFloat(document.getElementById('module-theory-weight').value) || 0;
    const practicalWeight = parseFloat(document.getElementById('module-practical-weight').value) || 0;

    const ca = parseFloat(document.getElementById('module-ca-marks').value) || 0;
    const quiz = parseFloat(document.getElementById('module-quiz-marks').value) || 0;
    const lab = parseFloat(document.getElementById('module-lab-marks').value) || 0;

    if (!parentCode || !title) {
      alert('Parent subject and title are required.');
      return;
    }

    if (theoryWeight + practicalWeight !== 100) {
      alert('Theory Weight and Practical Weight must sum to exactly 100%.');
      return;
    }

    try {
      let existingSub = {};
      if (mode === 'edit') {
        existingSub = await Database.get('subjects', id) || {};
      }

      const subData = {
        ...existingSub,
        code: id,
        id: id,
        parentSubjectCode: parentCode,
        name: title,
        moduleTitle: title,
        credits,
        semester,
        lecturer: lecturerName,
        lecturerName,
        info: lecturerContact,
        lecturerContact,
        type,
        theoryWeight,
        practicalWeight,
        grade: existingSub.grade || '',
        internalMarks: { ca, quiz, lab },
        syllabusCheckpoints: existingSub.syllabusCheckpoints || DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }))
      };

      if (mode === 'add') {
        await Database.add('subjects', subData);
        NotificationService.show('Sub-Module Added', `Configured sub-module "${title}" successfully.`, 'success');
      } else {
        await Database.put('subjects', subData);
        NotificationService.show('Sub-Module Updated', `Updated sub-module "${title}" successfully.`, 'success');
      }

      this.closeSubModuleModal();
      window.dispatchEvent(new CustomEvent('calendarItemsUpdated'));
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      this.render();
    } catch (err) {
      console.error('Save sub-module failed:', err);
      alert('Could not save sub-module.');
    }
  },

  async handleDeleteSubject(code) {
    try {
      // 1. Get all subjects to find flat sub-modules or nested ones to clean up associated records
      const allRecords = await originalGetAll.call(Database, 'subjects');
      
      // Locate flat submodules matching this parent relation key
      const flatSubmodulesToDelete = allRecords.filter(r => !r.isParent && r.parentSubjectCode === code);
      
      // Delete any flat submodules matching parent relation key to prevent orphaned indices
      for (const sub of flatSubmodulesToDelete) {
        await originalDelete.call(Database, 'subjects', sub.code || sub.id);
        // Also delete their corresponding attendance records
        await originalDelete.call(Database, 'attendance', sub.code || sub.id);
      }
      
      // Locate the parent subject record to see if there are nested submodules
      const parentRecord = allRecords.find(r => r.isParent && r.code === code);
      if (parentRecord && Array.isArray(parentRecord.submodules)) {
        for (const sub of parentRecord.submodules) {
          // Delete attendance records for nested submodules
          await originalDelete.call(Database, 'attendance', sub.id);
        }
      }
      
      // Delete attendance record for parent subject if any
      await originalDelete.call(Database, 'attendance', code);
      
      // 2. Delete the parent subject record itself
      await originalDelete.call(Database, 'subjects', code);
      
      NotificationService.show('Subject Deleted', `Subject ${code} and all its sub-modules were removed.`, 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    } catch (err) {
      console.error('Delete subject failed:', err);
    }
  },

  async handleDeleteSubModule(id) {
    try {
      await Database.delete('subjects', id);
      await originalDelete.call(Database, 'attendance', id);
      NotificationService.show('Sub-Module Deleted', `Sub-module was successfully removed.`, 'warning');
      this.render();
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    } catch (err) {
      console.error('Delete sub-module failed:', err);
    }
  }
};
