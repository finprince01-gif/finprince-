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
import { httpClient } from './httpClient';

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
     * Get company details for the current tenant
     * Returns: Company name, address, GST, logo URL, etc.
     */
    async getCompanyDetails() {
        return httpClient.get<CompanyDetails>('/api/company-settings/');
    }

    /**
     * Save or update company details
     * Handles both JSON data and file uploads (for logo)
     * @param data - Company details including optional logo file
     */
    async saveCompanyDetails(data: CompanyDetails & { logoFile?: File | null }) {
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
            return httpClient.postFormData<CompanyDetails>('/api/company-settings/', formData);
        }
        // Otherwise, send JSON data
        return httpClient.post<CompanyDetails>('/api/company-settings/', data);
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
    async getLedgers() {
        return httpClient.get<Ledger[]>('/api/masters/ledgers/?page_size=10000&limit=10000');
    }

    async saveLedger(data: Ledger) {
        return httpClient.post<Ledger>('/api/masters/ledgers/', data);
    }

    async updateLedger(id: number, data: Partial<Ledger>) {
        return httpClient.put<{ success: boolean }>(`/api/masters/ledgers/${id}/`, data);
    }

    async deleteLedger(id: number) {
        return httpClient.delete<{ success: boolean }>(`/api/masters/ledgers/${id}/`);
    }

    // ============================================================================
    // MASTERS - LEDGER GROUPS
    // ============================================================================

    async getLedgerGroups() {
        return httpClient.get<LedgerGroupMaster[]>('/api/masters/ledger-groups/');
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
    async getRichVendors() {
        return httpClient.get<any[]>('/api/vendors/basic-details/?page_size=10000&limit=10000');
    }

    /**
     * Get RICH Customer Data (Email, Phone, GST)
     * Used for AI Context
     */
    async getRichCustomers() {
        return httpClient.get<any[]>('/api/customerportal/customer-master/?page_size=10000&limit=10000');
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

        const queryString = params.toString();
        const endpoint = queryString ? `/api/customerportal/sales-orders/?${queryString}` : '/api/customerportal/sales-orders/';
        return httpClient.get<any[]>(endpoint);
    }

    /**
     * Get GST Details (Addresses) for a specific Vendor
     * @param vendorId - Vendor Basic Detail ID
     */
    async getVendorGSTDetails(vendorId: number) {
        return httpClient.get<any[]>(`/api/vendors/gst-details/?vendor_basic_detail=${vendorId}`);
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


    async getStockItems() {
        return httpClient.get<StockItem[]>('/api/inventory/items/');
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
    async getPendingGRNs() {
        return httpClient.get<any[]>('/api/inventory/operations/pending-grns/');
    }

    /**
     * Get Job Work Outward Slips (for reference in Receipt)
     */
    async getJobWorkOutwardSlips() {
        return httpClient.get<any[]>('/api/inventory/operations/job-work/?operation_type=outward');
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
    async getVendorPurchaseInvoices(vendorName: string) {
        let url = `/api/vouchers/purchase/?vendor_name=${encodeURIComponent(vendorName)}`;
        return httpClient.get<any[]>(url);
    }

    /**
     * Get Sales Invoices (Vouchers) for a specific customer
     * @param customerName - Customer name to filter by
     */
    async getCustomerSalesInvoices(customerName: string) {
        let url = `/api/vouchers/sales/?customer_name=${encodeURIComponent(customerName)}`;
        return httpClient.get<any[]>(url);
    }

    async getHierarchy() {
        return httpClient.get<any[]>('/api/hierarchy/');
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
    async getVouchers(type?: string) {
        const normalizedType = type ? this.normalizeVoucherType(type) : undefined;
        const endpoint = normalizedType ? `/api/vouchers/?type=${normalizedType}` : '/api/vouchers/';
        const vouchers = await httpClient.get<Voucher[]>(endpoint);

        // Map backend lowercase types to frontend TitleCase
        const typeMap: Record<string, string> = {
            'sales': 'Sales',
            'purchase': 'Purchase',
            'payment': 'Payment',
            'receipt': 'Receipt',
            'contra': 'Contra',
            'journal': 'Journal'
        };

        return vouchers.map(v => ({
            ...v,
            type: (typeMap[v.type.toLowerCase()] || v.type) as any
        }));
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
        const otherVouchers = data.filter(v => v.type !== 'Contra' && v.type !== 'Journal');

        const promises = [];

        // Handle Contra Vouchers
        for (const voucher of contraVouchers) {
            promises.push(httpClient.post('/api/vouchers/contra/', voucher));
        }

        // Handle Journal Vouchers
        for (const voucher of journalVouchers) {
            promises.push(httpClient.post('/api/vouchers/journal/', voucher));
        }

        // Handle others via bulk endpoint
        if (otherVouchers.length > 0) {
            const normalizedData = otherVouchers.map(v => ({ ...v, type: this.normalizeVoucherType(v.type) }));
            promises.push(httpClient.post<{ success: boolean }>('/api/vouchers/bulk/', normalizedData));
        }

        await Promise.all(promises);
        return { success: true };
    }

    async updateVoucher(id: number, data: Partial<Voucher>) {
        const normalizedData = data.type ? { ...data, type: this.normalizeVoucherType(data.type) } : data;
        const response = await httpClient.put<Voucher>(`/api/vouchers/${id}/`, normalizedData);

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

    /**
     * Finalize: upload all valid (vendor-found) staged invoices as purchase vouchers.
     * Invoices with missing vendors remain in staging.
     */
    async finalizeStagedInvoices(uploadSessionId?: string) {
        return httpClient.post<any>('/api/ocr-staging-finalize/', uploadSessionId ? { upload_session_id: uploadSessionId } : {});
    }

    /** Create a vendor from the staging screen, then trigger re-validation. */
    async createVendorFromStaging(data: {
        vendor_name: string;
        gstin?: string;
        address?: string;
        state?: string;
        branch?: string;
    }) {
        return httpClient.post<{ status: string; vendor_id: number }>('/api/purchase/vendors/create/', data);
    }

    // ============================================================================
    // SALES EXCEL UPLOAD WORKFLOW
    // ============================================================================

    /** Get blank template for Sales Excel Upload. */
    async getSalesExcelTemplate() {
        return httpClient.get<Blob>('/api/sales-excel/workflow/template/');
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
     * @param email - User email
     * @param username - Username
     * @param password - Password
     * @returns User data, tokens, and permissions
     */
    async login(email: string | null | undefined, username: string | null | undefined, password: string) {
        const data = await httpClient.post<any>('/api/auth/login/', { email, username, password });

        // Save tokens to memory (cleared on refresh)
        if (data.access && data.refresh) {
            httpClient.setTokens(data.access, data.refresh);
            // Also clear legacy localStorage/sessionStorage tokens if present
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('refreshToken');
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
        }

        // Save tenant and company info
        httpClient.saveAuthData({
            tenant_id: data.tenant_id,
            company_name: data.company_name,
        });

        return data;
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
        if (filters?.date_from) params.append('date_from', filters.date_from);
        if (filters?.date_to) params.append('date_to', filters.date_to);
        if (filters?.customer_id) params.append('customer_id', String(filters.customer_id));
        if (filters?.status) params.append('status', filters.status);

        const queryString = params.toString();
        const endpoint = queryString ? `/api/vouchers/sales/?${queryString}` : '/api/vouchers/sales/';

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
     * Create a new sales voucher (Full JSON Payload)
     * Mirrors the frontend state directly to backend keys
     */
    async createSalesVoucherNew(data: any) {
        // If data contains files, we might need multipart, but for now assuming mostly JSON
        // If supportingDocument is a File, we handle it
        if (data.supportingDocument instanceof File || data.dispatchDetails?.dispatchDocument instanceof File) {
            const formData = new FormData();

            // Extracts files and appends them separate from JSON if needed, 
            // OR use DRF's nested multipart support if available.
            // For simplicity in DRF, usually sending specific file fields at top level or handling separately is best.
            // However, the user asked for "exact column from frontend", so we try to send JSON first.
            // If the user needs file upload, we might need a separate call or specific FormData construction.

            // Let's assume for now we send JSON, and if there are files, we might handle them slightly differently.
            // But standard JSON is safest for nested data unless we flatten it.

            // NOTE: Uploading files in deep nested structures via FormData is tricky without custom backend parsing.
            // For now, I will omit the file object if it's a File instance to avoid serialization errors,
            // or we suggest a separate upload step.
            // Let's proceed with standard JSON POST for data.

            // Iterate and remove File objects to avoid empty {} in JSON
            const cleanData = JSON.parse(JSON.stringify(data, (key, value) => {
                if (value instanceof File) return null;
                return value;
            }));

            // If we really need to send the file, we can append it to formData 
            // and send the rest as a JSON string field 'data'
            // formData.append('supporting_document', data.supportingDocument);
            // formData.append('data', JSON.stringify(cleanData));
            // return httpClient.postFormData('/api/voucher-sales-new/', formData);

            // Fallback: Just send JSON (files won't work yet without more logic)
            return httpClient.post<any>('/api/voucher-sales-new/', cleanData);
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
