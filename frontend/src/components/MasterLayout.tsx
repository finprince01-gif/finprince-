import React, { useState } from 'react';
import MasterSidebar, { MasterPage } from './MasterSidebar';
import MasterHeader from './MasterHeader';

interface MasterLayoutProps {
  currentPage: MasterPage;
  onNavigate: (page: MasterPage) => void;
  onLogout: () => void;
  adminName: string;
  children: React.ReactNode;
}

const MasterLayout: React.FC<MasterLayoutProps> = ({ 
  currentPage, 
  onNavigate, 
  onLogout, 
  adminName, 
  children 
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  return (
    <div className="flex min-h-screen font-sans erp-main-bg">
      {/* Master Sidebar */}
      <MasterSidebar 
        currentPage={currentPage}
        onNavigate={onNavigate}
        onLogout={onLogout}
        adminName={adminName}
        isOpen={isSidebarOpen}
      />

      {/* Main Content Area */}
      <main className={`flex-1 ${isSidebarOpen ? 'ml-[260px]' : 'ml-0'} min-h-screen transition-all duration-300 erp-main-bg`}>
        {/* Sticky Master Header */}
        <MasterHeader 
          title={currentPage}
          isSidebarOpen={isSidebarOpen}
          toggleSidebar={toggleSidebar}
          adminName={adminName}
        />

        {/* Page Content */}
        <div style={{ padding: '24px' }}>
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default MasterLayout;
