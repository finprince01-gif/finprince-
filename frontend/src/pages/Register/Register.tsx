/**
 * ============================================================================
 * REGISTRATION PAGE (Register.tsx)
 * ============================================================================
 * Multi-step user registration form for creating new accounts.
 * 
 * REGISTRATION FLOW:
 * Step 1: Business Details
 * - Company name, email, phone
 * - Username and password
 * - Optional logo upload
 * 
 * Step 2: Plan Selection
 * - Choose subscription plan (Free, Starter, Pro)
 * - Complete registration
 * - Auto-login after successful registration
 * 
 * FEATURES:
 * - Two-step registration process
 * - Form validation (password strength, matching passwords)
 * - Logo file upload
 * - Plan selection with visual cards
 * - URL parameter support for pre-selecting plans (?plan=starter)
 * - Auto-login after registration (JWT tokens)
 * - Fallback to manual login if auto-login fails
 * 
 * AUTHENTICATION:
 * - Creates user account via backend API
 * - Receives JWT tokens (access + refresh)
 * - Saves tokens to localStorage
 * - Redirects to dashboard on success
 * 
 * FOR NEW DEVELOPERS:
 * - handleNext() validates Step 1 and moves to Step 2
 * - handleRegister() submits registration and creates account
 * - PlanCard component renders each subscription plan
 * - Uses controlled components (state manages all inputs)
 */

// Import React and hooks
import React, { useState, useEffect } from "react";

// Import Icon component for UI icons
import Icon from "../../components/Icon";

// Import API service for registration
import { apiService } from "../../services";

// Import ModulePicker component (not currently used in this file)


/**
 * Props for SignupPage component
 */
interface SignupPageProps {
  onSwitchToLogin: () => void;  // Callback to switch to login page
  onBack?: () => void;          // Optional callback for back button (to landing page)
}

/**
 * SignupPage Component - Multi-step registration form
 */
const SignupPage: React.FC<SignupPageProps> = ({ onSwitchToLogin, onBack }) => {
  // ============================================================================
  // FORM STATE - User input values
  // ============================================================================
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

  // ============================================================================
  // URL PARAMETER HANDLING - Pre-select plan from URL
  // ============================================================================
  // Example: /register?plan=pro will pre-select the Pro plan
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const planParam = params.get('plan');
    if (planParam) {
      // Normalize plan names to match component's expected values
      if (planParam.toLowerCase() === 'free') setSelectedPlan('Free');
      else if (planParam.toLowerCase() === 'starter') setSelectedPlan('Starter');
      else if (planParam.toLowerCase() === 'pro') setSelectedPlan('Pro');
    }
  }, []);

  // ============================================================================
  // STEP STATE - Multi-step form navigation
  // ============================================================================
  const [step, setStep] = useState<'details' | 'plan'>('details');

  // ============================================================================
  // UI STATE - Error messages, loading, success
  // ============================================================================
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
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
    setError('');
    setStep('plan');
    window.scrollTo(0, 0);
  };

  const handleRegister = async () => {
    setError('');
    setSuccessMessage('');
    setLoading(true);

    try {
      // Register user - backend now creates account directly and returns tokens
      const response = await apiService.register({
        username,
        companyName,
        email,
        password,
        phone,
        selectedPlan,
        logoFile
      });

      console.log('Registration response:', response);

      // Check if response includes JWT tokens (auto-login)
      if ((response as any).access && (response as any).refresh) {
        // Auto-login successful - save tokens
        localStorage.setItem('token', (response as any).access);
        localStorage.setItem('refreshToken', (response as any).refresh);

        // Save user data
        if ((response as any).user) {
          localStorage.setItem('user', JSON.stringify((response as any).user));
          localStorage.setItem('companyName', (response as any).user.company_name || companyName);
        }

        // Save permissions
        if ((response as any).permissions) {
          localStorage.setItem('permissions', JSON.stringify((response as any).permissions));
        }

        setSuccessMessage('Registration successful! Redirecting to dashboard...');

        // Redirect to dashboard
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        // Fallback: redirect to login if no tokens
        setSuccessMessage('Account created! Redirecting to login...');
        localStorage.setItem('companyName', companyName);
        setTimeout(() => {
          onSwitchToLogin();
        }, 1500);
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file) {
      setLogoFile(file);
    }
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
        className={`relative p-6 bg-white border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 cursor-pointer transition-all duration-300 hover:shadow-none border border-slate-200-none border border-slate-200 ${isSelected ? 'border-indigo-500 ring-2 ring-indigo-200' : 'hover:border-gray-300'
          }`}
      >
        {popular && (
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-3 py-1 text-xs font-semibold text-white bg-indigo-50/500 rounded-[4px]">
            Most Popular
          </div>
        )}
        <div className="text-center">
          <h3 className="text-xl font-semibold text-gray-900">{name}</h3>
          <p className="mt-4 text-4xl font-bold text-gray-900">
            ₹{price}
            <span className="text-base font-normal text-gray-500">/month</span>
          </p>
        </div>
        <ul className="mt-6 space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <svg className="w-5 h-5 text-indigo-500 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-sm text-gray-600">{feature}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={`mt-6 w-full py-3 px-4 rounded-[4px] font-semibold text-sm transition-colors duration-200 ${isSelected ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
            }`}
        >
          {isSelected ? 'Selected' : 'Choose Plan'}
        </button>
      </div>
    );
  };

  // Step 1: Details
  if (step === 'details') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative bg-white">
        {onBack && (
          <div className="absolute left-4 bottom-4">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded"
              onClick={onBack}
            >
              Back
            </button>
          </div>
        )}

        {/* Header */}
        <div className="bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 w-full text-center">
          <div className="max-w-md mx-auto">
            <h1 className="text-4xl font-bold text-indigo-600 mb-2">AI-Accounting</h1>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Registration - Step 1/2</h2>
            <p className="text-gray-600">Enter your business details</p>
          </div>
        </div>

        <div className="max-w-6xl w-full px-4 sm:px-6 lg:px-8 py-12 flex flex-col items-center justify-center">
          <div className="max-w-md mx-auto bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-8">
            <form onSubmit={handleNext} className="space-y-6">
              <div>
                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-2">Company Name</label>
                <input id="companyName" name="companyName" type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your Company Inc." value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input id="email" name="email" type="email" autoComplete="email" required className="w-full px-3 py-2 border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input id="phone" name="phone" type="tel" required className="w-full px-3 py-2 border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="+1234567890" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                <input id="username" name="username" type="text" required className="w-full px-3 py-2 border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>

              <div>
                <label htmlFor="password" title="Password must be at least 8 characters long" className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                <div className="relative">
                  <input id="password" name="password" type={showPassword ? 'text' : 'password'} required className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? (
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                    ) : (
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                <div className="relative">
                  <input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <button type="button" className="absolute inset-y-0 right-0 pr-3 flex items-center" onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                    {showConfirmPassword ? (
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                    ) : (
                      <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload Logo (Optional)</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-[4px]">
                  <div className="space-y-1 text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                      <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div className="flex text-sm text-gray-600">
                      <label htmlFor="logo-upload" className="relative cursor-pointer bg-white rounded-[4px] font-medium text-indigo-600 hover:text-indigo-500">
                        <span>Upload a file</span>
                        <input id="logo-upload" name="logo-upload" type="file" className="sr-only" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                    </div>
                    {logoFile && <p className="text-sm text-indigo-600">Selected: {logoFile.name}</p>}
                  </div>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 text-center">{error}</p>}
              <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700">Next Step →</button>
            </form>
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">Already have an account? <button onClick={onSwitchToLogin} className="font-medium text-indigo-600 hover:text-indigo-500">Sign In</button></p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: Plan Selection
  if (step === 'plan') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative bg-white py-12">
        <div className="absolute left-4 bottom-4">
          <button className="bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded" onClick={() => setStep('details')}>Back to Details</button>
        </div>

        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-indigo-600 mb-2">Final Step</h1>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Choose Your Plan</h2>
          <p className="text-gray-600">Select the plan that fits your business</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto px-4 mb-12">
          <PlanCard name="Free" price={0} features={['Up to 5 invoices per month', 'Basic AI assistance', 'Email support', 'Standard templates']} />
          <PlanCard name="Starter" price={1200} features={['Up to 100 invoices per month', 'Advanced AI processing', 'Priority email support', 'Custom templates', 'Basic reporting']} popular />
          <PlanCard name="Pro" price={5000} features={['Unlimited invoices', 'Premium AI features', 'Phone & email support', 'Advanced reporting', 'API access', 'Multi-user access']} />
        </div>

        <div className="max-w-md w-full px-4 text-center">
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          {successMessage && <p className="text-sm text-indigo-600 mb-4">{successMessage}</p>}
          <button
            onClick={handleRegister}
            disabled={loading}
            className="w-full py-4 px-6 border border-transparent rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-700 hover:to-teal-900 transition-all disabled:opacity-50"
          >
            {loading ? 'Creating Account...' : 'Complete Registration →'}
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default SignupPage;


