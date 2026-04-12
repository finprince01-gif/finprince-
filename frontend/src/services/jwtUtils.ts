/**
 * ============================================================================
 * JWT UTILITIES (jwtUtils.ts)
 * ============================================================================
 * Decodes JWTs client-side without verification (signature is verified server-side).
 * This is the SINGLE source of truth for user domain (master vs company).
 *
 * SECURITY NOTE:
 * - Never trust JWT claims for server-side decisions — that's the backend's job.
 * - Client-side decoding is only for UI routing decisions.
 * - All sensitive operations are enforced by the backend.
 */

export interface JWTPayload {
    /** Domain type: 'master' | 'company' */
    type?: 'master' | 'company';
    user_id?: number | string;
    username?: string;
    email?: string;
    tenant_id?: string;
    exp?: number;
    iat?: number;
    [key: string]: any;
}

/**
 * Decode a JWT token payload (no signature verification — client-side only).
 * Returns null if the token is missing or malformed.
 */
export function decodeJWT(token: string | null | undefined): JWTPayload | null {
    if (!token) return null;

    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;

        // Base64url decode the payload
        const payload = parts[1];
        // Pad to valid base64 length
        const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
        const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(decoded) as JWTPayload;
    } catch {
        return null;
    }
}

/**
 * Check if a JWT token is expired.
 * Returns true if expired or invalid.
 */
export function isTokenExpired(token: string | null | undefined): boolean {
    const payload = decodeJWT(token);
    if (!payload || !payload.exp) return true;
    // exp is in seconds; Date.now() is in milliseconds
    return Date.now() >= payload.exp * 1000;
}

/**
 * Get the user domain from a JWT access token.
 * Returns 'master', 'company', or null if not determinable.
 */
export function getUserTypeFromToken(token: string | null | undefined): 'master' | 'company' | null {
    const payload = decodeJWT(token);
    if (!payload) return null;
    if (payload.type === 'master') return 'master';
    if (payload.type === 'company') return 'company';
    // Fallback: if token has tenant_id, it's a company user
    if (payload.tenant_id) return 'company';
    return null;
}
