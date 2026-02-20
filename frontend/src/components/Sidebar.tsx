import React from 'react';
import type { Page } from '../types';
import Icon from './Icon';
import { usePermissions } from '../hooks/usePermissions';
import { useSubscriptionUsage } from '../hooks/useSubscriptionUsage';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  companyName: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout, companyName }) => {
  const { hasPageAccess } = usePermissions();
  const { subscriptionUsage } = useSubscriptionUsage();

  const allNavItems: { name: Page; icon: string }[] = [
    { name: 'Dashboard', icon: 'dashboard' },
    { name: 'Masters', icon: 'ledger' },
    { name: 'Inventory', icon: 'inventory' },
    { name: 'Vouchers', icon: 'vouchers' },
    { name: 'Vendor Portal', icon: 'vendor-portal' },
    { name: 'Customer Portal', icon: 'customer-portal' },
    { name: 'Payroll', icon: 'payroll' },
    { name: 'Service', icon: 'service' },
    { name: 'GST', icon: 'gst' },
    { name: 'Reports', icon: 'reports' },
    { name: 'Users & Roles', icon: 'users' },
    { name: 'Settings', icon: 'settings' },
  ];

  const displayItems = allNavItems.filter(item => {
    if (item.name === 'Dashboard') return true;
    return hasPageAccess(item.name);
  });

  const usagePercent = Math.min(
    100,
    ((subscriptionUsage?.used || 0) / (subscriptionUsage?.limit as number || 1)) * 100
  );
  const usageDisplay =
    subscriptionUsage?.limit === 'Unlimited'
      ? '∞'
      : `${Math.round(usagePercent)}%`;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 flex flex-col h-full transition-all duration-300 dark:bg-[#0f172a]"
      style={{
        width: '260px',
        backgroundColor: '#DDE3FF',
        borderRight: '1px solid #E2E8F0',
      }}
    >
      {/* ── Brand / Profile Section ──────────────────────────── */}
      <div style={{ padding: '24px 20px 16px' }}>
        <div className="flex items-center gap-3">
          {/* Company Avatar */}
          <div
            className="flex items-center justify-center w-10 h-10 text-white rounded-xl shrink-0"
            style={{ background: '#4F46E5', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}
          >
            <span className="text-base font-bold">
              {companyName?.charAt(0).toUpperCase() || 'A'}
            </span>
          </div>

          {/* Company Name + Plan */}
          <div className="flex flex-col min-w-0">
            <span
              className="text-sm font-bold truncate tracking-tight dark:text-white"
              style={{ color: '#1F2937' }}
            >
              {companyName || 'Admin User'}
            </span>
            <span
              className="text-[11px] font-semibold truncate mt-0.5 dark:text-slate-400"
              style={{ color: '#475569' }}
            >
              {subscriptionUsage?.plan || 'Enterprise Plan'}
            </span>
          </div>
        </div>

        {/* Divider below profile */}
        <div style={{ borderBottom: '1px solid #E2E8F0', marginTop: '16px' }} />
      </div>

      {/* ── Navigation Links ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto" style={{ padding: '4px 12px 0' }}>
        <div className="space-y-1">
          {displayItems.map((item) => {
            const isActive = currentPage === item.name;
            return (
              <button
                key={item.name}
                onClick={() => onNavigate(item.name)}
                className={`w-full flex items-center gap-3 rounded-[12px] font-semibold transition-all duration-200 group ${isActive
                  ? 'dark:bg-indigo-600 dark:text-white'
                  : 'dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                  }`}
                style={{
                  padding: '10px 14px',
                  height: '44px',
                  background: isActive ? 'rgba(255,255,255,0.65)' : 'transparent',
                  color: isActive ? '#4F46E5' : '#1F2937',
                  boxShadow: isActive ? '0 1px 4px rgba(79,70,229,0.08)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.4)';
                    (e.currentTarget as HTMLButtonElement).style.color = '#4F46E5';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                    (e.currentTarget as HTMLButtonElement).style.color = '#1F2937';
                  }
                }}
              >
                <div
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center transition-colors duration-200"
                  style={{ color: isActive ? '#4F46E5' : '#475569' }}
                >
                  <Icon name={item.icon as any} className="w-5 h-5" />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '0.02em' }}>
                  {item.name}
                </span>
                {isActive && (
                  <div
                    className="ml-auto w-1.5 h-1.5 rounded-full"
                    style={{ background: '#4F46E5' }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Footer: Storage + Logout ─────────────────────────── */}
      <div style={{ padding: '0 16px 24px' }}>
        {/* Divider above storage */}
        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '16px', marginBottom: '16px' }} />

        {/* Storage Box */}
        <div
          className="dark:bg-[#1e293b] dark:border-slate-700"
          style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '12px',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="uppercase font-bold dark:text-slate-500"
              style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#64748B' }}
            >
              Storage
            </span>
            <span
              className="px-2 py-0.5 rounded-full font-bold dark:text-indigo-300 dark:bg-indigo-900/30"
              style={{
                fontSize: '10px',
                color: '#4F46E5',
                background: '#EEF2FF',
                letterSpacing: '0.05em',
              }}
            >
              {usageDisplay}
            </span>
          </div>

          {/* Progress Bar */}
          <div
            className="w-full dark:bg-slate-700"
            style={{ height: '6px', background: '#EEF2FF', borderRadius: '999px', overflow: 'hidden' }}
          >
            <div
              style={{
                width: `${usagePercent}%`,
                height: '100%',
                background: '#4F46E5',
                borderRadius: '999px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>

          <div
            className="mt-2 flex justify-between dark:text-slate-500"
            style={{ fontSize: '10px', color: '#94A3B8', fontWeight: 500 }}
          >
            <span>Used</span>
            <span>
              {subscriptionUsage?.used} / {subscriptionUsage?.limit}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 rounded-xl font-semibold transition-colors group dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          style={{ padding: '10px 12px', color: '#475569' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.4)';
            (e.currentTarget as HTMLButtonElement).style.color = '#4F46E5';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = '#475569';
          }}
        >
          <div className="w-5 h-5 flex items-center justify-center">
            <Icon name="logout" className="w-[18px] h-[18px]" />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Log Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
