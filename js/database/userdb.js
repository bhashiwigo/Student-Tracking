/**
 * Rajarata Campus Life Manager - UserDatabase
 * Thin namespace wrapper over Database that scopes operations to the current user.
 * All records written through UserDatabase automatically include the current userId.
 */

import { Database } from './db.js';
import { Auth } from '../auth.js';

export const UserDatabase = {
  /**
   * Get a single record scoped to the current user.
   * @param {string} storeName
   * @param {string} key - the primary key value
   * @returns {Promise<object|null>}
   */
  async get(storeName, key) {
    const record = await Database.get(storeName, key);
    if (!record) return null;
    const userId = Auth.getCurrentUserId();
    // If record has userId, enforce ownership
    if (record.userId && userId && record.userId !== userId) return null;
    return record;
  },

  /**
   * Get all records for the current user from a store.
   * @param {string} storeName
   * @returns {Promise<object[]>}
   */
  async getAll(storeName) {
    const all = await Database.getAll(storeName);
    const userId = Auth.getCurrentUserId();
    if (!userId) return all;
    return all.filter(r => !r.userId || r.userId === userId);
  },

  /**
   * Write a record, injecting the current userId if not already set.
   * @param {string} storeName
   * @param {object} data
   * @returns {Promise<any>}
   */
  async put(storeName, data) {
    const userId = Auth.getCurrentUserId();
    const enriched = userId ? { ...data, userId } : data;
    return Database.put(storeName, enriched);
  },

  /**
   * Add a new record with userId injected.
   * @param {string} storeName
   * @param {object} data
   * @returns {Promise<any>}
   */
  async add(storeName, data) {
    const userId = Auth.getCurrentUserId();
    const enriched = userId ? { ...data, userId } : data;
    return Database.add(storeName, enriched);
  },

  /**
   * Delete a record by key.
   * @param {string} storeName
   * @param {string|number} key
   * @returns {Promise<void>}
   */
  async delete(storeName, key) {
    return Database.delete(storeName, key);
  }
};
