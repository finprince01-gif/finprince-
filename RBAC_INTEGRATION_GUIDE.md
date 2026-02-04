# RBAC Access Control Integration Guide

## Overview
This guide shows how to integrate the RBAC system into your existing pages to enforce permission-based access control.

## Step 1: Update Sidebar to Filter Menu Items

Update `Sidebar.tsx` to hide menu items based on user permissions:

```typescript
import React, { useState, useEffect } from 'react';
import type { Page } from '../types';
import Icon from './Icon';
import { apiService } from '../services';

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onLogout: () => void;
  companyName: string;
  userPlan?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, onLogout, companyName, userPlan }) => {
  const [userPermissions, setUserPermissions] = useState<any>({});
  const [isSuperuser, setIsSuperuser] = useState(false);

  // Load user permissions on mount
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await apiService.getMyPermissions();
        setIsSuperuser(response.is_superuser);
        setUserPermissions(response.permissions || {});
      } catch (error) {
        console.error('Failed to load permissions:', error);
      }
    };
    loadPermissions();
  }, []);

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
    { name: 'Users & Roles', icon: <Icon name="users" /> },
    { name: 'Settings', icon: <Icon name="settings" /> },
  ];

  // Filter navigation items based on permissions
  const navItems = isSuperuser 
    ? allNavItems 
    : allNavItems.filter(item => {
        // Always show Dashboard
        if (item.name === 'Dashboard') return true;
        
        // Check if user has view permission for this page
        return userPermissions[item.name]?.view === true;
      });

  return (
    <aside className="w-64 bg-white text-gray-800 flex flex-col fixed h-full border-r border-slate-200">
      {/* ... rest of sidebar code ... */}
    </aside>
  );
};

export default Sidebar;
```

## Step 2: Create ProtectedRoute Component

Create `components/ProtectedRoute.tsx`:

```typescript
import React, { useEffect, useState } from 'react';
import { apiService } from '../services';

interface ProtectedRouteProps {
  pageName: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  pageName, 
  children, 
  fallback = <div className="p-8 text-center text-red-600">Access Denied</div>
}) => {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const response = await apiService.getMyPermissions();
        
        // Superusers have access to everything
        if (response.is_superuser) {
          setHasAccess(true);
          return;
        }

        // Check if user has view permission for this page
        const pagePerms = response.permissions?.[pageName];
        setHasAccess(pagePerms?.view === true);
      } catch (error) {
        console.error('Failed to check access:', error);
        setHasAccess(false);
      }
    };

    checkAccess();
  }, [pageName]);

  // Loading state
  if (hasAccess === null) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  // Access denied
  if (!hasAccess) {
    return <>{fallback}</>;
  }

  // Access granted
  return <>{children}</>;
};

export default ProtectedRoute;
```

## Step 3: Update App.tsx to Use ProtectedRoute

Wrap page components with ProtectedRoute:

```typescript
const renderPage = () => {
  if (!isDataLoaded) {
    return <div className="flex items-center justify-center h-full text-gray-500">Loading Data...</div>;
  }

  switch (currentPage) {
    case 'Dashboard': 
      return <DashboardPage companyName={companyDetails.name} vouchers={vouchers} ledgers={ledgers} />;
    
    case 'Masters': 
      return (
        <ProtectedRoute pageName="Masters">
          <MastersPage
            ledgers={ledgers}
            ledgerGroups={ledgerGroups}
            onAddLedger={handleAddLedger}
            // ... other props
          />
        </ProtectedRoute>
      );
    
    case 'Inventory': 
      return (
        <ProtectedRoute pageName="Inventory">
          <InventoryPage />
        </ProtectedRoute>
      );
    
    // ... repeat for other pages
    
    default: 
      return <div>Page not found</div>;
  }
};
```

## Step 4: Add Tab-Level Filtering to Pages

### Example: Inventory Page

Update `pages/Inventory/Inventory.tsx`:

```typescript
import React, { useState, useEffect } from 'react';
import { apiService } from '../../services';

const InventoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Master');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);

  // All possible tabs
  const allTabs = [
    { id: 'Master', name: 'Master', icon: 'database' },
    { id: 'Operations', name: 'Operations', icon: 'truck' },
    { id: 'Reports', name: 'Reports', icon: 'chart' }
  ];

  // Load user permissions and filter tabs
  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await apiService.getMyPermissions();
        
        // Superusers see all tabs
        if (response.is_superuser) {
          setAvailableTabs(allTabs.map(t => t.id));
          return;
        }

        // Filter tabs based on permissions
        const inventoryPerms = response.permissions?.['Inventory'];
        if (!inventoryPerms?.view) {
          setAvailableTabs([]);
          return;
        }

        const accessibleTabs = allTabs
          .filter(tab => inventoryPerms.tabs?.[tab.name] === true)
          .map(tab => tab.id);
        
        setAvailableTabs(accessibleTabs);

        // Set active tab to first available tab
        if (accessibleTabs.length > 0 && !accessibleTabs.includes(activeTab)) {
          setActiveTab(accessibleTabs[0]);
        }
      } catch (error) {
        console.error('Failed to load permissions:', error);
      }
    };

    loadPermissions();
  }, []);

  // Filter tabs to show only accessible ones
  const visibleTabs = allTabs.filter(tab => availableTabs.includes(tab.id));

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="flex space-x-8">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'Master' && availableTabs.includes('Master') && (
          <MasterTab />
        )}
        {activeTab === 'Operations' && availableTabs.includes('Operations') && (
          <OperationsTab />
        )}
        {activeTab === 'Reports' && availableTabs.includes('Reports') && (
          <ReportsTab />
        )}
      </div>
    </div>
  );
};

export default InventoryPage;
```

### Example: Vouchers Page

Update `pages/Vouchers/Vouchers.tsx` similarly:

```typescript
const VouchersPage: React.FC<VouchersPageProps> = ({ /* props */ }) => {
  const [activeTab, setActiveTab] = useState('Sales');
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);

  const allTabs = [
    { id: 'Sales', name: 'Sales' },
    { id: 'Purchase', name: 'Purchase' },
    { id: 'Payment', name: 'Payment' },
    { id: 'Receipt', name: 'Receipt' },
    { id: 'Contra', name: 'Contra' },
    { id: 'Journal', name: 'Journal' },
    { id: 'Expenses', name: 'Expenses' }
  ];

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await apiService.getMyPermissions();
        
        if (response.is_superuser) {
          setAvailableTabs(allTabs.map(t => t.id));
          return;
        }

        const vouchersPerms = response.permissions?.['Vouchers'];
        if (!vouchersPerms?.view) {
          setAvailableTabs([]);
          return;
        }

        const accessibleTabs = allTabs
          .filter(tab => vouchersPerms.tabs?.[tab.name] === true)
          .map(tab => tab.id);
        
        setAvailableTabs(accessibleTabs);

        if (accessibleTabs.length > 0 && !accessibleTabs.includes(activeTab)) {
          setActiveTab(accessibleTabs[0]);
        }
      } catch (error) {
        console.error('Failed to load permissions:', error);
      }
    };

    loadPermissions();
  }, []);

  const visibleTabs = allTabs.filter(tab => availableTabs.includes(tab.id));

  // ... rest of component
};
```

## Step 5: Add Permission Checks for Actions

For sensitive actions (create, edit, delete), add permission checks:

```typescript
const handleCreateVoucher = async () => {
  // Check if user has permission
  const response = await apiService.getMyPermissions();
  const canCreate = response.is_superuser || 
    response.permissions?.['Vouchers']?.tabs?.['Sales'] === true;

  if (!canCreate) {
    alert('You do not have permission to create sales vouchers');
    return;
  }

  // Proceed with creation
  // ...
};
```

## Step 6: Update Context/State Management (Optional)

For better performance, consider storing permissions in a global context:

```typescript
// contexts/PermissionsContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiService } from '../services';

interface PermissionsContextType {
  permissions: any;
  isSuperuser: boolean;
  loading: boolean;
  hasPageAccess: (pageName: string) => boolean;
  hasTabAccess: (pageName: string, tabName: string) => boolean;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permissions, setPermissions] = useState<any>({});
  const [isSuperuser, setIsSuperuser] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      try {
        const response = await apiService.getMyPermissions();
        setIsSuperuser(response.is_superuser);
        setPermissions(response.permissions || {});
      } catch (error) {
        console.error('Failed to load permissions:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPermissions();
  }, []);

  const hasPageAccess = (pageName: string) => {
    if (isSuperuser) return true;
    return permissions[pageName]?.view === true;
  };

  const hasTabAccess = (pageName: string, tabName: string) => {
    if (isSuperuser) return true;
    return permissions[pageName]?.tabs?.[tabName] === true;
  };

  return (
    <PermissionsContext.Provider value={{ permissions, isSuperuser, loading, hasPageAccess, hasTabAccess }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error('usePermissions must be used within PermissionsProvider');
  }
  return context;
};
```

Then wrap your app:

```typescript
// App.tsx
import { PermissionsProvider } from '../contexts/PermissionsContext';

const App = () => {
  return (
    <PermissionsProvider>
      {/* Your app content */}
    </PermissionsProvider>
  );
};
```

And use in components:

```typescript
import { usePermissions } from '../../contexts/PermissionsContext';

const InventoryPage = () => {
  const { hasTabAccess, loading } = usePermissions();

  if (loading) return <div>Loading...</div>;

  const visibleTabs = allTabs.filter(tab => 
    hasTabAccess('Inventory', tab.name)
  );

  // ... rest of component
};
```

## Testing Checklist

- [ ] Create a role with limited permissions
- [ ] Create a test user with that role
- [ ] Login as test user
- [ ] Verify sidebar only shows permitted pages
- [ ] Verify pages only show permitted tabs
- [ ] Verify actions are restricted appropriately
- [ ] Test with multiple roles assigned
- [ ] Test superuser access (should see everything)
- [ ] Test permission changes take effect immediately

## Summary

This integration provides:
1. **Sidebar filtering** - Hide unauthorized menu items
2. **Route protection** - Prevent access to unauthorized pages
3. **Tab filtering** - Show only permitted tabs within pages
4. **Action restrictions** - Disable unauthorized operations
5. **Performance optimization** - Context-based permission caching

The system is now fully integrated with granular access control!
