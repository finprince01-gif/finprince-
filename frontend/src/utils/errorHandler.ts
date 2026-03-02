/**
 * ============================================================================
 * CENTRALIZED ERROR HANDLER (errorHandler.ts)
 * ============================================================================
 * Production-grade error sanitization and user-friendly message mapping
 * 
 * SECURITY: This layer ensures NO backend technical details are exposed to users
 * - No API endpoints
 * - No HTTP methods
 * - No stack traces
 * - No raw error objects
 * - No internal server details
 */

import { showError, showWarning } from './toast';

export interface ApiError {
    status?: number;
    message?: string;
    detail?: string;
    errors?: Record<string, string[]>;
    data?: any;
    [key: string]: any;
}

/**
 * SECURITY: Sanitize error message - remove all technical details
 */
const sanitizeMessage = (message: string): string => {
    if (!message || typeof message !== 'string') {
        return '';
    }

    // Block any message containing technical details
    const blockedPatterns = [
        '/api/', 'http://', 'https://', 'endpoint',
        'post ', 'get ', 'put ', 'patch ', 'delete ',
        'failed to fetch', 'networkerror', 'err_',
        'econnrefused', 'traceback', 'exception',
        'stack trace', 'integrityerror', 'databaseerror',
        'operationalerror', 'syntaxerror', 'typeerror',
        'referenceerror', 'error:', 'at line', 'at column',
        '.py', '.js', '.ts', 'django', 'python',
        'node_modules', 'src/', 'backend/', 'frontend/',
        'response.config', 'response.data'
    ];

    const msgLower = message.toLowerCase();

    // If message contains any blocked pattern, reject it
    for (const pattern of blockedPatterns) {
        if (msgLower.includes(pattern)) {
            return ''; // Blocked - will use default message
        }
    }

    // Block messages that look like JSON
    if (message.trim().startsWith('{') || message.trim().startsWith('[')) {
        return '';
    }

    // Block messages with HTML/XML
    if (message.includes('<') || message.includes('>')) {
        return '';
    }

    // Block very long technical dumps
    if (message.length > 500) {
        return '';
    }

    return message;
};

/**
 * Format field name for display
 * e.g. "first_name" -> "First Name"
 */
const formatFieldName = (field: string): string => {
    if (field === 'detail' || field === 'non_field_errors') return '';
    return field
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase());
};

/**
 * Extract safe validation error message from backend errors object
 */
const extractValidationMessage = (data: any): string => {
    if (!data || typeof data !== 'object') return '';

    // 1. Handle "detail" field (exact match as per requirement)
    if (data.detail && typeof data.detail === 'string') {
        return sanitizeMessage(data.detail);
    }

    // 2. Handle "non_field_errors"
    if (data.non_field_errors && Array.isArray(data.non_field_errors)) {
        return data.non_field_errors.map((msg: any) => sanitizeMessage(String(msg))).join('\n');
    }

    // 3. Handle field-based errors
    // Flatten arrays and combine messages
    const messages: string[] = [];

    Object.keys(data).forEach(field => {
        const errors = data[field];
        const fieldName = formatFieldName(field);

        if (Array.isArray(errors)) {
            errors.forEach(err => {
                const cleanErr = sanitizeMessage(String(err));
                if (cleanErr) {
                    messages.push(fieldName ? `${cleanErr}` : cleanErr);
                }
            });
        } else if (typeof errors === 'string') {
            const cleanErr = sanitizeMessage(errors);
            if (cleanErr) {
                messages.push(fieldName ? `${cleanErr}` : cleanErr);
            }
        }
    });

    return messages.join('\n');
};

/**
 * MAIN ERROR MESSAGE MAPPER
 * Maps all error types to clean, user-friendly messages
 * SECURITY: Ensures no technical details leak through
 */
export const getErrorMessage = (error: any): string => {
    // Handle null/undefined
    if (!error) {
        return "An unexpected error occurred. Please try again.";
    }

    // 1. Handle Network/Connection Errors
    if (error instanceof TypeError ||
        error.name === 'TypeError' ||
        error.message === 'Network Error' ||
        error.message?.includes('Failed to fetch')) {
        return "Unable to connect. Please check your internet connection.";
    }

    if (error.name === 'AbortError' || error.message?.toLowerCase().includes('timeout')) {
        return "The request took too long. Please try again.";
    }

    // 2. Handle HTTP Status Codes
    const status = error.status || error.statusCode || error.response?.status;

    if (status) {
        switch (status) {
            case 400:
                // Specific validation errors
                const data = error.data || error.response?.data || error;
                const validationMsg = extractValidationMessage(data);
                if (validationMsg) return validationMsg;
                return "Please check your input and try again.";

            case 401:
                return "Your session has expired. Please log in again.";

            case 403:
                return "You do not have permission to perform this action.";

            case 404:
                return "The requested resource could not be found.";

            case 409:
                return "This action conflicts with existing data.";

            case 429:
                return "Too many requests. Please wait a moment.";

            case 500:
            case 502:
            case 503:
            case 504:
                return "Something went wrong. Please try again later.";
        }
    }

    // 3. Fallback for unhandled structure or generic errors
    // ONLY if it has a safe 'detail' or 'message' that is NOT technical
    // This is risky, so we rely on sanitizeMessage to strip technical jargon.
    // If strict mode is required, return generic.

    // For now, allow sanitized 'detail' if present
    if (error.detail || (error.data && error.data.detail)) {
        const detail = error.detail || error.data.detail;
        const sanitized = sanitizeMessage(String(detail));
        if (sanitized) return sanitized;
    }

    // Default Fallback
    return "Unable to complete the request. Please try again.";
};

/**
 * GLOBAL ERROR HANDLER
 * Handles errors and shows sanitized toast notifications
 * SECURITY: Logs full error for debugging but only shows safe message to user
 */
export const handleApiError = (error: any, context?: string): void => {
    const userMessage = getErrorMessage(error);

    // Log full error for debugging (only in console, never shown to user)
    if (process.env.NODE_ENV === 'development') {
        console.group('🔴 API Error');
        console.error('Context:');
        console.error('User Message:');
        console.error('Full Error:');
        console.groupEnd();
    }

    // Show ONLY the sanitized message to the user
    showError(userMessage, context);
};

/**
 * Handle validation errors specifically
 * Extracts and displays field-level errors in a user-friendly way
 */
export const handleValidationError = (errors: Record<string, string[]>, context?: string): void => {
    const message = extractValidationMessage(errors);

    if (message) {
        showWarning(message, context || 'Validation Error');
    } else {
        showWarning('Please review the highlighted fields.', context || 'Validation Error');
    }
};

/**
 * Wraps async functions with automatic error handling
 * SECURITY: Ensures all errors are sanitized before reaching user
 */
export const withErrorHandling = async <T>(
    fn: () => Promise<T>,
    context?: string
): Promise<T | null> => {
    try {
        return await fn();
    } catch (error) {
        handleApiError(error, context);
        return null;
    }
};

/**
 * SECURITY: Global error event handler
 * Catches unhandled errors and prevents technical details from showing
 */
if (typeof window !== 'undefined') {
    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
        event.preventDefault(); // Prevent default browser error display

        // Log full error details for debugging
        if (process.env.NODE_ENV === 'development') {
            console.group('🔴 Unhandled Promise Rejection');
            console.error('Reason:', event.reason);
            if (event.reason?.stack) {
                console.error('Stack:', event.reason.stack);
            }
            console.groupEnd();
        } else {
            console.error('Unhandled promise rejection:', event.reason);
        }

        // Show sanitized error to user
        handleApiError(event.reason, 'System Error');
    });

    // Catch global errors
    window.addEventListener('error', (event) => {
        event.preventDefault(); // Prevent default browser error display

        // Log full error details for debugging
        if (process.env.NODE_ENV === 'development') {
            console.group('🔴 Global Error');
            console.error('Message:', event.message);
            console.error('Source:', event.filename);
            console.error('Line:', event.lineno, 'Column:', event.colno);
            console.error('Error Object:', event.error);
            console.groupEnd();
        } else {
            console.error('Global error:', event.message);
        }

        // Only show generic message for global errors
        showError('An unexpected error occurred. Please refresh the page.', 'System Error');
    });
}
