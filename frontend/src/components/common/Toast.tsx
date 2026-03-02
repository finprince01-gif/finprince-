import React, { useEffect, useState } from 'react';
import Icon from '../Icon';
import { ToastType } from '../../context/ToastContext';

interface ToastProps {
    type: ToastType;
    message: string;
    title?: string;
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({ type, message, title, onClose, duration = 4000 }) => {
    const [isExiting, setIsExiting] = useState(false);
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        if (duration > 0) {
            // Progress bar animation
            const progressInterval = setInterval(() => {
                setProgress((prev) => {
                    const decrement = (100 / duration) * 50; // Update every 50ms
                    return Math.max(0, prev - decrement);
                });
            }, 50);

            // Auto-dismiss timer
            const timer = setTimeout(() => {
                handleClose();
            }, duration - 300); // Start exit animation slightly before duration ends

            return () => {
                clearTimeout(timer);
                clearInterval(progressInterval);
            };
        }
    }, [duration]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(onClose, 300); // Match animation duration
    };

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return {
                    icon: 'check-circle',
                    background: 'bg-emerald-50',
                    textColor: 'text-emerald-900',
                    titleColor: 'text-emerald-950',
                    iconBg: 'bg-emerald-500',
                    iconColor: 'text-white',
                    progressBar: 'bg-emerald-500',
                    border: 'border-emerald-100'
                };
            case 'error':
                return {
                    icon: 'x-circle',
                    background: 'bg-red-50',
                    textColor: 'text-red-900',
                    titleColor: 'text-red-950',
                    iconBg: 'bg-red-500',
                    iconColor: 'text-white',
                    progressBar: 'bg-red-500',
                    border: 'border-red-100'
                };
            case 'warning':
                return {
                    icon: 'warning',
                    background: 'bg-amber-50',
                    textColor: 'text-amber-900',
                    titleColor: 'text-amber-950',
                    iconBg: 'bg-amber-500',
                    iconColor: 'text-white',
                    progressBar: 'bg-amber-500',
                    border: 'border-amber-100'
                };
            case 'info':
            default:
                return {
                    icon: 'sparkles',
                    background: 'bg-blue-50',
                    textColor: 'text-blue-900',
                    titleColor: 'text-blue-950',
                    iconBg: 'bg-blue-500',
                    iconColor: 'text-white',
                    progressBar: 'bg-blue-500',
                    border: 'border-blue-100'
                };
        }
    };

    const styles = getTypeStyles();

    // Default titles if not provided
    const defaultTitle = title || {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Information'
    }[type];

    return (
        <div
            className={`
                flex items-start w-full max-w-sm p-4 ${styles.background} ${styles.border} border
                rounded-2xl shadow-lg
                transform transition-all duration-300 ease-out
                ${isExiting ? 'opacity-0 translate-x-12 scale-95' : 'opacity-100 translate-x-0 scale-100'}
                mb-3 relative overflow-hidden
            `}
            role="alert"
            style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)'
            }}
        >
            {/* Icon with circular background */}
            <div className={`flex-shrink-0 mr-3 ${styles.iconBg} rounded-full p-2`}>
                <Icon name={styles.icon as any} className={`w-5 h-5 ${styles.iconColor}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pr-2">
                <div className={`text-sm font-bold ${styles.titleColor} mb-0.5`}>
                    {defaultTitle}
                </div>
                <div className={`text-sm ${styles.textColor} leading-relaxed`}>
                    {message}
                </div>
            </div>

            {/* Close button */}
            <button
                onClick={handleClose}
                className={`flex-shrink-0 ml-2 -mt-1 ${styles.textColor} hover:opacity-70 rounded-lg p-1 inline-flex transition-opacity`}
                aria-label="Close"
            >
                <Icon name="close" className="w-4 h-4" />
            </button>

            {/* Progress bar for auto-dismiss */}
            {duration > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black bg-opacity-5 rounded-b-2xl overflow-hidden">
                    <div
                        className={`h-full ${styles.progressBar} transition-all duration-50 ease-linear`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
        </div>
    );
};

export default Toast;
