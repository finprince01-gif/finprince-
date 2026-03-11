/**
 * ============================================================================
 * MAIN APPLICATION COMPONENT (App.tsx)
 * ============================================================================
 * This is the heart of the application. It manages:
 * - User authentication (login/logout)
 * - Application routing (which page to show)
 * - Global state (ledgers, vouchers, stock items, etc.)
 * - Data synchronization with backend API
 * - AI features (invoice extraction, AI agent)
 * 
 * ARCHITECTURE:
 * - Uses React hooks for state management (useState, useEffect, useCallback)
 * - Communicates with Django backend via REST API
 * - Stores authentication tokens in HttpOnly cookies (secure)
 * - Supports multi-tenancy (each company has isolated data)
 * 
 * FOR NEW DEVELOPERS:
 * - Start by understanding the state variables (lines 80-115)
 * - Then review the data handlers (lines 437-835)
 * - Finally, look at the render logic (lines 840-973)
 */

// ============================================================================
// REACT IMPORTS
// ============================================================================
// Import core React functionality
import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
// Import TypeScript types for type safety
// These define the shape of our data structures (see ../types/types.ts)
import type { Page, Ledger, Voucher, ExtractedInvoiceData, CompanyDetails, LedgerGroupMaster, AgentMessage, SalesPurchaseVoucher, StockItem } from '../types';

// ============================================================================
// COMPONENT IMPORTS
// ============================================================================

// Page Components - Lazy loaded to optimize initial bundle size
const DashboardPage = React.lazy(() => import('../pages/Dashboard'));
const MastersPage = React.lazy(() => import('../pages/Masters'));
const InventoryPage = React.lazy(() => import('../pages/Inventory'));
const VouchersPage = React.lazy(() => import('../pages/Vouchers'));
const ReportsPage = React.lazy(() => import('../pages/Reports'));
const SettingsPage = React.lazy(() => import('../pages/Settings'));
const UsersAndRolesPage = React.lazy(() => import('../pages/UsersAndRoles'));
const VendorPortalPage = React.lazy(() => import('../pages/VendorPortal'));
const CustomerPortalPage = React.lazy(() => import('../pages/CustomerPortal'));
const PayrollPage = React.lazy(() => import('../pages/Payroll'));
const ServicePage = React.lazy(() => import('../pages/Service'));
const GSTPage = React.lazy(() => import('../pages/GST'));
const DashboardBuilderPage = React.lazy(() => import('../pages/DashboardBuilder'));
const LoginPage = React.lazy(() => import('../pages/Login').then(m => ({ default: m.default })));
const ForgotPasswordPage = React.lazy(() => import('../pages/Login').then(m => ({ default: m.ForgotPassword })));
const SignupPage = React.lazy(() => import('../pages/Register'));
const MassUploadResultPage = React.lazy(() => import('../pages/MassUploadResult'));

// Shared UI Components
import Sidebar from '../components/Sidebar';  // Left navigation sidebar
import Modal from '../components/Modal';                  // Reusable modal dialog
import AIAgent from '../components/AIAgent';              // AI Agent (Kiki)
import Icon from '../components/Icon';                    // Icon component
import ErrorBoundary from '../components/ErrorBoundary';  // Error handling wrapper
import { showError, showSuccess } from '../utils/toast';


// Import assets
import kikiLogo from '../assets/fox-logo-transparent.png';

// ============================================================================
// SERVICE IMPORTS
// ============================================================================
// AI Services - Google Gemini integration for invoice extraction and AI agent
import { extractInvoiceDataWithRetry, getAgentResponse, getGroundedAgentResponse } from '../services/geminiService';

// API Service - Handles all HTTP requests to Django backend
import { apiService, httpClient } from '../services';
import { hasStoredSession, getRefreshToken } from '../services/authService';

// Initial Data - Default data for new companies (fallback if backend is empty)
import { initialLedgers, initialLedgerGroups } from '../store/initialData';
import { initialVouchers } from '../store/initialVouchers';

// ============================================================================
// CONFIGURATION
// ============================================================================
// API Base URL - Read from environment variable or use default
// In production, set VITE_API_URL in .env file
const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5003';

// Default company details - Used for new companies or as fallback
// This includes default voucher numbering configuration
const defaultCompanyDetails: CompanyDetails = {
  name: 'Your Company', address: '', gstin: '', state: 'Maharashtra',
  logo: '', email: '', phone: '', website: '', pan: '', cin: '',
  voucherNumbering: {
    Sales: { autoIncrement: true, prefix: 'INV-', nextNumber: 1, width: 4, suffix: '/24-25' },
    Purchase: { autoIncrement: true, prefix: 'PO-', nextNumber: 1, width: 4, suffix: '/24-25' }
  }
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
const App: React.FC = () => {
  // ============================================================================
  // HELPER FUNCTIONS
  // ============================================================================

  /**
   * Get feature limits based on user's subscription plan
   * Plans: Basic, Pro, Enterprise
   * Returns: Object with feature flags and limits
   */
  const getPlanLimits = (plan?: string) => {
    const plans: Record<string, any> = {
      'Free': {
        maxUploads: 5,
        hasAI: false,
        hasReports: true,
        hasSettings: true,
        hasMultipleCompanies: false,
        hasAdvancedFeatures: false
      },
      'Starter': {
        maxUploads: 100,
        hasAI: true,
        hasReports: true,
        hasSettings: true,
        hasMultipleCompanies: true,
        hasAdvancedFeatures: false
      },
      'Pro': {
        maxUploads: 999999, // Unlimited
        hasAI: true,
        hasReports: true,
        hasSettings: true,
        hasMultipleCompanies: true,
        hasAdvancedFeatures: true
      }
    };

    // Map legacy names to new names and handle casing
    let activePlan = plan || 'Free';
    // Normalize casing (e.g., 'FREE' -> 'Free', 'STARTER' -> 'Starter')
    if (activePlan.toUpperCase() === 'FREE') activePlan = 'Free';
    if (activePlan.toUpperCase() === 'STARTER' || activePlan === 'Basic') activePlan = 'Starter';
    if (activePlan.toUpperCase() === 'PRO' || activePlan === 'Enterprise') activePlan = 'Pro';

    return plans[activePlan] || plans['Free'];
  };

  /**
   * Get the user's subscription plan from sessionStorage
   * Used to determine which features are available
   * Returns: 'Free', 'Starter', or 'Pro'
   */
  const getUserPlan = () => {
    // Try to get plan from user data stored in sessionStorage first, then fallback to localStorage for migration
    const userPlan = sessionStorage.getItem('userPlan') || localStorage.getItem('userPlan');
    return userPlan;
  };

  // ============================================================================
  // STATE VARIABLES - Authentication & UI
  // ============================================================================

  // Authentication state - tracks if user is logged in
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(() => hasStoredSession());
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Router state
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // User permissions - No longer used (RBAC removed)
  // const [permissions, setPermissions] = useState<string[]>([]);

  // ============================================================================
  // STATE VARIABLES - Business Data (In-Memory Database)
  // ============================================================================
  // These store the main business data loaded from the backend
  // All data is tenant-specific (isolated per company)

  // Company information (name, address, GST, etc.)
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>(() => {
    const saved = sessionStorage.getItem('companyName') || localStorage.getItem('companyName');
    return saved ? { ...defaultCompanyDetails, name: saved } : defaultCompanyDetails;
  });

  // Chart of Accounts - individual ledger accounts (Cash, Bank, Sales, etc.)
  const [ledgers, setLedgers] = useState<Ledger[]>([]);

  // Ledger Groups - hierarchical grouping of ledgers (Assets, Liabilities, etc.)
  const [ledgerGroups, setLedgerGroups] = useState<LedgerGroupMaster[]>([]);

  // Vouchers - all transactions (sales, purchase, payment, receipt, etc.)
  const [vouchers, setVouchers] = useState<Voucher[]>([]);

  // RICH DATA for AI Agency (Emails, Phones, etc.)
  const [richVendors, setRichVendors] = useState<any[]>([]);
  const [richCustomers, setRichCustomers] = useState<any[]>([]);

  // Database Schema (for AI "Table Knowledge")
  const [userTables, setUserTables] = useState<any[]>([]);

  // Stock Items - inventory items for sales/purchase
  const [stockItems, setStockItems] = useState<StockItem[]>([]);

  // ============================================================================
  // STATE VARIABLES - AI Features
  // ============================================================================

  // AI invoice extraction loading state
  const [isLoading, setIsLoading] = useState(false);

  // Error message display
  const [error, setError] = useState<string | null>(null);

  // Prefilled voucher data from AI invoice extraction
  const [prefilledVoucherData, setPrefilledVoucherData] = useState<ExtractedInvoiceData | null>(null);

  // AI Agent (Kiki) - open/closed state
  const [isAgentOpen, setIsAgentOpen] = useState(false);

  // AI Agent conversation history
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([
    { role: 'model', text: 'Hello! I am Kiki Agent. How can I help you with your accounting data today? Use the toggle below to search the web for up-to-date information.' }
  ]);

  // AI Agent loading state (when waiting for response)
  const [isAgentLoading, setIsAgentLoading] = useState(false);

  // ============================================================================
  // STATE VARIABLES - UI Modals & Notifications
  // ============================================================================

  // Import summary - shows success/failure count after bulk import
  const [importSummary, setImportSummary] = useState<{ success: number, failed: number } | null>(null);

  // CONTEXT STATE: Stores what the AI is waiting for (Name, Email, etc.)
  const [pendingContext, setPendingContext] = useState<{ field: string, action: string, data?: any } | null>(null);

  // Mass upload results - stores vouchers from bulk upload for review
  const [massUploadResult, setMassUploadResult] = useState<Voucher[] | null>(null);

  // Deactivation modal - shown when user account is deactivated
  const [showDeactivationModal, setShowDeactivationModal] = useState(false);

  // ============================================================================
  // NAVIGATION HANDLER
  // ============================================================================

  /**
   * Handle page navigation
   * Called when user clicks on sidebar menu items
   */
  const handleNavigate = (page: Page) => setCurrentPage(page);

  // Handle logout: clear all session data and redirect to login
  const handleLogout = useCallback(async () => {
    try {
      await apiService.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      // Clear all session and local storage related to auth and tenant data
      sessionStorage.clear();
      localStorage.clear(); // Also clear legacy localStorage
      httpClient.clearAuthData(); // Clear tokens from in-memory client
      setIsLoggedIn(false);
      setIsDataLoaded(false);
      setLedgers([]);
      setLedgerGroups([]);
      setVouchers([]);
      setStockItems([]);
      setRichVendors([]);
      setRichCustomers([]);
      setCompanyDetails(defaultCompanyDetails);
      // clearTenantCache(); // Clear any remaining tenant-specific cache
      window.history.pushState({}, '', '/login');
      setCurrentPath('/login');
      setView('login');
      showSuccess('You have been successfully logged out.');
    }
  }, []); // Removed clearTenantCache from dependency array as it's not defined here

  // Load cached tenant data - DATA CACHING DISABLED FOR PRODUCTION
  const loadCachedData = useCallback((tenantId: string) => {
    // We intentionally return false to force loading from the API.
    // This prevents stale data and storage limit issues (5MB limit).
    return false;
  }, []);

  // Cache tenant data - DISABLED FOR PRODUCTION
  const cacheTenantData = useCallback((tenantId: string, data: any) => {
    // No-op: Do not save data to localStorage.
    // This protects against XSS (reading plain text data) and storage quotas.
  }, []);

  // Clear all tenant cache data
  const clearTenantCache = useCallback(() => {
    try {
      // Get all localStorage keys
      const keys = Object.keys(localStorage);
      // Filter keys that start with 'tenant_'
      const tenantKeys = keys.filter(key => key.startsWith('tenant_'));
      // Remove all tenant cache keys
      tenantKeys.forEach(key => localStorage.removeItem(key));
    } catch (error) {

    }
  }, []);

  // Load tenant-scoped data from backend after login
  const loadTenantData = useCallback(async (tenantId?: string) => {
    try {
      setIsDataLoaded(false);

      // Check if user is admin (tenantId is null)
      const isAdmin = tenantId === null || tenantId === undefined;

      // Try to load from cache first
      const hasCachedData = tenantId ? loadCachedData(tenantId) : false;

      const [
        backendCompanyDetails,
        backendLedgers,
        backendLedgerGroups,
        backendVouchers,
        backendStockItems,
        backendRichVendors,
        backendRichCustomers
      ] = await Promise.all([
        apiService.getCompanyDetails().catch(() => defaultCompanyDetails),
        apiService.getLedgers().catch(() => []),
        apiService.getLedgerGroups().catch(() => []),
        apiService.getVouchers().catch(() => []),
        apiService.getStockItems().catch(() => []),
        apiService.getRichVendors().catch(() => []),
        apiService.getRichCustomers().catch(() => [])
      ]);

      // Update state with tenant data
      const newData = {
        companyDetails: backendCompanyDetails && typeof backendCompanyDetails === 'object' ? backendCompanyDetails : defaultCompanyDetails,
        ledgers: Array.isArray(backendLedgers) ? backendLedgers : [],
        ledgerGroups: Array.isArray(backendLedgerGroups) ? backendLedgerGroups : [],
        vouchers: Array.isArray(backendVouchers) ? backendVouchers : [],
        stockItems: Array.isArray(backendStockItems) ? backendStockItems : [],
        richVendors: Array.isArray(backendRichVendors) ? backendRichVendors : [],
        richCustomers: Array.isArray(backendRichCustomers) ? backendRichCustomers : []
      };

      if (newData.companyDetails) {
        setCompanyDetails(prev => ({ ...prev, ...newData.companyDetails }));
      }
      setLedgers(newData.ledgers);
      setLedgerGroups(newData.ledgerGroups);
      setVouchers(newData.vouchers);
      setStockItems(newData.stockItems);
      setRichVendors(newData.richVendors);
      setRichCustomers(newData.richCustomers);

      // Cache the data if we have a tenant ID
      if (tenantId) {
        cacheTenantData(tenantId, newData);
      }

    } catch (error) {
      console.error('❌ Failed to load tenant data:');
      // Keep cached data on error if available
    } finally {
      setIsDataLoaded(true);
    }
  }, [loadCachedData, cacheTenantData]);

  // Handle URL query parameters and path-based routing
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    // Listen for browser back/forward buttons
    window.addEventListener('popstate', handleLocationChange);

    const params = new URLSearchParams(window.location.search);

    // Auth view from query params
    const viewParam = params.get('view');
    if (viewParam === 'signup') {
      setView('signup');
    } else if (viewParam === 'login') {
      setView('login');
    } else if (viewParam === 'forgot-password') {
      setView('forgot-password');
    }

    // Auth view from path
    if (window.location.pathname === '/signup') setView('signup');
    else if (window.location.pathname === '/login') setView('login');
    else if (window.location.pathname === '/forgot-password') setView('forgot-password');

    // Page navigation
    const pageParam = params.get('page');
    if (pageParam) {
      setCurrentPage(pageParam as Page);
    }

    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);



  // MAIN INITIALIZATION: Handle Auth & Data Loading in Parallel
  useEffect(() => {
    const initializeApp = async () => {
      if (!hasStoredSession()) {
        setIsAuthenticating(false);
        setIsDataLoaded(true);
        return;
      }

      try {
        // 1. Storage Migration & Setup
        let savedCompanyName = sessionStorage.getItem('companyName') || localStorage.getItem('companyName');
        let savedTenantId = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId');

        if (savedCompanyName) sessionStorage.setItem('companyName', savedCompanyName);
        if (savedTenantId) sessionStorage.setItem('tenantId', savedTenantId);

        // 2. Parallel Load: Validate Token (Permissions) + Fetch All Tenant Data
        // This ensures the shortest possible time to a fully loaded state
        const [permissions] = await Promise.all([
          apiService.getMyPermissions(),
          savedTenantId ? loadTenantData(savedTenantId as string) : Promise.resolve()
        ]);

        setIsLoggedIn(true);
        // We could set permissions here if we had a dedicated state, 
        // but usePermissions hook handles its own state for now.
      } catch (err: any) {
        console.warn('⚠️ App initialization failed:', err.message || 'Unknown error');
        // If critical auth fails, send to login
        if (err.status === 401) handleLogout();
      } finally {
        setIsAuthenticating(false);
        setIsDataLoaded(true);
      }
    };

    initializeApp();
  }, [loadTenantData, handleLogout]);



  // Handle login: be forgiving about the shape of incoming data (client may pass either full response or just user)
  const handleLogin = useCallback(async (payload: any) => {
    try {
      // payload could be:
      // 1) full response { success: true, user: {...}, permissions: [...] }
      // 2) user object only (older LoginPage code passed data.user)
      const user = payload?.user || payload;

      // Extract tenant ID from user data
      const tenantId = user?.tenantId || user?.tenant_id || null;

      // Save tenant ID (tokens are already in memory via apiService)
      if (tenantId) {
        sessionStorage.setItem('tenantId', tenantId);
      }

      // Save user-related data (company name) - always update from user data
      const userCompanyName = user?.company_name || user?.companyName || 'Your Company';
      sessionStorage.setItem('companyName', userCompanyName);
      setCompanyDetails(prev => ({ ...prev, name: userCompanyName }));

      // Save user's plan for access control
      const userSelectedPlan = user?.selected_plan || user?.selectedPlan || 'Free';
      sessionStorage.setItem('userPlan', userSelectedPlan);

      // Clear logout flag since user is logging in
      sessionStorage.removeItem('loggedOut');
      localStorage.removeItem('loggedOut'); // Also clear from legacy localStorage

      // Set login state first
      setIsLoggedIn(true);

      // Update URL to dashboard after successful login
      window.history.pushState({}, '', '/dashboard');
      setCurrentPath('/dashboard');

      setView('login'); // reset view

      // Immediately load tenant-scoped data after login
      await loadTenantData(tenantId);

      // Show welcome message
      const displayName = user?.username || user?.first_name || 'User';
      const capitalizedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

      showSuccess(
        `Great to see you! Stay driven, stay focused, and let's turn your vision into reality today.`,
        `Warm Welcome, ${capitalizedName}! ✨`,
        6000
      );

    } catch (err) {
      console.error('Login implementation error:', err);
    }
  }, [loadTenantData]);


  // Check user active status frequently when logged in (exclude admin users)
  // DISABLED: This was causing 401 errors when cookies expired
  // The deactivation check can be re-enabled later with proper session management
  useEffect(() => {
    // Disabled for now to prevent 401 errors
    return;

    /* Original code - disabled */
    if (!isLoggedIn) return;

    const tenantId = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId');

    // Don't check status for admin users (they can't be deactivated)
    if (!tenantId) return;

    /* Original code - disabled
    if (!isLoggedIn) return;

    const tenantId = sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId');

    // Don't check status for admin users (they can't be deactivated)
    if (!tenantId) return;

    const checkUserStatus = async () => {
      try {
        // Only check if we have authentication cookies
        const statusResponse = await apiService.checkUserStatus();
        if (!statusResponse.isActive) {
          // User has been deactivated
          setShowDeactivationModal(true);
          setTimeout(() => {
            handleLogout();
            setShowDeactivationModal(false);
          }, 3000); // Show modal for 3 seconds then logout (faster)
        }
      } catch (error: any) {}
    };

    // Check immediately, then every 5 seconds when online
    checkUserStatus();
    const statusInterval = setInterval(checkUserStatus, 5000); // More frequent checks

    return () => clearInterval(statusInterval);
    */
  }, [isLoggedIn, handleLogout]);


  // --- Data mutation handlers --- (all include Authorization header when token present)
  const handleAddLedger = useCallback(async (ledger: Ledger) => {
    try {
      const response = await apiService.saveLedger(ledger);
      if (response && response.id) {

        setLedgers(prev => [...prev, response].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        console.error(`Failed to save ledger ${ledger.name}`);
        setLedgers(prev => [...prev, ledger].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err: any) {
      console.error(`Error saving ledger ${ledger.name}:`);
      setLedgers(prev => [...prev, ledger].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }, []);

  const handleUpdateLedger = useCallback(async (idOrName: number | string, ledger: Partial<Ledger>) => {
    try {
      // If it's a number, use it as ID. Otherwise, find by name
      const ledgerId = typeof idOrName === 'number' ? idOrName : ledgers.find(l => l.name === idOrName)?.id;

      if (ledgerId) {
        const response = await apiService.updateLedger(ledgerId, ledger);
        if (response.success) {

          setLedgers(prev => prev.map(l => l.id === ledgerId ? { ...l, ...ledger } : l).sort((a, b) => a.name.localeCompare(b.name)));
        }
      } else {
        // Fallback: update by name if no ID available

        setLedgers(prev => prev.map(l => l.name === idOrName ? { ...l, ...ledger } : l).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) {
      console.error(`Error updating ledger ${idOrName}:`);
      showError('Failed to update ledger. Please try again.');
    }
  }, [ledgers]);

  const handleDeleteLedger = useCallback(async (idOrName: number | string) => {
    try {
      // If it's a number, use it as ID. Otherwise, find by name
      const ledgerId = typeof idOrName === 'number' ? idOrName : ledgers.find(l => l.name === idOrName)?.id;

      if (ledgerId) {
        await apiService.deleteLedger(ledgerId);

        setLedgers(prev => prev.filter(l => l.id !== ledgerId));
      } else {
        // Fallback: delete by name if no ID available

        setLedgers(prev => prev.filter(l => l.name !== idOrName));
      }
    } catch (err) {
      console.error(`Error deleting ledger ${idOrName}:`);
      showError('Failed to delete ledger. Please try again.');
    }
  }, [ledgers]);

  const handleAddLedgerGroup = useCallback(async (group: LedgerGroupMaster) => {
    try {
      const response = await apiService.saveLedgerGroup(group);
      if (response && response.id) {

        setLedgerGroups(prev => [...prev, response].sort((a, b) => a.name.localeCompare(b.name)));
      } else {
        console.error(`Failed to save ledger group ${group.name}`);
        setLedgerGroups(prev => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) {
      console.error(`Error saving ledger group ${group.name}:`);
      setLedgerGroups(prev => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
    }
  }, []);

  const handleUpdateLedgerGroup = useCallback(async (idOrName: number | string, group: Partial<LedgerGroupMaster>) => {
    try {
      const groupId = typeof idOrName === 'number' ? idOrName : ledgerGroups.find(g => g.name === idOrName)?.id;

      if (groupId) {
        const response = await apiService.updateLedgerGroup(groupId, group);
        if (response.success) {

          setLedgerGroups(prev => prev.map(g => g.id === groupId ? { ...g, ...group } : g).sort((a, b) => a.name.localeCompare(b.name)));
        }
      } else {

        setLedgerGroups(prev => prev.map(g => g.name === idOrName ? { ...g, ...group } : g).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (err) {
      console.error(`Error updating ledger group ${idOrName}:`);
      showError('Failed to update group. Please try again.');
    }
  }, [ledgerGroups]);

  const handleDeleteLedgerGroup = useCallback(async (idOrName: number | string) => {
    try {
      const groupId = typeof idOrName === 'number' ? idOrName : ledgerGroups.find(g => g.name === idOrName)?.id;

      if (groupId) {
        await apiService.deleteLedgerGroup(groupId);

        setLedgerGroups(prev => prev.filter(g => g.id !== groupId));
      } else {

        setLedgerGroups(prev => prev.filter(g => g.name !== idOrName));
      }
    } catch (err) {
      console.error(`Error deleting ledger group ${idOrName}:`);
      showError('Failed to delete group. Please try again.');
    }
  }, [ledgerGroups]);



  const handleAddVouchers = useCallback(async (vouchersToAdd: Voucher[], saveToMySQL: boolean = true) => {
    const newVouchers = vouchersToAdd.map(v => ({ ...v, id: v.id || new Date().toISOString() + Math.random() }));

    // Handle auto-incrementing voucher numbers
    let newCompanyDetails = { ...companyDetails };
    let detailsChanged = false;

    newVouchers.forEach(v => {
      if (v.type === 'Sales' || v.type === 'Purchase') {
        const config = newCompanyDetails.voucherNumbering?.[v.type];
        if (config?.autoIncrement) {
          const paddedNumber = String(config.nextNumber).padStart(config.width || 0, '0');
          const expectedInvoiceNo = `${config.prefix || ''}${paddedNumber}${config.suffix || ''}`;
          if (v.invoiceNo === expectedInvoiceNo) {
            config.nextNumber++;
            detailsChanged = true;
          }
        }
      }
    });

    if (detailsChanged) setCompanyDetails(newCompanyDetails);

    if (saveToMySQL) {

      try {
        await apiService.saveVouchers(newVouchers);

      } catch (err) {
        console.error(`Error saving vouchers to backend:`);
      }
    } else {

    }

    setVouchers(prev => [...prev, ...newVouchers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, [companyDetails]);

  const handleUpdateVoucher = useCallback(async (updatedVoucher: Voucher) => {
    try {
      await apiService.saveVouchers([updatedVoucher]);

    } catch (err) {
      console.error(`Error updating voucher ${updatedVoucher.id} in backend:`);
    }

    setVouchers(prevVouchers => prevVouchers.map(v => v.id === updatedVoucher.id ? updatedVoucher : v));
    setMassUploadResult(prevResult => prevResult ? prevResult.map(v => v.id === updatedVoucher.id ? updatedVoucher : v) as Voucher[] : null);
  }, []);

  const handleMassUploadComplete = useCallback(async (vouchersToCreate: Voucher[]) => {
    try {

      const createdVouchers = vouchersToCreate.map(v => ({ ...v, id: v.id || new Date().toISOString() + Math.random() }));


      try {
        await apiService.saveVouchers(createdVouchers);

      } catch (err) {
        console.error(`Error saving vouchers to backend:`);
      }

      setVouchers(prev => [...prev, ...createdVouchers].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setMassUploadResult(createdVouchers);
      setImportSummary({ success: createdVouchers.length, failed: 0 });
      setCurrentPage('MassUploadResult');
    } catch (err) {
      console.error('Mass upload save error:');
      setError('Failed to save mass uploaded vouchers');
    }
  }, []);

  const buildPrefilledDataFromVoucher = useCallback((voucher: Voucher): (ExtractedInvoiceData & { voucherType?: string; igstAmount?: number }) | null => {
    if (voucher.type === 'Purchase' || voucher.type === 'Sales' || voucher.type === 'Credit Note' || voucher.type === 'Debit Note') {
      const sp = voucher as SalesPurchaseVoucher;
      return {
        sellerName: sp.party || '',
        invoiceNumber: sp.invoiceNo || '',
        invoiceDate: sp.date || '',
        subtotal: Number(sp.totalTaxableAmount || 0),
        cgstAmount: Number(sp.totalCgst || 0),
        sgstAmount: Number(sp.totalSgst || 0),
        igstAmount: Number((sp as any).totalIgst || 0),
        totalAmount: Number(sp.total || 0),
        lineItems: (sp.items || []).map(item => ({
          itemDescription: item.name || '',
          hsnCode: '',
          quantity: Number(item.qty || 0),
          rate: Number(item.rate || 0),
          amount: Number(item.totalAmount || 0),
        })),
        voucherType: sp.type,
      };
    }

    if (voucher.type === 'Payment' || voucher.type === 'Receipt') {
      const pr = voucher as any;
      return {
        sellerName: pr.party || '',
        invoiceNumber: '',
        invoiceDate: pr.date || '',
        subtotal: Number(pr.amount || 0),
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalAmount: Number(pr.amount || 0),
        lineItems: [],
        voucherType: pr.type,
      };
    }

    return null;
  }, []);

  const handleInvoiceUpload = useCallback(async (file: File, voucherType?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const extractedData = await extractInvoiceDataWithRetry(file);
      const updatedExtractedData = { ...extractedData, voucherType: voucherType || 'Purchase' };
      setPrefilledVoucherData(updatedExtractedData);
      // Removed import summary modal - extracting data is not the same as saving it.
      // setImportSummary({ success: 1, failed: 0 });
      setCurrentPage('Vouchers');
    } catch (err) {
      console.error('Invoice upload error:');
      setError(err instanceof Error ? err.message : 'An unknown error occurred during AI extraction.');
    } finally {
      setIsLoading(false);
    }
  }, [vouchers.length, getUserPlan, getPlanLimits]);

  // AI Agent state for queue status
  const [agentQueueStatus, setAgentQueueStatus] = useState<{ queuePosition?: number; estimatedWaitSeconds?: number; code?: string } | undefined>();

  // --- AI AGENT ACTION DISPATCHER ---
  const handleAgentAction = async (action: any) => {

    const { tool_use, parameters } = action;

    try {
      switch (tool_use) {
        case 'navigate': {
          const pageMap: Record<string, string> = {
            'dashboard': 'Dashboard',
            'masters': 'Masters',
            'inventory': 'Inventory',
            'vouchers': 'Vouchers',
            'reports': 'Reports',
            'settings': 'Settings',
            'payroll': 'Payroll',
            'vendor portal': 'Vendor Portal',
            'vendors': 'Vendor Portal',
            'vendor': 'Vendor Portal',
            'customer portal': 'Customer Portal',
            'customers': 'Customer Portal',
            'customer': 'Customer Portal',
            'service': 'Service',
            'services': 'Service'
          };
          const paramPage = (parameters.page || '').toLowerCase().trim();

          // Direct match from aliases
          if (pageMap[paramPage]) {
            setCurrentPage(pageMap[paramPage] as Page);
            return `✅ Navigated to ${pageMap[paramPage]}`;
          }

          // Fuzzy match (fallback)
          const targetPageKey = Object.keys(pageMap).find(key =>
            key.includes(paramPage) || paramPage.includes(key)
          );

          if (targetPageKey) {
            setCurrentPage(pageMap[targetPageKey] as Page);
            return `✅ Navigated to ${pageMap[targetPageKey]}`;
          }

          return `❌ Could not find page: "${parameters.page}". Try "Dashboard", "Inventory", "Vendors", etc.`;
        }

        case 'ask_for_info': {
          // AI requests more info. Save the context state.
          setPendingContext({
            field: parameters.field,
            action: parameters.action,
            data: parameters.data || {} // Optional: Store partial data if AI sends it back
          });
          return parameters.question; // The reply text is just the question
        }

        case 'create_customer': {
          // Use Customer Portal API for rich data
          const payload = {
            customer_name: parameters.name,
            customer_code: `CUST-${Date.now().toString().slice(-6)}`,
            email_address: parameters.email || null,
            contact_number: parameters.phone || null,
            // Default required fields for the API
            gst_details: { gstins: [], branches: [] },
            products_services: { items: [] }
          };

          try {
            await httpClient.post('/api/customerportal/customer-master/', payload);
            setCurrentPage('Customer Portal');
            return `✅ Created customer '${parameters.name}' with full details. Navigating to Customer Portal.`;
          } catch (err) {
            console.error(err);
            return `❌ Failed to create customer via Portal API.`;
          }
        }

        case 'create_vendor': {
          // Use Vendor Portal "Basic Details" API
          const payload = {
            vendor_name: parameters.name,
            vendor_code: `VEN-${Date.now().toString().slice(-6)}`,
            email: parameters.email,
            contact_no: parameters.phone,
            is_also_customer: false
          };

          try {
            await httpClient.post('/api/vendors/basic-details/', payload);
            setCurrentPage('Vendor Portal');
            return `✅ Created vendor '${parameters.name}' with email/phone. Navigating to Vendor Portal.`;
          } catch (err) {
            console.error(err);
            return `❌ Failed to create vendor. Ensure Email and Phone are provided.`;
          }
        }

        case 'delete_customer': {
          const ledger = ledgers.find(l => l.name.toLowerCase() === parameters.name.toLowerCase());
          if (ledger) {
            const idToDelete = ledger.id || ledger.name;
            await handleDeleteLedger(idToDelete);
            return `🗑️ Deleted customer: ${parameters.name}`;
          }
          return `❌ Customer not found: ${parameters.name}`;
        }

        case 'create_item': {
          await httpClient.post('/api/inventory/items/', {
            item_code: parameters.item_code,
            name: parameters.name,
            category: parameters.category || 1,
            rate: parameters.rate || '0.00'
          });
          setCurrentPage('Inventory');
          return `✅ Created item '${parameters.name}' and navigated to Inventory.`;
        }

        case 'delete_item': {
          const itemsRes = await httpClient.get<any[]>('/api/inventory/items/');
          const item = itemsRes.find(i => i.name.toLowerCase() === parameters.name.toLowerCase());
          if (item) {
            await httpClient.delete(`/api/inventory/items/${item.id}/`);
            return `🗑️ Deleted item: ${parameters.name}`;
          }
          return `❌ Item not found: ${parameters.name}`;
        }

        case 'create_voucher': {
          const voucherData = {
            voucher_type: parameters.type || 'sales',
            voucher_number: 'AUTO',
            date: new Date().toISOString().split('T')[0],
            party_name: parameters.party_name,
            amount: parameters.amount || 0
          };
          await httpClient.post(`/api/masters/master-voucher-${parameters.type || 'sales'}/`, voucherData);
          return `✅ Created ${parameters.type} voucher for ${parameters.party_name}`;
        }

        case 'delete_voucher': {
          const v = vouchers.find(v => (v as any).voucher_number === parameters.voucher_number || v.id === parameters.id);
          if (v) {
            await httpClient.delete(`/api/masters/master-voucher-${v.type.toLowerCase()}/${v.id}/`);
            return `🗑️ Deleted voucher ${(v as any).voucher_number}`;
          }
          return `❌ Voucher not found`;
        }

        default:
          return `Unknown action: ${tool_use}`;
      }
    } catch (error: any) {
      console.error("Action Execution Failed:");
      return `❌ Action failed: ${error.message || 'Unknown error'}`;
    }
  };

  const handleSendMessageToAgent = async (message: string, useGrounding: boolean) => {
    let finalMessageText = message;

    // INJECT CONTEXT if we are waiting for an answer
    if (pendingContext) {
      finalMessageText = `[SYSTEM: The user is answering your request for '${pendingContext.field}' for action '${pendingContext.action}'. Treat this input as the value for '${pendingContext.field}'. PRESERVE unrelated context.]\nUser Input: "${message}"`;
      // Do not clear immediately? Or clear and assume AI consumes it?
      // Better to clear it, assuming AI will either act or ask for next field.
      setPendingContext(null);
    }

    const userMessage: AgentMessage = { role: 'user', text: message }; // Show original text to user
    setAgentMessages(prev => [...prev, userMessage]);
    setIsAgentLoading(true);
    setAgentQueueStatus(undefined); // Clear previous queue status

    try {
      let modelMessage: AgentMessage;
      let queueStatus;

      if (useGrounding) {
        const response = await getGroundedAgentResponse(message);
        modelMessage = { role: 'model', text: response.text, sources: response.sources };
      } else {
        const contextData = JSON.stringify({
          vouchers,
          ledgers,
          stockItems,
          ledgerGroups,
          companyDetails,
          currentDate: new Date().toISOString().split('T')[0], // Give AI "Today"
          // Inject Rich Data
          vendors: richVendors,
          customers: richCustomers,
          // Inject Schema
          tables: userTables
        });

        // Prepare updated history locally (since state update is async)
        const currentHistory = [...agentMessages, { role: 'user', text: finalMessageText }].map(msg => ({
          role: msg.role === 'model' ? 'model' : 'user',
          text: msg.text
        }));

        const response = await getAgentResponse(contextData, finalMessageText, currentHistory);
        let replyText = response.reply;

        // --- JSON Parsing & Tool Execution ---
        try {
          let jsonString = '';
          // 1. Try md code block
          const codeBlockMatch = replyText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
          if (codeBlockMatch) {
            jsonString = codeBlockMatch[1];
          } else {
            // 2. Try raw JSON extraction
            const jsonMatch = replyText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              jsonString = jsonMatch[0];
            }
          }

          if (jsonString) {
            const action = JSON.parse(jsonString);
            if (action.tool_use) {
              const actionResult = await handleAgentAction(action);
              replyText = `${actionResult}\n\n(Action: ${action.tool_use})`;
            }
          }
        } catch (e) {

        }
        // -------------------------------------

        modelMessage = { role: 'model', text: replyText };

        // Set queue status if applicable
        if (response.code === 'QUEUED' || response.code === 'RATE_LIMIT') {
          queueStatus = {
            code: response.code,
            retryAfter: response.retryAfter,
            queuePosition: response.queuePosition,
            estimatedWaitSeconds: response.estimatedWaitSeconds
          };
        }
      }

      setAgentMessages(prev => [...prev, modelMessage]);
      if (queueStatus) {
        setAgentQueueStatus(queueStatus);
      }

      // Clear queue status after 10 seconds
      if (queueStatus) {
        setTimeout(() => setAgentQueueStatus(undefined), 10000);
      }

    } catch (err) {
      const errorMessage: AgentMessage = { role: 'model', text: 'Sorry, I had trouble connecting to the AI. Please try again.' };
      setAgentMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsAgentLoading(false);
    }
  };

  const clearPrefilledData = useCallback(() => setPrefilledVoucherData(null), []);

  const handleSaveSettings = useCallback(async (details: CompanyDetails) => {
    try {
      const response = await apiService.saveCompanyDetails(details);

      // apiService now returns the object (or throws on error)
      if (response) {

        // Update local state with the details we saved
        // (Response might be snake_case from backend, so safer to keep using 'details' 
        // which matches frontend model, relying on success)
        setCompanyDetails(details);
      }
    } catch (err) {
      console.error('Error saving company settings:');
    }
  }, []);

  const userPlan = getUserPlan();
  const planLimits = getPlanLimits(userPlan);

  const renderPage = () => {
    if (!isDataLoaded) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
          <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">Syncing Workspace Data...</p>
        </div>
      );
    }

    // Plan-based feature restrictions (only for premium features now)
    switch (currentPage) {
      case 'Dashboard': return <DashboardPage onNavigate={handleNavigate} companyName={companyDetails.name} vouchers={vouchers} ledgers={ledgers} isAdmin={(sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId')) === null || (sessionStorage.getItem('tenantId') || localStorage.getItem('tenantId')) === 'null'} />;
      case 'Masters': return <MastersPage
        ledgers={ledgers}
        ledgerGroups={ledgerGroups}
        onAddLedger={handleAddLedger}
        onAddLedgerGroup={handleAddLedgerGroup}
        onUpdateLedger={handleUpdateLedger}
        onDeleteLedger={handleDeleteLedger}
        onUpdateLedgerGroup={handleUpdateLedgerGroup}
        onDeleteLedgerGroup={handleDeleteLedgerGroup}
      />;
      case 'Inventory': return <InventoryPage />;
      case 'Vouchers': return <VouchersPage
        vouchers={vouchers}
        ledgers={ledgers}
        stockItems={stockItems}
        onAddVouchers={handleAddVouchers}
        prefilledData={prefilledVoucherData}
        clearPrefilledData={() => setPrefilledVoucherData(null)}
        onInvoiceUpload={handleInvoiceUpload}
        companyDetails={companyDetails}
        onMassUploadComplete={handleMassUploadComplete}
        permissions={[]}
      />;
      case 'Reports': return <ErrorBoundary><ReportsPage
        vouchers={vouchers}
        ledgers={ledgers}
        ledgerGroups={ledgerGroups}
        stockItems={stockItems}
      /></ErrorBoundary>; // Available for all plans
      case 'Settings': return <SettingsPage companyDetails={companyDetails} onSave={handleSaveSettings} />; // Available for all plans
      case 'Users & Roles': return <UsersAndRolesPage onNavigate={handleNavigate} />;
      case 'Vendor Portal': return <VendorPortalPage onLogout={handleLogout} />;
      case 'Customer Portal': return <CustomerPortalPage />;
      case 'Payroll': return <PayrollPage />;
      case 'Service': return <ServicePage />;
      case 'GST': return <GSTPage />;
      case 'Dashboard Builder': return <DashboardBuilderPage vouchers={vouchers} ledgers={ledgers} onNavigate={handleNavigate} />;
      case 'MassUploadResult': return <MassUploadResultPage
        results={massUploadResult || []}
        onDone={() => {
          const firstVoucher = (massUploadResult || [])[0];
          if (firstVoucher) {
            const prefilled = buildPrefilledDataFromVoucher(firstVoucher);
            if (prefilled) {
              setPrefilledVoucherData(prefilled as ExtractedInvoiceData);
            }
          }
          setCurrentPage('Vouchers');
          setMassUploadResult(null);
        }}
        onUpdateVoucher={handleUpdateVoucher}
        ledgers={ledgers}
        stockItems={stockItems}
        companyDetails={companyDetails}
      />;
      default: return <div>Page not found</div>;
    }
  };

  // --- RENDER HELPERS ---
  const PageLoader = () => (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">Syncing Workspace Data...</p>
    </div>
  );

  const isAuthPath = currentPath === '/login' || currentPath === '/signup' || currentPath === '/forgot-password';

  // 1. Auth Flow (Login/Signup/Forgot Password) - Shown if not authenticating and not logged in
  if (!isAuthenticating && (!isLoggedIn || isAuthPath)) {
    let activeAuthView = view;
    if (currentPath === '/signup') activeAuthView = 'signup';
    else if (currentPath === '/forgot-password') activeAuthView = 'forgot-password';
    else if (currentPath === '/login') activeAuthView = 'login';

    return (
      <Suspense fallback={<div className="flex items-center justify-center h-screen erp-main-bg"><div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>}>
        {activeAuthView === "signup" ? (
          <SignupPage
            onSwitchToLogin={() => {
              window.history.pushState({}, '', '/login');
              setCurrentPath('/login');
              setView("login");
            }}
            onBack={() => window.location.href = (import.meta as any).env.VITE_LANDING_URL || 'http://localhost:3000'}
          />
        ) : activeAuthView === "forgot-password" ? (
          <ForgotPasswordPage
            onBackToLogin={() => {
              window.history.pushState({}, '', '/login');
              setCurrentPath('/login');
              setView("login");
            }}
          />
        ) : (
          <LoginPage
            onLogin={handleLogin}
            onSwitchToSignup={() => {
              window.history.pushState({}, '', '/signup');
              setCurrentPath('/signup');
              setView("signup");
            }}
            onForgotPassword={() => {
              window.history.pushState({}, '', '/forgot-password');
              setCurrentPath('/forgot-password');
              setView("forgot-password");
            }}
            onBack={() => window.location.href = (import.meta as any).env.VITE_LANDING_URL || 'http://localhost:3000'}
          />
        )}
      </Suspense>
    );
  }

  // 2. Main Application Layout (Sidebar + Header + Content)
  // Renders immediately if hasStoredSession() is true, even during authentication
  return (
    <div className="flex min-h-screen font-sans erp-main-bg">
      {/* Sidebar rendered ifLoggedIn OR while authenticating (to prevent layout shift) */}
      {(isLoggedIn || isAuthenticating) && (
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          companyName={companyDetails.name}
        />
      )}

      <main className={`flex-1 ${isLoggedIn || isAuthenticating ? 'ml-[260px]' : 'ml-0'} min-h-screen transition-all duration-300 erp-main-bg`}>
        {/* ── Sticky Header ─────────────────────────────────── */}
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
                {currentPage}
              </h2>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.15em] mt-1.5 leading-none">
                {companyDetails.name || 'Ai Accounting'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3" />
        </div>

        {/* ── Page Content ──────────────────────────────────── */}
        <div style={{ padding: '24px' }}>
          <div className="max-w-[1600px] mx-auto">
            {(!isLoggedIn && isAuthenticating) || !isDataLoaded ? (
              <PageLoader />
            ) : (
              <Suspense fallback={<PageLoader />}>
                {renderPage()}
              </Suspense>
            )}
          </div>
        </div>
      </main>

      <Modal isOpen={isLoading} title="AI Processing" type="loading">
        <p>Extracting invoice data with Gemini AI. This may take a moment...</p>
      </Modal>
      <Modal isOpen={!!error} onClose={() => setError(null)} title="Error" type="error">
        <p>{error}</p>
      </Modal>
      {importSummary && (
        <Modal isOpen={!!importSummary} onClose={() => setImportSummary(null)} title="Import Complete" type="success">
          <p>Successfully imported {importSummary.success} vouchers.</p>
          {importSummary.failed > 0 && <p className="text-yellow-700 mt-1">{importSummary.failed} rows were skipped due to errors or incorrect formatting.</p>}
        </Modal>
      )}

      {/* Deactivation Modal */}
      <Modal isOpen={showDeactivationModal} title="Account Deactivated" type="warning">
        <div className="text-center">
          <Icon name="exclamation-triangle" className="mx-auto h-12 w-12 text-amber-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Your account has been deactivated</h3>
          <p className="mt-1 text-sm text-gray-500">
            Please contact your administrator or support for assistance.
          </p>
          <p className="mt-3 text-xs text-gray-400">You will be logged out automatically...</p>
        </div>
      </Modal>


      {/* Floating AI Agent Button */}
      <button
        onClick={() => setIsAgentOpen(true)}
        className="fixed bottom-2 right-2 w-28 h-28 hover:scale-110 transition-transform duration-300 z-50 flex items-center justify-center group filter drop-shadow-none border-none outline-none focus:outline-none"
        title="Chat with Kiki Agent"
      >
        <img src={kikiLogo} alt="AI Agent" className="w-full h-full object-contain" />
      </button>



      <AIAgent
        isOpen={isAgentOpen}
        onClose={() => setIsAgentOpen(false)}
        messages={agentMessages}
        onSendMessage={handleSendMessageToAgent}
        isLoading={isAgentLoading}
        queueStatus={agentQueueStatus}
      />

    </div>
  );
};

export default App;

