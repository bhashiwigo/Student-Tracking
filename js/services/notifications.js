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
   * Show local browser notification (falls back to custom in-app HUD alerts)
   */
  async show(title, options = {}) {
    const hasPermission = 'Notification' in window && Notification.permission === 'granted';
    
    if (hasPermission) {
      try {
        new Notification(title, {
          body: options.body || '',
          icon: options.icon || '/assets/logo.png',
          ...options
        });
      } catch (err) {
        console.warn('Native notification failed, showing inside UI instead.', err);
      }
    }
    
    // Always trigger custom in-app HUD notification overlay for UI integration
    this.showHUD(title, options.body, options.type || 'info');
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
    
    // Aesthetic themes colors mapping
    const typeIcons = {
      info: '✨',
      warning: '⚠️',
      success: '✓',
      exam: '📝',
      practical: '🔬',
      study: '📚',
      sports: '🏆'
    };

    card.innerHTML = `
      <div class="hud-alert-icon">${typeIcons[type] || '🔔'}</div>
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
