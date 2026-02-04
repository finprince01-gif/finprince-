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
 * - Permission-based filtering using usePermissions hook
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

// Import permissions hook
import { usePermissions } from '../hooks/usePermissions';

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
  const { hasPageAccess } = usePermissions();

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
    { name: 'GST', icon: <Icon name="reports" /> },
    { name: 'Reports', icon: <Icon name="reports" /> },
    { name: 'Users & Roles', icon: <Icon name="users" /> },
    { name: 'Settings', icon: <Icon name="settings" /> },
  ];

  // Filter navigation items based on permissions
  const navItems = allNavItems.filter(item => {
    // Always show Dashboard
    if (item.name === 'Dashboard') return true;

    // Check view permission for all other pages
    return hasPageAccess(item.name);
  });

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
      {/* Company Name */}
      <div className="p-6 border-b border-gray-200">
        <h1 className="text-xl font-bold text-orange-500">{companyName || 'muthu'}</h1>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navItems.map((item) => {
          const isActive = currentPage === item.name;
          return (
            <a
              key={item.name}
              onClick={() => onNavigate(item.name)}
              className={`flex items-center space-x-3 px-6 py-3 cursor-pointer transition-colors ${isActive
                ? 'text-orange-500 bg-orange-50'
                : 'text-gray-600 hover:text-orange-500 hover:bg-gray-50'
                }`}
            >
              <div className="w-5 h-5">
                {item.icon}
              </div>
              <span className="text-sm font-medium">{item.name}</span>
            </a>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-200">
        <a
          onClick={onLogout}
          className="flex items-center space-x-3 px-6 py-3 text-gray-600 hover:text-orange-500 cursor-pointer transition-colors"
        >
          <Icon name="logout" className="w-5 h-5" />
          <span className="text-sm font-medium">Logout</span>
        </a>
      </div>
    </aside>
  );
};

export default Sidebar;
