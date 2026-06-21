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
const GRADE_MAP = {
  'A+': 4.00, 'A': 4.00, 'A-': 3.70,
  'B+': 3.30, 'B': 3.00, 'B-': 2.70,
  'C+': 2.30, 'C': 2.00, 'C-': 1.70,
  'D+': 1.30, 'D': 1.00, 'E': 0.00
};

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

  if (storeName === 'submodules') {
    return Database.getAll('subjects').then(list => (list || []).filter(s => s.isSubmodule));
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
              type: sub.type || 'theory',
              prerequisite: sub.prerequisite || '',
              corequisite: sub.corequisite || '',
              grade: sub.grade || '',
              gradePoint: sub.gradePoint !== undefined ? sub.gradePoint : (sub.grade && GRADE_MAP[sub.grade] !== undefined ? GRADE_MAP[sub.grade] : 0.00),
              internalMarks: sub.internalMarks || { ca: 0, quiz: 0, lab: 0 },
              syllabusCheckpoints: sub.syllabusCheckpoints || [],
              parentSubjectCode: parent.code,
              isSubmodule: true,
              userId: parent.userId || '',
              targetGrade: sub.targetGrade || '',
              studyMinutes: sub.studyMinutes || 0
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
                type: sub.type || 'theory',
                prerequisite: sub.prerequisite || '',
                corequisite: sub.corequisite || '',
                grade: sub.grade || '',
                gradePoint: sub.gradePoint !== undefined ? sub.gradePoint : (sub.grade && GRADE_MAP[sub.grade] !== undefined ? GRADE_MAP[sub.grade] : 0.00),
                internalMarks: sub.internalMarks || { ca: 0, quiz: 0, lab: 0 },
                syllabusCheckpoints: sub.syllabusCheckpoints || [],
                parentSubjectCode: parent.code,
                isSubmodule: true,
                userId: parent.userId || '',
                targetGrade: sub.targetGrade || '',
                studyMinutes: sub.studyMinutes || 0
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
          type: value.type || 'theory',
          prerequisite: value.prerequisite || '',
          corequisite: value.corequisite || '',
          grade: value.grade,
          gradePoint: value.gradePoint !== undefined ? value.gradePoint : (value.grade && GRADE_MAP[value.grade] !== undefined ? GRADE_MAP[value.grade] : 0.00),
          internalMarks: value.internalMarks,
          syllabusCheckpoints: value.syllabusCheckpoints,
          targetGrade: value.targetGrade,
          studyMinutes: value.studyMinutes || 0
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
          type: value.type || 'theory',
          prerequisite: value.prerequisite || '',
          corequisite: value.corequisite || '',
          grade: value.grade || '',
          gradePoint: value.gradePoint !== undefined ? value.gradePoint : (value.grade && GRADE_MAP[value.grade] !== undefined ? GRADE_MAP[value.grade] : 0.00),
          internalMarks: value.internalMarks || { ca: 0, quiz: 0, lab: 0 },
          syllabusCheckpoints: value.syllabusCheckpoints || [],
          targetGrade: value.targetGrade || '',
          studyMinutes: value.studyMinutes || 0
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
      if (this._isTogglingCheckpoint) {
        return; // Skip full render for syllabus checklist clicks
      }
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

  async updateSpecialEligibilityHUD(stats) {
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
      statusBadge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lock-svg" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>Special Honours Eligible';
      statusBadge.style.background = 'var(--accent-glow)';
      statusBadge.style.color = 'var(--accent)';
      statusBadge.style.border = '1px solid var(--accent)';
      statusBadge.style.boxShadow = 'var(--shadow-glow)';
      progressFill.classList.add('unlocked');
    } else {
      statusBadge.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lock-svg" style="margin-right: 6px; vertical-align: middle;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>General Bound (GPA &lt; 3.0)';
      statusBadge.style.background = 'rgba(255, 255, 255, 0.04)';
      statusBadge.style.color = 'var(--text-secondary)';
      statusBadge.style.border = '1px solid var(--border-color)';
      statusBadge.style.boxShadow = 'none';
      progressFill.classList.remove('unlocked');
    }
    
    this.updateYear4DropdownOptions(cgpa3Year);

    // Dynamic Special Selection Criteria Weight Calculation
    try {
      const allSubmodules = await Database.getAll('researchProject/modules');
      const sports = await Database.getAll('sports');
      
      const gradeMap = (GPAModule && GPAModule.gradeMap) || {
        'A+': 4.00, 'A': 4.00, 'A-': 3.70,
        'B+': 3.30, 'B': 3.00, 'B-': 2.70,
        'C+': 2.30, 'C': 2.00, 'C-': 1.70,
        'D+': 1.30, 'D': 1.00, 'E': 0.00
      };

      // 1. GPA component for best 65 credits (70% max)
      const sortedSubsCompleted = allSubmodules
        .filter(sub => sub.grade)
        .sort((a, b) => {
          const gpA = gradeMap[a.grade] || 0;
          const gpB = gradeMap[b.grade] || 0;
          return gpB - gpA;
        });

      let totalCreditsForGPA = 0;
      let totalGPForGPA = 0;
      for (const sub of sortedSubsCompleted) {
        const gp = gradeMap[sub.grade] || 0;
        const creds = sub.credits || 0;
        if (totalCreditsForGPA + creds <= 65) {
          totalCreditsForGPA += creds;
          totalGPForGPA += gp * creds;
        } else {
          const remaining = 65 - totalCreditsForGPA;
          totalCreditsForGPA += remaining;
          totalGPForGPA += gp * remaining;
          break;
        }
      }
      const best65GPA = totalCreditsForGPA > 0 ? (totalGPForGPA / totalCreditsForGPA) : 0.00;
      const gpaScore = (best65GPA / 4.00) * 70;

      // 2. Sports component (5% max)
      const matches = sports.filter(s => s.activityType === 'Match');
      const sportsScore = Math.min(5, matches.length * 1.0);

      // 3. Group Project marks COM 3405 / ICT 3411 (5% max)
      const projectSub = allSubmodules.find(s => 
        s.id === 'COM 3405' || s.id === 'ICT 3411' || s.code === 'COM 3405' || s.code === 'ICT 3411' ||
        (s.moduleTitle && (s.moduleTitle.includes('COM 3405') || s.moduleTitle.includes('ICT 3411')))
      );
      let projectScore = 0;
      if (projectSub) {
        if (projectSub.grade) {
          const gp = gradeMap[projectSub.grade] || 0;
          projectScore = (gp / 4.00) * 5;
        } else if (projectSub.internalMarks) {
          const ca = projectSub.internalMarks.ca || 0;
          const quiz = projectSub.internalMarks.quiz || 0;
          const lab = projectSub.internalMarks.lab || 0;
          const avg = (ca + quiz + lab) / 3;
          projectScore = (avg / 100) * 5;
        }
      }

      // 4. Viva/Interview/Focus Factor panel component (20% max)
      let focusQuality = 85;
      const qualityValEl = document.getElementById('pomo-quality-val');
      if (qualityValEl) {
        const valText = qualityValEl.innerText.replace('%', '');
        const valParsed = parseFloat(valText);
        if (!isNaN(valParsed)) focusQuality = valParsed;
      }
      const panelScore = (focusQuality / 100) * 20;

      const projectedInterviewScore = gpaScore + sportsScore + projectScore + panelScore;

      // Update UI elements
      const interviewText = document.getElementById('hud-interview-score-text');
      const interviewFill = document.getElementById('hud-interview-score-fill');
      
      const partGPA = document.getElementById('hud-interview-gpa-part');
      const partSports = document.getElementById('hud-interview-sports-part');
      const partProject = document.getElementById('hud-interview-project-part');
      const partPanel = document.getElementById('hud-interview-panel-part');

      if (interviewText) interviewText.innerText = `${projectedInterviewScore.toFixed(1)}%`;
      if (interviewFill) interviewFill.style.width = `${projectedInterviewScore}%`;

      if (partGPA) partGPA.innerText = `GPA (65 Cr, 70% max): ${gpaScore.toFixed(1)}%`;
      if (partSports) partSports.innerText = `Sports Matches (5% max): ${sportsScore.toFixed(1)}%`;
      if (partProject) partProject.innerText = `Group Project (5% max): ${projectScore.toFixed(1)}%`;
      if (partPanel) partPanel.innerText = `Viva (20% max): ${panelScore.toFixed(1)}%`;

    } catch (err) {
      console.error('Error calculating interview score:', err);
    }
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
    await this.refreshView();
  },

  async refreshView() {
    const container = document.getElementById('subjects-list-container');
    if (!container) return;

    // Track currently expanded submodule wrappers
    const expandedCodes = [];
    container.querySelectorAll('.submodules-wrapper').forEach(wrapper => {
      if (wrapper.style.display === 'block') {
        const code = wrapper.id.replace('submodules-wrapper-', '');
        if (code) expandedCodes.push(code);
      }
    });

    try {
      const gpaStats = await this._getGPADetails();
      this.updateSpecialEligibilityHUD(gpaStats);

      const [allSubjects, attendance] = await Promise.all([
        originalGetAll.call(Database, 'subjects'),
        Database.getAll('attendance')
      ]);
      const parents = allSubjects.filter(s => s.isParent);

      if (parents.length === 0) {
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

      const allSubmodules = await Database.getAll('researchProject/modules');

      container.innerHTML = parents.map(parent => {
        const semesterSubmodules = allSubmodules.filter(s => s.parentSubjectCode === parent.code && s.semester === this.activeSemester);
        
        let totalCoreCredits = 0;
        let weightedCoreGP = 0;
        const parentAllSubmodules = allSubmodules.filter(s => s.parentSubjectCode === parent.code);
        parentAllSubmodules.forEach(sub => {
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
            <div class="no-modules-fallback" style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; padding: 16px; text-align: center; font-family: var(--font-family-app) !important;">
              No modules configured under this curriculum track for the selected active semester.
            </div>
          `;
        } else {
          submodulesHTML = semesterSubmodules.map(sub => {
            const checkpoints = Array.isArray(sub.syllabusCheckpoints) && sub.syllabusCheckpoints.length > 0
              ? sub.syllabusCheckpoints
              : DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
            
            const syllPct = this._calcSyllabusCompletion(checkpoints);
            const doneCount = checkpoints.filter(c => c.done).length;

            const currentSelfStudyHours = (sub.studyMinutes || 0) / 60;
            const thresholdHours = sub.credits * 30;
            const slqfPct = Math.min(100, (currentSelfStudyHours / thresholdHours) * 100);

            const semesterLabels = {
              '1-1': 'Year 1 - Sem I',
              '1-2': 'Year 1 - Sem II',
              '2-1': 'Year 2 - Sem I',
              '2-2': 'Year 2 - Sem II',
              '3-1': 'Year 3 - Sem I',
              '3-2': 'Year 3 - Sem II',
              '4-1': 'Year 4 - Sem I',
              '4-2': 'Year 4 - Sem II'
            };
            const semLabel = semesterLabels[sub.semester] || sub.semester || 'N/A';

            const attRecord = attendance.find(a => a.subjectCode === sub.id);
            let attendancePct = 100;
            if (attRecord) {
              const present = (attRecord.lecture?.present || 0) + (attRecord.practical?.present || 0) + (attRecord.fieldWork?.present || 0);
              const total = (attRecord.lecture?.total || 0) + (attRecord.practical?.total || 0) + (attRecord.fieldWork?.total || 0);
              if (total > 0) {
                attendancePct = (present / total) * 100;
              }
            }
            const riskBadgeHTML = attendancePct < 80 ? `
              <div class="critical-risk-badge" style="background: rgba(255, 23, 68, 0.18); border: 1px solid var(--danger); color: var(--danger); border-radius: 6px; padding: 4px 10px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; box-shadow: 0 0 10px rgba(255, 23, 68, 0.2); width: fit-content; font-family: var(--font-family-app) !important; white-space: nowrap;">
                CRITICAL ELIGIBILITY RISK: EXAMINATION BARRED
              </div>
            ` : '';

            return `
              <div class="sub-module-isolated-card" style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-top: 12px; box-shadow: var(--shadow-sm); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); display: flex; flex-direction: column; gap: 12px; font-family: var(--font-family-app) !important;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div style="flex: 1;">
                    <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; font-family: var(--font-family-app) !important;">
                      <div class="sub-modules-hub-badge" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 229, 255, 0.18); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; font-weight: 600; color: var(--accent); font-family: var(--font-family-app) !important; margin: 0;">
                        Sub-Modules Hub
                      </div>
                      <div class="badge" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); font-family: var(--font-family-app) !important; margin: 0; white-space: nowrap;">
                        ${semLabel}
                      </div>
                      ${riskBadgeHTML}
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
                    <div class="syllabus-progress-bar" id="tracker-bar-${sub.id}" data-sub-id="${sub.id}" style="width: ${syllPct}%; height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s ease;"></div>
                  </div>
                  <div class="syllabus-checkpoints-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-family: var(--font-family-app) !important;">
                    ${checkpoints.map((cp, idx) => `
                      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.75rem; color: ${cp.done ? 'var(--text-secondary)' : 'var(--text-primary)'}; font-family: var(--font-family-app) !important;">
                        <input type="checkbox" class="syll-check syllabus-sync-checkbox" data-sub-id="${sub.id}" data-idx="${idx}" ${cp.done ? 'checked' : ''} style="width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent);">
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

                <div class="slqf-learning-hours" style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; font-family: var(--font-family-app) !important;">
                  <div class="module-section-title" style="font-size: 0.75rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-family-app) !important;">SLQF Self-Study workload</div>
                  
                  <div class="marks-progress-row" style="display: flex; align-items: center; gap: 8px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">
                    <span class="marks-progress-label" style="width: 70px; color: var(--text-secondary); font-family: var(--font-family-app) !important;">Self-Study</span>
                    <div class="marks-progress-bar-bg" style="flex: 1; height: 6px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 3px; overflow: hidden;">
                      <div class="marks-progress-bar-fill" style="width: ${slqfPct}%; height: 100%; background: var(--accent); border-radius: 3px;"></div>
                    </div>
                    <span class="marks-progress-value" style="width: 75px; text-align: right; color: var(--text-primary); font-family: var(--font-family-app) !important;">${currentSelfStudyHours.toFixed(1)} / ${thresholdHours} hrs</span>
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
                <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-primary); background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); padding: 4px 8px; border-radius: 6px; font-family: var(--font-family-app) !important; display: flex; align-items: center; gap: 6px;">
                  <span style="font-family: var(--font-family-app) !important;">Sub-Modules:</span>
                  <span style="display: flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; border-radius: 50%; background: rgba(0, 229, 255, 0.18); border: 1px solid rgba(0, 229, 255, 0.3); font-size: 0.75rem; font-weight: 700; color: var(--accent); font-family: var(--font-family-app) !important; padding: 0 4px;">
                    ${semesterSubmodules.length}
                  </span>
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
      container.querySelectorAll('.syll-check, .syllabus-sync-checkbox').forEach(chk => {
        chk.addEventListener('change', async () => {
          const subId = chk.getAttribute('data-sub-id');
          const idx = parseInt(chk.getAttribute('data-idx'));
          const isChecked = chk.checked;
          
          // Apply typography style state directly to the checkbox label span and parent wrapper
          const labelSpan = chk.nextElementSibling;
          if (labelSpan) {
            labelSpan.style.textDecoration = isChecked ? 'line-through' : 'none';
          }
          const parentLabel = chk.parentElement;
          if (parentLabel) {
            parentLabel.style.color = isChecked ? 'var(--text-secondary)' : 'var(--text-primary)';
          }

          await this._toggleCheckpoint(subId, idx, isChecked);
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
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          if (await window.authenticateDestructiveAction('Are you sure you want to completely delete this subject?')) {
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
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          if (await window.authenticateDestructiveAction('Are you sure you want to delete this sub-module?')) {
            this.handleDeleteSubModule(id);
          }
        });
      });

      // Restore expanded wrappers
      expandedCodes.forEach(code => {
        const wrapper = document.getElementById(`submodules-wrapper-${code}`);
        if (wrapper) {
          wrapper.style.display = 'block';
        }
        const btn = container.querySelector(`.toggle-submodules-btn[data-code="${code}"]`);
        if (btn) {
          const arrow = btn.querySelector('.arrow-indicator');
          if (arrow) arrow.textContent = '▲';
        }
      });

    } catch (err) {
      console.error('Render subjects failed:', err);
    }
  },

  async _toggleCheckpoint(subId, idx, checked) {
    this._isTogglingCheckpoint = true;
    try {
      const allSubjects = await originalGetAll.call(Database, 'subjects');
      let targetParent = null;
      let submodule = null;
      let subIdx = -1;

      for (const parent of allSubjects) {
        if (parent.isParent && Array.isArray(parent.submodules)) {
          const index = parent.submodules.findIndex(s => s.id === subId);
          if (index !== -1) {
            targetParent = parent;
            submodule = parent.submodules[index];
            subIdx = index;
            break;
          }
        }
      }

      if (!targetParent || !submodule) {
        // Fallback for flat subjects
        const flatSub = allSubjects.find(s => s.code === subId || s.id === subId);
        if (flatSub) {
          if (!Array.isArray(flatSub.syllabusCheckpoints) || flatSub.syllabusCheckpoints.length === 0) {
            flatSub.syllabusCheckpoints = DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
          }
          if (flatSub.syllabusCheckpoints[idx]) {
            flatSub.syllabusCheckpoints[idx].done = checked;
          }
          await originalPut.call(Database, 'subjects', flatSub);
          
          const progressLabel = document.querySelector(`.syllabus-progress-header[data-sub-id="${subId}"]`);
          const progressBar = document.getElementById(`tracker-bar-${subId}`);
          const doneCount = flatSub.syllabusCheckpoints.filter(c => c.done).length;
          const pct = Math.round((doneCount / flatSub.syllabusCheckpoints.length) * 100);

          if (progressLabel) {
            progressLabel.innerText = `Syllabus Progress: ${doneCount}/${flatSub.syllabusCheckpoints.length} topics (${pct}%)`;
          }
          if (progressBar) {
            progressBar.style.width = `${pct}%`;
          }
          const allDone = flatSub.syllabusCheckpoints.every(c => c.done);
          if (allDone) {
            NotificationService.show('Syllabus Complete!', `All topics covered for "${flatSub.moduleTitle || flatSub.name}". Excellent work!`, 'success');
          }
        }
        return;
      }

      if (!Array.isArray(submodule.syllabusCheckpoints) || submodule.syllabusCheckpoints.length === 0) {
        submodule.syllabusCheckpoints = DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false }));
      }

      if (submodule.syllabusCheckpoints[idx]) {
        submodule.syllabusCheckpoints[idx].done = checked;
      }

      targetParent.submodules[subIdx] = submodule;

      // Isolated data commit pass using originalPut to avoid subjectsUpdated event trigger
      await originalPut.call(Database, 'subjects', targetParent);

      // Programmatically update the progress bar and label text in the DOM instantly
      const progressLabel = document.querySelector(`.syllabus-progress-header[data-sub-id="${subId}"]`);
      const progressBar = document.getElementById(`tracker-bar-${subId}`);
      
      const doneCount = submodule.syllabusCheckpoints.filter(c => c.done).length;
      const pct = Math.round((doneCount / submodule.syllabusCheckpoints.length) * 100);

      if (progressLabel) {
        progressLabel.innerText = `Syllabus Progress: ${doneCount}/${submodule.syllabusCheckpoints.length} topics (${pct}%)`;
      }
      if (progressBar) {
        progressBar.style.width = `${pct}%`;
      }

      // If all done, show notification
      const allDone = submodule.syllabusCheckpoints.every(c => c.done);
      if (allDone) {
        NotificationService.show('Syllabus Complete!', `All topics covered for "${submodule.moduleTitle}". Excellent work!`, 'success');
      }
    } catch (err) {
      console.error('Toggle syllabus checkpoint failed:', err);
    } finally {
      this._isTogglingCheckpoint = false;
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
          document.getElementById('sub-department').value = sub.department || '';
          document.getElementById('sub-year').value = sub.year || '1';
          document.getElementById('sub-semester').value = sub.semester || '1';
          document.getElementById('sub-credits').value = sub.credits !== undefined ? sub.credits : '';
          document.getElementById('sub-type').value = sub.courseType || 'CORE';
          document.getElementById('sub-prerequisites').value = Array.isArray(sub.prerequisites) ? sub.prerequisites.join(', ') : '';
          document.getElementById('sub-corequisites').value = Array.isArray(sub.corequisites) ? sub.corequisites.join(', ') : '';
        }
      } catch (err) {
        console.error('Load subject details failed:', err);
      }
    } else {
      codeInput.removeAttribute('readonly');
      // Set explicit defaults for add mode
      document.getElementById('sub-department').value = '';
      document.getElementById('sub-year').value = '1';
      document.getElementById('sub-semester').value = '1';
      document.getElementById('sub-credits').value = '';
      document.getElementById('sub-type').value = 'CORE';
      document.getElementById('sub-prerequisites').value = '';
      document.getElementById('sub-corequisites').value = '';
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

    const codeRegex = /^[A-Z]{3}\s\d{4}$/;
    if (!codeRegex.test(code)) {
      alert('Course Code must be in the format "ABC 1234" (e.g. CHE 1201).');
      return;
    }

    const department = document.getElementById('sub-department').value.trim();
    const year = document.getElementById('sub-year').value;
    const semester = document.getElementById('sub-semester').value;
    const creditsVal = document.getElementById('sub-credits').value.trim();
    const credits = creditsVal ? parseInt(creditsVal, 10) : 0;
    const courseType = document.getElementById('sub-type').value;

    const validCourseTypes = ['CORE', 'FDN', 'IDC', 'OPTIONAL'];
    if (!validCourseTypes.includes(courseType)) {
      alert('Invalid Course Type selected.');
      return;
    }

    const prerequisitesRaw = document.getElementById('sub-prerequisites').value || '';
    const corequisitesRaw = document.getElementById('sub-corequisites').value || '';
    const prerequisites = prerequisitesRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const corequisites = corequisitesRaw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    const subjectData = {
      code,
      name,
      description,
      subjectCode: code,
      subjectTitle: name,
      subjectDescription: description,
      courseCode: code,
      courseTitle: name,
      department,
      year,
      semester,
      credits,
      courseType,
      prerequisites,
      corequisites,
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
          courseCode: code,
          courseTitle: name,
          department,
          year,
          semester,
          credits,
          courseType,
          prerequisites,
          corequisites,
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
    await this.populatePrereqAndCoreqDropdowns(id);

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
          document.getElementById('module-prerequisite').value = sub.prerequisite || '';
          document.getElementById('module-corequisite').value = sub.corequisite || '';

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
      document.getElementById('module-prerequisite').value = '';
      document.getElementById('module-corequisite').value = '';
      document.getElementById('module-ca-marks').value = '0';
      document.getElementById('module-quiz-marks').value = '0';
      document.getElementById('module-lab-marks').value = '0';
    }

    modal.classList.add('visible');
  },

  async populatePrereqAndCoreqDropdowns(currentId = null) {
    const prereqSelect = document.getElementById('module-prerequisite');
    const coreqSelect = document.getElementById('module-corequisite');
    if (!prereqSelect || !coreqSelect) return;

    try {
      const allSubmodules = await Database.getAll('researchProject/modules');
      let optionsHtml = '<option value="">None</option>';
      allSubmodules.forEach(sub => {
        if (sub.id !== currentId) {
          optionsHtml += `<option value="${sub.id}">${sub.moduleTitle} (${sub.semester})</option>`;
        }
      });
      prereqSelect.innerHTML = optionsHtml;
      coreqSelect.innerHTML = optionsHtml;
    } catch (err) {
      console.error('Failed to populate dropdowns:', err);
    }
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
    const prerequisite = document.getElementById('module-prerequisite').value;
    const corequisite = document.getElementById('module-corequisite').value;

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
      // 8.7 Hand Book validation check: Prerequisite
      if (prerequisite) {
        const prereqModule = await Database.get('subjects', prerequisite);
        const validGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D'];
        if (!prereqModule || !prereqModule.grade || !validGrades.includes(prereqModule.grade)) {
          NotificationService.show('Enrolment Failure', 'Required Pre-requisite Module Core Grade Point is below D limit', 'error');
          return;
        }
      }

      // 8.7 Hand Book validation check: Co-requisite
      if (corequisite) {
        const coreqModule = await Database.get('subjects', corequisite);
        if (!coreqModule || coreqModule.semester !== semester) {
          NotificationService.show('Enrolment Failure', 'Theory and Laboratory co-requisites must be logged concurrently for this semester.', 'error');
          return;
        }
      }

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
        prerequisite,
        corequisite,
        grade: existingSub.grade || '',
        gradePoint: existingSub.gradePoint !== undefined ? existingSub.gradePoint : (existingSub.grade && GRADE_MAP[existingSub.grade] !== undefined ? GRADE_MAP[existingSub.grade] : 0.00),
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
