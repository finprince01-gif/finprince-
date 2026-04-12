/**
 * ============================================================================
 * MASTER API SERVICE (masterApi.ts)
 * ============================================================================
 * Dedicated API layer for Platform Administrators.
 * 
 * CORE RULES:
 * 1. ONLY calls /api/master/* endpoints.
 * 2. Never calls company-domain endpoints (/api/vouchers, /api/masters, etc.)
 * 3. Prevents cross-contamination of sessions and 401 logouts.
 */

import { httpClient } from './httpClient';

export const masterApiService = {
    /** Get platform-level analytics and statistics */
    getStats: (options: any = {}) => 
        httpClient.get<any>('/api/master/stats/', undefined, options),

    /** List all branches (GSTIN Level) */
    getBranches: (options: any = {}) => 
        httpClient.get<any[]>('/api/master/branches/', undefined, options),

    /** Get recent platform-wide activity logs */
    getRecentActivity: (options: any = {}) => 
        httpClient.get<any[]>('/api/master/recent-activity/', undefined, options),

    /** Get Master Admin profile settings */
    getSettings: (options: any = {}) => 
        httpClient.get<any>('/api/master/settings/', undefined, options),

    /** Update Master Admin profile settings */
    updateSettings: (data: any, options: any = {}) => 
        httpClient.put<any>('/api/master/settings/', data, options),

    /** 
     * Get isolated accounting data for Reports/Settings drill-down.
     * Replaces standard apiService.getVouchers etc. for master domain.
     */
    getReports: (tenantId?: string, options: any = {}) => {
        const query = tenantId ? `?tenant_id=${tenantId}` : '';
        return httpClient.get<any>(`/api/master/reports/${query}`, undefined, options);
    },

    /** Provision a new Branch (Tenant/GSTIN Level) */
    createBranch: (data: any, options: any = {}) => 
        httpClient.post<any>('/api/master/branches/', data, options),

    /** Get detailed data for a specific Branch, including exact subscription logic */
    getBranchDetail: (tenantId: string, options: any = {}) => 
        httpClient.get<any>(`/api/master/branches/${tenantId}/`, undefined, options),

    /** Update a specific Branch's details, plan, or active status */
    updateBranchDetail: (tenantId: string, data: any, options: any = {}) => 
        httpClient.put<any>(`/api/master/branches/${tenantId}/`, data, options),

    /** Securely reset all user passwords for a specific branch */
    resetBranchPassword: (tenantId: string, data: { new_password: string }, options: any = {}) => 
        httpClient.post<any>(`/api/master/branches/${tenantId}/reset-password/`, data, options),

    /** Get branch-specific profile settings */
    getBranchSettings: (tenantId: string, options: any = {}) => 
        httpClient.get<any>(`/api/master/branches/${tenantId}/settings/`, undefined, options),
    
    /** Update branch-specific profile settings */
    updateBranchSettings: (tenantId: string, data: any, options: any = {}) => 
        httpClient.put<any>(`/api/master/branches/${tenantId}/settings/`, data, options),
};
