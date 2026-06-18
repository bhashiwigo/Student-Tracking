/**
 * Rajarata Campus Life Manager - Academic Analytics
 * Coordinates Chart.js rendering on Dashboard & Analytics views
 *
 * THEME ENGINE: getColor() queries document.body so body[data-studio-theme]
 * CSS variable overrides take precedence over :root defaults.
 */

import { Database } from '../database/db.js';
import { GPAModule } from './gpa.js';

const getCleanSubmoduleLabel = (sub, rawParents) => {
  if (!sub) return 'CORE - Unknown';
  const parentCode = sub.parentSubjectCode;
  const parentExists = parentCode && (rawParents || []).some(p => p.code === parentCode);
  const code = parentExists ? parentCode : 'CORE';
  const title = sub.name || sub.moduleTitle || 'Unknown';
  return `${code} - ${title}`;
};

let dashboardGPATrendChart    = null;
let dashboardAssignmentsChart = null;
let dashboardBalanceChart     = null;
let dashboardRadarChart       = null;
let analyticsDetailedChart    = null;
let studySessionStatsChart    = null;

// Default RUSL Grade boundary thresholds (minimum raw marks out of 100)
const RUSL_GRADE_BOUNDARIES = {
  'A+': 90, 'A': 85, 'A-': 80,
  'B+': 75, 'B': 70, 'B-': 65,
  'C+': 60, 'C': 55, 'C-': 50,
  'D+': 45, 'D': 40
};

/**
 * Reads a CSS custom property from the active theme scope (document.body),
 * so body[data-studio-theme] overrides take precedence over :root defaults.
 * @param {string} varName  CSS custom property, e.g. '--accent'
 * @param {number} opacity  0-1 opacity blending (1 = return raw value)
 * @returns {string}
 */
const getColor = (varName, opacity = 1) => {
  // Query body first to capture data-studio-theme overrides
  let val = getComputedStyle(document.body).getPropertyValue(varName).trim();
  // Fallback to :root
  if (!val) {
    val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  }
  // Safety fallbacks
  if (!val) {
    const fallbacks = {
      '--accent':           '#00e5ff',
      '--accent-secondary': '#00e676',
      '--accent-glow':      'rgba(0,229,255,0.2)',
      '--success':          '#00e676',
    };
    val = fallbacks[varName] ?? '#ffffff';
  }

  if (opacity === 1) return val;

  // Convert hex to rgba
  if (/^#([0-9a-f]{3,8})$/i.test(val)) {
    const hex  = val.slice(1);
    const full = hex.length <= 4 ? hex.split('').map(c => c + c).join('') : hex;
    const r    = parseInt(full.slice(0, 2), 16);
    const g    = parseInt(full.slice(2, 4), 16);
    const b    = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  // Convert rgb()/rgba() to new opacity
  if (val.startsWith('rgb')) {
    const nums = val.match(/[\d.]+/g);
    if (nums && nums.length >= 3) {
      return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${opacity})`;
    }
  }
  return val;
};

/**
 * Destroys every active Chart.js instance so the next render() starts clean,
 * ensuring fresh color tokens are applied on every theme switch.
 */
const destroyAllCharts = () => {
  const charts = [
    dashboardGPATrendChart, dashboardAssignmentsChart,
    dashboardBalanceChart,  dashboardRadarChart,
    analyticsDetailedChart, studySessionStatsChart,
  ];
  charts.forEach(c => { if (c) c.destroy(); });
  dashboardGPATrendChart    = null;
  dashboardAssignmentsChart = null;
  dashboardBalanceChart     = null;
  dashboardRadarChart       = null;
  analyticsDetailedChart    = null;
  studySessionStatsChart    = null;
};

export const AnalyticsModule = {
  init() {
    // Debounce all data-change events to 120 ms so rapid sequential IndexedDB
    // writes collapse into a single chart redraw instead of destroy+recreate
    // multiple times per second.
    let _analyticsDebounce = null;
    const scheduleRender = () => {
      clearTimeout(_analyticsDebounce);
      _analyticsDebounce = setTimeout(() => this.render(), 120);
    };

    window.addEventListener('subjectsUpdated',      scheduleRender);
    window.addEventListener('attendanceUpdated',    scheduleRender);
    window.addEventListener('calendarItemsUpdated', scheduleRender);

    // Intercept predictor dropdown changes
    const selectPredictor = document.getElementById('predictor-subject-select');
    const gradePredictor = document.getElementById('predictor-grade-select');
    const recGradeCheckbox = document.getElementById('predictor-use-recommended-grade');
    if (selectPredictor) {
      selectPredictor.addEventListener('change', () => this.updatePredictorHUD());
    }
    if (gradePredictor) {
      gradePredictor.addEventListener('change', () => this.updatePredictorHUD());
    }
    if (recGradeCheckbox) {
      recGradeCheckbox.addEventListener('change', () => this.updatePredictorHUD());
    }

    // Intercept attendance dropdown changes
    const selectAttendance = document.getElementById('dash-attendance-subject-select');
    if (selectAttendance) {
      selectAttendance.addEventListener('change', () => this.render());
    }
  },

  async render() {
    const dashboardTrendCanvas    = document.getElementById('chart-dashboard-gpa');
    const analyticsDetailedCanvas = document.getElementById('chart-analytics-detailed');
    const studyStatsCanvas        = document.getElementById('chart-analytics-study');

    // Destroy all existing chart instances before rebuilding.
    destroyAllCharts();

    try {
      // 1. Setup Runtime Dynamic Accumulators
      const [
        subjects, attendance, assignments, studyPlans, sports, futureModules, allSettings, practicals, researchProjects, headingsConfig, rawParents
      ] = await Promise.all([
        Database.getAll('subjects'),
        Database.getAll('attendance'),
        Database.getAll('assignments'),
        Database.getAll('studyplans'),
        Database.getAll('sports'),
        Database.getAll('futureModules'),
        Database.getAll('settings'),
        Database.getAll('practicals'),
        Database.getAll('researchProject'),
        Database.get('researchConfig', 'headingsConfig'),
        Database.getAll('subjects-raw'),
      ]);

      const settingsMap = {};
      (allSettings || []).forEach(s => {
        settingsMap[s.key] = s.value;
      });
      
      // GPA target progress updates
      const targetSetting = await Database.get('settings', 'gpaTarget');
      const targetGpa = targetSetting ? parseFloat(targetSetting.value) : 3.70;
      const gpaStats = await GPAModule.calculateGPAs(subjects);
      const currentCumGpa = gpaStats.overall || 0.00;
      const progressPct = targetGpa > 0 ? Math.min((currentCumGpa / targetGpa) * 100, 100) : 0;
      
      const pctEl = document.getElementById('dash-gpa-progress-pct');
      const barEl = document.getElementById('dash-gpa-progress-bar');
      if (pctEl) pctEl.innerText = `${progressPct.toFixed(0)}%`;
      if (barEl) barEl.style.width = `${progressPct}%`;

      // C: Overall GPA Forecast Ring & text sync
      const gpaForecastEl = document.getElementById('dash-metric-gpa');
      if (gpaForecastEl) {
        gpaForecastEl.innerText = currentCumGpa.toFixed(2);
      }
      const gpaSubEl = document.getElementById('dash-metric-gpa-sub');
      if (gpaSubEl) {
        gpaSubEl.innerText = currentCumGpa.toFixed(2);
      }
      const gpaRingFill = document.getElementById('dash-metric-gpa-ring');
      if (gpaRingFill) {
        const percent = Math.min((currentCumGpa / 4.0) * 100, 100);
        const dashOffset = 251.2 - (percent / 100) * 251.2;
        gpaRingFill.style.strokeDashoffset = dashOffset;
      }

      // D: Dashboard Attendance SVG Ring
      const attSelect = document.getElementById('dash-attendance-subject-select');
      if (attSelect) {
        const prevVal = attSelect.value;
        const currentOptions = Array.from(attSelect.options).map(o => o.value);
        const subjectsCodes = subjects.map(s => s.code);
        const listsMatch = currentOptions.length === subjectsCodes.length && currentOptions.every((v, i) => v === subjectsCodes[i]);
        
        if (!listsMatch) {
          attSelect.innerHTML = subjects.map(s => `
            <option value="${s.code}">${getCleanSubmoduleLabel(s, rawParents)}</option>
          `).join('');
          
          if (prevVal && subjects.some(s => s.code === prevVal)) {
            attSelect.value = prevVal;
          } else if (subjects.length > 0) {
            attSelect.value = subjects[0].code;
          }
        }
      }

      let pct = 0;
      const selectedSubCode = attSelect ? attSelect.value : null;
      if (selectedSubCode) {
        const rec = attendance.find(a => a.subjectCode === selectedSubCode);
        if (rec) {
          const lecturesAttended = rec.lecturesAttended || 0;
          const lecturesTotal = rec.lecturesTotal || 0;
          pct = lecturesTotal > 0 ? (lecturesAttended / lecturesTotal) * 100 : 0;
        }
      }

      const attRingFill = document.getElementById('dash-metric-att-ring');
      if (attRingFill) {
        const dashOffset = 251.2 - (Math.min(pct, 100) / 100) * 251.2;
        attRingFill.style.strokeDashoffset = dashOffset;

        attRingFill.classList.remove('att-warn', 'att-danger');
        if (pct < 60) {
          attRingFill.classList.add('att-danger');
        } else if (pct < 80) {
          attRingFill.classList.add('att-warn');
        }
      }

      const valEl = document.getElementById('dashboard-attendance-text-val');
      if (valEl) valEl.innerText = `${pct.toFixed(0)}%`;

      const attSubEl = document.getElementById('dash-metric-att-sub');
      if (attSubEl) attSubEl.innerText = `${pct.toFixed(0)}%`;

      const attMetricEl = document.getElementById('dash-metric-att');
      if (attMetricEl) attMetricEl.innerText = `${pct.toFixed(0)}%`;

      // 2. Bind Section E: "Current Academic Balance"
      const balanceContainer = document.querySelector('.balance-progress-group');
      if (balanceContainer) {
        if (subjects.length === 0) {
          balanceContainer.innerHTML = `
            <div class="balance-item">
              <div class="balance-header">
                <span>Botany</span>
                <span>0%</span>
              </div>
              <div class="balance-bar-bg">
                <div class="balance-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
            <div class="balance-item">
              <div class="balance-header">
                <span>Zoology</span>
                <span>0%</span>
              </div>
              <div class="balance-bar-bg">
                <div class="balance-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
            <div class="balance-item">
              <div class="balance-header">
                <span>Chemistry</span>
                <span>0%</span>
              </div>
              <div class="balance-bar-bg">
                <div class="balance-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
          `;
        } else {
          balanceContainer.innerHTML = subjects.map(s => {
            const ca = (s.internalMarks && s.internalMarks.ca) !== undefined ? parseFloat(s.internalMarks.ca) : 0;
            const quiz = (s.internalMarks && s.internalMarks.quiz) !== undefined ? parseFloat(s.internalMarks.quiz) : 0;
            const lab = (s.internalMarks && s.internalMarks.lab) !== undefined ? parseFloat(s.internalMarks.lab) : 0;
            const progress = (ca + quiz + lab) / 3;
            return `
              <div class="balance-item">
                <div class="balance-header">
                  <span>${getCleanSubmoduleLabel(s, rawParents)}</span>
                  <span>${progress.toFixed(0)}%</span>
                </div>
                <div class="balance-bar-bg">
                  <div class="balance-bar-fill" style="width: ${progress}%;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 3. Bind Section F: "GPA Predictor HUD"
      const selectPredictor = document.getElementById('predictor-subject-select');
      if (selectPredictor) {
        // Sync items if select is empty or out of sync with subjects
        const prevVal = selectPredictor.value;
        const currentOptions = Array.from(selectPredictor.options).map(o => o.value);
        const subjectsCodes = subjects.map(s => s.code);
        const listsMatch = currentOptions.length === subjectsCodes.length && currentOptions.every((v, i) => v === subjectsCodes[i]);
        
        if (!listsMatch) {
          selectPredictor.innerHTML = subjects.map(s => `
            <option value="${s.code}">${getCleanSubmoduleLabel(s, rawParents)}</option>
          `).join('') || '<option value="">No course units added</option>';
          
          if (prevVal && subjects.some(s => s.code === prevVal)) {
            selectPredictor.value = prevVal;
          } else if (subjects.length > 0) {
            selectPredictor.value = subjects[0].code;
          }
        }
      }
      await this.updatePredictorHUD();

      // 4. Bind Section G: "Botany Component Tracking"
      if (dashboardTrendCanvas) {
        const botanySubjects = subjects
          .filter(s => (s.code || '').toUpperCase().includes('BOT'))
          .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
        
        // Dynamically update the card title to reflect dynamic weights and credit ratios
        const cardTitleEl = dashboardTrendCanvas.closest('.card')?.querySelector('.card-title span');
        if (cardTitleEl) {
          cardTitleEl.innerText = 'Botany Component Tracking (Dynamic Weights & Credits)';
        }

        const labels = botanySubjects.map(s => s.code);
        const theoryData = botanySubjects.map(s => {
          const ca = s.internalMarks?.ca !== undefined ? parseFloat(s.internalMarks.ca) : 0;
          const quiz = s.internalMarks?.quiz !== undefined ? parseFloat(s.internalMarks.quiz) : 0;
          const theoryWeight = s.theoryWeight !== undefined ? parseFloat(s.theoryWeight) : 70;
          const credits = s.credits !== undefined ? parseFloat(s.credits) : 1;
          const theoryScore = (ca + quiz) / 2;
          return theoryScore * (theoryWeight / 100) * credits;
        });
        const practicalData = botanySubjects.map(s => {
          const lab = s.internalMarks?.lab !== undefined ? parseFloat(s.internalMarks.lab) : 0;
          const practicalWeight = s.practicalWeight !== undefined ? parseFloat(s.practicalWeight) : 30;
          const credits = s.credits !== undefined ? parseFloat(s.credits) : 1;
          return lab * (practicalWeight / 100) * credits;
        });

        dashboardGPATrendChart = new Chart(dashboardTrendCanvas.getContext('2d'), {
          type: 'line',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Weighted Theory Component',
                data: theoryData,
                borderColor: getColor('--accent-secondary') || '#00e676',
                backgroundColor: getColor('--accent-secondary', 0.02) || 'rgba(0, 230, 118, 0.02)',
                tension: 0.35,
                borderWidth: 2,
                fill: true,
                pointBackgroundColor: getColor('--accent-secondary') || '#00e676'
              },
              {
                label: 'Weighted Practical Component',
                data: practicalData,
                borderColor: getColor('--accent'),
                backgroundColor: getColor('--accent', 0.05),
                tension: 0.35,
                borderWidth: 2,
                fill: true,
                pointBackgroundColor: getColor('--accent')
              }
            ]
          },
          options: this.getChartOptions(null)
        });
      }

      // 5. Bind Section H: "Lab Report Completion"
      const labContainer = document.querySelector('.lab-completion-container');
      if (labContainer) {
        const practicalSubjects = subjects.filter(s => {
          const pWeight = s.practicalWeight !== undefined ? parseFloat(s.practicalWeight) : 0;
          return pWeight > 0;
        });

        if (practicalSubjects.length === 0) {
          labContainer.innerHTML = `
            <div class="lab-item">
              <div class="lab-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Botany 1</span>
                <span style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 2px 8px; color: #000000; font-weight: 800; font-size: 0.78rem; font-family: 'JetBrains Mono', monospace;">0%</span>
              </div>
              <div class="lab-bar-bg">
                <div class="lab-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
            <div class="lab-item">
              <div class="lab-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Report 2</span>
                <span style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 2px 8px; color: #000000; font-weight: 800; font-size: 0.78rem; font-family: 'JetBrains Mono', monospace;">0%</span>
              </div>
              <div class="lab-bar-bg">
                <div class="lab-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
            <div class="lab-item">
              <div class="lab-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Zoology</span>
                <span style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 2px 8px; color: #000000; font-weight: 800; font-size: 0.78rem; font-family: 'JetBrains Mono', monospace;">0%</span>
              </div>
              <div class="lab-bar-bg">
                <div class="lab-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
            <div class="lab-item">
              <div class="lab-header" style="display: flex; justify-content: space-between; align-items: center;">
                <span>Lab</span>
                <span style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 2px 8px; color: #000000; font-weight: 800; font-size: 0.78rem; font-family: 'JetBrains Mono', monospace;">0%</span>
              </div>
              <div class="lab-bar-bg">
                <div class="lab-bar-fill" style="width: 0%;"></div>
              </div>
            </div>
          `;
        } else {
          labContainer.innerHTML = practicalSubjects.map(s => {
            const subjectLabs = (practicals || []).filter(p => p.subjectCode === s.code);
            const totalLabs = subjectLabs.length;
            const completedLabs = subjectLabs.filter(p => p.completed === true).length;
            const percentage = totalLabs > 0 ? Math.round((completedLabs / totalLabs) * 100) : 0;
            return `
              <div class="lab-item">
                <div class="lab-header" style="display: flex; justify-content: space-between; align-items: center;">
                  <span>${getCleanSubmoduleLabel(s, rawParents)}</span>
                  <span style="background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; padding: 2px 8px; color: #000000; font-weight: 800; font-size: 0.78rem; font-family: 'JetBrains Mono', monospace;">${percentage}%</span>
                </div>
                <div class="lab-bar-bg">
                  <div class="lab-bar-fill" style="width: ${percentage}%;"></div>
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // 6. Bind Section I: "Research Project Roadmap"
      const roadmapContainer = document.querySelector('.roadmap-flowchart');
      if (roadmapContainer) {
        const headings = headingsConfig?.headings || [
          "Common Project 1",
          "Lamarck Project",
          "Research Project 2",
          "Research Project"
        ];

        const tasks = (researchProjects || []).filter(r => r && r.id !== 'project1');

        roadmapContainer.innerHTML = headings.map(h => {
          const headingTasks = tasks.filter(t => t.heading === h);
          let status = 'Pending';
          if (headingTasks.length > 0) {
            status = headingTasks.every(t => t.completed) ? 'Completed' : 'In Progress';
          }

          let detailsText = 'Pending 💤';
          let style = '';
          
          if (status === 'Completed') {
            style = `background: ${getColor('--success', 0.15)}; border-color: ${getColor('--success')}; box-shadow: 0 0 10px ${getColor('--success', 0.4)}; cursor: pointer;`;
            detailsText = 'Completed ✅';
          } else if (status === 'In Progress') {
            style = `background: ${getColor('--accent', 0.15)}; border-color: ${getColor('--accent')}; box-shadow: 0 0 10px ${getColor('--accent-glow', 0.8) || getColor('--accent', 0.4)}; cursor: pointer;`;
            detailsText = 'In Progress ⏳';
          } else {
            style = `background: rgba(6, 21, 29, 0.55); border-color: var(--border-color); cursor: pointer;`;
            detailsText = 'Pending 💤';
          }

          return `
            <div class="roadmap-node" data-milestone="${h}" style="${style}">
              ${h} <span style="font-size: 0.6rem; opacity: 0.8; font-weight: 500; display: block;">${detailsText}</span>
            </div>
          `;
        }).join('');

        // Validation pass loop: immediately append the active class onto node if completed
        roadmapContainer.querySelectorAll('.roadmap-node').forEach(node => {
          const milestoneName = node.getAttribute('data-milestone');
          const headingTasks = tasks.filter(t => t.heading === milestoneName);
          const isAllCompleted = headingTasks.length > 0 && headingTasks.every(t => t.completed);

          if (isAllCompleted) {
            node.classList.add('active');
          } else {
            node.classList.remove('active');
          }

          node.addEventListener('click', () => {
            const navLink = document.querySelector('.nav-link[data-target="research"]');
            if (navLink) {
              navLink.click();
            }
          });
        });
      }



      // 2b. Assignments status doughnut
      const dashAssignCanvas = document.getElementById('chart-dashboard-assignments');
      if (dashAssignCanvas) {
        const pendingCount = assignments.filter(a => a.status === 'Pending').length;
        const progressCount = assignments.filter(a => a.status === 'In Progress').length;
        const completedCount = assignments.filter(a => a.status === 'Completed').length;
        
        document.getElementById('dash-assign-pending-count').innerText = `${pendingCount} Pending`;
        document.getElementById('dash-assign-progress-count').innerText = `${progressCount} Active`;
        document.getElementById('dash-assign-completed-count').innerText = `${completedCount} Done`;
        
        dashboardAssignmentsChart = new Chart(dashAssignCanvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Completed', 'In Progress', 'Pending'],
            datasets: [{
              data: [completedCount, progressCount, pendingCount],
              backgroundColor: [getColor('--success'), getColor('--accent'), getColor('--accent-secondary')],
              borderWidth: 1,
              borderColor: 'var(--border-color)'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
              legend: { display: false }
            }
          }
        });
      }

      // 2c. Weekly Study vs Fitness Gym balance
      const dashBalanceCanvas = document.getElementById('chart-dashboard-balance');
      if (dashBalanceCanvas) {
        const labels = [];
        const studyData = [];
        const sportsData = [];
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
          const y = parts.find(p => p.type === 'year').value;
          const m = parts.find(p => p.type === 'month').value;
          const day = parts.find(p => p.type === 'day').value;
          const dateStr = `${y}-${m}-${day}`;
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Colombo' });
          labels.push(dayName);
          
          const completedPlans = studyPlans.filter(p => p.date === dateStr && p.completed);
          const totalStudy = completedPlans.reduce((sum, p) => sum + (parseFloat(p.duration) || 0), 0);
          studyData.push(totalStudy);
          
          const daySports = sports.filter(s => s.scheduleDate === dateStr && (s.activityType === 'Training' || s.activityType === 'Match'));
          const totalSports = daySports.reduce((sum, s) => sum + (parseFloat(s.trainingHours) || 0), 0);
          sportsData.push(totalSports);
        }
        
        dashboardBalanceChart = new Chart(dashBalanceCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Study Hours',
                data: studyData,
                backgroundColor: getColor('--success'),
                borderRadius: 4
              },
              {
                label: 'Sports Hours',
                data: sportsData,
                backgroundColor: getColor('--accent-secondary'),
                borderRadius: 4
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(128, 128, 128, 0.08)' },
                ticks: { color: getColor('--text-secondary') }
              },
              x: {
                grid: { display: false },
                ticks: { color: getColor('--text-secondary') }
              }
            },
            plugins: {
              legend: { display: false }
            }
          }
        });
      }

      // 2d. Course Workload Radar chart
      const dashRadarCanvas = document.getElementById('chart-dashboard-radar');
      if (dashRadarCanvas) {
        const activeSemesterSetting = await Database.get('settings', 'currentSemester');
        const activeSemester = activeSemesterSetting ? activeSemesterSetting.value : '1-1';
        const semSubs = subjects.filter(s => s.semester === activeSemester).slice(0, 6);
        
        const radarLabels = semSubs.map(s => s.code);
        const radarCredits = semSubs.map(s => (s.credits || 0) * 25);
        
        const radarAtt = semSubs.map(sub => {
          const rec = attendance.find(a => a.subjectCode === sub.code);
          if (rec) {
            const overallAttended = (rec.lecturesAttended || 0) + (rec.practicalsAttended || 0);
            const overallTotal = (rec.lecturesTotal || 0) + (rec.practicalsTotal || 0);
            return overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;
          }
          return 0;
        });
        
        dashboardRadarChart = new Chart(dashRadarCanvas.getContext('2d'), {
          type: 'radar',
          data: {
            labels: radarLabels.length > 0 ? radarLabels : ['No Units'],
            datasets: [
              {
                label: 'Credits weight (%)',
                data: radarCredits.length > 0 ? radarCredits : [0],
                backgroundColor: getColor('--accent', 0.15),
                borderColor: getColor('--accent'),
                borderWidth: 1.5,
                pointBackgroundColor: getColor('--accent')
              },
              {
                label: 'Attendance rate (%)',
                data: radarAtt.length > 0 ? radarAtt : [0],
                backgroundColor: getColor('--success', 0.15),
                borderColor: getColor('--success'),
                borderWidth: 1.5,
                pointBackgroundColor: getColor('--success')
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              r: {
                angleLines: { color: 'rgba(128, 128, 128, 0.15)' },
                grid: { color: 'rgba(128, 128, 128, 0.15)' },
                pointLabels: { color: getColor('--text-secondary'), font: { size: 9 } },
                ticks: { display: false },
                suggestedMin: 0,
                suggestedMax: 100
              }
            },
            plugins: {
              legend: { display: false }
            }
          }
        });
      }

      // 3. Analytics Detailed View (Attendance vs Completion rates per Subject)
      if (analyticsDetailedCanvas) {
        const subCodes = subjects.map(s => s.code);
        const subAtt = subjects.map(sub => {
          const rec = attendance.find(a => a.subjectCode === sub.code);
          if (rec) {
            const overallAttended = rec.lecturesAttended + rec.practicalsAttended;
            const overallTotal = rec.lecturesTotal + rec.practicalsTotal;
            return overallTotal > 0 ? (overallAttended / overallTotal) * 100 : 0;
          }
          return 0;
        });

        const subGrades = await Promise.all(subjects.map(async (sub) => {
          if (sub.grade) {
            const gp = await GPAModule.getGradePoints(sub.grade);
            return (gp / 4.0) * 100;
          }
          return 0;
        }));

        analyticsDetailedChart = new Chart(analyticsDetailedCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: subCodes.length > 0 ? subCodes : ['No Course Units'],
            datasets: [
              {
                label: 'Attendance Rate (%)',
                data: subAtt.length > 0 ? subAtt : [0],
                backgroundColor: getColor('--success'),
                borderRadius: 6
              },
              {
                label: 'Grade Points Equivalency (%)',
                data: subGrades.length > 0 ? subGrades : [0],
                backgroundColor: getColor('--accent'),
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                min: 0,
                max: 100,
                grid: { color: 'rgba(128, 128, 128, 0.08)' },
                ticks: { color: getColor('--text-secondary') }
              },
              x: {
                grid: { display: false },
                ticks: { color: getColor('--text-secondary') }
              }
            },
            plugins: {
              legend: { labels: { color: getColor('--text-primary') } }
            }
          }
        });
      }

      // 4. Study Hours Completed Chart
      if (studyStatsCanvas) {
        const completedSessions = studyPlans.filter(p => p.completed);
        const datesMap = {};
        
        completedSessions.forEach(p => {
          const dt = p.date;
          datesMap[dt] = (datesMap[dt] || 0) + (p.duration || 1);
        });

        const dates = Object.keys(datesMap).sort();
        const hours = dates.map(d => datesMap[d]);

        studySessionStatsChart = new Chart(studyStatsCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: dates.length > 0 ? dates.map(dt => new Date(dt + 'T00:00:00Z').toLocaleDateString('en-US', { timeZone: 'Asia/Colombo' })) : ['No Study Session'],
            datasets: [{
              label: 'Study Hours',
              data: hours.length > 0 ? hours : [0],
              backgroundColor: getColor('--success'),
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: {
                beginAtZero: true,
                grid: { color: 'rgba(128, 128, 128, 0.08)' },
                ticks: { color: getColor('--text-secondary') }
              },
              x: {
                grid: { display: false },
                ticks: { color: getColor('--text-secondary') }
              }
            },
            plugins: {
              legend: { display: false }
            }
          }
        });
      }

    } catch (err) {
      console.error('Analytics render error:', err);
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

      const targetGrade = gradeSelect.value || 'A';
      const theoryWeight = sub.theoryWeight !== undefined ? parseFloat(sub.theoryWeight) : 70;
      const practicalWeight = sub.practicalWeight !== undefined ? parseFloat(sub.practicalWeight) : 30;

      // Update basic fields
      const theoryWeightEl = document.getElementById('predictor-theory-weight');
      const practicalWeightEl = document.getElementById('predictor-practical-weight');
      const caValEl = document.getElementById('predictor-ca-val');
      const quizValEl = document.getElementById('predictor-quiz-val');
      const labValEl = document.getElementById('predictor-lab-val');
      const resGradeEl = document.getElementById('predictor-result-grade');
      const resReqEl = document.getElementById('predictor-result-required');

      if (theoryWeightEl) theoryWeightEl.innerText = theoryWeight;
      if (practicalWeightEl) practicalWeightEl.innerText = practicalWeight;
      if (caValEl) caValEl.innerText = ca;
      if (quizValEl) quizValEl.innerText = quiz;
      if (labValEl) labValEl.innerText = lab;
      if (resGradeEl) resGradeEl.innerText = targetGrade;

      // Live GPA Shift Forecasting
      const originalStats = await GPAModule.calculateGPAs(allSubjects);
      const originalSem = originalStats.currentSemester || 0.00;
      const originalCum = originalStats.overall || 0.00;

      const simulatedSubjects = allSubjects.map(s => {
        if (s.code === code) {
          return { ...s, grade: targetGrade };
        }
        return s;
      });
      const simulatedStats = await GPAModule.calculateGPAs(simulatedSubjects);
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
            resReqEl.innerText = 'Achieved 🎉';
            resReqEl.style.color = getColor('--success') || '#00e676';
          } else {
            resReqEl.innerText = `${requiredExamScore.toFixed(1)}%`;
            resReqEl.style.color = '#ffffff';
          }
        }
      }

      // Render the list breakdown
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
            textColor = getColor('--success') || '#00e676';
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
      console.error('Failed to update predictor HUD in analytics.js:', err);
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
      // 100% Practical course
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
  },

  getChartOptions(suggestedMax) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: suggestedMax,
          grid: { color: 'rgba(128, 128, 128, 0.08)' },
          ticks: { color: getColor('--text-secondary') }
        },
        x: {
          grid: { display: false },
          ticks: { color: getColor('--text-secondary') }
        }
      },
      plugins: {
        legend: { display: false }
      }
    };
  }
};
