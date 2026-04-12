/**
 * Services Index
 * 
 * Export all service modules
 */

export { httpClient, API_BASE_URL, type AxiosRequestConfig } from './httpClient';
export { apiService } from './api';
export { masterApiService } from './masterApi';

// Re-export for backward compatibility during migration
export { apiService as default } from './api';
