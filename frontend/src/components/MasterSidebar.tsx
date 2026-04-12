import React from 'react';
import Icon from './Icon';

export type MasterPage = 'Dashboard' | 'Branches' | 'Reports' | 'Settings';

interface MasterSidebarProps {
  currentPage: MasterPage;
  onNavigate: (page: MasterPage) => void;
  onLogout: () => void;
  adminName: string;
  isOpen?: boolean;
}

const MasterSidebar: React.FC<MasterSidebarProps> = ({ 
  currentPage, 
  onNavigate, 
  onLogout, 
  adminName, 
  isOpen = true 
}) => {
  const masterNavItems: { name: MasterPage; icon: string }[] = [
    { name: 'Dashboard', icon: 'dashboard' },
    { name: 'Branches', icon: 'ledger' },  // GSTIN Level
    { name: 'Reports', icon: 'reports' },
    { name: 'Settings', icon: 'settings' },
  ];

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex flex-col h-full transition-all duration-300 erp-sidebar w-[260px] ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* ── Brand / Profile Section ──────────────────────────── */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3">
          {/* Admin Avatar */}
          <div
            className="flex items-center justify-center w-10 h-10 text-white rounded-xl shrink-0 bg-slate-800 shadow-lg"
          >
            <span className="text-base font-bold">
              {adminName?.charAt(0).toUpperCase() || 'M'}
            </span>
          </div>

          {/* Admin Name + Role */}
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold truncate tracking-tight text-slate-900 dark:text-white">
              {adminName || 'Master Admin'}
            </span>
            <span className="text-[11px] font-semibold truncate mt-0.5 text-slate-500 dark:text-slate-400">
              Platform Admin
            </span>
          </div>
        </div>

        <div className="mt-4" />
      </div>

      {/* ── Navigation Links ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto px-3">
        <div className="space-y-1">
          {masterNavItems.map((item) => {
            const isActive = currentPage === item.name;
            return (
              <button
                key={item.name}
                onClick={() => onNavigate(item.name)}
                className={`erp-nav-item ${isActive ? 'active' : ''}`}
              >
                <div className="erp-nav-icon">
                  <Icon name={item.icon as any} className="w-5 h-5" />
                </div>
                <span className="flex-1 text-left">{item.name}</span>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Footer: Logout ─────────────────────────── */}
      <div className="px-4 pb-6">
        {/* Logout Button */}
        <button
          onClick={onLogout}
          className="erp-nav-item w-full hover:text-rose-600 hover:bg-rose-50"
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

export default MasterSidebar;
