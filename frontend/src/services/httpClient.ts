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
     * CORE REQUEST METHOD
     * Wraps fetch() with auth logic, headers, and error handling.
     */
    private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseURL}${endpoint}`;

        // 1. Prepare Headers (Inject Bearer Token)
        const headers = new Headers(options.headers || {});
        if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        const token = localStorage.getItem('token');
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        try {
            // 2. Execute Request
            const response = await fetch(url, {
                ...options,
                headers,
                credentials: 'include', // Include cookies (needed for refresh endpoint if using cookies)
            });

            // 3. Handle Unauthorized (401)
            if (response.status === 401) {
                // Avoid infinite loops: Don't refresh if the failed request WAS a refresh attempt
                if (endpoint.includes('/auth/refresh') || endpoint.includes('/auth/login')) {
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
                this.isRefreshing = true;

                try {

                    // Call backend refresh endpoint
                    // The backend reads the refresh token from HTTP-only cookies
                    const refreshResponse = await fetch(`/api/auth/refresh/`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include' // Send cookies (refresh token is in HTTP-only cookie)
                    });

                    if (!refreshResponse.ok) {
                        throw new Error('Refresh failed');
                    }

                    const data = await refreshResponse.json();

                    // 4. Update Token Storage
                    if (data.access) {
                        localStorage.setItem('token', data.access);

                    }
                    if (data.refresh) {
                        localStorage.setItem('refreshToken', data.refresh); // Optional if using cookies
                    }

                    // 5. Retry Queued Requests
                    this.processQueue(null);

                    // 6. Retry Original Request immediately
                    return this.request<T>(endpoint, options);

                } catch (refreshError) {
                    console.error('❌ Session expired. Logging out.');
                    this.processQueue(refreshError as Error);
                    this.logout();
                    throw refreshError;
                } finally {
                    this.isRefreshing = false;
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

                // Throw structured error container
                throw {
                    status: response.status,
                    data: errorData,
                    // valid backend error might have 'detail' or 'message'
                    message: errorData.detail || errorData.message || 'Request failed',
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

    public async get<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET' });
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
        if (data.tenant_id) localStorage.setItem('tenantId', data.tenant_id);
        if (data.company_name) localStorage.setItem('companyName', data.company_name);
    }

    public clearAuthData() {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tenantId');
        localStorage.removeItem('companyName');
    }
}

export const httpClient = new HttpClient();
