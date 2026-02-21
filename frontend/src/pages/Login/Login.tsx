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

  // UI states
  const [error, setError] = useState("");         // Error message to display
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

      // Extract error message from various error formats
      const msg = err?.detail || err?.message || (err && err.error) || "Network error. Please try again.";
      setError(msg);
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
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="email">EMAIL</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="username">USERNAME</label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">PASSWORD</label>
            <input
              id="password"
              type="password"
              required
              className="form-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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
            disabled={loading}
            className="sign-in-button"
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
