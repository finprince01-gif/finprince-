/**
 * ============================================================================
 * REGISTRATION PAGE (Register.tsx)
 * ============================================================================
 * Multi-step user registration form - Premium Fintech Redesign
 */

import React, { useState, useEffect } from "react";
import "./Register.css";
import { apiService } from "../../services";

interface SignupPageProps {
  onSwitchToLogin: () => void;
  onBack?: () => void;
}

const SignupPage: React.FC<SignupPageProps> = ({ onSwitchToLogin, onBack }) => {
  // Form state
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<string>('Starter');
  const [step, setStep] = useState<'details' | 'plan'>('details');

  // UI state
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get('plan');
    if (planParam) {
      if (planParam.toLowerCase() === 'free') setSelectedPlan('Free');
      else if (planParam.toLowerCase() === 'starter') setSelectedPlan('Starter');
      else if (planParam.toLowerCase() === 'pro') setSelectedPlan('Pro');
    }
  }, []);

  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !companyName || !email || !phone || !password || !confirmPassword) {
      setError('Please fill in all required fields.');
      return;
    }
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
      const phoneCheck = await apiService.checkPhone(phone);
      if (phoneCheck.exists) {
        setError('Phone number already registered. Please Sign In.');
        setLoading(false);
        return;
      }
      setStep('plan');
      window.scrollTo(0, 0);
    } catch (err: any) {
      setError(err?.message || 'Validation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      const response = await apiService.register({
        username,
        companyName,
        email,
        password,
        phone,
        selectedPlan,
        logoFile
      });

      if ((response as any).access && (response as any).refresh) {
        localStorage.setItem('token', (response as any).access);
        localStorage.setItem('refreshToken', (response as any).refresh);
        if ((response as any).user) {
          const user = (response as any).user;
          localStorage.setItem('user', JSON.stringify(user));
          localStorage.setItem('companyName', user.company_name || companyName);
          localStorage.setItem('userPlan', user.selected_plan || user.selectedPlan || selectedPlan);
          localStorage.setItem('tenantId', user.tenant_id || user.tenantId);
        }
        if ((response as any).permissions) {
          localStorage.setItem('permissions', JSON.stringify((response as any).permissions));
        }
        setSuccessMessage('Registration successful! Redirecting...');
        setTimeout(() => { window.location.href = '/'; }, 1500);
      } else {
        setSuccessMessage('Account created! Redirecting to login...');
        localStorage.setItem('companyName', companyName);
        setTimeout(() => { onSwitchToLogin(); }, 1500);
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) setLogoFile(file);
  };

  const PlanCard: React.FC<{ name: string; price: number; features: string[]; popular?: boolean }> = ({
    name,
    price,
    features,
    popular,
  }) => {
    const isSelected = selectedPlan === name;
    return (
      <div
        onClick={() => setSelectedPlan(name)}
        className={`plan-card ${isSelected ? 'selected' : ''}`}
      >
        {popular && <div className="plan-badge">Most Popular</div>}
        <h3 className="plan-name">{name}</h3>
        <p className="plan-price">
          ₹{price}<span>/month</span>
        </p>
        <ul className="plan-features">
          {features.map((feature, index) => (
            <li key={index} className="plan-feature">
              <svg className="feature-icon h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {feature}
            </li>
          ))}
        </ul>
        <button type="button" className="plan-button">
          {isSelected ? 'Selected' : 'Choose Plan'}
        </button>
      </div>
    );
  };

  return (
    <div className="register-page-container">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
      )}

      {step === 'details' ? (
        <>
          <header className="brand-section">
            <h1 className="brand-heading">FINPIXE</h1>
            <p className="brand-tagline">Smart accounting for modern businesses.</p>
          </header>

          <main className="register-card">
            <form onSubmit={handleNext} className="register-form">
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="companyName">COMPANY NAME</label>
                <input id="companyName" type="text" required className="form-input" placeholder="Your Company Inc." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="email">EMAIL ADDRESS</label>
                <input id="email" type="email" required className="form-input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="phone">PHONE NUMBER</label>
                <input id="phone" type="tel" required className="form-input" placeholder="+1 234 567 890" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="username">USERNAME</label>
                <input id="username" type="text" required className="form-input" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">PASSWORD</label>
                <div className="input-with-icon">
                  <input id="password" type={showPassword ? 'text' : 'password'} required className="form-input" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="input-icon-button" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="confirmPassword">CONFIRM PASSWORD</label>
                <div className="input-with-icon">
                  <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required className="form-input" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <button type="button" className="input-icon-button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    {showConfirmPassword ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                    ) : (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">LOGO (OPTIONAL)</label>
                <label htmlFor="logo-upload" className="logo-upload-container">
                  <svg className="upload-icon mx-auto" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="upload-text">
                    <span className="upload-link">Upload logo</span> or drag and drop
                  </p>
                  {logoFile && <p className="text-xs text-indigo-600 mt-2">Selected: {logoFile.name}</p>}
                  <input id="logo-upload" type="file" className="sr-only" accept="image/*" onChange={handleLogoUpload} />
                </label>
              </div>

              <button type="submit" disabled={loading} className="register-button">
                {loading ? 'Verifying...' : 'Continue to Plans →'}
              </button>
            </form>
            <footer className="register-footer">
              <p className="footer-text">Already have an account? <button onClick={onSwitchToLogin} className="login-link">Sign In</button></p>
            </footer>
          </main>
        </>
      ) : (
        <>
          <header className="brand-section">
            <h1 className="brand-heading">FINPIXE</h1>
            <p className="brand-tagline">Choose the plan that fits your business.</p>
          </header>

          <main className="register-card plan-step">
            <div className="plans-grid">
              <PlanCard name="Free" price={0} features={['Up to 5 invoices per month', 'Basic AI assistance', 'Email support', 'Standard templates']} />
              <PlanCard name="Starter" price={1200} features={['Up to 100 invoices per month', 'Advanced AI processing', 'Priority email support', 'Custom templates', 'Basic reporting']} popular />
              <PlanCard name="Pro" price={5000} features={['Unlimited invoices', 'Premium AI features', 'Phone & email support', 'Advanced reporting', 'API access', 'Multi-user access']} />
            </div>

            <div className="text-center max-w-sm mx-auto">
              {error && <div className="error-message">{error}</div>}
              {successMessage && <div className="success-message">{successMessage}</div>}
              <button
                onClick={handleRegister}
                disabled={loading}
                className="register-button"
                style={{ height: '60px', fontSize: '18px' }}
              >
                {loading ? 'Creating Account...' : 'Complete Registration →'}
              </button>
              <button
                className="login-link mt-6"
                onClick={() => setStep('details')}
                style={{ fontSize: '14px' }}
              >
                ← Back to details
              </button>
            </div>
          </main>
        </>
      )}
    </div>
  );
};

export default SignupPage;
