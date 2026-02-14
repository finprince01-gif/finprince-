/**
 * ============================================================================
 * API WRAPPER (api.ts)
 * ============================================================================
 * Centralized API wrapper with automatic error handling
 * 
 * All API calls should use these methods instead of httpClient directly
 * This ensures consistent error handling across the application
 */

import { httpClient } from '../services/httpClient';
import { handleApiError, getErrorMessage } from './errorHandler';
import { showSuccess } from './toast';

/**
 * Safe GET request with error handling
 */
export const apiGet = async <T>(
    endpoint: string,
    options?: {
        showError?: boolean;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        return await httpClient.get<T>(endpoint);
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};

/**
 * Safe POST request with error handling
 */
export const apiPost = async <T>(
    endpoint: string,
    data?: any,
    options?: {
        showError?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        const result = await httpClient.post<T>(endpoint, data);

        if (options?.showSuccess) {
            showSuccess(options?.successMessage || 'Operation completed successfully.');
        }

        return result;
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};

/**
 * Safe PUT request with error handling
 */
export const apiPut = async <T>(
    endpoint: string,
    data: any,
    options?: {
        showError?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        const result = await httpClient.put<T>(endpoint, data);

        if (options?.showSuccess) {
            showSuccess(options?.successMessage || 'Updated successfully.');
        }

        return result;
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};

/**
 * Safe PATCH request with error handling
 */
export const apiPatch = async <T>(
    endpoint: string,
    data: any,
    options?: {
        showError?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        const result = await httpClient.patch<T>(endpoint, data);

        if (options?.showSuccess) {
            showSuccess(options?.successMessage || 'Updated successfully.');
        }

        return result;
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};

/**
 * Safe DELETE request with error handling
 */
export const apiDelete = async <T>(
    endpoint: string,
    options?: {
        showError?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        const result = await httpClient.delete<T>(endpoint);

        if (options?.showSuccess) {
            showSuccess(options?.successMessage || 'Deleted successfully.');
        }

        return result;
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};

/**
 * Safe FormData POST request with error handling
 */
export const apiPostFormData = async <T>(
    endpoint: string,
    formData: FormData,
    options?: {
        showError?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        const result = await httpClient.postFormData<T>(endpoint, formData);

        if (options?.showSuccess) {
            showSuccess(options?.successMessage || 'Uploaded successfully.');
        }

        return result;
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};

/**
 * Execute API call with automatic error handling
 * Use this for custom operations
 */
export const withApiErrorHandling = async <T>(
    apiCall: () => Promise<T>,
    options?: {
        showError?: boolean;
        showSuccess?: boolean;
        successMessage?: string;
        errorContext?: string;
    }
): Promise<T | null> => {
    try {
        const result = await apiCall();

        if (options?.showSuccess) {
            showSuccess(options?.successMessage || 'Operation completed successfully.');
        }

        return result;
    } catch (error) {
        if (options?.showError !== false) {
            handleApiError(error, options?.errorContext);
        }
        return null;
    }
};
