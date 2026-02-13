import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { apiService } from '../../services';

interface ForgotPasswordProps {
    onBackToLogin: () => void;
}

type Step = 1 | 2 | 3 | 4;

const ForgotPassword: React.FC<ForgotPasswordProps> = ({ onBackToLogin }) => {
    const [step, setStep] = useState<Step>(1);
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [resendTimer, setResendTimer] = useState(0);

    useEffect(() => {
        let timer: any;
        if (resendTimer > 0) {
            timer = setInterval(() => {
                setResendTimer((prev) => prev - 1);
            }, 1000);
        }
        return () => clearInterval(timer);
    }, [resendTimer]);

    const handleIdentifyAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await apiService.requestResetOTP(email);
            setMessage(response.message);
            setStep(2);
            setResendTimer(60); // 60 seconds cooldown
        } catch (err: any) {
            setError(err?.message || err?.detail || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResendOTP = async () => {
        if (resendTimer > 0 || loading) return;

        setError('');
        setLoading(true);
        try {
            const response = await apiService.requestResetOTP(email);
            setMessage('A new code has been sent to your email.');
            setResendTimer(60);
        } catch (err: any) {
            setError(err?.message || err?.detail || 'Failed to resend code.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await apiService.verifyOTPOnly(email, otp);
            if (response.success) {
                setStep(3);
            }
        } catch (err: any) {
            setError(err?.message || err?.detail || 'Invalid verification code.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        setLoading(true);

        try {
            const response = await apiService.verifyResetOTP({
                email,
                otp,
                new_password: newPassword
            });
            if (response.success) {
                setStep(4);
            } else {
                setError(response.message);
            }
        } catch (err: any) {
            setError(err?.message || err?.detail || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 transition-colors duration-200 p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Progress Bar */}
                <div className="h-1 w-full bg-slate-100 dark:bg-slate-700">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-500"
                        style={{ width: `${(step / 4) * 100}%` }}
                    />
                </div>

                <div className="p-8">
                    {/* Header */}
                    <div className="mb-8">
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                            {step === 1 && "Recover your account"}
                            {step === 2 && "Enter verification code"}
                            {step === 3 && "Create a strong password"}
                            {step === 4 && "Password Reset Complete"}
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {step === 1 && `Step 1 of 4 – Identify Account`}
                            {step === 2 && `Step 2 of 4 – Verify Identity`}
                            {step === 3 && `Step 3 of 4 – Set New Password`}
                            {step === 4 && `Your password has been successfully reset.`}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-600 dark:text-red-400 text-sm flex items-center gap-2">
                            <Icon name="x-circle" className="w-4 h-4 flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {message && step === 2 && !error && (
                        <div className="mb-6 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded text-green-600 dark:text-green-400 text-sm flex items-center gap-2">
                            <Icon name="check-circle" className="w-4 h-4 flex-shrink-0" />
                            <span>{message}</span>
                        </div>
                    )}

                    {step === 1 && (
                        <form onSubmit={handleIdentifyAccount} className="space-y-6">
                            <div>
                                <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Email address
                                </label>
                                <input
                                    id="email"
                                    type="email"
                                    required
                                    autoFocus
                                    className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                    placeholder="user@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-sm transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {loading ? <Icon name="spinner" className="w-4 h-4 animate-spin" /> : "Next"}
                                </button>
                                <button
                                    type="button"
                                    onClick={onBackToLogin}
                                    className="w-full py-2.5 px-4 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 2 && (
                        <form onSubmit={handleVerifyOTP} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                    Account
                                </label>
                                <div className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                                    {email}
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="otp" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                            6-digit verification code
                                        </label>
                                        <input
                                            id="otp"
                                            type="text"
                                            required
                                            maxLength={6}
                                            autoFocus
                                            className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white tracking-widest text-center text-xl"
                                            placeholder="000000"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                        />
                                        <div className="mt-4 flex flex-col items-center gap-2">
                                            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
                                                Didn't receive the code?
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handleResendOTP}
                                                disabled={resendTimer > 0 || loading}
                                                className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Verification Code"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-sm transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {loading ? <Icon name="spinner" className="w-4 h-4 animate-spin" /> : "Verify & Continue"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="w-full py-2.5 px-4 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium rounded-md transition-colors"
                                >
                                    Back
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 3 && (
                        <form onSubmit={handleResetPassword} className="space-y-6">
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        New Password
                                    </label>
                                    <input
                                        id="newPassword"
                                        type="password"
                                        required
                                        autoFocus
                                        className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                        placeholder="••••••••"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                        Confirm New Password
                                    </label>
                                    <input
                                        id="confirmPassword"
                                        type="password"
                                        required
                                        className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all dark:text-white"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-sm transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    {loading ? <Icon name="spinner" className="w-4 h-4 animate-spin" /> : "Reset Password"}
                                </button>
                            </div>
                        </form>
                    )}

                    {step === 4 && (
                        <div className="flex flex-col items-center py-4">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-6">
                                <Icon name="check" className="w-8 h-8 text-green-600 dark:text-green-400" />
                            </div>
                            <p className="text-center text-slate-600 dark:text-slate-300 mb-8">
                                Your account is now secured. You can log in with your new password.
                            </p>
                            <button
                                onClick={onBackToLogin}
                                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-sm transition-colors"
                            >
                                Back to Login
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Support Link */}
            <p className="mt-8 text-sm text-slate-500 dark:text-slate-400">
                Having trouble? <button className="text-indigo-600 hover:underline">Contact support</button>
            </p>
        </div>
    );
};

export default ForgotPassword;
