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

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex flex-col h-full bg-[#E0E7FF] dark:bg-[#0f172a] border-r border-[#C7D2FE] dark:border-slate-800 transition-all duration-300" style={{ width: '260px' }}>

      {/* Profile / Brand Section */}
      <div className="px-5 pt-6 pb-6 border-b border-transparent dark:border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 text-white rounded-lg shadow-sm bg-indigo-600 shrink-0">
            <span className="text-lg font-bold">{companyName?.charAt(0).toUpperCase() || 'A'}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-slate-900 dark:text-white truncate tracking-tight">
              {companyName || 'Admin User'}
            </span>
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate mt-0.5">
              {subscriptionUsage?.plan || 'Enterprise Plan'}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-4 space-y-2 overflow-y-auto custom-scrollbar pt-4">
        {displayItems.map((item) => {
          const isActive = currentPage === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onNavigate(item.name)}
              className={`w-full flex items-center gap-3 px-[14px] h-[48px] rounded-[14px] font-semibold transition-all duration-200 group ${isActive
                ? 'bg-white/60 dark:bg-indigo-600 text-indigo-700 dark:text-white shadow-sm dark:shadow-indigo-900/20'
                : 'text-slate-800 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-white'
                }`}
            >
              <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center transition-colors duration-200 ${isActive ? 'text-indigo-700 dark:text-white' : 'text-slate-600 dark:text-slate-500 group-hover:text-indigo-700 dark:group-hover:text-white'
                }`}>
                <Icon name={item.icon as any} className="w-5 h-5" />
              </div>
              <span className="text-[14px] tracking-wide">{item.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Section */}
      <div className="p-5 mt-auto space-y-6">

        {/* Active Plan Box */}
        <div className="bg-white dark:bg-[#1e293b] border border-[#E0E7FF] dark:border-slate-700 rounded-2xl p-4 shadow-[0_8px_20px_rgba(79,70,229,0.15)] dark:shadow-none relative transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Storage</span>
            <span className="px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 rounded-full dark:border dark:border-indigo-500/20">
              {subscriptionUsage?.limit === 'Unlimited' ? '∞' : `${Math.round((subscriptionUsage?.used || 0) / (subscriptionUsage?.limit as number || 1) * 100)}%`}
            </span>
          </div>

          <div className="w-full h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, ((subscriptionUsage?.used || 0) / (subscriptionUsage?.limit as number || 1)) * 100)}%` }}
            />
          </div>
          <div className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 font-medium flex justify-between">
            <span>Used</span>
            <span>{subscriptionUsage?.used} / {subscriptionUsage?.limit}</span>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-2 py-2 text-slate-800 dark:text-slate-400 rounded-lg hover:bg-white/40 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-white transition-colors group"
        >
          <div className="w-5 h-5 flex items-center justify-center text-slate-600 dark:text-slate-500 group-hover:text-indigo-700 dark:group-hover:text-white transition-colors duration-200">
            <Icon name="logout" className="w-[18px] h-[18px]" />
          </div>
          <span className="text-sm font-medium">Log Out</span>
        </button>
      </div>

    </aside>
  );
};

export default Sidebar;
