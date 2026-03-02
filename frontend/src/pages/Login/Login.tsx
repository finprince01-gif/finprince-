/**
 * ============================================================================
 * LOGIN PAGE (Login.tsx)
 * ============================================================================
 * User authentication page - allows users to sign in to the application.
 */

// Import React and hooks
import React, { useState } from "react";
import "./Login.css";

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
  // Form input states (Login)
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // UI states
  const [error, setError] = useState("");         // Error message to display
  const [emailError, setEmailError] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loading, setLoading] = useState(false);  // Loading state during API call

  /**
   * Handle login form submission
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();  // Prevent default form submission
    setError("");        // Clear previous errors
    setEmailError("");
    setUsernameError("");
    setPasswordError("");
    setLoading(true);    // Show loading state

    let hasClientError = false;

    // Validate: all three fields are absolutely required for strict auth
    if (!email) {
      setEmailError("Email is required.");
      hasClientError = true;
    }
    if (!username) {
      setUsernameError("Username is required.");
      hasClientError = true;
    }
    if (!password) {
      setPasswordError("Password is required.");
      hasClientError = true;
    }

    if (hasClientError) {
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

      // Save tenant ID to sessionStorage (for data isolation)
      if (data.user?.tenant_id || data.user?.tenantId) {
        const tid = data.user.tenant_id ?? data.user.tenantId;
        sessionStorage.setItem("tenantId", tid);
        localStorage.removeItem("tenantId"); // Ensure it's not in localStorage
      }

      // Save company name to sessionStorage (for display)
      if (data.user?.company_name) {
        sessionStorage.setItem("companyName", data.user.company_name);
        localStorage.removeItem("companyName"); // Ensure it's not in localStorage
      }



      // Notify parent component (App.tsx) of successful login
      onLogin(data);
    } catch (err: any) {
      console.error("❌ Login error:", err);

      // Extract error message from structured response
      const errorData = err?.data || err?.response?.data || err;
      const msg = errorData?.message || errorData?.detail || err?.message || "Network error. Please try again.";
      const field = errorData?.field;

      if (field === 'email') setEmailError(msg);
      else if (field === 'username') setUsernameError(msg);
      else if (field === 'password') setPasswordError(msg);
      else setEmailError(msg); // Fallback generic errors to the first field
    } finally {
      setLoading(false);  // Hide loading state
    }
  };

  return (
    <div className="login-page-container">
      <header className="brand-section">
        <h1 className="brand-heading">FINPIXE</h1>
        <p className="brand-tagline">Smart accounting for modern businesses.</p>
      </header>

      <main className="login-card">
        <form className="login-form" onSubmit={handleLogin}>

          <div className="form-group">
            <label className="form-label" htmlFor="email">EMAIL</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError("");
              }}
            />
            {emailError && <div className="field-error-message">{emailError}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="username">USERNAME</label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setUsernameError("");
              }}
            />
            {usernameError && <div className="field-error-message">{usernameError}</div>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">PASSWORD</label>
            <div className="input-with-icon">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
              />
              <button type="button" className="input-icon-button" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            </div>
            {passwordError && <div className="field-error-message">{passwordError}</div>}
          </div>

          <button
            type="button"
            onClick={onForgotPassword}
            className="forgot-password-link"
          >
            Forgot password?
          </button>

          <button
            type="submit"
            disabled={loading || !email.trim() || !username.trim() || !password}
            className={`sign-in-button ${(loading || !email.trim() || !username.trim() || !password) ? 'disabled' : ''}`}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </main>

      <footer className="login-footer">
        <p className="footer-text">
          Don't have an account?{" "}
          <button onClick={onSwitchToSignup} className="signup-link">
            Sign Up
          </button>
        </p>
      </footer>
    </div>
  );
};

export default LoginPage;
