/**
 * Rajarata Campus Life Manager - Attendance Tracker Modules
 * Logs attendance records and calculates eligibility percentages per subject
 * UPGRADED: Critical Risk Index engine — "X consecutive lectures needed" warning strings
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
    return `⛔ INELIGIBLE RISK: Even attending all ${remaining} remaining lecture(s) is insufficient to reach 80%.`;
  }

  return `⚠ ${shortfall} mandatory consecutive lecture(s) needed to secure 80% exam eligibility threshold.`;
}

export const AttendanceModule = {
  // Configurable: estimated lectures remaining in semester (default 30 as fallback)
  ESTIMATED_REMAINING: 30,

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
      const subjects   = await Database.getAll('subjects');

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
        const overallTotal    = record.lecturesTotal + record.practicalsTotal;
        const overallPct      = overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;

        // ── Critical Risk Index ──────────────────────────────────────────────
        // Estimate remaining lectures (from record if provided, else default)
        const remainingLectures    = record.lecturesRemaining    ?? Math.max(0, 30 - record.lecturesTotal);
        const remainingPracticals  = record.practicalsRemaining  ?? Math.max(0, 10 - record.practicalsTotal);
        const totalRemaining       = remainingLectures + remainingPracticals;

        const riskWarning = calcCriticalRiskIndex(overallAttended, overallTotal, totalRemaining);

        const warningBadge = overallPct >= 80
          ? `<span class="badge low" style="margin-left: 8px; background:rgba(16,185,129,0.15); color:var(--success);">✓ Eligible (${overallPct.toFixed(0)}%)</span>`
          : overallPct >= 70
            ? `<span class="badge medium" style="margin-left: 8px;">⚠ Borderline (${overallPct.toFixed(0)}%)</span>`
            : `<span class="badge high" style="margin-left: 8px;">⛔ At Risk (${overallPct.toFixed(0)}%)</span>`;

        // Visual attendance bar segments
        const lectBarWidth = Math.min(lectPct, 100);
        const pracBarWidth = Math.min(pracPct, 100);
        const lectColor    = lectPct >= 80 ? 'var(--success)' : lectPct >= 70 ? 'var(--warning)' : 'var(--danger)';
        const pracColor    = pracPct >= 80 ? 'var(--success)' : pracPct >= 70 ? 'var(--warning)' : 'var(--danger)';

        // Remaining total bar
        const totalRemPct = overallTotal > 0
          ? Math.min((overallTotal / (overallTotal + totalRemaining)) * 100, 100)
          : 0;

        return `
          <div class="card col-12" style="flex-direction: column; gap: 14px; padding: 16px;">
            <!-- Subject Header -->
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary);">${sub.code}</h3>
                ${warningBadge}
              </div>
              <h4 style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">${sub.name}</h4>
            </div>

            <!-- Critical Risk Index Banner -->
            ${riskWarning ? `
              <div style="background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 8px; padding: 10px 12px; font-size: 0.78rem; color: var(--danger); font-weight: 600; line-height: 1.5;">
                ${riskWarning}
              </div>
            ` : `
              <div style="background: rgba(16,185,129,0.06); border: 1px solid rgba(16,185,129,0.18); border-radius: 8px; padding: 8px 12px; font-size: 0.76rem; color: var(--success); font-weight: 600;">
                ✅ Attendance is within the safe eligibility zone. Keep it up!
              </div>
            `}

            <!-- Progress Bars Row -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <!-- Lectures -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                  <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing:0.04em;">Lectures</span>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: ${lectColor};">${lectPct.toFixed(0)}%</span>
                </div>
                <div style="height: 6px; background: var(--border-color); border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                  <div style="width: ${lectBarWidth}%; height: 100%; background: ${lectColor}; border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="lectures" data-action="dec"
                    style="width: 26px; height: 26px; font-size: 0.85rem; border-radius: 50%;">−</button>
                  <span style="font-size: 0.78rem; color: var(--text-muted);">${record.lecturesAttended} / ${record.lecturesTotal}</span>
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="lectures" data-action="inc"
                    style="width: 26px; height: 26px; font-size: 0.85rem; border-radius: 50%;">+</button>
                </div>
              </div>

              <!-- Practicals -->
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                  <span style="font-size: 0.7rem; font-weight: 700; text-transform: uppercase; color: var(--text-secondary); letter-spacing:0.04em;">Practicals</span>
                  <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.82rem; font-weight: 700; color: ${pracColor};">${pracPct.toFixed(0)}%</span>
                </div>
                <div style="height: 6px; background: var(--border-color); border-radius: 4px; overflow: hidden; margin-bottom: 6px;">
                  <div style="width: ${pracBarWidth}%; height: 100%; background: ${pracColor}; border-radius: 4px; transition: width 0.4s ease;"></div>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="practicals" data-action="dec"
                    style="width: 26px; height: 26px; font-size: 0.85rem; border-radius: 50%;">−</button>
                  <span style="font-size: 0.78rem; color: var(--text-muted);">${record.practicalsAttended} / ${record.practicalsTotal}</span>
                  <button class="btn-icon adjust-att-btn" data-code="${sub.code}" data-type="practicals" data-action="inc"
                    style="width: 26px; height: 26px; font-size: 0.85rem; border-radius: 50%;">+</button>
                </div>
              </div>
            </div>

            <!-- Semester Session Progress -->
            <div style="margin-top: -2px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span style="font-size: 0.68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em;">Semester Coverage</span>
                <span style="font-size: 0.68rem; color: var(--text-muted);">${overallTotal} conducted · ~${totalRemaining} remaining</span>
              </div>
              <div style="height: 4px; background: var(--border-color); border-radius: 3px; overflow: hidden;">
                <div style="width: ${totalRemPct}%; height: 100%; background: var(--accent); opacity: 0.5; border-radius: 3px;"></div>
              </div>
            </div>
          </div>
        `;
      })).then(rows => rows.join(''));

      // Bind Counter adjustments buttons
      container.querySelectorAll('.adjust-att-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const code   = btn.getAttribute('data-code');
          const type   = btn.getAttribute('data-type');   // lectures or practicals
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
      const rec     = records.find(r => r.subjectCode === code);
      if (!rec) return;

      const prefix      = type === 'lectures' ? 'lectures' : 'practicals';
      const attendedKey = `${prefix}Attended`;
      const totalKey    = `${prefix}Total`;

      if (action === 'inc') {
        if (rec[attendedKey] < rec[totalKey]) {
          rec[attendedKey]++;
        } else {
          // Also bump total if user is logging a new session
          rec[totalKey]++;
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
      const total   = rec.lecturesTotal + rec.practicalsTotal;
      const pct     = total > 0 ? (overall / total) * 100 : 0;

      if (pct < 80 && action === 'dec') {
        const remaining = (rec.lecturesRemaining ?? 0) + (rec.practicalsRemaining ?? 0);
        const riskStr   = calcCriticalRiskIndex(overall, total, remaining);
        if (riskStr) {
          NotificationService.show('Low Attendance Warning', riskStr, 'warning');
        }
      }

      this.render();
      window.dispatchEvent(new CustomEvent('attendanceUpdated'));

    } catch (err) {
      console.error('Adjust attendance failed:', err);
    }
  }
};
