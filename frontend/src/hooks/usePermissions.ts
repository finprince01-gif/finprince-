/**
 * ============================================================================
 * PERMISSIONS HOOK (usePermissions.ts)
 * ============================================================================
 * Custom React hook for accessing user permissions throughout the application.
 * Provides helper methods for checking page and tab access.
 * 
 * USAGE:
 * ```typescript
 * import { usePermissions } from '../../hooks/usePermissions';
 * 
 * const MyComponent = () => {
 *   const { hasPageAccess, hasTabAccess, loading, isSuperuser } = usePermissions();
 *   
 *   if (loading) return <div>Loading...</div>;
 *   
 *   if (!hasPageAccess('Inventory')) {
 *     return <div>Access Denied</div>;
 *   }
 *   
 *   const showMasterTab = hasTabAccess('Inventory', 'Master');
 *   // ...
 * };
 * ```
 */

import { useState, useEffect } from 'react';
import { apiService } from '../services';
import { hasMasterSession } from '../services/authService';
import type { Permissions } from '../types/types';

interface UsePermissionsReturn {
    permissions: Permissions;
    isSuperuser: boolean;
    loading: boolean;
    error: string | null;
    hasPageAccess: (pageName: string) => boolean;
    hasTabAccess: (pageName: string, tabName: string) => boolean;
    getAccessibleTabs: (pageName: string) => string[];
    refresh: () => Promise<void>;
}

/**
 * Custom hook to manage and access user permissions
 * Automatically loads permissions on mount and provides helper methods
 */
export const usePermissions = (): UsePermissionsReturn => {
    const [permissions, setPermissions] = useState<Permissions>({});
    const [isSuperuser, setIsSuperuser] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Load user permissions from the backend
     */
    const loadPermissions = async () => {
        // 0. MASTER DOMAIN BYPASS: Master admins are platform-level superusers 
        // and should not hit company-specific RBAC endpoints.
        if (hasMasterSession()) {
            setIsSuperuser(true);
            setPermissions({});
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await apiService.getMyPermissions();
            setIsSuperuser(response.is_superuser || false);
            setPermissions(response.permissions || {});
        } catch (err: any) {
            console.error('Failed to load permissions:');
            setError(err.message || 'Failed to load permissions');
            setPermissions({});
            setIsSuperuser(false);
        } finally {
            setLoading(false);
        }
    };

    // Load permissions on mount
    useEffect(() => {
        loadPermissions();
    }, []);

    /**
     * Check if user has access to view a specific page
     * @param pageName - Name of the page (e.g., 'Inventory', 'Vouchers')
     * @returns true if user can access the page, false otherwise
     */
    const hasPageAccess = (pageName: string): boolean => {
        // Superusers have access to everything
        if (isSuperuser) return true;

        // Core pages that are always accessible (no RBAC restriction needed)
        const alwaysAccessible = ['Dashboard', 'Settings'];
        if (alwaysAccessible.includes(pageName)) return true;

        // Check if page exists in permissions and has view access
        return permissions[pageName]?.view === true;
    };

    /**
     * Check if user has access to a specific tab within a page
     * @param pageName - Name of the page (e.g., 'Inventory')
     * @param tabName - Name of the tab (e.g., 'Master', 'Operations')
     * @returns true if user can access the tab, false otherwise
     */
    const hasTabAccess = (pageName: string, tabName: string): boolean => {
        // Superusers have access to everything
        if (isSuperuser) return true;

        // First check if user has page access
        if (!hasPageAccess(pageName)) return false;

        // Check tab-level permission
        const pagePerms = permissions[pageName];

        // If no tabs are defined, assume all tabs are accessible if page is accessible
        if (!pagePerms?.tabs) return true;

        // Check specific tab permission
        return pagePerms.tabs[tabName] === true;
    };

    /**
     * Get list of accessible tab names for a specific page
     * @param pageName - Name of the page
     * @returns Array of tab names the user can access
     */
    const getAccessibleTabs = (pageName: string): string[] => {
        // Superusers have access to all tabs
        if (isSuperuser) return [];

        // If no page access, no tabs are accessible
        if (!hasPageAccess(pageName)) return [];

        const pagePerms = permissions[pageName];

        // If no tabs defined, return empty array (meaning all tabs accessible)
        if (!pagePerms?.tabs) return [];

        // Return only tabs with true permission
        return Object.entries(pagePerms.tabs)
            .filter(([_, hasAccess]) => hasAccess === true)
            .map(([tabName, _]) => tabName);
    };

    /**
     * Manually refresh permissions (useful after role changes)
     */
    const refresh = async () => {
        await loadPermissions();
    };

    return {
        permissions,
        isSuperuser,
        loading,
        error,
        hasPageAccess,
        hasTabAccess,
        getAccessibleTabs,
        refresh
    };
};

export default usePermissions;
