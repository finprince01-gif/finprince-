import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { apiService } from '../../services';
import './ForgotPassword.css'; // I will create this

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
            setResendTimer(60);
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
        <div className="forgot-password-page-container">
            <header className="brand-section">
                <h1 className="brand-heading">FINPIXE</h1>
                <p className="brand-tagline">Recover your account securely.</p>
            </header>

            <main className="forgot-password-card">
                <div className="progress-container">
                    <div
                        className="progress-bar"
                        style={{ width: `${(step / 4) * 100}%` }}
                    />
                </div>

                <div className="card-header">
                    <h2 className="card-title">
                        {step === 1 && "Reset Password"}
                        {step === 2 && "Verification Code"}
                        {step === 3 && "Secure Password"}
                        {step === 4 && "Success"}
                    </h2>
                    <p className="card-subtitle">
                        {step === 1 && `Identify your account to continue.`}
                        {step === 2 && `Verify your identity with the code sent to your email.`}
                        {step === 3 && `Set a strong new password for your account.`}
                        {step === 4 && `Your password has been reset.`}
                    </p>
                </div>

                {error && <div className="error-message">{error}</div>}
                {message && step === 2 && !error && <div className="success-message">{message}</div>}

                {step === 1 && (
                    <form onSubmit={handleIdentifyAccount} className="forgot-password-form">
                        <div className="form-group">
                            <label className="form-label" htmlFor="email">EMAIL ADDRESS</label>
                            <input
                                id="email"
                                type="email"
                                required
                                autoFocus
                                className="form-input"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <button type="submit" disabled={loading} className="action-button">
                            {loading ? "Identifying..." : "Identify Account →"}
                        </button>
                    </form>
                )}

                {step === 2 && (
                    <form onSubmit={handleVerifyOTP} className="forgot-password-form">
                        <div className="form-group">
                            <label className="form-label">ACCOUNT</label>
                            <p className="account-identifier">{email}</p>

                            <label className="form-label" htmlFor="otp">6-DIGIT CODE</label>
                            <input
                                id="otp"
                                type="text"
                                required
                                maxLength={6}
                                autoFocus
                                className="form-input otp-input"
                                placeholder="000000"
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                            />

                            <div className="resend-container">
                                <p className="resend-text">Didn't receive the code?</p>
                                <button
                                    type="button"
                                    onClick={handleResendOTP}
                                    disabled={resendTimer > 0 || loading}
                                    className="resend-button"
                                >
                                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend Verification Code"}
                                </button>
                            </div>
                        </div>
                        <button type="submit" disabled={loading} className="action-button">
                            {loading ? "Verifying..." : "Verify & Continue →"}
                        </button>
                    </form>
                )}

                {step === 3 && (
                    <form onSubmit={handleResetPassword} className="forgot-password-form">
                        <div className="form-group">
                            <label className="form-label" htmlFor="newPassword">NEW PASSWORD</label>
                            <input
                                id="newPassword"
                                type="password"
                                required
                                autoFocus
                                className="form-input"
                                placeholder="••••••••"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="confirmPassword">CONFIRM NEW PASSWORD</label>
                            <input
                                id="confirmPassword"
                                type="password"
                                required
                                className="form-input"
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                        <button type="submit" disabled={loading} className="action-button">
                            {loading ? "Resetting..." : "Reset Password →"}
                        </button>
                    </form>
                )}

                {step === 4 && (
                    <div className="success-container">
                        <div className="success-icon-wrapper">
                            <Icon name="check" className="success-icon" />
                        </div>
                        <p className="success-text">
                            Your account is now secured. You can log in with your new password.
                        </p>
                    </div>
                )}

                {step !== 4 && (
                    <button onClick={onBackToLogin} className="back-link">
                        Back to Login
                    </button>
                )}
                {step === 4 && (
                    <button onClick={onBackToLogin} className="action-button">
                        Sign In Now
                    </button>
                )}
            </main>

            <footer className="footer-support">
                <p>Having trouble? <button className="support-button">Contact support</button></p>
            </footer>
        </div>
    );
};

export default ForgotPassword;
