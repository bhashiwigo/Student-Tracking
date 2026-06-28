/**
 * Rajarata Campus Life Manager - Academic Modules
 * Handles Semester, Course Unit, and Lecturer Information
 * UPGRADED: Syllabus checkpoint arrays, completion progress rings, topic milestone tracking
 * DECOUPLED: Decouples parent Subject metadata from child Sub-Module operational parameters
 */

import { Database, getDegreeConfig, DegreeRequirements } from '../database/db.js';
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
              submoduleCode: sub.submoduleCode || '',
              name: sub.moduleTitle,
              moduleTitle: sub.moduleTitle,
              credits: sub.credits,
              semester: sub.semester,
              lecturer: sub.lecturerName,
              lecturerName: sub.lecturerName || '',
              info: sub.lecturerContact,
              lecturerContact: sub.lecturerContact || '',
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
              studyMinutes: sub.studyMinutes || 0,
              lectureSchedule: sub.lectureSchedule || []
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
                submoduleCode: sub.submoduleCode || '',
                name: sub.moduleTitle,
                moduleTitle: sub.moduleTitle,
                credits: sub.credits,
                semester: sub.semester,
                lecturer: sub.lecturerName,
                lecturerName: sub.lecturerName || '',
                info: sub.lecturerContact,
                lecturerContact: sub.lecturerContact || '',
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
                studyMinutes: sub.studyMinutes || 0,
                lectureSchedule: sub.lectureSchedule || []
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
          submoduleCode: value.submoduleCode || '',
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
          studyMinutes: value.studyMinutes || 0,
          lectureSchedule: value.lectureSchedule || []
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
          submoduleCode: value.submoduleCode || '',
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
          studyMinutes: value.studyMinutes || 0,
          lectureSchedule: value.lectureSchedule || []
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
  complianceTokens: null,

  async init() {
    this.bindEvents();
    await this.initializeConfig();
    await this.updateAcademicMetrics();
  },

  async initializeConfig() {
    try {
      let activeProjectCodes = await Database.get('settings', 'activeProjectCodes');
      if (!activeProjectCodes) {
        activeProjectCodes = { key: 'activeProjectCodes', value: ['COM 3405', 'ICT 3411'] };
        await Database.put('settings', activeProjectCodes);
      }
      let complianceWeighting = await Database.get('settings', 'complianceWeighting');
      if (!complianceWeighting) {
        complianceWeighting = { key: 'complianceWeighting', value: { gpa: 70, enrichment: 15, sports: 5, project: 5, interview: 5 } };
        await Database.put('settings', complianceWeighting);
      }
      this.complianceTokens = {
        activeProjectCodes: activeProjectCodes.value,
        complianceWeighting: complianceWeighting.value
      };
    } catch (err) {
      console.error('Failed to initialize compliance configurations:', err);
    }
  },

  async getComplianceTokens() {
    try {
      const projectCodes = await Database.get('settings', 'activeProjectCodes');
      const weights = await Database.get('settings', 'complianceWeighting');
      const result = {
        activeProjectCodes: (projectCodes && projectCodes.value) || ['COM 3405', 'ICT 3411'],
        complianceWeighting: (weights && weights.value) || { gpa: 70, enrichment: 15, sports: 5, project: 5, interview: 5 }
      };
      this.complianceTokens = result;
      return result;
    } catch (err) {
      console.error('Error fetching compliance tokens:', err);
      return {
        activeProjectCodes: ['COM 3405', 'ICT 3411'],
        complianceWeighting: { gpa: 70, enrichment: 15, sports: 5, project: 5, interview: 5 }
      };
    }
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

    const editVivaBtn = document.getElementById('btn-edit-viva-score');
    const inlineVivaInput = document.getElementById('input-viva-score-inline');

    if (editVivaBtn && inlineVivaInput) {
      // Setup event handler to unroll input field upon edit trigger click
      editVivaBtn.onclick = async (e) => {
        e.stopPropagation();
        const isHidden = inlineVivaInput.style.display === 'none';
        inlineVivaInput.style.display = isHidden ? 'inline-block' : 'none';
        editVivaBtn.textContent = isHidden ? 'Save' : 'Edit Marks';
        if (!isHidden) {
          const tokens = await this.getComplianceTokens();
          const maxInterview = (tokens && tokens.complianceWeighting && tokens.complianceWeighting.interview) !== undefined
            ? tokens.complianceWeighting.interview
            : 5;
          const enteredVal = Math.min(Math.max(parseFloat(inlineVivaInput.value) || 0, 0), maxInterview);
          localStorage.setItem('rusl_viva_score', enteredVal);
          inlineVivaInput.style.display = 'none';
          // Re-trigger the whole master dashboard calculator flow pass
          this.updateAcademicView(); 
        } else {
          inlineVivaInput.value = localStorage.getItem('rusl_viva_score') || '0';
          inlineVivaInput.focus();
        }
      };
    }

    const subCodeInput = document.getElementById('submodule-code-input');
    const projectMarkGroup = document.getElementById('project-final-mark-group');
    if (subCodeInput && projectMarkGroup) {
      subCodeInput.addEventListener('input', (e) => {
        const val = e.target.value;
        const projectCodes = (AcademicModule.complianceTokens && AcademicModule.complianceTokens.activeProjectCodes) || ['COM 3405', 'ICT 3411'];
        if (projectCodes.some(code => val.includes(code))) {
          projectMarkGroup.style.setProperty('display', 'block', 'important');
        } else {
          projectMarkGroup.style.display = 'none';
        }
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

    window.addEventListener('subjectsUpdated', () => {
      this.syncHUD();
      this.updateAcademicMetrics();
    });

    window.addEventListener('configUpdate', () => {
      this.updateAcademicMetrics();
      this.syncHUD();
    });

    window.addEventListener('saveSubject', () => {
      this.updateAcademicMetrics();
    });

    window.addEventListener('saveModule', () => {
      this.updateAcademicMetrics();
    });

    const subModuleListContainer = document.querySelector('.sub-module-list-container');
    if (subModuleListContainer) {
      subModuleListContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.schedule-lecture-btn');
        if (btn) {
          e.preventDefault();
          const id = btn.dataset.id || btn.getAttribute('data-id');
          console.log("Opening schedule for:", id);
          this.openScheduleModal(id);
        }
      });
    }

    this.bindScheduleEvents();
  },

  _calcSyllabusCompletion(checkpoints) {
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) return 0;
    const done = checkpoints.filter(cp => cp.done).length;
    return Math.round((done / checkpoints.length) * 100);
  },

  // ── moduleHistory helpers ─────────────────────────────────────────────────
  // Persists module lifecycle events (completion timestamps) to localStorage.
  // Key: 'uni_life_history'  |  Shape: { [moduleId]: { completedAt: ISO string } }

  _loadModuleHistory() {
    try {
      return JSON.parse(localStorage.getItem('uni_life_history') || '{}');
    } catch {
      return {};
    }
  },

  _saveModuleHistory(history) {
    try {
      localStorage.setItem('uni_life_history', JSON.stringify(history));
    } catch (err) {
      console.warn('Could not persist moduleHistory:', err);
    }
  },

  /**
   * checkModuleCompletion(sub)
   * Considers a sub-module "completed" when:
   *   - Every syllabus checkpoint is ticked, AND
   *   - A final grade has been recorded.
   * On first detection, stamps a completedAt timestamp into moduleHistory.
   * Returns: boolean
   */
  checkModuleCompletion(sub) {
    const allCheckpointsDone =
      Array.isArray(sub.syllabusCheckpoints) &&
      sub.syllabusCheckpoints.length > 0 &&
      sub.syllabusCheckpoints.every(cp => cp.done);
    const hasGrade = !!(sub.grade && sub.grade.trim());
    const isComplete = allCheckpointsDone && hasGrade;

    if (isComplete) {
      // Persist completion event if not already recorded
      const history = this._loadModuleHistory();
      if (!history[sub.id]) {
        history[sub.id] = { completedAt: new Date().toISOString() };
        this._saveModuleHistory(history);
      }
    }

    return isComplete;
  },

  /**
   * _getModuleStatus(sub)
   * Drives the status badge decision tree based on the new lectureSchedule array:
   *   Filters out past lectures, finds the closest future lecture, and maps:
   *   'completed'    — no future lectures, and sub-module is complete (checkpoints + grade)
   *   'today'        — next lecture is today (within next 24h OR just passed today)
   *   'tomorrow'     — next lecture is tomorrow
   *   'future'       — next lecture is 2+ days away
   *   'none'         — no upcoming lectures and not completed
   *
   * Returns: { type: string, label: string, fullDate: string, venue: string }
   */
  _getModuleStatus(sub) {
    const now = new Date();
    let closestFuture = null;
    let closestTimeDiff = Infinity;

    if (Array.isArray(sub.lectureSchedule) && sub.lectureSchedule.length > 0) {
      sub.lectureSchedule.forEach(s => {
        if (!s.date || !s.time) return;
        const schedDate = new Date(`${s.date}T${s.time}`);
        if (isNaN(schedDate.getTime())) return;

        const diff = schedDate.getTime() - now.getTime();
        // Filter out past lectures (meaning they occurred before right now)
        if (diff >= 0) {
          if (diff < closestTimeDiff) {
            closestTimeDiff = diff;
            closestFuture = { ...s, dateTime: schedDate };
          }
        }
      });
    }

    if (closestFuture) {
      const lectureDate = closestFuture.dateTime;
      
      // Compute midnight boundaries
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const dayAfterTomorrow = new Date(tomorrowStart);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

      const label = this._formatNextLectureLabel(lectureDate);
      const fullDate = lectureDate.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
      }) + (closestFuture.venue ? ` @ ${closestFuture.venue}` : '');

      if (closestFuture.venue) {
        label.venue = closestFuture.venue;
      }

      if (lectureDate >= todayStart && lectureDate < tomorrowStart) {
        return { 
          type: 'today', 
          label: `Today · ${lectureDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`, 
          fullDate,
          venue: closestFuture.venue || ''
        };
      }
      if (lectureDate >= tomorrowStart && lectureDate < dayAfterTomorrow) {
        return { 
          type: 'tomorrow', 
          label: `Tomorrow · ${lectureDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`, 
          fullDate,
          venue: closestFuture.venue || ''
        };
      }
      return { 
        type: 'future', 
        label, 
        fullDate,
        venue: closestFuture.venue || ''
      };
    }

    // Fallback: completed beats empty/past schedule
    if (this.checkModuleCompletion(sub)) {
      return { type: 'completed', label: 'Completed', fullDate: '', venue: '' };
    }

    return { type: 'none', label: '', fullDate: '', venue: '' };
  },

  /**
   * _formatNextLectureLabel(date)
   * Produces a ≤22-character display string: "Mon, 30 Jun · 08:00"
   * Truncation protects card layout integrity.
   */
  _formatNextLectureLabel(date) {
    const formatted = date.toLocaleString(undefined, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit'
    });
    return formatted.length > 22 ? formatted.slice(0, 21) + '…' : formatted;
  },

  async calculateBest65CreditGPA() {
    try {
      const submodules = await Database.getAll('subjects');
      const gradeMap = {
        'A+': 4.00, 'A': 4.00, 'A-': 3.70,
        'B+': 3.30, 'B': 3.00, 'B-': 2.70,
        'C+': 2.30, 'C': 2.00, 'C-': 1.70,
        'D+': 1.30, 'D': 1.00, 'E': 0.00
      };
      
      const gradedSubs = (submodules || [])
        .filter(s => s.grade && gradeMap[s.grade] !== undefined && (s.credits || 0) > 0)
        .map(s => ({
          credits: parseFloat(s.credits) || 0,
          gp: gradeMap[s.grade],
          isCompulsory: s.isCompulsory === true || s.type === 'CORE'
        }));
      
      const compulsorySubs = gradedSubs.filter(s => s.isCompulsory);
      const optionalSubs = gradedSubs.filter(s => !s.isCompulsory);
      
      let accumulatedCredits = 0;
      let accumulatedGP = 0;
      
      // Add all compulsory subjects first
      for (const s of compulsorySubs) {
        accumulatedCredits += s.credits;
        accumulatedGP += s.gp * s.credits;
      }
      
      if (accumulatedCredits > 65) {
        // If compulsory subjects exceed 65 credits, take the best 65 credits of compulsory subjects
        compulsorySubs.sort((a, b) => b.gp - a.gp);
        let cappedCredits = 0;
        let cappedGP = 0;
        for (const s of compulsorySubs) {
          if (cappedCredits + s.credits <= 65) {
            cappedCredits += s.credits;
            cappedGP += s.gp * s.credits;
          } else {
            const remaining = 65 - cappedCredits;
            cappedCredits += remaining;
            cappedGP += s.gp * remaining;
            break;
          }
        }
        accumulatedCredits = cappedCredits;
        accumulatedGP = cappedGP;
      } else if (accumulatedCredits < 65) {
        // If compulsory subjects are less than 65 credits, fill the rest with best optional/elective subjects
        optionalSubs.sort((a, b) => b.gp - a.gp);
        for (const s of optionalSubs) {
          if (accumulatedCredits + s.credits <= 65) {
            accumulatedCredits += s.credits;
            accumulatedGP += s.gp * s.credits;
          } else {
            const remaining = 65 - accumulatedCredits;
            accumulatedCredits += remaining;
            accumulatedGP += s.gp * remaining;
            break;
          }
        }
      }
      
      return accumulatedCredits > 0 ? (accumulatedGP / accumulatedCredits) : 0.00;
    } catch (err) {
      console.error("Failed to calculate best 65 credit GPA:", err);
      return 0.00;
    }
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

  async calculateCredits() {
    try {
      const [rawSubjects, allSubmodules] = await Promise.all([
        originalGetAll.call(Database, 'subjects'),
        Database.getAll('subjects')
      ]);

      const subjectTypeMap = {};
      (rawSubjects || []).forEach(s => {
        if (s.isParent) {
          subjectTypeMap[s.code] = (s.courseType || s.type || 'CORE').toUpperCase();
        }
      });

      let completedCredits = 0;
      let remainingCredits = 0;
      let coreCredits = 0;
      let optionalCredits = 0;

      (allSubmodules || []).forEach(sub => {
        const credits = Number(sub.credits) || 0;
        let typeStr = 'CORE';
        if (sub.isSubmodule && sub.parentSubjectCode) {
          typeStr = subjectTypeMap[sub.parentSubjectCode] || 'CORE';
        } else {
          typeStr = (sub.courseType || sub.type || 'CORE').toUpperCase();
        }

        if (sub.grade && sub.grade !== 'RESET_UNDEFINED') {
          completedCredits += credits;
        } else {
          remainingCredits += credits;
        }

        if (typeStr === 'OPTIONAL') {
          optionalCredits += credits;
        } else {
          coreCredits += credits;
        }
      });

      return {
        completedCredits,
        remainingCredits,
        coreCredits,
        optionalCredits
      };
    } catch (err) {
      console.error('Error calculating credits:', err);
      return {
        completedCredits: 0,
        remainingCredits: 0,
        coreCredits: 0,
        optionalCredits: 0
      };
    }
  },

  async updateAcademicMetrics() {
    try {
      const { completedCredits, remainingCredits, coreCredits, optionalCredits } = await this.calculateCredits();
      const config = await getDegreeConfig();
      const cgpaStats = await this._getGPADetails();
      
      const isHonours = cgpaStats.threeYearCGPA >= 3.00;
      const targetCredits = isHonours ? config.honoursTotal : config.bscTotal;
      const trackLabel = isHonours ? 'Honours Track Progress' : 'BSc Track Progress';

      const compCrEl = document.getElementById('progress-completed-credits');
      if (compCrEl) compCrEl.innerText = `${completedCredits} Cr`;

      // Compute progress % based on total curriculum credits from configuration settings
      const progressPct = Math.min(100, (completedCredits / targetCredits) * 100);

      // Remaining credits towards the target baseline
      const remCrEl = document.getElementById('progress-remaining-credits');
      if (remCrEl) {
        const remainingVal = Math.max(0, targetCredits - completedCredits);
        remCrEl.innerText = `${remainingVal} Cr`;
      }

      const pctEl = document.getElementById('progress-completion-pct');
      if (pctEl) pctEl.innerText = `${progressPct.toFixed(1)}%`;

      const fillEl = document.getElementById('progress-completion-fill');
      if (fillEl) fillEl.style.width = `${progressPct}%`;

      const ratioEl = document.getElementById('progress-core-optional-ratio');
      if (ratioEl) {
        ratioEl.innerText = `Core: ${coreCredits} Cr | Optional: ${optionalCredits} Cr`;
      }

      // Degree Standing Logic
      let standing = 'Year 1 General';
      if (completedCredits >= config.honoursTotal) {
        standing = 'Final Year';
      } else if (completedCredits > (config.bscTotal * 2 / 3)) { // dynamic threshold
        standing = 'Year 2';
      } else {
        standing = 'Year 1 General';
      }

      const standingEl = document.getElementById('progress-degree-standing');
      if (standingEl) {
        standingEl.innerText = standing;
      }

      // Dynamic track text: BSc Track Progress (0 / 90 Cr)
      const labelEl = document.getElementById('progress-completion-label');
      if (labelEl) {
        labelEl.innerText = `${trackLabel} (${completedCredits} / ${targetCredits} Cr)`;
      }

      // Update active semester modules count
      const activeModulesEl = document.getElementById('progress-active-modules');
      if (activeModulesEl) {
        const semSetting = await Database.get('settings', 'currentSemester');
        const activeSemester = semSetting ? semSetting.value : '1-1';
        const allSubmodules = await Database.getAll('subjects');
        const activeSemesterSubmodules = (allSubmodules || []).filter(sub => sub.isSubmodule && sub.semester === activeSemester);
        activeModulesEl.innerText = `${activeSemesterSubmodules.length} Active Units`;
      }

    } catch (err) {
      console.error('Error updating academic metrics HUD:', err);
    }
  },

  async syncHUD() {
    try {
      const stats = await this._getGPADetails();
      await this.updateSpecialEligibilityHUD(stats);
    } catch (err) {
      console.error("Failed to sync HUD:", err);
    }
  },

  async updateSpecialEligibilityHUD(stats) {
    if (!stats) {
      stats = await this._getGPADetails();
    }
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
      const submodules = await Database.getAll('subjects');
      const sports = await Database.getAll('sports');
      const tokens = await this.getComplianceTokens();
      const weights = tokens.complianceWeighting;
      const projectCodes = tokens.activeProjectCodes;

      // 1. GPA Segment (Dynamic Max Weight): GPA for best 65 credits of graded sub-modules.
      const best65GPA = await this.calculateBest65CreditGPA();
      const gpaPart = Math.min((best65GPA / 4.0) * weights.gpa, weights.gpa);

      // 2. Sports Achievement Segment (Dynamic Max Weight): Mapped via sum of achievements
      let sportsScore = 0;
      (sports || []).forEach(s => {
        let score = 0;
        const comp = s.competitionLevel;
        const ach = s.achievementLevel;
        if (comp === 'National') {
          if (ach === 'Winner') score = 5.0;
          else if (ach === '1st Runner-up') score = 4.0;
          else if (ach === '2nd Runner-up') score = 3.5;
          else if (ach === 'Participation') score = 2.5;
        } else if (comp === 'University') {
          if (ach === 'Winner') score = 3.0;
          else if (ach === '1st Runner-up' || ach === '2nd Runner-up' || ach === 'Runner-up') score = 2.0;
          else if (ach === 'Participation') score = 1.0;
        } else if (comp === 'Provincial/School' || comp === 'Provincial' || comp === 'School') {
          if (ach === 'Participation') score = 0.5;
        }
        sportsScore += score;
      });
      const sportsPart = Math.min(sportsScore, weights.sports);

      // 3. Group Project Segment (Dynamic Max Weight): evaluates (projectMark/100)*weight or falls back.
      const projectSub = (submodules || []).find(s => 
        s.isProject === true ||
        (s.submoduleCode && projectCodes.some(code => s.submoduleCode.includes(code))) ||
        (s.id && projectCodes.some(code => s.id.includes(code))) ||
        (s.moduleTitle && projectCodes.some(code => s.moduleTitle.includes(code)))
      );
      
      let projectPart = 0;
      if (projectSub && projectSub.projectMark !== undefined && projectSub.projectMark !== null && projectSub.projectMark !== '') {
        projectPart = (parseFloat(projectSub.projectMark) / 100) * weights.project;
      }

      // 4. Academic Enrichment Segment (Dynamic Max Weight): voluntary, hackathon, industry engagement.
      const profile = await Database.get('students', 'profile');
      const enrichment = (profile && profile.enrichment) || { hackathons: 0, societies: 0, industry: 0 };
      const hackathons = Math.min(parseInt(enrichment.hackathons) || 0, 8);
      const societies = Math.min(parseInt(enrichment.societies) || 0, 2);
      const industry = Math.min(parseInt(enrichment.industry) || 0, 5);
      const enrichmentPart = Math.min(hackathons + societies + industry, weights.enrichment);

      // 5. Interview Performance Segment (Dynamic Max Weight): Read contextually from localStorage.
      const vivaPart = Math.min(parseFloat(localStorage.getItem('rusl_viva_score')) || 0.0, weights.interview);

      const finalInterviewSum = Math.min(parseFloat((gpaPart + sportsPart + projectPart + enrichmentPart + vivaPart).toFixed(1)), 100.0);

      // Update UI elements
      const interviewText = document.getElementById('hud-interview-score-text');
      const interviewFill = document.getElementById('hud-interview-score-fill');
      
      const partGPA = document.getElementById('hud-interview-gpa-part');
      const partSports = document.getElementById('hud-interview-sports-part');
      const partProject = document.getElementById('hud-interview-project-part');
      const partEnrichment = document.getElementById('hud-interview-enrichment-part');
      const partPanel = document.getElementById('hud-interview-panel-part');
      const inlineVivaInput = document.getElementById('input-viva-score-inline');

      if (inlineVivaInput) {
        inlineVivaInput.value = vivaPart;
        inlineVivaInput.setAttribute('max', weights.interview);
      }

      if (interviewText) interviewText.textContent = `${finalInterviewSum.toFixed(1)}%`;
      if (interviewFill) interviewFill.style.width = `${finalInterviewSum}%`;

      if (partGPA) partGPA.textContent = `GPA (65 Cr, ${weights.gpa}% max): ${gpaPart.toFixed(1)}%`;
      if (partSports) partSports.textContent = `Sports Achievement (${weights.sports}% max): ${sportsPart.toFixed(1)}%`;
      if (partProject) partProject.textContent = `Group Project (${projectCodes.join('/')}) (${weights.project}% max): ${projectPart.toFixed(1)}%`;
      if (partEnrichment) partEnrichment.textContent = `Academic Enrichment (${weights.enrichment}% max): ${enrichmentPart.toFixed(1)}%`;
      if (partPanel) partPanel.textContent = `Interview Performance (${weights.interview}% max): ${vivaPart.toFixed(1)}%`;

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

  async renderSubjects() {
    await this.render();
  },

  async updateAcademicView() {
    try {
      const stats = await this._getGPADetails();
      await this.updateSpecialEligibilityHUD(stats);
    } catch (err) {
      console.error("Failed to update academic view:", err);
    }
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
      const activeFilterValue = document.getElementById('subject-semester-filter').value; // e.g., "1-1", "1-2"
      const [filterYear, filterSemester] = activeFilterValue.split('-');

      const filteredSubjects = allSubjects.filter(subj => {
        return String(subj.year) === String(filterYear) && String(subj.semester) === String(filterSemester);
      });

      if (filteredSubjects.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No custom subject units logged for this semester. Click '+ Add Subject' to configure your academic roadmap.
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

      container.innerHTML = filteredSubjects.map(parent => {
        const semesterSubmodules = allSubmodules.filter(s => s.parentSubjectCode === parent.code);

        const subject = parent;
        subject.id = parent.code;
        const allSubModules = allSubmodules.map(mod => {
          mod.parentSubjectId = mod.parentSubjectCode;
          return mod;
        });

        // Contextually load all sub-modules linked to this specific parent subject ID
        const relatedSubModules = allSubModules.filter(mod => mod.parentSubjectId === subject.id);

        // Mathematically accumulate total credits automatically
        const computedTotalCredits = relatedSubModules.reduce((sum, mod) => sum + (Number(mod.credits) || 0), 0);
        
        const lookupGPValue = (grade) => {
          const scale = {
            'A+': 4.00, 'A': 4.00, 'A-': 3.70,
            'B+': 3.30, 'B': 3.00, 'B-': 2.70,
            'C+': 2.30, 'C': 2.00, 'C-': 1.70,
            'D+': 1.30, 'D': 1.00, 'E': 0.00
          };
          return scale[grade] !== undefined ? scale[grade] : 0.00;
        };

        const allSavedResults = allSubModules.map(res => {
          res.submoduleId = res.id;
          res.subjectId = res.id;
          return res;
        });

        // Track and collect all child module keys unrolled under this parent subject scope
        const childModules = allSubModules.filter(mod => mod.parentSubjectId === subject.id);
        
        let totalWeightedPoints = 0;
        let totalGradedCredits = 0;

        childModules.forEach(mod => {
          // Query if a final semester grade is registered for this specific submodule ID
          const gradeRecord = allSavedResults.find(res => res.submoduleId === mod.id || res.subjectId === mod.id);
          if (gradeRecord && gradeRecord.grade) {
            const gpValue = lookupGPValue(gradeRecord.grade); // Evaluates grade mapping scales safely
            const modCredits = Number(mod.credits) || 0;
            
            totalWeightedPoints += (gpValue * modCredits);
            totalGradedCredits += modCredits;
          }
        });

        // Calculate finalized outcome string block cleanly
        const calculatedCoreGPA = totalGradedCredits > 0 
          ? (totalWeightedPoints / totalGradedCredits).toFixed(2) 
          : "N/A";

        let submodulesHTML = '';
        if (semesterSubmodules.length === 0) {
          submodulesHTML = `
            <div class="no-modules-fallback" style="font-size: 0.85rem; color: var(--text-secondary); font-style: italic; padding: 16px; text-align: center; font-family: var(--font-family-app) !important;">
              No modules configured under this curriculum track for the selected active semester.
            </div>
          `;
        } else {
          submodulesHTML = semesterSubmodules.map(sub => this.renderSubModuleCard(sub, attendance)).join('');
        }

        return `
          <div class="card col-12" style="display: flex; flex-direction: column; gap: 16px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; padding: 24px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; width: 100%;">
              <div>
                ${parent.code.includes('_') || parent.code === parent.name 
                  ? `<h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent); margin: 0; font-family: var(--font-family-app) !important;">${parent.name}</h3>`
                  : `
                    <h3 style="font-size: 1.3rem; font-weight: 800; color: var(--accent); margin: 0; font-family: var(--font-family-app) !important;">${parent.code}</h3>
                    <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin-top: 4px; font-family: var(--font-family-app) !important;">${parent.name}</h4>
                  `}
              </div>
              <div style="display: flex; align-items: center; gap: 12px; font-family: var(--font-family-app) !important;">
                <span class="badge low" style="margin-right: 6px; background-color: var(--accent-glow); color: var(--accent); font-family: var(--font-family-app) !important;">Total Credits: ${computedTotalCredits} Cr</span>
                <span class="badge low" style="margin-right: 6px; background-color: var(--accent-glow); color: var(--accent); font-family: var(--font-family-app) !important;">Core GPA: ${calculatedCoreGPA}</span>
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



      // ── Midnight auto-refresh: re-evaluate badge states at 00:00 local ──
      // Clears any previously scheduled refresh to avoid stacking timers.
      if (this._midnightRefreshTimer) {
        clearTimeout(this._midnightRefreshTimer);
        this._midnightRefreshTimer = null;
      }
      const _now = new Date();
      const _midnight = new Date(_now);
      _midnight.setDate(_midnight.getDate() + 1);
      _midnight.setHours(0, 0, 5, 0); // 00:00:05 — 5s buffer past midnight
      const _msToMidnight = _midnight.getTime() - _now.getTime();
      this._midnightRefreshTimer = setTimeout(() => {
        this._midnightRefreshTimer = null;
        this.render(); // Full re-render triggers _getModuleStatus() with the new date
      }, _msToMidnight);

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
      if (codeInput && codeInput.type !== 'hidden') {
        codeInput.setAttribute('readonly', 'true');
      }
      try {
        const sub = await Database.get('subjects-raw', code);
        if (sub) {
          if (codeInput) codeInput.value = sub.code || '';
          document.getElementById('sub-name').value = sub.name || '';
          document.getElementById('sub-description').value = sub.description || '';
          document.getElementById('sub-department').value = sub.department || '';
          const semVal = `${sub.year || '1'}-${sub.semester || '1'}`;
          const unifiedSelect = document.getElementById('sub-year-semester-select');
          if (unifiedSelect) unifiedSelect.value = semVal;
          const creditsEl = document.getElementById('sub-credits');
          if (creditsEl) creditsEl.value = sub.credits !== undefined ? sub.credits : '';
          document.getElementById('sub-type').value = sub.courseType || 'CORE';
          document.getElementById('sub-prerequisites').value = Array.isArray(sub.prerequisites) ? sub.prerequisites.join(', ') : '';
          document.getElementById('sub-corequisites').value = Array.isArray(sub.corequisites) ? sub.corequisites.join(', ') : '';
        }
      } catch (err) {
        console.error('Load subject details failed:', err);
      }
    } else {
      if (codeInput) {
        if (codeInput.type !== 'hidden') {
          codeInput.removeAttribute('readonly');
        }
        codeInput.value = '';
      }
      // Set explicit defaults for add mode
      const filterVal = document.getElementById('subject-semester-filter') 
        ? document.getElementById('subject-semester-filter').value 
        : '1-1';
      document.getElementById('sub-department').value = '';
      const unifiedSelect = document.getElementById('sub-year-semester-select');
      if (unifiedSelect) unifiedSelect.value = filterVal;
      const creditsEl = document.getElementById('sub-credits');
      if (creditsEl) creditsEl.value = '';
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
    const name = document.getElementById('sub-name').value.trim();

    const yearSemesterVal = document.getElementById('sub-year-semester-select').value;
    const splitVal = yearSemesterVal.split('-');
    const subj = {};
    subj.year = splitVal[0];
    subj.semester = splitVal[1];

    const year = subj.year;
    const semester = subj.semester;

    const compositeSubjectId = `${name}_${year}-${semester}`;
    const code = mode === 'add' ? compositeSubjectId : document.getElementById('sub-code').value.trim();
    const description = document.getElementById('sub-description').value.trim();

    if (!name) {
      alert('Subject Title is required.');
      return;
    }

    const department = document.getElementById('sub-department').value.trim();
    const creditsEl = document.getElementById('sub-credits');
    const creditsVal = creditsEl ? creditsEl.value.trim() : '';
    const credits = creditsVal ? parseInt(creditsVal, 10) : 0;
    const courseType = document.getElementById('sub-type').value;

    const validCourseTypes = ['CORE', 'FDN', 'IDC', 'OPTIONAL'];
    if (!validCourseTypes.includes(courseType)) {
      alert('Invalid Course Type selected.');
      return;
    }

    const prerequisitesRaw = document.getElementById('sub-prerequisites').value || '';
    const corequisitesRaw = document.getElementById('sub-corequisites').value || '';
    const prerequisites = prerequisitesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const corequisites = corequisitesRaw.split(',').map(s => s.trim()).filter(Boolean);

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
          if (document.getElementById('submodule-code-input')) {
            const subCode = sub.submoduleCode || '';
            document.getElementById('submodule-code-input').value = subCode;
            const projectMarkGroup = document.getElementById('project-final-mark-group');
            if (projectMarkGroup) {
              const projectCodes = (AcademicModule.complianceTokens && AcademicModule.complianceTokens.activeProjectCodes) || ['COM 3405', 'ICT 3411'];
              if (sub.isProject || projectCodes.some(code => subCode.includes(code))) {
                projectMarkGroup.style.setProperty('display', 'block', 'important');
              } else {
                projectMarkGroup.style.display = 'none';
              }
            }
          }
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

          const projectMarkEl = document.getElementById('module-project-mark');
          if (projectMarkEl) {
            projectMarkEl.value = sub.projectMark !== undefined ? sub.projectMark : '';
          }
        }
      } catch (err) {
        console.error('Load sub-module details failed:', err);
      }
    } else {
      if (document.getElementById('submodule-code-input')) {
        document.getElementById('submodule-code-input').value = '';
      }
      const projectMarkGroup = document.getElementById('project-final-mark-group');
      if (projectMarkGroup) {
        projectMarkGroup.style.display = 'none';
      }
      const projectMarkEl = document.getElementById('module-project-mark');
      if (projectMarkEl) {
        projectMarkEl.value = '';
      }
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
          const disp = sub.submoduleCode ? `${sub.submoduleCode} - ${sub.moduleTitle}` : sub.moduleTitle;
          optionsHtml += `<option value="${sub.id}">${disp} (${sub.semester})</option>`;
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
      const allSubjects = await originalGetAll.call(Database, 'subjects');
      
      const activeSemesterContext = document.getElementById('subject-semester-filter').value; // e.g., "1-1" or "1-2"
      const [currentYear, currentSemester] = activeSemesterContext.split('-');

      const contextFilteredSubjects = allSubjects.filter(subj => {
        return subj.isParent && String(subj.year) === String(currentYear) && String(subj.semester) === String(currentSemester);
      });

      select.innerHTML = '<option value="" disabled selected>Select Parent Subject...</option>';
      contextFilteredSubjects.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.code || sub.id;
        opt.innerText = sub.name || sub.title || '';
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
    const submoduleCode = document.getElementById('submodule-code-input') ? document.getElementById('submodule-code-input').value.trim() : '';
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

      const projectMarkEl = document.getElementById('module-project-mark');
      const projectCodes = (AcademicModule.complianceTokens && AcademicModule.complianceTokens.activeProjectCodes) || ['COM 3405', 'ICT 3411'];
      const isProject = (submoduleCode && projectCodes.some(code => submoduleCode.includes(code))) || 
                        (title && title.toLowerCase().includes('project')) || 
                        (submoduleCode && submoduleCode.toLowerCase().includes('project'));
      const isCompulsory = type === 'CORE';

      const projectMark = isProject && projectMarkEl
        ? parseFloat(projectMarkEl.value) || 0
        : undefined;

      const subData = {
        ...existingSub,
        code: id,
        id: id,
        submoduleCode,
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
        projectMark: projectMark,
        syllabusCheckpoints: existingSub.syllabusCheckpoints || DEFAULT_SYLLABUS_CHECKPOINTS.map(label => ({ label, done: false })),
        isProject: isProject,
        isCompulsory: isCompulsory
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

      if (window.AcademicModule) {
        window.AcademicModule.updateSpecialEligibilityHUD();
      }
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
  },

  // ── Standalone Schedule Management Modal ──────────────────────────────────
  async openScheduleModal(submoduleId) {
    const modal = document.getElementById('sub-module-schedule-modal');
    if (!modal) return;

    try {
      const sub = await Database.get('subjects', submoduleId);
      if (!sub) {
        console.error('Sub-module not found for scheduling:', submoduleId);
        return;
      }

      // Populate basic info
      document.getElementById('schedule-module-id').value = submoduleId;
      const titleEl = document.getElementById('schedule-modal-title');
      if (titleEl) {
        titleEl.textContent = `Schedules: ${sub.submoduleCode ? sub.submoduleCode + ' - ' : ''}${sub.moduleTitle || sub.name}`;
      }

      // Hide add form by default
      this.hideScheduleForm();

      // Render the schedules table
      const schedules = sub.lectureSchedule || [];
      this.renderScheduleTable(schedules);

      // Open the modal
      modal.classList.add('visible');
    } catch (err) {
      console.error('Failed to open schedule modal:', err);
    }
  },

  async renderScheduleTable(schedulesOrId) {
    const tbody = document.getElementById('schedule-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';

    let schedules = [];
    if (typeof schedulesOrId === 'string') {
      try {
        const sub = await Database.get('subjects', schedulesOrId);
        schedules = sub ? (sub.lectureSchedule || []) : [];
      } catch (err) {
        console.error('Failed to load schedules for table:', err);
      }
    } else {
      schedules = Array.isArray(schedulesOrId) ? schedulesOrId : [];
    }

    if (!Array.isArray(schedules) || schedules.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 20px; color: var(--text-secondary); font-style: italic;">
            No scheduled lectures logged.
          </td>
        </tr>`;
      return;
    }

    // Sort schedules chronologically by date and time
    const sorted = [...schedules].sort((a, b) => {
      const ad = new Date(`${a.date}T${a.time}`);
      const bd = new Date(`${b.date}T${b.time}`);
      return ad.getTime() - bd.getTime();
    });

    const submoduleId = document.getElementById('schedule-module-id').value;

    sorted.forEach(entry => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)';
      
      row.innerHTML = `
        <td style="padding: 10px 12px; color: var(--text-primary);">${entry.date}</td>
        <td style="padding: 10px 12px; color: var(--text-primary);">${entry.time}</td>
        <td style="padding: 10px 12px; color: var(--text-secondary);">${entry.venue || 'N/A'}</td>
        <td style="padding: 10px 12px; text-align: center;">
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="btn-outline btn-sm edit-schedule-btn" data-id="${entry.id}" style="padding: 4px 8px; font-size: 0.72rem; border-radius: 4px;">Edit</button>
            <button class="btn-outline btn-sm delete-schedule-btn" data-id="${entry.id}" data-sub-id="${submoduleId}" style="padding: 4px 8px; font-size: 0.72rem; border-radius: 4px; border-color: var(--danger); color: var(--danger);">Delete</button>
          </div>
        </td>
      `;
      tbody.appendChild(row);
    });

    // Wire actions inside the table
    tbody.querySelectorAll('.edit-schedule-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        this.editScheduleEntry(id);
      };
    });
  },

  showAddScheduleForm() {
    document.getElementById('schedule-entry-id').value = '';
    document.getElementById('schedule-date').value = '';
    document.getElementById('schedule-time').value = '';
    document.getElementById('schedule-venue').value = '';

    document.getElementById('schedule-form-title').textContent = 'Add Lecture Schedule';
    document.getElementById('schedule-form-container').style.display = 'block';
    document.getElementById('btn-show-add-schedule').style.display = 'none';
  },

  hideScheduleForm() {
    document.getElementById('schedule-form-container').style.display = 'none';
    document.getElementById('btn-show-add-schedule').style.display = 'block';
  },

  async saveScheduleEntry() {
    const moduleId = document.getElementById('schedule-module-id').value;
    const entryId = document.getElementById('schedule-entry-id').value;
    const date = document.getElementById('schedule-date').value;
    const time = document.getElementById('schedule-time').value;
    const venue = document.getElementById('schedule-venue').value.trim();

    if (!moduleId || !date || !time) {
      alert('Please select both a date and time.');
      return;
    }

    try {
      const sub = await Database.get('subjects', moduleId);
      if (!sub) return;

      if (!Array.isArray(sub.lectureSchedule)) {
        sub.lectureSchedule = [];
      }

      if (entryId) {
        // Edit mode
        const idx = sub.lectureSchedule.findIndex(s => s.id === entryId);
        if (idx !== -1) {
          sub.lectureSchedule[idx] = { id: entryId, date, time, venue };
        }
      } else {
        // Add mode
        const newId = 'ls_' + Date.now();
        sub.lectureSchedule.push({ id: newId, date, time, venue });
      }

      await Database.put('subjects', sub);
      NotificationService.show('Schedule Saved', 'Lecture schedule updated successfully.', 'success');

      // Re-populate and hide form
      this.openScheduleModal(moduleId);

      // Re-render dashboard card badges
      this.render();
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    } catch (err) {
      console.error('Failed to save schedule entry:', err);
    }
  },

  async editScheduleEntry(entryId) {
    const moduleId = document.getElementById('schedule-module-id').value;
    if (!moduleId) return;

    try {
      const sub = await Database.get('subjects', moduleId);
      if (!sub || !Array.isArray(sub.lectureSchedule)) return;

      const entry = sub.lectureSchedule.find(s => s.id === entryId);
      if (!entry) return;

      document.getElementById('schedule-entry-id').value = entry.id;
      document.getElementById('schedule-date').value = entry.date;
      document.getElementById('schedule-time').value = entry.time;
      document.getElementById('schedule-venue').value = entry.venue || '';

      document.getElementById('schedule-form-title').textContent = 'Edit Lecture Schedule';
      document.getElementById('schedule-form-container').style.display = 'block';
      document.getElementById('btn-show-add-schedule').style.display = 'none';
    } catch (err) {
      console.error('Failed to edit schedule entry:', err);
    }
  },

  async deleteSchedule(subId, scheduleId) {
    if (!subId || !scheduleId) return;

    try {
      const sub = await Database.get('subjects', subId);
      if (!sub || !Array.isArray(sub.lectureSchedule)) return;

      sub.lectureSchedule = sub.lectureSchedule.filter(s => s.id !== scheduleId);

      await Database.put('subjects', sub);
      NotificationService.show('Schedule Removed', 'Lecture slot deleted.', 'warning');

      // Call renderScheduleTable(subId) specifically to update the view
      this.renderScheduleTable(subId);

      // Re-render dashboard cards
      this.render();
      window.dispatchEvent(new CustomEvent('subjectsUpdated'));
    } catch (err) {
      console.error('Failed to delete schedule:', err);
    }
  },

  bindScheduleEvents() {
    const showFormBtn = document.getElementById('btn-show-add-schedule');
    if (showFormBtn) {
      showFormBtn.onclick = () => this.showAddScheduleForm();
    }

    const cancelBtn = document.getElementById('btn-cancel-schedule-entry');
    if (cancelBtn) {
      cancelBtn.onclick = () => this.hideScheduleForm();
    }

    const saveBtn = document.getElementById('btn-save-schedule-entry');
    if (saveBtn) {
      saveBtn.onclick = () => this.saveScheduleEntry();
    }

    // Single delegated listener for delete-schedule-btn to support dynamic elements
    const tbody = document.getElementById('schedule-table-body');
    if (tbody) {
      tbody.addEventListener('click', (e) => {
        const btn = e.target.classList.contains('delete-schedule-btn') 
          ? e.target 
          : e.target.closest('.delete-schedule-btn');
        if (btn) {
          e.preventDefault();
          const scheduleId = btn.getAttribute('data-id');
          const subModuleId = btn.getAttribute('data-sub-id');
          if (confirm("Confirm delete?")) {
            this.deleteSchedule(subModuleId, scheduleId);
          }
        }
      });
    }
  },

  // ── Smart Next-Lecture Scheduler Helpers ──────────────────────────────────
  getNextLectureDate(lectureSchedule) {
    if (!Array.isArray(lectureSchedule) || lectureSchedule.length === 0) return null;
    
    const nowBoundary = new Date().setHours(0, 0, 0, 0);
    
    const parsedDates = lectureSchedule.map(item => {
      if (item && typeof item === 'object') {
        if (item.date && item.time) {
          return new Date(`${item.date}T${item.time}`);
        } else if (item.date) {
          return new Date(item.date);
        }
      } else if (typeof item === 'string' || typeof item === 'number') {
        return new Date(item);
      }
      return null;
    }).filter(d => d !== null && !isNaN(d.getTime()));

    // Filter array: date >= new Date().setHours(0,0,0,0)
    const filteredDates = parsedDates.filter(date => date.getTime() >= nowBoundary);

    // Sort: sort((a, b) => new Date(a) - new Date(b))
    filteredDates.sort((a, b) => a - b);

    // Return the nearest future date
    return filteredDates.length > 0 ? filteredDates[0] : null;
  },

  renderSubModuleCard(sub, attendance) {
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

    // Execute getNextLectureDate for this card
    const nextDate = this.getNextLectureDate(sub.lectureSchedule);
    
    let statusBadgeHTML = '';
    let nextVenue = '';
    
    if (nextDate) {
      // Find the schedule slot corresponding to this date to extract venue
      const slot = Array.isArray(sub.lectureSchedule)
        ? sub.lectureSchedule.find(s => {
            const d = new Date(`${s.date}T${s.time}`);
            return d.getTime() === nextDate.getTime();
          })
        : null;
      nextVenue = slot ? slot.venue : '';

      const now = new Date();
      // Compute midnight boundaries
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const dayAfterTomorrow = new Date(tomorrowStart);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

      let badgeLabel = this._formatNextLectureLabel(nextDate);
      const fullDate = nextDate.toLocaleString(undefined, {
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit'
      }) + (nextVenue ? ` @ ${nextVenue}` : '');

      if (nextDate >= todayStart && nextDate < tomorrowStart) {
        badgeLabel = `Today · ${nextDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
      } else if (nextDate >= tomorrowStart && nextDate < dayAfterTomorrow) {
        badgeLabel = `Tomorrow · ${nextDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
      }

      statusBadgeHTML = `
        <span class="badge-next-lecture" title="${fullDate}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          Next Lecture: ${badgeLabel}
        </span>`;
    } else {
      // Fallback: completed beats empty/past schedule
      if (this.checkModuleCompletion(sub)) {
        statusBadgeHTML = `
          <span class="badge-completed" title="Module Completed">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Module Completed
          </span>`;
      } else {
        statusBadgeHTML = `
          <span class="badge" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.65rem; font-weight: 700; padding: 4px 10px; border-radius: 20px;">
            No Upcoming
          </span>`;
      }
    }

    // Next Venue text badge (styled to be compact and readable)
    const venueLineHTML = nextVenue
      ? `<span class="badge" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 0.72rem; font-weight: 700; padding: 4px 10px; border-radius: 20px; white-space: nowrap;">
          Venue: ${nextVenue}
        </span>`
      : '';

    return `
      <div class="sub-module-isolated-card" style="position: relative; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-color); border-radius: 12px; padding: 16px; margin-top: 12px; box-shadow: var(--shadow-sm); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); display: flex; flex-direction: column; gap: 12px; font-family: var(--font-family-app) !important;">
        
        <!-- defined 2-column header layout via CSS Grid -->
        <div style="display: grid; grid-template-columns: 1fr auto; gap: 12px; width: 100%; align-items: start;">
          <!-- LEFT COLUMN: Sub-module Title and chips -->
          <div style="min-width: 0;">
            <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; font-family: var(--font-family-app) !important;">
              <div class="sub-modules-hub-badge" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(0, 229, 255, 0.18); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; font-weight: 600; color: var(--accent); font-family: var(--font-family-app) !important; margin: 0; white-space: nowrap;">
                Sub-Modules Hub
              </div>
              <div class="badge" style="display: inline-flex; align-items: center; gap: 6px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); font-family: var(--font-family-app) !important; margin: 0; white-space: nowrap;">
                ${semLabel}
              </div>
              ${riskBadgeHTML}
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); margin: 0; font-family: var(--font-family-app) !important; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sub.submoduleCode ? sub.submoduleCode + ' - ' : ''}${sub.moduleTitle}</h4>
          </div>
          
          <!-- RIGHT COLUMN: Credits and Type badges -->
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0; justify-self: end; margin-left: 8px;">
            <span class="badge low" style="background-color: var(--accent-glow); color: var(--accent); white-space: nowrap; font-family: var(--font-family-app) !important; font-size: 0.72rem; font-weight: 600;">${sub.credits} Cr</span>
            <span class="badge low" style="background-color: rgba(255, 255, 255, 0.05); color: var(--text-secondary); text-transform: uppercase; font-size: 0.65rem; font-family: var(--font-family-app) !important;">${sub.type}</span>
          </div>
        </div>

        <!-- NEW ROW BELOW: Dedicated Next Lecture and Venue row -->
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: -2px; font-family: var(--font-family-app) !important;">
          ${statusBadgeHTML}
          ${venueLineHTML}
        </div>

        <!-- Metadata Section (Lecturer & Contact) -->
        <div style="font-size: 0.78rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 3px; font-family: var(--font-family-app) !important;">
          <span><strong>Lecturer:</strong> <span id="lec-name">${sub.lecturerName || sub.lecturer || 'Not assigned'}</span></span>
          <span><strong>Contact:</strong> <span id="lec-contact">${sub.lecturerContact || sub.info || 'N/A'}</span></span>
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

        <div style="display: flex; gap: 8px; margin-top: 12px; align-items: center;">
          <button class="btn-schedule-icon schedule-lecture-btn" data-id="${sub.id}"
                  title="Schedule / Update Next Lecture">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            Schedule
          </button>
          <button class="btn-outline btn-sm edit-submodule-btn" data-id="${sub.id}" style="flex: 1; padding: 6px 10px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Edit Sub-Module</button>
          <button class="btn-outline btn-sm delete-submodule-btn" data-id="${sub.id}" style="border-color: var(--danger); color: var(--danger); padding: 6px 10px; font-size: 0.75rem; font-family: var(--font-family-app) !important;">Delete Sub-Module</button>
        </div>
      </div>
    `;
  }
};


window.AcademicModule = AcademicModule;
