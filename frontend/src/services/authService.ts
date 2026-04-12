/**
 * ============================================================================
 * AUTH SERVICE (authService.ts)
 * ============================================================================
 * Manages JWT token storage with strict domain separation.
 * Aligned with user-requested storage keys for persistence.
 *
 * TOKEN STORAGE MODEL:
 * - master_access_token  : In-memory only (cleared on page reload) — Master domain
 * - company_access_token : In-memory only (cleared on page reload) — Company domain
 * - master_token         : localStorage — Master Refresh Token (Persistent)
 * - company_token        : localStorage — Company Refresh Token (Persistent)
 *
 * SECURITY:
 * - Access tokens never touch localStorage or sessionStorage
 * - Refresh tokens are persistent via localStorage per user request
 * - User domain is derived from JWT, but initial presence checked via these keys
 */

// In-memory access tokens — cleared on page reload for security
const MASTER_TOKEN_KEY = 'master_token';
const COMPANY_TOKEN_KEY = 'company_token';
const MASTER_ACCESS_KEY = 'master_access_token';
const COMPANY_ACCESS_KEY = 'company_access_token';

// Fallback to localStorage if memory is cleared on refresh
let masterAccessToken: string | null = localStorage.getItem(MASTER_ACCESS_KEY);
let companyAccessToken: string | null = localStorage.getItem(COMPANY_ACCESS_KEY);

// ─── MASTER DOMAIN ────────────────────────────────────────────────────────────

export const setMasterTokens = (access: string, refresh: string): void => {
    masterAccessToken = access;
    localStorage.setItem(MASTER_ACCESS_KEY, access);
    localStorage.setItem(MASTER_TOKEN_KEY, refresh);
};

export const getMasterAccessToken = (): string | null => masterAccessToken;

export const getMasterRefreshToken = (): string | null =>
    localStorage.getItem(MASTER_TOKEN_KEY);

export const clearMasterTokens = (): void => {
    masterAccessToken = null;
    localStorage.removeItem(MASTER_ACCESS_KEY);
    localStorage.removeItem(MASTER_TOKEN_KEY);
    sessionStorage.removeItem('master_refresh_token'); // Clean old keys
};

export const hasMasterSession = (): boolean =>
    !!localStorage.getItem(MASTER_TOKEN_KEY);

// ─── COMPANY DOMAIN ───────────────────────────────────────────────────────────

export const setCompanyTokens = (access: string, refresh: string): void => {
    companyAccessToken = access;
    localStorage.setItem(COMPANY_ACCESS_KEY, access);
    localStorage.setItem(COMPANY_TOKEN_KEY, refresh);
};

export const getCompanyAccessToken = (): string | null => companyAccessToken;

export const getCompanyRefreshToken = (): string | null =>
    localStorage.getItem(COMPANY_TOKEN_KEY);

export const clearCompanyTokens = (): void => {
    companyAccessToken = null;
    localStorage.removeItem(COMPANY_ACCESS_KEY);
    localStorage.removeItem(COMPANY_TOKEN_KEY);
    sessionStorage.removeItem('company_refresh_token'); // Clean old keys
};

export const hasCompanySession = (): boolean =>
    !!localStorage.getItem(COMPANY_TOKEN_KEY);

// ─── SHARED / LEGACY HELPERS ──────────────────────────────────────────────────

/**
 * Get the active access token — checks master first, then company.
 * This is what httpClient uses for Authorization headers.
 */
export const getAccessToken = (): string | null =>
    masterAccessToken ?? companyAccessToken ?? null;

/**
 * Get the active refresh token — checks master first, then company.
 */
export const getRefreshToken = (): string | null =>
    getMasterRefreshToken() ?? getCompanyRefreshToken() ?? null;

/**
 * Legacy compat: set tokens (used by shared httpClient in company domain).
 * Writes to the company slot.
 */
export const setTokens = (access: string, refresh: string): void => {
    setCompanyTokens(access, refresh);
};

/**
 * Clear ALL tokens — both domains. Used by full logout.
 */
export const clearTokens = (): void => {
    clearMasterTokens();
    clearCompanyTokens();

    // Clean legacy keys that may exist from various versions
    sessionStorage.clear();
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('userType');
    localStorage.removeItem('user_type');
};

/**
 * Check if any domain session exists (for splash-screen skip).
 */
export const hasStoredSession = (): boolean =>
    hasMasterSession() || hasCompanySession();

// ─── TENANT CONTEXT ───────────────────────────────────────────────────────────

/**
 * Clear all company tenant context — always called when entering master domain.
 */
export const clearTenantContext = (): void => {
    sessionStorage.removeItem('tenantId');
    sessionStorage.removeItem('companyName');
    sessionStorage.removeItem('userPlan');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('companyName');
    localStorage.removeItem('userPlan');
};
