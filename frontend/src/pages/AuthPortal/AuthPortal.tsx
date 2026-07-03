import React from 'react';
import Icon from '../../components/Icon';
import PremiumBackground from '../../components/PremiumBackground';
import finpixeLogo from '../../assets/finpixe with empty bg.png';

/**
 * AUTH PORTAL - ENTRY POINT CHOOSER
 * Upgraded to light indigo theme with subtle number rain.
 */
const AuthPortal: React.FC = () => {
    const handleNavigate = (path: string) => {
        window.history.pushState({}, '', path);
        window.dispatchEvent(new PopStateEvent('popstate'));
    };

    return (
        <PremiumBackground>
            <div className="z-10 w-full max-w-2xl p-6 flex flex-col items-center animate-in fade-in zoom-in-[0.98] duration-700">
                {/* Header Branding */}
                <div className="text-center mb-10">
                    <div className="flex items-center justify-center gap-3 mb-3 scale-90">
                        <div className="w-12 h-12 rounded-[14px] bg-white border border-[#E0E2FF] shadow-[0_12px_28px_rgba(75,60,255,0.1)] flex items-center justify-center overflow-hidden">
                            <img
                                src={finpixeLogo}
                                alt="Finpixe logo"
                                className="w-10 h-10 object-contain drop-shadow-[0_2px_4px_rgba(75,60,255,0.15)]"
                            />
                        </div>
                        <h1 className="text-5xl font-black text-[#1a1a2e] tracking-widest">
                            FINPIXE
                        </h1>
                    </div>
                    <p className="text-[10px] font-black text-[#5a5f9e] uppercase tracking-[0.5em] leading-none">
                        Advanced Accounting
                    </p>
                </div>

                {/* Portal Cards Container */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mb-8">
                    {/* Master Admin Portal */}
                    <button
                        onClick={() => handleNavigate('/master/login')}
                        className="group relative p-[1.5px] rounded-[16px] bg-gradient-to-br from-[#4B3CFF] via-[#7A6CFF] to-[#A5A8FF] hover:translate-y-[-3px] hover:shadow-[0_10px_25px_rgba(0,0,0,0.08),0_0_10px_rgba(75,60,255,0.2)] active:scale-[0.98] focus:outline-none transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.08)]"
                    >
                        <div className="bg-white/90 backdrop-blur-md rounded-[14.5px] p-8 flex flex-col items-center text-center w-full h-full">
                            <div className="w-16 h-16 rounded-2xl bg-[#EEF0FF] flex items-center justify-center mb-6 border border-[#C9CCFF] group-hover:bg-white transition-all duration-300">
                                <Icon name="users" className="w-8 h-8 text-[#4B3CFF]" />
                            </div>
                            <h2 className="text-xl font-black text-[#1a1a2e] tracking-tight mb-2 uppercase">
                                Master Admin
                            </h2>
                            <p className="text-[11px] font-bold text-[#5a5f9e] leading-relaxed max-w-[180px] uppercase tracking-wider">
                                Global Platform Control
                            </p>
                        </div>
                    </button>

                    {/* Client Login Portal */}
                    <button
                        onClick={() => handleNavigate('/login')}
                        className="group relative p-[1.5px] rounded-[16px] bg-gradient-to-br from-[#4B3CFF] via-[#7A6CFF] to-[#A5A8FF] hover:translate-y-[-3px] hover:shadow-[0_10px_25px_rgba(0,0,0,0.08),0_0_10px_rgba(75,60,255,0.2)] active:scale-[0.98] focus:outline-none transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.08)]"
                    >
                        <div className="bg-white/90 backdrop-blur-md rounded-[14.5px] p-8 flex flex-col items-center text-center w-full h-full">
                            <div className="w-16 h-16 rounded-2xl bg-[#EEF0FF] flex items-center justify-center mb-6 border border-[#C9CCFF] group-hover:bg-white transition-all duration-300">
                                <Icon name="ledger" className="w-8 h-8 text-[#4B3CFF]" />
                            </div>
                            <h2 className="text-xl font-black text-[#1a1a2e] tracking-tight mb-2 uppercase">
                                Business Login
                            </h2>
                            <p className="text-[11px] font-bold text-[#5a5f9e] leading-relaxed max-w-[180px] uppercase tracking-wider">
                                Secure Branch Access
                            </p>
                        </div>
                    </button>
                </div>

                <button
                    onClick={() => handleNavigate('/register')}
                    className="group relative w-full p-[1.5px] rounded-[16px] bg-gradient-to-r from-[#4B3CFF] via-[#7A6CFF] to-[#A5A8FF] hover:translate-y-[-3px] hover:shadow-[0_10px_25px_rgba(0,0,0,0.08),0_0_10px_rgba(75,60,255,0.2)] active:scale-[0.98] focus:outline-none transition-all duration-300 shadow-[0_10px_25px_rgba(0,0,0,0.08)]"
                >
                    <div className="bg-white/90 backdrop-blur-md rounded-[14.5px] py-6 px-10 flex flex-col items-center text-center w-full h-full">
                        <span className="text-[9px] font-black text-[#5a5f9e] uppercase tracking-[0.4em] mb-1">
                            New Organization?
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#4B3CFF] uppercase tracking-[0.3em]">
                                Register Platform Account
                            </span>
                            <Icon name="arrow-right" className="w-4 h-4 text-[#4B3CFF] group-hover:translate-x-1 transition-transform" />
                        </div>
                    </div>
                </button>

                {/* Landing Page Link */}
                <button
                    onClick={() => window.location.href = (import.meta as any).env?.VITE_LANDING_URL || 'http://localhost:3000'}
                    className="mt-8 text-[10px] font-black text-[#5a5f9e] uppercase tracking-[0.3em] hover:text-[#4B3CFF] transition-all flex items-center gap-2 group"
                >
                    <Icon name="arrow-left" size={14} className="group-hover:-translate-x-1 transition-transform" />
                    Back to Home
                </button>
            </div>
        </PremiumBackground>
    );
};

export default AuthPortal;
