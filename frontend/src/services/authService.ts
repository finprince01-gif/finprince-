
/**
 * ============================================================================
 * AUTH SERVICE (authService.ts)
 * ============================================================================
 * Manages authentication state (tokens)
 * - Access Token: Stored in memory (variable) - SECURE
 * - Refresh Token: Stored in localStorage - PERSISTENT
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
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
};

/**
 * Get the current access token
 */
export const getAccessToken = () => accessToken;

/**
 * Get the stored refresh token
 */
export const getRefreshToken = () => localStorage.getItem(REFRESH_TOKEN_KEY);

/**
 * Clear all authentication tokens (Logout)
 */
export const clearTokens = () => {
    accessToken = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);

    // Clean up legacy keys if they exist
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
};

/**
 * Check if user is potentially authenticated (has refresh token)
 */
export const isAuthenticated = () => !!localStorage.getItem(REFRESH_TOKEN_KEY);
