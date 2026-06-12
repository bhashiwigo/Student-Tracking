/**
 * Rajarata Campus Life Manager - Attendance Tracker Modules
 * Logs attendance records and calculates eligibility percentages per subject
 */

import { Database } from '../database/db.js';
import { NotificationService } from '../services/notifications.js';

export const AttendanceModule = {
  init() {
    this.bindEvents();
    window.addEventListener('subjectsUpdated', () => this.render());
  },

  bindEvents() {
    // Buttons increments are handled dynamically inside render handlers
  },

  async render() {
    const container = document.getElementById('attendance-tracker-container');
    if (!container) return;

    try {
      const attendance = await Database.getAll('attendance');
      const subjects = await Database.getAll('subjects');

      if (subjects.length === 0) {
        container.innerHTML = `
          <div class="col-12" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No course units added to track attendance. Add them in Academic view.
          </div>
        `;
        return;
      }

      container.innerHTML = await Promise.all(subjects.map(async (sub) => {
        let record = attendance.find(a => a.subjectCode === sub.code);
        
        // Safety initialization if missing
        if (!record) {
          record = {
            subjectCode: sub.code,
            lecturesAttended: 0,
            lecturesTotal: 30,
            practicalsAttended: 0,
            practicalsTotal: 10
          };
          await Database.add('attendance', record);
        }

        const lectPct = record.lecturesTotal > 0 ? (record.lecturesAttended / record.lecturesTotal) * 100 : 0;
        const pracPct = record.practicalsTotal > 0 ? (record.practicalsAttended / record.practicalsTotal) * 100 : 0;
        
        const overallAttended = record.lecturesAttended + record.practicalsAttended;
        const overallTotal = record.lecturesTotal + record.practicalsTotal;
        const overallPct = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;

        const warningState = overallPct < 80 ? 'warning' : 'secure';
        const warningBadge = overallPct < 80 
          ? `<span class="badge high" style="margin-left: 8px;">⚠ Eligibility At Risk (${overallPct.toFixed(0)}%)</span>`
          : `<span class="badge low" style="margin-left: 8px;">✓ Eligible</span>`;

        return `
          <div class="card col-12" style="display: flex; flex-direction: row; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div style="flex: 1; min-width: 200px;">
              <div style="display: flex; align-items: center;">
                <h3 style="font-size: 1.1rem; font-weight: 700;">${sub.code}</h3>
                ${warningBadge}
              </div>
              <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 2px;">${sub.name}</h4>
            </div>

            <div style="display: flex; gap: 24px; flex-wrap: wrap;">
              <!-- Lectures counter -->
              <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary);">Lectures (${record.lecturesAttended}/${record.lecturesTotal})</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="lectures" data-action="dec" style="width: 24px; height: 24px; font-size: 0.8rem;">-</button>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; font-weight: 700; width: 44px; text-align: center; color: ${lectPct >= 80 ? 'var(--success)' : 'var(--danger)'};">${lectPct.toFixed(0)}%</span>
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="lectures" data-action="inc" style="width: 24px; height: 24px; font-size: 0.8rem;">+</button>
                </div>
              </div>

              <!-- Practicals counter -->
              <div style="display: flex; flex-direction: column; gap: 4px; align-items: center;">
                <span style="font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--text-secondary);">Practicals (${record.practicalsAttended}/${record.practicalsTotal})</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="practicals" data-action="dec" style="width: 24px; height: 24px; font-size: 0.8rem;">-</button>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; font-weight: 700; width: 44px; text-align: center; color: ${pracPct >= 80 ? 'var(--success)' : 'var(--danger)'};">${pracPct.toFixed(0)}%</span>
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="practicals" data-action="inc" style="width: 24px; height: 24px; font-size: 0.8rem;">+</button>
                </div>
              </div>
            </div>
          </div>
        `;
      })).then(rows => rows.join(''));

      // Bind Counter adjustments buttons
      container.querySelectorAll('.adjust-att-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          const type = btn.getAttribute('data-type'); // lectures or practicals
          const action = btn.getAttribute('data-action'); // inc or dec
          this.handleAdjustAttendance(code, type, action);
        });
      });

    } catch (err) {
      console.error('Attendance render failed:', err);
    }
  },

  async handleAdjustAttendance(code, type, action) {
    try {
      const records = await Database.getAll('attendance');
      const rec = records.find(r => r.subjectCode === code);
      if (!rec) return;

      const prefix = type === 'lectures' ? 'lectures' : 'practicals';
      const attendedKey = `${prefix}Attended`;
      const totalKey = `${prefix}Total`;

      if (action === 'inc') {
        if (rec[attendedKey] < rec[totalKey]) {
          rec[attendedKey]++;
        }
      } else {
        if (rec[attendedKey] > 0) {
          rec[attendedKey]--;
        }
      }

      await Database.put('attendance', rec);
      
      // Calculate overall stats to fire alert warning on risk dropdowns
      const overall = rec.lecturesAttended + rec.practicalsAttended;
      const total = rec.lecturesTotal + rec.practicalsTotal;
      const pct = total > 0 ? (overall / total) * 100 : 0;
      
      if (pct < 80 && action === 'dec') {
        NotificationService.show('Low Attendance Warning', `Attendance for ${code} dropped below the required 80% threshold.`, 'warning');
      }

      this.render();
      // BUG FIX: Was dispatching 'subjectsUpdated' which caused an infinite re-render
      // loop because AttendanceModule.init() listens on 'subjectsUpdated' → render().
      // Now dispatches a dedicated 'attendanceUpdated' event instead.
      window.dispatchEvent(new CustomEvent('attendanceUpdated'));

    } catch (err) {
      console.error('Adjust attendance failed:', err);
    }
  }
};
