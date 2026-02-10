import React from 'react';
import type { Page } from '../types';
import Icon from './Icon';
import { usePermissions } from '../hooks/usePermissions';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  companyName: string;
  userPlan?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout, companyName, userPlan }) => {
  const { hasPageAccess, permissions, isSuperuser } = usePermissions();

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

  const navItems = allNavItems.filter(item => {
    if (item.name === 'Dashboard') return true;
    return hasPageAccess(item.name);
  });

  const hasRBACConfigured = Object.keys(permissions).length > 0 || isSuperuser;
  const displayItems = hasRBACConfigured ? navItems : allNavItems;

  return (
    <aside className="w-[240px] bg-white border-r border-slate-200 flex flex-col fixed h-full z-40">
      {/* Brand Section */}
      <div className="h-[56px] flex items-center px-4 border-b border-slate-200 bg-slate-50/30">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 bg-indigo-600 rounded flex-shrink-0 flex items-center justify-center text-white text-[13px] font-bold">
            {companyName?.charAt(0) || 'A'}
          </div>
          <span className="text-[15px] font-semibold text-slate-800 truncate">
            {companyName || 'Ai Accounting'}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto pt-2">
        {displayItems.map((item) => {
          const isActive = currentPage === item.name;
          return (
            <button
              key={item.name}
              onClick={() => onNavigate(item.name)}
              className={`w-full flex items-center gap-3 px-4 py-[10px] transition-colors relative group ${isActive
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-indigo-600" />
              )}
              <div className={`flex-shrink-0 transition-colors ${isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-500'}`}>
                <Icon name={item.icon as any} className="w-[18px] h-[18px]" />
              </div>
              <span className="text-[14px] font-medium leading-5">{item.name}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer / User Section */}
      <div className="mt-auto border-t border-slate-200 p-2">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-[4px] transition-colors group"
        >
          <div className="flex-shrink-0 text-slate-400 group-hover:text-red-500">
            <Icon name="logout" className="w-[18px] h-[18px]" />
          </div>
          <span className="text-[14px] font-medium leading-none">Logout</span>
        </button>

        <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-[4px]">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Active Plan</span>
            <div className="w-1.5 h-1.5 bg-green-500 rounded-[4px]" />
          </div>
          <div className="text-[13px] font-semibold text-slate-700">{userPlan || 'Enterprise Starter'}</div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;

