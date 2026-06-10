/**
 * Rajarata Campus Life Manager - Academic Analytics
 * Coordinates Chart.js rendering on Dashboard & Analytics views
 */

import { Database } from '../database/db.js';
import { GPAModule } from './gpa.js';

let dashboardGPATrendChart = null;
let dashboardAttendanceChart = null;
let dashboardAssignmentsChart = null;
let dashboardBalanceChart = null;
let dashboardRadarChart = null;
let analyticsDetailedChart = null;
let studySessionStatsChart = null;

const getColor = (varName, opacity = 1) => {
  let val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!val) {
    if (varName === '--accent') val = '#00e5ff';
    else if (varName === '--accent-secondary') val = '#ff5252';
    else if (varName === '--success') val = '#00e676';
    else val = '#ffffff';
  }
  if (opacity === 1) return val;
  if (val.startsWith('#')) {
    const r = parseInt(val.slice(1, 3), 16);
    const g = parseInt(val.slice(3, 5), 16);
    const b = parseInt(val.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  if (val.startsWith('rgb')) {
    const match = val.match(/\d+/g);
    if (match && match.length >= 3) {
      return `rgba(${match[0]}, ${match[1]}, ${match[2]}, ${opacity})`;
    }
  }
  return val;
};

export const AnalyticsModule = {
  init() {
    window.addEventListener('subjectsUpdated', () => this.render());
  },

  async render() {
    const dashboardTrendCanvas = document.getElementById('chart-dashboard-gpa');
    const dashboardAttCanvas = document.getElementById('chart-dashboard-attendance');
    const analyticsDetailedCanvas = document.getElementById('chart-analytics-detailed');
    const studyStatsCanvas = document.getElementById('chart-analytics-study');

    try {
      const subjects = await Database.getAll('subjects');
      const attendance = await Database.getAll('attendance');
      const assignments = await Database.getAll('assignments');
      const studyPlans = await Database.getAll('studyplans');
      const sports = await Database.getAll('sports');
      
      // GPA target progress updates
      const targetSetting = await Database.get('settings', 'gpaTarget');
      const targetGpa = targetSetting ? parseFloat(targetSetting.value) : 3.70;
      const gpaStats = await GPAModule.calculateGPAs(subjects);
      const currentCumGpa = parseFloat(gpaStats.cumulative) || 0.00;
      const progressPct = targetGpa > 0 ? Math.min((currentCumGpa / targetGpa) * 100, 100) : 0;
      
      const pctEl = document.getElementById('dash-gpa-progress-pct');
      const barEl = document.getElementById('dash-gpa-progress-bar');
      if (pctEl) pctEl.innerText = `${progressPct.toFixed(0)}%`;
      if (barEl) barEl.style.width = `${progressPct}%`;

      // 1. Dashboard GPA Semester Comparison Chart
      if (dashboardTrendCanvas) {
        const semestersList = ['1-1', '1-2', '2-1', '2-2', '3-1', '3-2', '4-1', '4-2'];
        const semesterGPAs = [];
        
        for (const sem of semestersList) {
          const semSubs = subjects.filter(s => s.semester === sem && s.grade);
          if (semSubs.length > 0) {
            const stats = await GPAModule.calculateGPAs(subjects);
            let totalCredits = 0;
            let weightedGP = 0;
            for (const sub of semSubs) {
              const gp = await GPAModule.getGradePoints(sub.grade);
              totalCredits += sub.credits;
              weightedGP += (gp * sub.credits);
            }
            const semGPA = totalCredits > 0 ? (weightedGP / totalCredits) : 0.00;
            semesterGPAs.push({ label: `Y${sem.replace('-', ' S')}`, gpa: semGPA });
          }
        }

        const labels = semesterGPAs.map(x => x.label);
        const dataValues = semesterGPAs.map(x => x.gpa);

        if (dashboardGPATrendChart) dashboardGPATrendChart.destroy();
        
        dashboardGPATrendChart = new Chart(dashboardTrendCanvas.getContext('2d'), {
          type: 'line',
          data: {
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
              label: 'GPA',
              data: dataValues.length > 0 ? dataValues : [0],
              borderColor: getColor('--accent'),
              backgroundColor: getColor('--accent', 0.03),
              tension: 0.35,
              borderWidth: 2,
              fill: true,
              pointBackgroundColor: getColor('--accent')
            }]
          },
          options: this.getChartOptions(4.0)
        });
      }

      // 2. Dashboard Attendance Summary Chart
      if (dashboardAttCanvas) {
        let totalLectAttended = 0;
        let totalLectTotal = 0;
        let totalPracAttended = 0;
        let totalPracTotal = 0;

        attendance.forEach(a => {
          totalLectAttended += a.lecturesAttended || 0;
          totalLectTotal += a.lecturesTotal || 0;
          totalPracAttended += a.practicalsAttended || 0;
          totalPracTotal += a.practicalsTotal || 0;
        });

        const totalAttended = totalLectAttended + totalPracAttended;
        const totalSessions = totalLectTotal + totalPracTotal;
        const pct = totalSessions > 0 ? (totalAttended / totalSessions) * 100 : 0;

        if (dashboardAttendanceChart) dashboardAttendanceChart.destroy();

        dashboardAttendanceChart = new Chart(dashboardAttCanvas.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: ['Attended', 'Absent'],
            datasets: [{
              data: totalSessions > 0 ? [totalAttended, totalSessions - totalAttended] : [0, 100],
              backgroundColor: [getColor('--success'), 'rgba(128, 128, 128, 0.08)'],
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
        
        const valEl = document.getElementById('dashboard-attendance-text-val');
        if (valEl) valEl.innerText = `${pct.toFixed(0)}%`;
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
        
        if (dashboardAssignmentsChart) dashboardAssignmentsChart.destroy();
        
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
          const dateStr = d.toISOString().split('T')[0];
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
          labels.push(dayName);
          
          const completedPlans = studyPlans.filter(p => p.date === dateStr && p.completed);
          const totalStudy = completedPlans.reduce((sum, p) => sum + (parseFloat(p.duration) || 0), 0);
          studyData.push(totalStudy);
          
          const daySports = sports.filter(s => s.scheduleDate === dateStr && (s.activityType === 'Training' || s.activityType === 'Match'));
          const totalSports = daySports.reduce((sum, s) => sum + (parseFloat(s.trainingHours) || 0), 0);
          sportsData.push(totalSports);
        }
        
        if (dashboardBalanceChart) dashboardBalanceChart.destroy();
        
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
                ticks: { color: 'var(--text-secondary)' }
              },
              x: {
                grid: { display: false },
                ticks: { color: 'var(--text-secondary)' }
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
        
        if (dashboardRadarChart) dashboardRadarChart.destroy();
        
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
                pointLabels: { color: 'var(--text-secondary)', font: { size: 9 } },
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
            return (gp / 4.0) * 100; // Map grade GP (0-4) to a percentage (0-100) for visual overlay
          }
          return 0;
        }));

        if (analyticsDetailedChart) analyticsDetailedChart.destroy();

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
                ticks: { color: 'var(--text-secondary)' }
              },
              x: {
                grid: { display: false },
                ticks: { color: 'var(--text-secondary)' }
              }
            },
            plugins: {
              legend: { labels: { color: 'var(--text-primary)' } }
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

        if (studySessionStatsChart) studySessionStatsChart.destroy();

        studySessionStatsChart = new Chart(studyStatsCanvas.getContext('2d'), {
          type: 'bar',
          data: {
            labels: dates.length > 0 ? dates : ['No Study Session'],
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
                ticks: { color: 'var(--text-secondary)' }
              },
              x: {
                grid: { display: false },
                ticks: { color: 'var(--text-secondary)' }
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

  getChartOptions(suggestedMax) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 0,
          max: suggestedMax,
          grid: { color: 'rgba(128, 128, 128, 0.08)' },
          ticks: { color: 'var(--text-secondary)' }
        },
        x: {
          grid: { display: false },
          ticks: { color: 'var(--text-secondary)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    };
  }
};
