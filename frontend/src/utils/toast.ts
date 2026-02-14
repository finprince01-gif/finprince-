type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastListener = (type: ToastType, message: string, title?: string, duration?: number) => void;
type ConfirmListener = (message: string) => Promise<boolean>;

let listener: ToastListener | null = null;
let confirmListener: ConfirmListener | null = null;

export const setToastListener = (l: ToastListener | null) => {
    listener = l;
};

export const setConfirmListener = (l: ConfirmListener | null) => {
    confirmListener = l;
};

export const showSuccess = (message: string, title?: string, duration?: number) => {
    if (listener) {
        listener('success', message, title, duration);
    } else {
        console.warn('Toast listener not registered. Message:', message);
    }
};

export const showError = (message: string, title?: string, duration?: number) => {
    if (listener) {
        listener('error', message, title, duration);
    } else {
        console.error('Toast listener not registered. Error:', message);
    }
};

export const showWarning = (message: string, title?: string, duration?: number) => {
    if (listener) {
        listener('warning', message, title, duration);
    } else {
        console.warn('Toast listener not registered. Warning:', message);
    }
};

export const showInfo = (message: string, title?: string, duration?: number) => {
    if (listener) {
        listener('info', message, title, duration);
    } else {
        console.info('Toast listener not registered. Info:', message);
    }
};

export const confirm = (message: string): Promise<boolean> => {
    if (confirmListener) {
        return confirmListener(message);
    }
    // Fallback if listener not yet registered - using native but warning
    console.warn('Confirm listener not registered. Using native confirm fallback.');
    return Promise.resolve(window.confirm(message));
};

// --- GLOBAL SAFEGUARD ---
if (typeof window !== 'undefined') {
    // Override window.alert
    const originalAlert = window.alert;
    window.alert = (message: any) => {
        const msg = String(message);
        console.error('🚫 window.alert blocked. Use showToast/showError instead. Message:', msg);
        // Show as error toast instead
        showError(msg, 'Alert Blocked');
    };

    // Note: window.confirm cannot be fully overridden to be async without changing all call sites.
    // Instead, we log a critical error if it's called natively.
    const nativeConfirm = window.confirm;
    window.confirm = (message?: string) => {
        console.error('🚫 window.confirm (native) called. This is a blocking call and should be replaced with `await confirm()`. Message:', message);
        return nativeConfirm(message);
    };
}
