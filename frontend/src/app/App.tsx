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
import React, { useState, useCallback, useEffect } from 'react';
// Import TypeScript types for type safety
// These define the shape of our data structures (see ../types/types.ts)
import type { Page, Ledger, Voucher, ExtractedInvoiceData, CompanyDetails, LedgerGroupMaster, AgentMessage, SalesPurchaseVoucher, StockItem } from '../types';

// ============================================================================
// COMPONENT IMPORTS
// ============================================================================
// Shared UI Components
import Sidebar from '../components/Sidebar';  // Left navigation sidebar
// Page Components - Each represents a different section of the app
import DashboardPage from '../pages/Dashboard';           // Main dashboard with overview
import MastersPage from '../pages/Masters';               // Ledger and account management
import InventoryPage from '../pages/Inventory';           // Stock items and inventory
import VouchersPage from '../pages/Vouchers';             // Transaction vouchers (sales, purchase, etc.)
import ReportsPage from '../pages/Reports';               // Financial reports
import SettingsPage from '../pages/Settings';             // Company settings
import UsersAndRolesPage from '../pages/UsersAndRoles';   // User and role management (RBAC)
// UsersAndRolesPage removed
import VendorPortalPage from '../pages/VendorPortal';     // Vendor management portal
import CustomerPortalPage from '../pages/CustomerPortal'; // Customer management portal
import PayrollPage from '../pages/Payroll';               // Employee payroll management
import ServicePage from '../pages/Service';               // Service management page
import GSTPage from '../pages/GST';                        // GST Returns module
import DashboardBuilderPage from '../pages/DashboardBuilder'; // Dashboard Builder page
import LoginPage, { ForgotPassword as ForgotPasswordPage } from '../pages/Login'; // User login page
import SignupPage from '../pages/Register';               // New user registration
// Additional UI Components
import Modal from '../components/Modal';                  // Reusable modal dialog
import AIAgent from '../components/AIAgent';              // AI Agent (Kiki)
import Icon from '../components/Icon';                    // Icon component
import ErrorBoundary from '../components/ErrorBoundary';  // Error handling wrapper
import MassUploadResultPage from '../pages/MassUploadResult'; // Bulk upload results page
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
   * Get the user's subscription plan from localStorage
   * Used to determine which features are available
   * Returns: 'Basic', 'Pro', or 'Enterprise'
   */
  const getUserPlan = () => {
    // Try to get plan from user data stored in localStorage
    const userPlan = localStorage.getItem('userPlan');
    return userPlan;
  };

  // ============================================================================
  // STATE VARIABLES - Authentication & UI
  // ============================================================================

  // Authentication state - tracks if user is logged in
  // Initialize to false to ensure logout on refresh (tokens are now in memory only)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);

  // View state - determines whether to show login or signup page
  const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>('login');

  // Current page - which section of the app is being displayed
  const [currentPage, setCurrentPage] = useState<Page>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  // Data loading state - prevents rendering before data is loaded
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // User permissions - No longer used (RBAC removed)
  // const [permissions, setPermissions] = useState<string[]>([]);

  // ============================================================================
  // STATE VARIABLES - Business Data (In-Memory Database)
  // ============================================================================
  // These store the main business data loaded from the backend
  // All data is tenant-specific (isolated per company)

  // Company information (name, address, GST, etc.)
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails>(defaultCompanyDetails);

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

      // Load data using apiService (which includes JWT tokens)
      const [
        backendCompanyDetails,
        backendLedgers,
        backendLedgerGroups,
        backendVouchers,
        backendStockItems
      ] = await Promise.all([
        apiService.getCompanyDetails().catch(() => defaultCompanyDetails),
        apiService.getLedgers().catch(() => []),
        apiService.getLedgerGroups().catch(() => []),
        apiService.getVouchers().catch(() => []),
        apiService.getStockItems().catch(() => [])
      ]);

      // Update state with tenant data
      const newData = {
        companyDetails: backendCompanyDetails && typeof backendCompanyDetails === 'object' ? backendCompanyDetails : defaultCompanyDetails,
        ledgers: Array.isArray(backendLedgers) ? backendLedgers : [],
        ledgerGroups: Array.isArray(backendLedgerGroups) ? backendLedgerGroups : [],
        vouchers: Array.isArray(backendVouchers) ? backendVouchers : [],
        stockItems: Array.isArray(backendStockItems) ? backendStockItems : []
      };

      if (newData.companyDetails) {
        setCompanyDetails(prev => ({ ...prev, ...newData.companyDetails }));
      }
      setLedgers(newData.ledgers);
      setLedgerGroups(newData.ledgerGroups);
      setVouchers(newData.vouchers);
      setStockItems(newData.stockItems);

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

  // Handle URL query parameters for routing (e.g. ?view=signup)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Auth view
    const viewParam = params.get('view');
    if (viewParam === 'signup') {
      setView('signup');
    } else if (viewParam === 'login') {
      setView('login');
    }

    // Page navigation
    const pageParam = params.get('page');
    if (pageParam) {
      // Validate pageParam matches Page type if needed
      setCurrentPage(pageParam as Page);
    }
  }, []);



  // Load data on initial mount and login state changes
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const savedCompanyName = localStorage.getItem('companyName');
        const savedTenantId = localStorage.getItem('tenantId');

        // Set initial company details
        const initialCompanyDetails = { ...defaultCompanyDetails, name: savedCompanyName || 'Your Company Name' };
        setCompanyDetails(initialCompanyDetails);

        if (isLoggedIn && savedTenantId) {
          const hasCachedData = loadCachedData(savedTenantId);

          if (hasCachedData) {
            // Cached data loaded, now refresh from backend in background
            setIsDataLoaded(true);
            try {
              await loadTenantData(savedTenantId);
            } catch (err) {
              console.error('Failed to refresh tenant data:', err);
            }
          } else {
            // No cached data, load from backend
            await loadTenantData(savedTenantId);
          }
        } else {
          // Not logged in or no tenant ID, just show empty state
          try {
            const [rv, rc, ut] = await Promise.all([
              apiService.getRichVendors(),
              apiService.getRichCustomers(),
              apiService.getUserTables()
            ]);
            setRichVendors(rv);
            setRichCustomers(rc);
            setUserTables(ut);
          } catch (e) {
            console.error('Failed to load rich metadata:', e);
          }
          // Fallback to empty state
          setLedgers([]);
          setLedgerGroups([]);
          setVouchers([]);
          setIsDataLoaded(true);
        }
      } catch (err) {
        console.error('❌ Failed to initialize app data:', err);
        // Fallback to empty state
        setLedgers([]);
        setLedgerGroups([]);
        setVouchers([]);
        setStockItems([]);
        setIsDataLoaded(true);
      }
    };

    loadInitialData();
  }, [isLoggedIn, loadTenantData, loadCachedData]);



  // Handle login: be forgiving about the shape of incoming data (client may pass either full response or just user)
  const handleLogin = async (payload: any) => {
    try {
      // payload could be:
      // 1) full response { success: true, user: {...}, permissions: [...] }
      // 2) user object only (older LoginPage code passed data.user)
      const user = payload?.user || payload;
      const permissions = payload?.permissions || [];

      // Extract tenant ID from user data
      const tenantId = user?.tenantId || user?.tenant_id || null;

      // Save tenant ID (tokens are in HttpOnly cookies)
      if (tenantId) {
        localStorage.setItem('tenantId', tenantId);
      }

      // Save permissions - RBAC removed
      // (Logic removed)

      // Save user-related data (company name) - always update from user data
      const userCompanyName = user?.company_name || user?.companyName || 'Your Company';
      localStorage.setItem('companyName', userCompanyName);
      setCompanyDetails(prev => ({ ...prev, name: userCompanyName }));

      // Save user's plan for access control
      const userSelectedPlan = user?.selected_plan || user?.selectedPlan || 'Free';
      localStorage.setItem('userPlan', userSelectedPlan);

      // Clear logout flag since user is logging in
      localStorage.removeItem('loggedOut');

      // Set login state first
      setIsLoggedIn(true);
      setView('login'); // reset view

      // Immediately load tenant-scoped data after login
      await loadTenantData(tenantId);

    } catch (err) {

      setIsLoggedIn(true);
    }
  };

  const handleLogout = async () => {
    try {
      // Update server login status to Offline before clearing local data
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Send cookies
      });
    } catch (error) {

    }

    // Clear authentication data
    httpClient.clearAuthData();
    localStorage.removeItem('companyName');
    localStorage.removeItem('tenantId');

    // Set logout flag to prevent auto-login
    localStorage.setItem('loggedOut', 'true');

    // Clear all tenant cache data
    clearTenantCache();

    // Reset login state
    setIsLoggedIn(false);
    setCurrentPage('Dashboard');
    setView('login'); // Show login page after logout

    // Clear in-memory state
    setLedgers([]);
    setLedgerGroups([]);
    setVouchers([]);
    setCompanyDetails({ ...defaultCompanyDetails, name: 'Your Company Name' });
    setStockItems([]);
  };

  // Check user active status frequently when logged in (exclude admin users)
  // DISABLED: This was causing 401 errors when cookies expired
  // The deactivation check can be re-enabled later with proper session management
  useEffect(() => {
    // Disabled for now to prevent 401 errors
    return;

    /* Original code - disabled
    if (!isLoggedIn) return;

    const tenantId = localStorage.getItem('tenantId');

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
      } catch (error: any) {
        // Silently ignore 401 errors (user not authenticated)
        if (error?.message?.includes('401') || error?.message?.includes('Authentication')) {
          
          return;
        }
        
        // Don't logout on API errors, just log the warning
      }
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
      return <div className="flex items-center justify-center h-full text-gray-500">Loading Data...</div>;
    }

    // Plan-based feature restrictions (only for premium features now)
    switch (currentPage) {
      case 'Dashboard': return <DashboardPage onNavigate={handleNavigate} companyName={companyDetails.name} vouchers={vouchers} ledgers={ledgers} isAdmin={localStorage.getItem('tenantId') === null || localStorage.getItem('tenantId') === 'null'} />;
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
        onDone={() => { setCurrentPage('Vouchers'); setMassUploadResult(null); }}
        onUpdateVoucher={handleUpdateVoucher}
        ledgers={ledgers}
        stockItems={stockItems}
        companyDetails={companyDetails}
      />;
      default: return <div>Page not found</div>;
    }
  };

  if (!isLoggedIn) {
    if (view === "signup") return <SignupPage onSwitchToLogin={() => setView("login")} onBack={() => window.location.href = (import.meta as any).env.VITE_LANDING_URL || 'http://localhost:3000'} />;
    if (view === "forgot-password") return <ForgotPasswordPage onBackToLogin={() => setView("login")} />;
    return <LoginPage
      onLogin={handleLogin}
      onSwitchToSignup={() => setView("signup")}
      onForgotPassword={() => setView("forgot-password")}
      onBack={() => window.location.href = (import.meta as any).env.VITE_LANDING_URL || 'http://localhost:3000'}
    />;
  }
  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      {isSidebarOpen && (
        <Sidebar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          companyName={companyDetails.name}
        />
      )}
      <main className={`flex-1 ${isSidebarOpen ? 'ml-[240px]' : 'ml-0'} h-full overflow-y-auto bg-slate-50 transition-all duration-300`}>
        <div className="p-6">
          <div className="max-w-[1600px] mx-auto">
            {/* Sticky Header with Toggle Button */}
            <div className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur-md -mx-6 px-6 py-4 mb-6 border-b border-slate-200/50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleSidebar}
                  className="p-2 hover:bg-white rounded-lg transition-all shadow-sm border border-slate-200 bg-white active:scale-95 group"
                  title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                >
                  <div className="flex flex-col gap-1 w-5">
                    <span className={`h-0.5 bg-indigo-600 rounded-full transition-all ${isSidebarOpen ? 'w-5' : 'w-5'}`}></span>
                    <span className={`h-0.5 bg-indigo-600 rounded-full transition-all ${isSidebarOpen ? 'w-5' : 'w-3'}`}></span>
                    <span className={`h-0.5 bg-indigo-600 rounded-full transition-all ${isSidebarOpen ? 'w-5' : 'w-4'}`}></span>
                  </div>
                </button>
                <div className="flex flex-col">
                  <h2 className="text-[14px] font-bold text-slate-800 uppercase tracking-wider leading-none">
                    {currentPage}
                  </h2>
                  <span className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">
                    {companyDetails.name || 'Ai Accounting'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
              </div>
            </div>
            {renderPage()}
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

