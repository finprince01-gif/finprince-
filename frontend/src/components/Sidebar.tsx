/**
 * ============================================================================
 * SIDEBAR COMPONENT (Sidebar.tsx)
 * ============================================================================
 * Left navigation sidebar - provides navigation to all main sections of the app.
 * 
 * FEATURES:
 * - Company name display at top
 * - Navigation menu with icons
 * - Active page highlighting
 * - Logout button at bottom
 * 
 * NAVIGATION ITEMS:
 * - Dashboard - Overview and metrics
 * - Masters - Ledgers and chart of accounts
 * - Inventory - Stock items and inventory management
 * - Vouchers - Transaction entry (sales, purchase, payments)
 * - Vendor Portal - Vendor management
 * - Customer Portal - Customer management
 * - Payroll - Employee payroll
 * - Reports - Financial reports
 * - Settings - Company settings
 * 
 * FOR NEW DEVELOPERS:
 * - Add new menu items to the `allNavItems` array
 * - Use Icon component for consistent icon display
 */

// Import React
import React from 'react';

// Import Page type for navigation
import type { Page } from '../types';

// Import Icon component for menu icons
import Icon from './Icon';

/**
 * Props for Sidebar component
 */
interface SidebarProps {
  currentPage: Page;              // Currently active page (for highlighting)
  onNavigate: (page: Page) => void;  // Callback when user clicks a menu item
  onLogout: () => void;           // Callback when user clicks logout
  companyName: string;            // Company name to display at top
  userPlan?: string;              // User's subscription plan (Basic, Pro, Enterprise)
}

/**
 * Sidebar Component - Main navigation sidebar
 */
const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout, companyName, userPlan }) => {
  // Define all available navigation items
  // Each item has a name and icon
  const allNavItems: { name: Page; icon: React.ReactElement }[] = [
    { name: 'Dashboard', icon: <Icon name="dashboard" /> },
    { name: 'Masters', icon: <Icon name="masters" /> },
    { name: 'Inventory', icon: <Icon name="inventory" /> },
    { name: 'Vouchers', icon: <Icon name="vouchers" /> },
    { name: 'Vendor Portal', icon: <Icon name="users" /> },
    { name: 'Customer Portal', icon: <Icon name="users" /> },
    { name: 'Payroll', icon: <Icon name="users" /> },
    { name: 'Service', icon: <Icon name="users" /> },
    { name: 'Reports', icon: <Icon name="reports" /> },
    { name: 'Settings', icon: <Icon name="settings" /> },
  ];

  // Show ALL navigation items (permission filtering disabled)
  // All users can see all menu items
  const navItems = allNavItems;

  return (
    <aside className="w-64 bg-white text-gray-800 flex flex-col fixed h-full border-r border-slate-200">
      <div className="h-16 flex items-center px-6 border-b border-slate-200">
        <h1 className="text-xl font-bold text-orange-600 truncate" title={companyName}>{companyName || 'Your Company Name'}</h1>
      </div>
      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = currentPage === item.name;
          return (
            <a
              key={item.name}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onNavigate(item.name);
              }}
              className={`flex items-center space-x-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive
                ? 'bg-orange-50 text-orange-700'
                : 'text-gray-600 hover:bg-slate-100 hover:text-gray-900'
                }`}
            >
              <span className={`w-6 h-6 ${isActive ? 'text-orange-600' : 'text-gray-400'}`}>{item.icon}</span>
              <span>{item.name}</span>
            </a>
          );
        })}
      </nav>
      <div className="px-4 py-4 border-t border-slate-200">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onLogout();
          }}
          className="flex items-center space-x-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors text-gray-600 hover:bg-slate-100 hover:text-gray-900"
        >
          <Icon name="logout" className="w-6 h-6 text-gray-400" />
          <span>Logout</span>
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
