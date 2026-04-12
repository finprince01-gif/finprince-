/**
 * ============================================================================
 * HTTP CLIENT (httpClient.ts)
 * ============================================================================
 * Production-grade Axios Authentication Client with domain-separated token handling.
 * Implements standard interceptors for token attachment and automatic refresh.
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
export type { AxiosRequestConfig };
import {
    getAccessToken,
    getMasterAccessToken,
    getCompanyAccessToken,
    getMasterRefreshToken,
    getCompanyRefreshToken,
    setMasterTokens,
    setCompanyTokens,
    clearTokens,
} from './authService';
import { getUserTypeFromToken } from './jwtUtils';

// Environment configuration
export const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

class HttpClient {
    private client: AxiosInstance;
    private isRefreshing = false;
    private failedQueue: any[] = [];

    /** Set tokens — delegates to domain-specific setter based on JWT type claim */
    public setTokens(access: string, refresh: string) {
        const type = getUserTypeFromToken(access);
        if (type === 'master') {
            setMasterTokens(access, refresh);
        } else {
            setCompanyTokens(access, refresh);
        }
    }

    public getToken(): string | null {
        return getAccessToken();
    }

    constructor() {
        this.client = axios.create({
            baseURL: API_BASE_URL,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        this.setupInterceptors();
    }

    private setupInterceptors() {
        // --- REQUEST INTERCEPTOR ---
        this.client.interceptors.request.use(
            (config) => {
                const endpoint = config.url || '';
                const isMasterAPI = endpoint.startsWith('/api/master/');
                
                // Prioritize domain-specific access tokens
                const token = isMasterAPI ? getMasterAccessToken() : getCompanyAccessToken();
                
                if (token && !endpoint.includes('/auth/')) {
                    config.headers.Authorization = `Bearer ${token}`;
                }
                return config;
            },
            (error) => Promise.reject(error)
        );

        // --- RESPONSE INTERCEPTOR ---
        this.client.interceptors.response.use(
            (response: AxiosResponse) => response,
            async (error) => {
                const originalRequest = error.config;
                const status = error.response?.status;
                const endpoint = originalRequest.url || '';
                const isMasterAPI = endpoint.startsWith('/api/master/');

                // 1. Handle Deactivations / Security Intercepts (401/403)
                const errorData = error.response?.data || {};
                const errorCode = errorData.error_code || errorData.code || (errorData.error && (errorData.error.code || errorData.error.error_code));
                const suspensionCodes = ['account_suspended', 'user_inactive', 'user_not_found'];

                if (suspensionCodes.includes(errorCode)) {
                    console.error(`❌ Security intercept: ${errorCode}. Logging out.`);
                    this.logout();
                    return Promise.reject({
                        ...error,
                        message: errorData.message || errorData.detail || 'Account deactivated.',
                        code: errorCode
                    });
                }

                // 2. Handle Token Refresh (401 only, and not on auth endpoints)
                if (status === 401 && !originalRequest._retry && !endpoint.includes('/auth/')) {
                    if (this.isRefreshing) {
                        return new Promise((resolve, reject) => {
                            this.failedQueue.push({ resolve, reject });
                        }).then((token) => {
                            originalRequest.headers.Authorization = `Bearer ${token}`;
                            return this.client(originalRequest);
                        }).catch((err) => Promise.reject(err));
                    }

                    originalRequest._retry = true;
                    this.isRefreshing = true;

                    try {
                        const newAccess = await this.performRefresh(isMasterAPI);
                        this.isRefreshing = false;
                        this.processQueue(null, newAccess);
                        
                        originalRequest.headers.Authorization = `Bearer ${newAccess}`;
                        return this.client(originalRequest);
                    } catch (refreshError) {
                        this.isRefreshing = false;
                        this.processQueue(refreshError as Error, null);
                        this.logout();
                        return Promise.reject(refreshError);
                    }
                }

                // Standard error rejection
                const message = errorData.detail || errorData.message || error.message || 'Request failed';
                return Promise.reject({
                    ...error,
                    status,
                    data: errorData,
                    message
                });
            }
        );
    }

    private processQueue(error: Error | null, token: string | null = null) {
        this.failedQueue.forEach((prom) => {
            if (error) {
                prom.reject(error);
            } else {
                prom.resolve(token);
            }
        });
        this.failedQueue = [];
    }

    private async performRefresh(isMasterAPI: boolean): Promise<string> {
        const refreshToken = isMasterAPI ? getMasterRefreshToken() : getCompanyRefreshToken();
        const refreshEndpoint = isMasterAPI ? '/api/master/auth/refresh/' : '/api/auth/refresh/';
        const setFn = isMasterAPI ? setMasterTokens : setCompanyTokens;

        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_BASE_URL}${refreshEndpoint}`, {
            refresh: refreshToken
        });

        const { access, refresh } = response.data;
        if (!access) throw new Error('Refresh failed - no access token');

        setFn(access, refresh || refreshToken);
        return access;
    }

    // --- PUBLIC WRAPPERS ---
    public async get<T>(url: string, params?: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.get<T>(url, { ...config, params });
        return response.data;
    }

    public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.post<T>(url, data, config);
        return response.data;
    }

    public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.put<T>(url, data, config);
        return response.data;
    }

    public async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.patch<T>(url, data, config);
        return response.data;
    }

    public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
        const response = await this.client.delete<T>(url, config);
        return response.data;
    }

    /** Legacy Formdata support */
    public async postFormData<T>(url: string, formData: FormData, config?: AxiosRequestConfig): Promise<T> {
        return this.post<T>(url, formData, {
            ...config,
            headers: { ...config?.headers, 'Content-Type': 'multipart/form-data' }
        });
    }

    // --- MANAGEMENT ---
    public logout() {
        clearTokens();
        sessionStorage.removeItem('tenantId');
        sessionStorage.removeItem('companyName');
        const isMasterPath = window.location.pathname.startsWith('/master');
        window.location.href = isMasterPath ? '/master/login' : '/login';
    }

    public saveAuthData(data: { tenant_id?: string; company_name?: string }) {
        if (data.tenant_id) sessionStorage.setItem('tenantId', data.tenant_id);
        if (data.company_name) sessionStorage.setItem('companyName', data.company_name);
    }

    /** Clear all auth data — both domains */
    public clearAuthData() {
        clearTokens();
        sessionStorage.removeItem('tenantId');
        sessionStorage.removeItem('companyName');
        localStorage.removeItem('tenantId');
        localStorage.removeItem('companyName');
    }
}

export const httpClient = new HttpClient();
