import React, { useState } from 'react';
import { apiService } from '../../services';
import PremiumBackground from '../../components/PremiumBackground';
import Icon from '../../components/Icon';
import finpixeLogo from '../../assets/finpixe with empty bg.png';

interface MasterLoginPageProps {
    /** Called on successful authentication — passes the API response */
    onLogin: (data: any) => void;
}

const MasterLoginPage: React.FC<MasterLoginPageProps> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [view, setView] = useState<'login' | 'forgot' | 'otp' | 'reset_password' | 'success'>('login');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (view === 'forgot') {
            if (!email.trim()) {
                setError('Email is required to reset password.');
                return;
            }
            setLoading(true);
            try {
                await apiService.masterRequestResetOTP(email);
                setView('otp');
            } catch (err: any) {
                setError(err?.response?.data?.message || err?.message || 'Failed to send OTP.');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (view === 'otp') {
            if (!otp.trim()) {
                setError('OTP is required.');
                return;
            }
            setLoading(true);
            try {
                await apiService.masterVerifyOTPOnly(email, otp);
                setView('reset_password');
            } catch (err: any) {
                setError(err?.response?.data?.message || err?.message || 'Invalid OTP.');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (view === 'reset_password') {
            if (!newPassword) {
                setError('New password is required.');
                return;
            }
            setLoading(true);
            try {
                await apiService.masterResetPassword({ email, otp, new_password: newPassword });
                setView('success');
            } catch (err: any) {
                setError(err?.response?.data?.message || err?.message || 'Failed to update password.');
            } finally {
                setLoading(false);
            }
            return;
        }

        if (!email.trim() || !username.trim() || !password) {
            setError('All fields are required.');
            return;
        }

        setLoading(true);
        try {
            const data = await apiService.masterLogin(email, username, password);
            if (!data) throw new Error('Invalid response from server.');
            onLogin(data);
        } catch (err: any) {
            const errorData = err?.data || err?.response?.data || err;
            const msg = errorData?.message || errorData?.detail || err?.message || 'Authentication failed.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const handleEnter = (e: React.KeyboardEvent, nextId: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById(nextId)?.focus();
        }
    };

    return (
        <PremiumBackground>
            <div className="z-10 w-full max-w-[440px] flex flex-col items-center animate-in fade-in zoom-in-[0.98] duration-700">
                
                {/* Compact Brand Header */}
                <div className="text-center mb-6 w-full flex flex-col items-center">
                    <div className="flex items-center justify-center gap-2.5 mb-2.5 scale-[0.9]">
                        <div className="w-12 h-12 rounded-[14px] bg-white border border-[#E0E2FF] shadow-[0_12px_28px_rgba(75,60,255,0.1)] flex items-center justify-center overflow-hidden">
                            <img
                                src={finpixeLogo}
                                alt="Finpixe logo"
                                className="w-10 h-10 object-contain drop-shadow-[0_2px_4px_rgba(75,60,255,0.15)]"
                            />
                        </div>
                        <h1 className="text-4xl font-black text-[#1a1a2e] tracking-widest">
                            FINPIXE
                        </h1>
                    </div>
                    <p className="text-[9px] font-black text-[#5a5f9e] uppercase tracking-[0.4em] leading-none">
                        Advanced Accounting
                    </p>
                </div>

                {/* Compact Master Login Card */}
                <div className="w-full p-[1.5px] rounded-[16px] bg-[#4B3CFF] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                    <div className="bg-white/95 backdrop-blur-md rounded-[14.5px] p-7 w-full flex flex-col items-start transition-all duration-300">
                        {/* Domain badge */}
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg mb-5 w-fit">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#4B3CFF] animate-pulse" />
                            <span className="text-[8px] font-black text-[#4B3CFF] uppercase tracking-widest">
                                {view === 'login' ? 'Master Admin Control' : 'Account Recovery'}
                            </span>
                        </div>

                        {view === 'success' ? (
                            <div className="w-full text-center space-y-4 py-4 animate-in fade-in slide-in-from-bottom-2">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Icon name="check-circle" size={24} />
                                </div>
                                <h3 className="text-sm font-black text-slate-900 tracking-widest uppercase">Password Reset</h3>
                                <p className="text-xs font-semibold text-slate-500">
                                    Your password has been successfully reset!
                                </p>
                                <button
                                    type="button"
                                    onClick={() => { setView('login'); setPassword(''); setNewPassword(''); setOtp(''); }}
                                    className="mt-6 w-full h-[46px] bg-slate-100 text-[#4B3CFF] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                                >
                                    Back to Login
                                </button>
                            </div>
                        ) : (
                            <form className="w-full space-y-4 text-left animate-in fade-in" onSubmit={handleSubmit}>
                                {error && (
                                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-bold animate-in slide-in-from-top-2">
                                        {error}
                                    </div>
                                )}

                                {view === 'otp' && (
                                    <>
                                        <div className="text-center mb-6">
                                            <div className="w-12 h-12 bg-indigo-100 text-[#4B3CFF] rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Icon name="key" size={24} />
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest">
                                                OTP sent to {email}
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest" htmlFor="otp">
                                                6-DIGIT OTP
                                            </label>
                                            <input
                                                id="otp"
                                                type="text"
                                                maxLength={6}
                                                className="w-full h-[42px] bg-white border border-slate-200 rounded-xl px-3.5 text-center tracking-[0.5em] text-lg font-black text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#4B3CFF] transition-all"
                                                placeholder="••••••"
                                                value={otp}
                                                onChange={e => setOtp(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </>
                                )}

                                {view === 'reset_password' && (
                                    <>
                                        <div className="text-center mb-6">
                                            <div className="w-12 h-12 bg-indigo-100 text-[#4B3CFF] rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Icon name="key" size={24} />
                                            </div>
                                            <h2 className="text-lg font-black text-slate-800 tracking-tight">NEW PASSWORD</h2>
                                            <p className="text-[10px] font-bold text-slate-500 mt-2 uppercase tracking-widest">
                                                Create your new secure password
                                            </p>
                                        </div>

                                        <div className="space-y-1 mt-4">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest" htmlFor="new-password">
                                                NEW PASSWORD
                                            </label>
                                            <div className="relative">
                                                <input
                                                    id="new-password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    className="w-full h-[42px] bg-white border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#4B3CFF] transition-all pr-10"
                                                    placeholder="••••••••"
                                                    value={newPassword}
                                                    onChange={e => setNewPassword(e.target.value)}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#4B3CFF] transition-colors"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                >
                                                    <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {(view === 'login' || view === 'forgot') && (
                                    <>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5" htmlFor="master-email">
                                                ADMIN EMAIL
                                            </label>
                                            <input
                                        id="master-email"
                                        type="email"
                                        className="w-full h-[42px] bg-white border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#4B3CFF] transition-all"
                                        placeholder="admin@platform.com"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        onKeyDown={(e) => handleEnter(e, 'master-username')}
                                        required
                                    />
                                </div>

                                {view === 'login' && (
                                    <>
                                        <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5" htmlFor="master-username">
                                                USERNAME
                                            </label>
                                            <input
                                                id="master-username"
                                                type="text"
                                                className="w-full h-[42px] bg-white border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#4B3CFF] transition-all"
                                                placeholder="master_root"
                                                value={username}
                                                onChange={e => setUsername(e.target.value)}
                                                onKeyDown={(e) => handleEnter(e, 'master-password')}
                                                required
                                            />
                                        </div>

                                        <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                                            <div className="flex justify-between items-center ml-0.5">
                                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest" htmlFor="master-password">
                                                    PASSWORD
                                                </label>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setView('forgot')}
                                                    className="text-[8px] font-bold text-[#4B3CFF] uppercase tracking-widest hover:underline"
                                                >
                                                    Forgot?
                                                </button>
                                            </div>
                                            <div className="relative">
                                                <input
                                                    id="master-password"
                                                    type={showPassword ? 'text' : 'password'}
                                                    className="w-full h-[42px] bg-white border border-slate-200 rounded-xl px-3.5 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-[#4B3CFF] transition-all pr-10"
                                                    placeholder="••••••••"
                                                    value={password}
                                                    onChange={e => setPassword(e.target.value)}
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#4B3CFF] transition-colors"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                >
                                                    <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                                    </>
                                )}

                                <div className="pt-2">
                                    <button
                                        type="submit"
                                        disabled={loading || !email.trim() || (view === 'login' && (!username.trim() || !password)) || (view === 'otp' && !otp.trim()) || (view === 'reset_password' && !newPassword)}
                                        className="w-full h-[46px] bg-[#4B3CFF] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#3d31d4] transition-all shadow-[0_8px_16px_rgba(75,60,255,0.25)] disabled:opacity-50"
                                    >
                                        {loading ? 'Processing...' : view === 'login' ? 'Enter Admin Console' : view === 'otp' ? 'Validate OTP' : view === 'reset_password' ? 'Update Password' : 'Request OTP'}
                                    </button>
                                </div>
                                
                                {view === 'forgot' && (
                                    <button 
                                        type="button"
                                        onClick={() => setView('login')}
                                        className="w-full text-center mt-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-[#4B3CFF] transition-colors"
                                    >
                                        Return to Login
                                    </button>
                                )}
                                {view === 'otp' && (
                                    <button 
                                        type="button"
                                        onClick={() => setView('forgot')}
                                        className="w-full text-center mt-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-[#4B3CFF] transition-colors"
                                    >
                                        Cancel & Go Back
                                    </button>
                                )}
                            </form>
                        )}

                        <footer className="w-full pt-1 mt-3 border-t border-slate-100">
                            <button 
                                onClick={() => handleNavigate('/auth')} 
                                className="w-full py-3 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hover:bg-slate-100 hover:text-[#4B3CFF] transition-all flex items-center justify-center gap-2 mt-2"
                            >
                                <Icon name="arrow-left" size={14} />
                                Back to Portal Selection
                            </button>
                        </footer>
                    </div>
                </div>

                <p className="mt-8 text-center text-slate-400 text-[8px] font-black uppercase tracking-widest opacity-30">
                    Authorized Personnel Only — Access is Monitored.
                </p>
            </div>
        </PremiumBackground>
    );
};

export default MasterLoginPage;
