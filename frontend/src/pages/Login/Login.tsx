import React, { useState } from 'react';
import { apiService } from '../../services';
import PremiumBackground from '../../components/PremiumBackground';
import Icon from '../../components/Icon';

interface LoginPageProps {
    onLogin: (payload: any) => void;
    onSwitchToSignup: () => void;
    onForgotPassword: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onSwitchToSignup, onForgotPassword }) => {
    const [branchEmail, setBranchEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [fieldErrors, setFieldErrors] = useState<{ email?: string; username?: string; password?: string }>({});
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const validate = () => {
        const errors: { email?: string; username?: string; password?: string } = {};
        if (!branchEmail) errors.email = 'Branch email is required.';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(branchEmail)) errors.email = 'Enter a valid email address.';
        if (!username) errors.username = 'Username is required.';
        if (!password) errors.password = 'Password is required.';
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!validate()) return;

        setLoading(true);
        try {
            const data = await apiService.login(branchEmail, username, password);
            if (!data) throw new Error('Invalid response.');

            if (data.user?.tenant_id || data.user?.tenantId) {
                const tid = data.user.tenant_id ?? data.user.tenantId;
                sessionStorage.setItem('tenantId', tid);
            }
            if (data.user?.company_name) {
                sessionStorage.setItem('companyName', data.user.company_name);
            }

            onLogin(data);
        } catch (err: any) {
            const errorData = err?.data || err?.response?.data || err;
            const msg = errorData?.message || errorData?.detail || err?.message || 'Authentication failed.';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleBackToPortal = () => {
        window.history.pushState({}, '', '/auth');
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    const handleEnter = (e: React.KeyboardEvent, nextId: string) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById(nextId)?.focus();
        }
    };

    const inputClass = (hasError?: string) =>
        `w-full h-[42px] bg-white border rounded-xl px-3.5 text-xs font-bold text-slate-900 placeholder:text-slate-300 focus:outline-none transition-all ${
            hasError
                ? 'border-rose-400 focus:border-rose-500 bg-rose-50/30'
                : 'border-[#C9CCFF]/40 focus:border-[#4B3CFF]/50'
        }`;

    return (
        <PremiumBackground>
            <div className="z-10 w-full max-w-[440px] flex flex-col items-center animate-in fade-in zoom-in-[0.98] duration-700">

                {/* Compact Brand Header */}
                <div className="text-center mb-6 w-full flex flex-col items-center">
                    <div className="flex items-center justify-center gap-2.5 mb-2.5 scale-[0.9]">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#4B3CFF] to-[#6A5CFF] flex items-center justify-center shadow-lg relative overflow-hidden">
                            <div className="w-6 h-6 rounded-lg bg-white/20 animate-pulse"></div>
                        </div>
                        <h1 className="text-4xl font-black text-[#1a1a2e] tracking-widest">
                            FINPIXE
                        </h1>
                    </div>
                    <p className="text-[9px] font-black text-[#5a5f9e] uppercase tracking-[0.4em] leading-none">
                        Advanced Accounting
                    </p>
                </div>

                {/* Login Card */}
                <div className="w-full p-[1.5px] rounded-[16px] bg-gradient-to-br from-[#4B3CFF] via-[#7A6CFF] to-[#A5A8FF] shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
                    <div className="bg-white/90 backdrop-blur-md rounded-[14.5px] p-7 w-full flex flex-col items-start">
                        {/* Domain badge */}
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-lg mb-5 w-fit">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                            <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">
                                Business Portal Access
                            </span>
                        </div>

                        <form className="w-full space-y-4 text-left" onSubmit={handleLogin} noValidate>
                            {error && (
                                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[10px] font-bold animate-in slide-in-from-top-2 flex items-center gap-2">
                                    <Icon name="x" size={12} />
                                    {error}
                                </div>
                            )}

                            {/* Branch Email */}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5" htmlFor="branchEmail">
                                    BRANCH EMAIL
                                </label>
                                <input
                                    id="branchEmail"
                                    type="email"
                                    className={inputClass(fieldErrors.email)}
                                    placeholder="branch@company.com"
                                    value={branchEmail}
                                    onChange={e => { setBranchEmail(e.target.value); setFieldErrors(p => ({ ...p, email: undefined })); }}
                                    onKeyDown={(e) => handleEnter(e, 'username')}
                                    autoFocus
                                />
                                {fieldErrors.email && (
                                    <p className="text-[9px] text-rose-500 font-bold ml-0.5">{fieldErrors.email}</p>
                                )}
                            </div>

                            {/* Username */}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5" htmlFor="username">
                                    USERNAME
                                </label>
                                <input
                                    id="username"
                                    type="text"
                                    className={inputClass(fieldErrors.username)}
                                    placeholder="Username"
                                    value={username}
                                    onChange={e => { setUsername(e.target.value); setFieldErrors(p => ({ ...p, username: undefined })); }}
                                    onKeyDown={(e) => handleEnter(e, 'password')}
                                />
                                {fieldErrors.username && (
                                    <p className="text-[9px] text-rose-500 font-bold ml-0.5">{fieldErrors.username}</p>
                                )}
                            </div>

                            {/* Password */}
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-0.5" htmlFor="password">
                                    PASSWORD
                                </label>
                                <div className="relative">
                                    <input
                                        id="password"
                                        type={showPassword ? 'text' : 'password'}
                                        className={inputClass(fieldErrors.password) + ' pr-10'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => { setPassword(e.target.value); setFieldErrors(p => ({ ...p, password: undefined })); }}
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-[#4B3CFF] transition-colors"
                                        onClick={() => setShowPassword(!showPassword)}
                                    >
                                        <Icon name={showPassword ? "eye-off" : "eye"} className="w-4 h-4" />
                                    </button>
                                </div>
                                {fieldErrors.password && (
                                    <p className="text-[9px] text-rose-500 font-bold ml-0.5">{fieldErrors.password}</p>
                                )}
                            </div>

                            <div className="pt-1">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-[46px] bg-[#4B3CFF] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#3d31d4] hover:scale-[1.01] active:scale-[0.98] transition-all shadow-lg shadow-indigo-100 disabled:opacity-50"
                                >
                                    {loading ? 'Authenticating...' : 'Sign In Now'}
                                </button>
                            </div>
                        </form>

                        <footer className="w-full pt-1 mt-1 text-center space-y-2">
                            <button
                                onClick={handleBackToPortal}
                                className="w-full py-3 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] hover:bg-slate-100 hover:text-[#4B3CFF] transition-all flex items-center justify-center gap-2"
                            >
                                <Icon name="arrow-left" size={14} />
                                Back to Portal Selection
                            </button>

                            <button
                                onClick={() => window.location.href = (import.meta as any).env?.VITE_LANDING_URL || 'http://localhost:3000'}
                                className="w-full py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-[#4B3CFF] transition-all flex items-center justify-center gap-2"
                            >
                                <Icon name="link" size={12} />
                                Return to Main Website
                            </button>
                        </footer>
                    </div>
                </div>
            </div>
        </PremiumBackground>
    );
};

export default LoginPage;
