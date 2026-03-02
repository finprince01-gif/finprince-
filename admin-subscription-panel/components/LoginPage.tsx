
import React, { useState } from 'react';
import { EyeIcon } from './icons/EyeIcon';
import { EyeOffIcon } from './icons/EyeOffIcon';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000';

interface LoginPageProps {
  onLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // HARDCODED ADMIN CREDENTIALS - Check first before API call
    const ADMIN_USERNAME = 'budstech';
    const ADMIN_PASSWORD = '123';

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      // Hardcoded admin login - no database check
      setLoading(false);
      localStorage.setItem('token', 'admin-hardcoded-token');
      localStorage.setItem('isHardcodedAdmin', 'true');
      onLogin();
      return;
    }

    // If not hardcoded admin, try API authentication
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      setLoading(false);
      if (response.ok && data.access) {
        localStorage.setItem('token', data.access);
        localStorage.setItem('isHardcodedAdmin', 'false');
        onLogin();
      } else {
        setError('No active account found with the given credentials.');
      }
    } catch (err) {
      setLoading(false);
      setError('Network error. Please try again.');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white shadow-2xl rounded-2xl px-8 pt-10 pb-8 mb-4">
          <div className="mb-8 text-center">
            <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Admin Login</h1>
            <p className="text-gray-500 mt-2">Sign in to access the admin panel.</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-4">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
                Username
              </label>
              <input
                className="shadow-inner appearance-none border border-gray-300 bg-gray-50 rounded-lg w-full py-3 px-4 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500"
                id="username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="mb-4 relative">
              <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                Password
              </label>
              <input
                className="shadow-inner appearance-none border border-gray-300 bg-gray-50 rounded-lg w-full py-3 px-4 text-gray-900 leading-tight focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="******************"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 top-7 pr-3 flex items-center text-sm leading-5"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOffIcon className="h-6 w-6 text-gray-500 hover:text-gray-700" />
                ) : (
                  <EyeIcon className="h-6 w-6 text-gray-500 hover:text-gray-700" />
                )}
              </button>
            </div>

            {error && <p className="text-red-500 text-xs text-center mb-4">{error}</p>}
            <div className="flex items-center justify-between">
              <button
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg focus:outline-none focus:shadow-outline disabled:opacity-50 transition-colors duration-200"
                type="submit"
                disabled={loading}
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
