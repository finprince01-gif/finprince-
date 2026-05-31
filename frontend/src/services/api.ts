/**
 * ============================================================================
 * API SERVICE (api.ts)
 * ============================================================================
 * This file contains ALL API endpoint methods for communicating with the backend.
 * It's a wrapper around httpClient that provides typed, easy-to-use methods.
 * 
 * ARCHITECTURE:
 * - Uses httpClient for HTTP communication (handles auth, errors, retries)
 * - Organized by feature area (Company, Masters, Inventory, Vouchers, etc.)
 * - All methods return Promises with typed data
 * - Handles data transformation between frontend and backend formats
 * 
 * MAIN SECTIONS:
 * 1. Company Settings - Company details, logo upload
 * 2. Masters - Ledgers, ledger groups, voucher configuration
 * 3. Vouchers - All transaction types (sales, purchase, payment, etc.)
 * 4. AI Features - Invoice extraction, narration generation
 * 5. Authentication - Login, register, logout
 * 5. Authentication - Login, register, logout
 * 
 * FOR NEW DEVELOPERS:
 * - Always use apiService instead of httpClient directly
 * - All methods handle authentication automatically
 * - Check the return types for what data you'll receive
 * - Backend uses snake_case, frontend uses camelCase (transformation happens here)
 * 
 * USAGE EXAMPLE:
 * ```typescript
 * import { apiService } from './services';
 * 
 * // Get all ledgers
 * const ledgers = await apiService.getLedgers();
 * 
 * // Save a new voucher
 * const voucher = await apiService.saveVoucher(voucherData);
 * ```
 */

// Import HTTP client for making requests
import { httpClient, AxiosRequestConfig } from './httpClient';

// Import TypeScript types for type safety
import type {
    CompanyDetails,
    Ledger,
    LedgerGroupMaster,
    Unit,
    StockGroup,
    StockItem,
    Voucher,
    VoucherTypeMaster,
    VoucherNumbering,
    UserTable,

} from '../types';

/**
 * ApiService class - Provides methods for all backend API endpoints
 * Singleton pattern - only one instance exists (exported as apiService)
 */
class ApiService {
    // ============================================================================
    // COMPANY SETTINGS
    // ============================================================================
    // Methods for managing company information (name, address, logo, etc.)

    /**
     * Get validated user session details.
     * Returns: id, username, email, tenant_id, role, etc.
     */
    async getCurrentUser(options: AxiosRequestConfig = {}) {
        return httpClient.get<any>('/api/auth/me/', undefined, options);
    }

    /**
     * Get company details for the current tenant
     * Returns: Company name, address, GST, logo URL, etc.
     */
    async getCompanyDetails(options: AxiosRequestConfig = {}) {
        return httpClient.get<CompanyDetails>('/api/company-settings/', undefined, options);
    }

    /**
     * Save or update company details
     * Handles both JSON data and file uploads (for logo)
     * @param data - Company details including optional logo file
     */
    async saveCompanyDetails(data: CompanyDetails & { logoFile?: File | null }, options: AxiosRequestConfig = {}) {
        // If logo file is provided, use FormData for file upload
        if (data.logoFile) {
            const formData = new FormData();
            if (data.name) formData.append('name', data.name);
            formData.append('logo', data.logoFile);
            if (data.tax_id) formData.append('tax_id', data.tax_id);
            if (data.address) formData.append('address', data.address);
            if (data.phone) formData.append('phone', data.phone);
            if (data.email) formData.append('email', data.email);
            if (data.website) formData.append('website', data.website);
            return httpClient.postFormData<CompanyDetails>('/api/company-settings/', formData, options);
        }
        // Otherwise, send JSON data
        return httpClient.post<CompanyDetails>('/api/company-settings/', data, options);
    }

    // ============================================================================
    // MASTERS - LEDGERS
    // ============================================================================
    // Ledgers are individual accounts in the chart of accounts
    // Examples: "HDFC Bank", "Cash", "Sales - Product A", "Customer XYZ"

    /**
     * Get all ledgers for the current tenant
     * Returns: Array of ledger objects
     */
    async getLedgers(options: AxiosRequestConfig = {}) {
        return httpClient.get<Ledger[]>('/api/masters/ledgers/?page_size=10000&limit=10000', undefined, options);
    }

    /**
     * Get only valid 'Pay From' ledgers (Cash, Bank, Loans, Borrowings)
     * using the hierarchical backend filter.
     */
    async getPayFromLedgers() {
        return httpClient.get<Ledger[]>('/api/ledgers/pay-from/');
    }

    async getPayToLedgers() {
        return httpClient.get<any[]>('/api/ledgers/pay-to/');
    }

    async getPendingInvoices(ledgerId: number | string) {
        return httpClient.get<any[]>(`/api/vouchers/payment/pending-invoices/?ledger_id=${ledgerId}`);
    }

    async getAdvances(ledgerId?: number | string, category?: string) {
        let url = `/api/vouchers/advances/`;
        const params: string[] = [];
        if (ledgerId) params.push(`ledger_id=${ledgerId}`);
        if (category) params.push(`category=${encodeURIComponent(category)}`);

        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }
        return httpClient.get<any[]>(url);
    }

    async saveLedger(data: Ledger) {
        return httpClient.post<Ledger>('/api/masters/ledgers/', data);
    }

    async updateLedger(id: number, data: Partial<Ledger>) {
        // Backend returns the updated ledger object, not a {success:true} wrapper.
        return httpClient.put<Ledger>(`/api/masters/ledgers/${id}/`, data);
    }

    async deleteLedger(id: number) {
        // Backend returns 204 No Content.
        return httpClient.delete<any>(`/api/masters/ledgers/${id}/`);
    }

    // ============================================================================
    // MASTERS - LEDGER GROUPS
    // ============================================================================

    async getLedgerGroups(options: AxiosRequestConfig = {}) {
        return httpClient.get<LedgerGroupMaster[]>('/api/masters/ledger-groups/', undefined, options);
    }

    async saveLedgerGroup(data: LedgerGroupMaster) {
        return httpClient.post<LedgerGroupMaster>('/api/masters/ledger-groups/', data);
    }

    async updateLedgerGroup(id: number, data: Partial<LedgerGroupMaster>) {
        return httpClient.put<{ success: boolean }>(`/api/masters/ledger-groups/${id}/`, data);
    }



    async deleteLedgerGroup(id: number) {
        return httpClient.delete<{ success: boolean }>(`/api/masters/ledger-groups/${id}/`);
    }

    /**
     * Get RICH Vendor Data (Basic Details like email, phone)
     * Used for AI Context
     */
    async getRichVendors(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/vendors/basic-details/?page_size=10000&limit=10000', undefined, options);
    }

    /**
     * Get RICH Customer Data (Email, Phone, GST)
     * Used for AI Context
     */
    async getRichCustomers(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/customerportal/customer-master/?page_size=10000&limit=10000', undefined, options);
    }

    /**
     * Get customers from Customer Portal with full branch/GST info
     * Used for Issue Slip and any form that needs customer_name + branches
     * Returns: Array of customers with customer_name, branches (branch_reference_name, gstin, address fields)
     */
    async getPortalCustomers() {
        return httpClient.get<any[]>('/api/customerportal/customer-master/');
    }

    /**
     * Get Sales Orders from Customer Portal
     * @param filters - Optional filters like customer_name, branch, status
     * @returns Array of sales orders with items and details
     */
    async getSalesOrders(filters?: any) {
        const params = new URLSearchParams();
        if (filters?.customer_name) params.append('customer_name', filters.customer_name);
        if (filters?.branch) params.append('branch', filters.branch);
        if (filters?.status) params.append('status', filters.status);
        return httpClient.get<any[]>(`/api/customerportal/sales-orders/?${params.toString()}`);
    }


    /**
     * Get GST Details (Addresses) for a specific Vendor
     * @param vendorId - Vendor Basic Detail ID
     */
    async getVendorGSTDetails(vendorId: number) {
        return httpClient.get<any[]>(`/api/vendors/gst-details/?vendor_basic_detail=${vendorId}`);
    }

    /**
     * Get Vendor Categories
     */
    async getVendorCategories(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/vendors/categories/', undefined, options);
    }

    // ============================================================================
    // INVENTORY - ITEMS
    // ============================================================================

    /**
     * Get all inventory locations
     * @returns Array of locations
     */
    async getInventoryLocations() {
        return httpClient.get<any[]>('/api/inventory/locations/');
    }

    async getUnits() {
        return httpClient.get<Unit[]>('/api/inventory/units/');
    }


    async getStockItems(options: AxiosRequestConfig = {}) {
        return httpClient.get<StockItem[]>('/api/inventory/items/', undefined, options);
    }

    async getMasterVoucherSales(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/masters/master-voucher-sales/', undefined, options);
    }

    async getNextVoucherNumber(seriesId: number | string) {
        return httpClient.get<any>(`/api/masters/master-voucher-sales/${seriesId}/next-number/`);
    }

    async getServiceItems(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/services/?is_active=true', undefined, options);
    }

    async getServices(params?: string | Record<string, any>) {
        if (typeof params === 'string') {
            return httpClient.get<any[]>(`/api/services/${params ? '?' + params : ''}`);
        }
        if (params && typeof params === 'object') {
            const query = new URLSearchParams(params as any).toString();
            return httpClient.get<any[]>(`/api/services/?${query}`);
        }
        return httpClient.get<any[]>('/api/services/');
    }
    async saveStockItem(data: any) {
        return httpClient.post<StockItem>('/api/inventory/items/', data);
    }

    /**
     * Get Cash and Bank ledgers for dropdown in voucher forms
     * Returns: Array of ledgers filtered by Asset category with Cash/Bank keywords
     */
    async getCashBankLedgers() {
        return httpClient.get<Ledger[]>('/api/masters/ledgers/cash-bank/');
    }

    // ============================================================================
    // INVENTORY - VOUCHER SERIES (GRN & ISSUE SLIP)
    // ============================================================================

    async getGRNSeries() {
        return httpClient.get<any[]>('/api/inventory/master-voucher-grn/');
    }

    async saveGRNSeries(data: any) {
        if (data.id) {
            return httpClient.put<any>(`/api/inventory/master-voucher-grn/${data.id}/`, data);
        }
        return httpClient.post<any>('/api/inventory/master-voucher-grn/', data);
    }

    async deleteGRNSeries(id: number) {
        return httpClient.delete<any>(`/api/inventory/master-voucher-grn/${id}/`);
    }

    async getIssueSlipSeries() {
        return httpClient.get<any[]>('/api/inventory/master-voucher-issue-slip/');
    }

    async saveIssueSlipSeries(data: any) {
        if (data.id) {
            return httpClient.put<any>(`/api/inventory/master-voucher-issue-slip/${data.id}/`, data);
        }
        return httpClient.post<any>('/api/inventory/master-voucher-issue-slip/', data);
    }

    async deleteIssueSlipSeries(id: number) {
        return httpClient.delete<any>(`/api/inventory/master-voucher-issue-slip/${id}/`);
    }

    async getDebitNoteSeries() {
        return httpClient.get<any[]>('/api/masters/master-voucher-debitnote/');
    }

    async getDebitNoteNextNumber(pk: number | string) {
        return httpClient.get<any>(`/api/masters/master-voucher-debitnote/${pk}/next-number/`);
    }

    async createInventoryOperationGRN(data: any) {
        return httpClient.post<any>('/api/inventory/operations/new-grn/', data);
    }

    async createInventoryOperationOutward(data: any) {
        return httpClient.post<any>('/api/inventory/operations/outward/', data);
    }

    async getOutwardSlips() {
        return httpClient.get<any[]>('/api/inventory/operations/outward/');
    }

    /**
     * Get Pending GRNs for reference in Vouchers
     */
    async getPendingGRNs(params: { vendor_name?: string, customer_name?: string, grn_type?: 'purchases' | 'sales_return' } = {}) {
        let url = '/api/inventory/operations/pending-grns/?';
        if (params.vendor_name) url += `vendor_name=${encodeURIComponent(params.vendor_name)}&`;
        if (params.customer_name) url += `customer_name=${encodeURIComponent(params.customer_name)}&`;
        if (params.grn_type) url += `grn_type=${params.grn_type}&`;
        return httpClient.get<any[]>(url);
    }

    /**
     * Get Job Work Outward Slips (for reference in Receipt)
     */
    async getJobWorkOutwardSlips(vendorName?: string) {
        let url = '/api/inventory/operations/job-work/?operation_type=outward';
        if (vendorName) {
            url += `&vendor_name=${encodeURIComponent(vendorName)}`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get Production Slips (for reference in Inter-process transfer or FG production)
     * @param type - Optional production_type filter ('materials_issued', 'inter_process', etc.)
     */
    async getProductionSlips(type?: string) {
        let url = '/api/inventory/operations/production/';
        if (type) {
            url += `?production_type=${type}`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get Stock Movement Summary Report
     * Returns aggregated stock data (Inward, Outward, Closing) per item
     */
    async getStockMovementSummary() {
        return httpClient.get<any[]>('/api/inventory/reports/stock-movement/');
    }

    /**
     * Get Detailed Stock Movements for a specific item
     * @param itemCode - Code of the item to filter results
     */
    async getStockMovementDetails(itemCode?: string) {
        let url = '/api/inventory/reports/stock-movement/details/';
        if (itemCode) {
            url += `?itemCode=${encodeURIComponent(itemCode)}`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get Purchase Orders for a specific vendor
     * @param vendorName - Vendor name to filter by (optional)
     * @param status - Optional status filter (e.g. 'Draft', 'Pending', 'Closed')
     */
    async getVendorPurchaseOrders(vendorName?: string, status?: string) {
        let url = `/api/vendors/purchase-orders/`;
        let params = [];
        if (vendorName) {
            params.push(`vendor_name=${encodeURIComponent(vendorName)}`);
        }
        if (status) {
            params.push(`status=${encodeURIComponent(status)}`);
        }
        if (params.length > 0) {
            url += `?${params.join('&')}`;
        }
        return httpClient.get<{ success: boolean; data: any[] }>(url);
    }

    /**
     * Get only Pending Purchase Orders for a specific vendor
     * @param vendorId - ID of the vendor
     */
    async getPendingPOs(vendorId: number | string, vendorName?: string) {
        let url = `/api/get_pending_pos?vendor_id=${vendorId}`;
        if (vendorName) {
            url += `&vendor_name=${encodeURIComponent(vendorName)}`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get a specific Purchase Order by ID
     * @param id - Purchase order ID
     */
    async getVendorPurchaseOrderById(id: number | string) {
        return httpClient.get<{ success: boolean; data: any }>(`/api/vendors/purchase-orders/${id}/`);
    }

    /**
     * Get Purchase Invoices (Vouchers) for a specific vendor
     * @param vendorName - Vendor name to filter by
     */
    async getVendorPurchaseInvoices(vendorName: string, branch?: string, showAll?: boolean) {
        let url = `/api/vouchers/purchase/?vendor_name=${encodeURIComponent(vendorName)}`;
        if (branch) {
            url += `&branch=${encodeURIComponent(branch)}`;
        }
        if (showAll) {
            url += `&show_all=true`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get unified vendor transactions (Procurement/Ledger data)
     * @param vendorId - Vendor base detail ID
     */
    async getVendorTransactions(vendorId: number) {
        return httpClient.get<any[]>(`/api/vendors/transactions/by_vendor/?vendor_id=${vendorId}`);
    }

    /**
     * Get Sales Invoices (Vouchers) for a specific customer
     * @param customerName - Customer name to filter by
     */
    async getCustomerSalesInvoices(customerName: string, branch?: string) {
        let url = `/api/vouchers/sales/?customer_name=${encodeURIComponent(customerName)}`;
        if (branch) {
            url += `&branch=${encodeURIComponent(branch)}`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get full Sales Invoice details (including items) by invoice number
     * Used by Credit Note to auto-populate item rows
     */
    async getSalesInvoiceDetails(invoiceNo: string) {
        const url = `/api/voucher-sales-new/?sales_invoice_no=${encodeURIComponent(invoiceNo)}&show_all=true`;
        const results = await httpClient.get<any[]>(url);
        return results && results.length > 0 ? results[0] : null;
    }

    async getPendingOutwardSlips(vendorName: string) {
        let url = `/api/operations/outward/pending/?vendor_name=${encodeURIComponent(vendorName)}`;
        return httpClient.get<any[]>(url);
    }

    async saveDebitNote(data: any) {
        return httpClient.post('/api/vouchers/debit-note/', data);
    }

    async updateDebitNote(id: number | string, data: any) {
        return httpClient.put(`/api/vouchers/debit-note/${id}/`, data);
    }


    async getHierarchy() {
        return httpClient.get<any[]>('/api/masters/hierarchy/');
    }

    // ============================================================================

    async getVoucherNumbering() {
        // Backend returns a list of configs (should be one per tenant)
        const response = await httpClient.get<any[]>('/api/masters/voucher-configurations/');
        const config = response.length > 0 ? response[0] : {};

        // Map flat backend fields to nested frontend structure
        return {
            id: config.id, // Keep ID for updates
            sales: {
                enableAuto: config.sales_enable_auto ?? true,
                prefix: config.sales_prefix || '',
                suffix: config.sales_suffix || '',
                nextNumber: config.sales_next_number || 1,
                padding: config.sales_padding || 4,
                preview: config.sales_preview || ''
            },
            purchase: {
                enableAuto: config.purchase_enable_auto ?? true,
                prefix: config.purchase_prefix || '',
                suffix: config.purchase_suffix || '',
                nextNumber: config.purchase_next_number || 1,
                padding: config.purchase_padding || 4,
                preview: config.purchase_preview || ''
            }
        };
    }

    async saveVoucherNumbering(data: { id?: number; sales?: Partial<VoucherNumbering>; purchase?: Partial<VoucherNumbering> }) {
        // Map nested frontend structure to flat backend fields
        const payload: any = {};

        if (data.sales) {
            payload.sales_enable_auto = data.sales.enableAuto;
            payload.sales_prefix = data.sales.prefix;
            payload.sales_suffix = data.sales.suffix;
            payload.sales_next_number = data.sales.nextNumber;
            payload.sales_padding = data.sales.padding;
            payload.sales_preview = data.sales.preview;
        }

        if (data.purchase) {
            payload.purchase_enable_auto = data.purchase.enableAuto;
            payload.purchase_prefix = data.purchase.prefix;
            payload.purchase_suffix = data.purchase.suffix;
            payload.purchase_next_number = data.purchase.nextNumber;
            payload.purchase_padding = data.purchase.padding;
            payload.purchase_preview = data.purchase.preview;
        }

        if (data.id) {
            // Update existing
            return httpClient.patch<any>(`/api/masters/voucher-configurations/${data.id}/`, payload);
        } else {
            // Create new (only if not exists, but getVoucherNumbering should handle existence check theoretically)
            // Ideally we check existence first or the backend handles singleton.
            // For now, assume if ID is missing we create.
            return httpClient.post<any>('/api/masters/voucher-configurations/', payload);
        }
    }

    async getVoucherConfigs(type: string) {
        return httpClient.get<any[]>(`/api/masters/voucher-configurations/?voucher_type=${type}`);
    }

    // ============================================================================
    // VOUCHERS - UNIFIED ENDPOINT
    // ============================================================================
    // Vouchers are transactions: Sales, Purchase, Payment, Receipt, Contra, Journal
    // All voucher types use the same endpoint with type differentiation

    /**
     * Helper method to normalize voucher type to lowercase
     * Backend expects lowercase, frontend uses TitleCase
     * @param type - Voucher type (e.g., "Sales", "Purchase")
     * @returns Lowercase type (e.g., "sales", "purchase")
     */
    private normalizeVoucherType(type: string): string {
        return type.toLowerCase();
    }

    /**
     * Get all vouchers, optionally filtered by type
     * @param type - Optional voucher type filter ("Sales", "Purchase", etc.)
     * @returns Array of vouchers with normalized types
     */
    async getVouchers(type?: string, options: AxiosRequestConfig = {}) {
        const normalizedType = type ? this.normalizeVoucherType(type) : undefined;
        const endpoint = normalizedType ? `/api/vouchers/?type=${normalizedType}` : '/api/vouchers/';
        const vouchers = await httpClient.get<Voucher[]>(endpoint, undefined, options);

        // Map backend lowercase types to frontend TitleCase
        const typeMap: Record<string, string> = {
            'sales': 'Sales',
            'purchase': 'Purchase',
            'payment': 'Payment',
            'receipt': 'Receipt',
            'contra': 'Contra',
            'journal': 'Journal',
            'credit_note': 'Credit Note',
            'debit_note': 'Debit Note',
            'credit note': 'Credit Note',
            'debit note': 'Debit Note',
        };

        return vouchers.map(v => ({
            ...v,
            type: (typeMap[v.type.toLowerCase()] || v.type) as any
        }));
    }

    /**
     * Get a specific voucher by ID
     * @param id - Voucher ID
     * @returns Detailed voucher object
     */
    async getVoucher(id: number | string, options: AxiosRequestConfig = {}, source?: string) {
        let response: any;
        let fetchedAsDetail = false;
        const normalizedSource = source?.toLowerCase() || '';

        try {
            if (normalizedSource === 'sales_invoice') {
                response = await httpClient.get<any>(`/api/invoices/${id}/`, undefined, options);
                response.type = response.type || 'Sales';
            } else if (normalizedSource === 'purchase_voucher') {
                response = await httpClient.get<any>(`/api/vouchers/purchase/${id}/?show_all=true`, undefined, options);
                response.type = response.type || 'Purchase';
            } else if (normalizedSource === 'expense_voucher' || normalizedSource === 'expense' || normalizedSource === 'expenses') {
                // Go directly to type-specific endpoint — avoids returning a wrong voucher from generic table
                response = await httpClient.get<any>(`/api/vouchers/expenses/${id}/`, undefined, options);
                response.type = 'Expenses';
                fetchedAsDetail = true;
            } else if (normalizedSource === 'contra_voucher' || normalizedSource === 'contra') {
                response = await httpClient.get<any>(`/api/vouchers/contra/${id}/`, undefined, options);
                response.type = 'Contra';
                fetchedAsDetail = true;
            } else if (normalizedSource === 'journal_voucher' || normalizedSource === 'journal') {
                response = await httpClient.get<any>(`/api/vouchers/journal/${id}/`, undefined, options);
                response.type = 'Journal';
                fetchedAsDetail = true;
            } else if (normalizedSource === 'credit_note_voucher' || normalizedSource === 'credit note' || normalizedSource === 'credit_note') {
                try {
                    const genericVoucher = await httpClient.get<any>(`/api/vouchers/${id}/`, undefined, options);
                    const refId = genericVoucher.data?.reference_id || genericVoucher.reference_id || id;
                    response = await httpClient.get<any>(`/api/vouchers/credit-note/${refId}/`, undefined, options);
                } catch (innerE) {
                    response = await httpClient.get<any>(`/api/vouchers/credit-note/${id}/`, undefined, options);
                }
                response.type = 'Credit Note';
                fetchedAsDetail = true;
            } else if (normalizedSource === 'debit_note_voucher' || normalizedSource === 'debit note' || normalizedSource === 'debit_note') {
                try {
                    const genericVoucher = await httpClient.get<any>(`/api/vouchers/${id}/`, undefined, options);
                    const refId = genericVoucher.data?.reference_id || genericVoucher.reference_id || id;
                    response = await httpClient.get<any>(`/api/vouchers/debit-note/${refId}/`, undefined, options);
                } catch (innerE) {
                    response = await httpClient.get<any>(`/api/vouchers/debit-note/${id}/`, undefined, options);
                }
                response.type = 'Debit Note';
                fetchedAsDetail = true;
            } else {
                response = await httpClient.get<any>(`/api/vouchers/${id}/`, undefined, options);
            }
        } catch (e: any) {
            // Fallback for legacy calls where JournalEntry stored Transaction ID instead of generic Voucher ID
            if (e?.response?.status === 404) {
                if (normalizedSource === 'receipt') {
                    response = await httpClient.get<any>(`/api/vouchers/receipts/${id}/`, undefined, options);
                    response.type = 'Receipt';
                    fetchedAsDetail = true;
                } else if (normalizedSource === 'payment') {
                    response = await httpClient.get<any>(`/api/vouchers/payment/${id}/`, undefined, options);
                    response.type = 'Payment';
                    fetchedAsDetail = true;
                } else if (normalizedSource === 'expense' || normalizedSource === 'expenses' || normalizedSource === 'expense_voucher') {
                    response = await httpClient.get<any>(`/api/vouchers/expenses/${id}/`, undefined, options);
                    response.type = 'Expenses';
                    fetchedAsDetail = true;
                } else if (normalizedSource === 'contra') {
                    response = await httpClient.get<any>(`/api/vouchers/contra/${id}/`, undefined, options);
                    response.type = 'Contra';
                    fetchedAsDetail = true;
                } else if (normalizedSource === 'journal') {
                    response = await httpClient.get<any>(`/api/vouchers/journal/${id}/`, undefined, options);
                    response.type = 'Journal';
                    fetchedAsDetail = true;
                } else if (normalizedSource === 'credit note' || normalizedSource === 'credit_note') {
                    try {
                        const genericVoucher = await httpClient.get<any>(`/api/vouchers/${id}/`, undefined, options);
                        const refId = genericVoucher.data?.reference_id || genericVoucher.reference_id || id;
                        response = await httpClient.get<any>(`/api/vouchers/credit-note/${refId}/`, undefined, options);
                    } catch (innerE) {
                        response = await httpClient.get<any>(`/api/vouchers/credit-note/${id}/`, undefined, options);
                    }
                    response.type = 'Credit Note';
                    fetchedAsDetail = true;
                } else if (normalizedSource === 'debit note' || normalizedSource === 'debit_note') {
                    try {
                        const genericVoucher = await httpClient.get<any>(`/api/vouchers/${id}/`, undefined, options);
                        const refId = genericVoucher.data?.reference_id || genericVoucher.reference_id || id;
                        response = await httpClient.get<any>(`/api/vouchers/debit-note/${refId}/`, undefined, options);
                    } catch (innerE) {
                        response = await httpClient.get<any>(`/api/vouchers/debit-note/${id}/`, undefined, options);
                    }
                    response.type = 'Debit Note';
                    fetchedAsDetail = true;
                } else if (source) {
                    response = await httpClient.get<any>(`/api/vouchers/${id}/`, undefined, options);
                } else {
                    throw e;
                }
            } else {
                throw e;
            }
        }

        const typeMap: Record<string, string> = {
            'sales': 'Sales',
            'purchase': 'Purchase',
            'payment': 'Payment',
            'receipt': 'Receipt',
            'contra': 'Contra',
            'journal': 'Journal',
            'expense': 'Expenses',
            'expenses': 'Expenses',
            'expense_voucher': 'Expenses',
            'credit note': 'Credit Note',
            'debit note': 'Debit Note',
            'credit_note': 'Credit Note',
            'debit_note': 'Debit Note',
        };

        const base = {
            ...response,
            type: (typeMap[response.type?.toLowerCase()] || response.type) as any
        };

        // Handle early return for legacy fallback items where referenceId isn't present
        if (fetchedAsDetail) {
            const detail = response;
            if (base.type === 'Receipt' || base.type === 'Payment') {
                const isReceipt = base.type === 'Receipt';
                return {
                    ...base,
                    voucher_type: detail.voucher_type || base.voucher_type || detail.type || '',
                    receive_in: isReceipt ? (detail.receive_in?.name || detail.receive_in || detail.account || base.account || '') : '',
                    account: isReceipt ? (detail.receive_in?.name || detail.receive_in || detail.account || base.account || '') : (detail.pay_from?.name || detail.pay_from || detail.pay_from_name || base.account || ''),
                    paid_from: !isReceipt ? (detail.pay_from?.name || detail.pay_from || detail.pay_from_name || base.account || '') : '',
                    party: detail.party || detail.customer || detail.pay_to_name?.name || detail.pay_to_name || base.party || '',
                    ref_no: detail.ref_no || base.ref_no || '',
                    narration: detail.narration || base.narration || '',
                    voucher_number: detail.voucher_number || base.voucher_number || '',
                    items: detail.items || [],
                };
            }
            if (['Contra', 'Journal', 'Expenses', 'Expense', 'Credit Note', 'Debit Note'].includes(base.type)) {
                return {
                    ...base,
                    ...detail,
                    // Ensure reference_id is always present for edit PUT calls
                    reference_id: detail.id || base.reference_id,
                    // Preserve camelCase fields from VoucherContraSerializer
                    fromAccount: detail.fromAccount || detail.from_account || base.from_account || '',
                    toAccount: detail.toAccount || detail.to_account || base.to_account || '',
                    from_account: detail.from_account || detail.fromAccount || base.from_account || '',
                    to_account: detail.to_account || detail.toAccount || base.to_account || '',
                    amount: detail.amount || base.amount || 0,
                    narration: detail.narration || base.narration || '',
                    voucher_number: detail.voucher_number || base.voucher_number || '',
                    voucher_series: detail.voucher_series || base.voucher_series || '',
                    // Contra forex fields (camelCase from serializer)
                    contraDeductChargesFrom: detail.contraDeductChargesFrom || detail.deduct_charges_from || '',
                    contraConversionCharges: detail.contraConversionCharges || detail.conversion_charges || 0,
                    contraFemaPurposeCode: detail.contraFemaPurposeCode || detail.fema_purpose_code || '',
                    contraConversionRate: detail.contraConversionRate || detail.conversion_rate || 0,
                    contraPaymentAmtForeign: detail.contraPaymentAmtForeign || detail.payment_amt_foreign || 0,
                    contraPaymentRate: detail.contraPaymentRate || detail.payment_rate || 0,
                    contraPaymentAmtINR: detail.contraPaymentAmtINR || detail.payment_amt_inr || 0,
                    contraReceiptAmtForeign: detail.contraReceiptAmtForeign || detail.receipt_amt_foreign || 0,
                    contraReceiptRate: detail.contraReceiptRate || detail.receipt_rate || 0,
                    contraReceiptAmtINR: detail.contraReceiptAmtINR || detail.receipt_amt_inr || 0,
                    contraForexGainLoss: detail.contraForexGainLoss || detail.forex_gain_loss || 0,
                    // Journal entry lines
                    entry_lines: detail.entry_lines || detail.entries || [],
                    entries: detail.entry_lines || detail.entries || [],
                    totalDebit: detail.totalDebit || detail.total_debit || 0,
                    totalCredit: detail.totalCredit || detail.total_credit || 0,
                };
            }
        }

        // Fetch detailed data from source-specific endpoint when available
        const referenceId = response.reference_id;
        const actualSource = response.source || source || '';

        if (referenceId) {
            try {
                let detailEndpoint = '';

                if (actualSource === 'purchase_voucher' || base.type === 'Purchase') {
                    // Use show_all=true so the detail endpoint bypasses the to_pay>0 filter —
                    // fully-paid invoices must still load their complete data in the drill-down view.
                    detailEndpoint = `/api/vouchers/purchase/${referenceId}/?show_all=true`;
                } else if (actualSource === 'sales_voucher' || actualSource === 'sales_invoice' || base.type === 'Sales') {
                    // reference_id on the generic Voucher table points to VoucherSalesInvoiceDetails.id
                    // Use the VoucherSalesViewSet endpoint (/api/voucher-sales-new/) NOT the old /api/vouchers/sales/
                    if (actualSource === 'sales_invoice') {
                        detailEndpoint = `/api/voucher-sales-new/${referenceId}/?show_all=true`;
                    } else {
                        detailEndpoint = `/api/vouchers/sales/${referenceId}/`;
                    }
                } else if (base.type === 'Receipt') {
                    // Fetch the actual ReceiptVoucher model to get voucher_type (series), receive_in, ref_no
                    detailEndpoint = `/api/vouchers/receipts/${referenceId}/`;
                } else if (base.type === 'Payment') {
                    // Fetch the actual PaymentVoucher model to get voucher_type (series), pay_from, ref_no
                    detailEndpoint = `/api/vouchers/payment/${referenceId}/`;
                } else if (base.type === 'Contra') {
                    detailEndpoint = `/api/vouchers/contra/${referenceId}/`;
                } else if (base.type === 'Journal') {
                    detailEndpoint = `/api/vouchers/journal/${referenceId}/`;
                } else if (base.type === 'Expenses' || base.type === 'Expense') {
                    detailEndpoint = `/api/vouchers/expenses/${referenceId}/`;
                } else if (base.type === 'Credit Note') {
                    detailEndpoint = `/api/vouchers/credit-note/${referenceId}/`;
                } else if (base.type === 'Debit Note') {
                    detailEndpoint = `/api/vouchers/debit-note/${referenceId}/`;
                }

                if (detailEndpoint) {
                    const detail = await httpClient.get<any>(detailEndpoint, undefined, options);

                    // ── Early return for Receipt / Payment ────────────────────────────
                    // These models don't have line items or addresses — just patch the
                    // key fields that are missing from the generic Voucher table.
                    if (base.type === 'Receipt' || base.type === 'Payment') {
                        const isReceipt = base.type === 'Receipt';
                        return {
                            ...base,
                            // ── Voucher Series (the master series name like 'recp1') ──
                            voucher_type: detail.voucher_type || base.voucher_type || detail.type || '',
                            // ── Bank/Cash account the money flows through ─────────────
                            receive_in: isReceipt
                                ? (detail.receive_in || detail.account || base.account || '')
                                : '',
                            account: isReceipt
                                ? (detail.receive_in || detail.account || base.account || '')
                                : (detail.pay_from || detail.pay_from_name || base.account || ''),
                            paid_from: !isReceipt
                                ? (detail.pay_from || detail.pay_from_name || base.account || '')
                                : '',
                            // ── Party names ────────────────────────────────────────────
                            party: detail.party || detail.customer || detail.pay_to_name || base.party || '',
                            // ── Other fields ──────────────────────────────────────────
                            ref_no: detail.ref_no || base.ref_no || '',
                            narration: detail.narration || base.narration || '',
                            voucher_number: detail.voucher_number || base.voucher_number || '',
                            // ── Allocation Items ──────────────────────────────────────
                            items: detail.items || [],
                        };
                    }

                    // ── Early return for Contra / Journal / Expenses / Credit Note / Debit Note ──
                    // These are simple flat models — just merge base + detail and keep all
                    // camelCase fields from the serializer as-is.
                    if (['Contra', 'Journal', 'Expenses', 'Expense', 'Credit Note', 'Debit Note'].includes(base.type)) {
                        return {
                            ...base,
                            ...detail,
                            // Ensure reference_id is always present for edit PUT calls
                            reference_id: detail.id || base.reference_id,
                            // Preserve camelCase fields from VoucherContraSerializer
                            fromAccount: detail.fromAccount || detail.from_account || base.from_account || '',
                            toAccount: detail.toAccount || detail.to_account || base.to_account || '',
                            from_account: detail.from_account || detail.fromAccount || base.from_account || '',
                            to_account: detail.to_account || detail.toAccount || base.to_account || '',
                            amount: detail.amount || base.amount || 0,
                            narration: detail.narration || base.narration || '',
                            voucher_number: detail.voucher_number || base.voucher_number || '',
                            voucher_series: detail.voucher_series || base.voucher_series || '',
                            // Contra forex fields (camelCase from serializer)
                            contraDeductChargesFrom: detail.contraDeductChargesFrom || detail.deduct_charges_from || '',
                            contraConversionCharges: detail.contraConversionCharges || detail.conversion_charges || 0,
                            contraFemaPurposeCode: detail.contraFemaPurposeCode || detail.fema_purpose_code || '',
                            contraConversionRate: detail.contraConversionRate || detail.conversion_rate || 0,
                            contraPaymentAmtForeign: detail.contraPaymentAmtForeign || detail.payment_amt_foreign || 0,
                            contraPaymentRate: detail.contraPaymentRate || detail.payment_rate || 0,
                            contraPaymentAmtINR: detail.contraPaymentAmtINR || detail.payment_amt_inr || 0,
                            contraReceiptAmtForeign: detail.contraReceiptAmtForeign || detail.receipt_amt_foreign || 0,
                            contraReceiptRate: detail.contraReceiptRate || detail.receipt_rate || 0,
                            contraReceiptAmtINR: detail.contraReceiptAmtINR || detail.receipt_amt_inr || 0,
                            contraForexGainLoss: detail.contraForexGainLoss || detail.forex_gain_loss || 0,
                            // Journal entry lines
                            entry_lines: detail.entry_lines || detail.entries || [],
                            entries: detail.entry_lines || detail.entries || [],
                            totalDebit: detail.totalDebit || detail.total_debit || 0,
                            totalCredit: detail.totalCredit || detail.total_credit || 0,
                        };
                    }


                    const isPurchase = (actualSource === 'purchase_voucher' || base.type === 'Purchase');

                    // ── Parse JSON address strings for sales vouchers ─────────────────
                    let billToAddrRaw = isPurchase
                        ? (detail.bill_from || '')
                        : (detail.bill_to || detail.bill_from || '');
                    let shipToAddrRaw = isPurchase
                        ? (detail.ship_from || '')
                        : (detail.ship_to || detail.ship_from || '');

                    // bill_to / ship_to for Sales vouchers is stored as JSON string
                    let billToObj: any = {};
                    let shipToObj: any = {};
                    if (!isPurchase) {
                        try {
                            if (typeof billToAddrRaw === 'string' && billToAddrRaw.startsWith('{')) {
                                billToObj = JSON.parse(billToAddrRaw);
                            } else if (typeof billToAddrRaw === 'object' && billToAddrRaw !== null) {
                                billToObj = billToAddrRaw;
                            }
                        } catch { billToObj = {}; }
                        try {
                            if (typeof shipToAddrRaw === 'string' && shipToAddrRaw.startsWith('{')) {
                                shipToObj = JSON.parse(shipToAddrRaw);
                            } else if (typeof shipToAddrRaw === 'object' && shipToAddrRaw !== null) {
                                shipToObj = shipToAddrRaw;
                            }
                        } catch { shipToObj = {}; }
                    }

                    const billToAddr = isPurchase
                        ? billToAddrRaw
                        : (billToObj.address_line_1 || billToAddrRaw || '');
                    const shipToAddr = isPurchase
                        ? shipToAddrRaw
                        : (shipToObj.address_line_1 || shipToAddrRaw || '');

                    // ── Invoice/voucher number ─────────────────────────────────────────────
                    // For Purchase: the user-facing voucher number is purchase_voucher_no (e.g. sedrfgt000012351)
                    // purchase_voucher_no is the auto-generated system voucher no shown on the ledger list
                    const voucherNum = isPurchase
                        ? (detail.purchase_voucher_no || base.voucher_number || '')
                        : (detail.sales_invoice_no || detail.voucher_number || base.voucher_number || '');

                    // ── Tax totals ────────────────────────────────────────────────────────
                    // Pull from the line items stored in detail when available;
                    // fall back to the aggregated fields already on the base Voucher record.
                    const lineItems: any[] = detail.line_items || detail.items || [];
                    const computedTaxable = lineItems.reduce((s: number, it: any) =>
                        s + parseFloat(it.taxable_value || it.taxableValue || '0'), 0);
                    const computedCgst = lineItems.reduce((s: number, it: any) =>
                        s + parseFloat(it.cgst_amount || it.cgst || '0'), 0);
                    const computedSgst = lineItems.reduce((s: number, it: any) =>
                        s + parseFloat(it.sgst_amount || it.sgst || '0'), 0);
                    const computedIgst = lineItems.reduce((s: number, it: any) =>
                        s + parseFloat(it.igst_amount || it.igst || '0'), 0);

                    return {
                        ...base,
                        // ── User-facing voucher number ─────────────────────────────────
                        voucher_number: voucherNum,
                        voucher_no: voucherNum,
                        // ── Sales Invoice Series ──────────────────────────────────────
                        voucher_name: detail.voucher_name || detail.voucher_series || base.voucher_name || '',
                        // ── Party / vendor info ────────────────────────────────────────
                        party: detail.vendor_name || detail.customer_name || base.party,
                        gstin: detail.gstin || base.gstin || '',
                        branch: detail.branch || base.branch || '',
                        // ── Addresses (BILL TO / SHIP TO as shown in the UI) ──────────
                        bill_to_address_1: billToAddr,
                        bill_to_address_2: billToObj.address_line_2 || '',
                        bill_to_address_3: billToObj.address_line_3 || '',
                        bill_to_city: billToObj.city || '',
                        bill_to_state: billToObj.state || '',
                        bill_to_pincode: billToObj.pincode || '',
                        bill_to_country: billToObj.country || '',
                        ship_to_address_1: shipToAddr,
                        ship_to_address_2: shipToObj.address_line_2 || '',
                        ship_to_address_3: shipToObj.address_line_3 || '',
                        ship_to_city: shipToObj.city || '',
                        ship_to_state: shipToObj.state || '',
                        ship_to_pincode: shipToObj.pincode || '',
                        ship_to_country: shipToObj.country || '',
                        // ── Supplier-specific header fields ───────────────────────────
                        supplier_invoice_no: detail.supplier_invoice_no || base.invoice_no || '',
                        supplier_invoice_date: detail.supplier_invoice_date || base.date || '',
                        purchase_voucher_series: detail.purchase_voucher_series || '',
                        grn_reference: detail.grn_reference || '',
                        input_type: detail.input_type || '',
                        invoice_in_foreign_currency: detail.invoice_in_foreign_currency || 'No',
                        // ── Nested sub-documents ──────────────────────────────────────
                        due_details: detail.due_details || null,
                        // ── Pass detail sub-objects directly for extraction ───────────
                        payment_details: detail.payment_details || null,
                        dispatch_details: detail.dispatch_details || null,
                        eway_bill_details: detail.eway_bill_details || null,
                        tax_type: detail.tax_type || '',
                        place_of_supply: detail.place_of_supply || '',
                        invoice_type: detail.invoice_type || '',
                        supply_inr_details: detail.supply_inr_details || null,
                        supply_foreign_details: detail.supply_foreign_details || null,
                        transit_details: detail.transit_details || null,
                        // ── Flat ledger fields pulled from supply sub-document ─────────
                        // purchase_ledger: the expense/purchase account debited in the entry
                        // (e.g. "Purchase Account", "Raw Materials" — NOT a cash/bank ledger)
                        purchase_ledger: detail.supply_inr_details?.purchase_ledger
                            || detail.supply_foreign_details?.purchase_ledger
                            || '',
                        sales_ledger: (detail as any).supply_inr_details?.sales_ledger
                            || (detail as any).supply_foreign_details?.sales_ledger
                            || '',
                        ledger_narration: detail.supply_inr_details?.description
                            || detail.supply_foreign_details?.description
                            || '',
                        // ── Tax aggregates (computed from line items, fallback to Voucher) ─
                        total_taxable_amount: computedTaxable || base.total_taxable_amount || 0,
                        totalTaxableAmount: computedTaxable || base.total_taxable_amount || 0,
                        total_cgst: computedCgst || base.total_cgst || 0,
                        totalCgst: computedCgst || base.total_cgst || 0,
                        total_sgst: computedSgst || base.total_sgst || 0,
                        totalSgst: computedSgst || base.total_sgst || 0,
                        total_igst: computedIgst || base.total_igst || 0,
                        totalIgst: computedIgst || base.total_igst || 0,
                        // ── Line items with normalised field names ────────────────────
                        items: lineItems.map((item: any) => ({
                            itemCode: item.item_code || item.itemCode || '',
                            itemName: item.item_name || item.itemName || '',
                            // ── Per-item Sales/Purchase Ledger ────────────────────────
                            salesLedger: item.sales_ledger || item.salesLedger || '',
                            sales_ledger: item.sales_ledger || item.salesLedger || '',
                            hsnSac: item.hsn_sac || item.hsnSac || '',
                            qty: parseFloat(item.qty || item.quantity || '0'),
                            uom: item.uom || '',
                            // item_rate is the actual DB column name returned by VoucherSalesItemsSerializer
                            itemRate: parseFloat(item.item_rate || item.rate || item.itemRate || '0'),
                            taxableValue: parseFloat(item.taxable_value || item.taxableValue || '0'),
                            igst: parseFloat(item.igst_amount || item.igst || '0'),
                            cgst: parseFloat(item.cgst_amount || item.cgst || '0'),
                            sgst: parseFloat(item.sgst_amount || item.sgst || '0'),
                            cess: parseFloat(item.cess_amount || item.cess || '0'),
                            gstRate: item.gst_rate || item.gstRate || '0',
                            invoiceValue: parseFloat(item.invoice_value || item.invoiceValue || '0'),
                            // Keep snake_case originals for write-back
                            igst_amount: parseFloat(item.igst_amount || item.igst || '0'),
                            cgst_amount: parseFloat(item.cgst_amount || item.cgst || '0'),
                            sgst_amount: parseFloat(item.sgst_amount || item.sgst || '0'),
                            cess_amount: parseFloat(item.cess_amount || item.cess || '0'),
                        })),
                    };
                }
            } catch (detailErr) {
                // Fall back to base if detail fetch fails
                console.warn('Could not fetch voucher detail:', detailErr);
            }
        }

        return base;
    }

    /**
     * Get all journal entries for the current tenant
     * Returns: Array of journal entry objects
     */
    async getJournalEntries(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/journal-entries/', undefined, options);
    }

    async getJournalEntriesReport(ledgerIdentifier?: number | string, startDate?: string, endDate?: string) {
        const params = new URLSearchParams();
        if (ledgerIdentifier) {
            if (typeof ledgerIdentifier === 'number' || !isNaN(Number(ledgerIdentifier))) {
                params.append('ledger_id', String(ledgerIdentifier));
            } else {
                params.append('ledger_name', String(ledgerIdentifier));
            }
        }
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        return httpClient.get<any[]>(`/api/journal-entries/report/?${params.toString()}`);
    }

    async saveVoucher(data: Voucher) {

        const normalizedData = { ...data, type: this.normalizeVoucherType(data.type) };
        const response = await httpClient.post<Voucher>('/api/vouchers/', normalizedData);

        const typeMap: Record<string, string> = {
            'sales': 'Sales',
            'purchase': 'Purchase',
            'payment': 'Payment',
            'receipt': 'Receipt',
            'contra': 'Contra',
            'journal': 'Journal'
        };

        return {
            ...response,
            type: (typeMap[response.type.toLowerCase()] || response.type) as any
        };
    }

    async saveVouchers(data: Voucher[]) {
        // Group vouchers by type to handle specialized endpoints
        const contraVouchers = data.filter(v => v.type === 'Contra');
        const journalVouchers = data.filter(v => v.type === 'Journal');
        const expensesVouchers = data.filter(v => v.type === 'Expenses');
        const debitNoteVouchers = data.filter(v => v.type === 'Debit Note');
        const otherVouchers = data.filter(v => !['Contra', 'Journal', 'Expenses', 'Debit Note'].includes(v.type));

        const promises = [];

        // Handle Contra Vouchers
        for (const voucher of contraVouchers) {
            promises.push(httpClient.post('/api/vouchers/contra/', voucher));
        }

        // Handle Journal Vouchers
        for (const voucher of journalVouchers) {
            promises.push(httpClient.post('/api/vouchers/journal/', voucher));
        }

        // Handle Expenses Vouchers
        for (const voucher of expensesVouchers) {
            promises.push(httpClient.post('/api/vouchers/expenses/', voucher));
        }

        // Handle Debit Note Vouchers
        for (const voucher of debitNoteVouchers) {
            const updateId = voucher.reference_id || voucher.id;
            if (updateId && !String(updateId).includes('T') && !String(updateId).includes('.')) {
                promises.push(this.updateDebitNote(updateId, voucher));
            } else {
                promises.push(this.saveDebitNote(voucher));
            }
        }

        // Handle others via bulk endpoint
        if (otherVouchers.length > 0) {
            const normalizedData = otherVouchers.map(v => ({ ...v, type: this.normalizeVoucherType(v.type) }));
            promises.push(httpClient.post<{ success: boolean }>('/api/vouchers/bulk/', normalizedData));
        }

        await Promise.all(promises);
        return { success: true };
    }

    async updateVoucher(id: number, data: Partial<any>) {
        const typeMap: Record<string, string> = {
            'sales': 'Sales',
            'purchase': 'Purchase',
            'payment': 'Payment',
            'receipt': 'Receipt',
            'contra': 'Contra',
            'journal': 'Journal'
        };

        const isPurchase = data.type === 'Purchase' || data.source === 'purchase_voucher' || (data.type && data.type.toLowerCase() === 'purchase');
        const isSales = data.type === 'Sales' || data.source === 'sales_voucher' || data.source === 'sales_invoice' || (data.type && data.type.toLowerCase() === 'sales');

        if (isPurchase && (data.reference_id || data.referenceId)) {
            const refId = data.reference_id || data.referenceId;
            const response = await httpClient.patch<any>(`/api/vouchers/purchase/${refId}/`, data);
            return {
                ...response,
                type: 'Purchase'
            };
        }

        if (isSales && (data.reference_id || data.referenceId)) {
            const refId = data.reference_id || data.referenceId;
            const response = await httpClient.patch<any>(`/api/vouchers/sales/${refId}/`, data);
            return {
                ...response,
                type: 'Sales'
            };
        }

        const normalizedData = data.type ? { ...data, type: this.normalizeVoucherType(data.type) } : data;
        const response = await httpClient.put<Voucher>(`/api/vouchers/${id}/`, normalizedData);

        return {
            ...response,
            type: (typeMap[response.type?.toLowerCase() || ''] || response.type) as any
        };
    }

    async deleteVoucher(id: number) {
        return httpClient.delete<{ success: boolean }>(`/api/vouchers/${id}/`);
    }

    // ============================================================================
    // AI FEATURES
    // ============================================================================
    // AI-powered features using Google Gemini

    /**
     * Extract invoice data from an uploaded image/PDF using AI
     * @param file - Invoice file (image or PDF)
     * @param type - Voucher type ("Sales" or "Purchase")
     * @param save - Whether to save the extracted voucher to database
     * @returns Extracted invoice data (party, items, amounts, etc.)
     */
    async extractInvoiceData(file: File, type?: string, save: boolean = true) {
        const formData = new FormData();
        formData.append('file', file);
        if (type) formData.append('type', type);
        formData.append('save', String(save));
        return httpClient.postFormData('/api/ai/extract-invoice/', formData);
    }

    async getExtractionAverageTime() {
        return httpClient.get<{ average_time_per_invoice: number }>('/api/extraction-average-time/');
    }

    /**
     * Update the extracted_data JSON stored in invoice_ocr_temp for a given cache record.
     * Called whenever the user edits invoice fields AFTER scanning.
     * OCR is NEVER re-run — only the stored JSON is updated.
     *
     * @param recordId      - The id returned by the backend in cache_record_id
     * @param extractedData - The full updated {invoice, items} object
     */
    async updateOcrCache(recordId: number, extractedData: { invoice: Record<string, any>; items: any[] }) {
        return httpClient.patch<{ success: boolean }>(
            `/api/ai/ocr-cache/${recordId}/update/`,
            { extracted_data: extractedData },
        );
    }

    /**
     * Zoho Adapter: Transform normalized OCR JSON into Zoho-compliant rows.
     * Reconstructs items, fixes alignment, and validates schema.
     */
    async transformToZoho(data: { invoices: any[] }) {
        return httpClient.post<any>('/api/zoho-adapter/', data);
    }

    /**
     * Zoho Reconstruct: Returns reconstructed invoices (Step 1-3)
     * before flattening. Used for UI display in Zoho mode.
     */
    async reconstructZohoInvoices(data: { invoices: any[] }) {
        return httpClient.post<any>('/api/zoho-reconstruct/', data);
    }

    // ============================================================================
    // BULK OCR STAGING WORKFLOW
    // ============================================================================
    // Methods for the fully editable staging workflow that uses invoice_ocr_temp

    /** Fetch all unresolved staged invoices for the current tenant. */
    async getStagedInvoices(uploadSessionId?: string) {
        const url = uploadSessionId
            ? `/api/ocr-staging/?upload_session_id=${encodeURIComponent(uploadSessionId)}`
            : '/api/ocr-staging/';
        return httpClient.get<any[]>(url);
    }

    /** Upload files + run OCR → save results to staging. Returns staged list. */
    async uploadToStaging(files: File[], uploadSessionId: string) {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f));
        formData.append('upload_session_id', uploadSessionId);
        return httpClient.postFormData<{ success: boolean; staged: any[] }>('/api/ocr-staging/', formData);
    }

    /**
     * Save edited extracted_data for a staged invoice and auto-revalidate.
     * Returns the updated row including new validation status.
     */
    async saveStagingEdit(fileHash: string, extractedData: any) {
        return httpClient.patch<any>(
            `/api/ocr-staging/${fileHash}/`,
            { extracted_data: extractedData },
        );
    }

    /** Delete a specific staged invoice row. */
    async deleteStagedInvoice(fileHash: string) {
        return httpClient.delete<{ success: boolean }>(`/api/ocr-staging/${fileHash}/`);
    }

    // ============================================================================
    // S3 DIRECT UPLOADS (PHASE 4)
    // ============================================================================

    /**
     * Generate S3 pre-signed POST policy for direct browser upload.
     */
    async getS3UploadPolicy(fileName: string) {
        return httpClient.post<any>('/api/s3-upload-policy/', { file_name: fileName });
    }

    /**
     * Upload file directly to S3 using a pre-signed policy.
     */
    async uploadToS3(url: string, fields: Record<string, string>, file: File) {
        const formData = new FormData();
        Object.entries(fields).forEach(([key, value]) => {
            formData.append(key, value);
        });
        formData.append('file', file);
        
        // Use postExternal to avoid sending local auth headers to AWS
        return httpClient.postExternal<any>(url, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    }

    /**
     * Finalize: upload all valid (vendor-found) staged invoices as purchase vouchers.
     * Invoices with missing vendors remain in staging.
     */
    async finalizeStagedInvoices(uploadSessionId?: string) {
        return httpClient.post<any>('/api/ocr-staging-finalize/', uploadSessionId ? { upload_session_id: uploadSessionId } : {});
    }


    // ============================================================================
    // SALES EXCEL UPLOAD WORKFLOW
    // ============================================================================

    /** Get blank template for Sales Excel Upload. */
    async getSalesExcelTemplate() {
        return httpClient.get<Blob>('/api/sales-excel/workflow/template/', undefined, { responseType: 'blob' });
    }

    /** Upload Sales Excel → returns in-memory invoices with validation status. */
    async uploadSalesExcelWorkflow(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        return httpClient.postFormData<{ session_id: string; invoices: any[] }>('/api/sales-excel/workflow/upload/', formData);
    }

    /** Update an invoice in the workflow or trigger global re-validation. */
    async updateSalesWorkflowInvoice(data: { session_id: string; index?: number; invoice?: any; revalidate_all?: boolean }) {
        return httpClient.post<{ invoices: any[] }>('/api/sales-excel/workflow/update/', data);
    }

    /** Finalize: create Sales Vouchers for all READY invoices. */
    async finalizeSalesWorkflow(sessionId: string) {
        return httpClient.post<{ summary: any; remaining: any[] }>('/api/sales-excel/workflow/finalize/', { session_id: sessionId });
    }

    /** Create a customer from the sales workflow screen. */
    async createCustomerFromSalesWorkflow(data: {
        customer_name: string;
        gstin?: string;
        branch?: string;
        address?: string;
        state?: string;
        email?: string;
        phone?: string;
    }) {
        return httpClient.post<{ status: string; customer_id: number }>('/api/customerportal/sales/customers/create/', data);
    }

    async extractStockItemsFromFile(file: File) {
        const formData = new FormData();
        formData.append('file', file);
        return httpClient.postFormData('/api/ai/stock-extract/', formData);
    }

    async sendAgentMessage(message: string, useGrounding: boolean, contextData?: string) {
        return httpClient.post('/api/agent/message/', { message, useGrounding, contextData });
    }

    async generateNarration(voucherData: any) {
        const response = await httpClient.post<{ narration: string }>('/api/ai/generate-narration/', voucherData);
        return response.narration;
    }

    async uploadVoucherImage(file: File) {
        const formData = new FormData();
        formData.append('image', file);
        return httpClient.postFormData('/api/ai/voucher-image/', formData);
    }

    // ============================================================================
    // AUTHENTICATION
    // ============================================================================
    // User login, registration, and session management

    /**
     * Login user with credentials
     * @param email - Branch Email address
     * @param username - Username
     * @param password - Password
     * @returns User data, tokens, and permissions
     */
    async login(email: string | null | undefined, username: string | null | undefined, password: string) {
        const data = await httpClient.post<any>('/api/auth/login/', { email, username, password });

        // Store tokens in the COMPANY domain slot
        if (data.access && data.refresh) {
            const { setCompanyTokens, clearTenantContext } = await import('./authService');
            setCompanyTokens(data.access, data.refresh);
            // Ensure master tokens don't bleed into company session
            clearTenantContext(); // reset, then set fresh below
        }

        // Save tenant and company info for company domain
        httpClient.saveAuthData({
            tenant_id: data.tenant_id,
            company_name: data.company_name,
        });

        return data;
    }

    // ─── MASTER DOMAIN API (ISOLATED) ─────────────────────────────────────────
    // All master API calls go to /api/master/* exclusively.
    // These methods MUST NOT be called from company-domain components.

    /**
     * Authenticate a Master (Platform Admin).
     * Tokens are stored in the MASTER domain slot (master_refresh_token).
     */
    async masterLogin(email: string, username: string, password: string) {
        const data = await httpClient.post<any>('/api/master/auth/login/', { email, username, password });

        if (data.access && data.refresh) {
            const { setMasterTokens, clearTenantContext } = await import('./authService');
            setMasterTokens(data.access, data.refresh);
            // Guarantee no tenant context leaks into master session
            clearTenantContext();
        }

        return data;
    }

    /**
     * Register a new Master (Platform Admin).
     * Tokens are stored in the MASTER domain slot.
     */
    async masterRegister(data: any) {
        const response = await httpClient.post<any>('/api/master/auth/register/', data);

        if (response.access && response.refresh) {
            const { setMasterTokens, clearTenantContext } = await import('./authService');
            setMasterTokens(response.access, response.refresh);
            clearTenantContext();
        }

        return response;
    }

    async masterRequestResetOTP(email: string) {
        return httpClient.post<{ success: boolean; message: string }>('/api/master/auth/request-otp/', { email });
    }

    async masterVerifyOTPOnly(email: string, otp: string) {
        return httpClient.post<{ success: boolean; message: string }>('/api/master/auth/verify-otp-only/', { email, otp });
    }

    async masterResetPassword(data: { email: string; otp: string; new_password: string }) {
        return httpClient.post<{ success: boolean; message: string }>('/api/master/auth/reset-password/', data);
    }

    /** List all companies owned by this Master Admin (/api/master/* only) */
    async getMasterCompanies() {
        return httpClient.get<any[]>('/api/master/companies/');
    }

    /** 
     * Create a new company (tenant) and its owner account in a single provisioning step.
     * Endpoint: POST /api/master/companies/
     */
    async createMasterCompany(provisioningData: {
        company_name: string;
        gstin: string;
        business_email: string;
        phone: string;
        owner: {
            username: string;
            email: string;
            password: string;
        }
    }) {
        const data = await httpClient.post<any>('/api/master/companies/', provisioningData);
        return data;
    }

    async getMasterStats(options: AxiosRequestConfig = {}) {
        return httpClient.get<any>('/api/master/stats/', undefined, options);
    }

    async getMasterRecentActivity(options: AxiosRequestConfig = {}) {
        return httpClient.get<any[]>('/api/master/recent-activity/', undefined, options);
    }

    async getMasterCompanyDetail(tenantId: string, options: AxiosRequestConfig = {}) {
        return httpClient.get<any>(`/api/master/companies/${tenantId}/`, undefined, options);
    }

    async getMasterSettings(options: AxiosRequestConfig = {}) {
        return httpClient.get<any>('/api/master/settings/', undefined, options);
    }

    async updateMasterSettings(data: any, options: AxiosRequestConfig = {}) {
        return httpClient.put<any>('/api/master/settings/', data, options);
    }

    async register(userData: {
        username: string;
        companyName: string;
        email?: string;
        password: string;
        phone: string;
        state: string;
        selectedPlan: string;
        logoFile?: File | null;
    }) {
        let data: any;
        if (userData.logoFile) {
            const formData = new FormData();
            formData.append('username', userData.username);
            formData.append('company_name', userData.companyName);
            formData.append('email', userData.email || '');
            formData.append('password', userData.password);
            formData.append('phone', userData.phone);
            formData.append('state', userData.state);
            formData.append('selected_plan', userData.selectedPlan);
            formData.append('logo', userData.logoFile);
            data = await httpClient.postFormData('/api/auth/register/', formData);
        } else {
            data = await httpClient.post('/api/auth/register/', {
                username: userData.username,
                company_name: userData.companyName,
                email: userData.email,
                password: userData.password,
                phone: userData.phone,
                state: userData.state,
                selected_plan: userData.selectedPlan,
            });
        }

        // Auto-login handling
        if (data.access && data.refresh) {
            httpClient.setTokens(data.access, data.refresh);
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('refreshToken');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
        }

        // Save tenant/company info if returned
        if (data.tenant_id && data.company_name) {
            httpClient.saveAuthData({
                tenant_id: data.tenant_id,
                company_name: data.company_name,
            });
        } else if (data.user) { // Fallback for older API responses
            httpClient.saveAuthData({
                tenant_id: data.user.tenant_id || data.user.tenantId,
                company_name: data.user.company_name || data.user.companyName,
            });
        }

        return data;
    }

    async logout() {
        try {
            await httpClient.post('/api/auth/logout/');
        } catch (e) {
            console.error('Logout failed', e);
        }
        httpClient.clearAuthData();
        window.location.href = '/login';
    }

    async createUserAccount(phone: string) {
        return httpClient.post<any>('/api/auth/create-account/', { phone });
    }

    async checkUserStatus() {
        return httpClient.get<{ isActive: boolean }>('/api/auth/check-status/');
    }

    async checkPhone(phone: string) {
        return httpClient.get<{ exists: boolean }>(`/api/auth/check-phone/?phone=${encodeURIComponent(phone)}`);
    }

    async forgotUserID(identifier: string) {
        return httpClient.post<{ success: boolean; message: string; identifiers?: string[] }>('/api/auth/forgot-userid/', { identifier });
    }

    async forgotPassword(data: { username: string; identifier: string; new_password: string }) {
        return httpClient.post<{ success: boolean; message: string }>('/api/auth/forgot-password/', data);
    }

    async requestResetOTP(email: string) {
        return httpClient.post<{ message: string }>('/api/auth/request-reset-otp/', { email });
    }

    async verifyOTPOnly(email: string, otp: string) {
        return httpClient.post<{ success: boolean; message: string }>('/api/auth/verify-otp-only/', { email, otp });
    }

    async verifyResetOTP(data: { email: string; otp: string; new_password: string }) {
        return httpClient.post<{ success: boolean; message: string }>('/api/auth/verify-reset-otp/', data);
    }

    // ============================================================================




    async getUserTables() {
        return httpClient.get<UserTable[]>('/api/user-tables/');
    }



    // ============================================================================
    // SALES VOUCHERS
    // ============================================================================
    // Sales/Receipt Voucher creation with strict validation rules

    /**
     * Get all receipt voucher types for dropdown
     * @param type - Optional voucher type to filter (e.g. 'sales')
     * @returns Array of receipt voucher types
     */
    async getReceiptVoucherTypes(type?: string) {
        let url = '/api/vouchers/receipt-types/';
        if (type) {
            url += `?type=${type}`;
        }
        return httpClient.get<any[]>(url);
    }

    /**
     * Get all customers for sales voucher dropdown
     * @returns Array of customers with id, name, gstin, state
     */
    async getSalesCustomers() {
        return httpClient.get<any[]>('/api/vouchers/sales/customers/');
    }

    /**
     * Get rich sales invoices for a specific customer from the new system
     * @param customerName - Name of the customer
     * @returns Array of sales invoices with payment details
     */
    async getRichCustomerSalesInvoices(customerName: string) {
        return httpClient.get<any[]>(`/api/voucher-sales-new/?customer_name=${encodeURIComponent(customerName)}&show_all=true`);
    }

    /**
     * Get customer address details for auto-filling bill-to and ship-to
     * @param customerId - Customer ledger ID
     * @returns Customer address data
     */
    async getCustomerAddress(customerId: number) {
        return httpClient.get<any>(`/api/vouchers/sales/customer-address/${customerId}/`);
    }

    /**
     * Determine tax type based on address logic
     * @param userState - User's company state
     * @param billToState - Customer's bill-to state
     * @param billToCountry - Customer's bill-to country
     * @returns Tax type (within_state, other_state, export)
     */
    async determineTaxType(userState: string, billToState: string, billToCountry: string) {
        return httpClient.post<{ tax_type: string }>('/api/vouchers/sales/determine-tax-type/', {
            user_state: userState,
            bill_to_state: billToState,
            bill_to_country: billToCountry
        });
    }

    /**
     * Upload supporting document for sales voucher
     * @param file - File to upload (JPG, JPEG, PDF only)
     * @param voucherId - Optional voucher ID if attaching to existing voucher
     * @returns Uploaded file details
     */
    async uploadSalesDocument(file: File, voucherId?: number) {
        const formData = new FormData();
        formData.append('file', file);
        if (voucherId) {
            formData.append('voucher_id', String(voucherId));
        }
        return httpClient.postFormData('/api/vouchers/sales/upload-document/', formData);
    }

    /**
     * Create a new sales voucher
     * @param data - Sales voucher data
     * @returns Created sales voucher
     */
    async createSalesVoucher(data: any) {
        return httpClient.post<any>('/api/vouchers/sales/', data);
    }

    /**
     * Get all sales vouchers with optional filters
     * @param filters - Optional filters (date_from, date_to, customer_id, status)
     * @returns Array of sales vouchers
     */
    async getSalesVouchers(filters?: any) {
        const params = new URLSearchParams();
        if (filters) {
            Object.keys(filters).forEach(key => {
                if (filters[key] !== undefined && filters[key] !== null) {
                    params.append(key, String(filters[key]));
                }
            });
        }

        const queryString = params.toString();
        const endpoint = queryString ? `/api/voucher-sales-new/?${queryString}` : '/api/voucher-sales-new/';

        return httpClient.get<any[]>(endpoint);
    }

    /**
     * Update sales voucher step and data
     * @param voucherId - Sales voucher ID
     * @param step - Current step number (1-5)
     * @param data - Step-specific data
     * @returns Updated sales voucher
     */
    async updateSalesVoucherStep(voucherId: number, step: number, data?: any) {
        return httpClient.post<any>(`/api/vouchers/sales/${voucherId}/update_step/`, {
            step,
            ...data
        });
    }

    /**
     * Complete sales voucher (mark as completed)
     * @param voucherId - Sales voucher ID
     * @returns Updated sales voucher
     */
    async completeSalesVoucher(voucherId: number) {
        return httpClient.post<any>(`/api/vouchers/sales/${voucherId}/complete/`);
    }

    /**
     * Helper to convert nested object to FormData for DRF MultipartParser
     */
    private toFormData(obj: any, formData: FormData = new FormData(), parentKey: string = '') {
        if (obj === null || obj === undefined) return formData;

        if (obj instanceof File) {
            formData.append(parentKey, obj);
        } else if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
                this.toFormData(item, formData, `${parentKey}[${index}]`);
            });
        } else if (typeof obj === 'object' && !(obj instanceof Date)) {
            Object.keys(obj).forEach(key => {
                this.toFormData(obj[key], formData, parentKey ? `${parentKey}.${key}` : key);
            });
        } else {
            formData.append(parentKey, obj);
        }
        return formData;
    }

    /**
     * Create a new sales voucher (Full JSON or Multipart Payload)
     * Mirrors the frontend state directly to backend keys
     */
    async createSalesVoucherNew(data: any) {
        // Detect if any files are present in the payload
        const hasFiles = (obj: any): boolean => {
            if (obj instanceof File) return true;
            if (Array.isArray(obj)) return obj.some(hasFiles);
            if (obj !== null && typeof obj === 'object') {
                return Object.values(obj).some(hasFiles);
            }
            return false;
        };

        if (hasFiles(data)) {
            const formData = this.toFormData(data);
            return httpClient.postFormData<any>('/api/voucher-sales-new/', formData);
        }

        return httpClient.post<any>('/api/voucher-sales-new/', data);
    }

    // ============================================================================
    // RBAC (Role-Based Access Control)
    // ============================================================================
    // User and role management with granular permissions

    /**
     * Get all roles for the current tenant
     * @returns Array of roles with permissions
     */
    async getRoles() {
        return httpClient.get<any[]>('/api/rbac/roles/');
    }

    /**
     * Get a specific role by ID
     * @param roleId - Role ID
     * @returns Role details with permissions
     */
    async getRole(roleId: number) {
        return httpClient.get<any>(`/api/rbac/roles/${roleId}/`);
    }

    /**
     * Create a new role
     * @param data - Role data (name, description, permissions)
     * @returns Created role
     */
    async createRole(data: any) {
        return httpClient.post<any>('/api/rbac/roles/', data);
    }

    /**
     * Update an existing role
     * @param roleId - Role ID
     * @param data - Updated role data
     * @returns Updated role
     */
    async updateRole(roleId: number, data: any) {
        return httpClient.put<any>(`/api/rbac/roles/${roleId}/`, data);
    }

    /**
     * Delete a role
     * @param roleId - Role ID
     * @returns Success status
     */
    async deleteRole(roleId: number) {
        return httpClient.delete<{ success: boolean }>(`/api/rbac/roles/${roleId}/`);
    }

    /**
     * Get the permissions structure (available pages and tabs)
     * @returns Structure of pages and tabs for permission configuration
     */
    async getPermissionsStructure() {
        return httpClient.get<any>('/api/rbac/roles/permissions_structure/');
    }

    /**
     * Get all users with their roles
     * @returns Array of users with role assignments
     */
    async getUsersWithRoles() {
        return httpClient.get<any[]>('/api/rbac/users/');
    }

    /**
     * Get a specific user with their roles
     * @param userId - User ID
     * @returns User details with roles and permissions
     */
    async getUserWithRoles(userId: number) {
        return httpClient.get<any>(`/api/rbac/users/${userId}/`);
    }

    /**
     * Create a new user with role assignment
     * @param data - User data (username, email, password, role_ids)
     * @returns Created user
     */
    async createUserWithRoles(data: any) {
        return httpClient.post<any>('/api/rbac/users/', data);
    }

    /**
     * Update a user
     * @param userId - User ID
     * @param data - Updated user data
     * @returns Updated user
     */
    async updateUser(userId: number, data: any) {
        return httpClient.put<any>(`/api/rbac/users/${userId}/`, data);
    }

    /**
     * Delete (deactivate) a user
     * @param userId - User ID
     * @returns Success status
     */
    async deleteUser(userId: number) {
        return httpClient.delete<{ success: boolean }>(`/api/rbac/users/${userId}/`);
    }

    /**
     * Get current user's permissions
     * @returns Current user's combined permissions from all roles
     */
    async getMyPermissions() {
        return httpClient.get<any>('/api/rbac/users/me/permissions/');
    }

    /**
     * Assign roles to a user
     * @param userId - User ID
     * @param roleIds - Array of role IDs to assign
     * @returns Updated user with new roles
     */
    async assignRolesToUser(userId: number, roleIds: number[]) {
        return httpClient.post<any>(`/api/rbac/users/${userId}/assign_roles/`, { role_ids: roleIds });
    }

    /**
     * Remove a specific role from a user
     * @param userId - User ID
     * @param roleId - Role ID to remove
     * @returns Updated user
     */
    async removeRoleFromUser(userId: number, roleId: number) {
        return httpClient.post<any>(`/api/rbac/users/${userId}/remove_role/`, { role_id: roleId });
    }

    /**
     * Get all user-role assignments
     * @returns Array of user-role assignments
     */
    async getUserRoles() {
        return httpClient.get<any[]>('/api/rbac/user-roles/');
    }

    /**
     * Get permission change logs
     * @returns Array of permission change audit logs
     */
    async getPermissionLogs() {
        return httpClient.get<any[]>('/api/rbac/permission-logs/');
    }

    // ============================================================================
    // DASHBOARD ANALYTICS
    // ============================================================================

    /**
     * Get dashboard analytics data (charts, KPIs, etc.)
     * @returns Dashboard data 
     */
    async getDashboardAnalytics() {
        return httpClient.get<any>('/api/dashboard/analytics/');
    }

    // ============================================================================
    // SUBSCRIPTION & USAGE
    // ============================================================================

    async getSubscriptionUsage() {
        return httpClient.get<{
            plan: string;
            used: number;
            limit: number | string;
            cycle_start: string;
            remaining: number | string;
        }>('/api/subscription/usage/');
    }

    async updateSubscriptionPlan(plan: string) {
        return httpClient.post<{ success: boolean }>('/api/subscription/update/', { plan });
    }


    // ============================================================================
    // HEALTH CHECK
    // ============================================================================

    async healthCheck() {
        return httpClient.get<{ status: string; timestamp: string }>('/api/health/');
    }
}

export const apiService = new ApiService();
export { API_BASE_URL } from './httpClient';
