/**
 * ============================================================================
 * LOGIN PAGE (Login.tsx)
 * ============================================================================
 * User authentication page - allows users to sign in to the application.
 * 
 * FEATURES:
 * - Email, username, and password authentication
 * - Form validation
 * - Error handling and display
 * - Loading states
 * - Link to signup page
 * - Optional back button (for landing page navigation)
 * 
 * AUTHENTICATION FLOW:
 * 1. User enters credentials (email, username, password)
 * 2. Form submits to apiService.login()
 * 3. Backend validates and returns user data + tokens
 * 4. Tokens stored in HttpOnly cookies (secure)
 * 5. User data saved to localStorage
 * 6. onLogin callback triggers App.tsx to load user data
 * 
 * FOR NEW DEVELOPERS:
 * - This is a controlled component (state manages form inputs)
 * - Authentication uses HttpOnly cookies (not localStorage tokens)
 * - Parent component (App.tsx) handles post-login navigation
 */

// Import React and hooks
import React, { useState } from "react";

// Import Icon component for UI icons
import Icon from "../../components/Icon";

// Import API service for authentication
import { apiService } from "../../services";

/**
 * Props for LoginPage component
 */
interface LoginPageProps {
  onLogin: (payload: any) => void;     // Callback when login succeeds (passes user data to App.tsx)
  onSwitchToSignup: () => void;        // Callback to switch to signup page
  onForgotPassword: () => void;        // Callback to switch to forgot password page
  onBack?: () => void;                 // Optional callback for back button (to landing page)
}

/**
 * LoginPage Component - User authentication form
 */
const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onSwitchToSignup, onForgotPassword, onBack }) => {
  // Navigation states: 'login'
  const [view, setView] = useState<'login' | 'forgot-userid'>('login');

  // Form input states (Login)
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // UI states
  const [error, setError] = useState("");         // Error message to display
  const [success, setSuccess] = useState("");     // Success message to display
  const [loading, setLoading] = useState(false);  // Loading state during API call

  /**
   * Handle login form submission
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();  // Prevent default form submission
    setError("");        // Clear previous errors
    setLoading(true);    // Show loading state

    // Validate: password is required, and at least one of email or username
    if (!password || (!email && !username)) {
      setError("Please enter your password and either your email or username.");
      setLoading(false);
      return;
    }

    try {
      // Call login API
      const data = await apiService.login(email, username, password);

      // Validate response
      if (!data) {
        throw new Error("Invalid login response from server.");
      }

      // Save tenant ID to localStorage (for data isolation)
      if (data.user?.tenant_id || data.user?.tenantId) {
        localStorage.setItem("tenantId", data.user.tenant_id ?? data.user.tenantId);
      }

      // Save company name to localStorage (for display)
      if (data.user?.company_name) {
        localStorage.setItem("companyName", data.user.company_name);
      }

      console.log("✅ Login successful:", data);

      // Notify parent component (App.tsx) of successful login
      onLogin(data);
    } catch (err: any) {
      console.error("❌ Login error:", err);

      // Extract error message from various error formats
      const msg = err?.detail || err?.message || (err && err.error) || "Network error. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);  // Hide loading state
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative bg-slate-100 dark:bg-slate-900 transition-colors duration-200">
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
      <div className="w-full max-w-sm p-8 space-y-8 bg-white dark:bg-slate-800 rounded-[4px] shadow-none border border-slate-200 dark:border-slate-700">
        <div>
          <h1 className="text-3xl font-bold text-center text-indigo-600 dark:text-indigo-400">AI-Accounting</h1>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-slate-400">
            Sign in to your account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-[4px] -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm dark:bg-slate-900 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="username" className="sr-only">Username</label>
              <input
                id="username"
                name="username"
                type="text"
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm dark:bg-slate-900 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="password" className="sr-only">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm dark:bg-slate-900 dark:border-slate-600 dark:placeholder-slate-400 dark:text-white"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col space-y-2">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-xs text-indigo-600 hover:text-indigo-500 text-right font-medium"
            >
              Forgot Password?
            </button>
          </div>

          {error && <p className="text-xs text-red-600 text-center">{error}</p>}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600 dark:text-slate-400">
          Don't have an account?{" "}
          <button onClick={onSwitchToSignup} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">
            Sign Up
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;


