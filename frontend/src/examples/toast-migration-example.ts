/**
 * ============================================================================
 * TOAST NOTIFICATION SYSTEM - MIGRATION GUIDE
 * ============================================================================
 * 
 * This file provides examples of how to migrate from old error handling
 * patterns to the new centralized toast notification system.
 * 
 * NOTE: This is a documentation file with code examples.
 * The examples show patterns, not complete working code.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// ============================================================================
// EXAMPLE 1: SERVICE GROUP CREATION
// ============================================================================

/**
 * BEFORE: Old Implementation with Manual Error Handling
 * 
 * Problems:
 * - Manual error handling in every component
 * - Inconsistent error messages
 * - Raw error messages might leak through
 * - Duplicate error handling code
 */
const exampleOldPattern = `
import { httpClient } from '../../services/httpClient';
import { showSuccess, showError } from '../../utils/toast';

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
        const response = await httpClient.post('/api/services/groups/', {
            category: selectedNode.data.category,
            group: formData.group.trim() || null,
            subgroup: formData.subgroup.trim() || null
        });

        setFormData(prev => ({ ...prev, group: '', subgroup: '' }));
        fetchServiceGroups();
        showSuccess('Service Group created successfully!');
    } catch (error: any) {
        const errorMsg = error.toString();
        if (
            errorMsg.includes('Duplicate') ||
            errorMsg.includes('IntegrityError') ||
            errorMsg.includes('already exists')
        ) {
            showSuccess('Service Group already exists!');
            fetchServiceGroups();
        } else {
            console.error('Error creating service group:');
            showError(\`Error creating service group: \${error.message || error}\`);
        }
    }
};
`;

/**
 * AFTER: New Implementation with API Wrapper
 * 
 * Benefits:
 * - Automatic error handling
 * - Consistent, user-friendly error messages
 * - No raw errors exposed to users
 * - Less code, more maintainable
 * - Centralized error logic
 */
const exampleNewPattern = `
import { apiPost } from '../../utils/api';

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const result = await apiPost('/api/services/groups/', {
        category: selectedNode.data.category,
        group: formData.group.trim() || null,
        subgroup: formData.subgroup.trim() || null
    }, {
        showSuccess: true,
        successMessage: 'Service Group created successfully.',
        errorContext: 'Create Service Group'
    });

    if (result) {
        setFormData(prev => ({ ...prev, group: '', subgroup: '' }));
        await fetchServiceGroups();
    }
    // Errors are automatically handled and displayed
};
`;

// ============================================================================
// EXAMPLE 2: FETCH DATA
// ============================================================================

const exampleFetchOld = `
// BEFORE: Manual error handling
const fetchServiceGroups = async () => {
    setLoading(true);
    try {
        const response = await httpClient.get<ServiceGroup[]>('/api/services/groups/');
        if (response && Array.isArray(response)) {
            setApiData(response);
        }
    } catch (error) {
        console.error('Error fetching service groups:');
        setApiData([]);
        // ❌ No user feedback on error
    } finally {
        setLoading(false);
    }
};
`;

const exampleFetchNew = `
// AFTER: Using API wrapper
import { apiGet } from '../../utils/api';

const fetchServiceGroups = async () => {
    setLoading(true);
    
    const response = await apiGet<ServiceGroup[]>('/api/services/groups/', {
        showError: true,
        errorContext: 'Fetch Service Groups'
    });
    
    if (response && Array.isArray(response)) {
        setApiData(response);
    } else {
        setApiData([]);
    }
    
    setLoading(false);
};
`;

// ============================================================================
// EXAMPLE 3: DELETE OPERATION
// ============================================================================

const exampleDeleteOld = `
// BEFORE: Using window.confirm
const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this item?')) {
        return;
    }

    try {
        await httpClient.delete(\`/api/services/groups/\${id}\`);
        showSuccess('Deleted successfully');
        fetchServiceGroups();
    } catch (error) {
        console.error('Delete error:');
        showError('Failed to delete item');
    }
};
`;

const exampleDeleteNew = `
// AFTER: Using custom confirm dialog and API wrapper
import { apiDelete } from '../../utils/api';
import { confirm } from '../../utils/toast';

const handleDelete = async (id: number) => {
    if (!await confirm('Are you sure you want to delete this item?')) {
        return;
    }

    const result = await apiDelete(\`/api/services/groups/\${id}\`, {
        showSuccess: true,
        successMessage: 'Service Group deleted successfully.',
        errorContext: 'Delete Service Group'
    });

    if (result) {
        await fetchServiceGroups();
    }
};
`;

// ============================================================================
// EXAMPLE 4: UPDATE OPERATION
// ============================================================================

const exampleUpdateOld = `
// BEFORE: Manual status code checking
const handleUpdate = async (id: number, data: any) => {
    try {
        await httpClient.put(\`/api/services/groups/\${id}\`, data);
        showSuccess('Updated successfully');
        fetchServiceGroups();
    } catch (error: any) {
        if (error.status === 400) {
            showError('Invalid data provided');
        } else if (error.status === 404) {
            showError('Item not found');
        } else {
            showError('Failed to update item');
        }
    }
};
`;

const exampleUpdateNew = `
// AFTER: Automatic error handling
import { apiPut } from '../../utils/api';

const handleUpdate = async (id: number, data: any) => {
    const result = await apiPut(\`/api/services/groups/\${id}\`, data, {
        showSuccess: true,
        successMessage: 'Service Group updated successfully.',
        errorContext: 'Update Service Group'
    });

    if (result) {
        await fetchServiceGroups();
    }
    // All error cases (400, 404, 500, etc.) are automatically handled
};
`;

// ============================================================================
// EXAMPLE 5: FORM UPLOAD
// ============================================================================

const exampleUploadOld = `
// BEFORE: Manual validation error handling
const handleFormSubmit = async (formData: FormData) => {
    try {
        const response = await httpClient.postFormData('/api/upload', formData);
        showSuccess('File uploaded successfully');
        return response;
    } catch (error: any) {
        if (error.status === 400 && error.errors) {
            const firstError = Object.values(error.errors)[0];
            showError(Array.isArray(firstError) ? firstError[0] : 'Validation error');
        } else {
            showError('Upload failed');
        }
        return null;
    }
};
`;

const exampleUploadNew = `
// AFTER: Automatic validation error extraction
import { apiPostFormData } from '../../utils/api';

const handleFormSubmit = async (formData: FormData) => {
    const response = await apiPostFormData('/api/upload', formData, {
        showSuccess: true,
        successMessage: 'File uploaded successfully.',
        errorContext: 'File Upload'
    });

    return response;
    // Validation errors are automatically extracted and displayed
};
`;

// ============================================================================
// EXAMPLE 6: CUSTOM ERROR HANDLING
// ============================================================================

const exampleCustomErrorHandling = `
// When you need custom logic for specific errors
import { httpClient } from '../../services/httpClient';
import { handleApiError } from '../../utils/errorHandler';
import { showSuccess } from '../../utils/toast';

const handleSubmitWithCustomLogic = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
        const response = await httpClient.post('/api/endpoint', data);
        showSuccess('Operation completed successfully.');
        
    } catch (error: any) {
        // Custom handling for specific error types
        if (error.status === 409) {
            showSuccess('Item already exists! Restored to view.');
            await fetchData();
        } else {
            // Use centralized handler for all other errors
            handleApiError(error, 'Operation Name');
        }
    }
};
`;

// ============================================================================
// MIGRATION CHECKLIST
// ============================================================================

/**
 * STEP-BY-STEP MIGRATION GUIDE
 * 
 * For each component with API calls:
 * 
 * 1. Add imports:
 *    import { apiPost, apiGet, apiPut, apiDelete } from '../../utils/api';
 * 
 * 2. Replace httpClient calls:
 *    - httpClient.post() → apiPost()
 *    - httpClient.get() → apiGet()
 *    - httpClient.put() → apiPut()
 *    - httpClient.delete() → apiDelete()
 *    - httpClient.postFormData() → apiPostFormData()
 * 
 * 3. Remove manual error handling:
 *    - Delete try/catch blocks (unless custom logic needed)
 *    - Remove manual showError() calls
 *    - Remove error.status checking
 * 
 * 4. Add success notifications:
 *    - Set showSuccess: true in options
 *    - Provide custom successMessage
 * 
 * 5. Replace window.alert() and window.confirm():
 *    - window.alert('msg') → showError('msg') or showInfo('msg')
 *    - window.confirm('msg') → await confirm('msg')
 * 
 * 6. Test thoroughly:
 *    - Success cases
 *    - Error cases (network, validation, server)
 *    - Verify user-friendly messages appear
 *    - Check that no raw errors are shown
 */

// ============================================================================
// QUICK REFERENCE
// ============================================================================

const quickReference = {
    // Basic toast notifications
    success: "showSuccess('Message')",
    error: "showError('Message')",
    warning: "showWarning('Message')",
    info: "showInfo('Message')",

    // With custom titles
    successWithTitle: "showSuccess('Message', 'Custom Title')",

    // API calls with auto error handling
    get: "await apiGet('/endpoint', { showError: true })",
    post: "await apiPost('/endpoint', data, { showSuccess: true, successMessage: 'Saved!' })",
    put: "await apiPut('/endpoint', data, { showSuccess: true })",
    delete: "await apiDelete('/endpoint', { showSuccess: true })",

    // Custom confirm dialog
    confirm: "if (await confirm('Are you sure?')) { ... }",

    // Manual error handling
    manualError: "handleApiError(error, 'Context Name')",
};

// ============================================================================
// BENEFITS SUMMARY
// ============================================================================

/**
 * ✅ BENEFITS OF NEW APPROACH:
 * 
 * 1. Less Code
 *    - No manual try/catch in every function
 *    - No repetitive error handling logic
 *    - Cleaner, more readable code
 * 
 * 2. Consistent UX
 *    - All errors show user-friendly messages
 *    - Consistent toast styling across app
 *    - Professional error messages
 * 
 * 3. Security
 *    - No technical details exposed to users
 *    - Stack traces blocked
 *    - Database errors sanitized
 * 
 * 4. Maintainability
 *    - Centralized error logic
 *    - Easy to update error messages globally
 *    - Single source of truth
 * 
 * 5. Developer Experience
 *    - Simple API: apiPost, apiGet, etc.
 *    - Optional success notifications
 *    - Automatic error handling
 *    - Type-safe
 */

export {
    exampleOldPattern,
    exampleNewPattern,
    exampleFetchOld,
    exampleFetchNew,
    exampleDeleteOld,
    exampleDeleteNew,
    exampleUpdateOld,
    exampleUpdateNew,
    exampleUploadOld,
    exampleUploadNew,
    exampleCustomErrorHandling,
    quickReference,
};
