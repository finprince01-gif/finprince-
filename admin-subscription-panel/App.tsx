
import React, { useState, useCallback } from 'react';
import LoginPage from './components/LoginPage';
import DashboardPage from './components/DashboardPage';
import SubscriptionsPage from './components/SubscriptionsPage';
import PaymentDetailsPage from './components/PaymentDetailsPage';

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [page, setPage] = useState<string>('subscriptions');

  const handleLogin = useCallback(() => {
    setIsLoggedIn(true);
  }, []);

  const handleLogout = useCallback(() => {
    setIsLoggedIn(false);
    setPage('subscriptions');
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans">
      {isLoggedIn ? (
        <>
          {page === 'dashboard' && <DashboardPage onLogout={handleLogout} navigateTo={setPage} currentPage={page} />}
          {page === 'subscriptions' && <SubscriptionsPage onLogout={handleLogout} navigateTo={setPage} currentPage={page} />}
          {page === 'paymentDetails' && <PaymentDetailsPage onLogout={handleLogout} navigateTo={setPage} currentPage={page} />}
        </>
      ) : (
        <LoginPage onLogin={handleLogin} />
      )}
    </div>
  );
};

export default App;