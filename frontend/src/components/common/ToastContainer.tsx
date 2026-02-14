import React from 'react';
import { useToast } from '../../context/ToastContext';
import Toast from './Toast';

const ToastContainer: React.FC = () => {
    const { toasts, removeToast } = useToast();

    if (toasts.length === 0) return null;

    return (
        <div
            className="fixed top-6 right-6 z-[9999] flex flex-col items-end pointer-events-none w-full max-w-sm"
            aria-live="assertive"
        >
            <div className="flex flex-col-reverse items-end w-full pointer-events-auto">
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        type={toast.type}
                        message={toast.message}
                        title={toast.title}
                        duration={toast.duration}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>
        </div>
    );
};

export default ToastContainer;
