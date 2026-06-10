/**
 * Rajarata Campus Life Manager - Backup Services
 * JSON export and import backup tools
 */

import { Database } from '../database/db.js';

const STORES_LIST = [
  'students',
  'subjects',
  'exams',
  'practicals',
  'assignments',
  'attendance',
  'sports',
  'studyplans',
  'notes',
  'settings'
];

export const BackupService = {
  /**
   * Export database tables to a structured JSON file
   */
  async exportBackup() {
    try {
      const backupData = {};
      
      for (const store of STORES_LIST) {
        backupData[store] = await Database.getAll(store);
      }
      
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().slice(0, 10);
      const filename = `rajarata_campus_life_backup_${timestamp}.json`;
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      return { success: true, filename };
    } catch (err) {
      console.error('Backup export failed:', err);
      throw new Error(`Export error: ${err.message}`);
    }
  },

  /**
   * Import database tables from a structured JSON file
   */
  async importBackup(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const rawData = JSON.parse(e.target.result);
          
          // Basic validation structure checks
          if (!rawData || typeof rawData !== 'object') {
            throw new Error('Invalid backup file format.');
          }

          // Clear existing stores and repopulate them sequentially
          for (const store of STORES_LIST) {
            await Database.clear(store);
            
            const records = rawData[store];
            if (Array.isArray(records)) {
              for (const record of records) {
                await Database.put(store, record);
              }
            }
          }
          
          resolve({ success: true });
        } catch (err) {
          console.error('Backup import failed:', err);
          reject(new Error(`Import error: ${err.message}`));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('File reading error.'));
      };
      
      reader.readAsText(file);
    });
  }
};
