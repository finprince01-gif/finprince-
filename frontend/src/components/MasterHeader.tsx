import React from 'react';
import Icon from './Icon';

interface MasterHeaderProps {
  title: string;
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  adminName: string;
}

const MasterHeader: React.FC<MasterHeaderProps> = ({
  title,
  isSidebarOpen,
  toggleSidebar,
  adminName
}) => {
  return (
    <div className="sticky top-0 z-30 backdrop-blur-md flex items-center justify-between erp-header">
      <div className="flex items-center gap-6">
        <button
          onClick={toggleSidebar}
          className="flex items-center justify-center w-10 h-10 rounded-[10px] bg-white border border-[#E2E8F0] shadow-[0_2px_6px_rgba(0,0,0,0.05)] hover:bg-[#F8FAFC] transition-all duration-200 active:scale-95"
          title={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
        >
          <Icon name="menu" className="w-[18px] h-[18px] text-[#475569]" />
        </button>

        <div className="flex flex-col">
          <h2 className="text-[13px] font-bold text-slate-900 uppercase tracking-widest leading-none">
            {title}
          </h2>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em] mt-1.5 leading-none">
            {adminName || 'Platform Admin'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        {/* User Badge or Notification if needed later */}
      </div>
    </div>
  );
};

export default MasterHeader;
