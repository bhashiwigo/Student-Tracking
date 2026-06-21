/**
 * Rajarata Campus Life Manager - Attendance Tracker Modules
 * Logs attendance records and calculates eligibility percentages per subject
 * UPGRADED: Multi-track nested attendance structure format (lecture, practical, fieldWork)
 * AUDIT: Verified that no timestamp/date objects are formatted for UI insertion (purely numeric tracking).
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

/**
 * Core risk index calculator.
 * Returns a human-readable string: how many consecutive lectures a student must
 * attend without any absence to cross the 80% eligibility threshold.
 *
 * @param {number} attended  - total sessions attended so far
 * @param {number} total     - total sessions conducted so far
 * @param {number} remaining - sessions yet to be conducted this semester
 * @returns {string|null}    - warning string or null if already safe
 */
function calcCriticalRiskIndex(attended, total, remaining) {
  const overallTotal    = total + remaining;
  const needed          = Math.ceil(0.8 * overallTotal);
  const shortfall       = needed - attended;

  if (shortfall <= 0) return null; // Already safe

  // Must attend every one of the remaining sessions AND still might not be enough
  if (shortfall > remaining) {
    return `INELIGIBLE RISK: Even attending all ${remaining} remaining session(s) is insufficient to reach 80%.`;
  }

  return `WARNING: ${shortfall} mandatory consecutive session(s) needed to secure 80% exam eligibility threshold.`;
}

export const AttendanceModule = {
  // Configurable: estimated lectures remaining in semester (default 30 as fallback)
  ESTIMATED_REMAINING: 30,

  activeSemester: '1-1',

  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.render());

    const filter = document.getElementById('attendance-semester-filter');
    if (filter) {
      filter.value = this.activeSemester;
      filter.addEventListener('change', (e) => {
        this.activeSemester = e.target.value;
        this.render();
      });
    }
  },

  bindEvents() {
    // Inputs are handled dynamically via event delegation or render binding
  },

  async render() {
    const container = document.getElementById('attendance-tracker-container');
    if (!container) return;

    try {
      const attendance = await Database.getAll('attendance');
      const subjects   = await Database.getAll('subjects');

      const filteredSubjects = subjects.filter(sub => sub.semester === this.activeSemester);

      if (subjects.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No course units added to track attendance. Add them in Academic view.
          </div>
        `;
        return;
      }

      if (filteredSubjects.length === 0) {
        const semParts = this.activeSemester.split('-');
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted); font-family: var(--font-family-app) !important;">
            No course units added for Year ${semParts[0]} - Semester ${semParts[1] === '1' ? 'I' : 'II'}.
          </div>
        `;
        return;
      }

      container.innerHTML = await Promise.all(filteredSubjects.map(async (sub) => {
        let record = attendance.find(a => a.subjectCode === sub.code);

        // Safety initialization if missing
        if (!record) {
          record = {
            subjectCode: sub.code,
            courseId: sub.code,
            lecture: { total: 30, present: 0 },
            practical: { total: 10, present: 0 },
            fieldWork: { total: 0, present: 0 },
            lecturesTotal: 30,
            lecturesAttended: 0,
            practicalsTotal: 10,
            practicalsAttended: 0,
            approvedMedicalSessions: 0
          };
          await Database.add('attendance', record);
        } else {
          // If record exists but is missing new properties
          let changed = false;
          if (!record.courseId) { record.courseId = record.subjectCode || ''; changed = true; }
          if (!record.lecture) { record.lecture = { total: record.lecturesTotal !== undefined ? record.lecturesTotal : 30, present: record.lecturesAttended !== undefined ? record.lecturesAttended : 0 }; changed = true; }
          if (!record.practical) { record.practical = { total: record.practicalsTotal !== undefined ? record.practicalsTotal : 10, present: record.practicalsAttended !== undefined ? record.practicalsAttended : 0 }; changed = true; }
          if (!record.fieldWork) { record.fieldWork = { total: 0, present: 0 }; changed = true; }
          if (changed) {
            await Database.put('attendance', record);
          }
        }

        const lectPct = record.lecture.total > 0 ? (record.lecture.present / record.lecture.total) * 100 : 0;
        const pracPct = record.practical.total > 0 ? (record.practical.present / record.practical.total) * 100 : 0;
        const fieldPct = record.fieldWork.total > 0 ? (record.fieldWork.present / record.fieldWork.total) * 100 : 0;

        const overallPresent = (record.lecture.present || 0) + (record.practical.present || 0) + (record.fieldWork.present || 0);
        const overallTotal = (record.lecture.total || 0) + (record.practical.total || 0) + (record.fieldWork.total || 0);
        const overallPct = overallTotal > 0 ? (overallPresent / overallTotal) * 100 : 0;

        // Display status warning alerts and state labels
        const warningBadge = overallPct >= 80
          ? `<span class="badge" style="margin-left: 8px; background: var(--accent-glow) !important; color: var(--accent) !important; border: 1px solid var(--border-color); font-family: var(--font-family-app) !important; font-weight: 600; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; transition: background 0.3s ease, color 0.3s ease;">Good (<strong>${overallPct.toFixed(0)}%</strong>)</span>`
          : overallPct >= 60
            ? `<span class="badge" style="margin-left: 8px; background: rgba(208, 0, 24, 0.15) !important; color: var(--danger) !important; border: 1px solid var(--danger); font-family: var(--font-family-app) !important; font-weight: 600; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem;">Warning (<strong>${overallPct.toFixed(0)}%</strong>)</span>`
            : `<span class="badge" style="margin-left: 8px; background: rgba(208, 0, 24, 0.15) !important; color: var(--danger) !important; border: 1px solid var(--danger); font-family: var(--font-family-app) !important; font-weight: 600; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem;">Critical (<strong>${overallPct.toFixed(0)}%</strong>)</span>`;

        // Visual colors & Fills (enforce dynamic theme accents when overall is Good (>=80%), fallback to danger warnings when <80%)
        const isSafe = overallPct >= 80;
        const lectColor = isSafe ? 'var(--accent)' : 'var(--danger)';
        const lectFill = isSafe 
          ? 'linear-gradient(90deg, var(--accent) 0%, var(--accent-secondary) 100%) !important'
          : 'var(--danger) !important';

        const pracColor = isSafe ? 'var(--accent)' : 'var(--danger)';
        const pracFill = isSafe 
          ? 'linear-gradient(90deg, var(--accent) 0%, var(--accent-secondary) 100%) !important'
          : 'var(--danger) !important';

        const fieldColor = isSafe ? 'var(--accent)' : 'var(--danger)';
        const fieldFill = isSafe 
          ? 'linear-gradient(90deg, var(--accent) 0%, var(--accent-secondary) 100%) !important'
          : 'var(--danger) !important';

        let displayTitle = sub.isSubmodule 
          ? `${sub.parentSubjectCode} — ${sub.name}` 
          : `${sub.code} — ${sub.name}`;
        if (displayTitle.includes('sub_') || displayTitle.includes('SUB_')) {
          displayTitle = displayTitle.replace(/sub_[^\s—:]+/gi, 'Unknown Subject').replace(/SUB_[^\s—:]+/gi, 'Unknown Subject');
        }

        let yxSx = 'N/A';
        if (sub.semester && sub.semester.includes('-')) {
          const parts = sub.semester.split('-');
          yxSx = `Y${parts[0]} - S${parts[1]}`;
        }

        return `
          <div class="card col-6" style="flex-direction: column; gap: 14px; padding: 16px; font-family: var(--font-family-app) !important;">
            <!-- Subject Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-family: var(--font-family-app) !important;">
              <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-family: var(--font-family-app) !important;">
                <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); font-family: var(--font-family-app) !important;">${displayTitle}</h3>
                ${warningBadge}
              </div>
              <div class="badge" style="background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-color); color: var(--text-secondary); font-family: var(--font-family-app) !important; font-weight: 600; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; white-space: nowrap;">
                ${yxSx}
              </div>
            </div>

            <!-- Warning/Status Alert Banner -->
            ${overallPct >= 80 ? `
              <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); color: var(--text-primary); border-radius: 8px; padding: 10px 12px; font-size: 0.78rem; font-weight: 600; font-family: var(--font-family-app) !important; display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; flex-shrink: 0; transition: stroke 0.3s ease;"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Attendance is within the safe eligibility zone (Good).</span>
              </div>
            ` : overallPct >= 60 ? `
              <div style="background: rgba(208, 0, 24, 0.08); border: 1px solid var(--danger); border-radius: 8px; padding: 10px 12px; font-size: 0.78rem; color: var(--danger); font-weight: 600; font-family: var(--font-family-app) !important; display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg" style="flex-shrink: 0;"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                <span>Attendance is borderline (Warning). Try to attend upcoming sessions to avoid falling below 80%.</span>
              </div>
            ` : `
              <div style="background: rgba(208, 0, 24, 0.08); border: 1px solid var(--danger); border-radius: 8px; padding: 10px 12px; font-size: 0.78rem; color: var(--danger); font-weight: 600; font-family: var(--font-family-app) !important; display: flex; align-items: center; gap: 6px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="alert-svg" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                <span>ATTENDANCE CRITICAL: Exam admission eligibility is currently barred (Below 60%).</span>
              </div>
            `}

            <!-- Progress Bars Row -->
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; font-family: var(--font-family-app) !important;">
              <!-- Lectures -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-family: var(--font-family-app) !important;">
                  <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing:0.04em; font-family: var(--font-family-app) !important;">Lectures</span>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: ${lectColor} !important; transition: color 0.3s ease;">${lectPct.toFixed(0)}%</span>
                </div>
                <div style="height: 6px; background: var(--border-color); border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                  <div style="width: ${Math.min(lectPct, 100)}%; height: 100%; background: ${lectFill}; border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--font-family-app) !important;">
                  <input type="number" class="att-input present-input" data-code="${sub.code}" data-track="lecture" data-field="present" value="${record.lecture.present}" min="0" style="width: 52px; height: 26px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); text-align: center; font-size: 0.8rem; font-family: var(--font-family-app) !important; outline: none; border-color: rgba(255, 255, 255, 0.15);" />
                  <span style="color: var(--text-muted); font-size: 0.8rem;">/</span>
                  <input type="number" class="att-input total-input" data-code="${sub.code}" data-track="lecture" data-field="total" value="${record.lecture.total}" min="0" style="width: 52px; height: 26px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); text-align: center; font-size: 0.8rem; font-family: var(--font-family-app) !important; outline: none; border-color: rgba(255, 255, 255, 0.15);" />
                </div>
              </div>

              <!-- Practicals -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-family: var(--font-family-app) !important;">
                  <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing:0.04em; font-family: var(--font-family-app) !important;">Practicals</span>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: ${pracColor} !important; transition: color 0.3s ease;">${pracPct.toFixed(0)}%</span>
                </div>
                <div style="height: 6px; background: var(--border-color); border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                  <div style="width: ${Math.min(pracPct, 100)}%; height: 100%; background: ${pracFill}; border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--font-family-app) !important;">
                  <input type="number" class="att-input present-input" data-code="${sub.code}" data-track="practical" data-field="present" value="${record.practical.present}" min="0" style="width: 52px; height: 26px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); text-align: center; font-size: 0.8rem; font-family: var(--font-family-app) !important; outline: none; border-color: rgba(255, 255, 255, 0.15);" />
                  <span style="color: var(--text-muted); font-size: 0.8rem;">/</span>
                  <input type="number" class="att-input total-input" data-code="${sub.code}" data-track="practical" data-field="total" value="${record.practical.total}" min="0" style="width: 52px; height: 26px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); text-align: center; font-size: 0.8rem; font-family: var(--font-family-app) !important; outline: none; border-color: rgba(255, 255, 255, 0.15);" />
                </div>
              </div>

              <!-- Field Work -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; font-family: var(--font-family-app) !important;">
                  <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing:0.04em; font-family: var(--font-family-app) !important;">Field Work</span>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: ${fieldColor} !important; transition: color 0.3s ease;">${fieldPct.toFixed(0)}%</span>
                </div>
                <div style="height: 6px; background: var(--border-color); border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                  <div style="width: ${Math.min(fieldPct, 100)}%; height: 100%; background: ${fieldFill}; border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--font-family-app) !important;">
                  <input type="number" class="att-input present-input" data-code="${sub.code}" data-track="fieldWork" data-field="present" value="${record.fieldWork.present}" min="0" style="width: 52px; height: 26px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); text-align: center; font-size: 0.8rem; font-family: var(--font-family-app) !important; outline: none; border-color: rgba(255, 255, 255, 0.15);" />
                  <span style="color: var(--text-muted); font-size: 0.8rem;">/</span>
                  <input type="number" class="att-input total-input" data-code="${sub.code}" data-track="fieldWork" data-field="total" value="${record.fieldWork.total}" min="0" style="width: 52px; height: 26px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); text-align: center; font-size: 0.8rem; font-family: var(--font-family-app) !important; outline: none; border-color: rgba(255, 255, 255, 0.15);" />
                </div>
              </div>
            </div>

            <!-- Semester Session Progress -->
            <div style="margin-top: 4px; font-family: var(--font-family-app) !important;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-family: var(--font-family-app) !important;">
                <span style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; font-family: var(--font-family-app) !important;">Semester Coverage</span>
                <span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-family-app) !important;">${overallPresent} attended / ${overallTotal} conducted</span>
              </div>
            </div>
          </div>
        `;
      })).then(rows => rows.join(''));

      // Bind input changes
      container.querySelectorAll('.att-input').forEach(input => {
        input.addEventListener('change', (e) => {
          const code = input.getAttribute('data-code');
          const track = input.getAttribute('data-track'); // lecture, practical, fieldWork
          const field = input.getAttribute('data-field'); // present, total
          const val = parseInt(input.value) || 0;
          this.handleUpdateAttendanceField(code, track, field, val);
        });
      });

    } catch (err) {
      console.error('Attendance render failed:', err);
    }
  },

  async handleUpdateAttendanceField(code, track, field, val) {
    try {
      const records = await Database.getAll('attendance');
      const rec = records.find(r => r.subjectCode === code);
      if (!rec) return;

      if (!rec[track]) {
        rec[track] = { total: 0, present: 0 };
      }
      
      const cleanVal = Math.max(0, val);
      rec[track][field] = cleanVal;

      // Business validation: total must be >= present
      if (field === 'present') {
        if (rec[track].present > rec[track].total) {
          rec[track].total = rec[track].present;
        }
      } else if (field === 'total') {
        if (rec[track].total < rec[track].present) {
          rec[track].present = rec[track].total;
        }
      }

      // Sync old fields for backwards compatibility with exams and analytics modules
      rec.lecturesTotal = rec.lecture.total;
      rec.lecturesAttended = rec.lecture.present;
      rec.practicalsTotal = rec.practical.total + rec.fieldWork.total;
      rec.practicalsAttended = rec.practical.present + rec.fieldWork.present;
      rec.approvedMedicalSessions = 0;

      await Database.put('attendance', rec);

      // Low attendance warnings alerts
      const overall = rec.lecture.present + rec.practical.present + rec.fieldWork.present;
      const total = rec.lecture.total + rec.practical.total + rec.fieldWork.total;
      const pct = total > 0 ? (overall / total) * 100 : 0;

      if (pct < 80) {
        const remainingLectures    = rec.lecturesRemaining    ?? Math.max(0, 30 - rec.lecture.total);
        const remainingPracticals  = rec.practicalsRemaining  ?? Math.max(0, 10 - rec.practical.total);
        const remainingFieldWork   = rec.fieldWorkRemaining   ?? Math.max(0, 5 - rec.fieldWork.total);
        const totalRemaining       = remainingLectures + remainingPracticals + remainingFieldWork;

        const riskStr = calcCriticalRiskIndex(overall, total, totalRemaining);
        if (riskStr) {
          NotificationService.show('Low Attendance Warning', riskStr, 'warning');
        }
      }

      this.render();
      window.dispatchEvent(new CustomEvent('attendanceUpdated'));

    } catch (err) {
      console.error('Update attendance field failed:', err);
    }
  }
};
