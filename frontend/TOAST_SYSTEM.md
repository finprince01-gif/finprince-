# Toast Notification System - Implementation Guide

## Overview

The application now uses a modern, enterprise-grade Soft Background Tint Toast notification system that provides consistent, professional feedback across all user actions.

## Design Features

### Visual Design
- **Soft Background Tint**: Modern SaaS-style with subtle colored backgrounds
- **Pill Shape**: Rounded corners (16-20px border-radius)
- **Circular Icons**: Color-coded icons with soft backgrounds
- **Smooth Animations**: Slide-in from right with fade effects
- **Auto-dismiss**: 4-second default with visual progress bar
- **Stackable**: Multiple toasts stack vertically in top-right corner

### Color System

#### Success (Emerald)
- Background: `#ECFDF5` (emerald-50)
- Text: `#065F46` (emerald-900)
- Icon: `#10B981` (emerald-500)

#### Error (Red)
- Background: `#FEF2F2` (red-50)
- Text: `#7F1D1D` (red-900)
- Icon: `#EF4444` (red-500)

#### Warning (Amber)
- Background: `#FFFBEB` (amber-50)
- Text: `#78350F` (amber-900)
- Icon: `#F59E0B` (amber-500)

#### Info (Blue)
- Background: `#EFF6FF` (blue-50)
- Text: `#1E3A8A` (blue-900)
- Icon: `#3B82F6` (blue-500)

## Usage

### Basic Usage

```typescript
import { showSuccess, showError, showWarning, showInfo } from '../utils/toast';

// Success notification
showSuccess('Data saved successfully.');

// Error notification
showError('Unable to complete the request.');

// Warning notification
showWarning('Please review the highlighted fields.');

// Info notification
showInfo('Processing your request...');
```

### With Custom Titles

```typescript
showSuccess('Your changes have been saved.', 'Settings Updated');
showError('The server is not responding.', 'Connection Error');
showWarning('This action cannot be undone.', 'Confirm Action');
showInfo('New features are available.', 'Update Available');
```

### With Custom Duration

```typescript
// Show for 6 seconds
showSuccess('Operation completed.', undefined, 6000);

// Show indefinitely (until manually closed)
showSuccess('Important message.', undefined, 0);
```

### Using React Hook

```typescript
import { useToast } from '../context/ToastContext';

function MyComponent() {
    const { showSuccess, showError, showWarning, showInfo } = useToast();
    
    const handleSave = async () => {
        try {
            await saveData();
            showSuccess('Data saved successfully.');
        } catch (error) {
            showError('Failed to save data.');
        }
    };
}
```

## API Integration

### Using the API Wrapper (Recommended)

The new API wrapper automatically handles errors and shows appropriate notifications:

```typescript
import { apiPost, apiGet, apiPut, apiDelete } from '../utils/api';

// Automatic error handling
const data = await apiGet<MyData>('/api/endpoint');
if (data) {
    // Success - data is available
}

// With success notification
const result = await apiPost('/api/save', payload, {
    showSuccess: true,
    successMessage: 'Saved successfully.'
});

// With custom error context
const updated = await apiPut('/api/update', data, {
    showSuccess: true,
    successMessage: 'Updated successfully.',
    errorContext: 'Update Operation'
});
```

### Manual Error Handling

```typescript
import { httpClient } from '../services/httpClient';
import { handleApiError } from '../utils/errorHandler';

try {
    const response = await httpClient.post('/api/endpoint', data);
    showSuccess('Operation completed successfully.');
} catch (error) {
    handleApiError(error, 'Operation Name');
}
```

## Error Message Mapping

The system automatically maps technical errors to user-friendly messages:

| Error Type | User Message |
|-----------|-------------|
| Network Error | "We couldn't reach the server. Please check your connection and try again." |
| 400 Bad Request | "Please check the information you entered and try again." |
| 401 Unauthorized | "Your session has expired. Please log in again." |
| 403 Forbidden | "You do not have permission to perform this action." |
| 404 Not Found | "The requested resource could not be found." |
| 409 Conflict | "This action conflicts with existing data. Please refresh and try again." |
| 422 Validation | "The data provided is invalid. Please check and try again." |
| 500+ Server Error | "Something went wrong on our end. Please try again later." |

## Alert Blocking

The system automatically blocks `window.alert()` and `window.confirm()` calls:

```typescript
// ❌ DON'T USE
window.alert('Message'); // Blocked - will show as error toast

// ✅ USE INSTEAD
showInfo('Message');

// ❌ DON'T USE
if (window.confirm('Are you sure?')) { }

// ✅ USE INSTEAD
import { confirm } from '../utils/toast';
if (await confirm('Are you sure?')) { }
```

## Best Practices

### Message Tone

Use professional, enterprise SaaS tone:

#### ✅ Good Examples
- "Saved successfully."
- "Updated successfully."
- "Deleted successfully."
- "Configuration applied successfully."
- "Unable to complete the request."
- "We couldn't reach the server."
- "Please review the highlighted fields."

#### ❌ Avoid
- "Yay! It worked!"
- "Oops! Something broke!"
- "Error: 500 Internal Server Error"
- "Failed to fetch"
- Technical stack traces

### When to Show Notifications

**Always show feedback for:**
- Save operations
- Update operations
- Delete operations
- Login/Logout
- Password reset
- Settings changes
- Any CRUD operation
- API failures

**Don't show notifications for:**
- Silent background operations
- Auto-save (unless explicitly requested)
- Polling/refresh operations
- Navigation

### Error Handling Pattern

```typescript
const handleSubmit = async () => {
    try {
        const result = await apiPost('/api/save', formData, {
            showSuccess: true,
            successMessage: 'Form submitted successfully.',
            errorContext: 'Form Submission'
        });
        
        if (result) {
            // Additional success logic
            navigate('/success');
        }
    } catch (error) {
        // Error already handled by apiPost
        // Optional: Additional error logic
    }
};
```

## Components

### Toast Component
Location: `src/components/common/Toast.tsx`
- Renders individual toast notifications
- Handles animations and auto-dismiss
- Displays icon, title, message, and close button

### ToastContainer Component
Location: `src/components/common/ToastContainer.tsx`
- Manages toast stack
- Positioned in top-right corner
- Handles z-index and stacking

### ToastContext
Location: `src/context/ToastContext.tsx`
- Provides toast functions via React Context
- Manages toast state
- Integrates with global toast utilities

## Migration Guide

### Replacing window.alert()

```typescript
// Before
window.alert('Operation completed');

// After
showSuccess('Operation completed.');
```

### Replacing window.confirm()

```typescript
// Before
if (window.confirm('Are you sure?')) {
    deleteItem();
}

// After
import { confirm } from '../utils/toast';

if (await confirm('Are you sure?')) {
    deleteItem();
}
```

### Replacing Raw Error Messages

```typescript
// Before
catch (error) {
    console.error(error);
    alert('Error: ' + error.message);
}

// After
import { handleApiError } from '../utils/errorHandler';

catch (error) {
    handleApiError(error, 'Operation Name');
}
```

## Testing

### Manual Testing Checklist

- [ ] Success notifications appear with emerald background
- [ ] Error notifications appear with red background
- [ ] Warning notifications appear with amber background
- [ ] Info notifications appear with blue background
- [ ] Toasts auto-dismiss after 4 seconds
- [ ] Progress bar animates correctly
- [ ] Multiple toasts stack vertically
- [ ] Close button works
- [ ] Animations are smooth
- [ ] window.alert() is blocked
- [ ] Network errors show user-friendly messages
- [ ] 401 errors trigger session expired message
- [ ] 500 errors show generic server error message

## Troubleshooting

### Toast not appearing
- Ensure `ToastProvider` wraps your app in `App.tsx`
- Check that `ToastContainer` is rendered
- Verify toast listener is registered

### Errors still showing raw messages
- Use `apiPost`, `apiGet`, etc. from `utils/api.ts`
- Or wrap calls with `handleApiError`
- Check that error messages are being sanitized

### window.alert still showing
- Ensure `utils/toast.ts` is imported early in app initialization
- Check browser console for override confirmation

## Future Enhancements

Potential improvements:
- Toast positioning options (top-left, bottom-right, etc.)
- Custom toast types (loading, promise-based)
- Toast queue management (max visible toasts)
- Persistent toasts (saved to localStorage)
- Sound notifications
- Desktop notifications integration
