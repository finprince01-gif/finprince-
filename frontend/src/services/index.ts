/**
 * Services Index
 * 
 * Export all service modules
 */

export { httpClient, API_BASE_URL } from './httpClient';
export { apiService } from './api';

// Re-export for backward compatibility during migration
export { apiService as default } from './api';
