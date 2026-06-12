/**
 * Rajarata Campus Life Manager - Auth Module
 * PIN-based session authentication.
 * Fully offline — no network required. Sessions stored in localStorage/sessionStorage.
 */

const SESSION_KEY = 'rcl_session';
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for persistent

export const Auth = {
  /**
   * djb2-based hash — suitable for device-local PIN privacy (not cryptographic).
   * @param {string} pin
   * @returns {string} hex hash string
   */
  hashPin(pin) {
    let hash = 5381;
    for (let i = 0; i < pin.length; i++) {
      hash = ((hash << 5) + hash) ^ pin.charCodeAt(i);
      hash = hash & hash; // Force 32-bit integer
    }
    // XOR with a fixed salt for extra obscurity
    hash = hash ^ 0xDEADBEEF;
    return (hash >>> 0).toString(16).padStart(8, '0');
  },

  /**
   * Verify a PIN against a stored hash.
   * @param {string} pin
   * @param {string} storedHash
   * @returns {boolean}
   */
  verifyPin(pin, storedHash) {
    return this.hashPin(pin) === storedHash;
  },

  /**
   * Generate a UUID v4-like unique user ID.
   * @returns {string}
   */
  generateUserId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback for older environments
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },

  /**
   * Persist a login session.
   * @param {string} userId
   * @param {boolean} rememberMe — if true uses localStorage (7-day), else sessionStorage
   */
  setSession(userId, rememberMe = true) {
    const session = {
      userId,
      expiresAt: rememberMe ? Date.now() + SESSION_DURATION_MS : null,
      persistent: rememberMe
    };
    const store = rememberMe ? localStorage : sessionStorage;
    store.setItem(SESSION_KEY, JSON.stringify(session));
  },

  /**
   * Check if a valid session exists.
   * @returns {boolean}
   */
  isLoggedIn() {
    const session = this._getSession();
    if (!session) return false;
    if (session.persistent && session.expiresAt && Date.now() > session.expiresAt) {
      this.clearSession();
      return false;
    }
    return !!session.userId;
  },

  /**
   * Get the current user's ID from the active session.
   * @returns {string|null}
   */
  getCurrentUserId() {
    const session = this._getSession();
    return session ? session.userId : null;
  },

  /**
   * Clear all session data (sign out).
   */
  clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  },

  /**
   * Internal: read session from storage (checks both).
   * @private
   */
  _getSession() {
    try {
      const ls = localStorage.getItem(SESSION_KEY);
      if (ls) return JSON.parse(ls);
      const ss = sessionStorage.getItem(SESSION_KEY);
      if (ss) return JSON.parse(ss);
    } catch {
      // Corrupt session data — clear it
      this.clearSession();
    }
    return null;
  }
};
