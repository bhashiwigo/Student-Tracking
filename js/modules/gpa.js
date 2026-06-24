/**
 * Rajarata Campus Life Manager - GPA Modules
 * Manages Semester GPA, Cumulative GPA, Forecasts, and Grade mappings
 * UPGRADED: Target CGPA Distribution Matrix & Mock Upgrade Repeat Simulator
 */

import { Database, getDegreeConfig, getSubjectDisplayName } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

const getCleanSubmoduleLabel = (sub, rawParents) => {
  if (!sub) return 'CORE - Unknown';
  const parentCode = sub.parentSubjectCode;
  const parentExists = parentCode && (rawParents || []).some(p => p.code === parentCode);
  const code = parentExists ? getSubjectDisplayName(parentCode) : 'CORE';
  const title = getSubjectDisplayName(sub.code) || sub.name || sub.moduleTitle || 'Unknown';
  return `${code} - ${title}`;
};

// Default RUSL Grade Point mappings
const DEFAULT_GRADE_MAP = {
  'A+': 4.00, 'A': 4.00, 'A-': 3.70,
  'B+': 3.30, 'B': 3.00, 'B-': 2.70,
  'C+': 2.30, 'C': 2.00, 'C-': 1.70,
  'D+': 1.30, 'D': 1.00, 'E': 0.00
};

// Default RUSL Grade boundary thresholds (minimum raw marks out of 100)
const RUSL_GRADE_BOUNDARIES = {
  'A+': 90, 'A': 85, 'A-': 80,
  'B+': 75, 'B': 70, 'B-': 65,
  'C+': 60, 'C': 55, 'C-': 50,
  'D+': 45, 'D': 40
};

// Year-Semester to Human Readable label mapper
const SEMESTER_NAMES = {
  '1-1': 'Year 1 - Semester I',
  '1-2': 'Year 1 - Semester II',
  '2-1': 'Year 2 - Semester I',
  '2-2': 'Year 2 - Semester II',
  '3-1': 'Year 3 - Semester I',
  '3-2': 'Year 3 - Semester II',
  '4-1': 'Year 4 - Semester I',
  '4-2': 'Year 4 - Semester II'
};

export const GPAModule = {
  gradeMap: { ...DEFAULT_GRADE_MAP },

  async init() {
    await this.loadSettings();
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.render());
    window.addEventListener('configUpdate', () => this.render());
    window.addEventListener('data-registry-update', () => this.render());
    this.runGPAEngineUnitTests();
  },

  async loadSettings() {
    try {
      const savedMapSetting = await Database.get('settings', 'customGradeMap');
      if (savedMapSetting && savedMapSetting.value) {
        this.gradeMap = savedMapSetting.value;
      }
      const targetGpaSetting = await Database.get('settings', 'gpaTarget');
      if (targetGpaSetting && targetGpaSetting.value) {
        const matrixInput = document.getElementById('gpa-matrix-target-input');
        if (matrixInput) matrixInput.value = targetGpaSetting.value;
      }
    } catch (err) {
      console.warn('Could not load custom grade settings, utilizing defaults.', err);
    }
  },

  bindEvents() {
    const form = document.getElementById('gpa-grade-form');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveGrade(e));
    }

    const predictorSubSelect = document.getElementById('predictor-subject-select');
    if (predictorSubSelect) {
      predictorSubSelect.addEventListener('change', async () => {
        const code = predictorSubSelect.value;
        if (code) {
          try {
            const sub = await Database.get('subjects', code);
            if (sub && sub.targetGrade) {
              const gradeSelect = document.getElementById('predictor-grade-select');
              if (gradeSelect) gradeSelect.value = sub.targetGrade;
            }
          } catch (err) {
            console.error('Failed to load target grade:', err);
          }
        }
        this.updatePredictorHUD();
      });
    }

    const predictorGradeSelect = document.getElementById('predictor-grade-select');
    if (predictorGradeSelect) {
      predictorGradeSelect.addEventListener('change', async () => {
        const subSelect = document.getElementById('predictor-subject-select');
        if (subSelect && subSelect.value) {
          const code = subSelect.value;
          const targetGrade = predictorGradeSelect.value;
          try {
            const sub = await Database.get('subjects', code);
            if (sub && sub.targetGrade !== targetGrade) {
              sub.targetGrade = targetGrade;
              await Database.put('subjects', sub);
            }
          } catch (err) {
            console.error('Failed to save target grade:', err);
          }
        }
        this.updatePredictorHUD();
      });
    }

    const predictorUseRecGrade = document.getElementById('predictor-use-recommended-grade');
    if (predictorUseRecGrade) {
      predictorUseRecGrade.addEventListener('change', () => {
        this.updatePredictorHUD();
      });
    }

    // Bind Target CGPA Input for Matrix calculations
    const matrixTargetInput = document.getElementById('gpa-matrix-target-input');
    if (matrixTargetInput) {
      matrixTargetInput.addEventListener('input', () => {
        this.updateMatrix();
      });
    }

    // Bind Simulator dropdown inputs
    const simSubSelect = document.getElementById('sim-subject-select');
    if (simSubSelect) {
      simSubSelect.addEventListener('change', () => this.runSimulation());
    }

    const simGradeSelect = document.getElementById('sim-grade-select');
    if (simGradeSelect) {
      simGradeSelect.addEventListener('change', () => this.runSimulation());
    }
  },

  async getGradePoints(grade) {
    return this.gradeMap[grade] !== undefined ? this.gradeMap[grade] : 0.00;
  },

  async render() {
    const tableBody = document.getElementById('gpa-table-body');
    const displayOverall = document.getElementById('gpa-display-overall');
    const displaySemester = document.getElementById('gpa-display-semester');
    const selectSubject = document.getElementById('gpa-subject-select');
    
    if (!tableBody) return;

    try {
      const [subjects, rawParents] = await Promise.all([
        Database.getAll('subjects'),
        Database.getAll('subjects-raw')
      ]);
      
      // Update subject selector inside GPA module
      if (selectSubject) {
        selectSubject.innerHTML = subjects.map(s => `
          <option value="${s.code}">${getCleanSubmoduleLabel(s, rawParents)} (${s.credits} Credits)</option>
        `).join('') || '<option value="">No course units added</option>';
      }

      // Update predictor subject select dropdown
      const selectPredictor = document.getElementById('predictor-subject-select');
      if (selectPredictor) {
        const prevVal = selectPredictor.value;
        selectPredictor.innerHTML = subjects.map(s => `
          <option value="${s.code}">${getCleanSubmoduleLabel(s, rawParents)}</option>
        `).join('') || '<option value="">No course units added</option>';
        
        if (prevVal && subjects.some(s => s.code === prevVal)) {
          selectPredictor.value = prevVal;
        } else if (subjects.length > 0) {
          selectPredictor.value = subjects[0].code;
        }

        // Pre-load saved targetGrade for the selected subject
        const code = selectPredictor.value;
        if (code) {
          const sub = subjects.find(s => s.code === code);
          if (sub && sub.targetGrade) {
            const gradeSelect = document.getElementById('predictor-grade-select');
            if (gradeSelect) gradeSelect.value = sub.targetGrade;
          }
        }
      }

      if (subjects.length === 0) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No subjects added to compute GPA. Add them in Academic view.
            </td>
          </tr>
        `;
        if (displayOverall) displayOverall.innerText = '0.00';
        if (displaySemester) displaySemester.innerText = '0.00';
        return;
      }

      // Render GPA table entries
      tableBody.innerHTML = await Promise.all(subjects.map(async (sub) => {
        const gradeRecord = sub.grade && sub.grade !== 'RESET_UNDEFINED' ? { grade: sub.grade } : null;
        const lookupGPValue = (grade) => {
          return this.gradeMap[grade] !== undefined ? this.gradeMap[grade] : 0.00;
        };

        const displayGrade = gradeRecord ? gradeRecord.grade : '<span style="opacity: 0.45; font-size: 0.75rem;">Undefined</span>';
        const displayGPValue = gradeRecord ? lookupGPValue(gradeRecord.grade).toFixed(2) : '<span style="opacity: 0.45; font-size: 0.75rem;">Undefined</span>';

        const clickable = gradeRecord && lookupGPValue(gradeRecord.grade) < 4.0;
        const gradeStyle = clickable
          ? `cursor: pointer; text-decoration: underline; text-underline-offset: 3px; color: var(--accent);`
          : `color: var(--text-primary);`;

        const parentExists = sub.parentSubjectCode && (rawParents || []).some(p => p.code === sub.parentSubjectCode);
        const parentLabel = parentExists ? getSubjectDisplayName(sub.parentSubjectCode) : 'CORE';
        const subLabel = getSubjectDisplayName(sub.code) || sub.name;

        return `
          <tr class="gpa-logbook-row" data-id="${sub.code}" style="border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
            <td style="padding: 12px 8px;"><strong>${parentLabel}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${subLabel}</span></td>
            <td style="padding: 12px 8px; text-align: center;">${sub.credits}</td>
            <td class="sim-clickable-grade" data-code="${sub.code}" style="padding: 12px 8px; text-align: center; font-weight: 700; ${gradeStyle}">${displayGrade}</td>
            <td style="padding: 12px 8px; text-align: center;">${displayGPValue}</td>
          </tr>
        `;
      })).then(rows => rows.join(''));

      // Bind row click-to-select dropdown interceptor
      tableBody.querySelectorAll('.gpa-logbook-row').forEach(rowElement => {
        const subId = rowElement.getAttribute('data-id');
        const sub = subjects.find(s => s.code === subId);
        const rowData = { id: subId, name: sub ? sub.name : 'Subject' };
        const showHUDAlert = (type, msg) => {
          NotificationService.show('Selected Subject', msg, type);
        };

        rowElement.style.cursor = 'pointer';
        rowElement.addEventListener('click', () => {
          const targetSubjectId = rowData.id; // Extracts the true master identification token
          
          const subjectSelectDropdown = document.getElementById('gpa-subject-select');
          if (subjectSelectDropdown) {
            // Force select the dropdown selection option value dynamically
            subjectSelectDropdown.value = targetSubjectId;
            
            // Manually dispatch a change event pass so associated weight preview engines refresh instantly
            subjectSelectDropdown.dispatchEvent(new Event('change'));
            
            // Smoothly scroll or add a micro-glow visual animation effect to the target card frame if desired
            document.getElementById('gpa-subject-select').focus();
            showHUDAlert('success', `Selected: ${rowData.name || 'Subject'}`);
          }
        });
      });

      // Bind logbook grade clicks to Simulator
      tableBody.querySelectorAll('.sim-clickable-grade').forEach(cell => {
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          const code = cell.getAttribute('data-code');
          const simSelect = document.getElementById('sim-subject-select');
          if (simSelect && simSelect.querySelector(`option[value="${code}"]`)) {
            simSelect.value = code;
            simSelect.dispatchEvent(new Event('change'));
            
            // Scroll smoothly to simulator card
            document.getElementById('gpa-simulator-card')?.scrollIntoView({ behavior: 'smooth' });
            
            // Flash highlight simulator card
            const simCard = document.getElementById('gpa-simulator-card');
            if (simCard) {
              simCard.style.boxShadow = '0 0 20px var(--accent)';
              setTimeout(() => {
                simCard.style.boxShadow = '';
              }, 1000);
            }
          }
        });
      });

      // Calculate GPA Stats
      const stats = await this.calculateGPAs(subjects);
      
      if (displayOverall) displayOverall.innerText = stats.overall.toFixed(2);
      if (displaySemester) displaySemester.innerText = stats.currentSemester.toFixed(2);

      // Render Prefix GPA Breakdown
      const prefixContainer = document.getElementById('gpa-prefix-breakdown-container');
      if (prefixContainer) {
        const prefixGPAs = this.calculatePrefixGPAs(subjects);
        const prefixes = Object.keys(prefixGPAs).sort();
        if (prefixes.length === 0) {
          prefixContainer.innerHTML = '<div style="color:var(--text-muted); font-family: var(--font-family-app) !important;">No graded course units logged.</div>';
        } else {
          prefixContainer.innerHTML = prefixes.map(prefix => {
            const val = prefixGPAs[prefix];
            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-color); font-family: var(--font-family-app) !important;">
                <span style="font-weight: 700; color: var(--text-primary); font-family: var(--font-family-app) !important;">${prefix} Units GPA:</span>
                <span class="badge" style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 800; background: rgba(0, 229, 255, 0.1); color: var(--accent); font-family: var(--font-family-app) !important;">
                  ${val.toFixed(2)}
                </span>
              </div>
            `;
          }).join('');
        }
      }

      // Render Credit progress benchmarks
      const progressContainer = document.getElementById('gpa-credit-progress-container');
      if (progressContainer) {
        let earnedCredits = 0;
        subjects.forEach(sub => {
          if (sub.grade && sub.grade !== 'E') {
            earnedCredits += sub.credits || 0;
          }
        });
        const config = await getDegreeConfig();
        const bscPct = Math.min(100, (earnedCredits / config.bscTotal) * 100);
        const honsPct = Math.min(100, (earnedCredits / config.honoursTotal) * 100);
        
        progressContainer.innerHTML = `
          <div style="display: flex; flex-direction: column; gap: 4px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-family-app) !important;">
              <span style="font-family: var(--font-family-app) !important;">BSc Track Progress (${earnedCredits}/${config.bscTotal} Cr)</span>
              <span style="font-family: var(--font-family-app) !important; font-weight: 700;">${bscPct.toFixed(1)}%</span>
            </div>
            <div style="height: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; width: 100%;">
              <div style="width: ${bscPct}%; height: 100%; background: var(--success); border-radius: 4px; transition: width 0.5s ease;"></div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-family: var(--font-family-app) !important;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); font-family: var(--font-family-app) !important;">
              <span style="font-family: var(--font-family-app) !important;">Honours Track Progress (${earnedCredits}/${config.honoursTotal} Cr)</span>
              <span style="font-family: var(--font-family-app) !important; font-weight: 700;">${honsPct.toFixed(1)}%</span>
            </div>
            <div style="height: 8px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); border-radius: 4px; overflow: hidden; width: 100%;">
              <div style="width: ${honsPct}%; height: 100%; background: var(--accent); border-radius: 4px; transition: width 0.5s ease;"></div>
            </div>
          </div>
        `;
      }

      // Trigger Predictor HUD update
      this.updatePredictorHUD();

      // Trigger Matrix update
      this.updateMatrix();

      // Populate Simulator dropdown
      this.populateSimulatorDropdown(subjects, rawParents);

    } catch (err) {
      console.error('GPA render failed:', err);
    }
  },

  async calculateGPAs(subjects) {
    let totalCredits = 0;
    let weightedGP = 0;

    let semCredits = 0;
    let semWeightedGP = 0;

    // Load active semester details
    let currentSemesterCode = '1-1';
    const activeSetting = await Database.get('settings', 'currentSemester');
    if (activeSetting && activeSetting.value) {
      currentSemesterCode = activeSetting.value;
    }

    for (const sub of subjects) {
      if (sub.grade && sub.grade !== 'RESET_UNDEFINED') {
        const gp = sub.gradePoint !== undefined ? sub.gradePoint : await this.getGradePoints(sub.grade);
        const credits = sub.credits || 0;
        totalCredits += credits;
        weightedGP += (gp * credits);

        if (sub.semester === currentSemesterCode) {
          semCredits += credits;
          semWeightedGP += (gp * credits);
        }
      }
    }

    const overall = totalCredits > 0 ? (weightedGP / totalCredits) : 0.00;
    const currentSemester = semCredits > 0 ? (semWeightedGP / semCredits) : 0.00;

    return { overall, currentSemester, totalCredits, weightedGP };
  },

  calculatePrefixGPAs(subjects) {
    const prefixGroups = {};
    for (const sub of subjects) {
      if (sub.grade && sub.grade !== 'RESET_UNDEFINED') {
        const code = sub.parentSubjectCode || sub.code || 'CORE';
        const prefix = code.trim().substring(0, 3).toUpperCase();
        
        if (!prefixGroups[prefix]) {
          prefixGroups[prefix] = { totalCredits: 0, weightedGP: 0 };
        }
        const gp = sub.gradePoint !== undefined ? sub.gradePoint : (this.gradeMap[sub.grade] !== undefined ? this.gradeMap[sub.grade] : 0.00);
        const credits = sub.credits || 0;
        prefixGroups[prefix].totalCredits += credits;
        prefixGroups[prefix].weightedGP += (gp * credits);
      }
    }
    
    const prefixGPAs = {};
    for (const prefix in prefixGroups) {
      const group = prefixGroups[prefix];
      prefixGPAs[prefix] = group.totalCredits > 0 ? (group.weightedGP / group.totalCredits) : 0.00;
    }
    return prefixGPAs;
  },

  async handleSaveGrade(e) {
    e.preventDefault();
    const code = document.getElementById('gpa-subject-select').value;
    const grade = document.getElementById('gpa-grade-select').value;

    if (!code || !grade) return;

    const selectedSubjectId = document.getElementById('gpa-subject-select').value;
    const chosenGradeValue = document.getElementById('gpa-grade-select').value;

    if (chosenGradeValue === "RESET_UNDEFINED") {
      try {
        const sub = await Database.get('subjects', selectedSubjectId);
        if (sub) {
          sub.grade = "";
          sub.gradePoint = undefined;
          await Database.put('subjects', sub);
        }
        
        // Trigger Cloud Sync deletion packet downstream instantly
        if (window.triggerBackgroundSync) {
          window.triggerBackgroundSync('subjects', selectedSubjectId, 'PUT');
        }
        
        const showHUDAlert = (type, msg) => {
          NotificationService.show('Grade Reset', msg, type);
        };
        showHUDAlert('success', 'Subject result successfully reset to Undefined.');
        
        this.render();
        // Dispatch event for analytics dashboard to refresh
        window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      } catch (err) {
        console.error('Reset grade failed:', err);
      }
    } else {
      try {
        const sub = await Database.get('subjects', code);
        if (sub) {
          sub.grade = grade;
          sub.gradePoint = this.gradeMap[grade] !== undefined ? this.gradeMap[grade] : 0.00;
          if (sub.credits === undefined) {
            sub.credits = 3;
          }
          await Database.put('subjects', sub);
          NotificationService.show('Grade Saved', `Grade for ${code} set to ${grade}.`, 'success');
          
          this.render();
          // Dispatch event for analytics dashboard to refresh
          window.dispatchEvent(new CustomEvent('subjectsUpdated'));
        }
      } catch (err) {
        console.error('Save grade failed:', err);
      }
    }
  },

  runGPAEngineUnitTests() {
    console.log('[GPA Engine Tests] Starting arithmetic verification suite...');
    try {
      const computeGpaLocal = (subs) => {
        let totalCredits = 0;
        let weightedGP = 0;
        for (const sub of subs) {
          if (sub.grade) {
            const gp = this.gradeMap[sub.grade] || 0.00;
            totalCredits += sub.credits;
            weightedGP += (gp * sub.credits);
          }
        }
        return totalCredits > 0 ? (weightedGP / totalCredits) : 0.00;
      };

      // Test Case 1: Equal weights (e.g. 3 credits each)
      const tc1 = [
        { credits: 3, grade: 'A' },
        { credits: 3, grade: 'C' }
      ];
      const res1 = computeGpaLocal(tc1).toFixed(2);
      if (res1 !== '3.00') throw new Error(`Test Case 1 failed: expected 3.00, got ${res1}`);

      // Test Case 2: Mixed weights
      const tc2 = [
        { credits: 2, grade: 'A-' },
        { credits: 3, grade: 'B+' },
        { credits: 4, grade: 'C+' }
      ];
      const res2 = computeGpaLocal(tc2).toFixed(2);
      if (res2 !== '2.94') throw new Error(`Test Case 2 failed: expected 2.94, got ${res2}`);

      // Test Case 3: Empty/Unevaluated
      const tc3 = [
        { credits: 3, grade: '' }
      ];
      const res3 = computeGpaLocal(tc3).toFixed(2);
      if (res3 !== '0.00') throw new Error(`Test Case 3 failed: expected 0.00, got ${res3}`);

      console.log('[GPA Engine Tests] All GPA calculation arithmetic unit tests passed successfully!');
      return true;
    } catch (error) {
      console.error('[GPA Engine Tests] Validation failure:', error.message);
      return false;
    }
  },

  async updateMatrix() {
    const resultsContainer = document.getElementById('gpa-matrix-results');
    const targetInput = document.getElementById('gpa-matrix-target-input');
    if (!resultsContainer || !targetInput) return;

    const targetVal = parseFloat(targetInput.value) || 3.70;

    try {
      const subjects = await Database.getAll('subjects');
      
      let totalCredits = 0;
      let earnedPoints = 0;
      let remainingCredits = 0;

      const semRemaining = {};

      subjects.forEach(sub => {
        totalCredits += sub.credits;
        if (sub.grade) {
          const gp = this.gradeMap[sub.grade] || 0;
          earnedPoints += (gp * sub.credits);
        } else {
          remainingCredits += sub.credits;
          semRemaining[sub.semester] = (semRemaining[sub.semester] || 0) + sub.credits;
        }
      });

      if (totalCredits === 0) {
        resultsContainer.innerHTML = '<div style="color:var(--text-muted);">No courses logged in Academic view.</div>';
        return;
      }

      const totalTargetPoints = targetVal * totalCredits;
      const pointsNeeded = totalTargetPoints - earnedPoints;

      if (remainingCredits === 0) {
        const actualCGPA = earnedPoints / totalCredits;
        if (actualCGPA >= targetVal) {
          resultsContainer.innerHTML = `
            <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; padding: 10px; color: var(--success); font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>Target achieved! Your current CGPA (${actualCGPA.toFixed(2)}) meets or exceeds your target.</span>
            </div>
          `;
        } else {
          resultsContainer.innerHTML = `
            <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; padding: 10px; color: var(--danger); font-weight: 600; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
              <span>Target CGPA of ${targetVal.toFixed(2)} is impossible. All logged subjects are already graded.</span>
            </div>
          `;
        }
        return;
      }

      const avgNeededGPA = pointsNeeded / remainingCredits;

      let alertClass = 'low';
      let alertLabel = 'Very Safe';
      let color = 'var(--success)';
      if (avgNeededGPA > 4.0) {
        alertClass = 'high';
        alertLabel = 'Impossible';
        color = 'var(--danger)';
      } else if (avgNeededGPA > 3.7) {
        alertClass = 'medium';
        alertLabel = 'Critical Target';
        color = 'var(--warning)';
      } else if (avgNeededGPA > 3.0) {
        alertClass = 'medium';
        alertLabel = 'Challenging';
        color = 'var(--accent)';
      }

      let matrixHtml = `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; color: var(--text-primary);">Required Avg. Future GPA:</span>
            <span class="badge ${alertClass}" style="font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; font-weight: 800; background: ${avgNeededGPA > 4.0 ? 'rgba(239,68,68,0.15)' : ''}; color: ${color};">
              ${avgNeededGPA > 4.0 ? 'Impossible' : avgNeededGPA <= 0 ? '0.00' : avgNeededGPA.toFixed(2)}
            </span>
          </div>
          <p style="font-size: 0.72rem; color: var(--text-muted); line-height: 1.4; margin: 0;">
            Based on ${remainingCredits} remaining credits out of ${totalCredits} total curriculum credits logged.
          </p>
        </div>
      `;

      const upcomingSems = Object.keys(semRemaining).sort();
      if (upcomingSems.length > 0) {
        matrixHtml += `
          <div style="font-weight: 700; font-size: 0.7rem; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em; margin-top: 4px; margin-bottom: 2px;">
            Target breakdown by active terms:
          </div>
        `;
        matrixHtml += upcomingSems.map(sem => {
          const credits = semRemaining[sem];
          const semName = SEMESTER_NAMES[sem] || `Semester ${sem}`;
          let statusText = `Average ${avgNeededGPA.toFixed(2)} GPA needed`;
          if (avgNeededGPA > 4.0) {
            statusText = 'Mathematically Out of Range';
          } else if (avgNeededGPA <= 0) {
            statusText = 'Already achieved (GPA 0.00)';
          }
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding: 6px 0;">
              <div>
                <strong style="color: var(--text-primary); font-size: 0.78rem;">${semName}</strong>
                <div style="font-size: 0.7rem; color: var(--text-muted);">${credits} remaining credits</div>
              </div>
              <span style="font-size: 0.78rem; font-weight: 700; color: ${avgNeededGPA > 4.0 ? 'var(--danger)' : 'var(--accent)'}; font-family: 'JetBrains Mono', monospace;">
                ${statusText}
              </span>
            </div>
          `;
        }).join('');
      }

      resultsContainer.innerHTML = matrixHtml;

    } catch (err) {
      console.error('Update matrix failed:', err);
    }
  },

  populateSimulatorDropdown(subjects, rawParents) {
    const simSelect = document.getElementById('sim-subject-select');
    if (!simSelect) return;

    // Filter graded subjects that aren't already perfect A/A+ grade
    const targetSubjects = subjects.filter(s => s.grade && this.gradeMap[s.grade] < 4.0);

    if (targetSubjects.length === 0) {
      simSelect.innerHTML = '<option value="">No upgradeable subjects logged</option>';
      document.getElementById('sim-result-box').style.display = 'none';
      return;
    }

    const prevVal = simSelect.value;
    simSelect.innerHTML = targetSubjects.map(s => `
      <option value="${s.code}">${getCleanSubmoduleLabel(s, rawParents)} (Current: ${s.grade})</option>
    `).join('');

    if (prevVal && targetSubjects.some(s => s.code === prevVal)) {
      simSelect.value = prevVal;
    } else {
      simSelect.value = targetSubjects[0].code;
    }

    this.runSimulation();
  },

  async runSimulation() {
    const simSelect = document.getElementById('sim-subject-select');
    const gradeSelect = document.getElementById('sim-grade-select');
    const resultBox = document.getElementById('sim-result-box');

    if (!simSelect || !gradeSelect || !resultBox) return;

    const code = simSelect.value;
    const targetGrade = gradeSelect.value;

    if (!code) {
      resultBox.style.display = 'none';
      return;
    }

    try {
      const subjects = await Database.getAll('subjects');
      const targetSub = subjects.find(s => s.code === code);
      if (!targetSub) {
        resultBox.style.display = 'none';
        return;
      }

      // Calculations
      let totalCredits = 0;
      let originalPoints = 0;
      let simulatedPoints = 0;

      subjects.forEach(sub => {
        if (sub.grade) {
          const gp = this.gradeMap[sub.grade] || 0;
          totalCredits += sub.credits;
          originalPoints += (gp * sub.credits);
          
          if (sub.code === code) {
            const mockGp = this.gradeMap[targetGrade] || 0.00;
            simulatedPoints += (mockGp * sub.credits);
          } else {
            simulatedPoints += (gp * sub.credits);
          }
        }
      });

      if (totalCredits === 0) {
        resultBox.style.display = 'none';
        return;
      }

      const originalGPA = originalPoints / totalCredits;
      const simulatedGPA = simulatedPoints / totalCredits;
      const diff = simulatedGPA - originalGPA;

      resultBox.style.display = 'block';

      if (diff <= 0) {
        resultBox.innerHTML = `
          <div style="font-weight: 700; color: var(--text-primary); font-size: 0.8rem;">
            Mock upgrade grade does not exceed the current grade (${targetSub.grade}). Select a higher grade.
          </div>
        `;
      } else {
        resultBox.innerHTML = `
          <div style="font-weight: 700; color: #ffffff; font-size: 0.82rem; display: flex; flex-direction: column; gap: 4px;">
            <span style="display: inline-flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              <span>Simulated Overall CGPA Upgrade:</span>
            </span>
            <span style="font-size: 1.1rem; color: var(--accent); font-family: 'JetBrains Mono', monospace; margin: 4px 0;">
              ${originalGPA.toFixed(2)} ➔ ${simulatedGPA.toFixed(2)} (+${diff.toFixed(2)})
            </span>
            <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 500;">
              Upgrade repeat replaces grade GP ${this.gradeMap[targetSub.grade].toFixed(2)} with GP ${this.gradeMap[targetGrade].toFixed(2)}.
            </span>
          </div>
        `;
      }

    } catch (err) {
      console.error('Simulation error:', err);
    }
  },

  async updatePredictorHUD() {
    const subSelect = document.getElementById('predictor-subject-select');
    const gradeSelect = document.getElementById('predictor-grade-select');
    
    if (!subSelect || !gradeSelect) return;
    
    const code = subSelect.value;
    if (!code) return;
    
    try {
      const sub = await Database.get('subjects', code);
      if (!sub) return;

      // Pull real marks, suppressing 0 defaults by querying practicals store for fallback if lab is 0
      const ca = sub.internalMarks?.ca !== undefined ? parseFloat(sub.internalMarks.ca) : 0;
      const quiz = sub.internalMarks?.quiz !== undefined ? parseFloat(sub.internalMarks.quiz) : 0;
      
      let lab = sub.internalMarks?.lab !== undefined ? parseFloat(sub.internalMarks.lab) : 0;
      if (lab === 0) {
        const practicals = await Database.getAll('practicals');
        const relatedLabs = practicals.filter(p => p.subjectCode === code);
        const completedLabs = relatedLabs.filter(p => p.completed === true).length;
        if (relatedLabs.length > 0) {
          lab = Math.round((completedLabs / relatedLabs.length) * 100);
        }
      }

      // Sample past results to recommend realistic target grade
      const allSubjects = await Database.getAll('subjects');
      const completedSubjects = allSubjects.filter(s => s.grade);
      const gradesOrdered = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D'];
      let recommendedGrade = 'A-'; // default fallback
      
      if (completedSubjects.length > 0) {
        const completedThresholds = completedSubjects.map(s => RUSL_GRADE_BOUNDARIES[s.grade] || 40);
        completedThresholds.sort((a, b) => a - b);
        let medianThreshold;
        const mid = Math.floor(completedThresholds.length / 2);
        if (completedThresholds.length % 2 !== 0) {
          medianThreshold = completedThresholds[mid];
        } else {
          medianThreshold = (completedThresholds[mid - 1] + completedThresholds[mid]) / 2;
        }
        
        let bestGrade = 'D';
        for (const g of gradesOrdered) {
          const boundary = RUSL_GRADE_BOUNDARIES[g];
          if (boundary && medianThreshold >= boundary) {
            bestGrade = g;
            break;
          }
        }
        recommendedGrade = bestGrade;
      }

      // Update recommended grade UI elements
      const recGradeLabel = document.getElementById('predictor-recommended-grade-label');
      if (recGradeLabel) recGradeLabel.innerText = recommendedGrade;

      const useRecCheckbox = document.getElementById('predictor-use-recommended-grade');
      if (useRecCheckbox && useRecCheckbox.checked) {
        gradeSelect.value = recommendedGrade;
      }

      const targetGrade = gradeSelect.value;
      const theoryWeight = sub.theoryWeight !== undefined ? parseFloat(sub.theoryWeight) : 70;
      const practicalWeight = sub.practicalWeight !== undefined ? parseFloat(sub.practicalWeight) : 30;

      // Update basic fields
      const thWeightEl = document.getElementById('predictor-theory-weight');
      const prWeightEl = document.getElementById('predictor-practical-weight');
      const caValEl = document.getElementById('predictor-ca-val');
      const quizValEl = document.getElementById('predictor-quiz-val');
      const labValEl = document.getElementById('predictor-lab-val');

      if (thWeightEl) thWeightEl.innerText = theoryWeight;
      if (prWeightEl) prWeightEl.innerText = practicalWeight;
      if (caValEl) caValEl.innerText = ca;
      if (quizValEl) quizValEl.innerText = quiz;
      if (labValEl) labValEl.innerText = lab;

      // Live GPA Shift Forecasting
      const originalStats = await this.calculateGPAs(allSubjects);
      const originalSem = originalStats.currentSemester || 0.00;
      const originalCum = originalStats.overall || 0.00;

      const simulatedSubjects = allSubjects.map(s => {
        if (s.code === code) {
          return { ...s, grade: targetGrade };
        }
        return s;
      });
      const simulatedStats = await this.calculateGPAs(simulatedSubjects);
      const simulatedSem = simulatedStats.currentSemester || 0.00;
      const simulatedCum = simulatedStats.overall || 0.00;

      const simImpactEl = document.getElementById('predictor-simulation-impact');
      if (simImpactEl) {
        simImpactEl.innerHTML = `<span style="color: var(--text-secondary);">Simulated Impact:</span><br>Sem GPA: ${originalSem.toFixed(2)} ➔ <span style="color: var(--accent);">${simulatedSem.toFixed(2)}</span><br>CGPA: ${originalCum.toFixed(2)} ➔ <span style="color: var(--accent);">${simulatedCum.toFixed(2)}</span>`;
      }

      // Calculate required exam marks for target grade & maximum achievable score
      const targetThreshold = RUSL_GRADE_BOUNDARIES[targetGrade] || 85;
      const requiredExamScore = this.calculateRequiredExam(targetThreshold, theoryWeight, practicalWeight, ca, quiz, lab);
      
      const W_T = theoryWeight / 100;
      const W_P = practicalWeight / 100;
      const theoryInternal = (ca + quiz) / 2;
      const practicalScore = lab;
      const S_max = W_T * (0.2 * theoryInternal + 80) + W_P * practicalScore;

      let maxAchievableGrade = 'E';
      for (const g of gradesOrdered) {
        const boundary = RUSL_GRADE_BOUNDARIES[g];
        if (boundary && S_max >= boundary) {
          maxAchievableGrade = g;
          break;
        }
      }

      const resGradeEl = document.getElementById('predictor-result-grade');
      const resReqEl = document.getElementById('predictor-result-required');
      
      if (resGradeEl) resGradeEl.innerText = targetGrade;
      if (resReqEl) {
        const parent = resReqEl.parentElement;
        if (requiredExamScore === 'Impossible' || requiredExamScore > 100) {
          if (parent) {
            parent.style.flexDirection = 'column';
            parent.style.alignItems = 'stretch';
            parent.style.background = 'rgba(255, 23, 68, 0.08)';
            parent.style.borderColor = 'rgba(255, 23, 68, 0.2)';
            parent.style.padding = '8px';
          }
          resReqEl.innerHTML = `<span style="font-size: 0.58rem; color: #ff1744; font-weight: 700; line-height: 1.3; text-align: left; display: block;">Target Mathematical Impossibility. Max Achievable Grade based on current CA bounds is ${maxAchievableGrade}</span>`;
        } else {
          if (parent) {
            parent.style.flexDirection = 'row';
            parent.style.alignItems = 'center';
            parent.style.background = 'rgba(0, 229, 255, 0.08)';
            parent.style.borderColor = 'rgba(0, 229, 255, 0.15)';
            parent.style.padding = '4px 8px';
          }
          if (requiredExamScore === 'Already Achieved') {
            resReqEl.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="alert-svg"><polyline points="20 6 9 17 4 12"></polyline></svg>Achieved</span>';
            resReqEl.style.color = '#00e676';
          } else {
            resReqEl.innerText = `${requiredExamScore.toFixed(1)}%`;
            resReqEl.style.color = '#ffffff';
          }
        }
      }

      // Populate list breakdown
      const breakdownList = document.getElementById('predictor-breakdown-list');
      if (breakdownList) {
        const grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-'];
        breakdownList.innerHTML = grades.map(g => {
          const threshold = RUSL_GRADE_BOUNDARIES[g];
          const req = this.calculateRequiredExam(threshold, theoryWeight, practicalWeight, ca, quiz, lab);
          let text = 'N/A';
          let textColor = 'var(--text-secondary)';
          if (req === 'Impossible' || req > 100) {
            text = 'N/A';
            textColor = 'rgba(255,255,255,0.2)';
          } else if (req === 'Already Achieved') {
            text = '0.0%';
            textColor = '#00e676';
          } else {
            text = `${req.toFixed(1)}%`;
            textColor = 'var(--accent)';
          }
          return `
            <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px; text-align: center;">
              <div style="font-size: 0.7rem; font-weight: 700; color: ${textColor};">${g}</div>
              <div style="font-size: 0.75rem; margin-top: 2px; color: var(--text-primary); font-weight: 600;">${text}</div>
            </div>
          `;
        }).join('');
      }

    } catch (err) {
      console.error('Update predictor failed:', err);
    }
  },

  calculateRequiredExam(targetThreshold, theoryWeight, practicalWeight, ca, quiz, lab) {
    const W_T = theoryWeight / 100;
    const W_P = practicalWeight / 100;
    
    // Theory continuous assessment is average of CA and Quiz
    const theoryInternal = (ca + quiz) / 2;
    const practicalScore = lab; // Lab marks are the practical continuous mark

    // S = W_T * (0.2 * theoryInternal + 0.8 * FinalExam) + W_P * practicalScore
    // FinalExam = (targetThreshold - W_T * 0.2 * theoryInternal - W_P * practicalScore) / (W_T * 0.8)
    
    if (W_T === 0) {
      const currentEarned = W_P * practicalScore;
      if (currentEarned >= targetThreshold) return 'Already Achieved';
      return 'Impossible';
    }

    const currentEarnedInternal = (W_T * 0.2 * theoryInternal) + (W_P * practicalScore);
    const neededFromExamComponent = targetThreshold - currentEarnedInternal;
    
    if (neededFromExamComponent <= 0) {
      return 'Already Achieved';
    }

    const requiredExam = neededFromExamComponent / (W_T * 0.8);
    
    if (requiredExam > 100) {
      return 'Impossible';
    }

    return requiredExam;
  }
};
