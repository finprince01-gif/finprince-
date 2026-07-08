import finpixeLogo from '../../assets/finpixe with empty bg.png';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { useSubscriptionUsage } from '../../hooks/useSubscriptionUsage';
import type { Page, VoucherType, Ledger, StockItem, Voucher, SalesPurchaseVoucher, PaymentReceiptVoucher, ContraVoucher, JournalVoucher, JournalEntry, VoucherItem, ExtractedInvoiceData, CompanyDetails } from '../../types';
import Icon from '../../components/Icon';
import { apiService, httpClient } from '../../services';
import { showError, showSuccess, showInfo, confirm } from '../../utils/toast';
import InvoiceScannerModal from '../../components/InvoiceScannerModal';
import BulkInvoiceUploadModal from '../../components/SmartInvoiceUploadModal';
import TallyMasterScannerModal from '../../components/TallyMasterScannerModal';
import SalesExcelUploadWorkflow from '../../components/SalesExcelUploadWorkflow';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useOcrWorkflowStore } from '../../store/ocrWorkflowStore';
import SalesVoucher from './SalesVoucher';
import DebitNoteVoucher from './DebitNoteVoucher';
import PaymentVoucherSingle from './PaymentVoucherSingle';
import PaymentVoucherBulk from './PaymentVoucherBulk';
import ReceiptVoucher from './ReceiptVoucher';
import CreateGRNModal from '../../components/CreateGRNModal';
import BankUpload from './BankUpload';
import CreateNewVendorFullModal from '../../components/CreateNewVendorFullModal';
import { ChevronDown } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';





const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5003';

import { getXLSX } from '../../utils/xlsx';

interface VouchersPageProps {
  vouchers: Voucher[];
  ledgers: Ledger[];
  stockItems: StockItem[];
  onAddVouchers: (vouchers: Voucher[], saveToMySQL?: boolean) => void;
  prefilledData: ExtractedInvoiceData | null;
  clearPrefilledData: () => void;
  onInvoiceUpload: (file: File, voucherType?: string) => void;
  companyDetails: CompanyDetails;
  onNavigate: (page: Page, params?: any) => void;
  permissions: string[];
  viewVoucherData?: any;
  clearViewVoucherData?: () => void;
  navParams?: any;
}

const getTodayDate = () => new Date().toISOString().split('T')[0];
const UPLOAD_OPTIONS_CONFIG: Record<string, string[]> = {
  purchase: ["purchase_scan", "pending_purchase", "upload_for_excel"],
  sales: ["sales_excel_upload", "upload_for_excel"],
  payment: ["bank_upload", "upload_for_excel"],
  receipt: ["bank_upload", "upload_for_excel"],
  contra: ["upload_for_excel"],
  journal: ["upload_for_excel"],
  expenses: ["upload_for_excel"],
  "credit note": ["upload_for_excel"],
  "debit note": ["upload_for_excel"],
};

const normalizeStatutorySection = (str: string): string => {
  if (!str) return '';
  return str.replace(/[-\|]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
};

const findRate = (map: Record<string, number>, sectionStr: string): number => {
  if (!sectionStr) return 0;
  const normalizedSearch = normalizeStatutorySection(sectionStr);

  // 1. Direct match
  if (map[sectionStr] !== undefined) return map[sectionStr];

  // 2. Part split by pipe if applicable
  const part = sectionStr.includes('|') ? sectionStr.split('|')[1] : '';
  if (part && map[part] !== undefined) return map[part];

  // 3. Normalized matching
  for (const key of Object.keys(map)) {
    if (normalizeStatutorySection(key) === normalizedSearch || (part && normalizeStatutorySection(key) === normalizeStatutorySection(part))) {
      return map[key];
    }
  }
  return 0;
};

const VouchersPage: React.FC<VouchersPageProps> = ({ vouchers, ledgers, stockItems, onAddVouchers, prefilledData, clearPrefilledData, onInvoiceUpload, companyDetails, onNavigate, permissions = [], viewVoucherData, clearViewVoucherData, navParams }) => {

  const { hasTabAccess, isSuperuser } = usePermissions();

  const allVoucherTypes: { id: VoucherType; label: string; perm: string }[] = [
    { id: 'Sales', label: 'Sales', perm: 'Sales' },
    { id: 'Purchase', label: 'Purchase', perm: 'Purchase' },
    { id: 'Payment', label: 'Payment', perm: 'Payment' },
    { id: 'Receipt', label: 'Receipt', perm: 'Receipt' },
    { id: 'Contra', label: 'Contra', perm: 'Contra' },
    { id: 'Journal', label: 'Journal', perm: 'Journal' },
    { id: 'Expenses', label: 'Expenses', perm: 'Expenses' },
    { id: 'Credit Note', label: 'Credit Note', perm: 'Credit Note' },
    { id: 'Debit Note', label: 'Debit Note', perm: 'Debit Note' }
  ];

  // Filter voucher types based on permissions
  const availableVoucherTypes = isSuperuser
    ? allVoucherTypes
    : allVoucherTypes.filter(v => hasTabAccess('Vouchers', v.perm));

  const defaultVoucherType = availableVoucherTypes.length > 0 ? availableVoucherTypes[0].id : ('Sales' as VoucherType);

  const [voucherType, setVoucherType] = useState<VoucherType>(defaultVoucherType);
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(!!viewVoucherData);
  // Tracks whether we are viewing/editing an EXISTING voucher (stays true even after clicking Edit)
  const isExistingVoucherRef = useRef(!!viewVoucherData);
  const [drillDownDetails, setDrillDownDetails] = useState<any>(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);
  const [amendedVoucherDetails, setAmendedVoucherDetails] = useState<any>(null);
  const [isViewingAmended, setIsViewingAmended] = useState(false);
  const [activeOcrSessionId, setActiveOcrSessionId] = useState<string | null>(null);
  const [activeOcrFileHash, setActiveOcrFileHash] = useState<string | null>(null);
  const [activeOcrFileName, setActiveOcrFileName] = useState<string | null>(null);

  useEffect(() => {
    if (availableVoucherTypes.length > 0 && !availableVoucherTypes.find(v => v.id === voucherType)) {
      setVoucherType(availableVoucherTypes[0].id);
    }
  }, [availableVoucherTypes, voucherType]);

  useEffect(() => {
    const incomingType = (prefilledData as any)?.voucherType as VoucherType | undefined;
    if (incomingType && availableVoucherTypes.some(v => v.id === incomingType) && incomingType !== voucherType) {
      setVoucherType(incomingType);
    }
  }, [prefilledData, availableVoucherTypes, voucherType]);

  // Debug: Log ledgers data
  useEffect(() => {

    if (ledgers.length > 0) {


    }
  }, [ledgers]);

  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const [isScannerMenuOpen, setIsScannerMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const scannerMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [richVendors, setRichVendors] = useState<any[]>([]);
  const [richCustomers, setRichCustomers] = useState<any[]>([]);
  const [vendorGstDetails, setVendorGstDetails] = useState<any[]>([]);
  const [pendingGRNs, setPendingGRNs] = useState<any[]>([]);
  const [vendorAddresses, setVendorAddresses] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [inventoryLocations, setInventoryLocations] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  // Fresh ledgers fetched directly from API (supplements the prop to ensure completeness)
  const [freshLedgers, setFreshLedgers] = useState<Ledger[]>([]);
  // Hierarchy data (default/pre-built master ledger chart of accounts)
  const [hierarchy, setHierarchy] = useState<any[]>([]);

  // Fetch ledgers + hierarchy fresh on mount so dropdowns show ALL master ledgers (same as Sales Voucher)
  useEffect(() => {
    Promise.all([
      apiService.getLedgers().catch(() => []),
      apiService.getHierarchy().catch(() => [])
    ]).then(([ledgerData, hierarchyData]) => {
      const arr = Array.isArray(ledgerData) ? ledgerData : ((ledgerData as any)?.results ?? []);
      if (arr.length > 0) setFreshLedgers(arr);
      if (Array.isArray(hierarchyData) && hierarchyData.length > 0) setHierarchy(hierarchyData);
    }).catch(() => { });
  }, []);

  const fetchRichData = useCallback(async () => {
    // 1. Rich Vendors & Customers
    try {
      const [rv, rc] = await Promise.all([
        apiService.getRichVendors(),
        apiService.getRichCustomers()
      ]);
      setRichVendors(Array.isArray(rv) ? rv : ((rv as any).results || []));
      setRichCustomers(Array.isArray(rc) ? rc : ((rc as any).results || []));
    } catch (err) {
      console.warn('Failed to fetch Rich Vendors/Customers', err);
    }

    // 2. Vendor GST Details
    try {
      const gst = await httpClient.get<any[]>('/api/vendors/gst-details/');
      setVendorGstDetails(Array.isArray(gst) ? gst : ((gst as any).results || []));
    } catch (err) {
      console.warn('Failed to fetch Vendor GST Details', err);
    }

    // 3. Inventory Locations (Critical for Dropdown)
    try {
      const locs = await apiService.getInventoryLocations();
      const locsAny = locs as any;

      if (Array.isArray(locsAny)) {
        setInventoryLocations(locsAny);
      } else if (locsAny && locsAny.results && Array.isArray(locsAny.results)) {
        // Handle pagination if backend returns { results: [...] }
        setInventoryLocations(locsAny.results);
      } else {
        setInventoryLocations([]);
      }
    } catch (err) {
      console.warn('Failed to fetch Inventory Locations', err);
    }

    // 4. Services
    try {
      // Use the same endpoint filter as the Service List page
      const srv = await apiService.getServices('is_active=true');
      setServices(Array.isArray(srv) ? srv : ((srv as any).results || []));
    } catch (err) {
      console.warn('Failed to fetch Services', err);
    }

    // 4.1 Stock Items
    try {
      const items = await apiService.getStockItems();
      setInventoryItems(Array.isArray(items) ? items : ((items as any).results || []));
    } catch (err) {
      console.warn('Failed to fetch Stock Items', err);
    }

    // 5. Pending GRNs (Default load for Purchases)
    try {
      const grns = await apiService.getPendingGRNs({ grn_type: 'purchases' });
      setPendingGRNs(Array.isArray(grns) ? grns : ((grns as any).results || []));
    } catch (err) {
      console.warn('Failed to fetch Pending GRNs', err);
    }
  }, []);

  useEffect(() => {
    fetchRichData();
  }, [fetchRichData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (scannerMenuRef.current && !scannerMenuRef.current.contains(event.target as Node)) {
        setIsScannerMenuOpen(false);
      }
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const [isCreateGRNModalOpen, setIsCreateGRNModalOpen] = useState(false);

  // Invoice Scanner Modal state
  const [isInvoiceScannerOpen, setIsInvoiceScannerOpen] = useState(false);
  const [scannerFiles, setScannerFiles] = useState<FileList | null>(null);
  const [scanType, setScanType] = useState<'single' | 'bulk'>('single');
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [extractionMode, setExtractionMode] = useState<'ai_native' | 'tally' | 'zoho' | 'sap'>('ai_native');

  // Zoho / SAP Scanner refs
  const zohoScannerInputRef = useRef<HTMLInputElement>(null);
  const sapScannerInputRef = useRef<HTMLInputElement>(null);

  // Tally Master Scanner Modal state
  const [isTallyMasterScannerOpen, setIsTallyMasterScannerOpen] = useState(false);
  const [masterScannerFiles, setMasterScannerFiles] = useState<FileList | null>(null);
  const masterScannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadedInvoiceFiles, setUploadedInvoiceFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Bulk Upload State
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const bulkScannerInputRef = useRef<HTMLInputElement>(null);

  // Vendor Validation and Creation State
  const singleScanInputRef = useRef<HTMLInputElement>(null);

  // Vendor Validation and Creation State
  const [vendorValidationStatus, setVendorValidationStatus] = useState<string | null>(null);
  const [vendorMatchedBy, setVendorMatchedBy] = useState<string>('');
  const [isVendorDisabled, setIsVendorDisabled] = useState<boolean>(false);
  const [vendorConflictMsg, setVendorConflictMsg] = useState<string>('');
  const [extractedVendorData, setExtractedVendorData] = useState<any>(null);
  const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);


  // Subscription Usage
  const { subscriptionUsage, isLimitReached, refetch } = useSubscriptionUsage();
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isSalesExcelWorkflowOpen, setIsSalesExcelWorkflowOpen] = useState(false);
  const [isBankUploadModalOpen, setIsBankUploadModalOpen] = useState(false);
  const [isCreatingVoucher, setIsCreatingVoucher] = useState(false);

  const handleScannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setScannerFiles(files);
      setIsInvoiceScannerOpen(true);
    }
  };

  // Single-scan file input handler — enforces exactly one file
  const handleSingleScanFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      showError('PURCHASE SINGLE SCAN allows only one invoice. Use PURCHASE BULK SCAN for multiple invoices.');
      if (singleScanInputRef.current) singleScanInputRef.current.value = '';
      return;
    }
    setScanType('single');
    setScannerFiles(files);
    setIsInvoiceScannerOpen(true);
  };

  const handleMasterScannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setMasterScannerFiles(files);
      setIsTallyMasterScannerOpen(true);
    }
  };

  // Zoho multi-file handler
  const handleZohoScannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setExtractionMode('zoho');
      setScanType('bulk');
      setScannerFiles(files);
      setIsInvoiceScannerOpen(true);
    }
    if (zohoScannerInputRef.current) zohoScannerInputRef.current.value = '';
  };

  // SAP multi-file handler
  const handleSapScannerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setExtractionMode('sap');
      setScanType('bulk');
      setScannerFiles(files);
      setIsInvoiceScannerOpen(true);
    }
    if (sapScannerInputRef.current) sapScannerInputRef.current.value = '';
  };

  const handleInvoiceUploadResults = (results: any[]) => {
    if (!results || results.length === 0) return;
    const firstRow = results[0].invoice;
    const data = results[0].items;

    if (voucherType === 'Purchase') {
      const foreignCurrVal = firstRow['Foreign Currency'] || '';
      if (foreignCurrVal) {
        setInvoiceInForeignCurrency(foreignCurrVal.toLowerCase() === 'yes' ? 'Yes' : 'No');
      }

      const conversionRateVal = firstRow['Conversion Rate'] || '';
      if (conversionRateVal) setExchangeRate(conversionRateVal);

      const currencyVal = firstRow['Currency'] || '';
      if (currencyVal) setVendorBillingCurrency(currencyVal);

      const posVal = firstRow['Place of Supply'] || '';
      if (posVal) setBillFromState(posVal);

      // Summary / Due Details
      if (firstRow['TDS/TCS under Income Tax']) setPurchaseTdsIt(firstRow['TDS/TCS under Income Tax']);
      if (firstRow['Advance Paid']) setPurchaseAdvancePaid(firstRow['Advance Paid']);
      if (firstRow['Amount Due']) setPurchaseToPay(firstRow['Amount Due']);
      if (firstRow['Posting Note']) setPurchasePostingNote(firstRow['Posting Note']);

      // Transit Details
      if (firstRow['Received In']) setPurchaseTransitReceivedIn(firstRow['Received In']);
      if (firstRow['Mode of Transport']) setPurchaseTransitMode(firstRow['Mode of Transport']);
      if (firstRow['Received Date']) setPurchaseTransitReceiptDate(formatDateForInput(firstRow['Received Date']) || getTodayDate());
      if (firstRow['Received Time']) setPurchaseTransitReceiptTime(firstRow['Received Time']);
      if (firstRow['Received Quantity']) setPurchaseTransitReceivedQty(firstRow['Received Quantity']);
      if (firstRow['Delivery Type']) setPurchaseTransitDeliveryType(firstRow['Delivery Type']);
      if (firstRow['Transporter ID/GSTIN']) setPurchaseTransitTransporterId(firstRow['Transporter ID/GSTIN']);
      if (firstRow['Transporter Name']) setPurchaseTransitTransporterName(firstRow['Transporter Name']);
      if (firstRow['Vehicle No.']) setPurchaseTransitVehicleNo(firstRow['Vehicle No.']);
      if (firstRow['LR/GR/Consignment No']) setPurchaseTransitLrGrConsignment(firstRow['LR/GR/Consignment No']);

      const mappedItems = data.map((row: any, idx: number) => {
        const igst = parseFloat(row['IGST'] || row['Integrated Tax (IGST)'] || '0') || 0;
        const cgst = parseFloat(row['CGST'] || row['Central Tax (CGST)'] || '0') || 0;
        const sgst = parseFloat(row['SGST/UTGST'] || row['SGST'] || row['State Tax (SGST)'] || '0') || 0;
        const cess = parseFloat(row['Cess'] || '0') || 0;
        const taxable = parseFloat(row['Taxable Value'] || '0') || 0;
        // If Invoice Value not extracted directly, derive it
        const rawInv = parseFloat(row['Invoice Value'] || row['Item Amount'] || '0') || 0;
        const invoiceValue = rawInv > 0 ? rawInv : (taxable + igst + cgst + sgst + cess) || taxable;

        return {
          id: (Date.now() + idx).toString(),
          itemCode: row['Item Code'] || '',
          itemName: row['Item Name'] || '',
          hsnSac: row['HSN/SAC'] || '',
          qty: parseFloat(row['Qty'] || row['Quantity'] || '0') || 0,
          uom: row['UOM'] || '',
          rate: parseFloat(row['Item Rate'] || row['Rate'] || '0') || 0,
          taxableValue: taxable,
          foreignRate: parseFloat(row['Rate (FC)'] || '0') || 0,
          foreignAmount: parseFloat(row['Amount (FC)'] || '0') || 0,
          igst,
          cgst,
          sgst,
          cess,
          invoiceValue,
          description: row['Description'] || '',
          poRate: null,
          invoiceRate: parseFloat(row['Item Rate'] || row['Rate'] || '0') || null,
          rateMismatch: false,
          poQty: null,
          invoiceQty: parseFloat(row['Qty'] || row['Quantity'] || '0') || null,
          qtyMismatch: false,
          grnQty: null,
          sourcePoNo: null
        };
      });
      console.log('[VouchersPage] Mapped Purchase Items:', mappedItems);
      setPurchaseItems(mappedItems);
    } else {
      // For Sales, Payment, Receipt: use reconstructed ExtractedInvoiceData for sub-components
      const lineItems = data.map((row: any) => ({
        itemDescription: row['Item Name'] || '',
        hsnCode: row['HSN/SAC'] || '',
        quantity: parseFloat(row['Qty'] || row['Quantity'] || '0') || 0,
        rate: parseFloat(row['Item Rate'] || row['Rate'] || '0') || 0,
        amount: parseFloat(row['Invoice Value'] || row['Item Amount'] || '0') || 0,
        cgst: parseFloat(row['CGST'] || '0') || 0,
        sgst: parseFloat(row['SGST/UTGST'] || row['SGST'] || '0') || 0,
        igst: parseFloat(row['IGST'] || '0') || 0,
        cess: parseFloat(row['Cess'] || '0') || 0,
        taxableValue: parseFloat(row['Taxable Value'] || '0') || 0
      }));

      const computedTaxableValue = data.reduce((s: number, r: any) => s + (parseFloat(r['Taxable Value'] || '0') || 0), 0);
      const computedCgst = data.reduce((s: number, r: any) => s + (parseFloat(r['CGST'] || '0') || 0), 0);
      const computedSgst = data.reduce((s: number, r: any) => s + (parseFloat(r['SGST/UTGST'] || r['SGST'] || '0') || 0), 0);
      const computedIgst = data.reduce((s: number, r: any) => s + (parseFloat(r['IGST'] || '0') || 0), 0);
      const computedCess = data.reduce((s: number, r: any) => s + (parseFloat(r['Cess'] || '0') || 0), 0);
      const computedInvoiceValue = data.reduce((s: number, r: any) => s + (parseFloat(r['Invoice Value'] || r['Item Amount'] || '0') || 0), 0);

      const reconstructed: any = {
        sellerName: firstRow['Customer Name'] || firstRow['Vendor Name'] || firstRow['Buyer/Supplier - Mailing Name'] || '',
        invoiceNumber: firstRow['Sales Invoice No.'] || firstRow['Sales Invoice No'] || firstRow['Supplier Invoice No.'] || firstRow['Supplier Invoice No'] || '',
        invoiceDate: formatDateForInput(firstRow['Date'] || firstRow['Voucher Date'] || '') || getTodayDate(),
        subtotal: computedTaxableValue,
        cgstAmount: computedCgst,
        sgstAmount: computedSgst,
        igstAmount: computedIgst,
        cessAmount: computedCess,
        totalAmount: computedInvoiceValue,
        lineItems,
        gstin: firstRow['GSTIN'] || '',
        placeOfSupply: firstRow['Place of Supply'] || '',
        stateType: (firstRow['State Type'] || 'within').toLowerCase(),
        invoiceType: firstRow['Invoice Type'] || 'Regular',
        currency: firstRow['Currency'] || '',
        exchangeRate: parseFloat(firstRow['Conversion Rate'] || '0') || 0,
        billToAddress1: firstRow['Bill To - Address Line 1'] || '',
        billToAddress2: firstRow['Bill To - Address Line 2'] || '',
        billToCity: firstRow['Bill To - City'] || '',
        billToState: firstRow['Bill To - State'] || '',
        billToPincode: firstRow['Bill To - Pincode'] || '',
        billToCountry: firstRow['Bill To - Country'] || '',
        stateCess: firstRow['State Cess'] || '',
        tdsIncomeTax: firstRow['TDS/TCS under Income Tax'] || '',
        tdsGst: firstRow['TDS/TCS under GST'] || '',
        advanceAmount: firstRow['Advance'] || '',
        payable: firstRow['Payable'] || '',
        postingNote: firstRow['Posting Note:'] || '',
        dispatchFrom: firstRow['Dispatch From'] || '',
        modeOfTransport: firstRow['Mode of Transport'] || '',
        dispatchDate: firstRow['Dispatch Date'] || '',
        dispatchTime: firstRow['Dispatch Time'] || '',
        transporterId: firstRow['Transporter ID/GSTIN'] || '',
        transporterName: firstRow['Transporter Name'] || '',
        vehicleNo: firstRow['Vehicle No.'] || '',
        lrGrConsignment: firstRow['LR/GR/Consignment No'] || ''
      };
      console.log('[VouchersPage] Reconstructed PrefilledData:', reconstructed);
      setLocalPrefilledData(reconstructed);
    }
  };

  const openScanner = (mode: 'ai_native' | 'tally' = 'ai_native', type: 'single' | 'bulk' = 'single') => {
    setExtractionMode(mode);
    setScanType(type);
    if (isLimitReached && mode === 'ai_native') {
      handleLimitReached();
    } else if (mode === 'ai_native' && type === 'single') {
      singleScanInputRef.current?.click();
    } else {
      scannerInputRef.current?.click();
    }
  };

  // Local state for prefilled data to allow overrides from scanner
  const [localPrefilledData, setLocalPrefilledData] = useState<ExtractedInvoiceData | null>(prefilledData);
  useEffect(() => {
    setLocalPrefilledData(prefilledData);
  }, [prefilledData]);

  const handleClearPrefilledData = useCallback(() => {
    // Removed redundant clearViewVoucherData() that caused cyclic state wipe on edit mount
    clearPrefilledData();
    setLocalPrefilledData(null);
  }, [clearPrefilledData]);

  const handleEditOcrRow = useCallback((row: any) => {
    setIsBulkUploadOpen(false);
    setActiveOcrFileHash(row.file_hash);
    setActiveOcrFileName(row.file_name);
    const resolvedSessionId = row.uploadSessionId || useOcrWorkflowStore.getState().uploadSessionId || null;
    setActiveOcrSessionId(resolvedSessionId);

    const data = row.extracted_data || {};
    const invoice = data.invoice || data.header || data;
    const items = data.items || data.line_items || [];

    const prefilled: ExtractedInvoiceData = {
      invoiceNumber: row.invoice_number || row.invoice_no || invoice.invoice_no || invoice.invoice_number || '',
      sellerName: row.vendor_name || invoice.vendor_name || '',
      invoiceDate: row.invoice_date || invoice.invoice_date || '',
      gstin: row.vendor_gstin || row.gstin || invoice.vendor_gstin || invoice.gstin || '',
      subtotal: Number(row.total_taxable_value || invoice.total_taxable_value || invoice.taxable_value || 0),
      cgstAmount: Number(row.total_cgst || invoice.total_cgst || 0),
      sgstAmount: Number(row.total_sgst || invoice.total_sgst || 0),
      igstAmount: Number(row.total_igst || invoice.total_igst || 0),
      totalAmount: Number(row.total_amount || invoice.total_amount || invoice.invoice_total || 0),

      placeOfSupply: row.place_of_supply || invoice.place_of_supply || '',
      branch: row.branch || invoice.branch || '',
      billFrom: row.bill_from || invoice.bill_from || '',
      billTo: row.bill_to || invoice.bill_to || invoice.billing_address || '',

      dispatchFrom: row.dispatchFrom || row.dispatch_from || invoice.dispatchFrom || invoice.dispatch_from || '',
      modeOfTransport: row.modeOfTransport || row.mode_of_transport || invoice.modeOfTransport || invoice.mode_of_transport || '',
      dispatchDate: row.dispatchDate || row.dispatch_date || invoice.dispatchDate || invoice.dispatch_date || '',
      dispatchTime: row.dispatchTime || row.dispatch_time || invoice.dispatchTime || invoice.dispatch_time || '',
      transporterId: row.transporterId || row.transporter_id || invoice.transporterId || invoice.transporter_id || '',
      transporterName: row.transporterName || row.transporter_name || invoice.transporterName || invoice.transporter_name || '',
      vehicleNo: row.vehicleNo || row.vehicle_no || invoice.vehicleNo || invoice.vehicle_no || '',
      lrGrConsignment: row.lrGrConsignment || row.lr_gr_consignment || invoice.lrGrConsignment || invoice.lr_gr_consignment || '',

      tdsIncomeTax: String(data.sections?.due_details?.tds_it || invoice.sections?.due_details?.tds_it || data.tds_it || row.tds_it || invoice.tds_it || '0.00'),
      advanceAmount: String(data.sections?.due_details?.advance_paid || invoice.sections?.due_details?.advance_paid || data.advance_amount || row.advance_amount || invoice.advance_amount || '0.00'),
      postingNote: data.sections?.due_details?.posting_note || invoice.sections?.due_details?.posting_note || data.posting_note || row.posting_note || invoice.posting_note || '',

      lineItems: items.map((it: any) => {
        const qty = Number(it.qty || it.quantity || 1);
        const rate = Number(it.rate || it.item_rate || it['Item Rate'] || 0);
        const taxableValue = Number(it.taxable_value || it.taxableValue || it.taxable || it.total_amount || it.amount || (qty * rate));
        const cgst = Number(it.cgst_amount !== undefined ? it.cgst_amount : (it.cgst !== undefined ? it.cgst : 0));
        const sgst = Number(it.sgst_amount !== undefined ? it.sgst_amount : (it.sgst !== undefined ? it.sgst : 0));
        const igst = Number(it.igst_amount !== undefined ? it.igst_amount : (it.igst !== undefined ? it.igst : 0));
        const cess = Number(it.cess_amount !== undefined ? it.cess_amount : (it.cess !== undefined ? it.cess : 0));

        const rawInvVal = Number(it.invoice_value !== undefined ? it.invoice_value : (it.invoiceValue !== undefined ? it.invoiceValue : 0));
        const invoiceValue = rawInvVal > 0 ? rawInvVal : (taxableValue + cgst + sgst + igst + cess);

        return {
          itemDescription: it.description || it['Item Name'] || it.Description || '',
          hsnCode: it.hsn_sac || it.hsn || '',
          quantity: qty,
          rate: rate,
          amount: taxableValue,
          cgst,
          sgst,
          igst,
          cess,
          taxableValue,
          invoiceValue
        };
      })
    };

    setVoucherType('Purchase');
    setLocalPrefilledData(prefilled);
  }, [setIsBulkUploadOpen, setActiveOcrFileHash, setActiveOcrFileName, setActiveOcrSessionId, setLocalPrefilledData, setVoucherType]);

  const [returnToPage, setReturnToPage] = useState<string | null>(null);

  useEffect(() => {
    if (navParams?.editOcrRow) {
      handleEditOcrRow(navParams.editOcrRow);
      if (navParams?.returnTo) {
        setReturnToPage(navParams.returnTo);
      }
    }
  }, [navParams, handleEditOcrRow]);

  const handleLimitReached = () => {
    setIsUpgradeModalOpen(true);
  };

  // Common state
  const [date, setDate] = useState(getTodayDate());
  const handleDateChange = (val: string) => {
    const today = getTodayDate();
    setDate(val > today ? today : val);
  };
  const [party, setParty] = useState('');
  const [wasPartyAutoSet, setWasPartyAutoSet] = useState(false);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [narration, setNarration] = useState('');
  const [isNarrationLoading, setIsNarrationLoading] = useState(false);

  // Sales/Purchase
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState(getTodayDate());
  const [gstin, setGstin] = useState('');
  const [isInterState, setIsInterState] = useState(false);
  const [items, setItems] = useState<VoucherItem[]>([{ name: '', qty: 1, rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);

  // Payment/Receipt
  const [account, setAccount] = useState('');
  const [simpleAmount, setSimpleAmount] = useState(0);

  // Contra
  const [fromAccount, setFromAccount] = useState('');
  const [toAccount, setToAccount] = useState('');
  const [fromAccountBalance, setFromAccountBalance] = useState(0);
  const [toAccountBalance, setToAccountBalance] = useState(0);

  // Contra Forex state — all fields
  const [contraConversionRate, setContraConversionRate] = useState<number | ''>('');
  // Payment Details
  const [contraPaymentAmtForeign, setContraPaymentAmtForeign] = useState<number | ''>('');
  const [contraPaymentRate, setContraPaymentRate] = useState<number>(0);
  const [contraPaymentAmtINR, setContraPaymentAmtINR] = useState<number | ''>('');
  // Receipt Details
  const [contraReceiptAmtForeign, setContraReceiptAmtForeign] = useState<number | ''>('');
  const [contraReceiptRate, setContraReceiptRate] = useState<number>(0);
  const [contraReceiptAmtINR, setContraReceiptAmtINR] = useState<number | ''>('');
  // Forex Gain/Loss
  const [contraForexGainLoss, setContraForexGainLoss] = useState<number>(0);
  // Charges
  const [contraDeductChargesFrom, setContraDeductChargesFrom] = useState('');
  const [contraConversionCharges, setContraConversionCharges] = useState<number | ''>('');
  const [contraFemaPurposeCode, setContraFemaPurposeCode] = useState('');

  // FEMA Purpose Codes (static master list)
  const FEMA_CODES = [
    { code: 'S0001', desc: 'Indian Investment abroad in Equity/Debt (ODI)' },
    { code: 'S0002', desc: 'Indian Investment abroad in Real Estate' },
    { code: 'S0003', desc: 'Repatriation of Foreign Direct Investment (FDI)' },
    { code: 'S0004', desc: 'Repayment of Loans to Non-Residents' },
    { code: 'S0005', desc: 'Indian Portfolio Investment abroad' },
    { code: 'S0023', desc: 'Opening of Foreign Currency Account abroad' },
    { code: 'P0101', desc: 'Advance Payment against Imports' },
    { code: 'P0102', desc: 'Payment towards Imports (Settlement)' },
    { code: 'P0103', desc: 'Imports by 100% EOU Units' },
    { code: 'P0104', desc: 'Imports of Gold/Silver/Diamonds' },
    { code: 'P0108', desc: 'Goods imported for Merchanting Trade' },
    { code: 'P0217', desc: 'Freight Charges (Sea/Air/Road)' },
    { code: 'P0301', desc: 'Business Travel Expenses' },
    { code: 'P0306', desc: 'Education Expenses' },
    { code: 'P0501', desc: 'Construction Services' },
    { code: 'P0602', desc: 'General Insurance Premium' },
    { code: 'P0801', desc: 'Hardware Consultancy' },
    { code: 'P0802', desc: 'Software Implementation / Consultancy' },
    { code: 'P0803', desc: 'Data Processing Services' },
    { code: 'P0804', desc: 'News Agency Services' },
    { code: 'P0807', desc: 'Off-site Software Exports (Receipts)' },
    { code: 'P1002', desc: 'Legal Services' },
    { code: 'P1003', desc: 'Accounting / Auditing Services' },
    { code: 'P1004', desc: 'Management Consulting' },
    { code: 'P1005', desc: 'Advertising / Market Research' },
    { code: 'P1006', desc: 'R&D Services' },
    { code: 'P1009', desc: 'Architectural / Engineering Services' },
    { code: 'P0902', desc: 'Royalties / License Fees' },
    { code: 'S1301', desc: 'Maintenance of Close Relatives' },
    { code: 'S1302', desc: 'Gift (Personal)' },
    { code: 'S1303', desc: 'Donations to Charity' },
    { code: 'S1401', desc: 'Tax Refunds' },
  ];

  // Purchase Voucher Tabs
  const [purchaseActiveTab, setPurchaseActiveTab] = useState<'supplier' | 'supply' | 'supply_foreign' | 'supply_inr' | 'due' | 'transit'>('supplier');
  const [creditNoteActiveTab, setCreditNoteActiveTab] = useState<'invoice' | 'items' | 'items_foreign' | 'items_inr' | 'due' | 'transit'>('invoice');
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState('');
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState('');
  const [creditNoteReason, setCreditNoteReason] = useState('');

  // Credit Note specific states
  const [cnDate, setCnDate] = useState(getTodayDate());
  const [cnVoucherConfigs, setCnVoucherConfigs] = useState<any[]>([]);
  const [selectedCnConfig, setSelectedCnConfig] = useState<string>('');
  const [cnVoucherNumber, setCnVoucherNumber] = useState('Auto-generated');
  const [cnCustomer, setCnCustomer] = useState('');
  const [cnCustomerId, setCnCustomerId] = useState('');
  const [cnBranch, setCnBranch] = useState('');
  const [cnSelectedSalesInvoices, setCnSelectedSalesInvoices] = useState<string[]>([]);
  const [cnSalesInvoiceDate, setCnSalesInvoiceDate] = useState('');
  const [cnCustomerDebitNoteNo, setCnCustomerDebitNoteNo] = useState('');
  const [cnCustomerDebitNoteDate, setCnCustomerDebitNoteDate] = useState(getTodayDate());
  const [cnGstin, setCnGstin] = useState('');
  const [cnGrnRefNo, setCnGrnRefNo] = useState('');
  const [cnBillFrom, setCnBillFrom] = useState('');
  const [cnShipFrom, setCnShipFrom] = useState('');
  const [cnSameAsBillFrom, setCnSameAsBillFrom] = useState(false);
  const [cnInputType, setCnInputType] = useState<string[]>([]); // IGST, CGST, SGST, Cess
  const [cnInForeignCurrency, setCnInForeignCurrency] = useState<'Yes' | 'No'>('No');
  const [cnIsFinancial, setCnIsFinancial] = useState<'Yes' | 'No'>('No');
  const [cnExchangeRate, setCnExchangeRate] = useState('1.00');
  const [cnUploadFile, setCnUploadFile] = useState<File | null>(null);
  const [cnSalesInvoicesList, setCnSalesInvoicesList] = useState<any[]>([]);
  const [isCnInvoiceDropdownOpen, setIsCnInvoiceDropdownOpen] = useState(false);
  const [cnCreditPeriod, setCnCreditPeriod] = useState('0');
  const [cnDueDate, setCnDueDate] = useState(getTodayDate());
  const [cnTdsIt, setCnTdsIt] = useState('0.00');
  const [cnPostingNote, setCnPostingNote] = useState('');
  const [cnReverseGstTcs, setCnReverseGstTcs] = useState<'Yes' | 'No'>('No');
  const [cnReverseGstTds, setCnReverseGstTds] = useState<'Yes' | 'No'>('No');
  const [cnGstTdsTcsAmount, setCnGstTdsTcsAmount] = useState('0.00');
  const [cnReverseIncomeTaxTcs, setCnReverseIncomeTaxTcs] = useState<'Yes' | 'No'>('No');
  const [cnReverseIncomeTaxTds, setCnReverseIncomeTaxTds] = useState<'Yes' | 'No'>('No');
  const [cnIncomeTaxTdsTcsAmount, setCnIncomeTaxTdsTcsAmount] = useState('0.00');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [cnAdvanceAmount, setCnAdvanceAmount] = useState('0.00');
  const [cnPayableAmount, setCnPayableAmount] = useState('0.00');
  const [cnTermsConditions, setCnTermsConditions] = useState('');
  const [cnAppliedInvoices, setCnAppliedInvoices] = useState<any[]>([]); // Data Grid state

  // Synchronize Credit Note active tab when foreign currency toggle changes
  useEffect(() => {
    if (voucherType === 'Credit Note') {
      if (cnInForeignCurrency === 'Yes' && creditNoteActiveTab === 'items') {
        setCreditNoteActiveTab('items_foreign');
      } else if (cnInForeignCurrency === 'No' && (creditNoteActiveTab === 'items_foreign' || creditNoteActiveTab === 'items_inr')) {
        setCreditNoteActiveTab('items');
      }
    }
  }, [cnInForeignCurrency, voucherType, creditNoteActiveTab]);

  // Sync cnAppliedInvoices with cnSelectedSalesInvoices
  useEffect(() => {
    setCnAppliedInvoices(prev => {
      const updated = [...prev];
      // Add missing invoices
      cnSelectedSalesInvoices.forEach(invNo => {
        if (!updated.some(a => a.invoiceNo === invNo)) {
          updated.push({ invoiceNo: invNo, appliedAmount: '0.00' });
        }
      });
      // Remove invoices no longer selected
      return updated.filter(a => cnSelectedSalesInvoices.includes(a.invoiceNo));
    });
  }, [cnSelectedSalesInvoices]);

  // Sync cnSalesInvoiceDate with cnSelectedSalesInvoices multiple selection
  useEffect(() => {
    if (cnSelectedSalesInvoices.length > 0 && cnSalesInvoicesList.length > 0) {
      const selectedDates = cnSelectedSalesInvoices.map(no => {
        const inv = cnSalesInvoicesList.find(i => i.voucher_no === no);
        return inv ? inv.date : '';
      }).filter(date => date !== '');

      setCnSalesInvoiceDate(selectedDates.join(', '));
    } else {
      setCnSalesInvoiceDate('');
    }
  }, [cnSelectedSalesInvoices, cnSalesInvoicesList]);

  // Credit Note Transit Details (Matched to Purchase structure)
  const [cnTransitReceivedIn, setCnTransitReceivedIn] = useState('');
  const [cnTransitMode, setCnTransitMode] = useState('Road');
  const [cnTransitReceiptDate, setCnTransitReceiptDate] = useState(getTodayDate());
  const [cnTransitReceiptTime, setCnTransitReceiptTime] = useState('');
  const [cnTransitDeliveryType, setCnTransitDeliveryType] = useState('Self');
  const [cnTransitTransporterId, setCnTransitTransporterId] = useState('');
  const [cnTransitTransporterName, setCnTransitTransporterName] = useState('');
  const [cnTransitVehicleNo, setCnTransitVehicleNo] = useState('');
  const [cnTransitLrGrConsignment, setCnTransitLrGrConsignment] = useState('');
  const [cnTransitDocument, setCnTransitDocument] = useState<File | null>(null);
  const [cnTransitUptoPortBolNo, setCnTransitUptoPortBolNo] = useState('');
  const [cnTransitUptoPortBolDate, setCnTransitUptoPortBolDate] = useState('');
  const [cnTransitUptoPortShippingBillNo, setCnTransitUptoPortShippingBillNo] = useState('');
  const [cnTransitUptoPortShippingBillDate, setCnTransitUptoPortShippingBillDate] = useState('');
  const [cnTransitUptoPortShipPortCode, setCnTransitUptoPortShipPortCode] = useState('');
  const [cnTransitUptoPortOriginCity, setCnTransitUptoPortOriginCity] = useState('');
  const [cnTransitUptoPortOriginCountry, setCnTransitUptoPortOriginCountry] = useState('');
  const [cnTransitUptoPortVesselFlightNo, setCnTransitUptoPortVesselFlightNo] = useState('');
  const [cnTransitUptoPortPortOfLoading, setCnTransitUptoPortPortOfLoading] = useState('');
  const [cnTransitUptoPortPortOfDischarge, setCnTransitUptoPortPortOfDischarge] = useState('');
  const [cnTransitUptoPortFinalDestCity, setCnTransitUptoPortFinalDestCity] = useState('');
  const [cnTransitUptoPortFinalDestCountry, setCnTransitUptoPortFinalDestCountry] = useState('');
  const [cnTransitUptoPortRrNo, setCnTransitUptoPortRrNo] = useState('');
  const [cnTransitUptoPortRrDate, setCnTransitUptoPortRrDate] = useState('');
  const [cnTransitUptoPortFnrNo, setCnTransitUptoPortFnrNo] = useState('');
  const [cnTransitUptoPortStationLoading, setCnTransitUptoPortStationLoading] = useState('');
  const [cnTransitUptoPortStationDischarge, setCnTransitUptoPortStationDischarge] = useState('');
  const [cnItems, setCnItems] = useState([
    { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 0, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null as number | null, invoiceRate: null as number | null, rateMismatch: false, poQty: null as number | null, invoiceQty: null as number | null, qtyMismatch: false, grnQty: null as number | null, sourcePoNo: null as string | null, salesInvoiceNo: null as string | null, financialAmount: 0 }
  ]);

  // Automatic calculation for Reverse IT (TCS/TDS)
  useEffect(() => {
    if (cnReverseIncomeTaxTcs === 'Yes' || cnReverseIncomeTaxTds === 'Yes') {
      let totalReverseIt = 0;

      cnSelectedSalesInvoices.forEach(invNo => {
        const cleanInvNo = String(invNo || '').trim().toLowerCase();

        // Find the original invoice details from the list (which was fetched when customer was selected)
        const invoice = cnSalesInvoicesList.find(i =>
          String(i.sales_invoice_no || '').trim().toLowerCase() === cleanInvNo ||
          String(i.voucher_no || '').trim().toLowerCase() === cleanInvNo
        );

        if (invoice) {
          // Check for nested payment_details (full view) or flattened fields (list view)
          const origTaxable = parseFloat(String(invoice.payment_details?.payment_taxable_value || invoice.taxable_value || 0)) || 0;
          // Handles both TCS Payable and TDS Receivable depending on original invoice context
          const origItAmount = parseFloat(String(invoice.payment_details?.payment_tds_income_tax || invoice.tcs_amount || 0)) || 0;

          if (origTaxable > 0 && origItAmount > 0) {
            // Find portion of Credit Note taxable value linked to this specific invoice
            const cnTaxableForThisInv = cnItems
              .filter(item => {
                const itemInvNo = String(item.salesInvoiceNo || item.sourcePoNo || '').trim().toLowerCase();
                return itemInvNo === cleanInvNo;
              })
              .reduce((sum, item) => sum + (parseFloat(String(item.taxableValue)) || 0), 0);

            if (cnTaxableForThisInv > 0) {
              // Formula: (Credit Note Taxable Value / Original Invoice Taxable Value) * Original IT Amount (TCS/TDS)
              let reverseItValue = (cnTaxableForThisInv / origTaxable) * origItAmount;

              // Validation: Must be less than or equal to the IT amount linked to the Sales Invoice
              if (reverseItValue > origItAmount) {
                reverseItValue = origItAmount;
              }

              totalReverseIt += reverseItValue;
            }
          }
        }
      });

      setCnIncomeTaxTdsTcsAmount(totalReverseIt.toFixed(2));
    } else {
      setCnIncomeTaxTdsTcsAmount('0.00');
    }
  }, [cnReverseIncomeTaxTcs, cnReverseIncomeTaxTds, cnSelectedSalesInvoices, cnSalesInvoicesList, cnItems]);

  const salesLedgerOptions = useMemo(() => {
    // Include both user-created ledgers and default hierarchy ledgers
    const userLedgerNames = ledgers.map(l => l.name);
    const defaultLedgerNames = hierarchy
      .map(r => r.ledger_1)
      .filter(name => {
        if (!name) return false;
        const n = name.toLowerCase().trim();
        return !['purchase account', 'sales account'].includes(n);
      });

    return Array.from(new Set([...userLedgerNames, ...defaultLedgerNames])).filter(Boolean) as string[];
  }, [ledgers, hierarchy]);

  const calculateCreditNoteTotals = () => {
    return cnItems.reduce((acc, item) => ({
      taxableValue: acc.taxableValue + (item.taxableValue || 0),
      cgst: acc.cgst + (item.cgst || 0),
      sgst: acc.sgst + (item.sgst || 0),
      igst: acc.igst + (item.igst || 0),
      cess: acc.cess + (item.cess || 0),
      invoiceValue: acc.invoiceValue + (item.invoiceValue || 0)
    }), { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, invoiceValue: 0 });
  };

  const [grnRefNo, setGrnRefNo] = useState('');
  // Unified full-address fields (single textarea per section)
  // Granular address fields
  const [billFromAddress1, setBillFromAddress1] = useState('');
  const [billFromAddress2, setBillFromAddress2] = useState('');
  const [billFromAddress3, setBillFromAddress3] = useState('');
  const [billFromCity, setBillFromCity] = useState('');
  const [billFromPincode, setBillFromPincode] = useState('');
  const [billFromState, setBillFromState] = useState('');
  const [billFromCountry, setBillFromCountry] = useState('India');

  const [shipFromAddress1, setShipFromAddress1] = useState('');
  const [shipFromAddress2, setShipFromAddress2] = useState('');
  const [shipFromAddress3, setShipFromAddress3] = useState('');
  const [shipFromCity, setShipFromCity] = useState('');
  const [shipFromPincode, setShipFromPincode] = useState('');
  const [shipFromState, setShipFromState] = useState('');
  const [shipFromCountry, setShipFromCountry] = useState('India');

  const [sameAsBillFrom, setSameAsBillFrom] = useState(false);

  // Sync Ship From with Bill From when toggle is on
  useEffect(() => {
    if (sameAsBillFrom) {
      setShipFromAddress1(billFromAddress1);
      setShipFromAddress2(billFromAddress2);
      setShipFromAddress3(billFromAddress3);
      setShipFromCity(billFromCity);
      setShipFromPincode(billFromPincode);
      setShipFromState(billFromState);
      setShipFromCountry(billFromCountry);
    }
  }, [
    sameAsBillFrom,
    billFromAddress1,
    billFromAddress2,
    billFromAddress3,
    billFromCity,
    billFromPincode,
    billFromState,
    billFromCountry
  ]);

  // Sync Credit Note Ship From with Bill From when toggle is on
  useEffect(() => {
    if (cnSameAsBillFrom) {
      setShipFromAddress1(billFromAddress1);
      setShipFromAddress2(billFromAddress2);
      setShipFromAddress3(billFromAddress3);
      setShipFromCity(billFromCity);
      setShipFromPincode(billFromPincode);
      setShipFromState(billFromState);
      setShipFromCountry(billFromCountry);
    }
  }, [
    cnSameAsBillFrom,
    billFromAddress1,
    billFromAddress2,
    billFromAddress3,
    billFromCity,
    billFromPincode,
    billFromState,
    billFromCountry
  ]);


  const [purchaseInputTypes, setPurchaseInputTypes] = useState<string[]>(['Intrastate']); // Default to Same State
  const [invoiceInForeignCurrency, setInvoiceInForeignCurrency] = useState<'Yes' | 'No'>('No');
  const [vendorBillingCurrency, setVendorBillingCurrency] = useState('');
  const [purchaseSupportingDocument, setPurchaseSupportingDocument] = useState<File | null>(null);
  const [purchasePreviewUrl, setPurchasePreviewUrl] = useState<string | null>(null);
  const [isPurchasePreviewModalOpen, setIsPurchasePreviewModalOpen] = useState(false);

  useEffect(() => {
    if (purchaseSupportingDocument) {
      const url = URL.createObjectURL(purchaseSupportingDocument);
      setPurchasePreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPurchasePreviewUrl(null);
    }
  }, [purchaseSupportingDocument]);

  // Purchase Supply Details Tab State
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('');
  const [selectedPurchasePOs, setSelectedPurchasePOs] = useState<string[]>([]);
  const [isPoDropdownOpen, setIsPoDropdownOpen] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(''); // Added exchangeRate state
  const [purchaseLedger, setPurchaseLedger] = useState('');
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [selectedPurchaseItems, setSelectedPurchaseItems] = useState<string[]>([]);
  const [showPurchaseMismatches, setShowPurchaseMismatches] = useState(false);
  const [purchaseItems, setPurchaseItems] = useState([
    { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 0, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', poRate: null as number | null, invoiceRate: null as number | null, rateMismatch: false, poQty: null as number | null, invoiceQty: null as number | null, qtyMismatch: false, grnQty: null as number | null, sourcePoNo: null as string | null }
  ]);

  const calculatePurchaseTotals = () => {
    return purchaseItems.reduce((acc, item) => ({
      taxableValue: acc.taxableValue + (item.taxableValue || 0),
      cgst: acc.cgst + (item.cgst || 0),
      sgst: acc.sgst + (item.sgst || 0),
      igst: acc.igst + (item.igst || 0),
      cess: acc.cess + (item.cess || 0),
      invoiceValue: acc.invoiceValue + (item.invoiceValue || 0)
    }), { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, invoiceValue: 0 });
  };

  // Purchase Due Details State
  const [purchaseTdsIt, setPurchaseTdsIt] = useState('0.00');
  const [purchaseTaxIsTcs, setPurchaseTaxIsTcs] = useState(false); // true = TCS (add to amount due), false = TDS (subtract)
  const [purchaseAvailableTcsSections, setPurchaseAvailableTcsSections] = useState<string[]>([]);
  const [purchaseAvailableTdsSections, setPurchaseAvailableTdsSections] = useState<string[]>([]);
  const [purchaseSelectedStatutorySection, setPurchaseSelectedStatutorySection] = useState<string>('');
  const [purchaseAutoTdsEnabled, setPurchaseAutoTdsEnabled] = useState(false);
  const [vendorTaxType, setVendorTaxType] = useState<string>('NONE');
  const [purchaseAdvancePaid, setPurchaseAdvancePaid] = useState('0.00');
  const [purchaseToPay, setPurchaseToPay] = useState('0.00');
  const [purchasePostingNote, setPurchasePostingNote] = useState('');
  const [purchaseTerms, setPurchaseTerms] = useState('');
  const [purchaseAdvanceRefs, setPurchaseAdvanceRefs] = useState<Array<{
    id: number;
    date: string;
    refNo: string;
    amount: string;
    originalAmount: string;
    remainingAmount: string;
    appliedNow: string;
  }>>([]);

  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
  const [masterTermsData, setMasterTermsData] = useState<any>(null);

  // Draft states for Edit Masters modal fields
  const [draftCreditPeriod, setDraftCreditPeriod] = useState('');
  const [draftCreditTerms, setDraftCreditTerms] = useState('');
  const [draftPenaltyTerms, setDraftPenaltyTerms] = useState('');
  const [draftDeliveryTerms, setDraftDeliveryTerms] = useState('');
  const [draftWarrantyDetails, setDraftWarrantyDetails] = useState('');
  const [draftForceMajeure, setDraftForceMajeure] = useState('');
  const [draftDisputeTerms, setDraftDisputeTerms] = useState('');

  // Purchase Transit Details State
  const [purchaseTransitMode, setPurchaseTransitMode] = useState('Road');

  // Basic / Road Details (Left Column)
  const [purchaseTransitReceivedIn, setPurchaseTransitReceivedIn] = useState(''); // Equivalent to Dispatch From
  const [purchaseTransitReceiptDate, setPurchaseTransitReceiptDate] = useState(getTodayDate());
  const [purchaseTransitReceiptTime, setPurchaseTransitReceiptTime] = useState('');
  const [purchaseTransitReceivedQty, setPurchaseTransitReceivedQty] = useState('');
  const [purchaseTransitReceivedUqc, setPurchaseTransitReceivedUqc] = useState('');

  // Basic / Road Details (Right Column)
  const [purchaseTransitDeliveryType, setPurchaseTransitDeliveryType] = useState('Self');
  const [purchaseTransitSelfThirdParty, setPurchaseTransitSelfThirdParty] = useState('');
  const [purchaseTransitTransporterId, setPurchaseTransitTransporterId] = useState('');
  const [purchaseTransitTransporterName, setPurchaseTransitTransporterName] = useState('');
  const [purchaseTransitVehicleNo, setPurchaseTransitVehicleNo] = useState('');
  const [purchaseTransitLrGrConsignment, setPurchaseTransitLrGrConsignment] = useState('');

  // Document
  const [purchaseTransitDocument, setPurchaseTransitDocument] = useState<File | null>(null);

  // Purchase Print Preview State
  const [showPurchasePrintPreview, setShowPurchasePrintPreview] = useState(false);
  const [postedPurchaseVoucherData, setPostedPurchaseVoucherData] = useState<any>(null);

  // Combine Stock Items and Services for a unified list
  const allItems = React.useMemo(() => {
    // Favor local fetched inventoryItems; fallback to stockItems prop if needed
    const itemsSource = inventoryItems && inventoryItems.length > 0 ? inventoryItems : stockItems;
    const combined = itemsSource.map(si => ({
      ...si,
      // Ensure specific fields are mapped consistently
      item_code: si.item_code || si.code,
      name: si.name || si.item_name,
      hsn_sac: si.hsn_sac || si.hsn,
      uom: si.uom || si.unit,
      alternate_unit: si.alternate_unit || si.alternateUnit || si.alternate_uom
    }));
    services.forEach(s => {
      combined.push({
        id: `service_${s.id}`,
        // Support both camelCase (from backend/service list) and snake_case (standard)
        item_code: s.serviceCode || s.service_code || s.code,
        name: s.serviceName || s.service_name || s.name,
        hsn_sac: s.sacCode || s.sac_code || s.hsn_sac || s.hsn,
        uom: s.uom || s.unit,
        alternate_unit: s.alternateUnit || s.alternate_unit || s.alternate_uom || '',
        gstRate: parseFloat(s.gstRate) || parseFloat(s.gst_rate) || 0,
        rate: parseFloat(s.rate) || 0,
        isService: true
      });
    });
    return combined;
  }, [stockItems, inventoryItems, services]);

  const fetchVendorAdvances = useCallback(async (value: string) => {
    if (!value) {
      setPurchaseAdvanceRefs([]);
      return;
    }

    // Extract entity name if it's in the format "Name (Branch)"
    const match = value.match(/^(.*) \((.*)\)$/);
    const entityName = match ? match[1] : value;

    // Attempt to find the most accurate ledger ID
    const findLedgerId = (name: string) => {
      if (!name) return null;

      let matchedVendor: any = null;

      if (name.startsWith('vend-')) {
        const id = Number(name.replace('vend-', ''));
        matchedVendor = richVendors.find(v => v.id === id);
      } else if (name.startsWith('portal-vend-')) {
        const id = Number(name.replace('portal-vend-', ''));
        matchedVendor = richVendors.find(v => v.id === id);
      }

      if (matchedVendor) {
        if (matchedVendor.ledger_id || matchedVendor.ledger) {
          return matchedVendor.ledger_id || matchedVendor.ledger;
        }
        // Fallback: look up by vendor_name in ledgers
        if (matchedVendor.vendor_name) {
          const vendorLedger = ledgers.find(l => (l.name || '').toLowerCase().trim() === (matchedVendor.vendor_name || '').toLowerCase().trim());
          if (vendorLedger?.id) return vendorLedger.id;
        }
      }

      const lower = name.toLowerCase().trim();

      // 1. Check richVendors for a matching vendor with a ledger_id
      const vendor = richVendors.find(v =>
        (v.vendor_name || '').toLowerCase().trim() === lower ||
        (v.name || '').toLowerCase().trim() === lower
      );
      if (vendor && (vendor.ledger_id || vendor.ledger)) return vendor.ledger_id || vendor.ledger;

      // 2. Check richCustomers for a matching customer with a ledger_id
      const customer = richCustomers.find(c =>
        (c.customer_name || '').toLowerCase().trim() === lower ||
        (c.name || '').toLowerCase().trim() === lower
      );
      if (customer && (customer.ledger_id || customer.ledger)) return customer.ledger_id || customer.ledger;

      // 3. Direct MasterLedger lookup by name
      const ledger = ledgers.find(l => (l.name || '').toLowerCase().trim() === lower);
      if (ledger?.id) return ledger.id;

      // 4. Fallback lookup by vendor_name
      if (vendor && vendor.vendor_name) {
        const vendorLedger = ledgers.find(l => (l.name || '').toLowerCase().trim() === (vendor.vendor_name || '').toLowerCase().trim());
        if (vendorLedger?.id) return vendorLedger.id;
      }

      return null;
    };

    let ledgerId = findLedgerId(entityName);
    if (!ledgerId && match) {
      // Fallback: try raw value if entityName didn't match
      ledgerId = findLedgerId(value);
    }

    console.log('[ADV-DEBUG] value:', value, '| entityName:', entityName, '| resolvedLedgerId:', ledgerId);
    const _dbgVendor = richVendors.find((v: any) => (v.vendor_name || '').toLowerCase().trim() === entityName.toLowerCase().trim());
    console.log('[ADV-DEBUG] richVendors.length:', richVendors.length, '| matched vendor:', _dbgVendor ? { id: _dbgVendor.id, name: _dbgVendor.vendor_name, ledger_id: _dbgVendor.ledger_id } : 'NOT FOUND');
    const _dbgLedger = ledgers.find((l: any) => (l.name || '').toLowerCase().trim() === entityName.toLowerCase().trim());
    console.log('[ADV-DEBUG] ledgers.length:', ledgers.length, '| matched ledger:', _dbgLedger ? { id: _dbgLedger.id, name: _dbgLedger.name } : 'NOT FOUND');

    if (ledgerId) {
      try {
        console.log('[ADV-DEBUG] Calling getAdvances with ledgerId:', ledgerId);
        const data = await apiService.getAdvances(ledgerId);
        console.log('[ADV-DEBUG] Raw API response:', data);
        if (Array.isArray(data)) {
          const mapped = data.map(adv => ({
            id: adv.id,
            date: adv.date,
            refNo: adv.advance_ref_no || adv.reference_no || adv.ref_no || adv.voucher_no,
            amount: (adv.remaining || adv.amount || 0).toString(),
            originalAmount: (adv.amount || 0).toString(),
            remainingAmount: (adv.remaining || adv.amount || 0).toString(),
            appliedNow: '0',
            allocatedNow: '0'
          }));
          console.log('[ADV-DEBUG] Mapped & setting:', mapped);
          setPurchaseAdvanceRefs(mapped);
        } else {
          console.warn('[ADV-DEBUG] API did not return array, got:', typeof data, data);
          setPurchaseAdvanceRefs([]);
        }
      } catch (err) {
        console.error('[ADV-DEBUG] Failed to fetch advances for vendor:', err);
        setPurchaseAdvanceRefs([]);
      }
    } else {
      console.warn('[ADV-DEBUG] Could not resolve ledger ID for vendor:', entityName);
      console.log('[ADV-DEBUG] All richVendors (name + ledger_id):', richVendors.map((v: any) => ({ name: v.vendor_name, ledger_id: v.ledger_id })));
      console.log('[ADV-DEBUG] All ledgers (id + name):', ledgers.map((l: any) => ({ id: l.id, name: l.name })));
      setPurchaseAdvanceRefs([]);
    }
  }, [richVendors, richCustomers, ledgers, setPurchaseAdvanceRefs]);

  // Item Options for Dropdowns
  const itemCodeOptions = React.useMemo(() =>
    Array.from(new Set(allItems.map((item: any) => item.item_code || item.code).filter(Boolean) as string[])),
    [allItems]
  );
  const itemNameOptions = React.useMemo(() =>
    Array.from(new Set(allItems.map((item: any) => item.name || item.item_name).filter(Boolean) as string[])),
    [allItems]
  );



  // but keeping 'FromPort' prefix for consistency with older code if referenced, 
  // though UI uses the Right Column variables above for Road. 
  // The 'From PORT' section in UI (reverted) uses purchaseTransitFromPort... variables if applicable? 
  // No, the reverted UI uses the 'Right Column' vars above for Road?
  // Let's check the UI code again.
  // The UI uses: purchaseTransitFromPortDeliveryType, purchaseTransitFromPortVehicleNo... 
  // Wait, in Step 376, I removed 'From PORT' Section and used 'Right Column'.
  // But did I update the variables in the UI?
  // Step 376 UI:
  // value={purchaseTransitDeliveryType}
  // value={purchaseTransitTransporterId}
  // value={purchaseTransitVehicleNo}
  // So the UI uses the 'Basic' right column vars.
  // So I don't need 'From Port' vars anymore.

  // Upto PORT (Air/Sea)
  const [purchaseTransitUptoPortBolNo, setPurchaseTransitUptoPortBolNo] = useState('');
  const [purchaseTransitUptoPortBolDate, setPurchaseTransitUptoPortBolDate] = useState('');
  const [purchaseTransitUptoPortShippingBillNo, setPurchaseTransitUptoPortShippingBillNo] = useState('');
  const [purchaseTransitUptoPortShippingBillDate, setPurchaseTransitUptoPortShippingBillDate] = useState('');
  const [purchaseTransitUptoPortShipPortCode, setPurchaseTransitUptoPortShipPortCode] = useState('');
  const [purchaseTransitUptoPortOriginCity, setPurchaseTransitUptoPortOriginCity] = useState('');
  const [purchaseTransitUptoPortOriginCountry, setPurchaseTransitUptoPortOriginCountry] = useState('');
  const [purchaseTransitUptoPortVesselFlightNo, setPurchaseTransitUptoPortVesselFlightNo] = useState(''); // If used in Upto
  const [purchaseTransitUptoPortPortOfLoading, setPurchaseTransitUptoPortPortOfLoading] = useState('');
  const [purchaseTransitUptoPortPortOfDischarge, setPurchaseTransitUptoPortPortOfDischarge] = useState('');
  const [purchaseTransitUptoPortFinalDestCity, setPurchaseTransitUptoPortFinalDestCity] = useState('');
  const [purchaseTransitUptoPortFinalDestCountry, setPurchaseTransitUptoPortFinalDestCountry] = useState('');

  // Upto PORT (Rail)
  const [purchaseTransitUptoPortRrNo, setPurchaseTransitUptoPortRrNo] = useState('');
  const [purchaseTransitUptoPortRrDate, setPurchaseTransitUptoPortRrDate] = useState('');
  const [purchaseTransitUptoPortFnrNo, setPurchaseTransitUptoPortFnrNo] = useState('');
  const [purchaseTransitUptoPortStationLoading, setPurchaseTransitUptoPortStationLoading] = useState('');
  const [purchaseTransitUptoPortStationDischarge, setPurchaseTransitUptoPortStationDischarge] = useState('');

  // Also Rail generic Upto vars if different
  const [purchaseTransitRailUptoDeliveryType, setPurchaseTransitRailUptoDeliveryType] = useState('');
  const [purchaseTransitRailUptoTransporterName, setPurchaseTransitRailUptoTransporterName] = useState('');
  const [purchaseTransitRailUptoTransporterId, setPurchaseTransitRailUptoTransporterId] = useState('');

  // Beyond PORT (Air/Sea)
  const [purchaseTransitBeyondPortSbNo, setPurchaseTransitBeyondPortSbNo] = useState('');
  const [purchaseTransitBeyondPortSbDate, setPurchaseTransitBeyondPortSbDate] = useState('');
  const [purchaseTransitBeyondPortShipPortCode, setPurchaseTransitBeyondPortShipPortCode] = useState('');
  const [purchaseTransitBeyondPortVesselFlightNo, setPurchaseTransitBeyondPortVesselFlightNo] = useState('');
  const [purchaseTransitBeyondPortPortOfLoading, setPurchaseTransitBeyondPortPortOfLoading] = useState('');
  const [purchaseTransitBeyondPortPortOfDischarge, setPurchaseTransitBeyondPortPortOfDischarge] = useState('');
  const [purchaseTransitBeyondPortFinalDest, setPurchaseTransitBeyondPortFinalDest] = useState('');
  const [purchaseTransitBeyondPortDestCountry, setPurchaseTransitBeyondPortDestCountry] = useState('');
  const [purchaseTransitBeyondPortOriginCountry, setPurchaseTransitBeyondPortOriginCountry] = useState('');

  // Beyond PORT (Rail)
  const [purchaseTransitRailBeyondRrNo, setPurchaseTransitRailBeyondRrNo] = useState('');
  const [purchaseTransitRailBeyondOrigin, setPurchaseTransitRailBeyondOrigin] = useState('');
  const [purchaseTransitRailBeyondRrDate, setPurchaseTransitRailBeyondRrDate] = useState('');
  const [purchaseTransitRailBeyondRailNo, setPurchaseTransitRailBeyondRailNo] = useState('');
  const [purchaseTransitRailBeyondStationLoading, setPurchaseTransitRailBeyondStationLoading] = useState('');
  const [purchaseTransitRailBeyondOriginCountry, setPurchaseTransitRailBeyondOriginCountry] = useState('');
  const [purchaseTransitRailBeyondStationDischarge, setPurchaseTransitRailBeyondStationDischarge] = useState('');
  const [purchaseTransitRailBeyondFinalDest, setPurchaseTransitRailBeyondFinalDest] = useState('');
  const [purchaseTransitRailBeyondDestCountry, setPurchaseTransitRailBeyondDestCountry] = useState('');

  // Fetch Purchase Orders
  const [availablePOs, setAvailablePOs] = useState<any[]>([]);
  const [isFetchingPOs, setIsFetchingPOs] = useState(false);

  useEffect(() => {
    const fetchPOs = async () => {
      // Fetch only PENDING POs when on Purchase Voucher
      if (voucherType === 'Purchase') {
        setIsFetchingPOs(true);
        try {
          // If a party (vendor) is selected, filter by it. Status is filtered to 'Pending Approval'.
          const queryParty = (party && !wasPartyAutoSet) ? party : undefined;
          const res = await apiService.getVendorPurchaseOrders(queryParty || undefined);
          if (res?.data) {
            setAvailablePOs(res.data);
          } else if (Array.isArray(res)) {
            setAvailablePOs(res);
          } else {
            setAvailablePOs([]);
          }
        } catch (error) {
          console.error('Failed to fetch purchase orders:', error);
          setAvailablePOs([]);
        } finally {
          setIsFetchingPOs(false);
        }
      } else {
        setAvailablePOs([]);
      }
    };

    // Refetch when voucherType, tab, OR party changes
    fetchPOs();
  }, [voucherType, purchaseActiveTab, party, wasPartyAutoSet]);

  const [currentPOItems, setCurrentPOItems] = useState<any[]>([]);

  useEffect(() => {
    const fetchMultiplePODetails = async () => {
      if (selectedPurchasePOs.length === 0) {
        // Only clear advance refs when there's no party selected (full form reset)
        // Do NOT clear them here when vendor changes with POs reset - fetchVendorAdvances handles it
        setCurrentPOItems([]);
        setParty(prevParty => {
          if (wasPartyAutoSet) {
            setWasPartyAutoSet(false);
            return '';
          }
          return prevParty;
        });
        return;
      }

      try {
        let allPoItems: any[] = [];
        let vendorNameFound = '';

        for (const poNo of selectedPurchasePOs) {
          const selectedPO = availablePOs.find(p => p.po_number === poNo);
          if (selectedPO?.id) {
            const res = await apiService.getVendorPurchaseOrderById(selectedPO.id);
            if (res.success && res.data?.items) {
              // Add PO number to items to track origin
              const itemsWithPo = res.data.items.map((item: any) => ({ ...item, _poNumber: poNo }));
              allPoItems = [...allPoItems, ...itemsWithPo];

              if (!vendorNameFound && selectedPO.vendor_name) {
                vendorNameFound = selectedPO.vendor_name;
              }
            }
          }
        }

        if (allPoItems.length > 0) {
          setCurrentPOItems(allPoItems);
          const mappedItems = allPoItems.map((item: any, idx: number) => {
            const qty = parseFloat(item.quantity) || 0;
            const fRate = parseFloat(item.final_rate) || parseFloat(item.negotiated_rate) || 0; // final_rate from PO is treated as foreign rate
            const gstAmount = parseFloat(item.gst_amount) || 0;
            const isInter = isInterState;

            const exRateNum = parseFloat(exchangeRate) || 1;
            const inrRate = fRate * exRateNum;
            const taxableValue = qty * inrRate;

            // Fetch info from master data (Inventory > Inventory Items)
            const stockItem = allItems.find((si: any) =>
              ((si.item_code || si.code) || '').toLowerCase() === (item.item_code || '').toLowerCase() ||
              ((si.name || si.item_name) || '').toLowerCase() === (item.item_name || '').toLowerCase()
            );

            const gstRate = stockItem?.gstRate || (stockItem as any)?.gst_rate || 0;
            const cessRate = stockItem?.cessRate || (stockItem as any)?.cess_rate || 0;
            const totalTax = taxableValue * (gstRate / 100);
            const cessAmount = totalTax * (cessRate / 100);

            return {
              id: (Date.now() + idx + Math.random()).toString(),
              itemCode: item.item_code || stockItem?.item_code || stockItem?.code || '',
              itemName: item.item_name || stockItem?.name || stockItem?.item_name || '',
              hsnSac: stockItem?.hsn_sac || stockItem?.hsn || stockItem?.hsn_code || stockItem?.hsn_sac_code || '',
              qty: qty,
              uom: item.uom || stockItem?.uom || stockItem?.unit || '',
              rate: inrRate,
              taxableValue: taxableValue,
              foreignRate: fRate,
              foreignAmount: qty * fRate,
              igst: isInter ? totalTax : 0,
              cgst: isInter ? 0 : (totalTax / 2),
              sgst: isInter ? 0 : (totalTax / 2),
              cess: cessAmount,
              invoiceValue: taxableValue + totalTax + cessAmount,
              description: item.description || '',
              poRate: inrRate,          // store PO rate (INR) for cross-check
              invoiceRate: null as number | null,
              rateMismatch: false,
              poQty: qty,               // store PO quantity for cross-check
              invoiceQty: null as number | null,
              qtyMismatch: false,
              grnQty: null as number | null,
              sourcePoNo: item._poNumber || null
            };
          });

          setPurchaseItems(mappedItems);
          // Note: Do NOT clear purchaseAdvanceRefs here - vendor advances should persist when PO is selected

          if (!party && vendorNameFound) {
            setParty(vendorNameFound);
            setWasPartyAutoSet(true);
          }
        }
      } catch (error) {
        console.error('Failed to fetch multiple PO details:', error);
      }
    };
    fetchMultiplePODetails();
  }, [selectedPurchasePOs, availablePOs, isInterState, party, setParty, exchangeRate, allItems, wasPartyAutoSet]);

  // Fetch Pending GRNs based on selected vendor for Purchase Vouchers or customer for Credit Note
  useEffect(() => {
    const fetchPendingGRNsForEntity = async () => {
      if (voucherType !== 'Purchase' && voucherType !== 'Credit Note') return;

      const isPurchase = voucherType === 'Purchase';
      const entityToMatch = isPurchase ? party : cnCustomer;

      const match = entityToMatch?.match(/^(^(.*) \((.*)\)$)|(^(.*)$)/);
      const entityName = (match ? (match[2] || match[5]) : entityToMatch)?.trim();

      if (!entityName) {
        setPendingGRNs([]);
        return;
      }

      try {
        const params = isPurchase
          ? { vendor_name: entityName, grn_type: 'purchases' as const }
          : { customer_name: entityName, grn_type: 'sales_return' as const };

        const res = await apiService.getPendingGRNs(params);
        if (res && Array.isArray(res)) {
          setPendingGRNs(res);
        } else {
          setPendingGRNs([]);
        }
      } catch (error) {
        console.error('Failed to fetch pending GRNs:', error);
        setPendingGRNs([]);
      }
    };

    fetchPendingGRNsForEntity();
  }, [party, cnCustomer, voucherType]);

  // Logic to auto-fill items from GRN when selected
  useEffect(() => {
    const fillFromGRN = () => {
      if (!grnRefNo) return;
      const selectedGRN = pendingGRNs.find(g => g.grn_no === grnRefNo);
      if (selectedGRN && selectedGRN.items && selectedGRN.items.length > 0) {
        const mappedItems = selectedGRN.items.map((item: any, idx: number) => {
          const qty = parseFloat(item.secondary_qty) || parseFloat(item.quantity) || 0;
          const rate = parseFloat(item.rate) || parseFloat(item.final_rate) || 0;
          const gstRate = parseFloat(item.gst_rate) || 0;
          const cessRate = parseFloat(item.cess_rate) || 0;
          const taxable = qty * rate;
          const totalTax = taxable * (gstRate / 100);
          const cessAmount = taxable * (cessRate / 100);

          return {
            id: (Date.now() + idx + Math.random()).toString(),
            itemCode: item.item_code || '',
            itemName: item.item_name || item.name || '',
            hsnSac: item.hsn_sac_code || item.hsn_code || item.hsn_sac || '',
            qty: qty,
            uom: item.uom || item.unit || '',
            rate: rate,
            taxableValue: taxable,
            igst: isInterState ? totalTax : 0,
            cgst: isInterState ? 0 : totalTax / 2,
            sgst: isInterState ? 0 : totalTax / 2,
            cess: 0,
            invoiceValue: taxable + totalTax,
            description: item.description || '',
            grnQty: parseFloat(item.secondary_qty) || null,
            invoiceQty: parseFloat(item.secondary_qty) || null
          };
        });
        setPurchaseItems(mappedItems);

        // Also sync party if available in GRN
        if (!party && selectedGRN.vendor_name) {
          setParty(selectedGRN.vendor_name);
        }
      }
    };
    fillFromGRN();
  }, [grnRefNo, pendingGRNs, isInterState, party]);

  // Handle purchaseOrderNo sync for submission
  useEffect(() => {
    setPurchaseOrderNo(selectedPurchasePOs.join(', '));
  }, [selectedPurchasePOs]);
  // Journal
  const [entries, setEntries] = useState<JournalEntry[]>([{ ledger: '', note: '', refNo: '', debit: 0, credit: 0 }, { ledger: '', note: '', refNo: '', debit: 0, credit: 0 }]);

  // Import feedback
  const [importSummary, setImportSummary] = useState<{ success: number, failed: number } | null>(null);

  // Payment voucher specific state
  const [paymentMode, setPaymentMode] = useState<'single' | 'bulk'>('single');
  const [receiptMode, setReceiptMode] = useState<'single' | 'bulk'>('single');
  const [voucherNumber, setVoucherNumber] = useState('');
  const [balance, setBalance] = useState(0);
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [paymentType, setPaymentType] = useState<'full' | 'partial'>('full');
  const [runningBalance, setRunningBalance] = useState(0);
  const [postingNote, setPostingNote] = useState('');
  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceRefNo, setAdvanceRefNo] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceDate, setAdvanceDate] = useState(getTodayDate());
  const [showBulkAdvance, setShowBulkAdvance] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([{ id: '1', party: '', refNo: '', amount: 0 }]);
  const [focusedRowIndex, setFocusedRowIndex] = useState<number>(0);

  // ── Voucher Configuration States ──────────────────────────────────────────
  const [journalVoucherConfigs, setJournalVoucherConfigs] = useState<any[]>([]);
  const [selectedJournalConfig, setSelectedJournalConfig] = useState<string>('');
  const [contraVoucherConfigs, setContraVoucherConfigs] = useState<any[]>([]);
  const [selectedContraConfig, setSelectedContraConfig] = useState<string>('');
  const [expensesVoucherConfigs, setExpensesVoucherConfigs] = useState<any[]>([]);
  const [selectedExpensesConfig, setSelectedExpensesConfig] = useState<string>('');

  // Receipt Voucher Configuration state
  const [receiptVoucherConfigs, setReceiptVoucherConfigs] = useState<any[]>([]);
  const [selectedReceiptConfig, setSelectedReceiptConfig] = useState<string>('');
  const [autoGeneratedVoucherNumber, setAutoGeneratedVoucherNumber] = useState('Auto-generated');

  // Purchase Voucher Configuration state
  const [purchaseVoucherConfigs, setPurchaseVoucherConfigs] = useState<any[]>([]);
  const [selectedPurchaseConfig, setSelectedPurchaseConfig] = useState<string>('');

  // Payment Voucher Configuration state
  const [paymentVoucherConfigs, setPaymentVoucherConfigs] = useState<any[]>([]);
  const [selectedPaymentConfig, setSelectedPaymentConfig] = useState<string>('');
  const [autoGeneratedPaymentVoucherNumber, setAutoGeneratedPaymentVoucherNumber] = useState('Auto-generated');


  // Credit Note Configuration fetch
  useEffect(() => {
    if (voucherType === 'Credit Note') {
      httpClient.get<any[]>('/api/masters/master-voucher-creditnote/')
        .then(configs => {
          setCnVoucherConfigs(configs || []);
          // Only auto-select a series when creating a NEW voucher (not viewing/editing existing)
          if (!isExistingVoucherRef.current) {
            if (configs && configs.length === 1) {
              setSelectedCnConfig(configs[0].voucher_name);
            } else if (configs && configs.length > 1 && !selectedCnConfig) {
              setSelectedCnConfig(configs[0].voucher_name);
            }
          }
        })
        .catch(err => console.error('Failed to fetch Credit Note configs', err));
    }
  }, [voucherType]);

  // Generate Credit Note number (only for NEW vouchers, not when viewing/editing existing)
  useEffect(() => {
    if (viewVoucherData) return; // Immediate guard against race conditions during drill-down
    if (isExistingVoucherRef.current) return; // Do NOT overwrite the saved credit note number when viewing/editing an existing voucher
    if (voucherType === 'Credit Note' && selectedCnConfig && cnVoucherConfigs.length > 0) {
      const config = cnVoucherConfigs.find(c => c.voucher_name === selectedCnConfig);
      if (config && config.enable_auto_numbering) {
        const fetchNextNumber = async () => {
          try {
            // Use the Credit Note specific endpoint (same pattern as Contra)
            const res: any = await httpClient.get(`/api/masters/master-voucher-creditnote/${config.id}/next-number/`);
            if (res?.invoice_number) {
              setCnVoucherNumber(res.invoice_number);
            } else {
              // Fallback: manual generation
              const num = config.current_number ?? config.start_from ?? 1;
              const start = config.start_from ?? 1;
              const digits = config.required_digits ?? 4;
              const prefix = config.prefix || '';
              const suffix = config.suffix || '';
              if (suffix && /^\d+$/.test(suffix)) {
                const baseStr = String(start).padStart(digits, '0') + suffix;
                const base = parseInt(baseStr, 10);
                const offset = num - start;
                const fullNum = base + offset;
                const totalDigits = digits + suffix.length;
                setCnVoucherNumber(`${prefix}${String(fullNum).padStart(totalDigits, '0')}`);
              } else {
                setCnVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
              }
            }
          } catch {
            const num = config.current_number ?? config.start_from ?? 1;
            const digits = config.required_digits ?? 4;
            const prefix = config.prefix || '';
            const suffix = config.suffix || '';
            setCnVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
          }
        };
        fetchNextNumber();
      } else {
        setCnVoucherNumber('Manual Input');
      }
    }
  }, [selectedCnConfig, cnVoucherConfigs, voucherType]);

  const incrementCreditNoteNumber = useCallback(async (seriesId: string): Promise<string> => {
    try {
      const res: any = await httpClient.post(`/api/masters/master-voucher-creditnote/${seriesId}/increment-number/`, {});
      if (res && res.next_invoice_number) {
        setCnVoucherConfigs(prev => prev.map(c =>
          String(c.id) === String(seriesId) ? { ...c, current_number: res.new_current_number } : c
        ));
        setCnVoucherNumber(res.next_invoice_number);
        return res.assigned_number;
      }
    } catch (e) {
      console.error('Failed to increment Credit Note number', e);
    }
    return cnVoucherNumber;
  }, [cnVoucherNumber]);


  const fetchJournalConfigs = useCallback(async () => {
    try {
      const configs = await httpClient.get<any[]>('/api/masters/master-voucher-journal/');
      setJournalVoucherConfigs(configs || []);
      if (configs && configs.length >= 1 && !selectedJournalConfig) {
        setSelectedJournalConfig(configs[0].voucher_name);
      }
    } catch (err) {
      console.error('Failed to fetch journal configs', err);
    }
  }, [selectedJournalConfig]);

  const fetchContraConfigs = useCallback(async () => {
    try {
      const configs = await httpClient.get<any[]>('/api/masters/master-voucher-contra/');
      setContraVoucherConfigs(configs || []);
      if (configs && configs.length >= 1 && !selectedContraConfig) {
        setSelectedContraConfig(configs[0].voucher_name);
      }
    } catch (err) {
      console.error('Failed to fetch contra configs', err);
    }
  }, [selectedContraConfig]);

  const fetchExpensesConfigs = useCallback(async () => {
    try {
      const configs = await httpClient.get<any[]>('/api/masters/master-voucher-expenses/');
      setExpensesVoucherConfigs(configs || []);
      if (configs && configs.length >= 1 && !selectedExpensesConfig) {
        setSelectedExpensesConfig(configs[0].voucher_name);
      }
    } catch (err) {
      console.error('Failed to fetch expenses configs', err);
    }
  }, [selectedExpensesConfig]);

  // Initial fetch and type-switch sync
  useEffect(() => {
    if (voucherType === 'Journal') fetchJournalConfigs();
    if (voucherType === 'Contra') fetchContraConfigs();
    if (voucherType === 'Expenses') fetchExpensesConfigs();
  }, [voucherType, fetchJournalConfigs, fetchContraConfigs, fetchExpensesConfigs]);

  // ── Voucher Numbering Effects ─────────────────────────────────────────────

  // Contra Numbering
  useEffect(() => {
    if (voucherType === 'Contra' && selectedContraConfig && contraVoucherConfigs.length > 0) {
      if (viewVoucherData) return;
      const config = contraVoucherConfigs.find(c => c.voucher_name === selectedContraConfig);
      if (config) {
        if (config.enable_auto_numbering) {
          httpClient.get<any>(`/api/masters/master-voucher-contra/${config.id}/next-number/`)
            .then((res) => {
              setVoucherNumber(res.invoice_number || '');
            })
            .catch(() => {
              const num = config.current_number || config.start_from || 1;
              const digits = config.required_digits || 4;
              const prefix = config.prefix || '';
              const suffix = config.suffix || '';
              setVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
            });
        } else {
          setVoucherNumber('Manual Input');
        }
      }
    }
  }, [selectedContraConfig, contraVoucherConfigs, voucherType]);

  // Journal Numbering
  useEffect(() => {
    if (voucherType === 'Journal' && selectedJournalConfig && journalVoucherConfigs.length > 0) {
      if (viewVoucherData) return;
      const config = journalVoucherConfigs.find(c => c.voucher_name === selectedJournalConfig);
      if (config) {
        if (config.enable_auto_numbering) {
          httpClient.get<any>(`/api/masters/master-voucher-journal/${config.id}/next-number/`)
            .then((res) => {
              setVoucherNumber(res.invoice_number || '');
            })
            .catch(() => {
              const num = config.current_number || config.start_from || 1;
              const digits = config.required_digits || 4;
              const prefix = config.prefix || '';
              const suffix = config.suffix || '';
              setVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
            });
        } else {
          setVoucherNumber('Manual Input');
        }
      }
    }
  }, [selectedJournalConfig, journalVoucherConfigs, voucherType]);

  // Expenses Numbering
  useEffect(() => {
    if (voucherType === 'Expenses' && selectedExpensesConfig && expensesVoucherConfigs.length > 0) {
      if (viewVoucherData) return;
      const config = expensesVoucherConfigs.find(c => c.voucher_name === selectedExpensesConfig);
      if (config) {
        if (config.enable_auto_numbering) {
          httpClient.get<any>(`/api/masters/master-voucher-expenses/${config.id}/next-number/`)
            .then((res) => {
              setVoucherNumber(res.invoice_number || '');
            })
            .catch(() => {
              const num = config.current_number || config.start_from || 1;
              const digits = config.required_digits || 4;
              const prefix = config.prefix || '';
              const suffix = config.suffix || '';
              setVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
            });
        } else {
          setVoucherNumber('Manual Input');
        }
      }
    }
  }, [selectedExpensesConfig, expensesVoucherConfigs, voucherType]);

  // Receipt Voucher specific state - Transaction List
  interface ReceiptTransaction {
    id: string;
    date: string;
    referenceNumber: string;
    amount: number;
    receipt: number;
  }
  const [receiptTransactions, setReceiptTransactions] = useState<ReceiptTransaction[]>([
    { id: '1', date: '31-12-2025', referenceNumber: 'Adc/005', amount: 20000, receipt: 0 },
    { id: '2', date: '02-01-2026', referenceNumber: 'Abc/008', amount: 45000, receipt: 0 },
  ]);
  const [receiveInBalance, setReceiveInBalance] = useState(0);
  const [receiveFromBalance, setReceiveFromBalance] = useState(0);

  // Calculate total receipt from all transactions
  const totalReceipt = useMemo(() => {
    return receiptTransactions.reduce((sum, t) => sum + t.receipt, 0);
  }, [receiptTransactions]);

  // Payment Voucher specific state - Transaction List
  interface PaymentTransaction {
    id: string;
    date: string;
    referenceNumber: string;
    amount: number;
    payment: number;
    party: string; // Added party field for filtering
  }

  interface BulkRow {
    id: string;
    party: string;
    refNo: string;
    amount: number;
  }

  const [paymentTransactions, setPaymentTransactions] = useState<PaymentTransaction[]>([
    { id: '1', date: '15-12-2025', referenceNumber: 'PO/001', amount: 35000, payment: 0, party: 'Local Supplier' },
    { id: '2', date: '28-12-2025', referenceNumber: 'PO/002', amount: 28000, payment: 0, party: 'Local Supplier' },
    { id: '3', date: '05-01-2026', referenceNumber: 'PO/003', amount: 15000, payment: 0, party: 'Inter-State Supplier' },
  ]);

  // Calculate total payment from all transactions
  const totalPayment = useMemo(() => {
    return paymentTransactions.reduce((sum, t) => sum + t.payment, 0);
  }, [paymentTransactions]);

  // Cash/Bank ledgers for dropdown
  const [cashBankLedgers, setCashBankLedgers] = useState<Ledger[]>([]);

  // Fetch Cash/Bank ledgers from API
  useEffect(() => {
    const fetchCashBankLedgers = async () => {
      try {
        const response = await apiService.getCashBankLedgers();
        setCashBankLedgers(response);

      } catch (error) {
        console.error('Error fetching Cash/Bank ledgers:');
        // Fallback to filtering from ledgers prop
        const fallback = ledgers.filter(l => {
          const g = (l.group || '').toLowerCase();
          return g.includes('cash') || g.includes('bank') || g.includes('od') || g.includes('cc');
        });
        setCashBankLedgers(fallback);
      }
    };
    fetchCashBankLedgers();
  }, [ledgers]);


  // Sync Contra balances
  useEffect(() => {
    if (voucherType === 'Contra') {
      const allLedgers = ledgers || [];
      const fromLedger = allLedgers.find(l => l.name === fromAccount);
      setFromAccountBalance(fromLedger?.balance || 0);

      const toLedger = allLedgers.find(l => l.name === toAccount);
      setToAccountBalance(toLedger?.balance || 0);
    }
  }, [fromAccount, toAccount, ledgers, voucherType]);

  // Fetch receipt voucher configurations when voucher type is Receipt
  useEffect(() => {
    const fetchReceiptConfigs = async () => {

      if (voucherType === 'Receipt') {
        try {

          const data = await httpClient.get<any[]>('/api/masters/voucher-configurations/?voucher_type=receipts');


          // Filter to show ONLY receipt configurations (client-side filtering)
          const receiptConfigs = data?.filter(config => config.voucher_type === 'receipts') || [];



          setReceiptVoucherConfigs(receiptConfigs);
          // Auto-select first config if only one
          if (receiptConfigs && receiptConfigs.length === 1) {
            setSelectedReceiptConfig(receiptConfigs[0].voucher_name);
          }
        } catch (error) {
          console.error('Error fetching receipt voucher configurations:');
          setReceiptVoucherConfigs([]);
        }
      } else {
        // Clear configs when not on Receipt voucher
        setReceiptVoucherConfigs([]);
        setSelectedReceiptConfig('');
      }
    };
    fetchReceiptConfigs();
  }, [voucherType]);

  // Generate voucher number when receipt configuration is selected
  useEffect(() => {
    if (selectedReceiptConfig && receiptVoucherConfigs.length > 0) {
      const config = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
      if (config && config.enable_auto_numbering) {
        const paddedNum = String(config.current_number).padStart(config.required_digits, '0');
        const generatedNumber = `${config.prefix || ''}${paddedNum}${config.suffix || ''}`;
        setAutoGeneratedVoucherNumber(generatedNumber);

      } else {
        setAutoGeneratedVoucherNumber('Manual Input');
      }
    } else {
      setAutoGeneratedVoucherNumber('Auto-generated');
    }
  }, [selectedReceiptConfig, receiptVoucherConfigs]);

  // Fetch payment voucher configurations when voucher type is Payment
  useEffect(() => {
    const fetchPaymentConfigs = async () => {

      if (voucherType === 'Payment') {
        try {

          const data = await httpClient.get<any[]>('/api/masters/voucher-configurations/?voucher_type=payments');


          // Filter to show ONLY payment configurations (client-side filtering)
          const paymentConfigs = data?.filter(config => config.voucher_type === 'payments') || [];



          setPaymentVoucherConfigs(paymentConfigs);
          // Auto-select first config if only one
          if (paymentConfigs && paymentConfigs.length === 1) {
            setSelectedPaymentConfig(paymentConfigs[0].voucher_name);
          }
        } catch (error) {
          console.error('Error fetching payment voucher configurations:');
          setPaymentVoucherConfigs([]);
        }
      } else {
        // Clear configs when not on Payment voucher
        setPaymentVoucherConfigs([]);
        setSelectedPaymentConfig('');
      }
    };
    fetchPaymentConfigs();
  }, [voucherType]);

  // Generate voucher number when payment configuration is selected
  useEffect(() => {
    if (selectedPaymentConfig && paymentVoucherConfigs.length > 0) {
      const config = paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig);
      if (config && config.enable_auto_numbering) {
        const paddedNum = String(config.current_number).padStart(config.required_digits, '0');
        const generatedNumber = `${config.prefix || ''}${paddedNum}${config.suffix || ''}`;
        setAutoGeneratedPaymentVoucherNumber(generatedNumber);

      } else {
        setAutoGeneratedPaymentVoucherNumber('Manual Input');
      }
    } else {
      setAutoGeneratedPaymentVoucherNumber('Auto-generated');
    }
  }, [selectedPaymentConfig, paymentVoucherConfigs]);

  // Fetch purchase voucher configurations when voucher type is Purchase
  useEffect(() => {
    const fetchPurchaseConfigs = async () => {
      if (voucherType === 'Purchase') {
        try {
          const data = await httpClient.get<any[]>('/api/masters/master-voucher-purchases/');
          const purchaseConfigs = data || [];
          setPurchaseVoucherConfigs(purchaseConfigs);
          if (purchaseConfigs.length === 1) {
            setSelectedPurchaseConfig(prev => prev || purchaseConfigs[0].voucher_name);
          }
        } catch (error) {
          console.error('Error fetching purchase voucher configurations:', error);
          setPurchaseVoucherConfigs([]);
        }
      } else {
        setPurchaseVoucherConfigs([]);
        setSelectedPurchaseConfig('');
      }
    };
    fetchPurchaseConfigs();
  }, [voucherType]);

  // Generate voucher number when purchase configuration is selected
  useEffect(() => {
    if (voucherType === 'Purchase') {
      if (viewVoucherData) return; // Prevent overwriting during edit
      if (selectedPurchaseConfig && purchaseVoucherConfigs.length > 0) {
        const config = purchaseVoucherConfigs.find(c => c.voucher_name === selectedPurchaseConfig);
        if (config && config.enable_auto_numbering) {
          const fetchNextNumber = async () => {
            try {
              const res: any = await httpClient.get(`/api/masters/master-voucher-purchases/${config.id}/next-number/`);
              if (res?.invoice_number) {
                setVoucherNumber(res.invoice_number);
              } else {
                const num = config.current_number || config.start_from || 1;
                const start = config.start_from || 1;
                const digits = config.required_digits || 4;
                const prefix = config.prefix || '';
                const suffix = config.suffix || '';

                if (suffix && /^\\d+$/.test(suffix)) {
                  const baseStr = String(start).padStart(digits, '0') + suffix;
                  const base = parseInt(baseStr, 10);
                  const offset = num - start;
                  const fullNum = base + offset;
                  const totalDigits = digits + suffix.length;
                  setVoucherNumber(`${prefix}${String(fullNum).padStart(totalDigits, '0')}`);
                } else {
                  setVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
                }
              }
            } catch {
              const num = config.current_number || config.start_from || 1;
              const start = config.start_from || 1;
              const digits = config.required_digits || 4;
              const prefix = config.prefix || '';
              const suffix = config.suffix || '';

              if (suffix && /^\\d+$/.test(suffix)) {
                const baseStr = String(start).padStart(digits, '0') + suffix;
                const base = parseInt(baseStr, 10);
                const offset = num - start;
                const fullNum = base + offset;
                const totalDigits = digits + suffix.length;
                setVoucherNumber(`${prefix}${String(fullNum).padStart(totalDigits, '0')}`);
              } else {
                setVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
              }
            }
          }
          fetchNextNumber();
        } else {
          setVoucherNumber('Manual Input');
        }
      } else {
        setVoucherNumber('Auto-generated');
      }
    }
  }, [selectedPurchaseConfig, purchaseVoucherConfigs, voucherType]);

  const incrementPurchaseNumber = useCallback(async (seriesId: string): Promise<string> => {
    try {
      const res: any = await httpClient.post(`/api/masters/master-voucher-purchases/${seriesId}/increment-number/`, {});
      if (res && res.next_invoice_number) {
        // Update local configs cache with new current_number
        setPurchaseVoucherConfigs(prev => prev.map(c =>
          String(c.id) === String(seriesId) ? { ...c, current_number: res.new_current_number } : c
        ));
        setVoucherNumber(res.next_invoice_number);
        return res.assigned_number;
      }
    } catch (e) {
      console.error('Failed to increment purchase number', e);
    }
    return voucherNumber;
  }, [voucherNumber]);


  // Update balance when account is selected
  useEffect(() => {

    if (account && ledgers.length > 0) {
      // Find the ledger in the main ledgers array (not accountLedgers)
      const selectedLedger = ledgers.find(l => l.name === account);

      if (selectedLedger) {
        // Use the computed balance field from the API

        setBalance(selectedLedger.balance || 0);
      } else {

        setBalance(0);
      }
    } else {

      setBalance(0);
    }
  }, [account, ledgers]); // Keep dependency on ledgers, not accountLedgers

  // Sync Payment Transactions to Bulk Row Amount
  useEffect(() => {
    if (focusedRowIndex !== null && bulkRows[focusedRowIndex]) {
      const party = bulkRows[focusedRowIndex].party;
      if (party) {
        const bills = paymentTransactions.filter(t => t.party === party);
        const total = bills.reduce((sum, t) => sum + (t.payment || 0), 0);
        // Only update if different to avoid potential loops/redundant sets, though React handles equality check usually
        if (bulkRows[focusedRowIndex].amount !== total && total > 0) {
          handleBulkRowChange(focusedRowIndex, 'amount', total);
        }
      }
    }
  }, [paymentTransactions, focusedRowIndex]); // Removed bulkRows dependency to avoid loop, relies on index access




  const triggerFileUpload = (ref: React.RefObject<HTMLInputElement>) => {
    ref.current?.click();
    setIsImportMenuOpen(false);
  };

  const handleImageFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onInvoiceUpload(file, voucherType);
      // Reset input value to allow selecting the same file again
      event.target.value = '';
    }
  };



  const isVoucher = (obj: any): obj is Voucher => {
    return obj && typeof obj.type === 'string' && typeof obj.date === 'string';
  };

  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value to allow selecting the same file again
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        const data = JSON.parse(content as string);
        if (Array.isArray(data)) {
          const validVouchers: Voucher[] = [];
          let failed = 0;
          data.forEach(item => {
            if (isVoucher(item)) {
              // Override type to respect current voucherType
              item.type = voucherType as any;
              validVouchers.push(item);
            } else {
              failed++;
            }
          });
          if (validVouchers.length > 0) {
            setImportSummary({ success: validVouchers.length, failed });
          } else {
            setImportSummary({ success: 0, failed: 1 });
          }
        }
      } catch (error) {
        console.error("Error parsing JSON file:");
        setImportSummary({ success: 0, failed: file.size > 0 ? 1 : 0 });
      }
    };
    reader.readAsText(file);
  };

  const handleExcelFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input value to allow selecting the same file again
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const XLSX = await getXLSX();
        const workbook = XLSX.read(data, { type: 'array' });
        const allVouchers: Voucher[] = [];
        let failed = 0;

        const parseDate = (val: any) => {
          if (!val) return new Date().toISOString().split('T')[0];
          if (typeof val === 'number') {
            // Excel serial date
            return new Date((val - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
          }
          const d = new Date(val);
          return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
        };

        const parseBool = (val: any) => {
          const normalized = String(val ?? '').trim().toLowerCase();
          return normalized === 'true' || normalized === 'yes' || normalized === '1' || val === true;
        };

        const parseNumber = (val: any) => {
          if (val === undefined || val === null || val === '') return 0;
          if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
          const parsed = parseFloat(String(val).replace(/,/g, '').trim());
          return Number.isNaN(parsed) ? 0 : parsed;
        };

        const normalizeHeaderKey = (key: string) => String(key || '')
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]/g, '');

        const hasValue = (value: any) => value !== undefined && value !== null && String(value).trim() !== '';

        const getRowValue = (row: Record<string, any>, keys: string[]) => {
          const normalizedMap = new Map<string, any>();
          Object.entries(row).forEach(([k, v]) => {
            const normalized = normalizeHeaderKey(k);
            if (!normalizedMap.has(normalized) || (!hasValue(normalizedMap.get(normalized)) && hasValue(v))) {
              normalizedMap.set(normalized, v);
            }
          });

          for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(row, key)) {
              const value = row[key];
              if (hasValue(value)) {
                return value;
              }
            }

            const normalizedKey = normalizeHeaderKey(key);
            if (normalizedMap.has(normalizedKey)) {
              const value = normalizedMap.get(normalizedKey);
              if (hasValue(value)) {
                return value;
              }
            }
          }
          return undefined;
        };

        const FIELD_ALIASES = {
          date: ['date', 'Voucher Date', 'Invoice Date', 'Bill Date'],
          narration: ['narration', 'Narration', 'Remarks', 'Description', 'Note'],
          party: ['party', 'Party', 'Party Name', 'Buyer/Supplier - Mailing Name', 'Vendor Name', 'Supplier Name', 'Customer Name', 'Vendor', 'Supplier'],
          invoiceNo: ['invoiceNo', 'Supplier Invoice No', 'Invoice No', 'Invoice Number', 'Bill No', 'Ref No'],
          isInterState: ['isInterState', 'Is Inter State', 'Inter State', 'Interstate'],
          partyState: ['Buyer/Supplier - State', 'Party State', 'State'],
          items: ['items', 'Items', 'Line Items', 'Item Details'],
          itemName: ['Item Name', 'itemName', 'name', 'Product Name', 'Particulars'],
          quantity: ['Quantity', 'Qty', 'qty'],
          rate: ['Rate', 'rate', 'Unit Rate', 'Price'],
          taxableValue: ['Taxable Value', 'Taxable Amount', 'taxableAmount'],
          cgst: ['Central Tax (CGST)', 'CGST Amount', 'CGST', 'cgstAmount'],
          sgst: ['State Tax (SGST)', 'SGST Amount', 'SGST', 'sgstAmount'],
          igst: ['Integrated Tax (IGST)', 'IGST Amount', 'IGST', 'igstAmount'],
          itemAmount: ['Item Amount', 'Line Total', 'totalAmount'],
          account: ['account', 'Account', 'Paid From', 'Bank/Cash Ledger'],
          amount: ['amount', 'Amount', 'Total Invoice Value', 'Total', 'Value'],
          fromAccount: ['fromAccount', 'From Account', 'From Ledger'],
          toAccount: ['toAccount', 'To Account', 'To Ledger'],
          entries: ['entries', 'Entries', 'Journal Entries'],
          debitLedger: ['Ledger (Debit)', 'Debit Ledger', 'Dr Ledger'],
          creditLedger: ['Ledger (Credit)', 'Credit Ledger', 'Cr Ledger'],
        };

        const getWorksheetRows = async (preferredSheetNames: string[]) => {
          const sheetName = preferredSheetNames.find(name => workbook.Sheets[name]) || workbook.SheetNames[0];
          if (!sheetName) return [];
          const sheet = workbook.Sheets[sheetName];
          const XLSX = await getXLSX();
          return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
        };

        if (voucherType === 'Purchase' || voucherType === 'Sales') {
          const rows = await getWorksheetRows(['SalesPurchases', 'Invoices']);
          const groups: Record<string, {
            date: string;
            narration: string;
            party: string;
            invoiceNo: string;
            isInterState: boolean;
            items: VoucherItem[];
          }> = {};

          rows.forEach((row, index) => {
            try {
              const date = parseDate(getRowValue(row, FIELD_ALIASES.date));
              const narration = String(getRowValue(row, FIELD_ALIASES.narration) || '');
              const party = String(getRowValue(row, FIELD_ALIASES.party) || '');
              const invoiceNo = String(getRowValue(row, FIELD_ALIASES.invoiceNo) || '');
              const explicitInterState = getRowValue(row, FIELD_ALIASES.isInterState);
              const partyState = String(getRowValue(row, FIELD_ALIASES.partyState) || '');
              const isInterState = explicitInterState !== undefined
                ? parseBool(explicitInterState)
                : (!!partyState && !!companyDetails.state && partyState.toLowerCase() !== companyDetails.state.toLowerCase());

              const groupKey = (invoiceNo || party)
                ? `${invoiceNo}|${party}|${date}`
                : `row-${index}`;

              if (!groups[groupKey]) {
                groups[groupKey] = { date, narration, party, invoiceNo, isInterState, items: [] };
              } else {
                if (!groups[groupKey].party && party) groups[groupKey].party = party;
                if (!groups[groupKey].invoiceNo && invoiceNo) groups[groupKey].invoiceNo = invoiceNo;
                if (!groups[groupKey].narration && narration) groups[groupKey].narration = narration;
              }

              const rawItems = getRowValue(row, FIELD_ALIASES.items);
              if (rawItems) {
                let parsedItems: any[] = [];
                if (Array.isArray(rawItems)) parsedItems = rawItems;
                else if (typeof rawItems === 'string') {
                  try { parsedItems = JSON.parse(rawItems); } catch { parsedItems = []; }
                }

                parsedItems.forEach((item: any) => {
                  const name = String(item?.name ?? item?.itemName ?? item?.['Item Name'] ?? item?.['Product Name'] ?? '').trim();
                  const qty = parseNumber(item?.qty ?? item?.quantity ?? item?.['Quantity'] ?? item?.['Qty']);
                  const rate = parseNumber(item?.rate ?? item?.['Rate']);
                  const taxableAmount = parseNumber(item?.taxableAmount ?? item?.taxableValue ?? item?.['Taxable Value'] ?? item?.['Taxable Amount']);
                  const cgstAmount = parseNumber(item?.cgstAmount ?? item?.['CGST Amount'] ?? item?.['Central Tax (CGST)'] ?? item?.['CGST']);
                  const sgstAmount = parseNumber(item?.sgstAmount ?? item?.['SGST Amount'] ?? item?.['State Tax (SGST)'] ?? item?.['SGST']);
                  const igstAmount = parseNumber(item?.igstAmount ?? item?.['IGST Amount'] ?? item?.['Integrated Tax (IGST)'] ?? item?.['IGST']);
                  const totalAmount = parseNumber(item?.totalAmount ?? item?.['Item Amount'] ?? item?.['Line Total']);

                  if (!name && !qty && !rate && !taxableAmount && !totalAmount) return;

                  groups[groupKey].items.push({
                    name,
                    qty: qty || 1,
                    rate,
                    taxableAmount,
                    cgstAmount,
                    sgstAmount,
                    igstAmount,
                    totalAmount,
                  });
                });
              } else {
                const name = String(getRowValue(row, FIELD_ALIASES.itemName) || '').trim();
                const qty = parseNumber(getRowValue(row, FIELD_ALIASES.quantity));
                const rate = parseNumber(getRowValue(row, FIELD_ALIASES.rate));
                const taxableAmount = parseNumber(getRowValue(row, FIELD_ALIASES.taxableValue));
                const cgstAmount = parseNumber(getRowValue(row, FIELD_ALIASES.cgst));
                const sgstAmount = parseNumber(getRowValue(row, FIELD_ALIASES.sgst));
                const igstAmount = parseNumber(getRowValue(row, FIELD_ALIASES.igst));
                const totalAmount = parseNumber(getRowValue(row, FIELD_ALIASES.itemAmount));

                if (!name && !qty && !rate && !taxableAmount && !totalAmount) return;

                groups[groupKey].items.push({
                  name,
                  qty: qty || 1,
                  rate,
                  taxableAmount,
                  cgstAmount,
                  sgstAmount,
                  igstAmount,
                  totalAmount,
                });
              }
            } catch {
              failed++;
            }
          });

          Object.values(groups).forEach(group => {
            if (!group.items.length) {
              failed++;
              return;
            }

            const normalizedItems = group.items.map(item => {
              const stockItem = stockItems.find(si => si.name?.toLowerCase() === (item.name || '').toLowerCase());
              const gstRate = stockItem?.gstRate || (stockItem as any)?.gst_rate || 0;
              const taxable = item.taxableAmount || (item.qty * item.rate);
              let cgst = item.cgstAmount || 0;
              let sgst = item.sgstAmount || 0;
              let igst = item.igstAmount || 0;

              if (!cgst && !sgst && !igst) {
                const tax = taxable * (gstRate / 100);
                if (group.isInterState) {
                  igst = tax;
                } else {
                  cgst = tax / 2;
                  sgst = tax / 2;
                }
              }

              const total = item.totalAmount || (taxable + cgst + sgst + igst);
              return {
                ...item,
                taxableAmount: taxable,
                cgstAmount: cgst,
                sgstAmount: sgst,
                igstAmount: igst,
                totalAmount: total,
              };
            });

            const totals = normalizedItems.reduce((acc, item) => {
              acc.taxable += item.taxableAmount;
              acc.cgst += item.cgstAmount;
              acc.sgst += item.sgstAmount;
              acc.igst += item.igstAmount;
              acc.total += item.totalAmount;
              return acc;
            }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

            const voucher = {
              date: group.date,
              type: voucherType as any,
              narration: group.narration,
              party: group.party,
              invoiceNo: group.invoiceNo,
              isInterState: group.isInterState,
              items: normalizedItems,
              totalTaxableAmount: totals.taxable,
              totalCgst: totals.cgst,
              totalSgst: totals.sgst,
              totalIgst: totals.igst,
              total: totals.total,
            } as SalesPurchaseVoucher;

            if (isVoucher(voucher)) allVouchers.push(voucher as Voucher);
            else failed++;
          });
        } else if (voucherType === 'Payment' || voucherType === 'Receipt') {
          const rows = await getWorksheetRows(['PaymentsReceipts', 'Cash Receipts']);
          rows.forEach((row) => {
            try {
              const voucher = {
                date: parseDate(getRowValue(row, FIELD_ALIASES.date)),
                type: voucherType as any,
                narration: String(getRowValue(row, FIELD_ALIASES.narration) || ''),
                party: String(getRowValue(row, FIELD_ALIASES.party) || ''),
                account: String(getRowValue(row, FIELD_ALIASES.account) || ''),
                amount: parseNumber(getRowValue(row, FIELD_ALIASES.amount)),
              } as PaymentReceiptVoucher;

              if (!voucher.party && !voucher.account && !voucher.amount) return;

              if (isVoucher(voucher)) allVouchers.push(voucher as Voucher);
              else failed++;
            } catch {
              failed++;
            }
          });
        } else if (voucherType === 'Contra') {
          const rows = await getWorksheetRows(['Contra', 'Invoices']);
          rows.forEach((row) => {
            try {
              const voucher = {
                date: parseDate(getRowValue(row, FIELD_ALIASES.date)),
                type: voucherType as any,
                narration: String(getRowValue(row, FIELD_ALIASES.narration) || ''),
                fromAccount: String(getRowValue(row, FIELD_ALIASES.fromAccount) || ''),
                toAccount: String(getRowValue(row, FIELD_ALIASES.toAccount) || ''),
                amount: parseNumber(getRowValue(row, FIELD_ALIASES.amount)),
              } as ContraVoucher;

              if (!voucher.fromAccount && !voucher.toAccount && !voucher.amount) return;

              if (isVoucher(voucher)) allVouchers.push(voucher as Voucher);
              else failed++;
            } catch {
              failed++;
            }
          });
        } else if (voucherType === 'Journal') {
          const rows = await getWorksheetRows(['Journal', 'Invoices']);
          rows.forEach((row) => {
            try {
              let entries: JournalEntry[] = [];
              const rawEntries = getRowValue(row, FIELD_ALIASES.entries);

              if (rawEntries) {
                let parsedEntries: any[] = [];
                if (Array.isArray(rawEntries)) parsedEntries = rawEntries;
                else if (typeof rawEntries === 'string') {
                  try { parsedEntries = JSON.parse(rawEntries); } catch { parsedEntries = []; }
                }

                entries = parsedEntries.map((entry: any) => ({
                  ledger: String(entry?.ledger || ''),
                  note: String(entry?.note || ''),
                  refNo: String(entry?.refNo || ''),
                  debit: parseNumber(entry?.debit),
                  credit: parseNumber(entry?.credit),
                })).filter(entry => entry.ledger || entry.debit || entry.credit);
              } else {
                const amount = parseNumber(getRowValue(row, FIELD_ALIASES.amount));
                const debitLedger = String(getRowValue(row, FIELD_ALIASES.debitLedger) || '');
                const creditLedger = String(getRowValue(row, FIELD_ALIASES.creditLedger) || '');

                if (debitLedger || creditLedger || amount) {
                  entries = [
                    { ledger: debitLedger, note: '', refNo: '', debit: amount, credit: 0 },
                    { ledger: creditLedger, note: '', refNo: '', debit: 0, credit: amount },
                  ].filter(entry => entry.ledger || entry.debit || entry.credit);
                }
              }

              if (!entries.length) {
                failed++;
                return;
              }

              const totals = entries.reduce((acc, entry) => ({
                debit: acc.debit + (entry.debit || 0),
                credit: acc.credit + (entry.credit || 0),
              }), { debit: 0, credit: 0 });

              const voucher = {
                date: parseDate(getRowValue(row, FIELD_ALIASES.date)),
                type: voucherType as any,
                narration: String(getRowValue(row, FIELD_ALIASES.narration) || ''),
                entries,
                totalDebit: totals.debit,
                totalCredit: totals.credit,
              } as JournalVoucher;

              if (isVoucher(voucher)) allVouchers.push(voucher as Voucher);
              else failed++;
            } catch {
              failed++;
            }
          });
        }

        if (allVouchers.length === 1) {
          // Single voucher - Populate form
          const voucher = allVouchers[0];

          if (voucher.type === 'Sales' || voucher.type === 'Purchase') {
            const spVoucher = voucher as SalesPurchaseVoucher;
            setDate(spVoucher.date);
            setInvoiceNo(spVoucher.invoiceNo);
            setParty(spVoucher.party);
            setIsInterState(spVoucher.isInterState || false);

            const mappedItems = (spVoucher.items || []).map(item => ({
              name: item.name,
              qty: item.qty,
              rate: item.rate,
              taxableAmount: item.taxableAmount,
              cgstAmount: item.cgstAmount,
              sgstAmount: item.sgstAmount,
              igstAmount: item.igstAmount,
              totalAmount: item.totalAmount
            }));
            if (mappedItems.length > 0) setItems(mappedItems);
            setNarration(spVoucher.narration || '');

          } else if (voucher.type === 'Payment' || voucher.type === 'Receipt') {
            const prVoucher = voucher as PaymentReceiptVoucher;
            setDate(prVoucher.date);
            setAccount(prVoucher.account);
            setParty(prVoucher.party);
            setSimpleAmount(prVoucher.amount);
            setNarration(prVoucher.narration || '');

          } else if (voucher.type === 'Contra') {
            const cVoucher = voucher as ContraVoucher;
            setDate(cVoucher.date);
            setFromAccount(cVoucher.fromAccount);
            setToAccount(cVoucher.toAccount);
            setSimpleAmount(cVoucher.amount);
            setNarration(cVoucher.narration || '');

          } else if (voucher.type === 'Journal') {
            const jVoucher = voucher as JournalVoucher;
            setDate(jVoucher.date);
            setEntries(jVoucher.entries);
            setNarration(jVoucher.narration || '');
          }

          setImportSummary({ success: 1, failed });
          showInfo("Voucher data loaded into form. Please review and save.");

        } else if (allVouchers.length > 1) {
          // Multiple vouchers - Suggest using Bulk Review or just show summary
          setImportSummary({ success: allVouchers.length, failed });
        } else {
          setImportSummary({ success: 0, failed });
          if (failed > 0) showError("No valid vouchers found.");
        }

      } catch (error) {
        console.error("Error parsing Excel file:");
        setImportSummary({ success: 0, failed: 1 });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();

    // Define headers (same as respective voucher upload expectations)
    const spHeaders = [["Voucher Date", "Supplier Invoice No", "Buyer/Supplier - Mailing Name", "Buyer/Supplier - State", "Narration", "Item Name", "Quantity", "Rate", "Taxable Value", "Item Amount"]];
    const prHeaders = [["Voucher Date", "Account", "Party", "Amount", "Narration"]];
    const cHeaders = [["Voucher Date", "From Account", "To Account", "Amount", "Narration"]];
    const jHeaders = [["Voucher Date", "Ledger (Debit)", "Ledger (Credit)", "Amount", "Narration"]];

    // Example data
    spHeaders.push(["2023-01-01", "INV-101", "Local Customer", "Tamil Nadu", "Sold goods", "Laptop", "1", "50000", "50000", "59000"]);
    prHeaders.push(["2023-01-02", "HDFC Bank", "Local Supplier", "25000", "Paid for supplies"]);
    cHeaders.push(["2023-01-03", "Cash", "HDFC Bank", "10000", "Cash deposited"]);
    jHeaders.push(["2023-01-04", "Rent Expense", "Cash", "15000", "Adjustment entry"]);

    // Create worksheets
    const spSheet = XLSX.utils.aoa_to_sheet(spHeaders);
    const prSheet = XLSX.utils.aoa_to_sheet(prHeaders);
    const cSheet = XLSX.utils.aoa_to_sheet(cHeaders);
    const jSheet = XLSX.utils.aoa_to_sheet(jHeaders);

    // Add sheets to workbook
    XLSX.utils.book_append_sheet(wb, spSheet, "SalesPurchases");
    XLSX.utils.book_append_sheet(wb, prSheet, "PaymentsReceipts");
    XLSX.utils.book_append_sheet(wb, cSheet, "Contra");
    XLSX.utils.book_append_sheet(wb, jSheet, "Journal");

    XLSX.writeFile(wb, "AI-Accounting_Voucher_Template.xlsx");
    setIsImportMenuOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setIsImportMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [importMenuRef]);

  const resetForm = useCallback(() => {
    setDate(getTodayDate());
    setInvoiceNo('');
    setSupplierInvoiceDate(getTodayDate());
    setParty('');
    setVendorId(null);
    setItems([{ name: '', qty: 1, rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);
    setAccount('');
    setSimpleAmount(0);
    setNarration('');
    setFromAccount('');
    setToAccount('');
    setFromAccountBalance(0);
    setToAccountBalance(0);
    setPurchaseSupportingDocument(null);
    setEntries([{ ledger: '', note: '', refNo: '', debit: 0, credit: 0 }, { ledger: '', note: '', refNo: '', debit: 0, credit: 0 }]);
    setVendorValidationStatus(null);
    setIsVendorDisabled(false);

    // Credit Note Resets
    setCnDate(getTodayDate());
    setCnCustomer('');
    setCnBranch('');
    setCnSelectedSalesInvoices([]);
    setCnSalesInvoiceDate('');
    setCnCustomerDebitNoteNo('');
    setCnCustomerDebitNoteDate(getTodayDate());
    setCnGstin('');
    setCnGrnRefNo('');
    setCnBillFrom('');
    setCnShipFrom('');
    setCnSameAsBillFrom(false);
    setCnInputType(['Intrastate']);
    setCnInForeignCurrency('No');
    setCnItems([
      { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: null, financialAmount: 0 }
    ]);
    setCnReverseGstTcs('No');
    setCnReverseGstTds('No');
    setCnIncomeTaxTdsTcsAmount('0.00');
    setCnGstTdsTcsAmount('0.00');
    setCnAdvanceAmount('0.00');
    setCnPayableAmount('0.00');
    setCnTermsConditions('');
    setCnPostingNote('');
    setCnTransitReceivedIn('');
    setCnTransitMode('Road');
    setCnTransitReceiptDate(getTodayDate());
    setCnTransitReceiptTime('');
    setCnTransitDeliveryType('Self');
    setCnTransitTransporterId('');
    setCnTransitTransporterName('');
    setCnTransitVehicleNo('');
    setCnTransitLrGrConsignment('');
    setCreditNoteActiveTab('invoice');
  }, []);

  // Auto-set Inter-State flag based on party ledger's state
  useEffect(() => {
    if (voucherType === 'Purchase' || voucherType === 'Sales') {
      const partyLedger = ledgers.find(l => l.name === party);
      if (partyLedger && partyLedger.state && companyDetails.state) {
        const isInter = partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase();
        setIsInterState(isInter);
      } else {
        setIsInterState(false);
      }
    }
  }, [party, ledgers, companyDetails.state, voucherType]);

  // ── TDS/TCS Auto-Calculation ─────────────────────────────────────────────────────
  // Runs whenever vendor, items, or rich vendor list changes.
  // Reads tds_rate or tcs_rate from the vendor's master record (flattened by the backend serializer)
  // and computes: TCS Amount = Invoice Value × Rate, TDS Amount = Total Taxable × Rate
  useEffect(() => {
    if (voucherType !== 'Purchase') return;

    if (!party || richVendors.length === 0) {
      setPurchaseTdsIt('0.00');
      return;
    }

    const lowerParty = party.trim().toLowerCase();

    // Match vendor by ID first, then by name (case-insensitive)
    const vendor = richVendors.find(v =>
      (vendorId != null && v.id === vendorId) ||
      (v.vendor_name || '').trim().toLowerCase() === lowerParty
    );

    if (!vendor) {
      setPurchaseAutoTdsEnabled(false);
      setPurchaseTdsIt('0.00');
      return;
    }

    const isAuto = (vendor.enable_automatic_tds_posting === true || vendor.enable_automatic_tds_posting === 'true' || vendor.enable_automatic_tds_posting === 1);
    setPurchaseAutoTdsEnabled(isAuto);

    // Only calculate if "Enable automatic TDS Posting" is checked for this vendor
    if (!isAuto) {
      setPurchaseTdsIt('0.00');
      return;
    }

    const TDS_RATE_MAP: Record<string, number> = {
      // Common Sections
      'Contracts- Individual/HUF': 0.01,
      'Contracts- Others': 0.02,
      'Commission/Brokerage': 0.02,
      'Rent- Land, Building, Furniture & fitting': 0.02,
      'Rent- Plant & Machinery, Equipment': 0.10,
      'Technical Services': 0.02,
      'Professional Services': 0.10,
      "Director's Remuneration": 0.10,
      'Purchase of Goods': 0.001,
      'Interest other than interest on securities': 0.10,
      'Benefit or Perquisite': 0.10,
      'Immovable Property Transfer': 0.01,
      'Rent by Individual or HUF': 0.02,
      'Joint Development Agreements': 0.10,
      'Contractors & Professionals': 0.02,
      'E-Commerce': 0.01,

      // Sections from Portal (Full Strings)
      'Section 392(7) - Premature EPF Withdrawal (> ₹50,000)': 0.10,
      'Section 393(1) [Sl. No. 5(i)] - Interest on Securities': 0.10,
      'Section 393(1) [Sl. No. 5(ii/iii)] - Interest other than Securities': 0.10,
      'Section 393(1) [Sl. No. 7] - Dividends (Domestic Company)': 0.10,
      'Section 393(1) [Sl. No. 6(i)] - Contractor Payments (Large Payer) - Individual/HUF': 0.01,
      'Section 393(1) [Sl. No. 6(i)] - Contractor Payments (Large Payer) - Other than Individual/HUF': 0.02,
      'Section 393(1) [Sl. No. 6(ii)] - Contractor/Professional/Comm. (Ind/HUF Payer > ₹50L)': 0.05,
      'Section 393(1) [Sl. No. 6(iii).D(a)] - Technical Services / Call Centre / Film Royalty': 0.02,
      'Section 393(1) [Sl. No. 6(iii).D(b)] - Professional Fees / Other Royalty': 0.10,
      'Section 393(1) [Sl. No. 1(i)] - Insurance Commission': 0.02,
      'Section 393(1) [Sl. No. 1(ii)] - General Commission or Brokerage': 0.02,
      'Section 393(1) [Sl. No. 2(i)] - Rent (Individual/HUF Payer > ₹50,000/mo)': 0.02,
      'Section 393(1) [Sl. No. 2(ii).D(a)] - Rent on Plant & Machinery': 0.02,
      'Section 393(1) [Sl. No. 2(ii).D(b)] - Rent on Land & Building': 0.10,
      'Section 393(1) [Sl. No. 3(i)] - Transfer of Immovable Property (> ₹50L)': 0.01,
      'Section 393(1) [Sl. No. 8(ii)] - Purchase of Goods (exceeding ₹50L)': 0.001,
      'Section 393(1) [Sl. No. 8(vi)] - Virtual Digital Assets (VDA/Crypto)': 0.01,
      'Section 393(3) [Sl. No. 1] - Winnings from Lottery / Puzzles': 0.30,
      'Section 393(3) [Sl. No. 5] - Regular Filer (ITR filed in previous years) > 1 cr': 0.02,
      'Section 393(3) [Sl. No. 5] - Non-Filer (ITR not filed for past 3 years) > 20L': 0.02,
      'Section 393(3) [Sl. No. 5] - Non-Filer (ITR not filed for past 3 years) > 1Cr': 0.05,
      'Section 393(3) [Sl. No. 5] - Co-operative Societies > 3 cr': 0.02,
      'Section 393(3) [Sl. No. 7] - Payments to Partners (Salary/Comm. > ₹20k)': 0.10,
      'Section 393(2) [Sl. No. 1] - Sportsmen / Sports Association (Non-Resident)': 0.20,
      'Section 393(2) [Sl. No. 2/3/4] - Interest on Foreign Borrowings/IFSC Bonds for loans before july1, 2023': 0.05,
      'Section 393(2) [Sl. No. 2/3/4] - Interest on Foreign Borrowings/IFSC Bonds for loans after july1, 2023': 0.09,
      'Section 393(2) [Sl. No. 11/12] - Income/LTCG from Offshore Fund Units': 0.10,
      'Section 393(2) [Sl. No. 13/14] - Interest/Dividends/LTCG on Bonds/GDR': 0.10,
      'Section 393(2) [Sl. No. 17] - Any other sum payable to Non-Resident': 0.30,
    };

    const TCS_RATE_MAP: Record<string, number> = {
      'Sale of Scrap, Alcoholic Liquor, Minerals': 0.01,
      'Sale of Tendu Leaves': 0.05,
      'Sale of Forest Produce': 0.02,
      'Sale of Timber': 0.02,
      'Sale of Motor Vehicles': 0.01,
      'Sale of Specified Luxury Goods': 0.01,

      // Full Strings
      'Section 206C(1) - Sale of Scrap, Alcoholic Liquor, Minerals': 0.01,
      'Section 206C(1) - Sale of Tendu Leaves': 0.05,
      'Section 206C(1) - Sale of Forest Produce': 0.02,
      'Section 206C(1) - Sale of Timber': 0.02,
      'Section 206C(1F) - Sale of Motor Vehicles': 0.01,
      'Section 206C(1F) - Sale of Specified Luxury Goods': 0.01,
    };

    let rateDecimal = 0;
    let isTcs = false;

    if (vendorTaxType === 'TDS' && purchaseSelectedStatutorySection) {
      rateDecimal = findRate(TDS_RATE_MAP, purchaseSelectedStatutorySection);
      isTcs = false;
    } else if (vendorTaxType === 'TCS' && purchaseSelectedStatutorySection) {
      rateDecimal = findRate(TCS_RATE_MAP, purchaseSelectedStatutorySection);
      isTcs = true;
    } else {
      // Fallback for legacy data
      const rawTds = vendor.tds_rate;
      const rawTcs = vendor.tcs_rate;
      let activeRateStr = '';
      if (rawTds && rawTds !== '-' && rawTds !== '0%') {
        activeRateStr = rawTds;
        isTcs = false;
      } else if (rawTcs && rawTcs !== '-' && rawTcs !== '0%') {
        activeRateStr = rawTcs;
        isTcs = true;
      }

      if (activeRateStr) {
        const numeric = parseFloat(activeRateStr.split('/')[0].replace(/[^\d.]/g, ''));
        if (!isNaN(numeric) && numeric > 0) {
          rateDecimal = numeric / 100;
        }
      }
    }

    if (rateDecimal <= 0) {
      setPurchaseTdsIt('0.00');
      setPurchaseTaxIsTcs(false);
      return;
    }

    // TDS/TCS is on Invoice Value (including GST)
    const totalInvoice = purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0);
    const taxAmount = (totalInvoice * rateDecimal).toFixed(2);

    setPurchaseTdsIt(taxAmount);
    setPurchaseTaxIsTcs(isTcs);
  }, [party, vendorId, purchaseItems, richVendors, voucherType, vendorTaxType, purchaseSelectedStatutorySection]);
  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────

  // Recalculate all item taxes when transaction type (isInterState) changes
  useEffect(() => {
    if (!stockItems || !Array.isArray(stockItems)) {
      return;
    }

    // Recalculate simple items (Sales, etc.)
    setItems(currentItems => currentItems.map(item => {
      if (!item.name) return item;
      const stockItem = allItems.find(si => (si.name || '').toLowerCase() === (item.name || '').toLowerCase());
      if (!stockItem) return item;

      const gstRate = stockItem.gstRate || (stockItem as any).gst_rate || 0;
      const taxableAmount = (item.qty || 0) * (item.rate || 0);
      const totalTax = taxableAmount * (gstRate / 100);

      const newItem = { ...item, taxableAmount };
      if (isInterState) {
        newItem.cgstAmount = 0;
        newItem.sgstAmount = 0;
        newItem.igstAmount = totalTax;
      } else {
        newItem.cgstAmount = totalTax / 2;
        newItem.sgstAmount = totalTax / 2;
        newItem.igstAmount = 0;
      }
      newItem.totalAmount = taxableAmount + totalTax;
      return newItem;
    }));

    // Recalculate sophisticated Purchase items
    setPurchaseItems(prevItems => prevItems.map(item => {
      if (!item.itemName && !item.itemCode && !item.hsnSac) return item;

      const selectedStockItem = allItems.find((si: any) =>
        ((si.item_code || si.code) || '').toLowerCase() === (item.itemCode || '').toLowerCase() ||
        ((si.name || si.item_name) || '').toLowerCase() === (item.itemName || '').toLowerCase() ||
        ((si.hsn_sac || si.hsn) || '').toString().trim() === (item.hsnSac || '').toString().trim()
      );

      const gstRate = selectedStockItem?.gstRate || selectedStockItem?.gst_rate || 0;
      const cessRate = selectedStockItem?.cessRate || selectedStockItem?.cess_rate || 0;
      const taxable = (item.qty || 0) * (item.rate || 0);
      const totalTax = taxable * (gstRate / 100);
      const cess = totalTax * (cessRate / 100);

      const newItem = { ...item, taxableValue: taxable, cess };

      if (isInterState) {
        newItem.igst = totalTax;
        newItem.cgst = 0;
        newItem.sgst = 0;
      } else {
        newItem.igst = 0;
        newItem.cgst = totalTax / 2;
        newItem.sgst = totalTax / 2;
      }
      newItem.invoiceValue = taxable + newItem.igst + newItem.cgst + newItem.sgst + cess;
      return newItem;
    }));
  }, [isInterState, stockItems, allItems]);

  const formatDateForInput = (dateString: string): string => {
    if (!dateString) return '';
    // Split on any separator: - or /
    const parts = dateString.split(/[-\/]/);
    if (parts.length === 3) {
      // YYYY-MM-DD or YYYY/MM/DD
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      }
      // DD-MM-YYYY or DD/MM/YYYY
      if (parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    // Last resort: let JS parse it (works for RFC-2822 / ISO strings)
    try {
      const d = new Date(dateString);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    } catch { /* ignore */ }
    return '';
  };

  useEffect(() => {
    if (localPrefilledData) {



      // Keep current voucher type - don't change tabs, just populate form data

      if (voucherType === 'Purchase') {
        const partyLedger = ledgers.find(l => l.name.toLowerCase() === (localPrefilledData.sellerName || '').toLowerCase());
        const newIsInterState = (partyLedger && partyLedger.state && companyDetails.state)
          ? partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase()
          : false;

        setDate(formatDateForInput(localPrefilledData.invoiceDate) || getTodayDate());
        setInvoiceNo(localPrefilledData.invoiceNumber || '');
        setParty(localPrefilledData.sellerName || '');
        setIsInterState(newIsInterState);

        if (localPrefilledData.gstin) {
          setGstin(localPrefilledData.gstin);
        }
        if (localPrefilledData.branch) {
          setSelectedBranch(localPrefilledData.branch);
        }
        if (localPrefilledData.placeOfSupply) {
          setBillFromState(localPrefilledData.placeOfSupply);
        }
        if (localPrefilledData.billFrom) {
          setAddressFields(localPrefilledData.billFrom);
        }
        if (localPrefilledData.exchangeRate) {
          setExchangeRate(String(localPrefilledData.exchangeRate));
        }
        if (localPrefilledData.tdsIncomeTax !== undefined && localPrefilledData.tdsIncomeTax !== null) {
          setPurchaseTdsIt(localPrefilledData.tdsIncomeTax);
        }
        if (localPrefilledData.advanceAmount !== undefined && localPrefilledData.advanceAmount !== null) {
          setPurchaseAdvancePaid(localPrefilledData.advanceAmount);
        }
        if (localPrefilledData.postingNote !== undefined && localPrefilledData.postingNote !== null) {
          setPurchasePostingNote(localPrefilledData.postingNote);
        }

        // Transport/dispatch details
        if (localPrefilledData.dispatchFrom) {
          setPurchaseTransitReceivedIn(localPrefilledData.dispatchFrom);
        }
        if (localPrefilledData.modeOfTransport) {
          setPurchaseTransitMode(localPrefilledData.modeOfTransport);
        }
        if (localPrefilledData.dispatchDate) {
          setPurchaseTransitReceiptDate(formatDateForInput(localPrefilledData.dispatchDate) || getTodayDate());
        }
        if (localPrefilledData.dispatchTime) {
          setPurchaseTransitReceiptTime(localPrefilledData.dispatchTime);
        }
        if (localPrefilledData.transporterId) {
          setPurchaseTransitTransporterId(localPrefilledData.transporterId);
        }
        if (localPrefilledData.transporterName) {
          setPurchaseTransitTransporterName(localPrefilledData.transporterName);
        }
        if (localPrefilledData.vehicleNo) {
          setPurchaseTransitVehicleNo(localPrefilledData.vehicleNo);
        }
        if (localPrefilledData.lrGrConsignment) {
          setPurchaseTransitLrGrConsignment(localPrefilledData.lrGrConsignment);
        }

        if (localPrefilledData.lineItems && localPrefilledData.lineItems.length > 0) {
          const newSimpleItems = localPrefilledData.lineItems.map(item => {
            const stockItem = allItems.find(si => (si.name || si.item_name)?.toLowerCase() === (item.itemDescription || '').toLowerCase());
            const gstRate = stockItem?.gstRate || (stockItem as any)?.gst_rate || 18;
            const taxableAmount = item.quantity * item.rate;
            const tax = taxableAmount * (gstRate / 100);

            return {
              name: item.itemDescription,
              qty: item.quantity,
              rate: item.rate,
              taxableAmount,
              cgstAmount: newIsInterState ? 0 : tax / 2,
              sgstAmount: newIsInterState ? 0 : tax / 2,
              igstAmount: newIsInterState ? tax : 0,
              totalAmount: taxableAmount + tax,
            };
          });
          setItems(newSimpleItems);

          // Also populate the sophisticated purchaseItems grid
          const newPurchaseItems = localPrefilledData.lineItems.map((item, idx) => {
            const stockItem = allItems.find(si => (si.name || si.item_name)?.toLowerCase() === (item.itemDescription || '').toLowerCase());
            const qty = item.quantity || 0;
            const rate = item.rate || 0;
            const taxable = item.taxableValue || item.amount || (qty * rate);

            const igst = item.igst !== undefined ? item.igst : (newIsInterState ? (taxable * 0.18) : 0);
            const cgst = item.cgst !== undefined ? item.cgst : (newIsInterState ? 0 : (taxable * 0.09));
            const sgst = item.sgst !== undefined ? item.sgst : (newIsInterState ? 0 : (taxable * 0.09));
            const cess = item.cess !== undefined ? item.cess : 0;
            const invoiceValue = item.invoiceValue !== undefined ? item.invoiceValue : (taxable + igst + cgst + sgst + cess);

            return {
              id: (Date.now() + idx).toString(),
              itemCode: stockItem?.item_code || stockItem?.code || '',
              itemName: stockItem?.name || stockItem?.item_name || item.itemDescription || '',
              hsnSac: item.hsnCode || stockItem?.hsn_sac || stockItem?.hsn || '',
              qty: qty,
              uom: stockItem?.uom || stockItem?.unit || item.uom || '',
              rate: rate,
              taxableValue: taxable,
              igst: igst,
              cgst: cgst,
              sgst: sgst,
              cess: cess,
              invoiceValue: invoiceValue,
              description: item.itemDescription || '',
              foreignRate: 0,
              foreignAmount: 0,
              poRate: null as number | null,     // no PO linked — invoice scan
              invoiceRate: rate,                  // store scanned invoice rate
              rateMismatch: false,
              poQty: null as number | null,
              invoiceQty: qty,
              qtyMismatch: false,
              grnQty: null as number | null,
              sourcePoNo: null as string | null
            };
          });
          if (localPrefilledData.sellerName) {
            fetchVendorAdvances(localPrefilledData.sellerName);
          }
          setPurchaseItems(newPurchaseItems);

        } else {
          setItems([{ name: '', qty: 1, rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);
          setPurchaseItems([{ id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', poRate: null as number | null, invoiceRate: null as number | null, rateMismatch: false, poQty: null as number | null, invoiceQty: null as number | null, qtyMismatch: false, grnQty: null as number | null, sourcePoNo: null as string | null }]);
        }
      } else if (voucherType === 'Contra') {
        setDate(formatDateForInput(localPrefilledData.invoiceDate) || getTodayDate());
        setFromAccount(localPrefilledData.sellerName || '');
        setToAccount(localPrefilledData.invoiceNumber || ''); // Use invoice number as to account
        setSimpleAmount(localPrefilledData.totalAmount || 0);
      } else if (voucherType === 'Journal') {
        setDate(formatDateForInput(localPrefilledData.invoiceDate) || getTodayDate());
        // For journal, we could create entries based on the invoice data
        setEntries([
          { ledger: localPrefilledData.sellerName || '', note: '', refNo: '', debit: localPrefilledData.totalAmount || 0, credit: 0 },
          { ledger: '', note: '', refNo: '', debit: 0, credit: localPrefilledData.totalAmount || 0 }
        ]);
      }

      handleClearPrefilledData();
    }
  }, [localPrefilledData, handleClearPrefilledData, stockItems, ledgers, companyDetails.state, allItems, voucherType]);

  const setAddressFields = useCallback((addressData: any) => {
    if (typeof addressData === 'string') {
      let cleanAddress = addressData.trim();
      if (cleanAddress.startsWith('"') && cleanAddress.endsWith('"')) {
        cleanAddress = cleanAddress.substring(1, cleanAddress.length - 1).trim();
      } else if (cleanAddress.startsWith('"')) {
        cleanAddress = cleanAddress.substring(1).trim();
      } else if (cleanAddress.endsWith('"')) {
        cleanAddress = cleanAddress.substring(0, cleanAddress.length - 1).trim();
      }

      const parts = cleanAddress.split(',').map(p => p.trim()).filter(Boolean);
      let country = 'India';
      let state = '';
      let pincode = '';
      let city = '';
      let addressLines: string[] = [];

      const indianStates = [
        "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
        "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
        "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
        "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Puducherry",
        "Jammu and Kashmir", "Ladakh", "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu", "Lakshadweep", "Andaman and Nicobar Islands"
      ];

      const commonCities = [
        "coimbatore", "chennai", "bangalore", "mumbai", "delhi", "kolkata", "pune", "hyderabad",
        "ahmedabad", "surat", "jaipur", "lucknow", "kanpur", "nagpur", "patna", "indore", "thane",
        "bhopal", "gurgaon", "noida", "ghaziabad", "faridabad", "visakhapatnam", "vijayawada",
        "guntur", "nellore", "tirupati", "kurnool", "secunderabad", "warangal", "madurai", "trichy",
        "salem", "tiruppur", "erode", "vellore", "thoothukudi", "nagercoil", "kanchipuram",
        "thanjavur", "tirunelveli", "mysore", "hubli", "dharwad", "mangalore", "belgaum", "gulbarga",
        "davanagere", "bellary", "bijapur", "shimoga", "kochi", "trivandrum", "kozhikode", "thrissur",
        "kollam", "palakkad", "alappuzha", "kottayam", "kannur"
      ];

      const stateFallback = (cityName: string) => {
        const c = cityName.toLowerCase().trim();
        if (["coimbatore", "chennai", "madurai", "trichy", "salem", "tiruppur", "erode", "vellore", "thoothukudi", "nagercoil", "kanchipuram", "thanjavur", "tirunelveli"].some(x => c.includes(x))) return "Tamil Nadu";
        if (["bangalore", "mysore", "hubli", "dharwad", "mangalore", "belgaum", "gulbarga", "davanagere", "bellary", "bijapur", "shimoga"].some(x => c.includes(x))) return "Karnataka";
        if (["mumbai", "pune", "thane", "nagpur", "nashik", "aurangabad", "solapur"].some(x => c.includes(x))) return "Maharashtra";
        if (["delhi", "new delhi"].some(x => c.includes(x))) return "Delhi";
        if (["hyderabad", "secunderabad", "warangal"].some(x => c.includes(x))) return "Telangana";
        if (["visakhapatnam", "vijayawada", "guntur", "nellore", "tirupati", "kurnool"].some(x => c.includes(x))) return "Andhra Pradesh";
        if (["kochi", "trivandrum", "kozhikode", "thrissur", "kollam", "palakkad", "alappuzha", "kottayam", "kannur"].some(x => c.includes(x))) return "Kerala";
        return "";
      };

      parts.forEach(part => {
        let currentPart = part.trim();
        const pinMatch = currentPart.match(/\b\d{3}\s*[-]?\s*\d{3}\b/);
        if (pinMatch) {
          pincode = pinMatch[0].replace(/[^0-9]/g, '');
          currentPart = currentPart.replace(pinMatch[0], '').replace(/[-\s,]+$/, '').replace(/^[-\s,]+/, '').trim();
        }

        if (!currentPart) {
          return;
        }

        const lowerPart = currentPart.toLowerCase().replace(/[.\s"]/g, '');

        if (lowerPart === 'india') {
          country = currentPart;
          return;
        }

        const matchedState = indianStates.find(s => s.toLowerCase().replace(/\s/g, '') === lowerPart);
        if (matchedState) {
          state = matchedState;
          return;
        }

        addressLines.push(currentPart);
      });

      if (addressLines.length > 0 && !city) {
        const lastIndex = addressLines.length - 1;
        const lastPart = addressLines[lastIndex].trim();
        const lastPartLower = lastPart.toLowerCase().replace(/[.\s"]/g, '');

        const isCommonCity = commonCities.includes(lastPartLower) ||
          commonCities.some(c => lastPartLower.includes(c));

        const looksLikeStreet = lastPartLower.includes('road') ||
          lastPartLower.includes('rd') ||
          lastPartLower.includes('street') ||
          lastPartLower.includes('st') ||
          lastPartLower.includes('nagar') ||
          lastPartLower.includes('lane') ||
          lastPartLower.includes('building') ||
          lastPartLower.includes('plot') ||
          lastPartLower.includes('floor') ||
          lastPartLower.includes('no:');

        if (isCommonCity && !looksLikeStreet) {
          city = lastPart.replace(/[."]/g, '').trim();
          addressLines.splice(lastIndex, 1);
        } else if (addressLines.length > 1 && !looksLikeStreet) {
          city = lastPart;
          addressLines.splice(lastIndex, 1);
        } else {
          const matchedCity = commonCities.find(c => lastPartLower.includes(c));
          if (matchedCity) {
            city = matchedCity.toUpperCase();
          }
        }
      }

      setBillFromAddress1(addressLines[0] || '');
      setBillFromAddress2(addressLines[1] || '');
      setBillFromAddress3(addressLines[2] || '');
      setBillFromCity(city);
      setBillFromPincode(pincode);
      setBillFromState(state || stateFallback(city) || '');
      setBillFromCountry(country);
    } else if (addressData) {
      const a1 = addressData.addressLine1 || addressData.address_line_1 || '';
      const a2 = addressData.addressLine2 || addressData.address_line_2 || '';
      const a3 = addressData.addressLine3 || addressData.address_line_3 || '';
      const city = addressData.city || '';
      const pincode = addressData.pincode || '';
      const state = addressData.state || '';
      const country = addressData.country || 'India';

      setBillFromAddress1(a1);
      setBillFromAddress2(a2);
      setBillFromAddress3(a3);
      setBillFromCity(city);
      setBillFromPincode(pincode);
      setBillFromState(state);
      setBillFromCountry(country);
    }
  }, []);

  // Sync Input Type and Interstate status based on Party and Foreign Currency
  useEffect(() => {
    let baseGst = 'Intrastate';
    if (invoiceInForeignCurrency === 'Yes') {
      baseGst = 'Interstate';
    } else if (party && ledgers.length > 0 && companyDetails?.state) {
      const partyLedger = ledgers.find(l => l.name.toLowerCase() === party.toLowerCase());
      if (partyLedger && partyLedger.state) {
        const isInter = partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase();
        baseGst = isInter ? 'Interstate' : 'Intrastate';
      }
    }

    setPurchaseInputTypes(prev => {
      const newTypes = prev.filter(t => t !== 'Intrastate' && t !== 'Interstate');
      newTypes.push(baseGst);
      setIsInterState(baseGst === 'Interstate');
      return newTypes;
    });
  }, [party, ledgers, companyDetails, invoiceInForeignCurrency]);

  const { partyLedgers, accountLedgers, allLedgers, partyOptions, purchasePartyOptions, salesPartyOptions, allLedgerOptions, purchaseLedgerOptions, expenseLedgerOptions } = useMemo(() => {
    // Merge the prop ledgers with freshly-fetched ledgers so we always have the full set
    // The prop is the reliable source; freshLedgers supplements with any newly created ledgers
    const mergedMap = new Map<string, Ledger>();
    ledgers.forEach(l => mergedMap.set(String(l.id ?? l.name), l));
    freshLedgers.forEach(l => mergedMap.set(String(l.id ?? l.name), l));
    const effectiveLedgers = Array.from(mergedMap.values()).map((l) => ({
      ...l,
      // Canonical display name should be actual ledger endpoint when available.
      name: (l.ledger_type || l.name || '').toString().trim()
    }));

    // Helper to identify cash/bank accounts robustly
    const isCashBank = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      return g.includes('cash') || g.includes('bank') || g.includes('od') || g.includes('cc');
    };

    // Exclude hierarchy heading names accidentally saved as "ledgers" (group/sub-group nodes).
    // Keep true endpoints from the hierarchy (deepest value per row), and any custom ledger names.
    const normalizeName = (s: any) => (s ?? '').toString().trim().toLowerCase();
    const nonLeaf = new Set<string>();
    const leaf = new Set<string>();
    hierarchy.forEach((r: any) => {
      const mg = normalizeName(r.major_group_1);
      const g = normalizeName(r.group_1);
      const sg1 = normalizeName(r.sub_group_1_1);
      const sg2 = normalizeName(r.sub_group_2_1);
      const sg3 = normalizeName(r.sub_group_3_1);
      const led = normalizeName(r.ledger_1);
      if (mg) nonLeaf.add(mg);
      if (g) nonLeaf.add(g);
      if (sg1) nonLeaf.add(sg1);
      if (sg2) nonLeaf.add(sg2);
      if (sg3) nonLeaf.add(sg3);
      const endpoint = led || sg3 || sg2 || sg1 || g || mg;
      if (endpoint) leaf.add(endpoint);
    });
    const isHierarchyHeadingName = (name: string) => {
      const n = normalizeName(name);
      return !!n && nonLeaf.has(n);
    };

    const isRealLedgerLeaf = (l: Ledger) => {
      const n = normalizeName(l.name);
      if (!n) return false;
      // Exclude any structural nodes (group/sub-groups/categories) accidentally saved in ledgers.
      if (isHierarchyHeadingName(l.name)) return false;
      if (
        n === normalizeName(l.group as any) ||
        n === normalizeName(l.sub_group_1 as any) ||
        n === normalizeName(l.sub_group_2 as any) ||
        n === normalizeName(l.sub_group_3 as any)
      ) return false;
      return true;
    };

    // Only show true vendor ledgers in "Vendor Name" dropdown (Purchase).
    // This prevents unrelated ledgers like "Output GST" from appearing.
    const isVendorLedger = (l: Ledger) => {
      const g = (l.group || '').toLowerCase().trim();
      return g.includes('sundry creditors') || g.includes('trade payables');
    };

    const accountLedgers = cashBankLedgers.length > 0
      ? cashBankLedgers
      : effectiveLedgers.filter(isCashBank);

    const allLedgers = [...effectiveLedgers];

    const partyLedgers = effectiveLedgers.filter(l => !isCashBank(l) && isRealLedgerLeaf(l));

    const partyOptions = [...new Set([
      ...effectiveLedgers.filter(l => !isCashBank(l) && isRealLedgerLeaf(l)).map(l => l.name),
      ...richVendors.map(v => v.vendor_name),
      ...richCustomers.map(c => c.customer_name)
    ])].filter(Boolean);

    // Build purchase party options as objects so duplicate vendor names can be shown with their code
    const purchasePartyOptions: { label: string; value: string; isVendor?: boolean }[] = [];
    const seenVendorIds = new Set<string>();
    // Add all vendors from richVendors (portal) - include duplicates with code
    richVendors.forEach(v => {
      const id = String(v.id);
      if (seenVendorIds.has(id)) return;
      seenVendorIds.add(id);
      const name = v.vendor_name || '';
      if (!name) return;
      const code = v.vendor_code || '';
      const label = code ? `${name} - ${code}` : name;
      purchasePartyOptions.push({ label, value: code ? `${name}__${id}` : name, isVendor: true });
    });
    // Add ledger-only vendors (not in portal) by name
    const vendorLedgerNames = effectiveLedgers.filter(l => isVendorLedger(l) && isRealLedgerLeaf(l)).map(l => l.name);
    vendorLedgerNames.forEach(ledgerName => {
      const alreadyInPortal = richVendors.some(v => (v.vendor_name || '').toLowerCase() === (ledgerName || '').toLowerCase());
      if (!alreadyInPortal) {
        purchasePartyOptions.push({ label: ledgerName, value: ledgerName });
      }
    });

    const salesPartyOptions = [...new Set([
      ...richCustomers.map(c => c.customer_name)
    ])].filter(Boolean);

    // Ledger lists used in voucher account dropdowns must only contain true ledgers.
    const defaultLedgerNames = hierarchy
      .map(r => r.ledger_1)
      .filter(name => {
        if (!name) return false;
        const n = name.toLowerCase().trim();
        return !['purchase account', 'sales account'].includes(n);
      });

    const allLedgerOptions = Array.from(new Set([
      ...effectiveLedgers.filter(isRealLedgerLeaf).map(l => l.name),
      ...defaultLedgerNames
    ])).filter(Boolean) as string[];

    // Purchase Ledger dropdown: only Masters > Ledgers entries, excluding customer/vendor party groups
    const EXCLUDED_PARTY_GROUPS = ['sundry debtors', 'sundry creditors'];
    const EXCLUDED_NAMES = ['purchase account', 'sales account'];
    const purchaseLedgerOptions = Array.from(new Set([
      ...effectiveLedgers
        .filter(l => {
          if (!isRealLedgerLeaf(l)) return false;
          const group = (l.group || '').toLowerCase().trim();
          const name = (l.name || '').toLowerCase().trim();
          return !EXCLUDED_PARTY_GROUPS.includes(group) && !EXCLUDED_NAMES.includes(name);
        })
        .map(l => l.name),
      ...defaultLedgerNames.filter(n => !EXCLUDED_NAMES.includes(n.toLowerCase().trim()))
    ])).filter(Boolean) as string[];

    // Expense Ledger dropdown: only Expenditure category ledgers
    const expenseLedgerOptions = Array.from(new Set([
      ...effectiveLedgers
        .filter(l => {
          if (!isRealLedgerLeaf(l)) return false;
          const cat = (l.category || '').toLowerCase().trim();
          return cat === 'expenditure' || cat === 'expense' || cat === 'expenses';
        })
        .map(l => l.name),
      ...hierarchy
        .filter(r => {
          const cat = (r.major_group_1 || '').toLowerCase().trim();
          return cat === 'expenditure' || cat === 'expense' || cat === 'expenses';
        })
        .map(r => r.ledger_1)
        .filter(Boolean) as string[]
    ])).filter(name => {
      if (!name) return false;
      const n = name.toLowerCase().trim();
      return !['purchase account', 'sales account'].includes(n);
    }) as string[];

    return { partyLedgers, accountLedgers, allLedgers, partyOptions, purchasePartyOptions, salesPartyOptions, allLedgerOptions, purchaseLedgerOptions, expenseLedgerOptions };
  }, [ledgers, freshLedgers, hierarchy, cashBankLedgers, richVendors, vendorGstDetails, richCustomers]);

  const handlePartyChange = useCallback((value: string, forcedId?: number | string | null) => {
    // If the value is in "name__id" format (used for duplicate vendor disambiguation),
    // extract just the name for storage/display
    const cleanValue = value.replace(/^(.+)__\d+$/, '$1');
    setParty(cleanValue);
    setWasPartyAutoSet(false);

    // Clear GRN, PO and items when vendor changes to prevent stale data
    if (voucherType === 'Purchase') {
      setGrnRefNo('');
      setSelectedPurchasePOs([]);
      setPurchaseItems([{ id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null }]);
    }

    if (forcedId !== undefined && forcedId !== null) {
      if (typeof forcedId === 'number') {
        setVendorId(forcedId);
      } else if (typeof forcedId === 'string') {
        const match = forcedId.match(/vend-(\d+)/);
        if (match) {
          setVendorId(Number(match[1]));
        } else {
          setVendorId(null);
        }
      } else {
        setVendorId(null);
      }
    } else {
      setVendorId(null); // Reset until matched
    }

    // Auto-population logic for Vouchers
    if (voucherType === 'Purchase' || voucherType === 'Sales') {
      // (Fetch advances moved to end to ensure it runs even if matched above)

      if (!value) {
        setGstin('');
        setSelectedBranch('');
        setBillFromAddress1('');
        setBillFromAddress2('');
        setBillFromAddress3('');
        setBillFromCity('');
        setBillFromPincode('');
        setBillFromState('');
        setBillFromCountry('India');
        setVendorAddresses([]);
        setPurchaseTerms('');
        setMasterTermsData(null);
        return;
      }

      const match = value.match(/^(.*) \((.*)\)$/);
      const entityName = match ? match[1] : value;
      const refName = match ? match[2] : null;

      // 1. Try to match Vendor from Rich Data
      // New value format for portal vendors: "VendorName__<id>" (to support duplicates)
      // Legacy format: just the name, or "Name (code)"
      const lowerEntityName = (entityName || '').toLowerCase();
      let vendor: any = null;
      const idMatch = value.match(/^(.+)__(\d+)$/);
      if (idMatch) {
        const vendorId = parseInt(idMatch[2], 10);
        vendor = richVendors.find(v => v.id === vendorId);
      } else {
        vendor = richVendors.find(v => (v.vendor_name || '').toLowerCase() === lowerEntityName);
      }
      if (vendor) {
        setVendorId(vendor.id);
        let matchedGst = vendorGstDetails.find(g =>
          g.vendor_basic_detail === vendor.id && (refName ? g.reference_name === refName : true)
        );

        if (matchedGst) {
          if (matchedGst.gstin) setGstin(matchedGst.gstin);
          if (matchedGst.branch_address) {
            setAddressFields(matchedGst.branch_address);
          }
          if (matchedGst.reference_name) {
            setSelectedBranch(matchedGst.reference_name);
          } else {
            setSelectedBranch('');
          }
        } else {
          if (vendor.billing_address) {
            setAddressFields(vendor.billing_address);
          }
          setSelectedBranch('');
        }

        if (vendor.billing_currency) {
          setVendorBillingCurrency(vendor.billing_currency);
        } else {
          setVendorBillingCurrency('');
        }

        // Collect addresses for dropdown
        let addresses = [vendor.billing_address];
        vendorGstDetails.filter(g => g.vendor_basic_detail === vendor.id).forEach(g => {
          if (g.branch_address) addresses.push(g.branch_address);
        });
        setVendorAddresses(Array.from(new Set(addresses.filter(Boolean))));

        // Auto-populate Terms & Conditions
        const parts: string[] = [];
        if (vendor.credit_period) parts.push(`Credit Period: ${vendor.credit_period}`);
        if (vendor.credit_terms) parts.push(`Credit Terms: ${vendor.credit_terms}`);
        if (vendor.penalty_terms) parts.push(`Penalty Terms: ${vendor.penalty_terms}`);
        if (vendor.delivery_terms) parts.push(`Delivery Terms: ${vendor.delivery_terms}`);
        const warranty = vendor.warranty_details || vendor.warranty_guarantee_details;
        if (warranty) parts.push(`Warranty / Guarantee: ${warranty}`);
        if (vendor.force_majeure) parts.push(`Force Majeure: ${vendor.force_majeure}`);
        const dispute = vendor.dispute_terms || vendor.dispute_redressal_terms;
        if (dispute) parts.push(`Dispute & Redressal: ${dispute}`);
        setPurchaseTerms(parts.join('\n\n'));
        setMasterTermsData(vendor);

        // Parse Multi-select Statutory Sections
        console.log('Vendor Statutory Raw Data:', {
          name: vendor.vendor_name,
          tds_s: vendor.tds_section,
          tds_sa: vendor.tds_section_applicable,
          tcs_s: vendor.tcs_section,
          tcs_sa: vendor.tcs_section_applicable,
          tax_type: vendor.tax_type
        });

        const tcsStr = vendor.tcs_section_applicable || vendor.tcs_section || '';
        const tdsStr = vendor.tds_section_applicable || vendor.tds_section || '';

        // Split logic: prefer pipe delimiter, fallback to comma (ignoring commas inside parentheses)
        const splitPattern = /,(?![^(]*\))/;
        const tcsList = tcsStr.includes('|') ? tcsStr.split('|') : tcsStr.split(splitPattern);
        const tdsList = tdsStr.includes('|') ? tdsStr.split('|') : tdsStr.split(splitPattern);

        const filteredTcs = tcsList.filter(Boolean).map(s => s.trim());
        const filteredTds = tdsList.filter(Boolean).map(s => s.trim());

        setPurchaseAvailableTcsSections(filteredTcs);
        setPurchaseAvailableTdsSections(filteredTds);

        const derivedTaxType = vendor.tax_type || (tcsList.length > 0 ? 'TCS' : tdsList.length > 0 ? 'TDS' : 'NONE');
        setVendorTaxType(derivedTaxType);

        const isAuto = (vendor.enable_automatic_tds_posting === true || vendor.enable_automatic_tds_posting === 'true' || vendor.enable_automatic_tds_posting === 1);
        setPurchaseAutoTdsEnabled(isAuto);

        // Default selection - only if automatic posting is enabled for this vendor
        if (isAuto) {
          if (derivedTaxType === 'TCS' && tcsList.length > 0) {
            setPurchaseSelectedStatutorySection(tcsList[0]);
          } else if (derivedTaxType === 'TDS' && tdsList.length > 0) {
            setPurchaseSelectedStatutorySection(tdsList[0]);
          } else {
            setPurchaseSelectedStatutorySection('');
          }
        } else {
          setPurchaseSelectedStatutorySection('');
        }
      }

      // 2. Try to match Customer from Rich Data
      const customer = richCustomers.find(c => (c.customer_name || '').toLowerCase() === lowerEntityName);
      if (customer) {
        const branches = customer.gst_details?.branches || [];
        let matchedBranch = branches.find((b: any) => refName ? b.defaultRef === refName : true);

        if (matchedBranch) {
          if (matchedBranch.gstin) setGstin(matchedBranch.gstin);
          if (matchedBranch.address || matchedBranch.addressLine1) {
            setAddressFields(matchedBranch);
          }
        }

        // Collect addresses for dropdown
        let addresses = branches.map((b: any) => b.address).filter(Boolean);
        setVendorAddresses(Array.from(new Set(addresses)));

        // Auto-populate Terms & Conditions
        const parts: string[] = [];
        if (customer.credit_period) parts.push(`Credit Period: ${customer.credit_period}`);
        if (customer.credit_terms) parts.push(`Credit Terms: ${customer.credit_terms}`);
        if (customer.penalty_terms) parts.push(`Penalty Terms: ${customer.penalty_terms}`);
        if (customer.delivery_terms) parts.push(`Delivery Terms: ${customer.delivery_terms}`);
        const warranty = customer.warranty_details || customer.warranty_guarantee_details;
        if (warranty) parts.push(`Warranty / Guarantee: ${warranty}`);
        if (customer.force_majeure) parts.push(`Force Majeure: ${customer.force_majeure}`);
        const dispute = customer.dispute_terms || customer.dispute_redressal_terms;
        if (dispute) parts.push(`Dispute & Redressal: ${dispute}`);
        setPurchaseTerms(parts.join('\n\n'));
        setMasterTermsData(customer);
      }

      // 3. Fallback to Ledgers
      const ledger = ledgers.find(l => (l.name || '').toLowerCase() === (value || '').toLowerCase());
      if (ledger) {
        if (ledger.gstin) setGstin(ledger.gstin);
        if (ledger.additional_data?.address) {
          setAddressFields(ledger.additional_data.address);
        }
      }

      // 4. ALWAYS fetch advances if value present
      if (value) {
        let lookupValue = value;
        const idMatch = value.match(/^(.+)__(\d+)$/);
        if (idMatch) {
          lookupValue = `vend-${idMatch[2]}`;
        } else if (typeof forcedId === 'string' && forcedId.includes('vend-')) {
          lookupValue = forcedId;
        }
        fetchVendorAdvances(lookupValue);
      }
    }
  }, [richVendors, richCustomers, vendorGstDetails, voucherType, setAddressFields, setGstin, setVendorBillingCurrency, setVendorAddresses, setPurchaseTerms, setMasterTermsData, ledgers, setGrnRefNo, setSelectedPurchasePOs, setPurchaseItems, setPurchaseAdvanceRefs, fetchVendorAdvances]);

  // Keep purchase addresses and GSTIN in sync when user changes branch after selecting a vendor.
  useEffect(() => {
    if (voucherType !== 'Purchase' || !vendorId) return;
    if (!selectedBranch) return;

    const selectedGstRecord = vendorGstDetails.find(
      (g: any) => g.vendor_basic_detail === vendorId && g.reference_name === selectedBranch
    );
    if (!selectedGstRecord) return;

    if (selectedGstRecord.gstin) setGstin(selectedGstRecord.gstin);
    if (selectedGstRecord.branch_address) {
      setAddressFields(selectedGstRecord.branch_address);
    }
  }, [voucherType, vendorId, selectedBranch, vendorGstDetails, setAddressFields, setGstin]);

  // Hydrate vendor TDS/TCS statutory settings when vendorId changes or richVendors loads
  useEffect(() => {
    if (voucherType !== 'Purchase' || !vendorId || richVendors.length === 0) return;

    const targetId = typeof vendorId === 'string' ? parseInt(vendorId, 10) : vendorId;
    const vendor = richVendors.find(v => v.id === targetId);
    if (!vendor) return;

    const tcsStr = vendor.tcs_section_applicable || vendor.tcs_section || '';
    const tdsStr = vendor.tds_section_applicable || vendor.tds_section || '';

    const splitPattern = /,(?![^(]*\))/;
    const tcsList = tcsStr.includes('|') ? tcsStr.split('|') : tcsStr.split(splitPattern);
    const tdsList = tdsStr.includes('|') ? tdsStr.split('|') : tdsStr.split(splitPattern);

    const filteredTcs = tcsList.filter(Boolean).map((s: string) => s.trim());
    const filteredTds = tdsList.filter(Boolean).map((s: string) => s.trim());

    setPurchaseAvailableTcsSections(filteredTcs);
    setPurchaseAvailableTdsSections(filteredTds);

    const derivedTaxType = vendor.tax_type || (tcsList.length > 0 ? 'TCS' : tdsList.length > 0 ? 'TDS' : 'NONE');
    setVendorTaxType(derivedTaxType);

    const isAuto = (vendor.enable_automatic_tds_posting === true || vendor.enable_automatic_tds_posting === 'true' || vendor.enable_automatic_tds_posting === 1);
    setPurchaseAutoTdsEnabled(isAuto);

    if (isAuto) {
      if (derivedTaxType === 'TCS' && tcsList.length > 0) {
        setPurchaseSelectedStatutorySection(prev => prev || tcsList[0]);
      } else if (derivedTaxType === 'TDS' && tdsList.length > 0) {
        setPurchaseSelectedStatutorySection(prev => prev || tdsList[0]);
      } else {
        setPurchaseSelectedStatutorySection('');
      }
    } else {
      setPurchaseSelectedStatutorySection('');
    }
  }, [voucherType, vendorId, richVendors]);

  const validateVendorFromInvoice = async (vendorName: string, gstin: string, state: string, address: string, branch: string = '') => {
    try {
      setExtractedVendorData({ vendor_name: vendorName, gstin, state, address, branch });

      // Pre-fill branch in the form immediately if provided by AI
      if (branch) setSelectedBranch(branch);

      const response = await httpClient.post<any>('/api/purchase/vendors/validate/', {
        vendor_name: vendorName,
        gstin: gstin,
        state: state,
        address: address,
        branch: branch
      });

      if (response && response.status === 'FOUND') {
        setVendorValidationStatus('FOUND');
        setVendorMatchedBy(response.matched_by);
        setVendorId(response.vendor_id); // Match correctly
        setIsVendorDisabled(true);
        if (response.vendor_name) setParty(response.vendor_name);
        if (response.branch) setSelectedBranch(response.branch);
        if (gstin) setGstin(gstin); // Keep the gstin from invoice or use from response if backend returns it
      } else if (response && response.status === 'NOT_FOUND') {
        setVendorValidationStatus('NOT_FOUND');
        setIsVendorDisabled(false);
      } else if (response && response.status === 'GSTIN_CONFLICT') {
        setVendorValidationStatus('GSTIN_CONFLICT');
        setVendorConflictMsg(response.message);
        setIsVendorDisabled(false);
      }
    } catch (err) {
      console.error('Vendor validation error:', err);
    }
  };


  const openTermsModal = () => {
    // Pre-fill draft fields from current vendor/customer's T&C data
    setDraftCreditPeriod(masterTermsData?.credit_period || '');
    setDraftCreditTerms(masterTermsData?.credit_terms || '');
    setDraftPenaltyTerms(masterTermsData?.penalty_terms || '');
    setDraftDeliveryTerms(masterTermsData?.delivery_terms || '');
    // Support both vendor and customer field names for warranty/dispute
    setDraftWarrantyDetails(masterTermsData?.warranty_details || masterTermsData?.warranty_guarantee_details || '');
    setDraftForceMajeure(masterTermsData?.force_majeure || '');
    setDraftDisputeTerms(masterTermsData?.dispute_terms || masterTermsData?.dispute_redressal_terms || '');
    setIsTermsModalOpen(true);
  };

  const saveTermsModal = () => {
    // Build formatted display string from individual fields
    const parts: string[] = [];
    if (draftCreditPeriod) parts.push(`Credit Period: ${draftCreditPeriod}`);
    if (draftCreditTerms) parts.push(`Credit Terms: ${draftCreditTerms}`);
    if (draftPenaltyTerms) parts.push(`Penalty Terms: ${draftPenaltyTerms}`);
    if (draftDeliveryTerms) parts.push(`Delivery Terms: ${draftDeliveryTerms}`);
    if (draftWarrantyDetails) parts.push(`Warranty / Guarantee: ${draftWarrantyDetails}`);
    if (draftForceMajeure) parts.push(`Force Majeure: ${draftForceMajeure}`);
    if (draftDisputeTerms) parts.push(`Dispute & Redressal: ${draftDisputeTerms}`);
    if (parts.length > 0) {
      if (voucherType === 'Credit Note') {
        setCnTermsConditions(parts.join('\n\n'));
      } else {
        setPurchaseTerms(parts.join('\n\n'));
      }
    } else {
      if (voucherType === 'Credit Note') {
        setCnTermsConditions('');
      } else {
        setPurchaseTerms('');
      }
    }
    setIsTermsModalOpen(false);
  };

  const { totalTaxableAmount, totalCgst, totalSgst, totalIgst, total } = useMemo(() => {
    return items.reduce((acc, item) => {
      acc.totalTaxableAmount += item.taxableAmount;
      acc.totalCgst += item.cgstAmount;
      acc.totalSgst += item.sgstAmount;
      acc.totalIgst += item.igstAmount;
      acc.total += item.totalAmount;
      return acc;
    }, { totalTaxableAmount: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, total: 0 });
  }, [items]);

  const { totalDebit, totalCredit, isJournalBalanced } = useMemo(() => {
    const totalDebit = entries.reduce((acc, entry) => acc + entry.debit, 0);
    const totalCredit = entries.reduce((acc, entry) => acc + entry.credit, 0);
    const isJournalBalanced = totalDebit === totalCredit && totalDebit > 0;
    return { totalDebit, totalCredit, isJournalBalanced };
  }, [entries]);

  const handleItemChange = (index: number, field: keyof VoucherItem, value: string | number) => {
    const newItems = [...items];
    const item = { ...newItems[index] };

    if (field === 'name') {
      item.name = value as string;
    } else {
      // FIX: Ensure value is treated as a number to avoid type errors.
      (item as any)[field] = typeof value === 'string' ? parseFloat(value) || 0 : value;
    }

    const stockItem = stockItems.find(si => si.name.toLowerCase() === item.name.toLowerCase());
    const gstRate = stockItem?.gstRate || (stockItem as any)?.gst_rate || 0;

    item.taxableAmount = item.qty * item.rate;
    const totalTax = item.taxableAmount * (gstRate / 100);

    if (isInterState) {
      item.cgstAmount = 0;
      item.sgstAmount = 0;
      item.igstAmount = totalTax;
    } else {
      item.cgstAmount = totalTax / 2;
      item.sgstAmount = totalTax / 2;
      item.igstAmount = 0;
    }
    item.totalAmount = item.taxableAmount + totalTax;

    newItems[index] = item;
    setItems(newItems);
  };

  const handleEntryChange = (index: number, field: keyof JournalEntry, value: string | number) => {
    const newEntries = [...entries];
    newEntries[index] = { ...newEntries[index], [field]: value };
    setEntries(newEntries);
  }

  const handleAddItemRow = () => setItems([...items, { name: '', qty: 1, rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);
  const handleRemoveItemRow = (index: number) => items.length > 1 && setItems(items.filter((_, i) => i !== index));
  const handleAddEntryRow = () => setEntries([...entries, { ledger: '', note: '', refNo: '', debit: 0, credit: 0 }]);
  const handleRemoveEntryRow = (index: number) => entries.length > 2 && setEntries(entries.filter((_, i) => i !== index));

  const loadNextScanItem = async (currentHash: string) => {
    if (!activeOcrSessionId) {
      handleCloseVoucher();
      return;
    }
    try {
      const response: any = await httpClient.get(`/api/ocr-staging/?upload_session_id=${activeOcrSessionId}`);
      const rows = response.data?.data || response.data || [];
      const currentIndex = rows.findIndex((r: any) => r.file_hash === currentHash);

      let nextRow = null;
      for (let i = currentIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.validationStatus !== 'VOUCHER_CREATED' && row.status !== 'FINALIZED' && !row.processed) {
          nextRow = row;
          break;
        }
      }

      if (!nextRow) {
        for (let i = 0; i < currentIndex; i++) {
          const row = rows[i];
          if (row.validationStatus !== 'VOUCHER_CREATED' && row.status !== 'FINALIZED' && !row.processed) {
            nextRow = row;
            break;
          }
        }
      }

      if (nextRow) {
        setActiveOcrFileHash(nextRow.file_hash);
        setActiveOcrFileName(nextRow.file_name || nextRow.file_path?.split('/').pop() || '');

        const data = nextRow.extracted_data || {};
        const invoice = data.invoice || data.header || data;
        const items = data.items || data.line_items || [];

        const prefilled: ExtractedInvoiceData = {
          invoiceNumber: nextRow.invoice_number || nextRow.invoice_no || invoice.invoice_no || invoice.invoice_number || '',
          sellerName: nextRow.vendor_name || invoice.vendor_name || '',
          invoiceDate: nextRow.invoice_date || invoice.invoice_date || '',
          gstin: nextRow.vendor_gstin || nextRow.gstin || invoice.vendor_gstin || invoice.gstin || '',
          subtotal: Number(nextRow.total_taxable_value || invoice.total_taxable_value || invoice.taxable_value || 0),
          cgstAmount: Number(nextRow.total_cgst || invoice.total_cgst || 0),
          sgstAmount: Number(nextRow.total_sgst || invoice.total_sgst || 0),
          igstAmount: Number(nextRow.total_igst || invoice.total_igst || 0),
          totalAmount: Number(nextRow.total_amount || invoice.total_amount || invoice.invoice_total || 0),

          placeOfSupply: nextRow.place_of_supply || invoice.place_of_supply || '',
          branch: nextRow.branch || invoice.branch || '',
          billFrom: nextRow.bill_from || invoice.bill_from || '',
          billTo: nextRow.bill_to || invoice.bill_to || invoice.billing_address || '',

          dispatchFrom: nextRow.dispatchFrom || nextRow.dispatch_from || invoice.dispatchFrom || invoice.dispatch_from || '',
          modeOfTransport: nextRow.modeOfTransport || nextRow.mode_of_transport || invoice.modeOfTransport || invoice.mode_of_transport || '',
          dispatchDate: nextRow.dispatchDate || nextRow.dispatch_date || invoice.dispatchDate || invoice.dispatch_date || '',
          dispatchTime: nextRow.dispatchTime || nextRow.dispatch_time || invoice.dispatchTime || invoice.dispatch_time || '',
          transporterId: nextRow.transporterId || nextRow.transporter_id || invoice.transporterId || invoice.transporter_id || '',
          transporterName: nextRow.transporterName || nextRow.transporter_name || invoice.transporterName || invoice.transporter_name || '',
          vehicleNo: nextRow.vehicleNo || nextRow.vehicle_no || invoice.vehicleNo || invoice.vehicle_no || '',
          lrGrConsignment: nextRow.lrGrConsignment || nextRow.lr_gr_consignment || invoice.lrGrConsignment || invoice.lr_gr_consignment || '',

          tdsIncomeTax: String(data.sections?.due_details?.tds_it || invoice.sections?.due_details?.tds_it || data.tds_it || nextRow.tds_it || invoice.tds_it || '0.00'),
          advanceAmount: String(data.sections?.due_details?.advance_paid || invoice.sections?.due_details?.advance_paid || data.advance_amount || nextRow.advance_amount || invoice.advance_amount || '0.00'),
          postingNote: data.sections?.due_details?.posting_note || invoice.sections?.due_details?.posting_note || data.posting_note || nextRow.posting_note || invoice.posting_note || '',

          lineItems: items.map((it: any) => {
            const qty = Number(it.qty || it.quantity || 1);
            const rate = Number(it.rate || it.item_rate || it['Item Rate'] || 0);
            const taxableValue = Number(it.taxable_value || it.taxableValue || it.taxable || it.total_amount || it.amount || (qty * rate));
            const cgst = Number(it.cgst_amount !== undefined ? it.cgst_amount : (it.cgst !== undefined ? it.cgst : 0));
            const sgst = Number(it.sgst_amount !== undefined ? it.sgst_amount : (it.sgst !== undefined ? it.sgst : 0));
            const igst = Number(it.igst_amount !== undefined ? it.igst_amount : (it.igst !== undefined ? it.igst : 0));
            const cess = Number(it.cess_amount !== undefined ? it.cess_amount : (it.cess !== undefined ? it.cess : 0));

            const rawInvVal = Number(it.invoice_value !== undefined ? it.invoice_value : (it.invoiceValue !== undefined ? it.invoiceValue : 0));
            const invoiceValue = rawInvVal > 0 ? rawInvVal : (taxableValue + cgst + sgst + igst + cess);

            return {
              itemDescription: it.description || it['Item Name'] || it.Description || '',
              hsnCode: it.hsn_sac || it.hsn || '',
              quantity: qty,
              rate: rate,
              amount: taxableValue,
              cgst,
              sgst,
              igst,
              cess,
              taxableValue,
              invoiceValue
            };
          })
        };

        setLocalPrefilledData(prefilled);
        showInfo(`Loaded next invoice for review: ${nextRow.vendor_name || 'Unknown Vendor'}`);
      } else {
        showSuccess("All invoices in the batch have been processed!");
        handleCloseVoucher();
      }
    } catch (err) {
      console.error("Error loading next scan item:", err);
      handleCloseVoucher();
    }
  };

  const fetchLatestStagingData = useCallback(async () => {
    if (!activeOcrFileHash) return;
    try {
      console.log(`[VouchersPage] Fetching latest saved state for fileHash: ${activeOcrFileHash}`);
      const response: any = await httpClient.get(`/api/ocr-staging/${activeOcrFileHash}/`);
      const rows = response.data?.data || response.data || [];
      const record = rows[0];
      if (record) {
        const data = record.extracted_data || {};
        const invoice = data.invoice || data.header || data;
        const items = data.items || data.line_items || [];

        const prefilled: ExtractedInvoiceData = {
          invoiceNumber: record.invoice_no || record.invoice_number || invoice.invoice_no || invoice.invoice_number || '',
          sellerName: record.vendor_name || invoice.vendor_name || '',
          invoiceDate: record.invoice_date || invoice.invoice_date || '',
          gstin: record.vendor_gstin || record.gstin || invoice.vendor_gstin || invoice.gstin || '',
          subtotal: Number(record.total_taxable_value || invoice.total_taxable_value || invoice.taxable_value || 0),
          cgstAmount: Number(record.total_cgst || invoice.total_cgst || 0),
          sgstAmount: Number(record.total_sgst || invoice.total_sgst || 0),
          igstAmount: Number(record.total_igst || invoice.total_igst || 0),
          totalAmount: Number(record.total_amount || invoice.total_amount || invoice.invoice_total || 0),

          placeOfSupply: record.place_of_supply || invoice.place_of_supply || '',
          branch: record.branch || invoice.branch || '',
          billFrom: record.bill_from || invoice.bill_from || '',
          billTo: record.bill_to || invoice.bill_to || invoice.billing_address || '',

          dispatchFrom: record.dispatchFrom || record.dispatch_from || invoice.dispatchFrom || invoice.dispatch_from || '',
          modeOfTransport: record.modeOfTransport || record.mode_of_transport || invoice.modeOfTransport || invoice.mode_of_transport || '',
          dispatchDate: record.dispatchDate || record.dispatch_date || invoice.dispatchDate || invoice.dispatch_date || '',
          dispatchTime: record.dispatchTime || record.dispatch_time || invoice.dispatchTime || invoice.dispatch_time || '',
          transporterId: record.transporterId || record.transporter_id || invoice.transporterId || invoice.transporter_id || '',
          transporterName: record.transporterName || record.transporter_name || invoice.transporterName || invoice.transporter_name || '',
          vehicleNo: record.vehicleNo || record.vehicle_no || invoice.vehicleNo || invoice.vehicle_no || '',
          lrGrConsignment: record.lrGrConsignment || record.lr_gr_consignment || invoice.lrGrConsignment || invoice.lr_gr_consignment || '',

          tdsIncomeTax: String(data.sections?.due_details?.tds_it || invoice.sections?.due_details?.tds_it || data.tds_it || record.tds_it || invoice.tds_it || '0.00'),
          advanceAmount: String(data.sections?.due_details?.advance_paid || invoice.sections?.due_details?.advance_paid || data.advance_amount || record.advance_amount || invoice.advance_amount || '0.00'),
          postingNote: data.sections?.due_details?.posting_note || invoice.sections?.due_details?.posting_note || data.posting_note || record.posting_note || invoice.posting_note || '',

          lineItems: items.map((it: any) => {
            const qty = Number(it.qty || it.quantity || 1);
            const rate = Number(it.rate || it.item_rate || it['Item Rate'] || 0);
            const taxableValue = Number(it.taxable_value || it.taxableValue || it.taxable || it.total_amount || it.amount || (qty * rate));
            const cgst = Number(it.cgst_amount !== undefined ? it.cgst_amount : (it.cgst !== undefined ? it.cgst : 0));
            const sgst = Number(it.sgst_amount !== undefined ? it.sgst_amount : (it.sgst !== undefined ? it.sgst : 0));
            const igst = Number(it.igst_amount !== undefined ? it.igst_amount : (it.igst !== undefined ? it.igst : 0));
            const cess = Number(it.cess_amount !== undefined ? it.cess_amount : (it.cess !== undefined ? it.cess : 0));

            const rawInvVal = Number(it.invoice_value !== undefined ? it.invoice_value : (it.invoiceValue !== undefined ? it.invoiceValue : 0));
            const invoiceValue = rawInvVal > 0 ? rawInvVal : (taxableValue + cgst + sgst + igst + cess);

            return {
              itemDescription: it.description || it['Item Name'] || it.Description || '',
              hsnCode: it.hsn_sac || it.hsn || '',
              quantity: qty,
              rate: rate,
              amount: taxableValue,
              cgst,
              sgst,
              igst,
              cess,
              taxableValue,
              invoiceValue
            };
          })
        };

        setLocalPrefilledData(prefilled);
      }
    } catch (err) {
      console.error("[VouchersPage] Failed to fetch latest staging data:", err);
    }
  }, [activeOcrFileHash]);

  useEffect(() => {
    fetchLatestStagingData();
  }, [activeOcrFileHash, fetchLatestStagingData]);

  const handleSaveChanges = async () => {
    if (!activeOcrFileHash) return;
    try {
      const billFromAddress = [billFromAddress1, billFromAddress2, billFromAddress3, billFromCity, billFromPincode, billFromState, billFromCountry].filter(Boolean).join(', ');

      const updated_data = {
        invoice_no: invoiceNo,
        invoice_date: date,
        vendor_name: party,
        gstin: gstin,
        branch: selectedBranch,
        place_of_supply: billFromState,
        bill_from: billFromAddress,
        total_taxable_value: purchaseItems.reduce((sum, item) => sum + (Number(item.taxableValue) || 0), 0),
        total_cgst: purchaseItems.reduce((sum, item) => sum + (Number(item.cgst) || 0), 0),
        total_sgst: purchaseItems.reduce((sum, item) => sum + (Number(item.sgst) || 0), 0),
        total_igst: purchaseItems.reduce((sum, item) => sum + (Number(item.igst) || 0), 0),
        total_cess: purchaseItems.reduce((sum, item) => sum + (Number(item.cess) || 0), 0),
        total_amount: purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0),
        sections: {
          supplier_details: {
            supplier_invoice_no: invoiceNo,
            invoice_date: date,
            vendor_name: party,
            gstin: gstin,
            branch: selectedBranch,
            place_of_supply: billFromState,
            bill_from: billFromAddress,
            city: billFromCity,
            state: billFromState,
            pincode: billFromPincode,
            country: billFromCountry
          },
          supply_details: {
            purchase_order_no: purchaseOrderNo,
            purchase_ledger: purchaseLedger,
            description: purchaseDescription,
            exchange_rate: exchangeRate ? Number(exchangeRate) : 1.0,
          },
          due_details: {
            tds_it: purchaseTdsIt || 0,
            advance_paid: purchaseAdvancePaid || 0,
            posting_note: purchasePostingNote,
            terms: purchaseTerms,
          },
          transit_details: {
            mode: purchaseTransitMode,
            received_in: purchaseTransitReceivedIn,
            receipt_date: purchaseTransitReceiptDate || null,
            receipt_time: purchaseTransitReceiptTime || null,
            received_quantity: purchaseTransitReceivedQty,
            uqc: purchaseTransitReceivedUqc,
            delivery_type: purchaseTransitDeliveryType,
            self_third_party: purchaseTransitSelfThirdParty,
            transporter_id: purchaseTransitTransporterId,
            transporter_name: purchaseTransitTransporterName,
            vehicle_no: purchaseTransitVehicleNo,
            lr_gr_consignment: purchaseTransitLrGrConsignment
          },
          items: purchaseItems.map((item) => ({
            description: item.itemName || item.description || '',
            hsn_sac: item.hsnSac || '',
            qty: Number(item.qty || 0),
            rate: Number(item.rate || 0),
            total_amount: Number(item.taxableValue || 0),
            cgst_amount: Number(item.cgst || 0),
            sgst_amount: Number(item.sgst || 0),
            igst_amount: Number(item.igst || 0),
            cess_amount: Number(item.cess || 0),
            invoice_value: Number(item.invoiceValue || 0)
          }))
        }
      };

      await httpClient.patch(`/api/ocr-staging/${activeOcrFileHash}/`, {
        extracted_data: updated_data
      });

      showSuccess('Staged invoice changes saved successfully!');
      await fetchLatestStagingData();
    } catch (err: any) {
      console.error('[VouchersPage] Failed to save staged changes:', err);
      showError('Failed to save staged invoice changes: ' + (err.message || err));
    }
  };

  const handleSaveVoucher = async (shouldPrint = false, saveAndNext = false) => {
    if (isSubmitting) return;
    setIsSubmitting(true);

    try {
      let voucher: Voucher | null = null;
      const isEditing = !!viewVoucherData;
      // reference_id on the fetched drillDownDetails is the actual VoucherContra/Journal/Expenses record ID.
      // viewVoucherData.id is the generic Voucher table ID — NOT the right one for type-specific PUT endpoints.
      const genericVoucherId = isEditing ? (viewVoucherData.rawVoucher?.voucher_id || viewVoucherData.voucherId || viewVoucherData.id || viewVoucherData.rawVoucher?.id) : null;
      const referenceId = drillDownDetails?.reference_id || viewVoucherData?.rawVoucher?.reference_id || viewVoucherData?.reference_id || null;
      // For Purchase vouchers: drillDownDetails.id IS the VoucherPurchaseSupplierDetails integer PK
      // (the backend serializer doesn't expose reference_id, only id).
      // viewVoucherData.reference_id is also the same PK — set by the backend report endpoint.
      // For all other types: referenceId is the specific model PK, fall back to genericVoucherId.
      const purchasePk = drillDownDetails?.id || viewVoucherData?.reference_id || viewVoucherData?.rawVoucher?.reference_id || null;
      const voucherId = referenceId || genericVoucherId;

      console.log('🔴 [SAVE START] voucherType=', voucherType, '| isEditing=', isEditing, '| purchasePk=', purchasePk, '| voucherId=', voucherId, '| genericVoucherId=', genericVoucherId, '| drillDownDetails?.id=', drillDownDetails?.id, '| viewVoucherData?.reference_id=', viewVoucherData?.reference_id);

      if (voucherType === 'Purchase') {
        let currentVendorId = vendorId;
        console.log('🔴 [PURCHASE SAVE] vendorId state=', vendorId, '| party=', party, '| selectedPurchaseConfig=', selectedPurchaseConfig);
        if (!currentVendorId && party) {
          // Try auto-match from richVendors
          const lowerParty = party.toLowerCase();
          const match = richVendors.find(v => v.vendor_name.toLowerCase() === lowerParty);
          if (match) {
            currentVendorId = match.id;
            setVendorId(match.id);
            console.log('🔴 [PURCHASE SAVE] Auto-matched vendorId=', match.id);
          } else {
            console.log('🔴 [PURCHASE SAVE] No vendor match found in richVendors for party=', party, '| richVendors count=', richVendors.length);
          }
        }

        if (!currentVendorId) {
          showError("Please select a valid Vendor from the Master list.");
          console.error('🔴 [PURCHASE SAVE] BLOCKED: no currentVendorId');
          return;
        }

        if (!selectedPurchaseConfig) {
          showError("Please select a Purchase Voucher Series.");
          console.error('🔴 [PURCHASE SAVE] BLOCKED: no selectedPurchaseConfig');
          return;
        }

        console.log('🔴 [PURCHASE SAVE] Passed validation. Proceeding to build payload...');

        // Construct Payload for Purchase Voucher
        const purchaseData: any = {
          date: date,
          supplier_invoice_no: invoiceNo,
          supplier_invoice_date: supplierInvoiceDate,
          purchase_voucher_series: selectedPurchaseConfig,
          purchase_voucher_no: voucherNumber,
          vendor_id: currentVendorId,
          vendor_name: party,
          branch: selectedBranch,
          gstin: gstin,
          grn_reference: grnRefNo,
          bill_from: [billFromAddress1, billFromAddress2, billFromAddress3, billFromCity, billFromPincode, billFromState, billFromCountry].filter(Boolean).join(', '),
          ship_from: sameAsBillFrom
            ? [billFromAddress1, billFromAddress2, billFromAddress3, billFromCity, billFromPincode, billFromState, billFromCountry].filter(Boolean).join(', ')
            : [shipFromAddress1, shipFromAddress2, shipFromAddress3, shipFromCity, shipFromPincode, shipFromState, shipFromCountry].filter(Boolean).join(', '),
          input_type: purchaseInputTypes.join(', '),
          invoice_in_foreign_currency: invoiceInForeignCurrency,

          due_details: {
            tds_it: purchaseTdsIt || 0,
            advance_paid: purchaseAdvancePaid || 0,
            to_pay: (
              purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0)
              + (purchaseTaxIsTcs ? (Number(purchaseTdsIt) || 0) : -(Number(purchaseTdsIt) || 0))
              - (Number(purchaseAdvancePaid) || 0)
            ).toFixed(2),
            posting_note: purchasePostingNote,
            terms: purchaseTerms,
            advance_references: purchaseAdvanceRefs
          },
          transit_details: {
            mode: purchaseTransitMode,
            received_in: purchaseTransitReceivedIn,
            receipt_date: purchaseTransitReceiptDate || null,
            receipt_time: purchaseTransitReceiptTime || null,
            received_quantity: purchaseTransitReceivedQty,
            uqc: purchaseTransitReceivedUqc,
            delivery_type: purchaseTransitDeliveryType,
            self_third_party: purchaseTransitSelfThirdParty,
            transporter_id: purchaseTransitTransporterId,
            transporter_name: purchaseTransitTransporterName,
            vehicle_no: purchaseTransitVehicleNo,
            lr_gr_consignment: purchaseTransitLrGrConsignment
          }
        };

        const mappedItems = purchaseItems.map(item => ({
          item_code: item.itemCode || '',
          item_name: item.itemName || '',
          hsn_sac: item.hsnSac || '',
          quantity: Number(item.qty || 0),
          uom: item.uom || '',
          rate: Number(item.rate || 0),
          taxable_value: Number(item.taxableValue || 0),
          foreign_rate: Number(item.foreignRate || 0),
          foreign_amount: Number(item.foreignAmount || 0),
          igst_amount: Number(item.igst || 0),
          cgst_amount: Number(item.cgst || 0),
          sgst_amount: Number(item.sgst || 0),
          cess_amount: Number(item.cess || 0),
          invoice_value: Number(item.invoiceValue || 0),
          description: item.description || ''
        }));

        // Conditionally add Supply Details to avoid sending 'null' which creates strict validation errors
        // Always include Supply INR Details
        purchaseData.supply_inr_details = {
          purchase_order_no: purchaseOrderNo,
          purchase_ledger: purchaseLedger,
          description: purchaseDescription,
          items: mappedItems
        };

        // Conditionally add Supply Foreign Details
        if (invoiceInForeignCurrency === 'Yes') {
          purchaseData.supply_foreign_details = {
            purchase_order_no: purchaseOrderNo,
            purchase_ledger: purchaseLedger,
            exchange_rate: exchangeRate || 1.0,
            description: purchaseDescription,
            items: mappedItems
          };
        }

        // DEBUG: Alert/log the final payload

        // alert('Debug: Sending Payload. Check Console.');

        try {

          let response;
          console.log('🔴 [PURCHASE SAVE] isEditing=', isEditing, '| purchasePk=', purchasePk, '| voucherId=', voucherId, '| Will PUT=', isEditing && !!(purchasePk || voucherId));
          if (isEditing && (purchasePk || voucherId)) {
            const putId = purchasePk || voucherId;
            console.log('🔴 [PURCHASE SAVE] Sending PUT to /api/vouchers/purchase/' + putId + '/');
            response = await httpClient.put(`/api/vouchers/purchase/${putId}/`, purchaseData);
            console.log('🔴 [PURCHASE SAVE] PUT response=', response);
            showSuccess('Purchase Voucher Updated Successfully!');
          } else {
            console.log('🔴 [PURCHASE SAVE] Sending POST (new voucher)');
            response = await httpClient.post('/api/vouchers/purchase/', purchaseData);
            showSuccess('Purchase Voucher Saved Successfully!');
          }

          // After a successful edit, force a fresh refetch from the server so the Daybook
          // is 100% correct before the user sees it (avoids stale cache showing old data).
          if (isEditing && onAddVouchers) {
            // Optimistically update cache with new totals immediately
            onAddVouchers([{
              ...response,
              id: genericVoucherId?.toString() || response?.id?.toString() || Date.now().toString(),
              type: 'Purchase',
              date: date,
              party: party,
              total: Number(calculatePurchaseTotals().invoiceValue),
              narration: purchasePostingNote
            }], false);
          } else if (onAddVouchers) {
            // New voucher: propagate to cache
            onAddVouchers([{
              ...response,
              id: response?.id?.toString() || Date.now().toString(),
              type: 'Purchase',
              date: date,
              party: party,
              total: Number(calculatePurchaseTotals().invoiceValue),
              narration: purchasePostingNote
            }], false);
          }

          // Increment the voucher number if a series was selected
          if (selectedPurchaseConfig && purchaseVoucherConfigs.length > 0) {
            const config = purchaseVoucherConfigs.find(c => c.voucher_name === selectedPurchaseConfig);
            if (config && config.enable_auto_numbering) {
              await incrementPurchaseNumber(config.id);
            }
          }

          // Optional: Handle file upload separately if needed, or if we switch to FormData later.

          if (activeOcrFileHash) {
            // Update the staging row to VOUCHER_CREATED so it doesn't get finalized again
            try {
              await httpClient.patch(`/api/ocr-staging/${activeOcrFileHash}/`, {
                status: 'VOUCHER_CREATED',
                voucher_id: response?.id
              });
            } catch (e) {
              console.error('Failed to update OCR staging status', e);
            }
            if (saveAndNext) {
              await loadNextScanItem(activeOcrFileHash);
            } else {
              handleCloseVoucher();
            }
          } else if (shouldPrint) {
            const totals = calculatePurchaseTotals();
            setPostedPurchaseVoucherData({
              ...purchaseData,
              totals,
              items: purchaseItems
            });
            setShowPurchasePrintPreview(true);
          } else {
            resetForm();
            if (isEditing) handleCloseVoucher();
          }
          refetch(); // Refresh usage statistics

        } catch (error: any) {
          console.error('Error saving purchase voucher:');
          const serverError = error.response?.data;
          const errorMessage = serverError
            ? (typeof serverError === 'object' ? JSON.stringify(serverError, null, 2) : serverError)
            : error.message;
          showError(`Failed to save Purchase Voucher.\n${errorMessage}`);

        }
        return;
      }

      if (voucherType === 'Credit Note') {
        if (!cnCustomer) {
          showError('Please select a Customer.');
          return;
        }
        if (!selectedCnConfig) {
          showError('Please select a Credit Note Series.');
          return;
        }

        // Find Customer ID
        const customerId = cnCustomerId || null;
        const customer = richCustomers.find(c => c.id.toString() === cnCustomerId);

        if (!customerId) {
          showError('Please select a valid Customer from the Master list.');
          return;
        }

        try {
          const totals = calculateCreditNoteTotals();

          const creditNoteData: any = {
            date: cnDate,
            credit_note_series: selectedCnConfig,
            credit_note_no: cnVoucherNumber,
            customer_name: cnCustomer,
            customer_id: customerId,
            branch: cnBranch,
            sales_invoice_nos: Array.isArray(cnSelectedSalesInvoices) ? cnSelectedSalesInvoices.join(', ') : cnSelectedSalesInvoices,
            sales_invoice_dates: cnSalesInvoiceDate,
            customer_debit_note_no: cnCustomerDebitNoteNo,
            customer_debit_note_date: cnCustomerDebitNoteDate,
            gstin: cnGstin,
            grn_ref_no: cnGrnRefNo,
            bill_from: [billFromAddress1, billFromAddress2, billFromAddress3, billFromCity, billFromPincode, billFromState, billFromCountry].filter(Boolean).join(', '),
            ship_from: cnSameAsBillFrom
              ? [billFromAddress1, billFromAddress2, billFromAddress3, billFromCity, billFromPincode, billFromState, billFromCountry].filter(Boolean).join(', ')
              : [shipFromAddress1, shipFromAddress2, shipFromAddress3, shipFromCity, shipFromPincode, shipFromState, shipFromCountry].filter(Boolean).join(', '),
            input_type: cnInputType.join(', '),
            in_foreign_currency: cnInForeignCurrency,
            narration: cnPostingNote || '',

            item_details: {
              items: cnItems,
              total_taxable_value: totals.taxableValue,
              total_igst: totals.igst,
              total_cgst: totals.cgst,
              total_sgst: totals.sgst,
              total_cess: totals.cess,
              total_invoice_value: totals.invoiceValue
            },

            due_details: {
              reverse_gst_tcs: cnReverseGstTcs,
              reverse_gst_tds: cnReverseGstTds,
              reverse_income_tax_tcs: cnReverseIncomeTaxTcs,
              reverse_income_tax_tds: cnReverseIncomeTaxTds,
              income_tax_tds_tcs_amount: cnIncomeTaxTdsTcsAmount || 0,
              gst_tds_tcs_amount: cnGstTdsTcsAmount || 0,
              advance_amount: cnAdvanceAmount || 0,
              payable_amount: cnPayableAmount || 0,
              terms_conditions: cnTermsConditions || ''
            },

            transit_details: {
              received_in: cnTransitReceivedIn,
              mode_of_transport: cnTransitMode,
              receipt_date: cnTransitReceiptDate || null,
              receipt_time: cnTransitReceiptTime || null,
              delivery_type: cnTransitDeliveryType,
              transporter_id_gstin: cnTransitTransporterId,
              transporter_name: cnTransitTransporterName,
              vehicle_no: cnTransitVehicleNo,
              lr_gr_consignment_no: cnTransitLrGrConsignment
            }
          };

          let response: any;
          if (isEditing && voucherId) {
            response = await httpClient.put(`/api/vouchers/credit-note/${voucherId}/`, creditNoteData);
            showSuccess('Credit Note Updated Successfully!');
          } else {
            response = await httpClient.post('/api/vouchers/credit-note/', creditNoteData);
            showSuccess('Credit Note Saved Successfully!');
          }

          // Instantly propagate to application cache so reports reveal update immediately
          if (onAddVouchers) {
            onAddVouchers([{
              ...response,
              id: genericVoucherId?.toString() || response?.id?.toString() || Date.now().toString(),
              type: 'Credit Note',
              date: cnDate,
              party: cnCustomer,
              total: Number(totals.invoiceValue),
              narration: cnPostingNote
            }], false);
          }

          // Increment number logic if applicable
          if (selectedCnConfig && cnVoucherConfigs.length > 0) {
            const config = cnVoucherConfigs.find(c => c.voucher_name === selectedCnConfig);
            if (config && config.enable_auto_numbering) {
              await incrementCreditNoteNumber(String(config.id));
            }
          }

          if (shouldPrint) {
            // TODO: Implement Credit Note Print Preview
            // For now, just close
            resetForm();
            if (isEditing) handleCloseVoucher();
          } else {
            resetForm();
            if (isEditing) handleCloseVoucher();
          }
          refetch();

        } catch (error: any) {
          console.error('Error saving Credit Note:', error);
          const serverError = error.response?.data;
          const errorMessage = serverError
            ? (typeof serverError === 'object' ? JSON.stringify(serverError, null, 2) : serverError)
            : error.message;
          showError(`Failed to save Credit Note.\n${errorMessage}`);
        }
        return;
      }

      switch (voucherType) {
        // (Removed Purchase case from switch and handled above)
        case 'Sales':
          voucher = { id: '', type: voucherType, date, isInterState, invoiceNo, party, items, totalTaxableAmount, totalCgst, totalSgst, totalIgst, total, narration };
          break;
        case 'Payment':
        case 'Receipt':
          voucher = { id: '', type: voucherType, date, account, party, amount: simpleAmount, narration };
          break;

        case 'Contra':
          if (!fromAccount || !toAccount || simpleAmount <= 0) {
            showError("Please fill all mandatory fields (Transfer From, Transfer To, Amount > 0)");
            return;
          }
          voucher = {
            id: '',
            type: voucherType,
            date,
            fromAccount,
            toAccount,
            amount: simpleAmount,
            narration,
            voucher_number: voucherNumber || undefined,
            voucher_series: selectedContraConfig || undefined,
            // New Forex fields
            contraConversionRate,
            contraPaymentAmtForeign,
            contraPaymentRate,
            contraPaymentAmtINR,
            contraReceiptAmtForeign,
            contraReceiptRate,
            contraReceiptAmtINR,
            contraForexGainLoss,
            contraDeductChargesFrom,
            contraConversionCharges,
            contraFemaPurposeCode
          } as any;
          break;
        case 'Journal':
          if (isJournalBalanced) {
            voucher = {
              id: '',
              type: voucherType,
              date,
              entries,
              totalDebit,
              totalCredit,
              narration,
              voucher_number: voucherNumber || undefined,
              voucher_series: selectedJournalConfig || undefined
            } as any;
          } else {
            showError("Journal entries are not balanced!");
          }
          break;
        case 'Expenses':
          voucher = {
            id: '',
            type: voucherType,
            date,
            // Expenses use expense_rows instead of account/party/amount
            expense_rows: expenseRows.map(row => ({
              id: row.id,
              expense: row.expense,
              postTo: row.postTo,
              billRefNo: row.billRefNo || '',
              entryNote: row.entryNote || '',
              totalAmount: row.totalAmount,
              gstRate: row.gstRate,
              taxableValue: row.taxableValue,
              igst: row.igst,
              cgst: row.cgst,
              sgst: row.sgst,
              cess: row.cess,
              showTax: row.showTax
            })),
            posting_note: narration,
            voucher_number: voucherNumber || undefined,
            voucher_series: selectedExpensesConfig || undefined,
            uploaded_files: uploadedFiles.map(f => f.name)
          } as any;
          break;
      }

      if (voucher && ['Contra', 'Journal', 'Expenses'].includes(voucherType)) {
        try {
          let response: any;
          // Map voucherType to correct API path
          const typeToPath: Record<string, string> = {
            'Contra': 'contra',
            'Journal': 'journal',
            'Expenses': 'expenses'
          };
          const apiPath = typeToPath[voucherType] || voucherType.toLowerCase();
          // DEBUG: log IDs to identify the correct one
          console.log('[Save Voucher] isEditing:', isEditing, '| voucherId:', voucherId, '| referenceId:', referenceId, '| genericVoucherId:', genericVoucherId, '| drillDownDetails.reference_id:', drillDownDetails?.reference_id, '| viewVoucherData:', viewVoucherData);
          if (isEditing && voucherId) {
            response = await httpClient.put(`/api/vouchers/${apiPath}/${voucherId}/`, voucher);
            showSuccess(`${voucherType} Voucher Updated Successfully!`);
          } else {
            response = await httpClient.post(`/api/vouchers/${apiPath}/`, voucher);
            showSuccess(`${voucherType} Voucher Saved Successfully!`);
          }

          let party = 'N/A';
          if (voucherType === 'Expenses') {
            party = expenseRows.find(e => e.postTo)?.postTo?.split(' - ')[0] || 'N/A';
          } else if (voucherType === 'Journal') {
            party = entries.find(e => e.ledger)?.ledger?.split(' - ')[0] || 'N/A';
          } else if (voucherType === 'Contra') {
            party = toAccount?.split(' - ')[0] || 'N/A';
          }

          const sourceMap: Record<string, string> = {
            'Expenses': 'expense_voucher',
            'Journal': 'journal_voucher',
            'Contra': 'contra_voucher'
          };

          const savedVoucher = {
            ...voucher,
            ...response,
            id: genericVoucherId || response?.id || voucherId || Date.now().toString(),
            type: voucherType,
            party: party,
            source: sourceMap[voucherType] || (voucher as any)?.source,
            total: response?.total_amount || response?.total_debit || response?.amount || (voucher as any)?.amount || 0
          };
          onAddVouchers([savedVoucher], false);

          resetForm();
          refetch(); // Refresh usage statistics

          if (voucherType === 'Contra') fetchContraConfigs();
          if (voucherType === 'Journal') fetchJournalConfigs();
          if (voucherType === 'Expenses') fetchExpensesConfigs();

          if (!shouldPrint && isEditing) {
            handleCloseVoucher();
          }

        } catch (error: any) {
          console.error(`Error saving ${voucherType}:`, error);
          const serverError = error.response?.data;
          const errorMessage = serverError ? (typeof serverError === 'object' ? JSON.stringify(serverError, null, 2) : serverError) : error.message;
          showError(`Failed to save ${voucherType}.\n${errorMessage}`);
        }
      } else if (voucher) {
        onAddVouchers([voucher]);
        showSuccess(`${voucherType} Voucher Saved Successfully!`);
        resetForm();
        refetch(); // Refresh usage statistics
        if (!shouldPrint && isEditing) {
          handleCloseVoucher();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateNarration = async () => {
    setIsNarrationLoading(true);
    let voucherData: any = null;

    switch (voucherType) {
      case 'Purchase':
      case 'Sales':
      case 'Credit Note':
      case 'Debit Note':
        if (voucherType === 'Credit Note') {
          voucherData = { type: voucherType, party: cnCustomer, invoiceNo: cnVoucherNumber, total: calculateCreditNoteTotals().invoiceValue, items: cnItems };
        } else {
          voucherData = { type: voucherType, party, invoiceNo, total, items };
        }
        break;
      case 'Payment':
      case 'Receipt':
        voucherData = { type: voucherType, party, account, amount: simpleAmount };
        break;
      case 'Contra':
        voucherData = { type: voucherType, fromAccount, toAccount, amount: simpleAmount };
        break;
      case 'Journal':
        voucherData = { type: voucherType, entries, totalDebit };
        break;
      case 'Expenses':
        voucherData = { type: voucherType, party, account, amount: simpleAmount };
        break;
    }

    if (voucherData) {
      try {
        const result = await apiService.generateNarration(voucherData);
        setNarration(result);
      } catch (error) {
        console.error('Failed to generate narration:');
        setNarration('Error generating narration. Please try again.');
      }
    }
    setIsNarrationLoading(false);
  };


  // Purchase Item Handlers
  const handlePurchaseItemChange = (index: number, field: string, value: string | number) => {
    const newItems = [...purchaseItems];
    const item = { ...newItems[index] };

    // Update field
    if (['qty', 'rate', 'foreignRate', 'igst', 'cgst', 'sgst', 'cess'].includes(field)) {
      (item as any)[field] = Math.max(0, typeof value === 'string' ? parseFloat(value) || 0 : value);
    } else {
      (item as any)[field] = value;
    }

    // Default qty to 1 if HSN/SAC starts with 99 (Services)
    if (field === 'hsnSac' && value?.toString().startsWith('99')) {
      item.qty = 1;
    }

    // ── ITEM RATE VALIDATION ──────────────────────────────────────────────
    if (field === 'rate') {
      const enteredRate = typeof value === 'string' ? parseFloat(value) || 0 : (value as number);

      // Case 1: PO is selected → cross-check against PO rate
      if (selectedPurchasePOs.length > 0 && (item as any).poRate !== null && (item as any).poRate !== undefined) {
        const poRate = Number((item as any).poRate);
        if (poRate > 0 && Math.abs(enteredRate - poRate) > 0.001) {
          (item as any).rateMismatch = true;
        } else {
          (item as any).rateMismatch = false;
        }
      }
      // Case 2: No PO but invoice was scanned → compare against invoice rate (info only)
      else if (selectedPurchasePOs.length === 0 && (item as any).invoiceRate !== null && (item as any).invoiceRate !== undefined) {
        const invRate = Number((item as any).invoiceRate);
        if (invRate > 0 && Math.abs(enteredRate - invRate) > 0.001) {
          (item as any).rateMismatch = true;
        } else {
          (item as any).rateMismatch = false;
        }
      } else {
        (item as any).rateMismatch = false;
      }
    }

    // ── ITEM QTY VALIDATION ──────────────────────────────────────────────
    if (field === 'qty') {
      const enteredQty = typeof value === 'string' ? parseFloat(value) || 0 : (value as number);

      // Case 1: PO is selected → cross-check against PO quantity
      if (selectedPurchasePOs.length > 0 && (item as any).poQty !== null && (item as any).poQty !== undefined) {
        const poQty = Number((item as any).poQty);
        if (poQty > 0 && Math.abs(enteredQty - poQty) > 0.001) {
          (item as any).qtyMismatch = true;
        } else {
          (item as any).qtyMismatch = false;
        }
      }
      // Case 2: No PO but invoice was scanned → compare against invoice quantity
      else if (selectedPurchasePOs.length === 0 && (item as any).invoiceQty !== null && (item as any).invoiceQty !== undefined) {
        const invQty = Number((item as any).invoiceQty);
        if (invQty > 0 && Math.abs(enteredQty - invQty) > 0.001) {
          (item as any).qtyMismatch = true;
        } else {
          (item as any).qtyMismatch = false;
        }
      } else {
        (item as any).qtyMismatch = false;
      }
    }

    // Auto-populate based on Item Code, Name or HSN/SAC
    if (field === 'itemCode' || field === 'itemName' || field === 'hsnSac') {
      // Reset qty whenever item selection changes
      item.qty = 0;

      let selectedItem: any;
      if (field === 'itemCode') {
        selectedItem = allItems.find((i: any) => (i.item_code || i.code) === value);
      } else if (field === 'itemName') {
        selectedItem = allItems.find((i: any) => (i.name || i.item_name) === value);
      } else if (field === 'hsnSac') {
        selectedItem = allItems.find((i: any) => (i.hsn_sac || i.hsn || i.hsn_code || i.hsn_sac_code) === value?.toString());
      }

      if (selectedItem) {
        item.itemCode = selectedItem.item_code || selectedItem.code || item.itemCode;
        item.itemName = selectedItem.name || selectedItem.item_name || item.itemName;
        item.uom = selectedItem.unit || selectedItem.uom || item.uom;
        item.hsnSac = selectedItem.hsn_sac || selectedItem.hsn || selectedItem.hsn_code || selectedItem.hsn_sac_code || item.hsnSac;

        // Default qty to 1 if HSN/SAC starts with 99 (Services)
        if (item.hsnSac?.toString().startsWith('99')) {
          item.qty = 1;
        }

        // ── RATE FETCHING LOGIC ──────────────────────────────────────────────
        let fetchedRate: number | null = null;
        let isFromPO = false;
        let isFromInvoice = false;

        // 1. Check if item matches any selected PO items
        let poMatch: any = null;
        if (selectedPurchasePOs.length > 0) {
          poMatch = currentPOItems.find((pi: any) =>
            (pi.item_code || '').toLowerCase() === (item.itemCode || '').toLowerCase() ||
            (pi.item_name || '').toLowerCase() === (item.itemName || '').toLowerCase()
          );
          if (poMatch) {
            fetchedRate = parseFloat(poMatch.final_rate) || parseFloat(poMatch.negotiated_rate) || 0;
            isFromPO = true;
            item.sourcePoNo = poMatch._poNumber || null;
          }
        }

        // 2. If no PO match, check scanned invoice items
        let invMatch: any = null;
        if (fetchedRate === null && selectedPurchasePOs.length === 0 && localPrefilledData?.lineItems) {
          invMatch = localPrefilledData.lineItems.find((li: any) =>
            (li.itemDescription || '').toLowerCase() === (item.itemName || '').toLowerCase() ||
            (li.hsnSac || '').toLowerCase() === (item.hsnSac || '').toLowerCase()
          );
          if (invMatch) {
            fetchedRate = parseFloat(invMatch.rate as any) || 0;
            isFromInvoice = true;
          }
        }

        // 3. Fallback to master data rate
        if (fetchedRate === null) {
          fetchedRate = Number(selectedItem.rate || selectedItem.selling_price || 0);
        }

        if (fetchedRate !== null) {
          const exRateNum = parseFloat(exchangeRate) || 1;

          if (isFromPO) {
            // PO rate is considered foreign rate
            item.foreignRate = fetchedRate;
            item.rate = fetchedRate * exRateNum;
            item.poRate = item.rate; // store INR equivalent for mismatch check
            (item as any).poQty = parseFloat((poMatch as any).quantity) || 0;
            (item as any).qtyMismatch = Math.abs((item.qty || 0) - (item as any).poQty) > 0.001;
          } else {
            // Master rate or Invoice rate is considered INR rate
            item.rate = fetchedRate;
            item.foreignRate = exRateNum > 0 ? fetchedRate / exRateNum : 0;
          }

          if (isFromInvoice) {
            item.invoiceRate = fetchedRate;
            (item as any).invoiceQty = parseFloat((invMatch as any).quantity || (invMatch as any).qty) || 0;
            (item as any).qtyMismatch = Math.abs((item.qty || 0) - (item as any).invoiceQty) > 0.001;
          }

          item.foreignAmount = (parseFloat(item.qty.toString()) || 0) * (item.foreignRate || 0);
          item.taxableValue = (parseFloat(item.qty.toString()) || 0) * item.rate;
        }
      }
    }

    // Auto-calculate Taxable Value (Qty * Rate) and Taxes (INR)
    if (field === 'qty' || field === 'rate' || field === 'foreignRate' || field === 'itemCode' || field === 'itemName' || field === 'hsnSac') {
      const exRate = parseFloat(exchangeRate) || 1;

      // Sync rates if one changes
      if (field === 'foreignRate') {
        const fRate = parseFloat(item.foreignRate?.toString() || '0') || 0;
        item.rate = fRate * exRate;
      } else if (field === 'rate') {
        const iRate = parseFloat(item.rate?.toString() || '0') || 0;
        item.foreignRate = iRate / exRate;
      }

      const qty = parseFloat(item.qty.toString()) || 0;
      const rate = parseFloat(item.rate.toString()) || 0;
      const fRate = parseFloat(item.foreignRate?.toString() || '0') || 0;

      item.taxableValue = qty * rate;
      item.foreignAmount = qty * fRate;

      // Fetch GST Rate from combined items (Master > Inventory Item)
      const selectedStockItem = allItems.find((si: any) =>
        ((si.item_code || si.code) || '').toLowerCase() === (item.itemCode || '').toLowerCase() ||
        ((si.name || si.item_name) || '').toLowerCase() === (item.itemName || '').toLowerCase() ||
        ((si.hsn_sac || si.hsn) || '').toString().trim() === (item.hsnSac || '').toString().trim()
      );
      const gstRate = selectedStockItem?.gstRate || selectedStockItem?.gst_rate || 0;
      const cessRate = selectedStockItem?.cessRate || selectedStockItem?.cess_rate || 0;
      const totalTax = item.taxableValue * (gstRate / 100);
      item.cess = totalTax * (cessRate / 100);

      if (isInterState) {
        item.igst = totalTax;
        item.cgst = 0;
        item.sgst = 0;
      } else {
        item.igst = 0;
        item.cgst = totalTax / 2;
        item.sgst = totalTax / 2;
      }
    }


    // Auto-calculate Invoice Value (Taxable + Taxes)
    const taxable = parseFloat(item.taxableValue.toString()) || 0;
    const igst = parseFloat(item.igst.toString()) || 0;
    const cgst = parseFloat(item.cgst.toString()) || 0;
    const sgst = parseFloat(item.sgst?.toString() || '0') || 0;
    const cess = parseFloat(item.cess.toString()) || 0;

    item.invoiceValue = taxable + igst + cgst + sgst + cess;

    newItems[index] = item;
    setPurchaseItems(newItems);
  };

  const handlePurchaseAdvanceRefChange = (index: number, field: string, value: string) => {
    const newRefs = [...purchaseAdvanceRefs];
    const ref = { ...newRefs[index] };

    let finalValue = value;
    if (field === 'appliedNow' || field === 'allocatedNow') {
      const available = parseFloat(ref.amount) || 0;
      const current = parseFloat(value) || 0;

      // Cap at available amount
      if (current > available) {
        finalValue = ref.amount;
      }

      // Update both to keep them synced for totals and API
      ref.appliedNow = finalValue;
      (ref as any).allocatedNow = finalValue;
    } else {
      (ref as any)[field] = finalValue;
    }

    newRefs[index] = ref;
    setPurchaseAdvanceRefs(newRefs);
  };

  // Auto-calculate Advance Paid from Advance References
  useEffect(() => {
    const totalAppliedNow = purchaseAdvanceRefs.reduce((sum, ref) => {
      const val = parseFloat((ref as any).allocatedNow || ref.appliedNow) || 0;
      return sum + val;
    }, 0);
    setPurchaseAdvancePaid(totalAppliedNow.toFixed(2));
  }, [purchaseAdvanceRefs]);

  const handleAddPurchaseItem = () => {
    setPurchaseItems([...purchaseItems, {
      id: (Date.now()).toString(),
      itemCode: '',
      itemName: '',
      hsnSac: '',
      qty: 0,
      uom: '',
      rate: 0,
      taxableValue: 0,
      foreignRate: 0,
      foreignAmount: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      invoiceValue: 0,
      description: '',
      poRate: null as number | null,
      invoiceRate: null as number | null,
      rateMismatch: false,
      poQty: null as number | null,
      invoiceQty: null as number | null,
      qtyMismatch: false,
      grnQty: null as number | null,
      sourcePoNo: null as string | null
    }]);
  };

  const handleTogglePurchaseItemSelection = (id: string) => {
    setSelectedPurchaseItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleDeleteSelectedItems = () => {
    if (selectedPurchaseItems.length === 0) return;

    // Filter out selected items
    const remainingItems = purchaseItems.filter(item => !selectedPurchaseItems.includes(item.id));

    // Always keep at least one row
    if (remainingItems.length === 0) {
      setPurchaseItems([{
        id: (Date.now()).toString(),
        itemCode: '',
        itemName: '',
        hsnSac: '',
        qty: 1,
        uom: '',
        rate: 0,
        taxableValue: 0,
        foreignRate: 0,
        foreignAmount: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
        invoiceValue: 0,
        description: '',
        poRate: null,
        invoiceRate: null,
        rateMismatch: false,
        poQty: null,
        invoiceQty: null,
        qtyMismatch: false,
        grnQty: null,
        sourcePoNo: null
      }]);
    } else {
      setPurchaseItems(remainingItems);
    }
    setSelectedPurchaseItems([]); // Clear selection
  };

  const handleRemovePurchaseItem = (index: number) => {
    if (purchaseItems.length > 1) {
      setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
    }
  };

  // Handle receipt value change for bulk mode
  const handleBulkRowChange = (index: number, field: keyof ReceiptTransaction, value: string | number) => {
    const newTransactions = [...receiptTransactions];
    const transaction = { ...newTransactions[index] };

    if (field === 'receipt') {
      transaction.receipt = Math.max(0, Math.min(Number(transaction.amount), Number(value)));
    } else {
      (transaction as any)[field] = value;
    }
    newTransactions[index] = transaction;
    setReceiptTransactions(newTransactions);
  };

  // Handle "Receive" button click - copies amount to receipt field
  const handleReceiveClick = (transactionId: string) => {
    setReceiptTransactions(prev =>
      prev.map(t =>
        t.id === transactionId ? { ...t, receipt: t.amount } : t
      )
    );
  };

  // Handle receipt value change
  const handleReceiptChange = (transactionId: string, value: number) => {
    setReceiptTransactions(prev =>
      prev.map(t =>
        t.id === transactionId ? { ...t, receipt: value } : t
      )
    );
  };

  // Reset receipt form
  const handleCancelReceipt = () => {
    setReceiptTransactions(prev => prev.map(t => ({ ...t, receipt: 0 })));
    setAccount('');
    setParty('');
    setAdvanceRefNo('');
    setAdvanceAmount(0);
    setShowAdvance(false);
  };

  // Post receipt voucher
  const handlePostReceipt = () => {
    if (!account || !party) {
      showError('Please select Receive In and Receive From accounts');

      return;
    }
    if (totalReceipt <= 0 && !showAdvance) {
      showError('Please enter receipt amounts');

      return;
    }
    if (showAdvance && advanceAmount <= 0) {
      showError('Please enter advance amount');

      return;
    }

    // Create receipt voucher
    const voucher: PaymentReceiptVoucher = {
      id: '',
      type: 'Receipt',
      date,
      account,
      party,
      amount: showAdvance ? advanceAmount : totalReceipt,
      narration: showAdvance ? `Advance Receipt: ${advanceRefNo}` : `Receipt against invoices. Total: ${totalReceipt}`
    };

    onAddVouchers([voucher]);
    handleCancelReceipt();
  };

  // New Purchase Voucher Form with Tabs

  // ── Drill-Down: fetch full voucher details when navigating from Reports ──
  useEffect(() => {
    if (!viewVoucherData) {
      setIsReadOnlyMode(false);
      isExistingVoucherRef.current = false; // Reset: no existing voucher loaded
      setDrillDownDetails(null);
      setIsViewingAmended(false);
      return;
    }

    const rawVoucher = viewVoucherData.rawVoucher || viewVoucherData;
    const vType = (viewVoucherData.voucherType || viewVoucherData.type || rawVoucher.voucher_type || '').toLowerCase();

    const typeMap: Record<string, string> = {
      purchase: 'Purchase', sales: 'Sales', payment: 'Payment',
      receipt: 'Receipt', contra: 'Contra', journal: 'Journal',
      expenses: 'Expenses', expense: 'Expenses',
      'credit note': 'Credit Note', 'debit note': 'Debit Note',
      credit_note: 'Credit Note', debit_note: 'Debit Note',
      credit_note_voucher: 'Credit Note', debit_note_voucher: 'Debit Note',
    };
    const mappedType = typeMap[vType] || (vType ? vType.charAt(0).toUpperCase() + vType.slice(1) : 'Purchase');
    setVoucherType(mappedType);
    setIsReadOnlyMode(true);
    isExistingVoucherRef.current = true; // Mark: an existing voucher is being viewed/edited
    setDrillDownDetails(null);

    const source = viewVoucherData.source || rawVoucher.source || mappedType.toLowerCase();

    // For type-specific models (Expenses, Contra, Journal), prefer reference_id (specific model PK)
    // over the generic voucher_id UUID — reference_id is now enriched by the backend report endpoint.
    const referenceIdFromReport = viewVoucherData.reference_id || rawVoucher.reference_id;
    const genericVoucherPk = viewVoucherData.voucher_pk || rawVoucher.voucher_pk;

    let voucherId: any;
    if (referenceIdFromReport && ['Expenses', 'Contra', 'Journal', 'Credit Note', 'Debit Note'].includes(mappedType)) {
      // Use the specific model ID directly — avoids the wrong-ID 404
      voucherId = referenceIdFromReport;
    } else {
      voucherId = viewVoucherData.sourceId || viewVoucherData.source_id
        || rawVoucher.sourceId || rawVoucher.source_id
        || genericVoucherPk
        || rawVoucher.voucher_id || rawVoucher.voucherId || rawVoucher.id
        || viewVoucherData.voucher_id || viewVoucherData.voucherId || viewVoucherData.id;
    }

    if (!voucherId) {
      // Fallback: use raw data directly
      setDrillDownDetails({ ...rawVoucher, _mappedType: mappedType, _rawEntry: viewVoucherData });
      return;
    }

    setDrillDownLoading(true);
    apiService.getVoucher(voucherId, {}, source).then(apiDetails => {
      if (apiDetails) {
        const hasSnapshot = !!apiDetails.original_voucher_snapshot;
        const fromGST = viewVoucherData?._viewAsGSTFiled === true;

        if (!fromGST && hasSnapshot && !isViewingAmended) {
            setIsViewingAmended(true);
            return;
        }

        let displayData = apiDetails;
        if (hasSnapshot) {
            if (isViewingAmended) {
                displayData = apiDetails;
            } else {
                displayData = apiDetails.original_voucher_snapshot;
            }
            setAmendedVoucherDetails(apiDetails);
        } else {
            displayData = fromGST ? { ...apiDetails, amendment_date: null } : apiDetails;
            setAmendedVoucherDetails(null);
        }

        setDrillDownDetails({ ...displayData, _mappedType: mappedType, _rawEntry: viewVoucherData });

        // Shadow details so the entire hydration block below reads from displayData (which may be the snapshot)
        const details = displayData;
        // Also hydrate form fields for when user clicks Edit
        setDate(details.date ? new Date(details.date).toISOString().split('T')[0] : getTodayDate());
        setNarration(details.narration || '');
        const vendorName = details.party || details.vendor_name || '';
        if (vendorName) setParty(vendorName);
        if (mappedType === 'Purchase') {
          setInvoiceNo(details.supplier_invoice_no || details.voucher_number || details.voucher_no || '');
          setSupplierInvoiceDate(details.supplier_invoice_date || details.date || '');
          if (details.gstin) setGstin(details.gstin);
          if (details.branch) setSelectedBranch(details.branch);
          if (details.voucher_number || details.voucher_no) setVoucherNumber(details.voucher_number || details.voucher_no);
          if (details.purchase_voucher_series) setSelectedPurchaseConfig(details.purchase_voucher_series);
          if (details.grn_reference) setGrnRefNo(details.grn_reference);
          if (details.invoice_in_foreign_currency) setInvoiceInForeignCurrency(details.invoice_in_foreign_currency);
          if (details.bill_from) setBillFromAddress1(details.bill_from);
          if (details.ship_from) setShipFromAddress1(details.ship_from);

          // ── Pre-fill input_type ────────────────────────────────────────────
          if (details.input_type) {
            const rawInputType = details.input_type;
            const parsedInputTypes = typeof rawInputType === 'string'
              ? rawInputType.split(',').map((s: string) => s.trim()).filter(Boolean)
              : (Array.isArray(rawInputType) ? rawInputType : []);
            if (parsedInputTypes.length > 0) setPurchaseInputTypes(parsedInputTypes);
          }

          const supplyInr = details.supply_inr_details;
          const items = details.line_items || supplyInr?.items || details.items || [];
          if (supplyInr?.purchase_ledger) setPurchaseLedger(supplyInr.purchase_ledger);
          if (supplyInr?.description) setPurchaseDescription(supplyInr.description);
          // ── Pre-fill Purchase Order No from supply_inr_details ────────────
          if (supplyInr?.purchase_order_no) setPurchaseOrderNo(supplyInr.purchase_order_no);

          // ── Pre-fill Due Details (critical — prevents overwrite with defaults) ──
          const dueDetails = details.due_details;
          if (dueDetails) {
            if (dueDetails.tds_it !== undefined && dueDetails.tds_it !== null)
              setPurchaseTdsIt(String(parseFloat(dueDetails.tds_it || 0).toFixed(2)));
            if (dueDetails.advance_paid !== undefined && dueDetails.advance_paid !== null)
              setPurchaseAdvancePaid(String(parseFloat(dueDetails.advance_paid || 0).toFixed(2)));
            if (dueDetails.posting_note) setPurchasePostingNote(dueDetails.posting_note);
            if (dueDetails.terms) setPurchaseTerms(dueDetails.terms);
            if (Array.isArray(dueDetails.advance_links) && dueDetails.advance_links.length > 0) {
              setPurchaseAdvanceRefs(dueDetails.advance_links.map((link: any) => ({
                refNo: link.ref_no || '',
                date: link.date || '',
                amount: parseFloat(link.amount || 0),
                appliedNow: parseFloat(link.applied_now || 0)
              })));
            } else if (Array.isArray(dueDetails.advance_references) && dueDetails.advance_references.length > 0) {
              setPurchaseAdvanceRefs(dueDetails.advance_references);
            }
          }

          // ── Pre-fill Vendor ID so save doesn't fail validation ─────────────
          const vendorNameForMatch = (details.vendor_name || details.party || party || '').toLowerCase();
          if (vendorNameForMatch && richVendors && richVendors.length > 0) {
            const matchedVendor = richVendors.find((v: any) =>
              (v.vendor_name || '').toLowerCase() === vendorNameForMatch
            );
            if (matchedVendor) {
              setVendorId(matchedVendor.id);
            }
          }

          if (Array.isArray(items) && items.length > 0) {
            setPurchaseItems(items.map((item: any, idx: number) => ({
              id: String(idx + 1),
              itemCode: item.item_code || item.itemCode || '',
              itemName: item.item_name || item.itemName || '',
              hsnSac: item.hsn_sac || item.hsnSac || '',
              qty: parseFloat(item.quantity || item.qty || '0'),
              uom: item.uom || '',
              rate: parseFloat(item.rate || item.itemRate || '0'),
              taxableValue: parseFloat(item.taxable_value || item.taxableValue || '0'),
              foreignRate: parseFloat(item.foreign_rate || item.foreignRate || '0'),
              foreignAmount: parseFloat(item.foreign_amount || item.foreignAmount || '0'),
              igst: parseFloat(item.igst_amount || item.igst || '0'),
              cgst: parseFloat(item.cgst_amount || item.cgst || '0'),
              sgst: parseFloat(item.sgst_amount || item.sgst || '0'),
              cess: parseFloat(item.cess_amount || item.cess || '0'),
              invoiceValue: parseFloat(item.invoice_value || item.invoiceValue || '0'),
              gstRate: item.gst_rate || item.gstRate || '0',
              description: item.description || '',
              poRate: item.poRate || null,
              invoiceRate: item.invoiceRate || null,
              rateMismatch: false,
              poQty: item.poQty || null,
              invoiceQty: item.invoiceQty || null,
              qtyMismatch: false,
              grnQty: item.grnQty || null,
              sourcePoNo: item.sourcePoNo || null
            })));
          }
          setPurchaseActiveTab('supplier');
        } else if (mappedType === 'Sales') {
          setLocalPrefilledData({
            voucherId: details.reference_id || details.id || voucherId,
            invoiceNumber: details.sales_invoice_no || details.voucher_number || details.voucher_no || '',
            // ── Sales Series ─────────────────────────────────────────────
            voucher_name: details.voucher_name || details.voucher_series || details.sales_series || details.sales_voucher_series || '',
            branch: details.branch || '',
            gstin: details.gstin || '',
            gst_registered: details.gst_registered,
            invoiceDate: details.date ? new Date(details.date).toISOString().split('T')[0] : getTodayDate(),
            sellerName: details.party || details.customer_name || '',
            placeOfSupply: details.place_of_supply || details.placeOfSupply || '',
            invoiceType: details.invoice_type || details.invoiceType || 'Regular',
            stateType: details.state_type || details.stateType || 'within',
            totalAmount: details.payment_details?.payment_invoice_value || details.total_amount || details.total || 0,
            subtotal: details.payment_details?.payment_taxable_value || details.total_taxable_amount || 0,
            cgstAmount: details.payment_details?.payment_cgst || details.total_cgst || 0,
            sgstAmount: details.payment_details?.payment_sgst || details.total_sgst || 0,
            igstAmount: details.payment_details?.payment_igst || details.total_igst || 0,
            cessAmount: details.payment_details?.payment_cess || details.total_cess || 0,

            // ── Addresses ──
            ...(() => {
              const parseAddress = (addr1: any, addr2: any) => {
                const str = addr1 || addr2;
                if (typeof str === 'string' && str.trim().startsWith('{')) {
                  try { return JSON.parse(str); } catch { return null; }
                }
                return typeof str === 'object' ? str : null;
              };
              const pBill = parseAddress(details.bill_to_address, details.bill_to);
              const pShip = parseAddress(details.ship_to_address, details.ship_to);

              const rawBill = details.bill_to_address_1 || details.bill_to_address || details.bill_to || '';
              const rawShip = details.ship_to_address_1 || details.ship_to_address || details.ship_to || '';

              return {
                billToAddress1: pBill?.address_line_1 || (typeof rawBill === 'string' && !pBill && !rawBill.trim().startsWith('{') ? rawBill : ''),
                billToAddress2: pBill?.address_line_2 || details.bill_to_address_2 || '',
                billToAddress3: pBill?.address_line_3 || details.bill_to_address_3 || '',
                billToCity: pBill?.city || details.bill_to_city || '',
                billToState: pBill?.state || details.bill_to_state || '',
                billToPincode: pBill?.pincode || details.bill_to_pincode || '',
                billToCountry: pBill?.country || details.bill_to_country || '',

                shipToAddress1: pShip?.address_line_1 || (typeof rawShip === 'string' && !pShip && !rawShip.trim().startsWith('{') ? rawShip : ''),
                shipToAddress2: pShip?.address_line_2 || details.ship_to_address_2 || '',
                shipToAddress3: pShip?.address_line_3 || details.ship_to_address_3 || '',
                shipToCity: pShip?.city || details.ship_to_city || '',
                shipToState: pShip?.state || details.ship_to_state || '',
                shipToPincode: pShip?.pincode || details.ship_to_pincode || '',
                shipToCountry: pShip?.country || details.ship_to_country || ''
              };
            })(),

            // ── Extracted payment details ──
            stateCess: details.payment_details?.payment_state_cess || '0',
            tdsIncomeTax: details.payment_details?.payment_tds_income_tax || '0',
            tdsGst: details.payment_details?.payment_tds_gst || '0',
            advanceAmount: details.payment_details?.payment_advance || '0',
            payable: details.payment_details?.payment_payable || '0',
            postingNote: details.payment_details?.posting_note || '',
            _rawEntry: viewVoucherData,

            // ── Extracted dispatch details ──
            dispatchFrom: details.dispatch_details?.dispatch_from || '',
            modeOfTransport: details.dispatch_details?.mode_of_transport || '',
            dispatchDate: details.dispatch_details?.dispatch_date || '',
            dispatchTime: details.dispatch_details?.dispatch_time || '',
            transporterId: details.dispatch_details?.transporter_id || '',
            transporterName: details.dispatch_details?.transporter_name || '',
            vehicleNo: details.dispatch_details?.vehicle_no || '',
            lrGrConsignment: details.dispatch_details?.lr_gr_consignment || '',

            lineItems: (details.items || []).map((item: any) => ({
              itemDescription: item.item_name || item.itemName || item.description || '',
              itemCode: item.item_code || item.itemCode || '',
              hsnCode: item.hsn_sac || item.hsnSac || '',
              quantity: parseFloat(item.qty || item.quantity || '0') || 0,
              rate: parseFloat(item.item_rate || item.itemRate || item.rate || '0') || 0,
              amount: parseFloat(item.invoice_value || item.invoiceValue || '0') || 0,
              taxableValue: parseFloat(item.taxable_value || item.taxableValue || '0') || 0,
              cgst: parseFloat(item.cgst || item.cgst_amount || '0') || 0,
              sgst: parseFloat(item.sgst || item.sgst_amount || '0') || 0,
              igst: parseFloat(item.igst || item.igst_amount || '0') || 0,
              cess: parseFloat(item.cess || item.cess_amount || '0') || 0,
              uom: item.uom || '',
              // Per-row sales ledger so the Sales Ledger column populates
              salesLedger: item.salesLedger || item.sales_ledger || '',
            })),
          } as any);
        }
        else if (mappedType === 'Payment' || mappedType === 'Receipt') {
          // For Receipt: sellerName = Receive From (Customer), account = Receive In (Bank)
          // For Payment: sellerName = Paid To (Vendor), account = Paid From (Bank)
          const isReceipt = mappedType === 'Receipt';

          setLocalPrefilledData({
            voucherId: voucherId,
            invoiceNumber: details.voucher_number || details.voucher_no || '',
            invoiceDate: details.date ? new Date(details.date).toISOString().split('T')[0] : getTodayDate(),
            sellerName: isReceipt
              ? (details.party || details.customer_name || details.items?.[0]?.customer_name || '')
              : (details.party || details.vendor_name || details.items?.[0]?.vendor_name || ''),
            account: isReceipt
              ? (details.receive_in || details.account || details.pay_to_name || '')
              : (details.paid_from || details.account || details.pay_from_name || ''),
            totalAmount: parseFloat(details.total_amount || details.amount || 0),
            narration: details.narration || '',
            reference_number: details.ref_no || '',
            voucher_type: details.voucher_type || details.type || '',
            items: details.items || details.item_details?.line_items || details.item_details?.items || [],
          } as any);
        }
        else if (mappedType === 'Contra') {
          setFromAccount(details.fromAccount || details.from_account || '');
          setToAccount(details.toAccount || details.to_account || '');
          setSimpleAmount(parseFloat(String(details.amount || details.total_amount || 0)));
          setVoucherNumber(details.voucher_number || details.voucher_no || '');
          setSelectedContraConfig(details.voucher_series || details.contra_series || '');
          setNarration(details.narration || '');

          // Forex / charges fields — all are number|'' state type, must parse
          const parseNum = (v: any): number | '' => { const n = parseFloat(String(v ?? '')); return isNaN(n) ? '' : n; };
          setContraConversionRate(parseNum(details.contraConversionRate ?? details.conversion_rate));
          setContraPaymentAmtForeign(parseNum(details.contraPaymentAmtForeign ?? details.payment_amt_foreign));
          setContraPaymentRate(parseFloat(String(details.contraPaymentRate || details.payment_rate || 0)));
          setContraPaymentAmtINR(parseNum(details.contraPaymentAmtINR ?? details.payment_amt_inr));
          setContraReceiptAmtForeign(parseNum(details.contraReceiptAmtForeign ?? details.receipt_amt_foreign));
          setContraReceiptRate(parseFloat(String(details.contraReceiptRate || details.receipt_rate || 0)));
          setContraReceiptAmtINR(parseNum(details.contraReceiptAmtINR ?? details.receipt_amt_inr));
          setContraForexGainLoss(parseFloat(String(details.contraForexGainLoss || details.forex_gain_loss || 0)));
          setContraDeductChargesFrom(details.contraDeductChargesFrom || details.deduct_charges_from || '');
          setContraConversionCharges(parseNum(details.contraConversionCharges ?? details.conversion_charges));
          setContraFemaPurposeCode(details.contraFemaPurposeCode || details.fema_purpose_code || '');
        }
        else if (mappedType === 'Journal') {
          if (details.voucher_number || details.voucher_no) setVoucherNumber(details.voucher_number || details.voucher_no);
          if (details.voucher_series || details.journal_series) setSelectedJournalConfig(details.voucher_series || details.journal_series);
          if (details.entries || details.journal_entries || details.entry_lines) {
            const rawEntries = details.entries || details.journal_entries || details.entry_lines;
            if (Array.isArray(rawEntries) && rawEntries.length > 0) {
              setEntries(rawEntries.map((e: any) => ({
                ledger: e.ledger || e.ledger_name || e.account || '',
                note: e.note || e.entry_note || e.narration || '',
                refNo: e.refNo || e.reference_no || e.ref_no || '',
                debit: parseFloat(e.debit || e.debit_amount || '0'),
                credit: parseFloat(e.credit || e.credit_amount || '0')
              })));
            }
          }
        }
        else if (mappedType === 'Expenses') {
          if (details.voucher_number || details.voucher_no) setVoucherNumber(details.voucher_number || details.voucher_no);
          if (details.voucher_series || details.expenses_series) setSelectedExpensesConfig(details.voucher_series || details.expenses_series);
          if (details.posting_note || details.narration) setNarration(details.posting_note || details.narration || '');
          // Backend returns 'line_items' (ExpenseLineItemSerializer) with snake_case fields
          const rawRows = details.line_items || details.expense_rows || details.expenses;
          if (Array.isArray(rawRows) && rawRows.length > 0) {
            setExpenseRows(rawRows.map((r: any, idx: number) => ({
              id: r.id ? String(r.id) : String(idx + 1),
              expense: r.expense_ledger_name || r.expense || r.account || '',
              postTo: r.post_to_ledger_name || r.postTo || r.post_to || '',
              billRefNo: r.bill_ref_no || r.billRefNo || '',
              entryNote: r.entry_note || r.entryNote || '',
              totalAmount: parseFloat(r.total_amount || r.totalAmount || r.amount || '0'),
              gstRate: parseFloat(r.gst_rate || r.gstRate || '0'),
              taxableValue: parseFloat(r.taxable_value || r.taxableValue || '0'),
              igst: parseFloat(r.igst || '0'),
              cgst: parseFloat(r.cgst || '0'),
              sgst: parseFloat(r.sgst || '0'),
              cess: parseFloat(r.cess || '0'),
              showTax: r.show_tax || r.showTax || false
            })));
          }
        }
        else if (mappedType === 'Credit Note') {
          if (details.credit_note_no || details.voucher_number || details.voucher_no) setCnVoucherNumber(details.credit_note_no || details.voucher_number || details.voucher_no);
          if (details.credit_note_series || details.voucher_series) setSelectedCnConfig(details.credit_note_series || details.voucher_series);
          if (details.customer_name || details.party) {
            const cname = details.customer_name || details.party;
            setCnCustomer(cname);
            const cst = richCustomers.find(c => c.customer_name === cname);
            if (cst) setCnCustomerId(cst.id.toString());
          }
          if (details.branch) setCnBranch(details.branch);
          // Date
          if (details.date) setCnDate(new Date(details.date).toISOString().split('T')[0]);
          if (details.sales_invoice_nos) {
            const nos = typeof details.sales_invoice_nos === 'string' ? details.sales_invoice_nos.split(',').map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(details.sales_invoice_nos) ? details.sales_invoice_nos : []);
            if (Array.isArray(nos)) setCnSelectedSalesInvoices(nos);
          }
          if (details.sales_invoice_dates) setCnSalesInvoiceDate(details.sales_invoice_dates);
          if (details.customer_debit_note_no) setCnCustomerDebitNoteNo(details.customer_debit_note_no);
          if (details.customer_debit_note_date) setCnCustomerDebitNoteDate(details.customer_debit_note_date);
          if (details.gstin) setCnGstin(details.gstin);
          if (details.grn_ref_no) setCnGrnRefNo(details.grn_ref_no);
          if (details.bill_from) {
            setCnBillFrom(details.bill_from);
            setAddressFields(details.bill_from);
          }
          if (details.ship_from) {
            setCnShipFrom(details.ship_from);
            if (details.ship_from === details.bill_from) {
              setCnSameAsBillFrom(true);
            } else {
              setCnSameAsBillFrom(false);
              const parts = typeof details.ship_from === 'string' ? details.ship_from.split(',').map((p: string) => p.trim()) : [];
              setShipFromAddress1(parts[0] || '');
              setShipFromAddress2(parts[1] || '');
              setShipFromAddress3(parts[2] || '');
              setShipFromCity(parts[3] || '');
              setShipFromPincode(parts[4] || '');
              setShipFromState(parts[5] || '');
              setShipFromCountry(parts[6] || 'India');
            }
          }
          if (details.input_type) {
            const inputTypeVal = typeof details.input_type === 'string'
              ? details.input_type.split(',').map((s: string) => s.trim()).filter(Boolean)
              : (Array.isArray(details.input_type) ? details.input_type : []);
            setCnInputType(inputTypeVal);
          }
          if (details.in_foreign_currency) setCnInForeignCurrency(details.in_foreign_currency);
          if (details.narration || details.posting_note) setCnPostingNote(details.narration || details.posting_note);

          // item_details.line_items is the readable DB field (items is write_only)
          const lineItems = details.item_details?.line_items || details.item_details?.items || [];
          if (Array.isArray(lineItems) && lineItems.length > 0) {
            setCnItems(lineItems.map((item: any, idx: number) => ({
              id: item.id ? String(item.id) : String(idx + 1),
              itemCode: item.item_code || item.itemCode || '',
              itemName: item.item_name || item.itemName || '',
              hsnSac: item.hsn_sac || item.hsnSac || '',
              qty: parseFloat(String(item.quantity || item.qty || '0')),
              uom: item.uom || '',
              rate: parseFloat(String(item.rate || item.itemRate || '0')),
              taxableValue: parseFloat(String(item.taxable_value || item.taxableValue || '0')),
              foreignRate: parseFloat(String(item.foreign_rate || item.foreignRate || '0')),
              foreignAmount: parseFloat(String(item.foreign_amount || item.foreignAmount || '0')),
              igst: parseFloat(String(item.igst_amount || item.igst || '0')),
              cgst: parseFloat(String(item.cgst_amount || item.cgst || '0')),
              sgst: parseFloat(String(item.sgst_amount || item.sgst || '0')),
              cess: parseFloat(String(item.cess_amount || item.cess || '0')),
              invoiceValue: parseFloat(String(item.invoice_value || item.invoiceValue || '0')),
              description: item.description || '',
              salesLedger: item.sales_ledger || item.salesLedger || '',
              poRate: item.poRate || null,
              invoiceRate: item.invoiceRate || null,
              rateMismatch: item.rateMismatch || false,
              poQty: item.poQty || null,
              invoiceQty: item.invoiceQty || null,
              qtyMismatch: item.qtyMismatch || false,
              grnQty: item.grnQty || null,
              sourcePoNo: item.sourcePoNo || null,
              salesInvoiceNo: item.sales_invoice_no || item.salesInvoiceNo || null,
              financialAmount: parseFloat(String(item.financial_amount || item.financialAmount || '0'))
            })));
          }

          if (details.due_details) {
            setCnReverseGstTcs(details.due_details.reverse_gst_tcs || 'No');
            setCnReverseGstTds(details.due_details.reverse_gst_tds || 'No');
            setCnReverseIncomeTaxTcs(details.due_details.reverse_income_tax_tcs || 'No');
            setCnReverseIncomeTaxTds(details.due_details.reverse_income_tax_tds || 'No');
            setCnIncomeTaxTdsTcsAmount(String(details.due_details.income_tax_tds_tcs_amount || '0.00'));
            setCnGstTdsTcsAmount(String(details.due_details.gst_tds_tcs_amount || '0.00'));
            setCnAdvanceAmount(String(details.due_details.advance_amount || '0.00'));
            setCnPayableAmount(String(details.due_details.payable_amount || '0.00'));
            setCnTermsConditions(details.due_details.terms_conditions || '');
          }

          if (details.transit_details) {
            setCnTransitReceivedIn(details.transit_details.received_in || '');
            setCnTransitMode(details.transit_details.mode_of_transport || 'Road');
            if (details.transit_details.receipt_date) setCnTransitReceiptDate(details.transit_details.receipt_date);
            setCnTransitReceiptTime(details.transit_details.receipt_time || '');
            setCnTransitDeliveryType(details.transit_details.delivery_type || 'Self');
            setCnTransitTransporterId(details.transit_details.transporter_id_gstin || '');
            setCnTransitTransporterName(details.transit_details.transporter_name || '');
            setCnTransitVehicleNo(details.transit_details.vehicle_no || '');
            setCnTransitLrGrConsignment(details.transit_details.lr_gr_consignment_no || '');
          }
        }
        else if (mappedType === 'Debit Note') {
          setLocalPrefilledData({
            voucherId: voucherId,
            invoiceNumber: details.voucher_number || details.debit_note_no || details.voucher_no || '',
            voucher_name: details.voucher_series || details.debit_note_series || '',
            invoiceDate: details.date ? new Date(details.date).toISOString().split('T')[0] : getTodayDate(),
            sellerName: details.party || details.vendor_name || '',
            totalAmount: parseFloat(details.total_amount || details.amount || details.item_details?.total_invoice_value || 0),
            narration: details.narration || details.posting_note || '',
            voucher_type: details.voucher_type || details.type || 'Debit Note',
            ...details
          } as any);
        }
      }
    }).catch(err => {
      console.error('[VouchersPage] drill-down fetch failed:', err);
      const fallback = { ...rawVoucher, _mappedType: mappedType, _rawEntry: viewVoucherData };
      setDrillDownDetails(fallback);

      // Hydrate fallback basics into form states so "Edit" view isn't blank!
      const fallbackDate = rawVoucher.date || viewVoucherData.date;
      if (fallbackDate) setDate(new Date(fallbackDate).toISOString().split('T')[0]);
      const fallbackParty = rawVoucher.party || viewVoucherData.ledgerName || viewVoucherData.ledger || '';
      if (fallbackParty) setParty(fallbackParty);
      setNarration(rawVoucher.narration || viewVoucherData.narration || '');

      if (mappedType === 'Sales') {
        setLocalPrefilledData({
          voucherId: voucherId,
          invoiceNumber: rawVoucher.voucher_no || rawVoucher.voucher_number || viewVoucherData.voucherNo || '',
          voucher_name: rawVoucher.voucher_name || rawVoucher.voucher_series || rawVoucher.sales_series || '',
          invoiceDate: fallbackDate ? new Date(fallbackDate).toISOString().split('T')[0] : getTodayDate(),
          sellerName: fallbackParty,
          totalAmount: rawVoucher.total_amount || viewVoucherData.debit || viewVoucherData.credit || 0,
          lineItems: [], // No detail on fallback
        } as any);
      } else if (mappedType === 'Purchase') {
        setInvoiceNo(rawVoucher.voucher_no || rawVoucher.voucher_number || viewVoucherData.voucherNo || '');
        setSupplierInvoiceDate(fallbackDate ? new Date(fallbackDate).toISOString().split('T')[0] : getTodayDate());
      } else if (mappedType === 'Payment' || mappedType === 'Receipt') {
        setLocalPrefilledData({
          voucherId: voucherId,
          invoiceNumber: rawVoucher.voucher_no || rawVoucher.voucher_number || viewVoucherData.voucherNo || '',
          invoiceDate: fallbackDate ? new Date(fallbackDate).toISOString().split('T')[0] : getTodayDate(),
          sellerName: rawVoucher.party || fallbackParty,
          account: rawVoucher.account || '',
          totalAmount: rawVoucher.total_amount || viewVoucherData.debit || viewVoucherData.credit || 0,
          narration: rawVoucher.narration || viewVoucherData.narration || '',
          reference_number: rawVoucher.ref_no || '',
          voucher_type: rawVoucher.voucher_type || rawVoucher.type || '',
          items: rawVoucher.items || rawVoucher.item_details?.line_items || rawVoucher.item_details?.items || [],
        } as any);
      } else if (mappedType === 'Contra') {
        if (rawVoucher.fromAccount || rawVoucher.from_account) setFromAccount(rawVoucher.fromAccount || rawVoucher.from_account);
        if (rawVoucher.toAccount || rawVoucher.to_account) setToAccount(rawVoucher.toAccount || rawVoucher.to_account);
        if (rawVoucher.amount || viewVoucherData.debit || viewVoucherData.credit) setSimpleAmount(parseFloat(rawVoucher.amount || viewVoucherData.debit || viewVoucherData.credit || 0));
        if (rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo) setVoucherNumber(rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo);
      }
      else if (mappedType === 'Journal') {
        if (rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo) setVoucherNumber(rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo);
      }
      else if (mappedType === 'Expenses') {
        if (rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo) setVoucherNumber(rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo);
      }
      else if (mappedType === 'Credit Note') {
        if (rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo) setCnVoucherNumber(rawVoucher.voucher_number || rawVoucher.voucher_no || viewVoucherData.voucherNo);
        if (fallbackParty) setCnCustomer(fallbackParty);
      }
      else if (mappedType === 'Debit Note') {
        setLocalPrefilledData({
          voucherId: voucherId,
          invoiceNumber: rawVoucher.voucher_no || rawVoucher.voucher_number || viewVoucherData.voucherNo || '',
          invoiceDate: fallbackDate ? new Date(fallbackDate).toISOString().split('T')[0] : getTodayDate(),
          sellerName: rawVoucher.party || fallbackParty,
          totalAmount: rawVoucher.total_amount || viewVoucherData.debit || viewVoucherData.credit || 0,
          narration: rawVoucher.narration || viewVoucherData.narration || '',
          voucher_type: rawVoucher.voucher_type || rawVoucher.type || 'Debit Note',
          ...rawVoucher,
          ...viewVoucherData
        } as any);
      }
    }).finally(() => setDrillDownLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewVoucherData, isViewingAmended]);

  // Resolve vendorId from party name once richVendors finishes loading
  useEffect(() => {
    if (party && richVendors.length > 0) {
      const match = richVendors.find((v: any) => (v.vendor_name || '').toLowerCase() === party.toLowerCase());
      if (match) {
        if (!vendorId) setVendorId(match.id.toString());

        // If running Purchase flow and missing basic branch/address fields, 
        // auto-fill from Vendor Master to avoid user seeing blank fields.
        if (voucherType === 'Purchase') {
          const matchGst = vendorGstDetails.find(g => g.vendor_basic_detail === match.id);
          if (matchGst) {
            if (!gstin) setGstin(matchGst.gstin);
            if (!selectedBranch && matchGst.reference_name) setSelectedBranch(matchGst.reference_name);
            if (!billFromAddress1 && matchGst.branch_address) setAddressFields(matchGst.branch_address);
          } else if (match.billing_address && !billFromAddress1) {
            setAddressFields(match.billing_address);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, richVendors, vendorId, vendorGstDetails, voucherType]);

  // Resolve cnCustomerId from cnCustomer once richCustomers finishes loading
  useEffect(() => {
    if (isReadOnlyMode && cnCustomer && richCustomers.length > 0) {
      const match = richCustomers.find((c: any) => c.customer_name === cnCustomer);
      if (match) {
        if (!cnCustomerId) setCnCustomerId(match.id.toString());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnlyMode, cnCustomer, richCustomers, cnCustomerId]);

  const renderPurchaseForm = () => {
    return (
      <div className="space-y-6">
        {activeOcrFileHash && (
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-5 flex items-center justify-between gap-4 transition-all">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-lg shrink-0 mt-0.5">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-indigo-900">Editing Extracted Scan Data</h4>
                <p className="text-xs text-indigo-700 leading-relaxed">
                  You are editing extracted data for <span className="font-mono bg-indigo-100 px-1 py-0.5 rounded text-indigo-800 break-all">{activeOcrFileName || activeOcrFileHash}</span>. Saving will create a purchase voucher and mark the scan row as finalized.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseVoucher}
              className="px-4 py-2 text-xs font-semibold text-indigo-700 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors whitespace-nowrap"
            >
              BACK TO SCAN LIST
            </button>
          </div>
        )}
        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {(invoiceInForeignCurrency === 'Yes' ? [
            { id: 'supplier', label: 'Supplier Details' },
            { id: 'supply_foreign', label: 'Supply Details (Foreign Currency)' },
            { id: 'supply_inr', label: 'Supply Details (INR)' },
            { id: 'due', label: 'Due Details' },
            { id: 'transit', label: 'Transit Details' }
          ] : [
            { id: 'supplier', label: 'Supplier Details' },
            { id: 'supply', label: 'Supply Details' },
            { id: 'due', label: 'Due Details' },
            { id: 'transit', label: 'Transit Details' }
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPurchaseActiveTab(tab.id as any)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${purchaseActiveTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <fieldset disabled={isReadOnlyMode} className={`p-4 bg-white rounded-[4px] border border-gray-200 min-h-[200px] ${isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}`}>
          {purchaseActiveTab === 'supplier' && (
            <div className="space-y-6">
              {/* Row 1: Date, Supplier Invoice No, Purchase Voucher Series, Purchase Voucher No */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    max={getTodayDate()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Supplier Invoice No. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoiceNo}
                    onChange={(e) => {
                      // Allow only alphanumeric, '/' and '-'
                      const sanitized = e.target.value.replace(/[^a-zA-Z0-9/\-]/g, '');
                      setInvoiceNo(sanitized);
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter invoice number"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Voucher Series
                  </label>
                  <select
                    value={selectedPurchaseConfig}
                    onChange={(e) => setSelectedPurchaseConfig(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="">Select Series</option>
                    {purchaseVoucherConfigs.map((config) => (
                      <option key={config.id} value={config.voucher_name}>
                        {config.voucher_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Purchase Voucher No.
                  </label>
                  <input
                    type="text"
                    value={voucherNumber}
                    readOnly
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500"
                  />
                </div>
              </div>

              {/* Row 2: Vendor Name, Branch, GSTIN, Supplier Invoice Date */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vendor Name <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <SearchableDropdown
                      value={party}
                      onChange={handlePartyChange}
                      options={purchasePartyOptions}
                      onFocus={fetchRichData}
                      placeholder="Select Vendor"
                      className="w-full"
                      disabled={isVendorDisabled}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const itemsFromVoucher = purchaseItems
                          .filter(pi => pi.itemName || pi.itemCode)
                          .map(pi => ({
                            supplierItemCode: pi.itemCode || '',
                            supplierItemName: pi.itemName || '',
                            hsnSac: pi.hsnSac || '',
                          }));
                        setExtractedVendorData((prev: any) => ({
                          ...(prev || {}),
                          supplier_items: itemsFromVoucher.length > 0 ? itemsFromVoucher : undefined,
                        }));
                        setIsCreateVendorModalOpen(true);
                      }}
                      className="flex items-center self-start gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 text-[13px] font-medium rounded-[4px] transition-all whitespace-nowrap shadow-sm uppercase"
                      title="Add New Vendor"
                    >
                      <span className="text-lg leading-none">+</span> ADD NEW VENDOR
                    </button>
                  </div>

                  {vendorValidationStatus === 'NOT_FOUND' && (
                    <div className="mt-2 text-xs text-red-600 font-semibold flex items-center justify-between gap-2 p-2 bg-red-50 border border-red-200 rounded">
                      <div className="flex items-center gap-1">
                        <Icon name="x" className="w-4 h-4" />
                        Vendor Not Found in Vendor Master
                      </div>
                      <button type="button" onClick={() => {
                        // Inject current purchase items so the modal pre-fills Supplier Items
                        const itemsFromVoucher = purchaseItems
                          .filter(pi => pi.itemName || pi.itemCode)
                          .map(pi => ({
                            supplierItemCode: pi.itemCode || '',
                            supplierItemName: pi.itemName || '',
                            hsnSac: pi.hsnSac || '',
                          }));
                        setExtractedVendorData((prev: any) => ({
                          ...(prev || {}),
                          supplier_items: itemsFromVoucher.length > 0 ? itemsFromVoucher : undefined,
                        }));
                        setIsCreateVendorModalOpen(true);
                      }} className="px-2 py-1 bg-white border border-red-200 text-red-600 rounded hover:bg-red-50 shadow-sm flex items-center gap-1">
                        <Icon name="plus" className="w-3 h-3" /> Create Vendor
                      </button>
                    </div>
                  )}
                  {vendorValidationStatus === 'GSTIN_CONFLICT' && (
                    <div className="mt-2 text-xs text-amber-600 font-semibold flex items-center gap-1 bg-amber-50 px-2 py-1 rounded">
                      <Icon name="x" className="w-4 h-4" />
                      {vendorConflictMsg}
                    </div>
                  )}
                  {/* datalist removed in favor of SearchableSelect */}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Branch
                  </label>
                  <SearchableDropdown
                    value={selectedBranch}
                    onChange={(val) => setSelectedBranch(val)}
                    options={
                      vendorId
                        ? vendorGstDetails
                          .filter(g => g.vendor_basic_detail === vendorId)
                          .map(g => g.reference_name)
                          .filter(Boolean)
                        : []
                    }
                    placeholder="Select Branch"
                    className="w-full"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2 whitespace-nowrap">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter GSTIN"
                  />
                </div>

                <div className="md:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2 whitespace-nowrap">
                    Supplier Invoice Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={supplierInvoiceDate}
                    onChange={(e) => setSupplierInvoiceDate(e.target.value)}
                    max={getTodayDate()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* Row 3: Create GRN & Upload */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="flex flex-col gap-1">
                  <label className="block text-sm font-semibold text-gray-800">GRN Reference No.</label>
                  <div className="flex-1">
                    <SearchableDropdown
                      value={grnRefNo === '+ Create GRN' ? '' : grnRefNo}
                      onChange={(val) => {
                        if (val === '+ Create GRN') {
                          setIsCreateGRNModalOpen(true);
                        } else {
                          setGrnRefNo(val);
                        }
                      }}
                      options={['+ Create GRN', ...new Set(pendingGRNs.map(g => g.grn_no).filter(Boolean))]}
                      placeholder="Select Pending GRN or Create"
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Upload Section Moved Here */}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-1">
                    Upload Supporting Document
                  </label>
                  <div className="relative group">
                    <input
                      type="file"
                      id="purchase-supporting-doc"
                      onChange={(e) => {
                        if (e.target.files) setPurchaseSupportingDocument(e.target.files[0]);
                      }}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                    {!purchaseSupportingDocument ? (
                      <button
                        type="button"
                        onClick={() => document.getElementById('purchase-supporting-doc')?.click()}
                        className="w-full h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-all flex items-center justify-center gap-2 shadow-sm"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="text-sm">Upload Document</span>
                      </button>
                    ) : (
                      <div className="relative border-2 border-dashed border-indigo-200 rounded-[4px] p-2 bg-indigo-50/30">
                        {purchaseSupportingDocument.type.startsWith('image/') ? (
                          <div
                            className="relative aspect-video w-full overflow-hidden rounded-[2px] bg-white border border-indigo-100 cursor-pointer group/preview"
                            onClick={() => setIsPurchasePreviewModalOpen(true)}
                          >
                            <img
                              src={purchasePreviewUrl || ''}
                              alt="Preview"
                              className="w-full h-full object-contain transition-transform duration-300 group-hover/preview:scale-105"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center">
                              <span className="text-white text-xs font-bold uppercase tracking-wider">Click to View</span>
                            </div>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-colors group/file"
                            onClick={() => setIsPurchasePreviewModalOpen(true)}
                          >
                            <div className="p-2 bg-red-50 text-red-600 rounded">
                              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate uppercase tracking-tight leading-none">{purchaseSupportingDocument.name}</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">PDF Document</p>
                            </div>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setPurchaseSupportingDocument(null)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg hover:bg-red-600 transition-colors z-10"
                          title="Remove File"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 4: Address Headers & Toggle */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-3 pt-4 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-800 uppercase tracking-wider">Bill From (Full Address)</label>
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-semibold text-gray-800 uppercase tracking-wider">Ship From</label>
                  <label className="flex items-center gap-2 cursor-pointer text-[10px] font-bold text-gray-500 uppercase tracking-tight">
                    <input
                      type="checkbox"
                      checked={sameAsBillFrom}
                      onChange={(e) => {
                        setSameAsBillFrom(e.target.checked);
                        if (e.target.checked) {
                          setShipFromAddress1(billFromAddress1);
                          setShipFromAddress2(billFromAddress2);
                          setShipFromAddress3(billFromAddress3);
                          setShipFromCity(billFromCity);
                          setShipFromPincode(billFromPincode);
                          setShipFromState(billFromState);
                          setShipFromCountry(billFromCountry);
                        } else {
                          setShipFromAddress1('');
                          setShipFromAddress2('');
                          setShipFromAddress3('');
                          setShipFromCity('');
                          setShipFromPincode('');
                          setShipFromState('');
                          setShipFromCountry('India');
                        }
                      }}
                      className="w-3.5 h-3.5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                    />
                    Same as Bill From Address
                  </label>
                </div>
              </div>

              {/* Row 5: Granular Address Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Bill From Column */}
                <div className="space-y-3">
                  <input
                    type="text"
                    value={billFromAddress1}
                    onChange={(e) => setBillFromAddress1(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Address Line 1"
                  />
                  <input
                    type="text"
                    value={billFromAddress2}
                    onChange={(e) => setBillFromAddress2(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Address Line 2"
                  />
                  <input
                    type="text"
                    value={billFromAddress3}
                    onChange={(e) => setBillFromAddress3(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Address Line 3"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={billFromCity}
                      onChange={(e) => setBillFromCity(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      value={billFromPincode}
                      onChange={(e) => setBillFromPincode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="Pincode"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={billFromState}
                      onChange={(e) => setBillFromState(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="State"
                    />
                    <input
                      type="text"
                      value={billFromCountry}
                      onChange={(e) => setBillFromCountry(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="Country"
                    />
                  </div>
                  {vendorAddresses.length > 1 && (
                    <div className="mt-1">
                      <SearchableDropdown
                        value={''}
                        onChange={(val) => {
                          if (val) {
                            // Extract parts from the address if needed, or if setAddressFields handles it.
                            // For simplicity, we assume setAddressFields is updated or we do it here.
                            const addr = vendorAddresses.find(a => a === val);
                            if (addr) {
                              const parts = addr.split(',').map(p => p.trim());
                              setBillFromAddress1(parts[0] || '');
                              setBillFromAddress2(parts[1] || '');
                              setBillFromAddress3(parts[2] || '');
                              setBillFromCity(parts[3] || '');
                              setBillFromPincode(parts[4] || '');
                              setBillFromState(parts[5] || '');
                              setBillFromCountry(parts[6] || 'India');
                            }
                          }
                        }}
                        options={vendorAddresses}
                        placeholder="Select from saved vendor addresses..."
                        className="w-full"
                      />
                    </div>
                  )}
                </div>

                {/* Ship From Column */}
                <div className={`space-y-3 ${sameAsBillFrom ? 'opacity-60 pointer-events-none' : ''}`}>
                  <input
                    type="text"
                    value={shipFromAddress1}
                    onChange={(e) => setShipFromAddress1(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Address Line 1"
                    disabled={sameAsBillFrom}
                  />
                  <input
                    type="text"
                    value={shipFromAddress2}
                    onChange={(e) => setShipFromAddress2(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Address Line 2"
                    disabled={sameAsBillFrom}
                  />
                  <input
                    type="text"
                    value={shipFromAddress3}
                    onChange={(e) => setShipFromAddress3(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Address Line 3"
                    disabled={sameAsBillFrom}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={shipFromCity}
                      onChange={(e) => setShipFromCity(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="City"
                      disabled={sameAsBillFrom}
                    />
                    <input
                      type="text"
                      value={shipFromPincode}
                      onChange={(e) => setShipFromPincode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="Pincode"
                      disabled={sameAsBillFrom}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={shipFromState}
                      onChange={(e) => setShipFromState(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="State"
                      disabled={sameAsBillFrom}
                    />
                    <input
                      type="text"
                      value={shipFromCountry}
                      onChange={(e) => setShipFromCountry(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="Country"
                      disabled={sameAsBillFrom}
                    />
                  </div>
                </div>
              </div>

              {/* Input Type / Tax Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Input Type</label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceInForeignCurrency('No');
                        setPurchaseInputTypes(prev => {
                          const rest = prev.filter(t => t !== 'Interstate' && t !== 'Intrastate');
                          return [...rest, 'Intrastate'];
                        });
                        setIsInterState(false);
                      }}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-all duration-200 ${purchaseInputTypes.includes('Intrastate')
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      CGST & SGST
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setInvoiceInForeignCurrency('Yes');
                        setPurchaseInputTypes(prev => {
                          const rest = prev.filter(t => t !== 'Interstate' && t !== 'Intrastate');
                          return [...rest, 'Interstate'];
                        });
                        setIsInterState(true);
                      }}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-all duration-200 ${purchaseInputTypes.includes('Interstate')
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      IGST
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseInputTypes(prev =>
                          prev.includes('Import') ? prev.filter(t => t !== 'Import') : [...prev, 'Import']
                        );
                      }}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-all duration-200 ${purchaseInputTypes.includes('Import')
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      Cess
                    </button>
                  </div>
                </div>

                {/* Foreign Currency */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Invoice in Foreign Currency</label>
                  <div className="flex gap-8 items-center h-[42px]">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="radio"
                          name="foreignCurrency"
                          checked={invoiceInForeignCurrency === 'Yes'}
                          onChange={() => setInvoiceInForeignCurrency('Yes')}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all duration-200 ${invoiceInForeignCurrency === 'Yes'
                          ? 'border-indigo-600 bg-white'
                          : 'border-gray-300 group-hover:border-indigo-400'
                          }`}>
                          {invoiceInForeignCurrency === 'Yes' && (
                            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-medium transition-colors duration-200 ${invoiceInForeignCurrency === 'Yes' ? 'text-indigo-600 font-semibold' : 'text-gray-600'
                        }`}>Yes</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="radio"
                          name="foreignCurrency"
                          checked={invoiceInForeignCurrency === 'No'}
                          onChange={() => setInvoiceInForeignCurrency('No')}
                          className="sr-only"
                        />
                        <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all duration-200 ${invoiceInForeignCurrency === 'No'
                          ? 'border-indigo-600 bg-white'
                          : 'border-gray-300 group-hover:border-indigo-400'
                          }`}>
                          {invoiceInForeignCurrency === 'No' && (
                            <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full" />
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-medium transition-colors duration-200 ${invoiceInForeignCurrency === 'No' ? 'text-indigo-600 font-semibold' : 'text-gray-600'
                        }`}>No</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* Supply Details (Foreign Currency) Content */}
          {purchaseActiveTab === 'supply_foreign' && (
            <div className="space-y-6">
              {/* Header: Purchase Order and Exchange Rate */}
              <div className="flex flex-wrap justify-between items-end gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 whitespace-nowrap">
                      Purchase Order No.
                    </label>
                    <div className="flex items-center gap-2 relative">
                      <button
                        type="button"
                        onClick={() => setIsPoDropdownOpen(!isPoDropdownOpen)}
                        className="px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px] bg-white text-left flex justify-between items-center"
                        disabled={isFetchingPOs}
                      >
                        <span className="truncate">
                          {selectedPurchasePOs.length > 0 ? selectedPurchasePOs.join(', ') : (isFetchingPOs ? 'Loading POs...' : 'Select Purchase Order')}
                        </span>
                        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isPoDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isPoDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setIsPoDropdownOpen(false)}
                          />
                          <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-[4px] shadow-lg max-h-60 overflow-y-auto top-[42px]">
                            {availablePOs.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-gray-500">No POs available</div>
                            ) : (
                              availablePOs.map((po) => {
                                const isSelected = selectedPurchasePOs.includes(po.po_number);

                                return (
                                  <div
                                    key={po.id}
                                    className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (isSelected) {
                                        setSelectedPurchasePOs(selectedPurchasePOs.filter(p => p !== po.po_number));
                                      } else {
                                        setSelectedPurchasePOs([...selectedPurchasePOs, po.po_number]);
                                      }
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      readOnly
                                      className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                    />
                                    <span>{po.po_number} ({po.status}) {po.vendor_name ? `- ${po.vendor_name}` : ''}</span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white px-4 py-2 border border-slate-200 rounded-[4px] shadow-none">
                  <span className="text-sm font-medium text-gray-700">1 {vendorBillingCurrency || 'Foreign Currency'} =</span>
                  <input
                    type="text"
                    value={exchangeRate}
                    onChange={(e) => {
                      const exRateVal = e.target.value;
                      setExchangeRate(exRateVal);

                      // Auto-update all INR rates based on the new exchange rate
                      const exRateNum = parseFloat(exRateVal) || 1; // Fallback to 1 for instant 1:1 sync when cleared
                      const updatedItems = purchaseItems.map(item => {
                        const fRate = parseFloat(item.foreignRate?.toString() || '0') || 0;
                        const qty = parseFloat(item.qty.toString()) || 0;

                        const newRate = fRate * exRateNum;
                        const newTaxable = qty * newRate;


                        const selectedStockItem = allItems.find((si: any) =>
                          (si.item_code || si.code) === item.itemCode ||
                          (si.name || si.item_name) === item.itemName
                        );
                        const gstRate = selectedStockItem?.gstRate || selectedStockItem?.gst_rate || 0;
                        const cessRate = selectedStockItem?.cessRate || selectedStockItem?.cess_rate || 0;
                        const totalTax = newTaxable * (gstRate / 100);
                        const newCess = totalTax * (cessRate / 100);


                        let igst = 0, cgst = 0, sgst = 0;
                        if (isInterState) {
                          igst = totalTax;
                        } else {
                          cgst = totalTax / 2;
                          sgst = totalTax / 2;
                        }

                        return {
                          ...item,
                          rate: newRate,
                          taxableValue: newTaxable,
                          igst,
                          cgst,
                          sgst,
                          cess: newCess,
                          invoiceValue: newTaxable + igst + cgst + sgst + newCess
                        };
                      });
                      setPurchaseItems(updatedItems);

                    }}
                    className="w-24 border-b-2 border-gray-300 focus:border-indigo-500 focus:outline-none px-2 py-1 text-center font-medium text-indigo-600"
                    placeholder="Rate"
                  />
                  <span className="text-sm font-medium text-gray-700">INR</span>
                </div>
              </div>

              {/* Foreign Currency Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none">
                <table className="w-full">
                  <thead className="bg-indigo-600 text-white">
                    <tr>
                      <th className="px-3 py-3 text-center w-12 border-r border-indigo-500"></th>
                      {selectedPurchasePOs.length > 0 && (
                        <th className="px-3 py-3 text-sm font-semibold text-center border-r border-indigo-500">Purchase Order No.</th>
                      )}
                      <th className="px-3 py-3 text-sm font-semibold text-center border-r border-indigo-500">Description</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-indigo-500">Inv Qty</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-indigo-500">UQC</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-indigo-500">Rate ({vendorBillingCurrency || 'FC'})</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-indigo-500">Amount ({vendorBillingCurrency || 'FC'})</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseItems.map((row, index) => {
                      const getPoColor = (poNo: string | null) => {
                        if (!poNo) return '';
                        const colors = [
                          'bg-emerald-50/60 hover:bg-emerald-100/60 border-l-4 border-l-emerald-400',
                          'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-400',
                          'bg-rose-50/60 hover:bg-rose-100/60 border-l-4 border-l-rose-400',
                          'bg-sky-50/60 hover:bg-sky-100/60 border-l-4 border-l-sky-400',
                          'bg-violet-50/60 hover:bg-violet-100/60 border-l-4 border-l-violet-400',
                          'bg-indigo-50/60 hover:bg-indigo-100/60 border-l-4 border-l-indigo-400',
                          'bg-orange-50/60 hover:bg-orange-100/60 border-l-4 border-l-orange-400',
                          'bg-teal-50/60 hover:bg-teal-100/60 border-l-4 border-l-teal-400',
                        ];
                        const idx = selectedPurchasePOs.indexOf(poNo);
                        return idx !== -1 ? colors[idx % colors.length] : '';
                      };
                      const rowColor = getPoColor(row.sourcePoNo);

                      return (
                        <tr key={row.id} className={`${rowColor || 'border-b border-gray-200 hover:bg-gray-50'} transition-colors`}>
                          <td className="px-3 py-2 text-center border-r border-gray-200">
                            <input
                              type="checkbox"
                              checked={selectedPurchaseItems.includes(row.id)}
                              onChange={() => handleTogglePurchaseItemSelection(row.id)}
                              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            />
                          </td>
                          {selectedPurchasePOs.length > 0 && (
                            <td className="px-3 py-2 border-r border-gray-200 text-sm text-center text-gray-600">
                              {row.sourcePoNo || '-'}
                            </td>
                          )}
                          <td className="px-3 py-2 border-r border-gray-200">
                            <SearchableDropdown
                              value={row.itemName}
                              onChange={(val) => handlePurchaseItemChange(index, 'itemName', val)}
                              options={itemNameOptions}
                              placeholder="Item Name"
                              className="w-full"
                            />
                          </td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <div className="flex flex-col items-center gap-0.5">
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                min="0"
                                value={row.qty}
                                onChange={(e) => handlePurchaseItemChange(index, 'qty', e.target.value)}
                                className={`w-full px-2 py-1.5 border focus:ring-1 rounded text-sm text-center bg-transparent ${showPurchaseMismatches && row.qtyMismatch ? 'border-red-500 bg-red-50/50 focus:ring-red-400' : 'border-0 focus:ring-indigo-500'}`}
                                placeholder="0"
                              />
                              {showPurchaseMismatches && row.qtyMismatch && (
                                <span className="text-[10px] text-red-600 font-bold whitespace-nowrap">
                                  ⚠ Mismatch: {row.poQty || row.invoiceQty}
                                </span>
                              )}
                              {(!row.qtyMismatch || !showPurchaseMismatches) && (row.poQty || row.invoiceQty) != null && (
                                <span className="text-[10px] text-green-600 font-medium whitespace-nowrap">
                                  Ref: {row.poQty || row.invoiceQty}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <select
                              value={row.uom}
                              onChange={(e) => handlePurchaseItemChange(index, 'uom', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-white"
                            >
                              <option value="">Select UQC</option>
                              {(() => {
                                const selectedItem = allItems.find(i => (i.item_code || i.code) === row.itemCode || (i.name || i.item_name) === row.itemName);
                                const units = selectedItem ? [selectedItem.uom || selectedItem.unit, selectedItem.alternate_unit].filter(Boolean) : [];
                                return Array.from(new Set(units)).map(u => (
                                  <option key={u} value={u}>{u}</option>
                                ));
                              })()}
                            </select>
                          </td>
                          <td className="px-3 py-2 border-r border-gray-200">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              min="0"
                              value={row.foreignRate || ''}
                              onChange={(e) => handlePurchaseItemChange(index, 'foreignRate', e.target.value)}
                              className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                              placeholder="0.00"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={row.foreignAmount || 0}
                              readOnly
                              className="w-full px-2 py-1.5 bg-gray-50 border-0 rounded text-sm font-medium text-center text-gray-700"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {/* Purchase Ledger and Description Row (Like Sales Voucher) */}
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={6} className="px-3 py-2">
                        <div className="flex items-center gap-4 flex-wrap">
                          {/* Purchase Ledger Dropdown */}
                          <div className="flex items-center gap-2 min-w-[260px]">
                            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Purchase Ledger:</label>
                            <div className="flex-1">
                              <SearchableDropdown
                                options={purchaseLedgerOptions}
                                value={purchaseLedger}
                                onChange={(val) => setPurchaseLedger(val)}
                                placeholder="Select purchase ledger"
                              />
                            </div>
                          </div>

                          {/* Ledger Narration */}
                          <div className="flex items-center gap-2 flex-1">
                            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Ledger Narration:</label>
                            <input
                              type="text"
                              value={purchaseDescription}
                              onChange={(e) => setPurchaseDescription(e.target.value)}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500"
                              placeholder="Enter ledger narration"
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleAddPurchaseItem}
                  className="px-4 py-2 text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-2 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Row
                </button>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={handleDeleteSelectedItems}
                    disabled={selectedPurchaseItems.length === 0}
                    className={`px-4 py-2 rounded-[4px] transition-colors font-medium flex items-center gap-2 ${selectedPurchaseItems.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete Items
                  </button>


                </div>
              </div>
            </div>
          )}

          {/* Supply Details Tab Content */}
          {
            (purchaseActiveTab === 'supply' || purchaseActiveTab === 'supply_inr') && (
              <div className="space-y-6">
                {/* Purchase Order Selection */}
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Purchase Order No.
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsPoDropdownOpen(!isPoDropdownOpen)}
                      className="px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 w-64 bg-white text-left flex justify-between items-center"
                      disabled={isFetchingPOs}
                    >
                      <span className="truncate">
                        {selectedPurchasePOs.length > 0 ? selectedPurchasePOs.join(', ') : (isFetchingPOs ? 'Loading POs...' : 'Select Purchase Order')}
                      </span>
                      <ChevronDown size={16} className={`text-gray-400 transition-transform ${isPoDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isPoDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setIsPoDropdownOpen(false)}
                        />
                        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-[4px] shadow-lg max-h-60 overflow-y-auto top-[42px]">
                          {availablePOs.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-gray-500">No POs available</div>
                          ) : (
                            availablePOs.map((po) => {
                              const isSelected = selectedPurchasePOs.includes(po.po_number);

                              return (
                                <div
                                  key={po.id}
                                  className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isSelected) {
                                      setSelectedPurchasePOs(selectedPurchasePOs.filter(p => p !== po.po_number));
                                    } else {
                                      setSelectedPurchasePOs([...selectedPurchasePOs, po.po_number]);
                                    }
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    className="mr-2 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                  />
                                  <span>{po.po_number} {po.vendor_name ? `- ${po.vendor_name}` : ''}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>



                {/* Items Table */}
                <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none">
                  <table className="w-full">
                    <thead className="bg-indigo-600 text-white">
                      <tr>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">S. No.</th>
                        {selectedPurchasePOs.length > 0 && (
                          <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Purchase Order No.</th>
                        )}
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Item Code</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Item Name</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">HSN/SAC</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Inv Qty</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">UQC</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Item Rate</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Taxable Value</th>
                        {purchaseInputTypes.includes('Intrastate') ? (
                          <>
                            <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">CGST</th>
                            <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">SGST/UTGST</th>
                          </>
                        ) : (
                          <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">IGST</th>
                        )}
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">CESS</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Invoice Value</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseItems.map((row, index) => {
                        const getPoColor = (poNo: string | null) => {
                          if (!poNo) return '';
                          const colors = [
                            'bg-emerald-50/60 hover:bg-emerald-100/60 border-l-4 border-l-emerald-400',
                            'bg-amber-50/60 hover:bg-amber-100/60 border-l-4 border-l-amber-400',
                            'bg-rose-50/60 hover:bg-rose-100/60 border-l-4 border-l-rose-400',
                            'bg-sky-50/60 hover:bg-sky-100/60 border-l-4 border-l-sky-400',
                            'bg-violet-50/60 hover:bg-violet-100/60 border-l-4 border-l-violet-400',
                            'bg-indigo-50/60 hover:bg-indigo-100/60 border-l-4 border-l-indigo-400',
                            'bg-orange-50/60 hover:bg-orange-100/60 border-l-4 border-l-orange-400',
                            'bg-teal-50/60 hover:bg-teal-100/60 border-l-4 border-l-teal-400',
                          ];
                          const idx = selectedPurchasePOs.indexOf(poNo);
                          return idx !== -1 ? colors[idx % colors.length] : '';
                        };
                        const rowColor = getPoColor(row.sourcePoNo);

                        return (
                          <tr key={row.id} className={`${rowColor || 'border-b border-gray-200 hover:bg-gray-50'} transition-colors`}>
                            <td className="px-2 py-2 text-center text-sm border-r border-gray-200">
                              <div className="flex items-center justify-center gap-2">
                                <input type="checkbox" className="w-4 h-4 rounded text-indigo-600" />
                                {index + 1}
                              </div>
                            </td>
                            {selectedPurchasePOs.length > 0 && (
                              <td className="px-2 py-2 border-r border-gray-200 text-sm text-center text-gray-600">
                                {row.sourcePoNo || '-'}
                              </td>
                            )}
                            <td className="px-2 py-2 border-r border-gray-200">
                              <SearchableDropdown
                                value={row.itemCode}
                                onChange={(val) => handlePurchaseItemChange(index, 'itemCode', val)}
                                options={itemCodeOptions}
                                placeholder="Code"
                                className="w-full"
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <SearchableDropdown
                                value={row.itemName}
                                onChange={(val) => handlePurchaseItemChange(index, 'itemName', val)}
                                options={itemNameOptions}
                                placeholder="Item Name"
                                className="w-full"
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <input
                                type="text"
                                value={row.hsnSac}
                                onChange={(e) => handlePurchaseItemChange(index, 'hsnSac', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="HSN/SAC"
                              />
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <div className="flex flex-col items-center gap-0.5">
                                <input
                                  type="number" onWheel={(e) => e.currentTarget.blur()}
                                  min="0"
                                  value={row.qty}
                                  onChange={(e) => handlePurchaseItemChange(index, 'qty', e.target.value)}
                                  className={`w-16 px-2 py-1 border rounded text-center text-sm ${showPurchaseMismatches && row.qtyMismatch ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-300'}`}
                                />
                                {showPurchaseMismatches && row.qtyMismatch && (
                                  <span className="text-[10px] text-red-600 font-bold whitespace-nowrap">
                                    ⚠ {row.poQty || row.invoiceQty}
                                  </span>
                                )}
                                {(!row.qtyMismatch || !showPurchaseMismatches) && (row.poQty || row.invoiceQty) != null && (
                                  <span className="text-[10px] text-green-600 font-medium whitespace-nowrap">
                                    Ref: {row.poQty || row.invoiceQty}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <select
                                value={row.uom}
                                onChange={(e) => handlePurchaseItemChange(index, 'uom', e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
                              >
                                <option value="">Select UQC</option>
                                {(() => {
                                  const selectedItem = allItems.find(i => (i.item_code || i.code) === row.itemCode || (i.name || i.item_name) === row.itemName);
                                  const units = selectedItem ? [selectedItem.uom || selectedItem.unit, selectedItem.alternate_unit].filter(Boolean) : [];
                                  // Unique units
                                  return Array.from(new Set(units)).map(u => (
                                    <option key={u} value={u}>{u}</option>
                                  ));
                                })()}
                              </select>
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <div className="flex flex-col items-end gap-0.5">
                                <input
                                  type="number" onWheel={(e) => e.currentTarget.blur()}
                                  min="0"
                                  value={row.rate}
                                  onChange={(e) => handlePurchaseItemChange(index, 'rate', e.target.value)}
                                  className={`w-20 px-2 py-1 border rounded text-right text-sm ${(row as any).rateMismatch
                                    ? 'border-red-500 bg-red-50 text-red-700 focus:ring-red-400'
                                    : 'border-gray-300 focus:ring-indigo-500'
                                    }`}
                                />
                                {(row as any).rateMismatch && (
                                  <span className="text-[10px] text-red-600 font-semibold leading-tight whitespace-nowrap">
                                    ⚠ Rate mismatch
                                  </span>
                                )}
                                {!((row as any).rateMismatch) && (row as any).poRate != null && selectedPurchasePOs.length > 0 && (
                                  <span className="text-[10px] text-green-600 leading-tight whitespace-nowrap">
                                    PO: ₹{Number((row as any).poRate).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <div className="w-24 px-2 py-1 bg-indigo-50 rounded text-right text-sm font-semibold text-indigo-700 select-none">
                                {((parseFloat(row.qty?.toString() || '0') || 0) * (parseFloat(row.rate?.toString() || '0') || 0)).toFixed(2)}
                              </div>
                            </td>
                            {purchaseInputTypes.includes('Intrastate') ? (
                              <>
                                {/* CGST = Taxable × GST Rate × 0.5 — Read-Only */}
                                <td className="px-2 py-2 border-r border-gray-200">
                                  <div
                                    className="w-24 px-2 py-1 bg-blue-50 rounded text-right text-sm font-semibold text-blue-700 select-none"
                                    title="CGST = Taxable Value × GST Rate × ½ (auto-calculated)"
                                  >
                                    {row.cgst?.toFixed(2) ?? '0.00'}
                                  </div>
                                </td>
                                {/* SGST = Taxable × GST Rate × 0.5 — Read-Only */}
                                <td className="px-2 py-2 border-r border-gray-200">
                                  <div
                                    className="w-24 px-2 py-1 bg-green-50 rounded text-right text-sm font-semibold text-green-700 select-none"
                                    title="SGST/UTGST = Taxable Value × GST Rate × ½ (auto-calculated)"
                                  >
                                    {row.sgst?.toFixed(2) ?? '0.00'}
                                  </div>
                                </td>
                              </>
                            ) : (
                              /* IGST — Read-Only */
                              <td className="px-2 py-2 border-r border-gray-200">
                                <div
                                  className="w-24 px-2 py-1 bg-purple-50 rounded text-right text-sm font-semibold text-purple-700 select-none"
                                  title="IGST = Taxable Value × GST Rate (auto-calculated)"
                                >
                                  {row.igst?.toFixed(2) ?? '0.00'}
                                </div>
                              </td>
                            )}


                            <td className="px-2 py-2 border-r border-gray-200">
                              <div
                                className="w-20 px-2 py-1 bg-purple-50 rounded text-right text-sm font-semibold text-purple-700 select-none"
                                title="CESS = Taxable Value × Cess Rate (auto-calculated)"
                              >
                                {row.cess?.toFixed(2) ?? '0.00'}
                              </div>
                            </td>
                            <td className="px-2 py-2 border-r border-gray-200">
                              <div className="text-right text-sm font-bold">{row.invoiceValue.toFixed(2)}</div>
                            </td>
                            <td className="px-2 py-2 flex justify-center items-center">
                              <button
                                type="button"
                                onClick={() => handleRemovePurchaseItem(index)}
                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 transition-colors"
                              >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {/* Purchase Ledger and Description Row */}
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={purchaseInputTypes.includes('Intrastate') ? 13 : 12} className="px-3 py-2">
                          <div className="flex items-center gap-4 flex-wrap">
                            {/* Purchase Ledger Dropdown */}
                            <div className="flex items-center gap-2 min-w-[260px]">
                              <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Purchase Ledger:</label>
                              <div className="flex-1">
                                <SearchableDropdown
                                  options={purchaseLedgerOptions}
                                  value={purchaseLedger}
                                  onChange={(val) => setPurchaseLedger(val)}
                                  placeholder="Select purchase ledger"
                                />
                              </div>
                            </div>
                            {/* Description */}
                            <div className="flex items-center gap-2 flex-1">
                              <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Ledger Narration:</label>
                              <input
                                type="text"
                                value={purchaseDescription}
                                onChange={(e) => setPurchaseDescription(e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500"
                                placeholder="Enter ledger narration"
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Add Item Button Outside (Like Sales Voucher) */}
                <div className="mt-2 text-left">
                  <button
                    type="button"
                    onClick={handleAddPurchaseItem}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Add Item
                  </button>
                </div>

                {/* Bottom Navigation Removed (Redundant fields deleted) */}

                {/* Navigation */}

              </div>
            )
          }
          {
            purchaseActiveTab === 'due' && (
              <div className="space-y-6">
                {/* Tax Summary Table */}
                <div className="border border-gray-300 rounded-[4px] overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">Taxable Value</th>
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">IGST</th>
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">CGST</th>
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">SGST/UTGST</th>
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700">Cess</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-white">
                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.taxableValue) || 0), 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.igst) || 0), 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.cgst) || 0), 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.sgst) || 0), 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium">
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.cess) || 0), 0)).toFixed(2)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_1fr] gap-6">
                  {/* Left Column: Payment Summary */}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Invoice Value</label>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        readOnly
                        value={(purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0)).toFixed(2)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        {vendorTaxType === 'TCS' ? 'TCS' : 'TDS'} under Income Tax
                      </label>

                      {/* Dropdown for sections - Only show if Auto TDS is enabled */}
                      {purchaseAutoTdsEnabled && vendorTaxType === 'TDS' && purchaseAvailableTdsSections.length > 0 && (
                        <div className="mb-2">
                          <select
                            value={purchaseSelectedStatutorySection}
                            onChange={(e) => setPurchaseSelectedStatutorySection(e.target.value)}
                            className="w-full px-3 py-1.5 border border-indigo-200 rounded-[4px] bg-white text-xs focus:ring-indigo-500 focus:border-indigo-500 font-medium text-indigo-700 shadow-sm hover:border-indigo-300 transition-colors"
                          >
                            {purchaseAvailableTdsSections.length > 1 && <option value="">Select TDS Section</option>}
                            {purchaseAvailableTdsSections.map(s => (
                              <option key={s} value={s}>{s.includes('|') ? s.split('|')[0] + ' - ' + s.split('|')[1] : s}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {purchaseAutoTdsEnabled && vendorTaxType === 'TCS' && purchaseAvailableTcsSections.length > 0 && (
                        <div className="mb-2">
                          <select
                            value={purchaseSelectedStatutorySection}
                            onChange={(e) => setPurchaseSelectedStatutorySection(e.target.value)}
                            className="w-full px-3 py-1.5 border border-indigo-200 rounded-[4px] bg-white text-xs focus:ring-indigo-500 focus:border-indigo-500 font-medium text-indigo-700 shadow-sm hover:border-indigo-300 transition-colors"
                          >
                            {purchaseAvailableTcsSections.length > 1 && <option value="">Select TCS Section</option>}
                            {purchaseAvailableTcsSections.map(s => (
                              <option key={s} value={s}>{s.includes('|') ? s.split('|')[0] + ' - ' + s.split('|')[1] : s}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      <input
                        type="text"
                        value={purchaseTdsIt}
                        onChange={(e) => setPurchaseTdsIt(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Advance Paid</label>
                      <input
                        type="text"
                        readOnly
                        value={purchaseAdvancePaid}
                        title="Sum of Applied Now column from the Advance grid (auto-calculated)"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold text-sm"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Gross Amount Due
                        {purchaseTaxIsTcs && Number(purchaseTdsIt) > 0 && (
                          <span className="ml-2 text-xs text-orange-600 font-normal">(TCS added)</span>
                        )}
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={(
                          purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0)
                          + (purchaseTaxIsTcs ? (Number(purchaseTdsIt) || 0) : -(Number(purchaseTdsIt) || 0))
                        ).toFixed(2)}
                        title="Invoice Value ± TDS/TCS (before advance deduction)"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 text-indigo-600">
                        Net Amount Due
                      </label>
                      <input
                        type="text"
                        readOnly
                        value={(
                          purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0)
                          + (purchaseTaxIsTcs ? (Number(purchaseTdsIt) || 0) : -(Number(purchaseTdsIt) || 0))
                          - (Number(purchaseAdvancePaid) || 0)
                        ).toFixed(2)}
                        title="Net Amount Due = Gross Amount Due − Advance Paid (auto-calculated)"
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-bold text-base text-indigo-700"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Posting Note:</label>
                      <textarea
                        value={purchasePostingNote}
                        onChange={(e) => setPurchasePostingNote(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none h-20 text-sm"
                        placeholder="Enter posting notes..."
                      />
                    </div>
                  </div>

                  {/* Middle Column: Advance Reference Grid */}
                  <div className="border border-gray-300 rounded-[4px] p-4 bg-slate-50/50 flex flex-col h-full">
                    <div className="space-y-3 flex-1 flex flex-col">
                      <div className="grid grid-cols-[110px_1fr_110px_150px] gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-200 pb-2">
                        <div className="text-center">Date</div>
                        <div className="text-center">Reference No.</div>
                        <div className="text-right pr-2">Available</div>
                        <div className="text-center">Allocated Amount</div>
                      </div>

                      {purchaseAdvanceRefs.length > 0 ? (
                        <div className="max-h-[450px] overflow-y-auto space-y-2 flex-1">
                          {purchaseAdvanceRefs.map((ref, idx) => {
                            const isAllocated = Number(ref.appliedNow) > 0;
                            return (
                              <div key={ref.id || idx} className="grid grid-cols-[110px_1fr_110px_150px] gap-2 items-center text-sm py-2 border-b border-indigo-100/50 hover:bg-white transition-colors">
                                <div className="text-center text-gray-500 text-xs">{ref.date}</div>
                                <div className="font-medium text-indigo-900 truncate px-1 text-center" title={ref.refNo}>{ref.refNo}</div>
                                <div className="text-right pr-2 font-semibold text-emerald-700">
                                  {Number(ref.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={isAllocated}
                                    title="Check to use full amount"
                                    onChange={(e) => {
                                      const newVal = e.target.checked ? String(ref.amount) : "0";
                                      handlePurchaseAdvanceRefChange(idx, 'appliedNow', newVal);
                                    }}
                                    className="h-5 w-5 text-indigo-600 focus:ring-indigo-200 border-gray-300 rounded cursor-pointer transition-transform hover:scale-110"
                                  />
                                  <div className="relative w-full">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 font-bold">₹</span>
                                    <input
                                      type="number" onWheel={(e) => e.currentTarget.blur()}
                                      step="0.01"
                                      value={(ref as any).appliedNow === "0" || !(ref as any).appliedNow ? "" : (ref as any).appliedNow}
                                      placeholder="0.00"
                                      title="Enter partial amount to allocate"
                                      onChange={(e) => handlePurchaseAdvanceRefChange(idx, 'appliedNow', e.target.value)}
                                      className={`w-full pl-5 pr-2 py-1.5 border rounded-[4px] text-xs text-right transition-all outline-none ${isAllocated
                                        ? "bg-white border-indigo-400 shadow-sm ring-1 ring-indigo-100 font-bold text-indigo-950"
                                        : "bg-gray-50/50 border-gray-200 text-gray-400"
                                        }`}
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500 text-sm italic">
                          No unutilized advance payments found for this vendor.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Edit Master */}
                  <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                        <button
                          type="button"
                          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-[4px] hover:bg-gray-50 transition-colors text-sm font-medium shadow-none border border-slate-200"
                        >
                          Terms & Conditions
                        </button>
                        <button
                          type="button"
                          disabled={!party}
                          onClick={openTermsModal}
                          className={`px-4 py-2 rounded-[4px] transition-colors text-sm font-medium shadow-none border border-slate-200 ${!party
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                            }`}
                          title={!party ? "Please select a vendor first" : ""}
                        >
                          Edit Masters
                        </button>
                      </div>

                      <div>
                        <textarea
                          value={purchaseTerms}
                          readOnly
                          className="w-full px-4 py-3 border border-gray-200 rounded-[4px] text-gray-700 resize-none bg-white cursor-default select-none"
                          rows={12}
                          placeholder="Select a vendor to auto-load their terms & conditions, or click Edit Masters to add manually."
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Navigation Button */}

              </div>
            )
          }
          {
            purchaseActiveTab === 'transit' && (
              <div className="space-y-6">
                {/* Top Section: Common to all modes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                  {/* Left Column: Location & Mode */}
                  <div className="space-y-4">
                    {/* Received In / Dispatch From */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Received In
                      </label>
                      <select
                        value={purchaseTransitReceivedIn}
                        onChange={(e) => setPurchaseTransitReceivedIn(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      >
                        <option value="">Select Location</option>
                        {inventoryLocations.length > 0 ? (
                          inventoryLocations.map((loc: any) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>No locations available</option>
                        )}
                      </select>
                    </div>

                    {/* Mode of Transport */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mode of Transport
                      </label>
                      <select
                        value={purchaseTransitMode}
                        onChange={(e) => setPurchaseTransitMode(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                      >
                        <option value="Road">Road</option>
                        <option value="Air">Air</option>
                        <option value="Sea">Sea</option>
                        <option value="Rail">Rail</option>
                      </select>
                    </div>
                  </div>

                  {/* Right Column: Date, Time, Qty */}
                  <div className="space-y-4">
                    {/* Received Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Received Date
                      </label>
                      <input
                        type="date"
                        value={purchaseTransitReceiptDate}
                        onChange={(e) => setPurchaseTransitReceiptDate(e.target.value)}
                        max={getTodayDate()}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    {/* Received Time */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Received Time
                      </label>
                      <input
                        type="time"
                        value={purchaseTransitReceiptTime}
                        onChange={(e) => setPurchaseTransitReceiptTime(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    {/* Removed Received Quantity & UQC as per request */}
                  </div>
                </div>

                {/* Mode Specific Sections: Air, Sea, or Rail */}
                {(purchaseTransitMode === 'Air' || purchaseTransitMode === 'Sea' || purchaseTransitMode === 'Rail') ? (
                  <div className="space-y-6 mt-6">
                    {/* From PORT Section */}
                    <div>
                      <h3 className="text-lg font-bold text-indigo-700 mb-4">From PORT</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                        {/* Col 1: Transporter Details */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Delivery Type
                            </label>
                            <select
                              value={purchaseTransitDeliveryType}
                              onChange={(e) => {
                                setPurchaseTransitDeliveryType(e.target.value);
                                if (e.target.value === 'Courier') {
                                  setPurchaseTransitTransporterId('');
                                  setPurchaseTransitTransporterName('');
                                  setPurchaseTransitVehicleNo('');
                                  setPurchaseTransitLrGrConsignment('');
                                }
                              }}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                            >
                              <option value="Self">Self</option>
                              <option value="Third Party">Third Party</option>
                              <option value="Courier">Courier</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Transporter ID/GSTIN
                            </label>
                            <input
                              type="text"
                              value={purchaseTransitTransporterId}
                              onChange={(e) => setPurchaseTransitTransporterId(e.target.value.toUpperCase())}
                              maxLength={15}
                              placeholder="15-digit GSTIN"
                              disabled={purchaseTransitDeliveryType === 'Courier'}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed uppercase"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Transporter Name
                            </label>
                            <input
                              type="text"
                              value={purchaseTransitTransporterName}
                              onChange={(e) => setPurchaseTransitTransporterName(e.target.value)}
                              disabled={purchaseTransitDeliveryType === 'Courier'}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>

                        {/* Col 2: Vehicle & LR */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Vehicle No.
                            </label>
                            <input
                              type="text"
                              value={purchaseTransitVehicleNo}
                              onChange={(e) => setPurchaseTransitVehicleNo(e.target.value)}
                              disabled={purchaseTransitDeliveryType === 'Courier'}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              LR/GR/Consignment No
                            </label>
                            <input
                              type="text"
                              value={purchaseTransitLrGrConsignment}
                              onChange={(e) => setPurchaseTransitLrGrConsignment(e.target.value)}
                              disabled={purchaseTransitDeliveryType === 'Courier'}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>

                        {/* Col 3: Upload Document */}
                        <div className="flex items-start justify-center">
                          <div className="w-full">
                            <input
                              type="file"
                              id="transit-doc"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setPurchaseTransitDocument(file);
                              }}
                              className="hidden"
                              accept=".jpg,.jpeg,.pdf"
                            />
                            <button
                              type="button"
                              onClick={() => document.getElementById('transit-doc')?.click()}
                              className="w-full h-48 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                            >
                              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                              {purchaseTransitDocument && (
                                <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {purchaseTransitDocument.name}</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Upto PORT (Conditional) */}
                    <div>
                      <h3 className="text-lg font-bold text-indigo-700 mb-4">Upto PORT</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                        {/* AIR / SEA Layout */}
                        {(purchaseTransitMode === 'Air' || purchaseTransitMode === 'Sea') && (
                          <>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading No.</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortBolNo}
                                  onChange={(e) => setPurchaseTransitUptoPortBolNo(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortShippingBillNo}
                                  onChange={(e) => setPurchaseTransitUptoPortShippingBillNo(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                                <input
                                  type="date"
                                  value={purchaseTransitUptoPortShippingBillDate}
                                  onChange={(e) => setPurchaseTransitUptoPortShippingBillDate(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ship/Port Code</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortShipPortCode}
                                  onChange={(e) => setPurchaseTransitUptoPortShipPortCode(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortOriginCity}
                                  onChange={(e) => setPurchaseTransitUptoPortOriginCity(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                  placeholder="City"
                                />
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortOriginCountry}
                                  onChange={(e) => setPurchaseTransitUptoPortOriginCountry(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                  placeholder="Country"
                                />
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading Date</label>
                                <input
                                  type="date"
                                  value={purchaseTransitUptoPortBolDate}
                                  onChange={(e) => setPurchaseTransitUptoPortBolDate(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Vessel/Flight No.</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortVesselFlightNo}
                                  onChange={(e) => setPurchaseTransitUptoPortVesselFlightNo(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Port of Loading</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortPortOfLoading}
                                  onChange={(e) => setPurchaseTransitUptoPortPortOfLoading(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Port of Discharge</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortPortOfDischarge}
                                  onChange={(e) => setPurchaseTransitUptoPortPortOfDischarge(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortFinalDestCity}
                                  onChange={(e) => setPurchaseTransitUptoPortFinalDestCity(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                  placeholder="City"
                                />
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortFinalDestCountry}
                                  onChange={(e) => setPurchaseTransitUptoPortFinalDestCountry(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                  placeholder="Country"
                                />
                              </div>
                            </div>
                          </>
                        )}

                        {/* RAIL Layout */}
                        {purchaseTransitMode === 'Rail' && (
                          <>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading No.</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortBolNo}
                                  onChange={(e) => setPurchaseTransitUptoPortBolNo(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt No.</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortRrNo}
                                  onChange={(e) => setPurchaseTransitUptoPortRrNo(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt Date</label>
                                <input
                                  type="date"
                                  value={purchaseTransitUptoPortRrDate}
                                  onChange={(e) => setPurchaseTransitUptoPortRrDate(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortOriginCity}
                                  onChange={(e) => setPurchaseTransitUptoPortOriginCity(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                  placeholder="City"
                                />
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortOriginCountry}
                                  onChange={(e) => setPurchaseTransitUptoPortOriginCountry(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                  placeholder="Country"
                                />
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading Date</label>
                                <input
                                  type="date"
                                  value={purchaseTransitUptoPortBolDate}
                                  onChange={(e) => setPurchaseTransitUptoPortBolDate(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">FNR No.</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortFnrNo}
                                  onChange={(e) => setPurchaseTransitUptoPortFnrNo(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Station of Loading</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortStationLoading}
                                  onChange={(e) => setPurchaseTransitUptoPortStationLoading(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Station of Discharge</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortStationDischarge}
                                  onChange={(e) => setPurchaseTransitUptoPortStationDischarge(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortFinalDestCity}
                                  onChange={(e) => setPurchaseTransitUptoPortFinalDestCity(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2"
                                  placeholder="City"
                                />
                                <input
                                  type="text"
                                  value={purchaseTransitUptoPortFinalDestCountry}
                                  onChange={(e) => setPurchaseTransitUptoPortFinalDestCountry(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                  placeholder="Country"
                                />
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Default/Road Layout */
                  <div className="space-y-6 mt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                      {/* Left: Transporter Details */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Delivery Type
                          </label>
                          <select
                            value={purchaseTransitDeliveryType}
                            onChange={(e) => {
                              setPurchaseTransitDeliveryType(e.target.value);
                              if (e.target.value === 'Courier') {
                                setPurchaseTransitTransporterId('');
                                setPurchaseTransitTransporterName('');
                                setPurchaseTransitVehicleNo('');
                                setPurchaseTransitLrGrConsignment('');
                              }
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                          >
                            <option value="Self">Self</option>
                            <option value="Third Party">Third Party</option>
                            <option value="Courier">Courier</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Transporter ID/GSTIN
                          </label>
                          <input
                            type="text"
                            value={purchaseTransitTransporterId}
                            onChange={(e) => setPurchaseTransitTransporterId(e.target.value.toUpperCase())}
                            maxLength={15}
                            placeholder="15-digit GSTIN"
                            disabled={purchaseTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed uppercase"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Transporter Name
                          </label>
                          <input
                            type="text"
                            value={purchaseTransitTransporterName}
                            onChange={(e) => setPurchaseTransitTransporterName(e.target.value)}
                            disabled={purchaseTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Vehicle No.
                          </label>
                          <input
                            type="text"
                            value={purchaseTransitVehicleNo}
                            onChange={(e) => setPurchaseTransitVehicleNo(e.target.value)}
                            disabled={purchaseTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            LR/GR/Consignment
                          </label>
                          <input
                            type="text"
                            value={purchaseTransitLrGrConsignment}
                            onChange={(e) => setPurchaseTransitLrGrConsignment(e.target.value)}
                            disabled={purchaseTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Upload Document */}
                      <div className="mt-6 md:mt-0">
                        <input
                          type="file"
                          id="transit-doc-road"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setPurchaseTransitDocument(file);
                          }}
                          className="hidden"
                          accept=".jpg,.jpeg,.pdf"
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('transit-doc-road')?.click()}
                          className="w-full h-full min-h-[160px] border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                        >
                          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                          {purchaseTransitDocument && (
                            <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {purchaseTransitDocument.name}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
        </fieldset>
      </div>
    );
  };

  const renderSalesPurchaseForm = () => {
    if (voucherType === 'Purchase') return renderPurchaseForm();

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div><label className="form-label">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" /></div>
          <div><label className="form-label">Invoice No.</label><input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="form-input" /></div>
          <div><label className="form-label">Party</label><SearchableDropdown value={party} onChange={setParty} options={partyLedgers.map(l => l.name)} placeholder="Select Party" /></div>
        </div>
        <div className="mb-4 p-2 bg-slate-100 rounded-[4px] text-center">
          <p className="text-sm font-semibold text-gray-700">
            Transaction Type: <span className="text-indigo-600">{isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST & SGST)'}</span>
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full"><thead className="bg-slate-100"><tr>
            <th className="table-header">Item</th><th className="table-header w-24">Qty</th><th className="table-header w-28">Rate</th>
            <th className="table-header w-32">Taxable Amt</th>
            {!isInterState && <><th className="table-header w-28">CGST</th><th className="table-header w-28">SGST</th></>}
            {isInterState && <th className="table-header w-28">IGST</th>}
            <th className="table-header w-32">Total</th><th className="w-12"></th></tr></thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item, index) => (<tr key={index}>
                <td><input type="text" list="stock-items-datalist" value={item.name} onChange={e => handleItemChange(index, 'name', e.target.value)} className="table-input" /></td>
                <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.qty} onChange={e => handleItemChange(index, 'qty', e.target.value)} className="table-input text-right" /></td>
                <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.rate} onChange={e => handleItemChange(index, 'rate', e.target.value)} className="table-input text-right" /></td>
                <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.taxableAmount.toFixed(2)} readOnly className="table-input text-right" /></td>
                {!isInterState && <>
                  <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.cgstAmount.toFixed(2)} readOnly className="table-input text-right" /></td>
                  <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.sgstAmount.toFixed(2)} readOnly className="table-input text-right" /></td>
                </>}
                {isInterState && <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.igstAmount.toFixed(2)} readOnly className="table-input text-right" /></td>}
                <td><input type="number" onWheel={(e) => e.currentTarget.blur()} value={item.totalAmount.toFixed(2)} readOnly className="table-input text-right font-semibold" /></td>
                <td><button onClick={() => handleRemoveItemRow(index)} className="text-red-500 hover:text-red-700 p-1"><Icon name="trash" className="w-4 h-4" /></button></td>
              </tr>))}
            </tbody>
          </table>
          <datalist id="stock-items-datalist">{stockItems.map(i => <option key={i.name} value={i.name} />)}</datalist>
        </div>
        <button onClick={handleAddItemRow} className="mt-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center"><Icon name="plus" className="w-4 h-4 mr-1" /> Add Row</button>
        <div className="mt-6 space-y-4">
          <div className="flex justify-between items-start">
            <div className="relative"><label className="form-label">Narration</label><textarea value={narration} onChange={e => setNarration(e.target.value)} className="form-input w-80 pr-10" rows={3}></textarea><button onClick={handleGenerateNarration} disabled={isNarrationLoading} className="absolute top-7 right-2 text-indigo-500 hover:text-slate-700 disabled:text-gray-300" title="Generate Narration with AI">{isNarrationLoading ? <Icon name="spinner" className="w-5 h-5 animate-spin" /> : <Icon name="wand-sparkles" className="w-5 h-5" />}</button></div>
            <div className="w-full max-w-sm space-y-2">
              <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Total Taxable Amount</span><span className="font-semibold text-gray-800">{totalTaxableAmount.toFixed(2)}</span></div>
              {!isInterState && <>
                <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Total CGST</span><span className="font-semibold text-gray-800">{totalCgst.toFixed(2)}</span></div>
                <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Total SGST</span><span className="font-semibold text-gray-800">{totalSgst.toFixed(2)}</span></div>
              </>}
              {isInterState && <div className="flex justify-between items-center"><span className="text-sm text-gray-600">Total IGST</span><span className="font-semibold text-gray-800">{totalIgst.toFixed(2)}</span></div>}
              <div className="flex justify-between items-center border-t pt-2 mt-2"><span className="text-lg font-bold text-gray-800">Grand Total</span><span className="text-lg font-bold text-gray-800">{total.toFixed(2)}</span></div>
            </div>
          </div>

        </div>
      </>
    );
  };

  // New Receipt Voucher Form based on the wireframe design
  const renderReceiptVoucherForm = () => {
    // Get balance for selected ledgers
    const receiveInLedger = ledgers.find(l => l.name === account);
    const receiveFromLedger = ledgers.find(l => l.name === party);
    const receiveInBal = receiveInLedger?.balance || 0;
    const receiveFromBal = receiveFromLedger?.balance || 0;

    return (
      <div className="space-y-6">
        {/* Tab Buttons */}
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setReceiptMode('single')}
            className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${receiptMode === 'single'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
              }`}
          >
            Receipt Voucher - Single
          </button>
          <button
            onClick={() => setReceiptMode('bulk')}
            className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${receiptMode === 'bulk'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
              }`}
          >
            Receipt Voucher - Bulk
          </button>
        </div>

        {/* Single Tab Content */}
        {receiptMode === 'single' && (
          <>
            {/* Top Row: Date, Voucher Type, Voucher Number */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  max={getTodayDate()}
                  onChange={e => handleDateChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
                <select
                  value={selectedReceiptConfig}
                  onChange={(e) => setSelectedReceiptConfig(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select</option>
                  {receiptVoucherConfigs.map((config) => (
                    <option key={config.id} value={config.voucher_name}>
                      {config.voucher_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                <input
                  type="text"
                  value={autoGeneratedVoucherNumber}
                  readOnly
                  className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                />
              </div>
            </div>

            {/* Receive In / Receive From Row with Balances */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Receive In</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SearchableDropdown
                      value={account}
                      onChange={setAccount}
                      options={accountLedgers.map(l => l.name)}
                      placeholder="Select Receive In"
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                    ₹{Math.abs(receiveInBal).toLocaleString('en-IN')} Cr
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receive From</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <SearchableDropdown
                        value={party}
                        onChange={setParty}
                        options={partyLedgers.map(l => l.name)}
                        placeholder="Select Receive From"
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-600 whitespace-nowrap">
                      ₹{Math.abs(receiveFromBal).toLocaleString('en-IN')} Dr
                    </span>
                  </div>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => setShowAdvance(!showAdvance)}
                    className={`px-4 py-2 text-sm font-medium rounded-[4px] transition-colors ${showAdvance
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                      }`}
                  >
                    Advance
                  </button>
                </div>
              </div>
            </div>

            {/* Conditional: Advance Section OR Transaction List */}
            {showAdvance ? (
              /* Advance Receipt Section */
              <div className="border-2 border-gray-200 rounded-[4px] p-6 space-y-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Advance Receipt</h4>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                    <input
                      type="text"
                      value={advanceRefNo}
                      onChange={e => setAdvanceRefNo(e.target.value)}
                      placeholder="Enter reference number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={advanceAmount}

                      onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Transaction List Section */
              <div className="border-2 border-gray-200 rounded-[4px] p-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-4">Pending Transactions</h4>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reference Number</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Amount</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Action</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Receipt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {receiptTransactions.map((transaction) => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-700">{transaction.date}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{transaction.referenceNumber}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 text-right">
                            ₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleReceiveClick(transaction.id)}
                              className="px-3 py-1 text-xs font-medium bg-indigo-100 text-slate-700 border border-indigo-300 rounded hover:bg-indigo-200 transition-colors"
                            >
                              Receive
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={transaction.receipt || ''}

                              onChange={e => handleReceiptChange(transaction.id, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-24 px-2 py-1 text-right border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Total Receipt */}
                <div className="flex justify-end mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-700">Total Receipt</span>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={totalReceipt}
                      readOnly

                      className="w-32 px-3 py-2 text-right border border-gray-300 rounded-[4px] bg-gray-50 text-gray-700 font-semibold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons: Cancel and Post Receipt */}
            <div className="flex justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={handleCancelReceipt}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-[4px] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePostReceipt}
                className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-[4px] hover:bg-indigo-700 transition-colors"
              >
                Post Receipt
              </button>
            </div>
          </>
        )}

        {/* Bulk Tab Content */}
        {receiptMode === 'bulk' && (
          <div className="grid grid-cols-2 gap-6">
            {/* Left Panel */}
            <div className="space-y-6">
              {/* Top Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                  <input
                    type="text"
                    value={autoGeneratedVoucherNumber}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                  />
                </div>
              </div>

              {/* Receive In and Running Balance */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Receive In</label>
                  <select
                    value={account}
                    onChange={e => setAccount(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select</option>
                    {accountLedgers.map(ledger => (
                      <option key={ledger.id} value={ledger.name}>{ledger.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                  <input
                    type="number" onWheel={(e) => e.currentTarget.blur()}
                    value={runningBalance}
                    readOnly

                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500 text-right"
                  />
                </div>
              </div>

              {/* Receive From and Amount Section */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Receive From</label>
                  <div className="space-y-2">
                    {bulkRows.map((row) => (
                      <select
                        key={row.id}
                        value={row.party}
                        onChange={e => {
                          const newRows = bulkRows.map(r => r.id === row.id ? { ...r, party: e.target.value } : r);
                          setBulkRows(newRows);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      >
                        <option value="">Customer Name</option>
                        {partyLedgers.map(ledger => (
                          <option key={ledger.id} value={ledger.name}>{ledger.name}</option>
                        ))}
                      </select>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBulkRows([...bulkRows, { id: Date.now().toString(), party: '', refNo: '', amount: 0 }])}
                    className="mt-2 text-indigo-600 hover:text-slate-700 text-3xl font-bold"
                  >
                    +
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                  <div className="space-y-2">
                    {bulkRows.map((row) => (
                      <input
                        key={`amount-${row.id}`}
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        value={row.amount || ''}

                        onChange={e => {
                          const newRows = bulkRows.map(r => r.id === row.id ? { ...r, amount: parseFloat(e.target.value) || 0 } : r);
                          setBulkRows(newRows);
                        }}
                        placeholder="Receive now/Advance total"
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Total Receipt */}
              <div className="flex justify-center">
                <button className="px-8 py-2 bg-indigo-600 text-white rounded-[4px] font-medium">
                  Total Receipt
                </button>
              </div>

              {/* Posting Note */}
              <div className="bg-indigo-50/50 border-2 border-slate-200 rounded-[4px] p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
                <textarea
                  value={postingNote}
                  onChange={e => setPostingNote(e.target.value)}
                  placeholder="Enter posting note..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={handleCancelReceipt}
                  className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-[4px] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePostReceipt}
                  className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-[4px] hover:bg-indigo-700"
                >
                  Post
                </button>
              </div>
            </div>

            {/* Right Panel - Transaction List */}
            <div className="bg-indigo-600 rounded-[4px] p-6">
              <div className="text-center mb-4">
                <h4 className="text-white font-semibold text-sm">
                  {party || 'Customer Name'} (Whose data is displayed below)
                </h4>
              </div>

              {!showAdvance ? (
                <div className="bg-white rounded-[4px] p-4 min-h-[400px]">
                  {receiptTransactions.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead className="border-b-2 border-gray-300">
                        <tr>
                          <th className="text-left py-2 px-2 font-semibold text-gray-700">Date</th>
                          <th className="text-left py-2 px-2 font-semibold text-gray-700">Invoice No.</th>
                          <th className="text-right py-2 px-2 font-semibold text-gray-700">Amount</th>
                          <th className="text-center py-2 px-2 font-semibold text-gray-700">Receive Now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiptTransactions.map(transaction => (
                          <tr key={transaction.id} className="border-b border-gray-200">
                            <td className="py-3 px-2">
                              <div className="flex items-center gap-2">
                                <input type="checkbox" className="w-4 h-4" />
                                <span>{transaction.date}</span>
                              </div>
                            </td>
                            <td className="py-3 px-2">{transaction.referenceNumber}</td>
                            <td className="py-3 px-2 text-right">{transaction.amount}</td>
                            <td className="py-3 px-2">
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                value={transaction.receipt || ''}

                                onChange={e => handleReceiptChange(transaction.id, parseFloat(e.target.value) || 0)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-center"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="flex items-center justify-center h-full min-h-[350px]">
                      <p className="text-sm text-gray-500 italic text-center">
                        Select a customer to view transactions
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-[4px] p-6 min-h-[400px]">
                  <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Receipt</h5>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <input type="checkbox" className="w-4 h-4" />
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Advance Ref. No.</label>
                        <input
                          type="text"
                          value={advanceRefNo}
                          onChange={e => setAdvanceRefNo(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={advanceAmount || ''}

                          onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowAdvance(!showAdvance)}
                  className={`px-8 py-2 text-sm font-medium rounded-[4px] ${showAdvance
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-700 border-2 border-gray-300'
                    }`}
                >
                  Advance
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Handle "Pay" button click - copies amount to payment field
  const handlePayClick = (transactionId: string) => {
    setPaymentTransactions(prev =>
      prev.map(t =>
        t.id === transactionId ? { ...t, payment: t.amount } : t
      )
    );
  };

  // Handle payment value change
  const handlePaymentChange = (transactionId: string, value: number) => {
    setPaymentTransactions(prev =>
      prev.map(t =>
        t.id === transactionId ? { ...t, payment: value } : t
      )
    );
  };

  // Reset payment form
  const handleCancelPayment = () => {
    setPaymentTransactions(prev => prev.map(t => ({ ...t, payment: 0 })));
    setAccount('');
    setParty('');
    setAdvanceRefNo('');
    setAdvanceAmount(0);
    setShowAdvance(false);
  };

  // Post payment voucher
  const handlePostPayment = () => {
    if (!account || !party) {
      showError('Please select Pay From and Pay To accounts');

      return;
    }
    if (totalPayment <= 0 && !showAdvance) {
      showError('Please enter payment amounts');

      return;
    }
    if (showAdvance && advanceAmount <= 0) {
      showError('Please enter advance amount');

      return;
    }

    // Create payment voucher
    const voucher: PaymentReceiptVoucher = {
      id: '',
      type: 'Payment',
      date,
      account,
      party,
      amount: showAdvance ? advanceAmount : totalPayment,
      narration: showAdvance ? `Advance Payment: ${advanceRefNo}` : `Payment against bills. Total: ${totalPayment}`
    };

    onAddVouchers([voucher]);
    handleCancelPayment();
  };

  const handlePaymentBulkRowChange = (index: number, field: keyof BulkRow, value: string | number) => {
    const newRows = [...bulkRows];
    (newRows[index] as any)[field] = value;
    setBulkRows(newRows);
  };

  const handleAddBulkRow = () => {
    setBulkRows([...bulkRows, { id: Date.now().toString(), party: '', refNo: '', amount: 0 }]);
  };


  // New Payment Voucher Form based on the wireframe design
  const renderPaymentVoucherForm = () => {
    return <PaymentVoucherBulk />;
  };
  const handleCreditNoteItemChange = (index: number, field: string, value: string | number) => {
    const newItems = [...cnItems];
    const item = { ...newItems[index] };

    // Update field
    if (['qty', 'rate', 'foreignRate', 'igst', 'cgst', 'sgst', 'cess', 'taxableValue', 'invoiceValue'].includes(field)) {
      (item as any)[field] = Math.max(0, typeof value === 'string' ? parseFloat(value) || 0 : value);
    } else {
      (item as any)[field] = value;
    }

    // Default qty to 1 if HSN/SAC starts with 99 (Services)
    if (field === 'hsnSac' && value?.toString().startsWith('99')) {
      item.qty = 1;
    }

    // Auto-populate based on Item Code, Name or HSN/SAC
    if (field === 'itemCode' || field === 'itemName' || field === 'hsnSac') {
      // Reset qty whenever item selection changes
      item.qty = 0;

      let selectedItem: any;
      if (field === 'itemCode') {
        selectedItem = allItems.find((i: any) => (i.item_code || i.code) === value);
      } else if (field === 'itemName') {
        selectedItem = allItems.find((i: any) => (i.name || i.item_name) === value);
      } else if (field === 'hsnSac') {
        selectedItem = allItems.find((i: any) => (i.hsn_sac || i.hsn || i.hsn_code || i.hsn_sac_code) === value?.toString());
      }

      if (selectedItem) {
        item.itemCode = selectedItem.item_code || selectedItem.code || item.itemCode;
        item.itemName = selectedItem.name || selectedItem.item_name || item.itemName;
        item.uom = selectedItem.unit || selectedItem.uom || item.uom;
        item.hsnSac = selectedItem.hsn_sac || selectedItem.hsn || selectedItem.hsn_code || selectedItem.hsn_sac_code || item.hsnSac;

        // Default qty to 1 if HSN/SAC starts with 99 (Services)
        if (item.hsnSac?.toString().startsWith('99')) {
          item.qty = 1;
        }
      }
    }

    // Calculations
    const qty = parseFloat(String(item.qty)) || 0;
    const rate = parseFloat(String(item.rate)) || 0;
    const foreignRate = parseFloat(String(item.foreignRate)) || 0;
    const exchangeRate = parseFloat(String(cnExchangeRate)) || 1;
    const isFinancial = String(cnIsFinancial).toLowerCase() === 'yes';

    if (field === 'qty' || field === 'rate' || field === 'foreignRate' || field === 'itemCode' || field === 'itemName' || field === 'hsnSac') {
      if (cnInForeignCurrency === 'Yes') {
        if (field === 'foreignRate' || field === 'qty' || field === 'itemCode' || field === 'itemName' || field === 'hsnSac') {
          item.foreignAmount = qty * foreignRate;
          item.rate = foreignRate * exchangeRate;
          item.taxableValue = isFinancial ? (item.taxableValue || item.financialAmount || 0) : (qty * item.rate);
        } else if (field === 'rate') {
          // If manual INR rate update in CN, it's rare but let's sync
          item.foreignRate = rate / exchangeRate;
          item.foreignAmount = qty * item.foreignRate;
          item.taxableValue = isFinancial ? (item.taxableValue || item.financialAmount || 0) : (qty * rate);
        }
      } else {
        item.taxableValue = isFinancial ? (item.taxableValue || item.financialAmount || 0) : (qty * rate);
      }
    }

    if (field === 'financialAmount' && isFinancial) {
      const numValue = typeof value === 'string' ? parseFloat(value) || 0 : value;
      item.taxableValue = numValue;
      item.qty = 1;
      item.rate = numValue;
    }

    // Auto-calculate Taxable Value (Qty * Rate) and Taxes (INR)
    if (cnReverseGstTcs === 'No') {
      const selectedStockItem = allItems.find((si: any) =>
        ((si.item_code || si.code) || '').toLowerCase() === (item.itemCode || '').toLowerCase() ||
        ((si.name || si.item_name) || '').toLowerCase() === (item.itemName || '').toLowerCase() ||
        ((si.hsn_sac || si.hsn) || '').toString().trim() === (item.hsnSac || '').toString().trim()
      );
      const gstRate = selectedStockItem?.gstRate || selectedStockItem?.gst_rate || 0;
      const cessRate = selectedStockItem?.cessRate || selectedStockItem?.cess_rate || 0;
      const totalTax = item.taxableValue * (gstRate / 100);
      item.cess = totalTax * (cessRate / 100);

      if (cnInputType.includes('IGST')) {
        item.igst = totalTax;
        item.cgst = 0;
        item.sgst = 0;
      } else {
        item.igst = 0;
        item.cgst = totalTax / 2;
        item.sgst = totalTax / 2;
      }
    }

    // update invoice value based on taxes
    const taxableValue = parseFloat(String(item.taxableValue)) || 0;
    const igst = parseFloat(String(item.igst)) || 0;
    const cgst = parseFloat(String(item.cgst)) || 0;
    const sgst = parseFloat(String(item.sgst)) || 0;
    const cess = parseFloat(String(item.cess)) || 0;
    item.invoiceValue = taxableValue + igst + cgst + sgst + cess;

    newItems[index] = item;
    setCnItems(newItems);
  };

  const addCreditNoteItem = () => {
    setCnItems([...cnItems, { id: Date.now().toString(), itemCode: '', itemName: '', hsnSac: '', qty: 0, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: '', financialAmount: 0 }]);
  };

  const removeCreditNoteItem = (id: string) => {
    if (cnItems.length > 1) {
      setCnItems(cnItems.filter(item => item.id !== id));
    } else {
      setCnItems([{ id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: '', financialAmount: 0 }]);
    }
  };

  const renderCreditNoteForm = () => {
    return (
      <div className="space-y-6">
        {/* Tabs Navigation */}
        <div className="flex border-b border-gray-200 overflow-x-auto">
          {(cnInForeignCurrency === 'Yes' ? [
            { id: 'invoice', label: 'Invoice Details' },
            { id: 'items_foreign', label: 'Item & Tax Details (Foreign Currency)' },
            { id: 'items_inr', label: 'Item & Tax Details (INR)' },
            { id: 'due', label: 'Due Details' },
            { id: 'transit', label: 'Transit Details' }
          ] : [
            { id: 'invoice', label: 'Invoice Details' },
            { id: 'items', label: 'Item & Tax Details' },
            { id: 'due', label: 'Due Details' },
            { id: 'transit', label: 'Transit Details' }
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCreditNoteActiveTab(tab.id as any)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${creditNoteActiveTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <fieldset disabled={isReadOnlyMode} className={`p-4 bg-white rounded-[4px] border border-gray-200 min-h-[200px] ${isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}`}>
          {creditNoteActiveTab === 'invoice' && (
            <div className="space-y-6">
              {/* Row 1: Date, Credit Note Series, Credit Note No. */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    DATE <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={cnDate}
                    onChange={(e) => setCnDate(e.target.value)}
                    max={getTodayDate()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    CREDIT NOTE SERIES <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCnConfig}
                    onChange={(e) => setSelectedCnConfig(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  >
                    <option value="">SELECT SERIES</option>
                    {cnVoucherConfigs.map(config => (
                      <option key={config.id} value={config.voucher_name}>{config.voucher_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    CREDIT NOTE NO.
                  </label>
                  <input
                    type="text"
                    value={cnVoucherNumber}
                    onChange={(e) => setCnVoucherNumber(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-white text-gray-900 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Enter invoice number"
                  />
                </div>
              </div>

              {/* Row 2: Customer Name, Branch */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    CUSTOMER NAME <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <SearchableDropdown
                      value={cnCustomerId}
                      onChange={(val) => {
                        setCnCustomerId(val);
                        setCnBranch('');
                        setCnSelectedSalesInvoices([]);
                        setCnItems([
                          { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: null, financialAmount: 0 }
                        ]);
                        setCnGstin('');
                        const customer = richCustomers.find(c => c.id.toString() === val);
                        if (customer) {
                          setCnCustomer(customer.customer_name);
                          // Auto-populate Terms & Conditions
                          const parts: string[] = [];
                          if (customer.credit_period) parts.push(`Credit Period: ${customer.credit_period}`);
                          if (customer.credit_terms) parts.push(`Credit Terms: ${customer.credit_terms}`);
                          if (customer.penalty_terms) parts.push(`Penalty Terms: ${customer.penalty_terms}`);
                          if (customer.delivery_terms) parts.push(`Delivery Terms: ${customer.delivery_terms}`);
                          const warranty = customer.warranty_details || customer.warranty_guarantee_details;
                          if (warranty) parts.push(`Warranty / Guarantee: ${warranty}`);
                          if (customer.force_majeure) parts.push(`Force Majeure: ${customer.force_majeure}`);
                          const dispute = customer.dispute_terms || customer.dispute_redressal_terms;
                          if (dispute) parts.push(`Dispute & Redressal: ${dispute}`);
                          setCnTermsConditions(parts.join('\n\n'));
                          setMasterTermsData(customer);

                          // Don't fetch invoices yet — wait for branch selection
                          setCnSalesInvoicesList([]);
                        } else {
                          setCnCustomer('');
                          setCnSalesInvoicesList([]);
                          setCnTermsConditions('');
                          setMasterTermsData(null);
                        }
                      }}
                      options={richCustomers.map(c => ({
                        value: c.id.toString(),
                        label: c.customer_code ? `${c.customer_name} (${c.customer_code})` : c.customer_name,
                        id: c.id
                      }))}
                      placeholder="SEARCH OR SELECT CUSTOMER"
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={() => setIsCreateVendorModalOpen(true)}
                      className="flex items-center self-start gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 text-[13px] font-medium rounded-[4px] transition-all whitespace-nowrap shadow-sm"
                    >
                      <span className="text-lg leading-none">+</span> ADD NEW CUSTOMER
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    BRANCH <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cnBranch}
                    onChange={(e) => {
                      setCnBranch(e.target.value);
                      setCnSelectedSalesInvoices([]);
                      setCnItems([
                        { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: null, financialAmount: 0 }
                      ]);
                      const customer = richCustomers.find(c => c.id.toString() === cnCustomerId);
                      if (customer && customer.branches) {
                        const branch = customer.branches.find((b: any) => b.branch_reference_name === e.target.value);
                        if (branch) {
                          setCnGstin(branch.gstin || '');
                          setBillFromAddress1(branch.address_line_1 || '');
                          setBillFromAddress2(branch.address_line_2 || '');
                          setBillFromAddress3(branch.address_line_3 || '');
                          setBillFromCity(branch.city || '');
                          setBillFromPincode(branch.pincode || '');
                          setBillFromState(branch.state || '');
                          if (cnSameAsBillFrom) {
                            setShipFromAddress1(branch.address_line_1 || '');
                            setShipFromAddress2(branch.address_line_2 || '');
                            setShipFromAddress3(branch.address_line_3 || '');
                            setShipFromCity(branch.city || '');
                            setShipFromPincode(branch.pincode || '');
                            setShipFromState(branch.state || '');
                          }
                        }
                      }
                      setCnSelectedSalesInvoices([]);
                      if (cnCustomer && e.target.value) {
                        apiService.getCustomerSalesInvoices(cnCustomer, e.target.value)
                          .then(data => {
                            setCnSalesInvoicesList(data || []);
                          })
                          .catch(err => {
                            console.error('Failed to fetch invoices for branch:', err);
                            setCnSalesInvoicesList([]);
                          });
                      } else {
                        setCnSalesInvoicesList([]);
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    disabled={!cnCustomer}
                  >
                    <option value="">{cnCustomer ? 'Select Branch' : 'Select customer first'}</option>
                    {richCustomers.find(c => c.id.toString() === cnCustomerId)?.branches?.map((b: any) => (
                      <option key={b.id} value={b.branch_reference_name}>{b.branch_reference_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={cnGstin}
                    readOnly
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500"
                    placeholder="Enter GSTIN"
                  />
                </div>
              </div>

              {/* Row 3: Sales Invoice No., Sales Invoice Date, Customer's Debit Note No. */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    SALES INVOICE NO. <span className="text-red-500">*</span>
                  </label>
                  <div
                    className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] flex items-center justify-between min-h-[42px] ${cnCustomer && cnBranch ? 'bg-white cursor-pointer' : 'bg-gray-50 cursor-not-allowed opacity-60'
                      }`}
                    onClick={() => {
                      if (!cnCustomer || !cnBranch) return;
                      if (!isCnInvoiceDropdownOpen) {
                        // Always re-fetch when opening dropdown to ensure fresh data
                        apiService.getCustomerSalesInvoices(cnCustomer, cnBranch)
                          .then(data => setCnSalesInvoicesList(data || []))
                          .catch(err => console.error('Failed to fetch invoices:', err));
                      }
                      setIsCnInvoiceDropdownOpen(!isCnInvoiceDropdownOpen);
                    }}
                  >
                    <div className="flex flex-wrap gap-1 max-w-[90%]">
                      {cnSelectedSalesInvoices.length > 0 ? (
                        cnSelectedSalesInvoices.map(no => (
                          <span key={no} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded border border-indigo-100 flex items-center gap-1">
                            {no}
                            <button onClick={(e) => {
                              e.stopPropagation();
                              setCnSelectedSalesInvoices(prev => prev.filter(p => p !== no));
                              setCnItems(prev => {
                                const filtered = prev.filter(item => item.sourcePoNo !== no);
                                return filtered.length > 0 ? filtered : [{ id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: '', financialAmount: 0 }];
                              });
                            }} className="hover:text-red-500 font-bold">×</button>
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400">
                          {!cnCustomer ? 'Select Customer first' : !cnBranch ? 'Select Branch first' : 'Select Multiple Invoices...'}
                        </span>
                      )}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isCnInvoiceDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {isCnInvoiceDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-[4px] shadow-xl max-h-60 overflow-y-auto">
                      {cnSalesInvoicesList.length > 0 ? (
                        cnSalesInvoicesList.map(inv => (
                          <div
                            key={inv.voucher_no}
                            className="px-4 py-2 hover:bg-gray-50 cursor-pointer flex items-center gap-3 border-b border-gray-50 last:border-0"
                            onClick={async () => {
                              const invNo = inv.voucher_no;
                              const alreadySelected = cnSelectedSalesInvoices.includes(invNo);

                              if (alreadySelected) {
                                // Deselect: Remove invoice and its items
                                setCnSelectedSalesInvoices(prev => prev.filter(p => p !== invNo));
                                setCnItems(prev => {
                                  const filtered = prev.filter(item => item.sourcePoNo !== invNo);
                                  return filtered.length > 0 ? filtered : [{ id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '', salesLedger: '', poRate: null, invoiceRate: null, rateMismatch: false, poQty: null, invoiceQty: null, qtyMismatch: false, grnQty: null, sourcePoNo: null, salesInvoiceNo: '', financialAmount: 0 }];
                                });
                              } else {
                                // Select: Add invoice and fetch its items
                                setCnSelectedSalesInvoices(prev => [...prev, invNo]);
                                try {
                                  const fullDetails = await apiService.getSalesInvoiceDetails(invNo);
                                  if (fullDetails && fullDetails.items && fullDetails.items.length > 0) {
                                    const newItems = fullDetails.items.map((item: any, index: number) => {
                                      const qty = parseFloat(item.qty) || 0;
                                      const rate = parseFloat(item.item_rate) || 0;
                                      const exchangeRate = parseFloat(cnExchangeRate) || 1;

                                      // Derive foreign rate and amount based on current exchange rate
                                      const foreignRate = rate / exchangeRate;
                                      const foreignAmount = qty * foreignRate;

                                      return {
                                        id: `${invNo}-${Date.now()}-${index}`,
                                        itemCode: item.item_code || '',
                                        itemName: item.item_name || '',
                                        hsnSac: item.hsn_sac || '',
                                        qty: qty,
                                        uom: item.uom || '',
                                        rate: rate,
                                        foreignRate: foreignRate,
                                        foreignAmount: foreignAmount,
                                        taxableValue: parseFloat(item.taxable_value) || (qty * rate),
                                        igst: parseFloat(item.igst) || 0,
                                        cgst: parseFloat(item.cgst) || 0,
                                        sgst: parseFloat(item.sgst) || 0,
                                        cess: parseFloat(item.cess) || 0,
                                        invoiceValue: parseFloat(item.invoice_value) || 0,
                                        description: item.description || '',
                                        sourcePoNo: invNo, // Track source invoice
                                        salesInvoiceNo: invNo // Add specifically for display
                                      };
                                    });

                                    setCnItems(prev => {
                                      // If the first row is empty, replace it
                                      if (prev.length === 1 && !prev[0].itemName && !prev[0].itemCode) {
                                        return newItems;
                                      }
                                      return [...prev, ...newItems];
                                    });
                                  }
                                } catch (error) {
                                  console.error("Failed to fetch invoice details:", error);
                                }
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={cnSelectedSalesInvoices.includes(inv.voucher_no)}
                              readOnly
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium text-gray-800">{inv.voucher_no}</span>
                              <span className="text-[10px] text-gray-500">{inv.date} • ₹{inv.total_amount || 0}</span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">No invoices found.</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    SALES INVOICE DATE
                  </label>
                  <input
                    type="text"
                    value={cnSalesInvoiceDate}
                    readOnly
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-gray-500"
                    placeholder="Auto-populated"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    CUSTOMER'S DEBIT NOTE NO.
                  </label>
                  <input
                    type="text"
                    value={cnCustomerDebitNoteNo}
                    onChange={(e) => setCnCustomerDebitNoteNo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                    placeholder="From scanned invoice..."
                  />
                </div>
              </div>

              {/* Row 4: Customer's Debit Note Date, GRN Reference No., Upload Document */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    CUSTOMER'S DEBIT NOTE DATE
                  </label>
                  <input
                    type="date"
                    value={cnCustomerDebitNoteDate}
                    onChange={(e) => setCnCustomerDebitNoteDate(e.target.value)}
                    max={getTodayDate()}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    GRN REFERENCE NO.
                  </label>
                  <SearchableDropdown
                    value={cnGrnRefNo === '+ Create GRN' ? '' : cnGrnRefNo}
                    onChange={(val) => {
                      if (val === '+ Create GRN') {
                        setIsCreateGRNModalOpen(true);
                      } else {
                        setCnGrnRefNo(val);
                      }
                    }}
                    options={['+ Create GRN', ...pendingGRNs.map(grn => grn.grn_no)]}
                    placeholder="Select Posted GRN or Create"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase">
                    UPLOAD SUPPORTING DOCUMENT
                  </label>
                  {!cnUploadFile ? (
                    <div className="relative group">
                      <input
                        type="file"
                        id="supporting-doc-cn"
                        onChange={(e) => setCnUploadFile(e.target.files?.[0] || null)}
                        className="hidden"
                        accept=".jpg,.jpeg,.pdf"
                      />
                      <button
                        type="button"
                        onClick={() => document.getElementById('supporting-doc-cn')?.click()}
                        className="w-full h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-all flex items-center justify-center gap-2 shadow-sm uppercase font-medium"
                      >
                        <Icon name="upload" className="w-5 h-5 text-white" />
                        <span className="text-sm">UPLOAD DOCUMENT</span>
                      </button>
                      <p className="text-xs text-gray-400 text-center mt-1">Accepted: JPG, JPEG, PDF</p>
                    </div>
                  ) : (
                    <div className="relative border-2 border-dashed border-indigo-200 rounded-[4px] p-2 bg-indigo-50/30">
                      <div className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-100 group/file">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded">
                          <Icon name="upload" className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate uppercase tracking-tight leading-none">{cnUploadFile.name}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCnUploadFile(null);
                        }}
                        className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full shadow-lg hover:bg-red-700 transition-colors z-10"
                        title="Remove file"
                      >
                        <Icon name="x" className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Bill From / Ship From */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide">
                    Bill From (Full Address)
                  </label>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={billFromAddress1}
                      onChange={(e) => setBillFromAddress1(e.target.value)}
                      placeholder="Address Line 1"
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={billFromAddress2}
                      onChange={(e) => setBillFromAddress2(e.target.value)}
                      placeholder="Address Line 2"
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <input
                      type="text"
                      value={billFromAddress3}
                      onChange={(e) => setBillFromAddress3(e.target.value)}
                      placeholder="Address Line 3"
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={billFromCity}
                        onChange={(e) => setBillFromCity(e.target.value)}
                        placeholder="City"
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <input
                        type="text"
                        value={billFromPincode}
                        onChange={(e) => setBillFromPincode(e.target.value)}
                        placeholder="Pincode"
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 font-bold tracking-wide">
                      Ship From
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={cnSameAsBillFrom}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setCnSameAsBillFrom(checked);
                          if (!checked) {
                            setShipFromAddress1('');
                            setShipFromAddress2('');
                            setShipFromAddress3('');
                            setShipFromCity('');
                            setShipFromPincode('');
                            setShipFromState('');
                            setShipFromCountry('India');
                          }
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-xs font-bold text-gray-500 uppercase">SAME AS BILL TO ADDRESS</span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={shipFromAddress1}
                      onChange={(e) => setShipFromAddress1(e.target.value)}
                      placeholder="Address Line 1"
                      disabled={cnSameAsBillFrom}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] ${cnSameAsBillFrom ? 'bg-gray-50' : 'focus:ring-indigo-500 focus:border-indigo-500'}`}
                    />
                    <input
                      type="text"
                      value={shipFromAddress2}
                      onChange={(e) => setShipFromAddress2(e.target.value)}
                      placeholder="Address Line 2"
                      disabled={cnSameAsBillFrom}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] ${cnSameAsBillFrom ? 'bg-gray-50' : 'focus:ring-indigo-500 focus:border-indigo-500'}`}
                    />
                    <input
                      type="text"
                      value={shipFromAddress3}
                      onChange={(e) => setShipFromAddress3(e.target.value)}
                      placeholder="Address Line 3"
                      disabled={cnSameAsBillFrom}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] ${cnSameAsBillFrom ? 'bg-gray-50' : 'focus:ring-indigo-500 focus:border-indigo-500'}`}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={shipFromCity}
                        onChange={(e) => setShipFromCity(e.target.value)}
                        placeholder="City"
                        disabled={cnSameAsBillFrom}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] ${cnSameAsBillFrom ? 'bg-gray-50' : 'focus:ring-indigo-500 focus:border-indigo-500'}`}
                      />
                      <input
                        type="text"
                        value={shipFromPincode}
                        onChange={(e) => setShipFromPincode(e.target.value)}
                        placeholder="Pincode"
                        disabled={cnSameAsBillFrom}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] ${cnSameAsBillFrom ? 'bg-gray-50' : 'focus:ring-indigo-500 focus:border-indigo-500'}`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Settings Row: Combined into flex row for perfect alignment */}
              <div className="flex flex-row flex-wrap items-end gap-x-12 gap-y-6 bg-gray-50/50 p-6 pt-4 mt-6 rounded-[4px] border border-gray-100">
                <div className="flex flex-col items-start">
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase text-indigo-600 whitespace-nowrap">
                    INPUT TYPE (GST CATEGORY)
                  </label>
                  <div className="flex flex-wrap gap-4">
                    {['IGST', 'CGST & SGST', 'Cess'].map(type => {
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            if (type === 'CGST & SGST') {
                              setCnInForeignCurrency('No');
                              setCnInputType(['CGST & SGST']);
                            } else if (type === 'IGST') {
                              setCnInForeignCurrency('Yes');
                              setCnInputType(['IGST']);

                              // Handle foreign currency conversion if switching to 'Yes'
                              const exRate = parseFloat(String(cnExchangeRate)) || 1;
                              setCnItems(prev => prev.map(item => {
                                const fRate = (parseFloat(String(item.rate)) || 0) / exRate;
                                const q = parseFloat(String(item.qty)) || 0;
                                return {
                                  ...item,
                                  foreignRate: fRate,
                                  foreignAmount: q * fRate
                                };
                              }));
                            } else {
                              setCnInputType(prev =>
                                prev.includes(type) ? prev.filter(p => p !== type) : [...prev, type]
                              );
                            }
                          }}
                          className={`px-6 py-2 rounded-[4px] text-[13px] font-medium transition-all ${cnInputType.includes(type)
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white border border-gray-300 text-gray-600 hover:border-indigo-500 hover:text-indigo-600'
                            }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-4">
                  <div className="flex flex-col items-start">
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase text-indigo-600 whitespace-nowrap">
                      INVOICE IN FOREIGN CURRENCY
                    </label>
                    <div className="flex bg-white p-1 rounded-[4px] border border-gray-300">
                      {['No', 'Yes'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => {
                            setCnInForeignCurrency(opt as any);
                            if (opt === 'Yes') {
                              setCnInputType(['IGST']);
                              const exRate = parseFloat(String(cnExchangeRate)) || 1;
                              setCnItems(prev => prev.map(item => {
                                const fRate = (parseFloat(String(item.rate)) || 0) / exRate;
                                const q = parseFloat(String(item.qty)) || 0;
                                return {
                                  ...item,
                                  foreignRate: fRate,
                                  foreignAmount: q * fRate
                                };
                              }));
                            } else {
                              setCnInputType(['CGST & SGST']);
                            }
                          }}
                          className={`px-8 py-1.5 rounded-[2px] text-[13px] font-medium transition-all ${cnInForeignCurrency === opt
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                  {cnInForeignCurrency === 'Yes' && (
                    <div className="flex flex-col items-start w-full">
                      <label className="block text-sm font-medium text-gray-700 mb-2 font-bold tracking-wide uppercase text-indigo-600 whitespace-nowrap">
                        EXCHANGE RATE (1 FC = INR)
                      </label>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        step="0.0001"
                        value={cnExchangeRate}
                        onChange={(e) => setCnExchangeRate(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 font-bold text-indigo-700 h-[42px]"
                        placeholder="1.00"
                      />
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-start gap-4">
                  <label className="block text-sm font-medium text-gray-700 mb-0 font-bold tracking-wide uppercase text-indigo-600 whitespace-nowrap">
                    It is financial credit note?
                  </label>
                  <div className="flex bg-white p-1 rounded-[4px] border border-gray-300">
                    {['No', 'Yes'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setCnIsFinancial(opt as any)}
                        className={`px-8 py-1.5 rounded-[2px] text-[13px] font-bold transition-all ${String(cnIsFinancial).toLowerCase() === opt.toLowerCase()
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                          }`}
                      >
                        {opt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-start gap-4">
                  <label className="block text-sm font-medium text-gray-700 mb-0 font-bold tracking-wide uppercase text-indigo-600 whitespace-nowrap">
                    Reverse GST (TCS/TDS)
                  </label>
                  <div className="flex bg-white p-1 rounded-[4px] border border-gray-300">
                    {['No', 'Yes'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (opt === 'Yes') {
                            setCnReverseGstTcs('Yes');
                            setCnReverseGstTds('Yes');
                          } else {
                            setCnReverseGstTcs('No');
                            setCnReverseGstTds('No');
                          }
                        }}
                        className={`px-8 py-1.5 rounded-[2px] text-[13px] font-bold transition-all ${(cnReverseGstTcs === opt || cnReverseGstTds === opt)
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                          }`}
                      >
                        {opt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {creditNoteActiveTab === 'items' && (
            <div className="space-y-6">
              {/* Items Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none">
                <table className="w-full text-left">
                  <thead className="bg-indigo-600 text-white">
                    <tr>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[60px]">S. No.</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[140px]">Sales Invoice No.</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[140px]">Item Code</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 min-w-[200px]">Item Name</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[120px]">HSN/SAC</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[80px]">Qty</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[80px]">UQC</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[120px]">Item Rate</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[140px]">Taxable Value</th>
                      {cnInputType.includes('CGST & SGST') ? (
                        <>
                          <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[100px]">CGST</th>
                          <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[100px]">SGST/UTGST</th>
                        </>
                      ) : (
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[120px]">IGST</th>
                      )}
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[100px]">CESS</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500 w-[150px]">Invoice Value</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center w-[60px]">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cnItems.map((row, index) => (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                          <td className="px-2 py-3 text-center text-sm border-r border-gray-200">
                            <div className="flex items-center justify-center gap-2">
                              <input type="checkbox" className="w-4 h-4 rounded text-indigo-600" />
                              {index + 1}
                            </div>
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={row.salesInvoiceNo || row.sourcePoNo || ''}
                              readOnly
                              className="w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center font-medium text-indigo-700 font-bold"
                              placeholder="Auto"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={row.itemCode}
                              onChange={(e) => handleCreditNoteItemChange(index, 'itemCode', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm placeholder:text-gray-300 ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                              placeholder="Code"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <SearchableDropdown
                              value={row.itemName}
                              options={allItems.map(i => i.name || i.item_name)}
                              onChange={(val) => handleCreditNoteItemChange(index, 'itemName', val)}
                              placeholder="Select/Enter item"
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-center text-sm">
                            <input
                              type="text"
                              value={row.hsnSac}
                              onChange={(e) => handleCreditNoteItemChange(index, 'hsnSac', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center placeholder:text-gray-300 ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                              placeholder="HSN"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.qty}
                              onChange={(e) => handleCreditNoteItemChange(index, 'qty', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center font-medium ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={row.uom}
                              onChange={(e) => handleCreditNoteItemChange(index, 'uom', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                              placeholder="Unit"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.rate}
                              onChange={(e) => handleCreditNoteItemChange(index, 'rate', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right font-medium pr-1 ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                              step="0.01"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-right text-sm bg-gray-50/30 pr-2">
                            {(row.taxableValue || 0).toFixed(2)}
                          </td>
                          {cnInputType.includes('CGST & SGST') ? (
                            <>
                              <td className="px-2 py-2 border-r border-gray-200">
                                <input
                                  type="number" onWheel={(e) => e.currentTarget.blur()}
                                  value={row.cgst}
                                  onChange={(e) => handleCreditNoteItemChange(index, 'cgst', e.target.value)}
                                  readOnly={cnReverseGstTcs === 'No'}
                                  className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right pr-1 ${cnReverseGstTcs === 'No' ? 'text-gray-500 cursor-default' : 'text-indigo-600 font-medium'}`}
                                  step="0.01"
                                />
                              </td>
                              <td className="px-2 py-2 border-r border-gray-200">
                                <input
                                  type="number" onWheel={(e) => e.currentTarget.blur()}
                                  value={row.sgst}
                                  onChange={(e) => handleCreditNoteItemChange(index, 'sgst', e.target.value)}
                                  readOnly={cnReverseGstTcs === 'No'}
                                  className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right pr-1 ${cnReverseGstTcs === 'No' ? 'text-gray-500 cursor-default' : 'text-indigo-600 font-medium'}`}
                                  step="0.01"
                                />
                              </td>
                            </>
                          ) : (
                            <td className="px-2 py-2 border-r border-gray-200">
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                value={row.igst}
                                onChange={(e) => handleCreditNoteItemChange(index, 'igst', e.target.value)}
                                readOnly={cnReverseGstTcs === 'No'}
                                className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right pr-1 ${cnReverseGstTcs === 'No' ? 'text-gray-500 cursor-default' : 'text-indigo-600 font-medium'}`}
                                step="0.01"
                              />
                            </td>
                          )}
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.cess}
                              onChange={(e) => handleCreditNoteItemChange(index, 'cess', e.target.value)}
                              readOnly={cnReverseGstTcs === 'No'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right pr-1 ${cnReverseGstTcs === 'No' ? 'text-gray-500 cursor-default' : 'text-indigo-600 font-medium'}`}
                              step="0.01"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-right text-sm font-bold bg-gray-50/50 pr-2">
                            {(row.invoiceValue || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removeCreditNoteItem(row.id)}
                              className="text-red-500 hover:text-red-700 p-1 transition-colors"
                            >
                              <Icon name="trash-2" className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {/* Sales Ledger and Description Row */}
                        <tr className="border-b border-gray-200 bg-gray-50/30">
                          <td colSpan={4} className="px-4 py-2 border-r border-gray-200">
                            <div className="flex items-center gap-3">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Sales Ledger:</label>
                              <div className="flex-1">
                                <SearchableDropdown
                                  value={row.salesLedger}
                                  options={salesLedgerOptions}
                                  onChange={(val) => handleCreditNoteItemChange(index, 'salesLedger', val)}
                                  placeholder="Select Sales Ledger"
                                />
                              </div>
                            </div>
                          </td>
                          <td colSpan={cnInputType.includes('CGST & SGST') ? 10 : 9} className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Ledger Narration:</label>
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => handleCreditNoteItemChange(index, 'description', e.target.value)}
                                placeholder="Enter ledger narration"
                                className="flex-1 border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors"
                              />
                              {String(cnIsFinancial).toLowerCase() === 'yes' && (
                                <div className="flex items-center gap-2 ml-4">
                                  <label className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider whitespace-nowrap">Amount:</label>
                                  <input
                                    type="number" onWheel={(e) => e.currentTarget.blur()}
                                    value={row.financialAmount || row.taxableValue || 0}
                                    onChange={(e) => handleCreditNoteItemChange(index, 'financialAmount', e.target.value)}
                                    placeholder="0.00"
                                    className="w-24 border-b border-indigo-200 focus:border-indigo-500 bg-transparent py-1 text-sm font-bold text-indigo-700 outline-none transition-colors text-right"
                                  />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                    <tr>
                      <td colSpan={8} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-gray-500 border-r border-gray-200">Total Amounts</td>
                      <td className="px-2 py-3 text-center text-[13px] border-r border-gray-200">{calculateCreditNoteTotals().taxableValue.toFixed(2)}</td>
                      {cnInputType.includes('CGST & SGST') ? (
                        <>
                          <td className="px-2 py-3 text-center text-[13px] border-r border-gray-200">{calculateCreditNoteTotals().cgst.toFixed(2)}</td>
                          <td className="px-2 py-3 text-center text-[13px] border-r border-gray-200">{calculateCreditNoteTotals().sgst.toFixed(2)}</td>
                        </>
                      ) : (
                        <td className="px-2 py-3 text-center text-[13px] border-r border-gray-200">{calculateCreditNoteTotals().igst.toFixed(2)}</td>
                      )}
                      <td className="px-2 py-3 text-center text-[13px] border-r border-gray-200">{calculateCreditNoteTotals().cess.toFixed(2)}</td>
                      <td className="px-2 py-3 text-center text-[13px] text-indigo-700 font-bold border-r border-gray-200">{calculateCreditNoteTotals().invoiceValue.toFixed(2)}</td>
                      <td className="bg-gray-50"></td>
                    </tr>
                  </tfoot>
                </table>

                <div className="p-3 bg-white border-t border-gray-100 flex justify-start">
                  <button
                    onClick={addCreditNoteItem}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] shadow-sm transition-all text-xs font-semibold uppercase tracking-widest"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Add Item Row</span>
                  </button>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end pt-4">
                <div className="w-full max-w-md space-y-3 p-6 bg-gray-50/80 rounded-[4px] border border-gray-200 shadow-sm backdrop-blur-sm">
                  <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase font-bold tracking-[0.2em] mb-1">
                    <span>Summary</span>
                    <span>Amounts in INR</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 font-medium">
                    <span className="uppercase tracking-wider">Subtotal (Taxable)</span>
                    <span className="text-gray-900 font-bold leading-none">{calculateCreditNoteTotals().taxableValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 font-medium pt-2 border-t border-gray-200/50">
                    <span className="uppercase tracking-wider">Total Tax Applied</span>
                    <span className="text-gray-900 font-bold leading-none">
                      {(calculateCreditNoteTotals().igst + calculateCreditNoteTotals().cgst + calculateCreditNoteTotals().sgst + calculateCreditNoteTotals().cess).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold text-indigo-600 uppercase tracking-[0.15em] pt-5 mt-2 border-t-2 border-indigo-200/50">
                    <span>Credit Amount</span>
                    <span className="text-xl font-black">₹{calculateCreditNoteTotals().invoiceValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {creditNoteActiveTab === 'items_foreign' && (
            <div className="space-y-6">

              {/* Floating Exchange Rate Input */}
              <div className="flex justify-end">
                <div className="flex items-center gap-2 bg-white px-4 py-2 border border-slate-200 rounded-[4px] shadow-none">
                  <span className="text-sm font-medium text-gray-700">1 Foreign Currency =</span>
                  <input
                    type="text"
                    value={cnExchangeRate}
                    onChange={(e) => {
                      const exRateVal = e.target.value;
                      setCnExchangeRate(exRateVal);

                      // Auto-update all INR rates based on the new exchange rate
                      const exRateNum = parseFloat(exRateVal) || 1;
                      const updatedItems = cnItems.map(item => {
                        const fRate = parseFloat(item.foreignRate?.toString() || '0') || 0;
                        const qty = parseFloat(item.qty.toString()) || 0;

                        const newRate = fRate * exRateNum;
                        const newTaxable = qty * newRate;

                        const selectedStockItem = allItems.find((si: any) =>
                          (si.item_code || si.code) === item.itemCode ||
                          (si.name || si.item_name) === item.itemName
                        );
                        const gstRate = selectedStockItem?.gstRate || selectedStockItem?.gst_rate || 0;
                        const cessRate = selectedStockItem?.cessRate || selectedStockItem?.cess_rate || 0;
                        const totalTax = newTaxable * (gstRate / 100);
                        const newCess = totalTax * (cessRate / 100);

                        let igst = 0, cgst = 0, sgst = 0;
                        if (cnInputType.includes('IGST')) {
                          igst = totalTax;
                        } else {
                          cgst = totalTax / 2;
                          sgst = totalTax / 2;
                        }

                        return {
                          ...item,
                          rate: newRate,
                          taxableValue: newTaxable,
                          igst,
                          cgst,
                          sgst,
                          cess: newCess,
                          invoiceValue: newTaxable + igst + cgst + sgst + newCess
                        };
                      });
                      setCnItems(updatedItems);
                    }}
                    className="w-24 border-b-2 border-gray-300 focus:border-indigo-500 focus:outline-none px-2 py-1 text-center font-medium text-indigo-600"
                    placeholder="Rate"
                  />
                  <span className="text-sm font-medium text-gray-700">INR</span>
                </div>
              </div>

              {/* Items Table (Foreign) */}
              <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none">
                <table className="w-full text-left">
                  <thead className="bg-[#5c56d6] text-white">
                    <tr>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[60px]">S. No.</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[140px]">Sales Invoice No.</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[140px]">Item Code</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] min-w-[200px]">Item Name</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[80px]">Qty</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[80px]">UQC</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[120px]">Rate (FC)</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[140px]">Amount (FC)</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center w-[60px]">Delete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cnItems.map((row, index) => (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                          <td className="px-2 py-3 text-center text-sm border-r border-gray-200">
                            {index + 1}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={row.salesInvoiceNo || row.sourcePoNo || ''}
                              readOnly
                              className="w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center font-medium text-indigo-700"
                              placeholder="Auto"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 uppercase font-mono text-[11px] text-gray-500">
                            {row.itemCode || '-'}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <SearchableDropdown
                              value={row.itemName}
                              options={allItems.map(i => i.name || i.item_name)}
                              onChange={(val) => handleCreditNoteItemChange(index, 'itemName', val)}
                              placeholder="Select item"
                              disabled={cnIsFinancial === 'Yes'}
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.qty}
                              onChange={(e) => handleCreditNoteItemChange(index, 'qty', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center font-medium ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={row.uom}
                              onChange={(e) => handleCreditNoteItemChange(index, 'uom', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-center ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                              placeholder="Unit"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.foreignRate}
                              onChange={(e) => handleCreditNoteItemChange(index, 'foreignRate', e.target.value)}
                              disabled={String(cnIsFinancial).toLowerCase() === 'yes'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right font-bold text-indigo-700 pr-1 ${String(cnIsFinancial).toLowerCase() === 'yes' ? 'opacity-50 cursor-not-allowed bg-gray-50/50' : ''}`}
                              step="0.01"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-right text-sm font-bold bg-indigo-50/20 pr-2">
                            {(row.foreignAmount || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              onClick={() => removeCreditNoteItem(row.id)}
                              className="text-red-500 hover:text-red-700 p-1 transition-colors"
                            >
                              <Icon name="trash-2" className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                        {/* Sales Ledger and Description Row (Foreign Currency Tab) */}
                        <tr className="border-b border-gray-200 bg-gray-50/20">
                          <td colSpan={4} className="px-4 py-2 border-r border-gray-200">
                            <div className="flex items-center gap-3">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Sales Ledger:</label>
                              <div className="flex-1">
                                <SearchableDropdown
                                  value={row.salesLedger}
                                  options={salesLedgerOptions}
                                  onChange={(val) => handleCreditNoteItemChange(index, 'salesLedger', val)}
                                  placeholder="Select Sales Ledger"
                                  disabled={cnIsFinancial === 'Yes'}
                                />
                              </div>
                            </div>
                          </td>
                          <td colSpan={5} className="px-4 py-2">
                            <div className="flex items-center gap-3">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Ledger Narration:</label>
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => handleCreditNoteItemChange(index, 'description', e.target.value)}
                                placeholder="Enter ledger narration"
                                className="flex-1 border-b border-gray-200 focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors"
                              />

                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                    <tr>
                      <td colSpan={7} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-gray-500 border-r border-gray-200">Total Foreign Amount</td>
                      <td className="px-2 py-3 text-center text-[13px] text-indigo-700 font-bold border-r border-gray-200">
                        {cnItems.reduce((sum, item) => sum + (item.foreignAmount || 0), 0).toFixed(2)}
                      </td>
                      <td className="bg-gray-50"></td>
                    </tr>
                  </tfoot>
                </table>

                <div className="p-3 bg-white border-t border-gray-100 flex justify-start">
                  <button
                    onClick={addCreditNoteItem}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] shadow-sm transition-all text-xs font-semibold uppercase tracking-widest"
                  >
                    <Icon name="plus" className="w-4 h-4" />
                    <span>Add Item Row</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {creditNoteActiveTab === 'items_inr' && (
            <div className="space-y-6">
              {/* Items Table (INR calculated from Foreign) */}
              <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none">
                <table className="w-full text-left">
                  <thead className="bg-[#5c56d6] text-white">
                    <tr>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[60px]">S. No.</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] min-w-[200px]">Item Name</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[80px]">Qty</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[120px]">Conv. Rate (INR)</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[140px]">Taxable Value</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[120px]">IGST</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[100px]">CESS</th>
                      <th className="px-3 py-3 text-xs font-semibold text-center border-r border-[#4b45bd] w-[150px]">Invoice Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cnItems.map((row, index) => (
                      <React.Fragment key={row.id}>
                        <tr className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                          <td className="px-2 py-3 text-center text-sm border-r border-gray-200">
                            {index + 1}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-sm font-medium">
                            {row.itemName || '-'}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-center text-sm">
                            {row.qty}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-right text-sm text-gray-600 bg-gray-50/50 pr-2">
                            {(row.rate || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-right text-sm font-bold pr-2">
                            {(row.taxableValue || 0).toFixed(2)}
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 pr-1">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.igst}
                              onChange={(e) => handleCreditNoteItemChange(index, 'igst', e.target.value)}
                              readOnly={cnReverseGstTcs === 'No'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right pr-1 ${cnReverseGstTcs === 'No' ? 'text-gray-500 cursor-default' : 'text-indigo-600 font-medium'}`}
                              step="0.01"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 pr-1">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={row.cess}
                              onChange={(e) => handleCreditNoteItemChange(index, 'cess', e.target.value)}
                              readOnly={cnReverseGstTcs === 'No'}
                              className={`w-full border-none bg-transparent focus:ring-0 p-0 text-sm text-right pr-1 ${cnReverseGstTcs === 'No' ? 'text-gray-500 cursor-default' : 'text-indigo-600 font-medium'}`}
                              step="0.01"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200 text-right text-sm font-black text-indigo-700 bg-indigo-50/10 pr-2">
                            {(row.invoiceValue || 0).toFixed(2)}
                          </td>
                        </tr>
                        {String(cnIsFinancial).toLowerCase() === 'yes' && (
                          <tr className="border-b border-gray-200 bg-indigo-50/30">
                            <td colSpan={8} className="px-4 py-2">
                              <div className="flex justify-end items-center gap-3 pr-2">
                                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider whitespace-nowrap">Amount (INR):</label>
                                <input
                                  type="number" onWheel={(e) => e.currentTarget.blur()}
                                  value={row.financialAmount || row.taxableValue || 0}
                                  onChange={(e) => handleCreditNoteItemChange(index, 'financialAmount', e.target.value)}
                                  placeholder="0.00"
                                  className="w-32 border-b-2 border-indigo-300 focus:border-indigo-600 bg-white py-1 px-2 text-sm font-black text-indigo-700 outline-none transition-colors text-right shadow-sm rounded-t-[4px]"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#f8fafc] font-bold border-t border-gray-200">
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-right text-[10px] uppercase tracking-widest text-gray-500 border-r border-gray-200">Total (INR)</td>
                      <td className="px-2 py-3 text-right text-[13px] border-r border-gray-200 pr-2">{calculateCreditNoteTotals().taxableValue.toFixed(2)}</td>
                      <td className="px-2 py-3 text-right text-[13px] border-r border-gray-200 pr-2">{calculateCreditNoteTotals().igst.toFixed(2)}</td>
                      <td className="px-2 py-3 text-right text-[13px] border-r border-gray-200 pr-2">{calculateCreditNoteTotals().cess.toFixed(2)}</td>
                      <td className="px-2 py-3 text-right text-[13px] text-indigo-700 bg-indigo-50/30 pr-2">{calculateCreditNoteTotals().invoiceValue.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end pt-4">
                <div className="w-full max-w-md space-y-3 p-6 bg-gray-50/80 rounded-[4px] border border-gray-200 shadow-sm backdrop-blur-sm">
                  <div className="flex justify-between items-center text-[10px] text-gray-400 uppercase font-bold tracking-[0.2em] mb-1">
                    <span>INR SUMMARY</span>
                    <span>Conv Rate: {cnExchangeRate}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 font-medium">
                    <span className="uppercase tracking-wider">Subtotal (INR)</span>
                    <span className="text-gray-900 font-bold leading-none">{calculateCreditNoteTotals().taxableValue.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600 font-medium pt-2 border-t border-gray-200/50">
                    <span className="uppercase tracking-wider">Total Tax Applied (IGST)</span>
                    <span className="text-gray-900 font-bold leading-none">
                      {(calculateCreditNoteTotals().igst + calculateCreditNoteTotals().cess).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm font-bold text-indigo-600 uppercase tracking-[0.15em] pt-5 mt-2 border-t-2 border-indigo-200/50">
                    <span>Credit Amount (INR)</span>
                    <span className="text-xl font-black">₹{calculateCreditNoteTotals().invoiceValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {creditNoteActiveTab === 'due' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
              {/* Tax Summary Table (Matches Purchase Style) */}
              <div className="border border-gray-300 rounded-[4px] overflow-hidden shadow-none bg-white">
                <table className="w-full">
                  <thead className="bg-[#f1f5f9] border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 border-r border-gray-200">Taxable Value</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 border-r border-gray-200">IGST</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 border-r border-gray-200">CGST</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500 border-r border-gray-200">SGST/UTGST</th>
                      <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest text-gray-500">Cess</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-4 py-4 border-r border-gray-100 text-center text-sm font-bold text-gray-900 font-mono">
                        {calculateCreditNoteTotals().taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 border-r border-gray-100 text-center text-sm font-bold text-indigo-700 font-mono">
                        {calculateCreditNoteTotals().igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 border-r border-gray-100 text-center text-sm font-bold text-indigo-700 font-mono">
                        {calculateCreditNoteTotals().cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 border-r border-gray-100 text-center text-sm font-bold text-indigo-700 font-mono">
                        {calculateCreditNoteTotals().sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-4 text-center text-sm font-bold text-indigo-700 font-mono">
                        {calculateCreditNoteTotals().cess.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1: Financials & Posting Note */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Invoice Value</label>
                    <input
                      type="text"
                      readOnly
                      value={calculateCreditNoteTotals().invoiceValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] bg-gray-50/80 text-right font-black text-gray-900 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">GST TDS/TCS Adjustment</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={cnGstTdsTcsAmount}
                      onChange={(e) => setCnGstTdsTcsAmount(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] bg-white text-right font-bold text-indigo-600 font-mono text-sm focus:ring-1 focus:ring-indigo-500 transition-all"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">TDS/TCS under Income Tax</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={cnIncomeTaxTdsTcsAmount}
                      onChange={(e) => setCnIncomeTaxTdsTcsAmount(e.target.value)}
                      readOnly={cnReverseIncomeTaxTcs === 'No' && cnReverseIncomeTaxTds === 'No'}
                      className={`w-full px-4 py-2.5 border border-gray-300 rounded-[4px] text-right font-bold font-mono text-sm focus:ring-1 focus:ring-indigo-500 transition-all ${(cnReverseIncomeTaxTcs === 'No' && cnReverseIncomeTaxTds === 'No') ? 'bg-gray-50/80 text-gray-400' : 'bg-white text-indigo-600'}`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Gross Amount Due</label>
                    <input
                      type="text"
                      readOnly
                      value={(
                        calculateCreditNoteTotals().invoiceValue
                        - (parseFloat(cnGstTdsTcsAmount) || 0)
                        - (parseFloat(cnIncomeTaxTdsTcsAmount) || 0)
                      ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] bg-gray-50/80 text-right font-black text-gray-900 font-mono text-sm shadow-inner"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Sales Invoice Amt Applied</label>
                    <input
                      type="text"
                      readOnly
                      value={cnAppliedInvoices.reduce((sum, inv) => sum + (parseFloat(inv.appliedAmount) || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] bg-gray-50/80 text-right font-black text-gray-900 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 text-indigo-600">Net Amount Due</label>
                    <input
                      type="text"
                      readOnly
                      value={(
                        (calculateCreditNoteTotals().invoiceValue - (parseFloat(cnGstTdsTcsAmount) || 0) - (parseFloat(cnIncomeTaxTdsTcsAmount) || 0))
                        - cnAppliedInvoices.reduce((sum, inv) => sum + (parseFloat(inv.appliedAmount) || 0), 0)
                      ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      className="w-full px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-[4px] text-right font-black text-indigo-900 font-mono text-xl shadow-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Posting Note:</label>
                    <textarea
                      value={cnPostingNote}
                      onChange={(e) => setCnPostingNote(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-[4px] bg-white text-xs h-24 resize-none placeholder:text-gray-300 focus:ring-1 focus:ring-indigo-500 transition-all font-medium"
                      placeholder="Enter posting notes..."
                    />
                  </div>
                </div>

                {/* Column 2: Reversals & Sales Invoice Grid */}
                <div className="flex flex-col h-full border border-gray-300 rounded-[4px] bg-[#f9fafb] p-4 space-y-6 shadow-none">
                  {/* Reversal Toggles (Integrated) */}
                  <div className="bg-white p-4 rounded-[4px] border border-indigo-100 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reverse IT (TCS/TDS)</span>
                      <div className="flex bg-gray-100 p-1 rounded-[4px] border border-gray-200">
                        {['No', 'Yes'].map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              if (opt === 'Yes') {
                                setCnReverseIncomeTaxTcs('Yes');
                                setCnReverseIncomeTaxTds('Yes');
                              } else {
                                setCnReverseIncomeTaxTcs('No');
                                setCnReverseIncomeTaxTds('No');
                              }
                            }}
                            className={`px-4 py-1 rounded-[3px] text-[9px] font-black uppercase tracking-tighter transition-all ${(cnReverseIncomeTaxTcs === opt || cnReverseIncomeTaxTds === opt)
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'text-gray-400 hover:text-gray-600'
                              }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 flex-1 flex flex-col">
                    <div className="grid grid-cols-[110px_1fr_110px_150px] gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-gray-200 pb-2">
                      <div className="text-center">Date</div>
                      <div className="text-center">Reference No.</div>
                      <div className="text-right pr-2">Available</div>
                      <div className="text-center">Allocated Amt</div>
                    </div>

                    <div className="max-h-[500px] overflow-y-auto space-y-2 flex-1 scrollbar-thin scrollbar-thumb-indigo-200">
                      {cnSelectedSalesInvoices.length > 0 ? (
                        cnSelectedSalesInvoices.map((invNo, idx) => {
                          const invoiceDetail = cnSalesInvoicesList.find(i => i.invoice_no === invNo);
                          const appliedItem = cnAppliedInvoices.find(a => a.invoiceNo === invNo) || { appliedAmount: '0.00' };
                          const isAllocated = parseFloat(appliedItem.appliedAmount) > 0;

                          return (
                            <div key={invNo} className={`grid grid-cols-[110px_1fr_110px_150px] gap-2 items-center text-sm py-2.5 border-b border-indigo-50/50 hover:bg-white transition-all group rounded-sm px-1 ${isAllocated ? 'bg-indigo-50/20' : ''}`}>
                              <div className="text-center text-gray-400 text-[10px] font-bold font-mono">{invoiceDetail?.date || '-'}</div>
                              <div className="font-bold text-slate-700 truncate px-1 text-[11px] group-hover:text-indigo-600 text-center" title={invNo}>{invNo}</div>
                              <div className="text-right pr-2 font-black text-gray-900 font-mono text-[11px]">
                                {Number(invoiceDetail?.balance_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="relative w-full">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 font-bold">₹</span>
                                  <input
                                    type="number" onWheel={(e) => e.currentTarget.blur()}
                                    step="0.01"
                                    value={appliedItem.appliedAmount === '0.00' ? '' : appliedItem.appliedAmount}
                                    placeholder="0.00"
                                    onChange={(e) => {
                                      const newApplied = [...cnAppliedInvoices];
                                      const index = newApplied.findIndex(a => a.invoiceNo === invNo);
                                      if (index > -1) {
                                        newApplied[index].appliedAmount = e.target.value;
                                      } else {
                                        newApplied.push({ invoiceNo: invNo, appliedAmount: e.target.value });
                                      }
                                      setCnAppliedInvoices(newApplied);
                                    }}
                                    className={`w-full pl-5 pr-2 py-1.5 border rounded-[4px] text-xs text-right font-black font-mono transition-all outline-none ${isAllocated
                                      ? "border-indigo-400 bg-white ring-2 ring-indigo-50 text-indigo-700 shadow-sm"
                                      : "border-gray-200 bg-white/50 text-gray-400 hover:border-gray-300"
                                      }`}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center py-20 bg-white/40 rounded-lg border border-dashed border-gray-200">
                          <Icon name="search" className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-300">No Invoices Selected</p>
                          <p className="text-[9px] text-gray-300 italic mt-1">Please select invoices in standard tab</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Column 3: Terms & Edit Master */}
                <div className="border border-gray-200 rounded-[4px] p-6 bg-slate-50 shadow-none flex flex-col space-y-6">
                  <div className="flex items-center justify-between pb-4 border-b border-gray-200">
                    <span className="text-[11px] font-black uppercase tracking-widest text-gray-600">Terms & Conditions</span>
                    <button
                      type="button"
                      disabled={!cnCustomer}
                      onClick={openTermsModal}
                      className={`px-4 py-2 rounded-[4px] transition-colors text-sm font-medium shadow-none border border-slate-200 ${!cnCustomer
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
                        }`}
                      title={!cnCustomer ? "Please select a customer first" : ""}
                    >
                      Edit Masters
                    </button>
                  </div>

                  <div className="flex-1 bg-white border border-gray-200 rounded-[4px] p-4 flex flex-col border-dashed group hover:border-indigo-300 transition-colors">
                    <p className="text-[10px] text-slate-400 italic mb-4 font-medium flex items-center gap-2">
                      <Icon name="info" className="w-3.5 h-3.5" />
                      Select a customer to auto-load their terms & conditions, or click Edit Masters to add manually.
                    </p>
                    <textarea
                      value={cnTermsConditions}
                      readOnly
                      className="flex-1 w-full p-2 text-xs text-gray-700 resize-none outline-none font-medium bg-transparent border-none placeholder:text-gray-200"
                      placeholder="View or edit specific credit terms here..."
                    />
                  </div>

                  <div className="bg-white/60 p-4 rounded-lg flex items-center gap-4 border border-slate-200/50 grayscale opacity-80">
                    <div className="bg-slate-800 p-2 rounded-lg">
                      <Icon name="file-text" className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed font-semibold italic">
                      This credit note value will be reflected in the customer ledger for adjustment.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {creditNoteActiveTab === 'transit' && (
            <div className="space-y-6">
              {/* Top Section: Common to all modes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                {/* Left Column: Location & Mode */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Received In
                    </label>
                    <select
                      value={cnTransitReceivedIn}
                      onChange={(e) => setCnTransitReceivedIn(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm"
                    >
                      <option value="">Select Location</option>
                      {inventoryLocations.length > 0 ? (
                        inventoryLocations.map((loc: any) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>No locations available</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mode of Transport
                    </label>
                    <select
                      value={cnTransitMode}
                      onChange={(e) => setCnTransitMode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm"
                    >
                      <option value="Road">Road</option>
                      <option value="Air">Air</option>
                      <option value="Sea">Sea</option>
                      <option value="Rail">Rail</option>
                    </select>
                  </div>
                </div>

                {/* Right Column: Date & Time */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Received Date
                    </label>
                    <input
                      type="date"
                      value={cnTransitReceiptDate}
                      onChange={(e) => setCnTransitReceiptDate(e.target.value)}
                      max={getTodayDate()}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Received Time
                    </label>
                    <input
                      type="time"
                      value={cnTransitReceiptTime}
                      onChange={(e) => setCnTransitReceiptTime(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Mode Specific Sections: Air, Sea, or Rail */}
              {(cnTransitMode === 'Air' || cnTransitMode === 'Sea' || cnTransitMode === 'Rail') ? (
                <div className="space-y-6 mt-6">
                  {/* From PORT Section */}
                  <div>
                    <h3 className="text-lg font-bold text-indigo-700 mb-4">From PORT</h3>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                      {/* Col 1: Transporter Details */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Delivery Type
                          </label>
                          <select
                            value={cnTransitDeliveryType}
                            onChange={(e) => {
                              setCnTransitDeliveryType(e.target.value);
                              if (e.target.value === 'Courier') {
                                setCnTransitTransporterId('');
                                setCnTransitTransporterName('');
                                setCnTransitVehicleNo('');
                                setCnTransitLrGrConsignment('');
                              }
                            }}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm"
                          >
                            <option value="Self">Self</option>
                            <option value="Third Party">Third Party</option>
                            <option value="Courier">Courier</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Transporter ID/GSTIN
                          </label>
                          <input
                            type="text"
                            value={cnTransitTransporterId}
                            onChange={(e) => setCnTransitTransporterId(e.target.value.toUpperCase())}
                            maxLength={15}
                            placeholder="15-digit GSTIN"
                            disabled={cnTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed uppercase text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Transporter Name
                          </label>
                          <input
                            type="text"
                            value={cnTransitTransporterName}
                            onChange={(e) => setCnTransitTransporterName(e.target.value)}
                            disabled={cnTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                          />
                        </div>
                      </div>

                      {/* Col 2: Vehicle & LR */}
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Vehicle No.
                          </label>
                          <input
                            type="text"
                            value={cnTransitVehicleNo}
                            onChange={(e) => setCnTransitVehicleNo(e.target.value)}
                            disabled={cnTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            LR/GR/Consignment No
                          </label>
                          <input
                            type="text"
                            value={cnTransitLrGrConsignment}
                            onChange={(e) => setCnTransitLrGrConsignment(e.target.value)}
                            disabled={cnTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                          />
                        </div>
                      </div>

                      {/* Col 3: Upload Document */}
                      <div className="flex items-start justify-center">
                        <div className="w-full">
                          <input
                            type="file"
                            id="cn-transit-doc"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setCnTransitDocument(file);
                            }}
                            className="hidden"
                            accept=".jpg,.jpeg,.pdf"
                          />
                          <button
                            type="button"
                            onClick={() => document.getElementById('cn-transit-doc')?.click()}
                            className="w-full h-48 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                          >
                            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                            {cnTransitDocument && (
                              <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {cnTransitDocument.name}</span>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Upto PORT Section */}
                  <div>
                    <h3 className="text-lg font-bold text-indigo-700 mb-4">Upto PORT</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                      {/* AIR / SEA Layout */}
                      {(cnTransitMode === 'Air' || cnTransitMode === 'Sea') && (
                        <>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading No.</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortBolNo}
                                onChange={(e) => setCnTransitUptoPortBolNo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortShippingBillNo}
                                onChange={(e) => setCnTransitUptoPortShippingBillNo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                              <input
                                type="date"
                                value={cnTransitUptoPortShippingBillDate}
                                onChange={(e) => setCnTransitUptoPortShippingBillDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Ship/Port Code</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortShipPortCode}
                                onChange={(e) => setCnTransitUptoPortShipPortCode(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortOriginCity}
                                onChange={(e) => setCnTransitUptoPortOriginCity(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2 text-sm"
                                placeholder="City"
                              />
                              <input
                                type="text"
                                value={cnTransitUptoPortOriginCountry}
                                onChange={(e) => setCnTransitUptoPortOriginCountry(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                placeholder="Country"
                              />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading Date</label>
                              <input
                                type="date"
                                value={cnTransitUptoPortBolDate}
                                onChange={(e) => setCnTransitUptoPortBolDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Vessel/Flight No.</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortVesselFlightNo}
                                onChange={(e) => setCnTransitUptoPortVesselFlightNo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Port of Loading</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortPortOfLoading}
                                onChange={(e) => setCnTransitUptoPortPortOfLoading(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Port of Discharge</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortPortOfDischarge}
                                onChange={(e) => setCnTransitUptoPortPortOfDischarge(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortFinalDestCity}
                                onChange={(e) => setCnTransitUptoPortFinalDestCity(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2 text-sm"
                                placeholder="City"
                              />
                              <input
                                type="text"
                                value={cnTransitUptoPortFinalDestCountry}
                                onChange={(e) => setCnTransitUptoPortFinalDestCountry(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                placeholder="Country"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      {/* RAIL Layout */}
                      {cnTransitMode === 'Rail' && (
                        <>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading No.</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortBolNo}
                                onChange={(e) => setCnTransitUptoPortBolNo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt No.</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortRrNo}
                                onChange={(e) => setCnTransitUptoPortRrNo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt Date</label>
                              <input
                                type="date"
                                value={cnTransitUptoPortRrDate}
                                onChange={(e) => setCnTransitUptoPortRrDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortOriginCity}
                                onChange={(e) => setCnTransitUptoPortOriginCity(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2 text-sm"
                                placeholder="City"
                              />
                              <input
                                type="text"
                                value={cnTransitUptoPortOriginCountry}
                                onChange={(e) => setCnTransitUptoPortOriginCountry(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                placeholder="Country"
                              />
                            </div>
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Bill of Lading Date</label>
                              <input
                                type="date"
                                value={cnTransitUptoPortBolDate}
                                onChange={(e) => setCnTransitUptoPortBolDate(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">FNR No.</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortFnrNo}
                                onChange={(e) => setCnTransitUptoPortFnrNo(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Station of Loading</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortStationLoading}
                                onChange={(e) => setCnTransitUptoPortStationLoading(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Station of Discharge</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortStationDischarge}
                                onChange={(e) => setCnTransitUptoPortStationDischarge(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                              <input
                                type="text"
                                value={cnTransitUptoPortFinalDestCity}
                                onChange={(e) => setCnTransitUptoPortFinalDestCity(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 mb-2 text-sm"
                                placeholder="City"
                              />
                              <input
                                type="text"
                                value={cnTransitUptoPortFinalDestCountry}
                                onChange={(e) => setCnTransitUptoPortFinalDestCountry(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                placeholder="Country"
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Default/Road Layout */
                <div className="space-y-6 mt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                    {/* Left: Transporter Details */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Delivery Type
                        </label>
                        <select
                          value={cnTransitDeliveryType}
                          onChange={(e) => {
                            setCnTransitDeliveryType(e.target.value);
                            if (e.target.value === 'Courier') {
                              setCnTransitTransporterId('');
                              setCnTransitTransporterName('');
                              setCnTransitVehicleNo('');
                              setCnTransitLrGrConsignment('');
                            }
                          }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white text-sm"
                        >
                          <option value="Self">Self</option>
                          <option value="Third Party">Third Party</option>
                          <option value="Courier">Courier</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Transporter ID/GSTIN
                        </label>
                        <input
                          type="text"
                          value={cnTransitTransporterId}
                          onChange={(e) => setCnTransitTransporterId(e.target.value.toUpperCase())}
                          maxLength={15}
                          placeholder="15-digit GSTIN"
                          disabled={cnTransitDeliveryType === 'Courier'}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed uppercase text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Transporter Name
                        </label>
                        <input
                          type="text"
                          value={cnTransitTransporterName}
                          onChange={(e) => setCnTransitTransporterName(e.target.value)}
                          disabled={cnTransitDeliveryType === 'Courier'}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Vehicle No.
                        </label>
                        <input
                          type="text"
                          value={cnTransitVehicleNo}
                          onChange={(e) => setCnTransitVehicleNo(e.target.value)}
                          disabled={cnTransitDeliveryType === 'Courier'}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          LR/GR/Consignment No
                        </label>
                        <input
                          type="text"
                          value={cnTransitLrGrConsignment}
                          onChange={(e) => setCnTransitLrGrConsignment(e.target.value)}
                          disabled={cnTransitDeliveryType === 'Courier'}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
                        />
                      </div>
                    </div>

                    {/* Right: Upload Document */}
                    <div className="flex items-start justify-center">
                      <div className="w-full">
                        <input
                          type="file"
                          id="cn-transit-doc-road"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setCnTransitDocument(file);
                          }}
                          className="hidden"
                          accept=".jpg,.jpeg,.pdf"
                        />
                        <button
                          type="button"
                          onClick={() => document.getElementById('cn-transit-doc-road')?.click()}
                          className="w-full h-full min-h-[300px] border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                        >
                          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <span className="text-sm font-medium uppercase tracking-wider">Upload Document</span>
                          {cnTransitDocument && (
                            <span className="text-xs mt-2 text-indigo-600 font-bold">✓ {cnTransitDocument.name}</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        </fieldset>
      </div>
    );
  };

  const renderSimpleForm = (type: 'Payment' | 'Receipt' | 'Contra') => {
    // Use the new Receipt Voucher form for Receipt type
    if (type === 'Receipt') {
      return renderReceiptVoucherForm();
    }

    if (type === 'Payment') {
      return renderPaymentVoucherForm();
    }

    // Old Payment form code (disabled)
    if (false) {
      const labelA = 'Pay from';
      const labelB = 'Pay to';
      const labelInv = 'Supplier Inv. No.';
      const labelFull = 'Pay';
      const labelPartial = 'Pay Partially';

      return (
        <div className="space-y-6">
          {/* Single/Bulk Toggle */}
          <div className="flex justify-center gap-2 mb-6">
            <button
              onClick={() => setPaymentMode('single')}
              className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${paymentMode === 'single'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                }`}
            >
              {type} Voucher - Single
            </button>
            <button
              onClick={() => setPaymentMode('bulk')}
              className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${paymentMode === 'bulk'
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                }`}
            >
              {type} Voucher - Bulk
            </button>
          </div>

          {/* Conditional rendering based on mode  */}

          {paymentMode === 'single' ? (
            /* Single Mode */
            <>
              {/* Top Row: Date, Voucher Number, Balance */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                  <input
                    type="text"
                    value={voucherNumber}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Balance</label>
                  <input
                    type="number" onWheel={(e) => e.currentTarget.blur()}
                    value={balance}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                  />
                </div>
              </div>

              {/* DEBUG INFO - Remove after testing */}
              <div className="mt-4 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs">
                <div>Voucher Type: {voucherType}</div>
                <div>Receipt Configs Count: {receiptVoucherConfigs.length}</div>
                <div>Condition Check: {voucherType === 'Receipt' && receiptVoucherConfigs.length > 0 ? 'TRUE - Should show dropdown' : 'FALSE - Dropdown hidden'}</div>
              </div>

              {/* Voucher Type Dropdown - Receipt Configurations */}
              {voucherType === 'Receipt' && receiptVoucherConfigs.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
                    <select
                      value={selectedReceiptConfig}
                      onChange={(e) => setSelectedReceiptConfig(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select</option>
                      {receiptVoucherConfigs.map((config) => (
                        <option key={config.id} value={config.voucher_name}>
                          {config.voucher_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                    <input
                      type="text"
                      value="Auto-generated"
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                    />
                  </div>
                  <div></div>
                </div>
              )}

              {/* Account/Party Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labelA}</label>
                  <SearchableDropdown
                    value={account}
                    onChange={setAccount}
                    options={accountLedgers.map(l => l.name)}
                    placeholder={`Select ${labelA}`}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{labelB}</label>
                    <SearchableDropdown
                      value={party}
                      onChange={setParty}
                      options={partyLedgers.map(l => l.name)}
                      placeholder={`Select ${labelB}`}
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setShowAdvance(!showAdvance)}
                      className={`px-4 py-2 text-sm font-medium rounded-[4px] transition-colors ${showAdvance
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                        : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200'
                        }`}
                    >
                      Advance
                    </button>
                  </div>
                </div>
              </div>

              {/* Details Box - Conditional based on showAdvance */}
              {showAdvance ? (
                /* Advance Section */
                <div className="border-2 border-gray-200 rounded-[4px] p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Top Row */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Advance ref. no.</label>
                      <input
                        type="text"
                        value={advanceRefNo}
                        onChange={e => setAdvanceRefNo(e.target.value)}
                        placeholder="Enter advance reference"
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        value={advanceAmount}
                        onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Bottom Row */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
                      <textarea
                        value={postingNote}
                        onChange={e => setPostingNote(e.target.value)}
                        placeholder="Enter posting note..."
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        value={runningBalance}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Regular Details Box */
                <div className="border-2 border-gray-200 rounded-[4px] p-6 space-y-4">
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{labelInv}</label>
                        <input
                          type="text"
                          value={supplierInvNo}
                          onChange={e => setSupplierInvNo(e.target.value)}
                          placeholder="Enter reference number"
                          className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={e => setPostingNote(e.target.value)}
                          placeholder="Enter posting note..."
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        />
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={simpleAmount}
                          onChange={e => setSimpleAmount(parseFloat(e.target.value) || 0)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <div className="flex items-center gap-4 mt-2">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="paymentType"
                              value="full"
                              checked={paymentType === 'full'}
                              onChange={() => setPaymentType('full')}
                              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">{labelFull}</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="paymentType"
                              value="partial"
                              checked={paymentType === 'partial'}
                              onChange={() => setPaymentType('partial')}
                              className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-2 text-sm text-gray-700">{labelPartial}</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={runningBalance}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Bulk Mode */
            <>
              {/* Top Row: Voucher Number, Account, Balance */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                  <input
                    type="text"
                    value={voucherNumber}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{labelA}</label>
                  <SearchableDropdown
                    value={account}
                    onChange={setAccount}
                    options={accountLedgers.map(l => l.name)}
                    placeholder={`Select ${labelA}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Balance</label>
                  <input
                    type="number" onWheel={(e) => e.currentTarget.blur()}
                    value={balance}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                  />
                </div>
              </div>

              {/* Party Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{labelB}</label>
                <SearchableDropdown
                  value={party}
                  onChange={setParty}
                  options={partyLedgers.map(l => l.name)}
                  placeholder={`Select ${labelB}`}
                />
              </div>

              {/* Conditional rendering based on advance mode */}
              {showBulkAdvance ? (
                /* Bulk Advance Table */
                <div className="border-2 border-gray-200 rounded-[4px] p-6">
                  <div className="flex justify-end mb-4">
                    <button
                      type="button"
                      onClick={() => setShowBulkAdvance(false)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-[4px] hover:bg-gray-200 text-sm font-medium"
                    >
                      ← Back
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">{labelB}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Receipt Note</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Advance ref. no.</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Amount</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-gray-100">
                          <td className="px-4 py-3">
                            <input
                              type="date"
                              value={date}
                              onChange={e => setDate(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <SearchableDropdown
                              value={party}
                              onChange={setParty}
                              options={partyLedgers.map(l => l.name)}
                              placeholder="Select"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              placeholder="Receipt note"
                              className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={advanceRefNo}
                              onChange={e => setAdvanceRefNo(e.target.value)}
                              placeholder="Ref #"
                              className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number" onWheel={(e) => e.currentTarget.blur()}
                              value={advanceAmount}
                              onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-start mt-4">
                    <button
                      type="button"
                      className="text-indigo-600 hover:text-slate-700 text-sm font-medium flex items-center gap-1"
                    >
                      <span>+</span> Add Row
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mt-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Posting Note</label>
                      <textarea
                        value={postingNote}
                        onChange={e => setPostingNote(e.target.value)}
                        placeholder="Enter posting note..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        value={simpleAmount}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                      <input
                        type="number" onWheel={(e) => e.currentTarget.blur()}
                        value={runningBalance}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                /* Normal Bulk Table Column Layout */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column - Details */}
                  <div className="border-2 border-gray-200 rounded-[4px] p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-semibold text-gray-700">Details</h4>
                      <button
                        type="button"
                        className="text-indigo-600 hover:text-slate-700 text-sm font-medium flex items-center gap-1"
                      >
                        <span>+</span> Add Row
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">{labelB}</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">{labelInv}</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-2 py-2">
                              <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <SearchableDropdown
                                value={party}
                                onChange={setParty}
                                options={partyLedgers.map(l => l.name)}
                                placeholder="Select"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="Ref #"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="Note"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={e => setPostingNote(e.target.value)}
                          placeholder="Enter posting note..."
                          rows={3}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Total Amount</label>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={simpleAmount}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-xs"
                        />
                        <label className="block text-xs font-medium text-gray-700 mb-1 mt-2">Running Balance</label>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={runningBalance}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right Column - Advance Section */}
                  <div className="border-2 border-gray-200 rounded-[4px] p-4">
                    <div className="flex justify-end mb-4">
                      <button
                        type="button"
                        onClick={() => setShowBulkAdvance(true)}
                        className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-[4px] hover:bg-gray-200 text-sm font-medium"
                      >
                        Advance
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">{labelInv}</th>
                            <th className="px-2 py-2 text-left text-xs font-medium text-gray-600 uppercase">Amount</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 uppercase">{labelFull}</th>
                            <th className="px-2 py-2 text-center text-xs font-medium text-gray-600 uppercase">{labelPartial}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-2 py-2">
                              <input
                                type="date"
                                value={date}
                                onChange={e => setDate(e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                placeholder="Ref #"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-2 py-2">
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                defaultValue={0}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                defaultChecked
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                              />
                            </td>
                            <td className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                defaultChecked={false}
                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded"
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <p className="text-xs text-gray-500 mt-4 italic">
                      Use this section for advance receipts. Click the "Advance" button to enable.
                    </p>
                  </div>
                </div>
              )}
            </>

          )}
        </div>
      );
    }

    // Custom layout for Contra voucher
    if (type === 'Contra') {
      // ── Currency Detection ─────────────────────────────────────────────────
      // A ledger is "foreign currency" when its extended_data.currency is set &
      // is not 'INR'. We get this from the full ledger object fetched earlier.
      const fromAccountVal = typeof fromAccount === 'object' ? (fromAccount as any).name : fromAccount;
      const toAccountVal = typeof toAccount === 'object' ? (toAccount as any).name : toAccount;
      const fromLedgerObj = accountLedgers.find(l => l.name === fromAccountVal);
      const toLedgerObj = accountLedgers.find(l => l.name === toAccountVal);

      const getLedgerCurrency = (l: any): string => {
        if (!l) return 'INR';
        const cur = l?.extended_data?.currency || l?.additional_data?.currency || '';
        return cur && cur.toUpperCase() !== 'INR' ? cur.toUpperCase() : 'INR';
      };

      const fromCurrency = getLedgerCurrency(fromLedgerObj);
      const toCurrency = getLedgerCurrency(toLedgerObj);
      const fromIsFC = fromCurrency !== 'INR';
      const toIsFC = toCurrency !== 'INR';
      const isForex = fromIsFC || toIsFC;

      // ── Case Classification ────────────────────────────────────────────────
      // Case 1: FC → INR
      // Case 2: INR → FC
      // Case 3: FC → FC
      const contraCase: 1 | 2 | 3 | 0 =
        fromIsFC && !toIsFC ? 1 :
          !fromIsFC && toIsFC ? 2 :
            fromIsFC && toIsFC ? 3 : 0;

      // Determine which currency label to show in Conversion Rate
      const foreignCurrencyLabel = fromIsFC ? fromCurrency : (toIsFC ? toCurrency : 'Foreign Currency');

      // Deduct Charges From options — the actual selected ledger names
      const deductChargesOptions = [
        fromAccount && `Transfer From — ${fromAccount}`,
        toAccount && `Transfer To — ${toAccount}`,
      ].filter(Boolean) as string[];

      // Currency label for Conversion Charges field
      const deductIsFromLedger = contraDeductChargesFrom.startsWith('Transfer From');
      const deductChargesCurrency = deductIsFromLedger ? fromCurrency : toCurrency;

      return (
        <div className="space-y-6">
          {/* ── Top Row: Date / Voucher Type / Voucher Number ── */}
          <div className="grid grid-cols-3 gap-4 max-w-4xl">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date" value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
              <SearchableDropdown
                value={selectedContraConfig}
                onChange={setSelectedContraConfig}
                options={contraVoucherConfigs.map(c => c.voucher_name)}
                placeholder="Select Voucher Type"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
              <input type="text" value={voucherNumber} readOnly
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
              />
            </div>
          </div>

          {/* ── Main Form ── */}
          <div className="border-2 border-gray-200 rounded-[4px] p-6 max-w-6xl space-y-4">

            {/* Transfer From */}
            <div className="grid grid-cols-[160px_1fr_130px] gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Transfer From</label>
              <SearchableDropdown value={fromAccount} onChange={v => {
                setFromAccount(v);
                // Reset forex fields on account change
                setContraPaymentAmtForeign(''); setContraPaymentRate(0); setContraPaymentAmtINR('');
                setContraReceiptAmtForeign(''); setContraReceiptRate(0); setContraReceiptAmtINR('');
                setContraForexGainLoss(0); setSimpleAmount(0);
              }}
                options={accountLedgers.map(l => l.name)} placeholder="Select Account" />
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Running Balance</div>
                <input type="text" value={fromAccountBalance.toFixed(2)} readOnly
                  className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-sm text-center" />
              </div>
            </div>

            {/* Transfer To */}
            <div className="grid grid-cols-[160px_1fr_130px] gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Transfer To</label>
              <SearchableDropdown value={toAccount} onChange={v => {
                setToAccount(v);
                setContraPaymentAmtForeign(''); setContraPaymentRate(0); setContraPaymentAmtINR('');
                setContraReceiptAmtForeign(''); setContraReceiptRate(0); setContraReceiptAmtINR('');
                setContraForexGainLoss(0); setSimpleAmount(0);
              }}
                options={accountLedgers.map(l => l.name)} placeholder="Select Account" />
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">&nbsp;</div>
                <input type="text" value={toAccountBalance.toFixed(2)} readOnly
                  className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-sm text-center" />
              </div>
            </div>

            {/* Conversion Rate — only shown for forex */}
            {isForex && (
              <div className="grid grid-cols-[160px_1fr] gap-4 items-center">
                <label className="text-sm font-medium text-gray-700">Conversion Rate</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 whitespace-nowrap">
                    1 {foreignCurrencyLabel} =
                  </span>
                  <input
                    type="number" onWheel={(e) => e.currentTarget.blur()}
                    value={contraConversionRate}
                    onChange={e => setContraConversionRate(parseFloat(e.target.value) || '')}
                    placeholder="Rate"
                    className="w-32 px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  <span className="text-sm text-gray-600">INR</span>
                </div>
              </div>
            )}

            {/* ── Forex Details Table — only when forex ── */}
            {isForex && (
              <div className="border border-gray-300 rounded-[4px] overflow-x-auto">
                <table className="w-full text-sm min-w-[700px]">
                  <thead>
                    <tr className="bg-indigo-50">
                      <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-indigo-700 border-r border-gray-300">
                        Payment Details
                      </th>
                      <th colSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-indigo-700 border-r border-gray-300">
                        Receipt Details
                      </th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-indigo-700">
                        Forex Gain / Loss
                      </th>
                    </tr>
                    <tr className="bg-gray-50 border-t border-gray-200 text-xs font-medium text-gray-600">
                      <th className="px-2 py-2 text-left border-r border-gray-200">Amt in FC</th>
                      <th className="px-2 py-2 text-left border-r border-gray-200">Rate</th>
                      <th className="px-2 py-2 text-left border-r border-gray-300">Amt in INR</th>
                      <th className="px-2 py-2 text-left border-r border-gray-200">Amt in FC</th>
                      <th className="px-2 py-2 text-left border-r border-gray-200">Rate</th>
                      <th className="px-2 py-2 text-left border-r border-gray-300">Amt in INR</th>
                      <th className="px-2 py-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-200">

                      {/* ── PAYMENT: Amount in FC ── */}
                      <td className="px-2 py-2 border-r border-gray-200">
                        {/* Case 1 (FC→INR): manual | Case 2 (INR→FC): = Receipt FC | Case 3 (FC→FC): manual */}
                        <input type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={contraPaymentAmtForeign}
                          readOnly={contraCase === 2}
                          placeholder="0.00"
                          onChange={e => {
                            if (contraCase === 2) return;
                            const fc = parseFloat(e.target.value) || 0;
                            setContraPaymentAmtForeign(fc || '');
                            // Case 1 & 3: Rate = RunBal INR / RunBal FC (from balance)
                            // Balance stored in INR. If FC balance not tracked separately, use conversion rate.
                            const rate = contraCase === 1 || contraCase === 3
                              ? (fromAccountBalance > 0 ? fromAccountBalance / Math.max(Number(contraConversionRate) || 1, 1) : Number(contraConversionRate) || 0)
                              : contraPaymentRate;
                            const inr = fc * rate;
                            setContraPaymentRate(parseFloat(rate.toFixed(4)));
                            setContraPaymentAmtINR(inr || '');
                            setSimpleAmount(inr);
                            const recInr = Number(contraReceiptAmtINR) || 0;
                            setContraForexGainLoss(recInr - inr);
                          }}
                          className={`w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${contraCase === 2 ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-gray-300'}`}
                        />
                      </td>

                      {/* ── PAYMENT: Rate (read-only) ── */}
                      <td className="px-2 py-2 border-r border-gray-200">
                        <input type="text"
                          value={contraPaymentRate > 0 ? contraPaymentRate.toFixed(4) : ''}
                          readOnly
                          placeholder="Auto"
                          className="w-full px-2 py-1 border border-gray-200 rounded bg-gray-50 text-xs text-gray-600 text-center"
                        />
                      </td>

                      {/* ── PAYMENT: Amount in INR ── */}
                      <td className="px-2 py-2 border-r border-gray-300">
                        {/* Case 2 (INR→FC): manual. Others: auto. */}
                        <input type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={contraPaymentAmtINR}
                          readOnly={contraCase !== 2}
                          placeholder="0.00"
                          onChange={e => {
                            if (contraCase !== 2) return;
                            const inr = parseFloat(e.target.value) || 0;
                            setContraPaymentAmtINR(inr || '');
                            setSimpleAmount(inr);
                            // Case 2: Rate = INR / FC
                            const fc = Number(contraPaymentAmtForeign) || 0;
                            const recFc = Number(contraReceiptAmtForeign) || 0;
                            if (recFc > 0) setContraPaymentRate(parseFloat((inr / recFc).toFixed(4)));
                            const recInr = Number(contraReceiptAmtINR) || 0;
                            setContraForexGainLoss(recInr - inr);
                          }}
                          className={`w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${contraCase !== 2 ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-gray-300'}`}
                        />
                      </td>

                      {/* ── RECEIPT: Amount in FC ── */}
                      <td className="px-2 py-2 border-r border-gray-200">
                        {/* Case 1 (FC→INR): = Payment FC (readonly). Case 2 (INR→FC): manual. Case 3: manual. */}
                        <input type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={contraCase === 1 ? contraPaymentAmtForeign : contraReceiptAmtForeign}
                          readOnly={contraCase === 1}
                          placeholder="0.00"
                          onChange={e => {
                            if (contraCase === 1) return;
                            const fc = parseFloat(e.target.value) || 0;
                            setContraReceiptAmtForeign(fc || '');
                            if (contraCase === 2) {
                              // Sync Payment FC = Receipt FC
                              setContraPaymentAmtForeign(fc || '');
                              // Rate = INR / FC
                              const inr = Number(contraPaymentAmtINR) || 0;
                              const rate = fc > 0 ? inr / fc : 0;
                              setContraReceiptRate(parseFloat(rate.toFixed(4)));
                              setContraPaymentRate(parseFloat(rate.toFixed(4)));
                              setContraReceiptAmtINR(inr || ''); // same as payment
                              setContraForexGainLoss(inr - inr); // 0
                            } else {
                              // Case 3: Receipt INR = PaymentFC * ConversionRate(from)
                              const payInr = Number(contraPaymentAmtINR) || 0;
                              setContraReceiptAmtINR(payInr || '');
                              const rate = fc > 0 ? payInr / fc : 0;
                              setContraReceiptRate(parseFloat(rate.toFixed(4)));
                              setContraForexGainLoss(payInr - Number(contraPaymentAmtINR));
                            }
                          }}
                          className={`w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${contraCase === 1 ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-gray-300'}`}
                        />
                      </td>

                      {/* ── RECEIPT: Rate (read-only) ── */}
                      <td className="px-2 py-2 border-r border-gray-200">
                        <input type="text"
                          value={contraReceiptRate > 0 ? contraReceiptRate.toFixed(4) : ''}
                          readOnly
                          placeholder="Auto"
                          className="w-full px-2 py-1 border border-gray-200 rounded bg-gray-50 text-xs text-gray-600 text-center"
                        />
                      </td>

                      {/* ── RECEIPT: Amount in INR ── */}
                      <td className="px-2 py-2 border-r border-gray-300">
                        {/* Case 1 (FC→INR): manual. Case 2 (INR→FC): = Payment INR (readonly). Case 3: auto. */}
                        <input type="number" onWheel={(e) => e.currentTarget.blur()}
                          value={contraCase === 2 ? contraPaymentAmtINR : contraReceiptAmtINR}
                          readOnly={contraCase === 2 || contraCase === 3}
                          placeholder="0.00"
                          onChange={e => {
                            if (contraCase !== 1) return;
                            const inr = parseFloat(e.target.value) || 0;
                            setContraReceiptAmtINR(inr || '');
                            // Rate = INR / FC
                            const fc = Number(contraReceiptAmtForeign) || Number(contraPaymentAmtForeign) || 0;
                            if (fc > 0) setContraReceiptRate(parseFloat((inr / fc).toFixed(4)));
                            setContraForexGainLoss(inr - Number(contraPaymentAmtINR));
                          }}
                          className={`w-full px-2 py-1 border rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 ${(contraCase === 2 || contraCase === 3) ? 'bg-gray-50 text-gray-500 border-gray-200' : 'border-gray-300'}`}
                        />
                      </td>

                      {/* ── Forex Gain or Loss ── */}
                      <td className="px-2 py-2">
                        <input type="text"
                          value={contraForexGainLoss !== 0 ? (contraForexGainLoss > 0 ? `+${contraForexGainLoss.toFixed(2)}` : contraForexGainLoss.toFixed(2)) : '0.00'}
                          readOnly
                          className={`w-full px-2 py-1 border rounded text-xs text-center font-semibold ${contraForexGainLoss > 0 ? 'border-green-300 bg-green-50 text-green-700'
                            : contraForexGainLoss < 0 ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-gray-200 bg-gray-50 text-gray-600'
                            }`}
                        />
                        <div className="text-[10px] text-center mt-0.5 font-medium">
                          {contraForexGainLoss > 0 ? '▲ Gain' : contraForexGainLoss < 0 ? '▼ Loss' : ''}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Amount (INR) — shown always; auto-filled from Payment for forex */}
            <div className="grid grid-cols-[160px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Amount (INR)</label>
              <input
                type="number" onWheel={(e) => e.currentTarget.blur()}
                value={simpleAmount}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 0;
                  setSimpleAmount(v);
                  if (!isForex) setContraPaymentAmtINR(v || '');
                }}
                readOnly={isForex && contraCase !== 0}
                className={`w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isForex && contraCase !== 0 ? 'bg-gray-50 text-gray-500' : ''}`}
              />
            </div>
          </div>

          {/* ── Bottom: Charges + Posting Note ── */}
          <div className="grid grid-cols-2 gap-8 max-w-6xl">
            {/* Left: Charges */}
            <div className="space-y-4">
              {/* Deduct Charges From */}
              <div className="grid grid-cols-[180px_1fr] gap-3 items-center">
                <label className="text-sm font-medium text-gray-700">Deduct Charges From</label>
                <select
                  value={contraDeductChargesFrom}
                  onChange={e => setContraDeductChargesFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                >
                  <option value="">Select</option>
                  {deductChargesOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              {/* Conversion Charges */}
              <div className="grid grid-cols-[180px_1fr] gap-3 items-center">
                <label className="text-sm font-medium text-gray-700">Conversion Charges</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" onWheel={(e) => e.currentTarget.blur()}
                    value={contraConversionCharges}
                    onChange={e => setContraConversionCharges(parseFloat(e.target.value) || '')}
                    placeholder="0.00"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                  {contraDeductChargesFrom && (
                    <span className="text-xs text-gray-500 whitespace-nowrap font-medium">
                      {deductChargesCurrency}
                    </span>
                  )}
                </div>
              </div>

              {/* FEMA Purpose Code */}
              <div className="grid grid-cols-[180px_1fr] gap-3 items-start">
                <label className="text-sm font-medium text-gray-700 pt-2">FEMA Purpose Code</label>
                <select
                  value={contraFemaPurposeCode}
                  onChange={e => setContraFemaPurposeCode(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm bg-white"
                >
                  <option value="">Select FEMA Purpose Code</option>
                  {FEMA_CODES.map(fc => (
                    <option key={fc.code} value={fc.code}>
                      {fc.code} — {fc.desc}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: Posting Note */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Posting Note</label>
              <textarea
                value={narration}
                onChange={e => setNarration(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={5}
                placeholder="Enter posting note..."
              />
            </div>
          </div>
        </div>
      );
    }

    // Original simple form for other types (shouldn't reach here)

    return (
      <div className="max-w-md mx-auto space-y-4">
        <div><label className="form-label">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" /></div>
        {type !== 'Contra' && <div><label className="form-label">Account (Cash/Bank)</label><SearchableDropdown value={account} onChange={setAccount} options={accountLedgers.map(l => l.name)} placeholder="Select Account" /></div>}
        {type === 'Contra' && <>
          <div><label className="form-label">From Account</label><SearchableDropdown value={fromAccount} onChange={setFromAccount} options={accountLedgers.map(l => l.name)} placeholder="Select From Account" /></div>
          <div><label className="form-label">To Account</label><SearchableDropdown value={toAccount} onChange={setToAccount} options={accountLedgers.map(l => l.name)} placeholder="Select To Account" /></div>
        </>}
        {type !== 'Contra' && <div><label className="form-label">Party</label><SearchableDropdown value={party} onChange={setParty} options={partyLedgers.map(l => l.name)} placeholder="Select Party" /></div>}
        <div><label className="form-label">Amount</label><input type="number" onWheel={(e) => e.currentTarget.blur()} value={simpleAmount} onChange={e => setSimpleAmount(parseFloat(e.target.value))} className="form-input" /></div>
        <div className="relative"><label className="form-label">Narration</label><textarea value={narration} onChange={e => setNarration(e.target.value)} className="form-input w-full pr-10" rows={3}></textarea><button onClick={handleGenerateNarration} disabled={isNarrationLoading} className="absolute top-7 right-2 text-indigo-500 hover:text-slate-700 disabled:text-gray-300" title="Generate Narration with AI">{isNarrationLoading ? <Icon name="spinner" className="w-5 h-5 animate-spin" /> : <Icon name="wand-sparkles" className="w-5 h-5" />}</button></div>
      </div>
    );
  };

  // Expense Row Interface
  interface ExpenseRow {
    id: string;
    expense: string;
    postTo: string;
    billRefNo: string;
    entryNote: string;
    totalAmount: number;
    gstRate: number;
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
    cess: number;
    showTax: boolean;
  }

  // State for expense rows
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([{
    id: '1',
    expense: '',
    postTo: '',
    billRefNo: '',
    entryNote: '',
    totalAmount: 0,
    gstRate: 0,
    taxableValue: 0,
    igst: 0,
    cgst: 0,
    sgst: 0,
    cess: 0,
    showTax: false
  }]);

  // State for uploaded files
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // GST Rate options
  const gstRateOptions = [0, 0.5, 1.5, 3, 5, 7.5, 12, 18, 28, 40];

  // Expenses uses filtered expenseLedgerOptions, PostTo uses the full allLedgerOptions (including hierarchy) so all master ledgers appear
  const expenseLedgers = useMemo(() => expenseLedgerOptions.map(name => ({ name })), [expenseLedgerOptions]);
  const postToLedgers = useMemo(() => allLedgerOptions.map(name => ({ name })), [allLedgerOptions]);


  // Handle expense row change
  const handleExpenseRowChange = (id: string, field: keyof ExpenseRow, value: any) => {
    setExpenseRows(prev => prev.map(row => {
      if (row.id !== id) return row;

      const updated = { ...row, [field]: value };

      // Auto-calculate GST when gstRate or taxableValue changes
      if (field === 'gstRate' || field === 'taxableValue') {
        const taxAmount = updated.taxableValue * (updated.gstRate / 100);

        // If IGST is being used (inter-state)
        if (updated.igst > 0) {
          updated.igst = taxAmount;
          updated.cgst = 0;
          updated.sgst = 0;
        } else {
          // Intra-state: split between CGST and SGST
          updated.cgst = taxAmount / 2;
          updated.sgst = taxAmount / 2;
          updated.igst = 0;
        }
      }

      // If IGST is manually entered, disable CGST/SGST
      if (field === 'igst' && value > 0) {
        updated.cgst = 0;
        updated.sgst = 0;
      }

      // If CGST or SGST is manually entered, ensure they're equal and disable IGST
      if (field === 'cgst') {
        updated.sgst = value;
        updated.igst = 0;
      }
      if (field === 'sgst') {
        updated.cgst = value;
        updated.igst = 0;
      }

      return updated;
    }));
  };

  // Add new expense row
  const handleAddExpenseRow = () => {
    setExpenseRows(prev => [...prev, {
      id: Date.now().toString(),
      expense: '',
      postTo: '',
      billRefNo: '',
      entryNote: '',
      totalAmount: 0,
      gstRate: 0,
      taxableValue: 0,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      showTax: false
    }]);
  };

  // Remove expense row
  const handleRemoveExpenseRow = (id: string) => {
    if (expenseRows.length > 1) {
      setExpenseRows(prev => prev.filter(row => row.id !== id));
    }
  };

  // Toggle tax section
  const handleToggleTax = (id: string) => {
    setExpenseRows(prev => prev.map(row =>
      row.id === id ? { ...row, showTax: !row.showTax } : row
    ));
  };

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const validFiles = Array.from(files).filter((file: File) => {
        const ext = file.name.split('.').pop()?.toLowerCase();
        return ext === 'pdf' || ext === 'jpg' || ext === 'jpeg';
      });
      setUploadedFiles(prev => [...prev, ...validFiles]);
    }
  };

  // Remove uploaded file
  const handleRemoveFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Validate and save expense voucher
  const handleSaveExpenseVoucher = async () => {
    // Validation
    let hasError = false;

    expenseRows.forEach(row => {
      if (!row.expense || !row.postTo || !row.totalAmount || row.totalAmount <= 0) {
        hasError = true;
      }
    });

    if (hasError) {
      showError('Please fill all mandatory fields (Expense, Post To, Amount) in all rows');

      return;
    }

    // Create expense voucher payload
    const payload = {
      date,
      voucher_number: voucherNumber,
      voucher_series: selectedExpensesConfig || undefined,
      posting_note: narration,
      expense_rows: expenseRows.map(row => ({
        id: row.id,
        expense: row.expense,
        postTo: row.postTo,
        billRefNo: row.billRefNo || '',
        entryNote: row.entryNote || '',
        totalAmount: row.totalAmount,
        gstRate: row.gstRate,
        taxableValue: row.taxableValue,
        igst: row.igst,
        cgst: row.cgst,
        sgst: row.sgst,
        cess: row.cess,
        showTax: row.showTax
      })),
      uploaded_files: uploadedFiles.map(f => f.name)
    };


    try {
      const response = await httpClient.post('/api/vouchers/expenses/', payload);
      const savedNo = (response as any)?.voucher_number || voucherNumber;
      showSuccess(`Expense voucher ${savedNo} saved successfully.`);

      // Reset form
      setExpenseRows([{
        id: Date.now().toString(),
        expense: '',
        postTo: '',
        billRefNo: '',
        entryNote: '',
        totalAmount: 0,
        gstRate: 0,
        taxableValue: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
        showTax: false
      }]);
      setUploadedFiles([]);
    } catch (error) {
      console.error('Error posting expense voucher:');
      showError('Failed to save expense voucher. Please try again.');

    }
  };

  const renderExpensesForm = () => (
    <>
      {/* Header Section */}
      <div className="grid grid-cols-3 gap-6 mb-6 max-w-3xl">
        <div>
          <label className="erp-label">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={date}
            max={getTodayDate()}
            onChange={e => setDate(e.target.value)}
            className="erp-input"
          />
        </div>
        <div>
          <label className="erp-label">Voucher Type</label>
          <SearchableDropdown
            value={selectedExpensesConfig}
            onChange={setSelectedExpensesConfig}
            options={expensesVoucherConfigs.map(c => c.voucher_name)}
            placeholder="Select Voucher Type"
          />
        </div>
        <div>
          <label className="erp-label">
            Voucher Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={voucherNumber}
            readOnly
            className="erp-input bg-gray-50 text-gray-500"
          />
        </div>
      </div>

      {/* Expense Rows */}
      <div className="space-y-6">
        {expenseRows.map((row, index) => (
          <div key={row.id} className="erp-container border-2">
            {/* Row Header */}
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
              <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Expense Entry #{index + 1}</h4>
              {expenseRows.length > 1 && (
                <button
                  onClick={() => handleRemoveExpenseRow(row.id)}
                  className="text-red-500 hover:text-red-700 transition-colors"
                  title="Remove this expense"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Main Fields Row */}
            <div className="grid grid-cols-5 gap-4 mb-4">
              <div>
                <label className="erp-label">
                  Expenses <span className="text-red-500">*</span>
                </label>
                <SearchableDropdown
                  value={row.expense}
                  onChange={(val) => handleExpenseRowChange(row.id, 'expense', val)}
                  options={expenseLedgers.map(l => l.name)}
                  placeholder="Select Expense"
                  className={!row.expense ? 'border-red-300' : ''}
                />
              </div>
              <div>
                <label className="erp-label">
                  Post To <span className="text-red-500">*</span>
                </label>
                <SearchableDropdown
                  value={row.postTo}
                  onChange={(val) => handleExpenseRowChange(row.id, 'postTo', val)}
                  options={postToLedgers.map(l => l.name)}
                  placeholder="Select Account"
                  className={!row.postTo ? 'border-red-300' : ''}
                />
              </div>
              <div>
                <label className="erp-label">
                  Bill Ref No <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={row.billRefNo}
                  onChange={e => handleExpenseRowChange(row.id, 'billRefNo', e.target.value)}
                  className={`erp-input ${!row.billRefNo ? 'border-red-300' : ''}`}
                  placeholder="Invoice #"
                />
              </div>
              <div>
                <label className="erp-label">
                  Entry Note <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={row.entryNote}
                  onChange={e => handleExpenseRowChange(row.id, 'entryNote', e.target.value)}
                  className={`erp-input ${!row.entryNote ? 'border-red-300' : ''}`}
                  placeholder="Note"
                />
              </div>
              <div>
                <label className="erp-label">
                  Total Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" onWheel={(e) => e.currentTarget.blur()}
                  value={row.totalAmount || ''}

                  onChange={e => handleExpenseRowChange(row.id, 'totalAmount', parseFloat(e.target.value) || 0)}
                  className={`erp-input ${row.totalAmount <= 0 ? 'border-red-300' : ''}`}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Add Tax Button */}
            {!row.showTax && (
              <button
                onClick={() => handleToggleTax(row.id)}
                className="erp-button-secondary py-1.5 px-3 text-xs"
              >
                <Icon name="plus" className="w-3.5 h-3.5 mr-2" />
                Add Tax Details
              </button>
            )}

            {/* GST Section */}
            {row.showTax && (
              <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">GST Details</h5>
                  <button
                    onClick={() => handleToggleTax(row.id)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    Hide
                  </button>
                </div>

                <div className="grid grid-cols-6 gap-3">
                  <div>
                    <label className="erp-label">
                      Rate <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={row.gstRate}
                      onChange={e => handleExpenseRowChange(row.id, 'gstRate', parseFloat(e.target.value))}
                      className="erp-select"
                    >
                      {gstRateOptions.map(rate => (
                        <option key={rate} value={rate}>{rate}%</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="erp-label">
                      Taxable <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={row.taxableValue || ''}

                      onChange={e => handleExpenseRowChange(row.id, 'taxableValue', parseFloat(e.target.value) || 0)}
                      className="erp-input"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="erp-label">IGST</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={row.igst || ''}

                      onChange={e => handleExpenseRowChange(row.id, 'igst', parseFloat(e.target.value) || 0)}
                      className="erp-input bg-gray-50"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="erp-label">CGST</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={row.cgst || ''}

                      onChange={e => handleExpenseRowChange(row.id, 'cgst', parseFloat(e.target.value) || 0)}
                      disabled={row.igst > 0}
                      className={`erp-input ${row.igst > 0 ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="erp-label">SGST</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={row.sgst || ''}

                      onChange={e => handleExpenseRowChange(row.id, 'sgst', parseFloat(e.target.value) || 0)}
                      disabled={row.igst > 0}
                      className={`erp-input ${row.igst > 0 ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="erp-label">CESS</label>
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={row.cess || ''}

                      onChange={e => handleExpenseRowChange(row.id, 'cess', parseFloat(e.target.value) || 0)}
                      className="erp-input"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* More Expenses Button */}
      <button
        onClick={handleAddExpenseRow}
        className="erp-button-secondary mt-4"
      >
        <Icon name="plus" className="w-4 h-4 mr-2" />
        Add Another Expense
      </button>

      {/* File Upload Section */}
      <div className="mt-8 p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-1">Supporting Documents</h5>
            <p className="text-xs text-gray-400">PDF, JPG, PNG up to 10MB (Optional)</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="erp-button-secondary"
          >
            <Icon name="upload" className="w-4 h-4 mr-2" />
            Upload Files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm">
                <div className="flex items-center min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center mr-3 flex-shrink-0">
                    <Icon name="document" className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Posting Note */}
      <div className="mt-8">
        <label className="erp-label">Posting Note / Narration</label>
        <textarea
          value={narration}
          onChange={e => setNarration(e.target.value)}
          className="erp-input h-32 py-3 resize-none"
          placeholder="Enter detailed narration for this transaction..."
        />
      </div>

    </>
  );

  const renderJournalForm = () => (
    <>
      {/* Top Row: Date, Voucher Type, Voucher Number */}
      <div className="grid grid-cols-3 gap-6 mb-6 max-w-3xl">
        <div>
          <label className="erp-label">Date</label>
          <input
            type="date"
            value={date}
            max={getTodayDate()}
            onChange={e => setDate(e.target.value)}
            className="erp-input"
          />
        </div>
        <div>
          <label className="erp-label">Voucher Type</label>
          <SearchableDropdown
            value={selectedJournalConfig}
            onChange={setSelectedJournalConfig}
            options={journalVoucherConfigs.map(c => c.voucher_name)}
            placeholder="Select Voucher Type"
          />
        </div>
        <div>
          <label className="erp-label">Voucher Number</label>
          <input
            type="text"
            value={voucherNumber}
            readOnly
            className="erp-input bg-gray-50 text-gray-500"
          />
        </div>
      </div>

      {/* Journal Entries Table */}
      <div className="erp-container p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Journal Entries</h3>
        </div>
        <div className="erp-table-container border-none rounded-none shadow-none">
          <table className="erp-table">
            <thead>
              <tr>
                <th>Ledger</th>
                <th>Note</th>
                <th className="w-32">Ref. No.</th>
                <th className="w-40 text-right">Debit</th>
                <th className="w-40 text-right">Credit</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry, index) => (
                <tr key={index}>
                  <td className="px-4 py-3">
                    <SearchableDropdown
                      value={entry.ledger}
                      onChange={(val) => handleEntryChange(index, 'ledger', val)}
                      options={allLedgerOptions}
                      placeholder="Select Ledger"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={entry.note}
                      onChange={e => handleEntryChange(index, 'note', e.target.value)}
                      placeholder="Note"
                      className="erp-input h-9"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={entry.refNo}
                      onChange={e => handleEntryChange(index, 'refNo', e.target.value)}
                      placeholder="Ref #"
                      className="erp-input h-9"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={entry.debit || ''}

                      onChange={e => handleEntryChange(index, 'debit', parseFloat(e.target.value) || 0)}
                      className="erp-input h-9 text-right font-mono"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number" onWheel={(e) => e.currentTarget.blur()}
                      value={entry.credit || ''}

                      onChange={e => handleEntryChange(index, 'credit', parseFloat(e.target.value) || 0)}
                      className="erp-input h-9 text-right font-mono"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleRemoveEntryRow(index)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
              <tr>
                <td colSpan={3} className="px-6 py-4 text-right text-xs uppercase tracking-wider text-slate-500">Total</td>
                <td className="px-6 py-4 text-right text-sm font-mono text-slate-900 border-l border-slate-100">₹{totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td className="px-6 py-4 text-right text-sm font-mono text-slate-900 border-l border-slate-100">₹{totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={handleAddEntryRow}
            className="erp-button-secondary py-1.5 px-3 text-xs"
          >
            <Icon name="plus" className="w-3.5 h-3.5 mr-2" /> Add Entry Row
          </button>
        </div>
      </div>

      {/* Posting Note Section */}
      <div className="mt-8">
        <label className="erp-label">Posting Note / Narration</label>
        <textarea
          value={narration}
          onChange={e => setNarration(e.target.value)}
          className="erp-input h-32 py-3 resize-none"
          placeholder="Enter detailed narration for this journal entry..."
        />
        {!isJournalBalanced && totalDebit > 0 && (
          <div className="mt-3 flex items-center text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
            <Icon name="warning" className="w-4 h-4 mr-2" />
            <span className="text-sm font-medium">Out of Balance: Difference of ₹{Math.abs(totalDebit - totalCredit).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>
    </>
  );

  const handleCloseVoucher = () => {
    if (activeOcrFileHash) {
      setActiveOcrFileHash(null);
      setActiveOcrFileName(null);
      setLocalPrefilledData(null);

      if (returnToPage && onNavigate) {
        onNavigate(returnToPage as Page);
        setReturnToPage(null);
        return;
      }

      // Restore the OCR workflow step to 'review' so the modal re-opens to the scan list
      // (not the upload step). The session ID is already in activeOcrSessionId.
      if (activeOcrSessionId) {
        useOcrWorkflowStore.getState().setUploadSessionId(activeOcrSessionId);
        useOcrWorkflowStore.getState().setStep('review');
      }
      setIsBulkUploadOpen(true);
      return;
    }

    setIsReadOnlyMode(false);
    setDrillDownDetails(null);
    if (clearViewVoucherData) clearViewVoucherData();
    if (onNavigate) {
      if (viewVoucherData?.source === 'b2b_drilldown') {
        onNavigate('GST');
      } else if (viewVoucherData?.ledgerName) {
        onNavigate('Reports', { reportType: 'LedgerReport', drillDownLedger: viewVoucherData.ledgerName });
      } else {
        onNavigate('Reports', { reportType: 'DayBook' });
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="erp-section-title">
        <div>
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-white border border-[#E0E2FF] shadow-[0_8px_16px_rgba(75,60,255,0.08)] flex items-center justify-center overflow-hidden shrink-0">
              <img src={finpixeLogo} alt="Finpixe logo" className="w-9 h-9 object-contain drop-shadow-sm" />
            </div>
            <div>
              <h1 className="page-title">Voucher Entry</h1>
              <p className="helper-text mb-0">
                Record transactions — sales, purchases, payments, and more
              </p>
            </div>
          </div></div>
      </div>

      {isBankUploadModalOpen ? (
        <div className="erp-container relative">
          <div className="mb-6 pb-4 border-b">
            <h3 className="erp-section-title border-none mb-0 pb-0">Bank Statement Upload</h3>
            <p className="helper-text mb-0">Upload a bank statement to extract and post transactions</p>
          </div>
          <BankUpload
            ledgers={freshLedgers.length > 0 ? freshLedgers : ledgers}
            defaultType={(voucherType.toLowerCase() === 'receipt' ? 'receipt' : 'payment') as 'payment' | 'receipt'}
            onClose={() => setIsBankUploadModalOpen(false)}
          />
        </div>
      ) : isSalesExcelWorkflowOpen ? (
        <div className="erp-container relative">
          <SalesExcelUploadWorkflow onClose={() => setIsSalesExcelWorkflowOpen(false)} />
        </div>
      ) : (
        <>
          {isReadOnlyMode && (
            <div className="bg-indigo-600 text-white p-5 rounded-xl flex justify-between items-center mb-6 shadow-[0_10px_30px_-10px_rgba(79,70,229,0.4)] animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center bg-white/20 backdrop-blur-md border border-white/30 rounded-xl shadow-inner">
                  <Icon name="eye" className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="font-black text-lg uppercase tracking-wide leading-tight">READ-ONLY VIEW</p>
                  <p className="text-indigo-100 text-sm font-medium opacity-90">You are currently viewing {drillDownDetails?._mappedType || voucherType} Voucher {drillDownDetails?.voucher_number || drillDownDetails?._rawEntry?.voucherNo || ""}.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {drillDownDetails?.gst_registered !== 'Yes' && (
                  <button onClick={() => setIsReadOnlyMode(false)} className="flex items-center gap-2 bg-white text-indigo-700 px-7 py-3 rounded-xl font-black text-sm shadow-md hover:bg-indigo-50 transition-all active:scale-95">
                    <Icon name="edit" className="w-4 h-4" />
                    EDIT VOUCHER
                  </button>
                )}
                <button
                  onClick={handleCloseVoucher}
                  className="flex items-center gap-2 bg-indigo-800/60 text-indigo-50 px-5 py-3 rounded-xl font-bold text-sm border border-indigo-400/40 hover:bg-indigo-800/90 transition-all active:scale-95"
                >
                  <Icon name="x" className="w-4 h-4" />
                  CLOSE
                </button>
              </div>
            </div>
          )}

          {/* Main Tabs */}
          <div className={`erp-tab-container ${isReadOnlyMode ? 'opacity-50 pointer-events-none cursor-not-allowed select-none' : ''}`}>
            {availableVoucherTypes.map(type => (
              <button
                key={type.id}
                onClick={() => { setVoucherType(type.id); resetForm(); }}
                className={`erp-tab ${voucherType === type.id ? 'active' : ''}`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="erp-container">
            <div className="flex justify-between items-center border-b pb-4 mb-6">
              <div className="flex items-center space-x-4">
                <h3 className="erp-section-title border-none mb-0 pb-0">{voucherType} Voucher</h3>
                {subscriptionUsage && (
                  <div className={`px-3 py-1 rounded-full text-xs font-medium ${isLimitReached ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    Usage: {subscriptionUsage.used} / {subscriptionUsage.limit}
                  </div>
                )}
                {/* GST Status Badges */}
                {isReadOnlyMode && !isViewingAmended && amendedVoucherDetails && (
                  <div className="flex items-center space-x-2">
                    <div className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center shadow-sm">
                      <Icon name="check-circle" className="w-3.5 h-3.5 mr-1.5" />
                      GST Filed
                    </div>
                    <button
                      onClick={() => setIsViewingAmended(true)}
                      className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center shadow-sm cursor-pointer hover:bg-red-100 transition-colors"
                    >
                      <Icon name="eye" className="w-3.5 h-3.5 mr-1.5" />
                      View Amended Version
                    </button>
                  </div>
                )}
                {isReadOnlyMode && isViewingAmended && amendedVoucherDetails && (
                  <div className="flex items-center space-x-2">
                    <div className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center shadow-sm">
                      <Icon name="edit-3" className="w-3.5 h-3.5 mr-1.5" />
                      Amended Version
                    </div>
                    <button
                      onClick={() => setIsViewingAmended(false)}
                      className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center shadow-sm cursor-pointer hover:bg-emerald-100 transition-colors"
                    >
                      <Icon name="eye" className="w-3.5 h-3.5 mr-1.5" />
                      View Original Snapshot
                    </button>
                  </div>
                )}
                {isReadOnlyMode && !amendedVoucherDetails && !drillDownDetails?.amendment_date && drillDownDetails?.gst_registered === 'Yes' && (
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center shadow-sm">
                    <Icon name="check-circle" className="w-3.5 h-3.5 mr-1.5" />
                    GST Filed
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative" ref={scannerMenuRef}>
                  <button
                    onClick={() => setIsScannerMenuOpen(prev => !prev)}
                    className="erp-button-primary"
                    title="Upload Invoices"
                  >
                    <Icon name="upload" className="w-4 h-4 mr-2" />
                    Upload Invoices
                    <Icon name="chevron-down" className="w-3 h-3 ml-2" />
                  </button>

                  {isScannerMenuOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-[60]">
                      <div className="py-1" role="menu">
                        {(() => {
                          const currentVoucherType = voucherType.toLowerCase();
                          const allowedOptions = UPLOAD_OPTIONS_CONFIG[currentVoucherType] || ["upload_for_excel"];

                          const UPLOAD_OPTION_META: Record<string, any> = {
                            purchase_scan: {
                              id: 'purchase_scan',
                              label: "Purchase Scan",
                              icon: <Icon name="scanner" className={`w-4 h-4 mr-3 ${isLimitReached ? 'text-red-500' : 'text-emerald-500'}`} />,
                              onClick: () => { if (isLimitReached) { handleLimitReached(); } else { setIsBulkUploadOpen(true); } setIsScannerMenuOpen(false); },
                              className: `flex items-center w-full text-left px-4 py-2 text-sm ${isLimitReached ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'text-gray-700 hover:bg-gray-100'} border-t border-gray-50`,
                              extraLabel: isLimitReached && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-red-100 px-1.5 py-0.5 rounded">Limit Reached</span>
                            },
                            pending_purchase: {
                              id: 'pending_purchase',
                              label: "Pending Purchase",
                              icon: <Icon name="package" className="w-4 h-4 mr-3 text-purple-500" />,
                              onClick: () => { onNavigate('Pending Purchases' as any); setIsScannerMenuOpen(false); },
                              className: "flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            },
                            bank_upload: {
                              id: 'bank_upload',
                              label: "Bank Statement Upload",
                              icon: <Icon name="bank" className={`w-4 h-4 mr-3 ${isLimitReached ? 'text-red-500' : 'text-indigo-500'}`} />,
                              onClick: () => { if (isLimitReached) { handleLimitReached(); } else { setIsBankUploadModalOpen(true); } setIsScannerMenuOpen(false); },
                              className: `flex items-center w-full text-left px-4 py-2 text-sm ${isLimitReached ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'text-gray-700 hover:bg-gray-100'} border-t border-gray-50`,
                              extraLabel: isLimitReached && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-red-100 px-1.5 py-0.5 rounded">Limit Reached</span>
                            },
                            sales_excel_upload: {
                              id: 'sales_excel_upload',
                              label: "Sales Excel Upload",
                              icon: <Icon name="file-spreadsheet" className="w-4 h-4 mr-3 text-blue-500" />,
                              onClick: () => { setIsSalesExcelWorkflowOpen(true); setIsScannerMenuOpen(false); },
                              className: "flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            },
                            upload_for_excel: {
                              id: 'upload_for_excel',
                              label: "UPLOAD FOR EXCEL",
                              icon: <Icon name="document" className={`w-4 h-4 mr-3 ${isLimitReached ? 'text-red-500' : 'text-gray-500'}`} />,
                              onClick: () => {
                                if (isLimitReached) {
                                  handleLimitReached();
                                } else {
                                  setExtractionMode('zoho');
                                  setScanType('bulk');
                                  setScannerFiles(null);
                                  setIsInvoiceScannerOpen(true);
                                }
                                setIsScannerMenuOpen(false);
                              },
                              className: `flex items-center w-full text-left px-4 py-2 text-sm ${isLimitReached ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'text-gray-700 hover:bg-gray-100'} border-t border-gray-50`,
                              extraLabel: isLimitReached && <span className="ml-auto text-[10px] font-bold uppercase tracking-wider bg-red-100 px-1.5 py-0.5 rounded">Limit Reached</span>
                            }
                          };

                          return allowedOptions.map((key) => {
                            const option = UPLOAD_OPTION_META[key];
                            if (!option) return null;

                            return (
                              <React.Fragment key={key}>
                                <button
                                  onClick={option.onClick}
                                  className={option.className}
                                  role="menuitem"
                                >
                                  <div className="flex items-center">
                                    {option.icon}
                                    {option.label}
                                    {option.extraLabel}
                                  </div>
                                </button>
                              </React.Fragment>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Single scan input */}
            <input
              type="file"
              ref={singleScanInputRef}
              onClick={(e) => { if (e.target) (e.target as any).value = null; }}
              onChange={handleSingleScanFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
            />

            {/* Multi-file scanner input for tally/other modes */}
            <input
              type="file"
              ref={scannerInputRef}
              onClick={(e) => { if (e.target) (e.target as any).value = null; }}
              onChange={handleScannerFileChange}
              accept="image/*,.pdf"
              multiple
              className="hidden"
            />

            <input
              type="file"
              ref={masterScannerInputRef}
              onClick={(e) => { if (e.target) (e.target as any).value = null; }}
              onChange={handleMasterScannerFileChange}
              accept="image/*,.pdf"
              multiple
              className="hidden"
            />

            {/* Zoho multi-file scanner input */}
            <input
              type="file"
              ref={zohoScannerInputRef}
              onChange={handleZohoScannerFileChange}
              accept="image/*,.pdf,.xlsx,.xls,.csv"
              multiple
              className="hidden"
            />

            {/* SAP multi-file scanner input */}
            <input
              type="file"
              ref={sapScannerInputRef}
              onChange={handleSapScannerFileChange}
              accept="image/*,.pdf,.xlsx,.xls,.csv"
              multiple
              className="hidden"
            />

            <input
              type="file"
              ref={excelInputRef}
              onChange={handleExcelFileChange}
              accept=".xlsx, .xls"
              className="hidden"
            />



            <input
              type="file"
              ref={jsonInputRef}
              onChange={handleJsonFileChange}
              accept=".json"
              className="hidden"
            />

            <input
              type="file"
              ref={imageInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (voucherType === 'Purchase') setPurchaseSupportingDocument(file);
                  showInfo(`File "${file.name}" attached for manual entry.`);
                }
              }}
              accept="image/*,.pdf"
              className="hidden"
            />

            <style dangerouslySetInnerHTML={{
              __html: `
                .form-label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem; }
                .form-input { display: block; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); outline: none; transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out; }
                .form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 1px #3b82f6; }
                .table-input {
                  width: 100%;
                  border: 1px solid transparent;
                  padding: 0.5rem 0.75rem;
                  background-color: transparent;
                  outline: none;
                  border-radius: 0.375rem;
                  transition: all 0.2s;
                  color: #1e293b;
                }
                .table-input:focus {
                  background-color: white;
                  box-shadow: 0 0 0 1px #3b82f6;
                }
                .table-input[readOnly] {
                  background-color: #f9fafb;
                  color: #4b5563;
                  cursor: not-allowed;
                }
                .table-header { padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; background-color: #f9fafb; }
              `
            }} />


            <div className={`border-0 p-0 m-0 contents ${isReadOnlyMode ? 'opacity-90 select-none' : ''}`}>
              {voucherType === 'Sales' && <SalesVoucher prefilledData={localPrefilledData} clearPrefilledData={handleClearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} customers={richCustomers} onRefreshCustomers={fetchRichData} companyDetails={companyDetails} isReadOnlyMode={isReadOnlyMode} onAddVouchers={onAddVouchers} />}
              {voucherType === 'Payment' && (
                <PaymentVoucherSingle
                  prefilledData={localPrefilledData}
                  clearPrefilledData={handleClearPrefilledData}
                  isLimitReached={isLimitReached}
                  onLimitReached={handleLimitReached}
                  isReadOnlyMode={isReadOnlyMode}
                  onAddVouchers={onAddVouchers}
                />
              )}
              {voucherType === 'Receipt' && (
                <ReceiptVoucher
                  prefilledData={localPrefilledData}
                  clearPrefilledData={handleClearPrefilledData}
                  isLimitReached={isLimitReached}
                  onLimitReached={handleLimitReached}
                  isReadOnlyMode={isReadOnlyMode}
                  onAddVouchers={onAddVouchers}
                />
              )}
              {voucherType === 'Purchase' && renderPurchaseForm()}
              {voucherType === 'Contra' && (
                <fieldset disabled={isReadOnlyMode} className={isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}>
                  {renderSimpleForm(voucherType)}
                </fieldset>
              )}
              {voucherType === 'Journal' && (
                <fieldset disabled={isReadOnlyMode} className={isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}>
                  {renderJournalForm()}
                </fieldset>
              )}
              {voucherType === 'Expenses' && (
                <fieldset disabled={isReadOnlyMode} className={isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}>
                  {renderExpensesForm()}
                </fieldset>
              )}
              {voucherType === 'Credit Note' && renderCreditNoteForm()}
              {voucherType === 'Debit Note' && (
                <DebitNoteVoucher
                  prefilledData={localPrefilledData}
                  clearPrefilledData={handleClearPrefilledData}
                  companyDetails={companyDetails}
                  onAddVouchers={onAddVouchers}
                  isReadOnlyMode={isReadOnlyMode}
                />
              )}
            </div>

            {!isReadOnlyMode && (
              <>
                {voucherType === 'Purchase' && (
                  purchaseActiveTab !== 'transit' ? (
                    <button
                      onClick={() => {
                        setShowPurchaseMismatches(true);
                        const hasMismatch = purchaseItems.some(item => item.rateMismatch || item.qtyMismatch);
                        if (hasMismatch) {
                          showError("Please resolve Quantity or Rate mismatches before proceeding.");
                          return;
                        }

                        if (purchaseActiveTab === 'supplier') {
                          if (invoiceInForeignCurrency === 'Yes') setPurchaseActiveTab('supply_foreign');
                          else setPurchaseActiveTab('supply');
                        }
                        else if (purchaseActiveTab === 'supply_foreign') setPurchaseActiveTab('supply_inr');
                        else if (purchaseActiveTab === 'supply_inr') setPurchaseActiveTab('due');
                        else if (purchaseActiveTab === 'supply') setPurchaseActiveTab('due');
                        else if (purchaseActiveTab === 'due') setPurchaseActiveTab('transit');
                      }}
                      className="erp-button-primary"
                    >
                      Next
                    </button>
                  ) : (
                    activeOcrFileHash ? (
                      <div className="flex space-x-3 mt-4">
                        <button onClick={handleSaveChanges} className="erp-button-primary bg-indigo-600 hover:bg-indigo-700">Save Changes</button>
                        <button onClick={resetForm} className="erp-button-secondary">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex space-x-3 mt-4">
                        <button disabled={isSubmitting} onClick={() => handleSaveVoucher(false)} className={`erp-button-primary ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>{isSubmitting ? 'Posting...' : 'Post & Close'}</button>
                        <button disabled={isSubmitting} onClick={() => handleSaveVoucher(true)} className={`erp-button-secondary border-indigo-200 text-indigo-700 hover:bg-indigo-50 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>Post & Print/Email</button>
                        <button onClick={resetForm} className="erp-button-secondary">Cancel</button>
                      </div>
                    )
                  )
                )}

                {voucherType === 'Credit Note' && (
                  creditNoteActiveTab !== 'transit' ? (
                    <button
                      onClick={() => {
                        const creditTabs = cnInForeignCurrency === 'Yes'
                          ? ['invoice', 'items_foreign', 'items_inr', 'due', 'transit']
                          : ['invoice', 'items', 'due', 'transit'];

                        const idx = creditTabs.indexOf(creditNoteActiveTab);
                        if (idx >= 0 && idx < creditTabs.length - 1) {
                          setCreditNoteActiveTab(creditTabs[idx + 1] as any);
                        }
                      }}
                      className="erp-button-primary"
                    >
                      Next
                    </button>
                  ) : (
                    <div className="flex space-x-3 mt-4">
                      <button disabled={isSubmitting} onClick={() => handleSaveVoucher(false)} className={`erp-button-primary ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>{isSubmitting ? 'Posting...' : 'Post & Close'}</button>
                      <button disabled={isSubmitting} onClick={() => handleSaveVoucher(true)} className={`erp-button-secondary border-indigo-200 text-indigo-700 hover:bg-indigo-50 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>Post & Print/Email</button>
                    </div>
                  )
                )}

                {!['Sales', 'Payment', 'Receipt', 'Purchase', 'Credit Note', 'Debit Note'].includes(voucherType) && (
                  <div className="flex space-x-3 mt-4">
                    <button disabled={isSubmitting} onClick={() => handleSaveVoucher(false)} className={`erp-button-primary ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>{isSubmitting ? 'Posting...' : 'Post & Close'}</button>
                    <button disabled={isSubmitting} onClick={() => handleSaveVoucher(true)} className={`erp-button-secondary border-indigo-200 text-indigo-700 hover:bg-indigo-50 ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>Post & Print/Email</button>
                  </div>
                )}
              </>
            )}
          </div>


          {isTallyMasterScannerOpen && (
            <TallyMasterScannerModal
              initialFiles={masterScannerFiles}
              onClose={() => {
                setIsTallyMasterScannerOpen(false);
                setMasterScannerFiles(null);
                if (masterScannerInputRef.current) masterScannerInputRef.current.value = '';
              }}
              onUpload={(data) => {
                console.log('[VouchersPage] Tally Master records received:', data.length);
              }}
            />
          )}

          {/* Invoice Scanner Modal */}
          {isInvoiceScannerOpen && (
            <InvoiceScannerModal
              extractionMode={extractionMode as any}
              scanType={scanType}
              initialFiles={scannerFiles}
              voucherType={voucherType}
              onClose={() => {
                setIsInvoiceScannerOpen(false);
                setScannerFiles(null);
                if (singleScanInputRef.current) singleScanInputRef.current.value = '';
                if (scannerInputRef.current) scannerInputRef.current.value = '';
                refetch(); // Refresh usage after scan
              }}
              onExtractionSuccess={(extractedData) => {
                if (voucherType !== 'Purchase' || extractionMode !== 'ai_native') return;

                validateVendorFromInvoice(
                  extractedData.vendor_name,
                  extractedData.gstin,
                  extractedData.state,
                  extractedData.bill_from,
                  extractedData.branch
                );
              }}

              onUpload={(data) => {
                console.log('[VouchersPage] Data received from InvoiceScannerModal:', data);
                const firstRow = data[0];

                if (voucherType === 'Purchase' || voucherType === 'Debit Note') {
                  // Map flat "Finpixe schema" columns to Purchase form internal state
                  // Column names exactly match VOUCHER_COLUMN_SCHEMAS['Purchase']

                  // "Supplier Invoice No." (with dot) — also tolerate legacy name without dot
                  const supplierInvNo = firstRow['Supplier Invoice No.'] || firstRow['Supplier Invoice No'] || '';
                  if (supplierInvNo) setInvoiceNo(supplierInvNo);

                  // Flexible mapping for Party/Vendor
                  const partyVal = firstRow['Vendor Name'] || firstRow['Buyer/Supplier - Mailing Name'] || '';
                  if (partyVal) handlePartyChange(partyVal);

                  if (firstRow['GSTIN']) setGstin(firstRow['GSTIN']);

                  // Branch
                  const branchVal = firstRow['Branch'] || '';
                  if (branchVal) setSelectedBranch(branchVal);

                  // Date — new schema: "Date"; legacy Tally: "Voucher Date"
                  if (firstRow['Date'] || firstRow['Voucher Date']) {
                    const formattedDate = formatDateForInput(firstRow['Date'] || firstRow['Voucher Date']) || getTodayDate();
                    setDate(formattedDate);
                    setSupplierInvoiceDate(formattedDate);
                  }

                  // Bill From address — new schema uses granular sub-fields
                  if (firstRow['Bill From - Address Line 1']) setBillFromAddress1(firstRow['Bill From - Address Line 1']);
                  if (firstRow['Bill From - Address Line 2']) setBillFromAddress2(firstRow['Bill From - Address Line 2']);
                  if (firstRow['Bill From - City']) setBillFromCity(firstRow['Bill From - City']);
                  if (firstRow['Bill From - State']) setBillFromState(firstRow['Bill From - State']);
                  if (firstRow['Bill From - Pincode']) setBillFromPincode(firstRow['Bill From - Pincode']);
                  if (firstRow['Bill From - Country']) setBillFromCountry(firstRow['Bill From - Country']);

                  // Ship From address
                  if (firstRow['Ship From - Address Line 1']) setShipFromAddress1(firstRow['Ship From - Address Line 1']);
                  if (firstRow['Ship From - Address Line 2']) setShipFromAddress2(firstRow['Ship From - Address Line 2']);
                  if (firstRow['Ship From - City']) setShipFromCity(firstRow['Ship From - City']);
                  if (firstRow['Ship From - State']) setShipFromState(firstRow['Ship From - State']);
                  if (firstRow['Ship From - Pincode']) setShipFromPincode(firstRow['Ship From - Pincode']);
                  if (firstRow['Ship From - Country']) setShipFromCountry(firstRow['Ship From - Country']);

                  // Additional Purchase Header Fields
                  const purchaseOrderNoVal = firstRow['Purchase Order No.'] || '';
                  if (purchaseOrderNoVal) setPurchaseOrderNo(purchaseOrderNoVal);

                  const voucherSeriesVal = firstRow['Purchase Voucher Series'] || '';
                  if (voucherSeriesVal) setSelectedPurchaseConfig(voucherSeriesVal);

                  const inputType = firstRow['Input Type'] || '';
                  if (inputType) {
                    if (inputType.toLowerCase().includes('interstate')) setPurchaseInputTypes(['Interstate']);
                    else if (inputType.toLowerCase().includes('import')) setPurchaseInputTypes(['Import']);
                    else setPurchaseInputTypes(['Intrastate']);
                  }

                  const foreignCurrVal = firstRow['Foreign Currency'] || '';
                  if (foreignCurrVal) {
                    setInvoiceInForeignCurrency(foreignCurrVal.toLowerCase() === 'yes' ? 'Yes' : 'No');
                  }

                  const conversionRateVal = firstRow['Conversion Rate'] || '';
                  if (conversionRateVal) setExchangeRate(conversionRateVal);

                  const currencyVal = firstRow['Currency'] || '';
                  if (currencyVal) setVendorBillingCurrency(currencyVal);

                  const posVal = firstRow['Place of Supply'] || '';
                  if (posVal) setBillFromState(posVal);

                  // Summary / Due Details
                  if (firstRow['TDS/TCS under Income Tax']) setPurchaseTdsIt(firstRow['TDS/TCS under Income Tax']);
                  if (firstRow['Advance Paid']) setPurchaseAdvancePaid(firstRow['Advance Paid']);
                  if (firstRow['Amount Due']) setPurchaseToPay(firstRow['Amount Due']);
                  if (firstRow['Posting Note']) setPurchasePostingNote(firstRow['Posting Note']);

                  // Transit Details
                  if (firstRow['Received In']) setPurchaseTransitReceivedIn(firstRow['Received In']);
                  if (firstRow['Mode of Transport']) setPurchaseTransitMode(firstRow['Mode of Transport']);
                  if (firstRow['Received Date']) setPurchaseTransitReceiptDate(formatDateForInput(firstRow['Received Date']) || getTodayDate());
                  if (firstRow['Received Time']) setPurchaseTransitReceiptTime(firstRow['Received Time']);
                  if (firstRow['Received Quantity']) setPurchaseTransitReceivedQty(firstRow['Received Quantity']);
                  if (firstRow['Delivery Type']) setPurchaseTransitDeliveryType(firstRow['Delivery Type']);
                  if (firstRow['Transporter ID/GSTIN']) setPurchaseTransitTransporterId(firstRow['Transporter ID/GSTIN']);
                  if (firstRow['Transporter Name']) setPurchaseTransitTransporterName(firstRow['Transporter Name']);
                  if (firstRow['Vehicle No.']) setPurchaseTransitVehicleNo(firstRow['Vehicle No.']);
                  if (firstRow['LR/GR/Consignment No']) setPurchaseTransitLrGrConsignment(firstRow['LR/GR/Consignment No']);

                  const mappedItems = data.map((row: any, idx: number) => {
                    const igst = parseFloat(row['IGST'] || row['Integrated Tax (IGST)'] || '0') || 0;
                    const cgst = parseFloat(row['CGST'] || row['Central Tax (CGST)'] || '0') || 0;
                    const sgst = parseFloat(row['SGST/UTGST'] || row['SGST'] || row['State Tax (SGST)'] || '0') || 0;
                    const cess = parseFloat(row['Cess'] || '0') || 0;
                    const taxable = parseFloat(row['Taxable Value'] || '0') || 0;
                    // If Invoice Value not extracted directly, derive it
                    const rawInv = parseFloat(row['Invoice Value'] || row['Item Amount'] || '0') || 0;
                    const invoiceValue = rawInv > 0 ? rawInv : (taxable + igst + cgst + sgst + cess) || taxable;

                    return {
                      id: (Date.now() + idx).toString(),
                      itemCode: row['Item Code'] || '',
                      itemName: row['Item Name'] || '',
                      hsnSac: row['HSN/SAC'] || '',
                      qty: parseFloat(row['Qty'] || row['Quantity'] || '0') || 0,
                      uom: row['UOM'] || '',
                      rate: parseFloat(row['Item Rate'] || row['Rate'] || '0') || 0,
                      taxableValue: taxable,
                      foreignRate: parseFloat(row['Rate (FC)'] || '0') || 0,
                      foreignAmount: parseFloat(row['Amount (FC)'] || '0') || 0,
                      igst,
                      cgst,
                      sgst,
                      cess,
                      invoiceValue,
                      description: row['Description'] || '',
                      poRate: null,
                      invoiceRate: parseFloat(row['Item Rate'] || row['Rate'] || '0') || null,
                      rateMismatch: false,
                      poQty: null,
                      invoiceQty: parseFloat(row['Qty'] || row['Quantity'] || '0') || null,
                      qtyMismatch: false,
                      grnQty: null,
                      sourcePoNo: null
                    };
                  });
                  console.log('[VouchersPage] Mapped Purchase Items:', mappedItems);
                  setPurchaseItems(mappedItems);
                } else {
                  // For Sales, Payment, Receipt: use reconstructed ExtractedInvoiceData for sub-components
                  const lineItems = data.map((row: any) => ({
                    itemDescription: row['Item Name'] || '',
                    hsnCode: row['HSN/SAC'] || '',
                    // New schema: "Qty" — also tolerate legacy "Quantity"
                    quantity: parseFloat(row['Qty'] || row['Quantity'] || '0') || 0,
                    // New schema: "Item Rate" — also tolerate legacy "Rate"
                    rate: parseFloat(row['Item Rate'] || row['Rate'] || '0') || 0,
                    // New schema: "Invoice Value" per row — also tolerate legacy "Item Amount"
                    amount: parseFloat(row['Invoice Value'] || row['Item Amount'] || '0') || 0,
                    cgst: parseFloat(row['CGST'] || '0') || 0,
                    sgst: parseFloat(row['SGST/UTGST'] || row['SGST'] || '0') || 0,
                    igst: parseFloat(row['IGST'] || '0') || 0,
                    cess: parseFloat(row['Cess'] || '0') || 0,
                    taxableValue: parseFloat(row['Taxable Value'] || '0') || 0
                  }));

                  // Compute totals by summing per-row values
                  const computedTaxableValue = data.reduce((s: number, r: any) => s + (parseFloat(r['Taxable Value'] || '0') || 0), 0);
                  const computedCgst = data.reduce((s: number, r: any) => s + (parseFloat(r['CGST'] || '0') || 0), 0);
                  // Schema uses "SGST/UTGST" as the unified key
                  const computedSgst = data.reduce((s: number, r: any) => s + (parseFloat(r['SGST/UTGST'] || r['SGST'] || '0') || 0), 0);
                  const computedIgst = data.reduce((s: number, r: any) => s + (parseFloat(r['IGST'] || '0') || 0), 0);
                  const computedCess = data.reduce((s: number, r: any) => s + (parseFloat(r['Cess'] || '0') || 0), 0);
                  const computedInvoiceValue = data.reduce((s: number, r: any) => s + (parseFloat(r['Invoice Value'] || r['Item Amount'] || '0') || 0), 0);

                  const reconstructed: any = {
                    sellerName: firstRow['Customer Name'] || firstRow['Vendor Name'] || firstRow['Buyer/Supplier - Mailing Name'] || '',
                    // New schema: "Sales Invoice No." (with dot)
                    invoiceNumber: firstRow['Sales Invoice No.'] || firstRow['Sales Invoice No'] || firstRow['Supplier Invoice No.'] || firstRow['Supplier Invoice No'] || '',
                    // New schema: "Date" (was "Voucher Date")
                    invoiceDate: formatDateForInput(firstRow['Date'] || firstRow['Voucher Date'] || '') || getTodayDate(),
                    subtotal: computedTaxableValue,
                    cgstAmount: computedCgst,
                    sgstAmount: computedSgst,
                    igstAmount: computedIgst,
                    cessAmount: computedCess,
                    totalAmount: computedInvoiceValue,
                    lineItems,
                    // Additional Sales Fields for direct sync
                    gstin: firstRow['GSTIN'] || '',
                    placeOfSupply: firstRow['Place of Supply'] || '',
                    stateType: (firstRow['State Type'] || 'within').toLowerCase(),
                    invoiceType: firstRow['Invoice Type'] || 'Regular',
                    currency: firstRow['Currency'] || '',
                    exchangeRate: parseFloat(firstRow['Conversion Rate'] || '0') || 0,
                    billToAddress1: firstRow['Bill To - Address Line 1'] || '',
                    billToAddress2: firstRow['Bill To - Address Line 2'] || '',
                    billToCity: firstRow['Bill To - City'] || '',
                    billToState: firstRow['Bill To - State'] || '',
                    billToPincode: firstRow['Bill To - Pincode'] || '',
                    billToCountry: firstRow['Bill To - Country'] || '',
                    // Summary Fields
                    stateCess: firstRow['State Cess'] || '',
                    tdsIncomeTax: firstRow['TDS/TCS under Income Tax'] || '',
                    tdsGst: firstRow['TDS/TCS under GST'] || '',
                    advanceAmount: firstRow['Advance'] || '',
                    payable: firstRow['Payable'] || '',
                    postingNote: firstRow['Posting Note:'] || '',
                    // Dispatch Fields
                    dispatchFrom: firstRow['Dispatch From'] || '',
                    modeOfTransport: firstRow['Mode of Transport'] || '',
                    dispatchDate: firstRow['Dispatch Date'] || '',
                    dispatchTime: firstRow['Dispatch Time'] || '',
                    transporterId: firstRow['Transporter ID/GSTIN'] || '',
                    transporterName: firstRow['Transporter Name'] || '',
                    vehicleNo: firstRow['Vehicle No.'] || '',
                    lrGrConsignment: firstRow['LR/GR/Consignment No'] || ''
                  };
                  console.log('[VouchersPage] Reconstructed PrefilledData:', reconstructed);
                  setLocalPrefilledData(reconstructed);
                }
              }}
            />
          )}

          {/* Create Vendor Modal */}
          {isCreateVendorModalOpen && (
            <CreateNewVendorFullModal
              onClose={() => setIsCreateVendorModalOpen(false)}
              onVendorCreated={(vendorName, newId) => {
                showSuccess('Vendor Created Successfully!');
                setIsCreateVendorModalOpen(false);
                setVendorValidationStatus('FOUND');
                setVendorMatchedBy('Newly Created');
                setIsVendorDisabled(true);
                setParty(vendorName);
                if (newId) setVendorId(newId);
                handlePartyChange(vendorName, newId);
                fetchRichData();
              }}
            />
          )}

          {/* Create GRN Modal */}
          {isCreateGRNModalOpen && (
            <CreateGRNModal
              mainVendorName={voucherType === 'Purchase' ? party : cnCustomer}
              mainBranch={voucherType === 'Purchase' ? selectedBranch : cnBranch}
              mainGstin={voucherType === 'Purchase' ? gstin : cnGstin}
              context={voucherType === 'Purchase' ? 'Purchase' : 'Credit Note'}
              onClose={() => setIsCreateGRNModalOpen(false)}
              onSave={async (data) => {
                try {
                  const response = await apiService.createInventoryOperationGRN(data);
                  if (voucherType === 'Purchase') {
                    setGrnRefNo(response.grn_no);
                  } else {
                    setCnGrnRefNo(response.grn_no);
                  }
                  showSuccess('GRN Created Successfully!');

                  if (data.items && data.items.length > 0) {
                    const mappedItems = data.items.map((item: any, index: number) => {
                      const stockItem = stockItems.find((s: any) =>
                        (s.item_code || s.code) === item.item_code || (s.item_name || s.name) === item.item_name
                      );

                      const qty = item.accepted_qty || item.received_qty || 0;
                      const rate = stockItem?.standard_rate || stockItem?.rate || 0;
                      const taxableValue = qty * rate;

                      return {
                        id: (index + 1).toString(),
                        itemCode: item.item_code || stockItem?.item_code || stockItem?.code || '',
                        itemName: item.item_name || stockItem?.item_name || stockItem?.name || '',
                        hsnSac: item.hsn_sac_code || item.hsn_code || item.hsn_sac || stockItem?.hsn_sac || stockItem?.hsn_code || '',
                        qty: qty,
                        uom: item.uom || stockItem?.uom || '',
                        rate: rate,
                        taxableValue: taxableValue,
                        foreignRate: 0,
                        foreignAmount: 0,
                        igst: 0,
                        cgst: 0,
                        sgst: 0,
                        cess: 0,
                        invoiceValue: taxableValue,
                        description: item.remarks || ''
                      };
                    });
                    setPurchaseItems(mappedItems);
                  }

                  // Add to pending list and select it
                  if (response.grn_no) {
                    setPendingGRNs(prev => [...prev, response]);
                    if (voucherType === 'Purchase') {
                      setGrnRefNo(response.grn_no);
                    } else {
                      setCnGrnRefNo(response.grn_no);
                    }
                  }

                  setIsCreateGRNModalOpen(false);
                } catch (error) {
                  console.error("Failed to create GRN");
                  showError("Failed to create GRN. Please check inputs.");
                }
              }}
            />
          )}
          {/* Upgrade Modal */}
          {
            isUpgradeModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-gray-900">Upgrade Plan</h3>
                    <button onClick={() => setIsUpgradeModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                      <Icon name="x" className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="text-center mb-6">
                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 mb-4">
                      <Icon name="upload" className="h-6 w-6 text-indigo-600" />
                    </div>
                    <h4 className="text-lg font-medium text-gray-900">Upload Limit Reached</h4>
                    <p className="text-sm text-gray-500 mt-2">
                      You have reached the invoice upload limit ({subscriptionUsage?.limit}) for your current plan ({subscriptionUsage?.plan}).
                    </p>
                    <div className="mt-4 bg-gray-50 p-4 rounded text-left">
                      <p className="text-sm text-gray-700"><strong>Current Usage:</strong> {subscriptionUsage?.used}</p>
                      <p className="text-sm text-gray-700"><strong>Reset Date:</strong> {new Date(subscriptionUsage?.cycle_start).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => setIsUpgradeModalOpen(false)}
                      className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => window.location.href = '/?page=Settings&tab=Subscription'}
                      className="px-4 py-2 bg-indigo-600 border border-transparent rounded text-sm font-medium text-white hover:bg-indigo-700"
                    >
                      Upgrade to Pro
                    </button>
                  </div>
                </div>
              </div>
            )
          }
          {/* Terms & Conditions Master Modal */}
          {isTermsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="bg-white rounded-[4px] shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">Edit Terms &amp; Conditions</h2>
                    {masterTermsData && (
                      <p className="text-sm text-gray-500 mt-0.5">{masterTermsData.vendor_name || masterTermsData.customer_name}</p>
                    )}
                  </div>
                  <button
                    onClick={() => setIsTermsModalOpen(false)}
                    className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-[4px] text-gray-400 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
                  {/* Credit Period */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Credit Period</label>
                    <input
                      type="text"
                      value={draftCreditPeriod}
                      onChange={(e) => setDraftCreditPeriod(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400"
                      placeholder="e.g., 30 Days"
                    />
                  </div>

                  {/* Credit Terms */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Credit Terms</label>
                    <textarea
                      value={draftCreditTerms}
                      onChange={(e) => setDraftCreditTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                      rows={2}
                      placeholder="Payment terms..."
                    />
                  </div>

                  {/* Delivery Terms */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Delivery Terms</label>
                    <textarea
                      value={draftDeliveryTerms}
                      onChange={(e) => setDraftDeliveryTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                      rows={2}
                      placeholder="FOB, CIF, etc..."
                    />
                  </div>

                  {/* Penalty Terms */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Penalty Terms</label>
                    <textarea
                      value={draftPenaltyTerms}
                      onChange={(e) => setDraftPenaltyTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                      rows={2}
                      placeholder="Late delivery penalties..."
                    />
                  </div>

                  {/* Warranty Details */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Warranty / Guarantee Details</label>
                    <textarea
                      value={draftWarrantyDetails}
                      onChange={(e) => setDraftWarrantyDetails(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                      rows={2}
                      placeholder="Warranty period and scope..."
                    />
                  </div>

                  {/* Force Majeure */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Force Majeure</label>
                    <textarea
                      value={draftForceMajeure}
                      onChange={(e) => setDraftForceMajeure(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                      rows={2}
                      placeholder="Standard force majeure clause..."
                    />
                  </div>

                  {/* Dispute Terms */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Dispute &amp; Redressal</label>
                    <textarea
                      value={draftDisputeTerms}
                      onChange={(e) => setDraftDisputeTerms(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-gray-800 focus:ring-indigo-500 focus:border-indigo-500 placeholder-gray-400 resize-none"
                      rows={2}
                      placeholder="Jurisdiction and arbitration..."
                    />
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                  <button
                    onClick={() => setIsTermsModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-[4px] hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveTermsModal}
                    className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-[4px] hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Save to Voucher
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Document Preview Modal */}
          {isPurchasePreviewModalOpen && (
            <div className="fixed inset-0 bg-black/75 z-[100] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
              <div className="w-full h-full max-w-6xl bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden animate-zoom-in">
                {/* Modal Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 leading-none">
                        Document Preview
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        {purchaseSupportingDocument?.name}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {purchasePreviewUrl && (
                      <a
                        href={purchasePreviewUrl}
                        download={purchaseSupportingDocument?.name}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                      </a>
                    )}
                    <button
                      onClick={() => setIsPurchasePreviewModalOpen(false)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Modal Body */}
                <div className="flex-1 bg-gray-100/50 relative overflow-auto flex items-center justify-center">
                  {purchaseSupportingDocument?.type.startsWith('image/') ? (
                    <img
                      src={purchasePreviewUrl || ''}
                      alt="Full Preview"
                      className="max-w-full max-h-full object-contain p-4"
                    />
                  ) : (
                    <iframe
                      src={purchasePreviewUrl || ''}
                      className="w-full h-full border-none bg-white"
                      title="PDF Preview"
                    />
                  )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-center">
                  <button
                    onClick={() => setIsPurchasePreviewModalOpen(false)}
                    className="px-10 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================== PURCHASE PRINT PREVIEW MODAL ===================== */}
          {showPurchasePrintPreview && postedPurchaseVoucherData && (
            <div className="fixed inset-0 bg-black/80 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-sm">
              <div className="w-full max-w-4xl bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '95vh' }}>
                {/* Modal Header */}
                <div className="flex justify-between items-center px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white">
                  <div className="flex items-center gap-3">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <div>
                      <h3 className="text-lg font-bold">Purchase Voucher Preview</h3>
                      <p className="text-indigo-200 text-xs">Supplier Invoice #{postedPurchaseVoucherData.supplier_invoice_no}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const printContent = document.getElementById('purchase-invoice-print-area');
                        if (!printContent) return;
                        const win = window.open('', '_blank');
                        if (!win) return;
                        win.document.write(`<html><head><title>Purchase Voucher ${postedPurchaseVoucherData.supplier_invoice_no}</title><style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#f5f5f5;font-weight:600}@media print{body{padding:0}}</style></head><body>${printContent.innerHTML}</body></html>`);
                        win.document.close();
                        win.focus();
                        win.print();
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                      Print
                    </button>
                    <button
                      onClick={() => {
                        setShowPurchasePrintPreview(false);
                        resetForm();
                      }}
                      className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {/* Purchase Content */}
                <div className="flex-1 overflow-auto bg-gray-100 p-6">
                  <div id="purchase-invoice-print-area" className="bg-white rounded-lg shadow-sm max-w-3xl mx-auto p-8">
                    {/* Company Header */}
                    <div className="flex justify-between items-start mb-6 pb-6 border-b-2 border-indigo-600">
                      <div>
                        {companyDetails?.name && (
                          <h2 className="text-xl font-bold text-gray-900">{companyDetails.name}</h2>
                        )}
                        <p className="text-sm text-gray-500">{companyDetails?.address || ''}</p>
                        {companyDetails?.gstin && <p className="text-xs text-gray-500 mt-1">GSTIN: {companyDetails.gstin}</p>}
                      </div>
                      <div className="text-right">
                        <div className="inline-block bg-indigo-600 text-white text-xs font-bold px-4 py-1 rounded-full mb-3">PURCHASE VOUCHER</div>
                        <table className="text-sm text-right">
                          <tbody>
                            <tr><td className="pr-4 text-gray-500 font-medium">Voucher No.</td><td className="font-bold text-gray-900">{postedPurchaseVoucherData.purchase_voucher_no}</td></tr>
                            <tr><td className="pr-4 text-gray-500 font-medium">Date</td><td className="font-bold text-gray-900">{postedPurchaseVoucherData.date}</td></tr>
                            {postedPurchaseVoucherData.supplier_invoice_no && <tr><td className="pr-4 text-gray-500 font-medium">Supplier Inv.</td><td className="text-gray-700">{postedPurchaseVoucherData.supplier_invoice_no}</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Vendor / Bill From */}
                    <div className="grid grid-cols-2 gap-6 mb-6">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Vendor</p>
                        <p className="font-semibold text-gray-900">{postedPurchaseVoucherData.vendor_name}</p>
                        {postedPurchaseVoucherData.gstin && <p className="text-xs text-gray-500">GSTIN: {postedPurchaseVoucherData.gstin}</p>}
                        {postedPurchaseVoucherData.bill_from && (
                          <p className="text-xs text-gray-600 mt-1">{postedPurchaseVoucherData.bill_from}</p>
                        )}
                      </div>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ship From</p>
                        <p className="text-xs text-gray-600">
                          {postedPurchaseVoucherData.ship_from || 'Same as Billing Address'}
                        </p>
                        {postedPurchaseVoucherData.input_type && <p className="text-xs text-gray-500 mt-1">Supply Type: {postedPurchaseVoucherData.input_type}</p>}
                      </div>
                    </div>

                    {/* Item Details */}
                    <div className="mb-6">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest px-2">Item Details</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      <table className="w-full text-sm mb-3">
                        <thead>
                          <tr className="bg-indigo-600 text-white">
                            <th className="px-3 py-2 text-left">#</th>
                            <th className="px-3 py-2 text-left">Item / Description</th>
                            <th className="px-3 py-2 text-center">HSN</th>
                            <th className="px-3 py-2 text-center">Qty</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Taxable</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(postedPurchaseVoucherData.items || []).map((item: any, i: number) => (
                            <tr key={i} className={i % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                              <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-900">
                                {item.itemName || item.itemCode}
                                {item.description && <div className="text-xs text-gray-500 font-normal">{item.description}</div>}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-500">{item.hsnSac || '-'}</td>
                              <td className="px-3 py-2 text-center">{item.qty} {item.uom}</td>
                              <td className="px-3 py-2 text-right font-mono">₹{Number(item.rate).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono">₹{Number(item.taxableValue).toFixed(2)}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold">₹{Number(item.invoiceValue).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end">
                        <div className="w-72 bg-indigo-50 rounded-lg p-4 border border-indigo-100">
                          <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between"><span className="text-gray-500">Taxable Amount</span><span className="font-mono">₹{Number(postedPurchaseVoucherData.totals?.taxableValue || 0).toFixed(2)}</span></div>
                            {Number(postedPurchaseVoucherData.totals?.cgst || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">CGST</span><span className="font-mono">₹{Number(postedPurchaseVoucherData.totals.cgst).toFixed(2)}</span></div>}
                            {Number(postedPurchaseVoucherData.totals?.sgst || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">SGST</span><span className="font-mono">₹{Number(postedPurchaseVoucherData.totals.sgst).toFixed(2)}</span></div>}
                            {Number(postedPurchaseVoucherData.totals?.igst || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">IGST</span><span className="font-mono">₹{Number(postedPurchaseVoucherData.totals.igst).toFixed(2)}</span></div>}
                            {Number(postedPurchaseVoucherData.totals?.cess || 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Cess</span><span className="font-mono">₹{Number(postedPurchaseVoucherData.totals.cess).toFixed(2)}</span></div>}
                            <div className="flex justify-between pt-2 border-t-2 border-indigo-600">
                              <span className="font-bold text-gray-900 text-base">Grand Total</span>
                              <span className="font-bold text-indigo-700 text-base font-mono">₹{Number(postedPurchaseVoucherData.totals?.invoiceValue || 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer / Signature */}
                    <div className="border-t-2 border-gray-200 pt-8 mt-4 flex justify-end">
                      <div className="text-right">
                        <div className="border-t border-gray-400 pt-2 w-44 text-xs text-gray-500 text-center">Authorised Signature</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer Buttons */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
                  <button
                    onClick={() => {
                      setShowPurchasePrintPreview(false);
                      resetForm();
                    }}
                    className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-100 text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        const email = prompt('Enter recipient email address:');
                        if (email) {
                          const subject = encodeURIComponent(`Purchase Voucher ${postedPurchaseVoucherData.purchase_voucher_no} from ${companyDetails?.name || 'Our Company'}`);
                          const body = encodeURIComponent(`Dear Team,\n\nPlease find attached Purchase Voucher No. ${postedPurchaseVoucherData.purchase_voucher_no} dated ${postedPurchaseVoucherData.date}.\n\nTotal Amount: ₹${Number(postedPurchaseVoucherData.totals?.invoiceValue || 0).toFixed(2)}\n\nRegards,\n${companyDetails?.name || ''}`);
                          window.open(`mailto:${email}?subject=${subject}&body=${body}`);
                        }
                      }}
                      className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                      Email Invoice
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isBulkUploadOpen && (
            <BulkInvoiceUploadModal
              voucherType={voucherType}
              isLimitReached={isLimitReached}
              activeSessionId={activeOcrSessionId}
              initialStep={activeOcrSessionId ? 'review' : 'upload'}
              onClose={() => {
                setIsBulkUploadOpen(false);
                setActiveOcrSessionId(null);
                useOcrWorkflowStore.getState().clearWorkflow();
                refetch(); // Refresh usage
              }}
              onEditRow={handleEditOcrRow}
              onFinalized={(summary) => {
                const created = summary.created ?? 0;
                const skipped = summary.skipped ?? 0;
                const failed = summary.failed ?? 0;
                // Extract the most specific error reason from the backend
                const firstError = summary.errors?.[0]?.error ?? '';
                const errorReason = firstError
                  ? ` Reason: ${firstError.slice(0, 120)}`
                  : '';
                if (created > 0 && failed === 0) {
                  showSuccess(`✅ Successfully saved ${created} invoice${created !== 1 ? 's' : ''} as Purchase Vouchers!`);
                } else if (created > 0 && failed > 0) {
                  showSuccess(`✅ Saved ${created} voucher${created !== 1 ? 's' : ''}. ${failed} had errors — check staging.`);
                } else if (created === 0 && skipped > 0 && failed === 0) {
                  showSuccess(`ℹ️ All ${skipped} invoice${skipped !== 1 ? 's' : ''} were already saved (duplicates skipped).`);
                } else if (created === 0 && failed > 0) {
                  showError(`⚠️ ${failed} invoice${failed !== 1 ? 's' : ''} could not be saved.${errorReason}`);
                } else {
                  showSuccess('Finalization complete.');
                }
                setIsBulkUploadOpen(false);
                if (created > 0) {
                  window.location.reload();
                }
              }}
            />
          )}


        </>
      )}
    </div>
  );
};

export default VouchersPage;



