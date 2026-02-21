
/**
 * ============================================================================
 * AUTH SERVICE (authService.ts)
 * ============================================================================
 * Manages authentication state (tokens)
 * - Access Token: Stored in memory (variable) - SECURE
 * - Refresh Token: Stored in sessionStorage - SESSION ONLY
 */

// Memory storage for access token (cleared on page reload)
let accessToken: string | null = null;
const REFRESH_TOKEN_KEY = "refresh_token";

/**
 * Set authentication tokens
 * @param access - Short-lived access token
 * @param refresh - Long-lived refresh token
 */
export const setTokens = (access: string, refresh: string) => {
    accessToken = access;
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refresh);
};

/**
 * Get the current access token
 */
export const getAccessToken = () => accessToken;

/**
 * Get the stored refresh token
 */
export const getRefreshToken = () => sessionStorage.getItem(REFRESH_TOKEN_KEY);

/**
 * Clear all authentication tokens (Logout)
 */
export const clearTokens = () => {
    accessToken = null;
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);

    // Clean up legacy keys if they exist
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refreshToken");

    // Also clear from localStorage if they were previously there
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Check if the user has a stored session (refresh token)
 * Note: This does NOT mean the user is authenticated, only that a session exists locally.
 */
export const hasStoredSession = () => !!sessionStorage.getItem(REFRESH_TOKEN_KEY);

