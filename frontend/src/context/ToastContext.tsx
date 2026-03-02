import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { setToastListener, setConfirmListener } from '../utils/toast';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    title?: string;
    duration?: number;
}

interface ConfirmState {
    isOpen: boolean;
    message: string;
    resolve: (value: boolean) => void;
}

interface ToastContextType {
    toasts: Toast[];
    showToast: (type: ToastType, message: string, title?: string, duration?: number) => void;
    showSuccess: (message: string, title?: string, duration?: number) => void;
    showError: (message: string, title?: string, duration?: number) => void;
    showWarning: (message: string, title?: string, duration?: number) => void;
    showInfo: (message: string, title?: string, duration?: number) => void;
    removeToast: (id: string) => void;
    confirm: (message: string) => Promise<boolean>;
    confirmState: ConfirmState;
    closeConfirm: (result: boolean) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [confirmState, setConfirmState] = useState<ConfirmState>({
        isOpen: false,
        message: '',
        resolve: () => { },
    });

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showToast = useCallback((type: ToastType, message: string, title?: string, duration = 4000) => {
        const id = Math.random().toString(36).substring(2, 9);
        const newToast: Toast = { id, type, message, title, duration };

        setToasts((prev) => [...prev, newToast]);

        if (duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, duration);
        }
    }, [removeToast]);

    const showSuccess = useCallback((message: string, title?: string, duration?: number) => showToast('success', message, title, duration), [showToast]);
    const showError = useCallback((message: string, title?: string, duration?: number) => showToast('error', message, title, duration), [showToast]);
    const showWarning = useCallback((message: string, title?: string, duration?: number) => showToast('warning', message, title, duration), [showToast]);
    const showInfo = useCallback((message: string, title?: string, duration?: number) => showToast('info', message, title, duration), [showToast]);

    const confirm = useCallback((message: string): Promise<boolean> => {
        return new Promise((resolve) => {
            setConfirmState({
                isOpen: true,
                message,
                resolve,
            });
        });
    }, []);

    const closeConfirm = useCallback((result: boolean) => {
        confirmState.resolve(result);
        setConfirmState((prev) => ({ ...prev, isOpen: false }));
    }, [confirmState]);

    // Register global listeners
    useEffect(() => {
        setToastListener((type, message, title, duration) => {
            showToast(type, message, title, duration);
        });
        setConfirmListener(confirm);

        return () => {
            setToastListener(null);
            setConfirmListener(null);
        };
    }, [showToast, confirm]);

    return (
        <ToastContext.Provider value={{
            toasts,
            showToast,
            showSuccess,
            showError,
            showWarning,
            showInfo,
            removeToast,
            confirm,
            confirmState,
            closeConfirm
        }}>
            {children}
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
