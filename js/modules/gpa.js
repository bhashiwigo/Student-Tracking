/**
 * Rajarata Campus Life Manager - GPA Modules
 * Manages Semester GPA, Cumulative GPA, Forecasts, and Grade mappings
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

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

export const GPAModule = {
  gradeMap: { ...DEFAULT_GRADE_MAP },

  async init() {
    await this.loadSettings();
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.render());
  },

  async loadSettings() {
    try {
      const savedMapSetting = await Database.get('settings', 'customGradeMap');
      if (savedMapSetting && savedMapSetting.value) {
        this.gradeMap = savedMapSetting.value;
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
      const subjects = await Database.getAll('subjects');
      
      // Update subject selector inside GPA module
      if (selectSubject) {
        selectSubject.innerHTML = subjects.map(s => `
          <option value="${s.code}">${s.code} - ${s.name} (${s.credits} Credits)</option>
        `).join('') || '<option value="">No course units added</option>';
      }

      // Update predictor subject select dropdown
      const selectPredictor = document.getElementById('predictor-subject-select');
      if (selectPredictor) {
        const prevVal = selectPredictor.value;
        selectPredictor.innerHTML = subjects.map(s => `
          <option value="${s.code}">${s.code} - ${s.name}</option>
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
        const gradeVal = sub.grade || 'Unevaluated';
        const points = sub.grade ? (await this.getGradePoints(sub.grade)).toFixed(2) : 'N/A';
        return `
          <tr style="border-bottom: 1px solid var(--border-color); font-size: 0.85rem;">
            <td style="padding: 12px 8px;"><strong>${sub.code}</strong><br><span style="font-size:0.75rem; color:var(--text-secondary);">${sub.name}</span></td>
            <td style="padding: 12px 8px; text-align: center;">${sub.credits}</td>
            <td style="padding: 12px 8px; text-align: center; font-weight: 700; color: var(--accent);">${gradeVal}</td>
            <td style="padding: 12px 8px; text-align: center;">${points}</td>
          </tr>
        `;
      })).then(rows => rows.join(''));

      // Calculate GPA Stats
      const stats = await this.calculateGPAs(subjects);
      
      if (displayOverall) displayOverall.innerText = stats.overall.toFixed(2);
      if (displaySemester) displaySemester.innerText = stats.currentSemester.toFixed(2);

      // Trigger Predictor HUD update
      this.updatePredictorHUD();

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
      if (sub.grade) {
        const gp = await this.getGradePoints(sub.grade);
        totalCredits += sub.credits;
        weightedGP += (gp * sub.credits);

        if (sub.semester === currentSemesterCode) {
          semCredits += sub.credits;
          semWeightedGP += (gp * sub.credits);
        }
      }
    }

    const overall = totalCredits > 0 ? (weightedGP / totalCredits) : 0.00;
    const currentSemester = semCredits > 0 ? (semWeightedGP / semCredits) : 0.00;

    return { overall, currentSemester };
  },

  async handleSaveGrade(e) {
    e.preventDefault();
    const code = document.getElementById('gpa-subject-select').value;
    const grade = document.getElementById('gpa-grade-select').value;

    if (!code || !grade) return;

    try {
      const sub = await Database.get('subjects', code);
      if (sub) {
        sub.grade = grade;
        await Database.put('subjects', sub);
        NotificationService.show('Grade Saved', `Grade for ${code} set to ${grade}.`, 'success');
        
        this.render();
        // Dispatch event for analytics dashboard to refresh
        window.dispatchEvent(new CustomEvent('subjectsUpdated'));
      }
    } catch (err) {
      console.error('Save grade failed:', err);
    }
  },

  async updatePredictorHUD() {
    const subSelect = document.getElementById('predictor-subject-select');
    const gradeSelect = document.getElementById('predictor-grade-select');
    
    if (!subSelect || !gradeSelect) return;
    
    const code = subSelect.value;
    const targetGrade = gradeSelect.value;
    if (!code) {
      // Clear out fields if no subjects
      return;
    }
    
    try {
      const sub = await Database.get('subjects', code);
      if (!sub) return;

      const theoryWeight = sub.theoryWeight !== undefined ? sub.theoryWeight : 70;
      const practicalWeight = sub.practicalWeight !== undefined ? sub.practicalWeight : 30;
      const ca = sub.internalMarks?.ca !== undefined ? sub.internalMarks.ca : 0;
      const quiz = sub.internalMarks?.quiz !== undefined ? sub.internalMarks.quiz : 0;
      const lab = sub.internalMarks?.lab !== undefined ? sub.internalMarks.lab : 0;

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

      // Calculate required exam marks for target grade
      const targetThreshold = RUSL_GRADE_BOUNDARIES[targetGrade] || 85;
      const requiredExamScore = this.calculateRequiredExam(targetThreshold, theoryWeight, practicalWeight, ca, quiz, lab);
      
      const resGradeEl = document.getElementById('predictor-result-grade');
      const resReqEl = document.getElementById('predictor-result-required');
      
      if (resGradeEl) resGradeEl.innerText = targetGrade;
      if (resReqEl) {
        if (requiredExamScore === 'Impossible') {
          resReqEl.innerText = 'Impossible 🚫';
          resReqEl.style.color = '#f43f5e';
        } else if (requiredExamScore === 'Already Achieved') {
          resReqEl.innerText = 'Achieved 🎉';
          resReqEl.style.color = '#00e676';
        } else {
          resReqEl.innerText = `${requiredExamScore.toFixed(1)}%`;
          resReqEl.style.color = '#ffffff';
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
          if (req === 'Impossible') {
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
      // 100% Practical course (unusual but possible)
      const currentEarned = W_P * practicalScore;
      if (currentEarned >= targetThreshold) return 'Already Achieved';
      return 'Impossible'; // No theory exam to adjust
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
