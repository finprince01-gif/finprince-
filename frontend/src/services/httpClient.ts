/**
 * ============================================================================
 * HTTP CLIENT (httpClient.ts)
 * ============================================================================
 * Production-grade JWT Authentication Client
 * 
 * FEATURES:
 * - Bearer Token Authentication (Access + Refresh)
 * - Automatic Token Refresh on 401
 * - Request Queueing (prevents parallel refresh calls)
 * - Expiration Detection (token_not_valid)
 * - Automatic Logout on Refresh Failure
 * - Type-safe Request Methods
 * 
 * ARCHITECTURE:
 * 1. Request Interceptor: Injects 'Authorization: Bearer <token>'
 * 2. Response Interceptor: Catches 401 errors
 * 3. Refresh Logic: Pauses requests, refreshes token, retries queue
 */

import {
    getAccessToken,
    getRefreshToken,
    setTokens,
    clearTokens
} from './authService';

// Environment configuration
// In development, use empty string to let Vite proxy handle requests
// In production, use the full API URL from environment variable
export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

// Type definitions for Queue Items
interface QueueItem {
    resolve: (value: any) => void;
    reject: (error: any) => void;
}

class HttpClient {
    private baseURL = API_BASE_URL;
    private isRefreshing = false;
    private failedQueue: QueueItem[] = [];

    /**
     * PROCESS QUEUE
     * Retries all failed requests after a successful token refresh.
     * Rejects them if refresh fails.
     */
    private processQueue(error: Error | null) {
        this.failedQueue.forEach(prom => {
            if (error) {
                prom.reject(error);
            } else {
                prom.resolve({}); // Signal to retry
            }
        });
        this.failedQueue = [];
    }

    /**
     * Set tokens in memory (Delegates to authService)
     */
    public setTokens(access: string, refresh: string) {
        setTokens(access, refresh);
    }

    /**
     * Get access token (for auth checks)
     */
    public getToken(): string | null {
        return getAccessToken();
    }

    /**
     * PERFORM REFRESH
     * Refreshes the access token and processes the queue.
     */
    private async performRefresh(): Promise<void> {
        // Guard: If already refreshing, let the current process handle it
        // (Though the caller usually checks this, double safety is good)
        if (this.isRefreshing) {
            return;
        }

        this.isRefreshing = true;

        try {
            const storedRefresh = getRefreshToken();
            if (!storedRefresh) {
                // If no refresh token, we cannot restore session.
                // In this case, we just stop. The caller (request) will fail naturally or be rejected.
                throw new Error('No refresh token provided');
            }

            const refreshResponse = await fetch(`${this.baseURL}/api/auth/refresh/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh: storedRefresh })
            });

            if (!refreshResponse.ok) {
                throw new Error('Refresh failed');
            }

            const data = await refreshResponse.json();

            if (data.access) {
                const newRefresh = data.refresh || storedRefresh;
                setTokens(data.access, newRefresh);
                this.isRefreshing = false; // Ensure false before processing queue
                this.processQueue(null);
            } else {
                throw new Error('No access token in refresh response');
            }

        } catch (error) {
            console.error('❌ Session expired. Logging out.');
            this.isRefreshing = false; // Ensure false before processing queue
            this.processQueue(error as Error);
            this.logout();
            throw error;
        } finally {
            // This finally block is now redundant for setting isRefreshing to false,
            // but it's harmless. The flag is explicitly set before processQueue.
            // this.isRefreshing = false;
        }
    }

    /**
     * CORE REQUEST METHOD
     * Wraps fetch() with auth logic, headers, and error handling.
     */
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseURL}${endpoint}`;

        // 0. Pre-Emptive Refresh (Prevent initial 401s)
        // If we have no access token but do have a refresh token, restore session BEFORE requesting.
        const initialToken = getAccessToken();
        const storedRefresh = getRefreshToken();

        if (!initialToken && storedRefresh && !endpoint.includes('/auth/')) {
            if (!this.isRefreshing) {
                // Return original request wrapped in the refresh promise
                return this.performRefresh().then(() => this.request<T>(endpoint, options));
            }

            return new Promise((resolve, reject) => {
                this.failedQueue.push({
                    resolve: () => resolve(this.request(endpoint, options)),
                    reject
                });
            });
        }

        // 1. Prepare Headers (Inject Bearer Token)
        const headers = new Headers(options.headers || {});
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        const token = getAccessToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        try {
            // 2. Execute Request
            const response = await fetch(url, {
                ...options,
                headers,
                // credentials: 'include', // REMOVED: Do not mix cookie auth with header auth
            });

            // 3. Handle Unauthorized (401)
            if (response.status === 401) {
                // Avoid infinite loops: Don't refresh if the failed request WAS a refresh attempt
                if (endpoint.includes('/auth/refresh') || endpoint.includes('/auth/login')) {
                    // Try to clear tokens if refresh failed - explicitly requested requirement: "If refresh fails: Clear tokens, Redirect to /login"
                    if (endpoint.includes('/auth/refresh')) {
                        this.logout();
                    }
                    throw new Error('Authentication failed');
                }

                // If already refreshing, queue this request
                if (this.isRefreshing) {
                    return new Promise((resolve, reject) => {
                        this.failedQueue.push({
                            resolve: () => resolve(this.request(endpoint, options)), // Retry
                            reject
                        });
                    });
                }

                // START REFRESH FLOW
                // Logic extracted to performRefresh()
                try {
                    await this.performRefresh();
                    // Retry Original Request
                    return this.request<T>(endpoint, options);
                } catch (refreshError) {
                    throw refreshError;
                }
            }

            // 4. Handle Standard Errors
            if (!response.ok) {
                const errorText = await response.text();
                let errorData: any = {};

                try {
                    errorData = JSON.parse(errorText);
                } catch (e) {
                    errorData = { message: errorText || `HTTP ${response.status}` };
                }

                // Extract message from structured response: errorData.error.message OR errorData.detail OR errorData.message
                const message = errorData.error?.message || errorData.detail || errorData.message || 'Request failed';

                // Throw structured error container
                throw {
                    status: response.status,
                    data: errorData,
                    message,
                    // Mimic axios structure for backward compatibility
                    response: {
                        status: response.status,
                        statusText: response.statusText,
                        data: errorData
                    }
                };
            }

            // 5. Parse Success Response
            // Handle 204 No Content
            if (response.status === 204) {
                return {} as T;
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }

            // Handle binary formats for downloads
            if (contentType && (
                contentType.includes('application/vnd.openxmlformats-officedocument') ||
                contentType.includes('application/pdf') ||
                contentType.includes('application/zip') ||
                contentType.includes('application/octet-stream')
            )) {
                return await response.blob() as unknown as T;
            }

            return (await response.text()) as unknown as T;

        } catch (error: any) {
            // Propagate error without adding sensitive context like endpoint/URL
            // The status and data are already attached if it came from above.
            // If it's a network error (TypeError), it handles naturally.
            throw error;
        }
    }

    // --- PUBLIC METHODS ---

    public async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
        let url = endpoint;
        if (params) {
            const query = Object.entries(params)
                .filter(([_, value]) => value !== undefined && value !== null && value !== '')
                .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
                .join('&');
            if (query) {
                url += (url.includes('?') ? '&' : '?') + query;
            }
        }
        return this.request<T>(url, { method: 'GET' });
    }

    public async post<T>(endpoint: string, data?: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    public async put<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    public async patch<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }

    public async delete<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE' });
    }

    public async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: formData,
        });
    }

    public async patchFormData<T>(endpoint: string, formData: FormData): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PATCH',
            body: formData,
        });
    }

    // --- HELPERS ---

    public logout() {
        this.clearAuthData();
        if (window.location.pathname !== '/login') {
            window.location.href = '/login';
        }
    }

    public saveAuthData(data: { tenant_id?: string; company_name?: string }) {
        if (data.tenant_id) sessionStorage.setItem('tenantId', data.tenant_id);
        if (data.company_name) sessionStorage.setItem('companyName', data.company_name);
    }

    public clearAuthData() {
        clearTokens();
        sessionStorage.removeItem('tenantId');
        sessionStorage.removeItem('companyName');

        // Also clear from localStorage if they were previously there
        localStorage.removeItem('tenantId');
        localStorage.removeItem('companyName');
    }
}

export const httpClient = new HttpClient();
