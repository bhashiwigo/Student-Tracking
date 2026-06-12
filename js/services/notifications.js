/**
 * Rajarata Campus Life Manager - Notification Services
 * Local notifications and custom floating HUD alerts
 */

export const NotificationService = {
  /**
   * Request browser notifications permission
   */
  async requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.error('Notification permission request error:', err);
      return false;
    }
  },

  /**
   * Show local browser notification (falls back to custom in-app HUD alerts).
   * Accepts two call signatures:
   *   show(title, message, type)          — used by all modules
   *   show(title, { body, type, icon })   — legacy options-object form
   */
  async show(title, messageOrOptions = {}, type = 'info') {
    // Determine message and type from either positional args or options object
    let message, notifType;
    if (typeof messageOrOptions === 'string') {
      // Positional form: show(title, message, type)
      message = messageOrOptions;
      notifType = type;
    } else {
      // Options-object form: show(title, { body, type })
      message = messageOrOptions.body || '';
      notifType = messageOrOptions.type || 'info';
    }

    const hasPermission = 'Notification' in window && Notification.permission === 'granted';

    if (hasPermission) {
      try {
        new Notification(title, {
          body: message,
          icon: (typeof messageOrOptions === 'object' ? messageOrOptions.icon : null) || '/assets/logo.png'
        });
      } catch (err) {
        console.warn('Native notification failed, showing inside UI instead.', err);
      }
    }

    // Always trigger custom in-app HUD notification overlay for UI integration
    this.showHUD(title, message, notifType);
  },

  /**
   * In-app Neumorphic HUD alert popup
   */
  showHUD(title, message = '', type = 'info') {
    let container = document.getElementById('hud-notification-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'hud-notification-container';
      container.style.position = 'fixed';
      container.style.bottom = '24px';
      container.style.right = '24px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '12px';
      container.style.zIndex = '9999';
      document.body.appendChild(container);
    }

    const card = document.createElement('div');
    card.className = `hud-alert-card neumorphic-raised ${type}`;
    
    // Aesthetic themes SVG icons mapping
    const typeIcons = {
      info: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-info"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`,
      warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-alert-triangle"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
      success: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-check-circle"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
      exam: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-book-open"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`,
      practical: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-activity"><path d="M4.7 6.25a2.5 2.5 0 0 0 0 3.5l10.8 10.8a2.5 2.5 0 0 0 3.5 0l2-2a2.5 2.5 0 0 0 0-3.5L10.2 4.25a2.5 2.5 0 0 0-3.5 0z"></path><path d="M15 9l3 3"></path><path d="M6 18H3v-3"></path></svg>`,
      study: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-clock"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
      sports: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-award"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>`
    };
    const defaultIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-bell"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`;

    card.innerHTML = `
      <div class="hud-alert-icon" style="display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        ${typeIcons[type] || defaultIcon}
      </div>
      <div class="hud-alert-content">
        <h4>${title}</h4>
        ${message ? `<p>${message}</p>` : ''}
      </div>
      <button class="hud-alert-close">&times;</button>
    `;

    container.appendChild(card);

    // Fade-in trigger
    setTimeout(() => {
      card.classList.add('visible');
    }, 10);

    // Auto dismiss after 4.5 seconds
    const dismissTimer = setTimeout(() => {
      dismissCard();
    }, 4500);

    const dismissCard = () => {
      clearTimeout(dismissTimer);
      card.classList.remove('visible');
      card.classList.add('leaving');
      setTimeout(() => {
        card.remove();
        if (container.children.length === 0) {
          container.remove();
        }
      }, 300);
    };

    card.querySelector('.hud-alert-close').addEventListener('click', dismissCard);
  }
};
