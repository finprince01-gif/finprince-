import React, { useState, useEffect, useMemo } from "react";
import "./Register.css";
import { apiService } from "../../services";
import PremiumBackground from "../../components/PremiumBackground";
import Icon from "../../components/Icon";
import finpixeLogo from "../../assets/finpixe with empty bg.png";

interface SignupPageProps {
  onSwitchToLogin: () => void;
  onBack?: () => void;
}

const SignupPage: React.FC<SignupPageProps> = ({ onSwitchToLogin, onBack }) => {
  // Step state: 1: Administrative, 2: Regional, 3: Platform Access
  const [step, setStep] = useState(1);
  
  // Geograhpical Data logic
  const [geoData, setGeoData] = useState<any[]>([]);
  
  // Form state - Step 1
  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [phone, setPhone] = useState('');

  // Form state - Step 2
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [addressLine3, setAddressLine3] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [selectedState, setSelectedState] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [pincode, setPincode] = useState('');

  // Form state - Step 3
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchGeoData();
  }, []);

  const fetchGeoData = async () => {
    try {
      const resp = await fetch('/data/geo.json');
      const data = await resp.json();
      setGeoData(data);
    } catch (err) {
      console.error("Failed to fetch geo data", err);
    }
  };

  const validateStep = () => {
    setError('');
    if (step === 1) {
      if (!name || !pan) {
        setError('Please complete all identification fields.');
        return false;
      }
      if (pan.length !== 10) {
        setError('Invalid PAN number. Must be 10 characters.');
        return false;
      }
      if (phone && (phone.length !== 10 || !/^\d+$/.test(phone))) {
        setError('Contact Phone must be 10 digits.');
        return false;
      }
    } else if (step === 2) {
      if (!addressLine1 || !selectedState || !selectedDistrict || !pincode) {
        setError('Please complete the regional context fields.');
        return false;
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep()) setStep(prev => prev + 1);
  };

  const prevStep = () => {
    setError('');
    setStep(prev => prev - 1);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name,
        pan_number: pan,
        username,
        email,
        phone,
        address_line1: addressLine1,
        address_line2: addressLine2,
        address_line3: addressLine3,
        country: selectedCountry,
        state: selectedState,
        district: selectedDistrict,
        pincode: pincode,
        password
      };

      const response = await apiService.masterRegister(payload);

      if (response.access && response.refresh) {
        setSuccessMessage('Master Admin account created successfully! Accessing platform...');
        setTimeout(() => { 
          window.location.href = '/master/dashboard'; 
        }, 1500);
      } else {
        setSuccessMessage('Account created! Redirecting to login...');
        setTimeout(() => { onSwitchToLogin(); }, 1500);
      }
    } catch (err: any) {
      console.error('Registration failed:', err);
      setError(err?.message || 'Registration failed. Credentials may already exist.');
    } finally {
      setLoading(false);
    }
  };

  const currentCountry = geoData.find(c => c.name === selectedCountry);
  const currentState = currentCountry?.states.find((s: any) => s.name === selectedState);
  const districtOptions = currentState?.districts || [];
  

  const StepIndicator = () => (
    <div className="flex items-center gap-10 mb-12 relative overflow-hidden">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex flex-col items-center gap-2 relative z-10 transition-all duration-500">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shadow-lg transition-all duration-500 border-2 ${step >= s ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-indigo-200' : 'bg-white border-slate-200 text-slate-400'}`}>
            {step > s ? <Icon name="check" size={14} /> : s}
          </div>
          <span className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-500 ${step >= s ? 'text-indigo-600' : 'text-slate-400'}`}>
            {s === 1 ? 'Identity' : s === 2 ? 'Regional' : 'Access'}
          </span>
        </div>
      ))}
      <div className="absolute top-5 left-8 right-8 h-[2px] bg-slate-100 -z-0">
        <div className="h-full bg-indigo-600 transition-all duration-700" style={{ width: `${(step - 1) * 50}%` }} />
      </div>
    </div>
  );

  const handleEnter = (e: React.KeyboardEvent, nextId?: string, isStepFinal?: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (nextId) {
        document.getElementById(nextId)?.focus();
      } else if (isStepFinal) {
        if (step < 3) {
          nextStep();
        } else {
          // Final step - handleRegister is called by form submission usually, 
          // but we can trigger it or focus the submit button.
          // For consistency with wizard flow:
          const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement;
          submitBtn?.click();
        }
      }
    }
  };

  return (
    <PremiumBackground>
      <div className="z-10 w-full max-w-4xl flex flex-col items-center animate-in fade-in zoom-in-[0.98] duration-700 py-10 px-4">
        
        {/* Brand Header */}
        <div className="text-center mb-10 w-full flex flex-col items-center">
            <div className="flex items-center justify-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shadow-2xl overflow-hidden">
                    <img
                        src={finpixeLogo}
                        alt="Finpixe logo"
                        className="w-12 h-12 object-contain drop-shadow-[0_2px_4px_rgba(79,70,229,0.15)]"
                    />
                </div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tighter">
                    FINPIXE <span className="text-indigo-600">MASTER</span>
                </h1>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.5em] leading-none">
                Platform Administrative Architecture Registration
            </p>
        </div>

        <div className="w-full bg-white/95 backdrop-blur-xl rounded-[40px] shadow-[0_22px_70px_rgba(0,0,0,0.1)] border border-white overflow-hidden flex flex-col items-center p-12">
          
          <StepIndicator />

          <div className="w-full max-w-2xl">
            <div className="flex flex-col items-center text-center mb-10">
              <h2 className="text-3xl font-black text-slate-900 m-0 leading-tight">
                {step === 1 ? 'Verify Your Identity' : step === 2 ? 'Define Regional Context' : 'Secure Your Access'}
              </h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mt-3">
                {step === 1 ? 'Basic administrative credentials to begin initialization' : 
                 step === 2 ? 'Global location and HQ specifications for local compliance' : 
                 'Finalize platform security and login credentials'}
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-8 min-h-[400px]">
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-xs font-bold flex items-center gap-3 animate-headshake">
                   <Icon name="x" size={16} /> {error}
                </div>
              )}
              {successMessage && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl text-emerald-600 text-xs font-bold flex items-center gap-3">
                   <Icon name="check" size={16} /> {successMessage}
                </div>
              )}

              {/* STEP 1: IDENTITY */}
              {step === 1 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="space-y-6 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1" htmlFor="name">Full Legal Name</label>
                      <input id="name" type="text" autoFocus required className="reg-input-v2 h-14" placeholder="e.g. Johnathan Doe" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => handleEnter(e, 'pan')} />
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1" htmlFor="pan">PAN Number</label>
                        <input id="pan" type="text" required className="reg-input-v2 h-14" placeholder="10-digit PAN" value={pan} onChange={e => setPan(e.target.value.toUpperCase())} maxLength={10} onKeyDown={e => handleEnter(e, 'phone')} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1" htmlFor="phone">Contact Phone</label>
                        <input id="phone" type="tel" className="reg-input-v2 h-14" placeholder="Phone Number" value={phone} onChange={e => setPhone(e.target.value)} onKeyDown={e => handleEnter(e, undefined, true)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: REGIONAL */}
              {step === 2 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="space-y-6 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                    <div className="space-y-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Address Line 1 <span className="text-rose-500">*</span></label>
                        <input id="addr1" type="text" autoFocus required className="reg-input-v2 h-14" placeholder="Enter address line 1" value={addressLine1} onChange={e => setAddressLine1(e.target.value)} onKeyDown={e => handleEnter(e, 'addr2')} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Address Line 2</label>
                        <input id="addr2" type="text" className="reg-input-v2 h-14" placeholder="Enter address line 2" value={addressLine2} onChange={e => setAddressLine2(e.target.value)} onKeyDown={e => handleEnter(e, 'addr3')} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Address Line 3</label>
                        <input id="addr3" type="text" className="reg-input-v2 h-14" placeholder="Enter address line 3" value={addressLine3} onChange={e => setAddressLine3(e.target.value)} onKeyDown={e => handleEnter(e, 'pincode')} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Country</label>
                        <select id="country" className="reg-input-v2 h-14" value={selectedCountry} onChange={e => { setSelectedCountry(e.target.value); setSelectedState(''); setSelectedDistrict(''); }} onKeyDown={e => handleEnter(e, 'state')}>
                          {geoData.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">State / Province</label>
                        <select id="state" className="reg-input-v2 h-14" value={selectedState} onChange={e => { setSelectedState(e.target.value); setSelectedDistrict(''); }} onKeyDown={e => handleEnter(e, 'district')} required>
                          <option value="">Select State</option>
                          {currentCountry?.states.map((s: any) => <option key={s.name} value={s.name}>{s.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">District</label>
                        <select 
                          id="district"
                          className="reg-input-v2 h-14" 
                          value={selectedDistrict} 
                          onChange={e => setSelectedDistrict(e.target.value)} 
                          onKeyDown={e => handleEnter(e, 'pincode')}
                          disabled={!selectedState} 
                          required
                        >
                          <option value="">Select District</option>
                          {districtOptions.map((d: string) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Pincode / ZIP</label>
                        <input id="pincode" type="text" required className="reg-input-v2 h-14" placeholder="e.g. 400001" value={pincode} onChange={e => setPincode(e.target.value)} onKeyDown={e => handleEnter(e, undefined, true)} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: ACCESS */}
              {step === 3 && (
                <div className="space-y-8 animate-in slide-in-from-right-4 duration-500">
                  <div className="space-y-6 bg-slate-50/50 p-8 rounded-[32px] border border-slate-100">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">System Username</label>
                        <input id="username" type="text" autoFocus required className="reg-input-v2 h-14" placeholder="Unique admin ID" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => handleEnter(e, 'email')} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Email</label>
                        <input id="email" type="email" required className="reg-input-v2 h-14" placeholder="admin@finpixe.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => handleEnter(e, 'pwd')} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Global Password</label>
                        <div className="relative">
                          <input id="pwd" type={showPassword ? 'text' : 'password'} required className="reg-input-v2 h-14 pr-10" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => handleEnter(e, 'pwd2')} />
                          <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-600 transition-colors" onClick={() => setShowPassword(!showPassword)}>
                            <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Confirm Password</label>
                        <div className="relative">
                          <input id="pwd2" type={showConfirmPassword ? 'text' : 'password'} required className="reg-input-v2 h-14 pr-10" placeholder="••••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => handleEnter(e, undefined, true)} />
                          <button type="button" className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-indigo-600 transition-colors" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                            <Icon name={showConfirmPassword ? 'eye-off' : 'eye'} size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 rounded-[24px] bg-indigo-50/50 border border-indigo-100 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-lg shadow-sm">🔒</div>
                    <p className="text-[10px] font-medium text-slate-500 leading-relaxed max-w-sm">Your master admin account holds global authority. Ensure your password is stored securely and MFA is enabled after initialization.</p>
                  </div>
                </div>
              )}

              <div className="pt-6 flex items-center gap-4">
                {step > 1 && (
                  <button type="button" onClick={prevStep} className="flex-1 h-16 bg-slate-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-100 flex items-center justify-center gap-2">
                    <Icon name="arrow-left" size={12} /> Previous Step
                  </button>
                )}
                
                {step < 3 ? (
                  <button type="button" onClick={nextStep} className="flex-[2] h-16 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2">
                    Continue to {step === 1 ? 'Regional Settings' : 'Access Control'}
                    <Icon name="arrow-right" size={12} />
                  </button>
                ) : (
                  <button type="submit" disabled={loading} className="flex-[2] h-16 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-3">
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Initializing Master...
                      </>
                    ) : (
                      <>
                        Finalize Platform Initialization
                        <Icon name="check" size={14} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>

          <footer className="mt-12 pt-8 border-t border-slate-100 w-full flex flex-col items-center gap-4">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Already registered? <button onClick={() => { window.location.href = '/master/login'; }} className="text-indigo-600 ml-1 hover:underline font-black">Sign In to Dashboard</button>
              </p>
              
              <button
                  onClick={() => window.location.href = (import.meta as any).env?.VITE_LANDING_URL || 'http://localhost:3000'}
                  className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] hover:text-indigo-600 transition-all flex items-center gap-2"
              >
                  <Icon name="link" size={12} />
                  Return to Main Website
              </button>
          </footer>
        </div>
      </div>
    </PremiumBackground>
  );
};

export default SignupPage;

