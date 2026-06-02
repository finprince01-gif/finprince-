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
  isOpen?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout, companyName, isOpen = true }) => {
  const { hasPageAccess } = usePermissions();
  const { subscriptionUsage } = useSubscriptionUsage();

  const allNavItems: { name: Page; icon: string; label?: string }[] = [
    { name: 'Dashboard', icon: 'dashboard' },
    { name: 'Masters', icon: 'ledger', label: 'Accounting Master' },
    { name: 'Inventory', icon: 'inventory' },
    { name: 'Vouchers', icon: 'vouchers' },
    { name: 'Vendor Portal', icon: 'vendor-portal' },
    { name: 'Pending Purchases', icon: 'vouchers' },
    { name: 'Customer Portal', icon: 'customer-portal' },
    { name: 'Payroll', icon: 'payroll' },
    { name: 'Service', icon: 'service' },
    { name: 'GST', icon: 'gst' },
    { name: 'Reports', icon: 'reports' },
    { name: 'Users & Roles', icon: 'users' },
    { name: 'Settings', icon: 'settings' },
  ];

  const displayItems = allNavItems.filter(item => hasPageAccess(item.name));

  const usagePercent = Math.min(
    100,
    ((subscriptionUsage?.used || 0) / (subscriptionUsage?.limit as number || 1)) * 100
  );
  const usageDisplay =
    subscriptionUsage?.limit === 'Unlimited'
      ? '∞'
      : `${Math.round(usagePercent)}%`;

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col h-full transition-all duration-300 erp-sidebar w-[260px] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* ── Brand / Profile Section ──────────────────────────── */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          {/* Company Avatar */}
          <div
            className="flex items-center justify-center w-10 h-10 text-white rounded-xl shrink-0 bg-indigo-600 shadow-lg shadow-indigo-600/20"
          >
            <span className="text-base font-bold">
              {companyName?.charAt(0).toUpperCase() || 'A'}
            </span>
          </div>

          {/* Company Name + Plan */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold truncate tracking-tight text-slate-900 dark:text-white">
              {companyName || 'Admin User'}
            </span>
            <span className="text-[11px] font-semibold truncate mt-0.5 text-slate-500 dark:text-slate-400">
              {subscriptionUsage?.plan || 'Enterprise Plan'}
            </span>
          </div>
        </div>

        <div className="mt-4" />
      </div>

      {/* ── Navigation Links ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="space-y-1">
          {displayItems.map((item, index) => {
            const isActive = currentPage === item.name;
            const nextItem = displayItems[index + 1];

            // Define refined section breaks
            const isSectionBreak =
              (item.name === 'Dashboard' && nextItem) ||
              (item.name === 'Vouchers' && nextItem) ||
              (item.name === 'Customer Portal' && nextItem) ||
              (item.name === 'Service' && nextItem) ||
              (item.name === 'Reports' && nextItem);

            return (
              <React.Fragment key={item.name}>
                <button
                  onClick={() => onNavigate(item.name)}
                  className={`erp-nav-item ${isActive ? 'active' : ''}`}
                >
                  <div className="erp-nav-icon">
                    <Icon name={item.icon as any} className="w-5 h-5" />
                  </div>
                  <span className="flex-1 text-left">{item.label || item.name}</span>
                  {isActive && (
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </nav>

      {/* ── Footer: Storage + Logout ─────────────────────────── */}
      <div className="px-4 pb-6">
        <div className="mt-5" />

        {/* Storage Box */}
        <div className="erp-storage-card mb-3">
          <div className="flex items-center justify-between mb-3">
            <span className="erp-kpi-label">AI Usage</span>
            <span className="erp-badge erp-badge-primary text-[10px]">
              {usageDisplay}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-indigo-50 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-500"
              style={{ width: `${usagePercent}%` }}
            />
          </div>

          <div className="mt-2 flex justify-between text-[10px] text-slate-400 font-medium">
            <span>Used</span>
            <span>
              {subscriptionUsage?.used} / {subscriptionUsage?.limit}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="erp-nav-item hover:text-rose-600 hover:bg-rose-50"
        >
          <div className="erp-nav-icon">
            <Icon name="logout" className="w-[18px] h-[18px]" />
          </div>
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
