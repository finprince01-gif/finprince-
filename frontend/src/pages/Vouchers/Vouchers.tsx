import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { usePermissions } from '../../hooks/usePermissions';
import { useSubscriptionUsage } from '../../hooks/useSubscriptionUsage';
import type { VoucherType, Ledger, StockItem, Voucher, SalesPurchaseVoucher, PaymentReceiptVoucher, ContraVoucher, JournalVoucher, JournalEntry, VoucherItem, ExtractedInvoiceData, CompanyDetails } from '../../types';
import Icon from '../../components/Icon';
import { apiService, httpClient } from '../../services';
import { showError, showSuccess, showInfo, confirm } from '../../utils/toast';

import MassUploadModal from '../../components/MassUploadModal';
import InvoiceScannerModal from '../../components/InvoiceScannerModal';
import BulkInvoiceUploadModal from '../../components/SmartInvoiceUploadModal';
import TallyMasterScannerModal from '../../components/TallyMasterScannerModal';
import ErrorBoundary from '../../components/ErrorBoundary';
import SalesVoucher from './SalesVoucher';
import PaymentVoucherSingle from './PaymentVoucherSingle';
import PaymentVoucherBulk from './PaymentVoucherBulk';
import ReceiptVoucher from './ReceiptVoucher';
import CreateGRNModal from '../../components/CreateGRNModal';
import SearchableSelect from '../../components/SearchableSelect';
import CreateVendorModal from '../../components/CreateVendorModal';
import SalesExcelUploadWorkflow from '../../components/SalesExcelUploadWorkflow';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5003';

// Let TypeScript know that the XLSX library is available globally
declare const XLSX: any;

interface VouchersPageProps {
  vouchers: Voucher[];
  ledgers: Ledger[];
  stockItems: StockItem[];
  onAddVouchers: (vouchers: Voucher[]) => void;
  prefilledData: ExtractedInvoiceData | null;
  clearPrefilledData: () => void;
  onInvoiceUpload: (file: File, voucherType?: string) => void;
  companyDetails: CompanyDetails;
  onMassUploadComplete: (vouchers: Voucher[]) => void;
  permissions: string[];
}

const getTodayDate = () => new Date().toISOString().split('T')[0];



const VouchersPage: React.FC<VouchersPageProps> = ({ vouchers, ledgers, stockItems, onAddVouchers, prefilledData, clearPrefilledData, onInvoiceUpload, companyDetails, onMassUploadComplete, permissions = [] }) => {

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

  const defaultVoucherType = availableVoucherTypes.length > 0 ? availableVoucherTypes[0].id : ('Purchase' as VoucherType);

  const [voucherType, setVoucherType] = useState<VoucherType>(defaultVoucherType);

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
  const [isOthersSubmenuOpen, setIsOthersSubmenuOpen] = useState(false);
  const [isTallySubmenuOpen, setIsTallySubmenuOpen] = useState(false);
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
  }, []);

  useEffect(() => {
    fetchRichData();
  }, [fetchRichData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (scannerMenuRef.current && !scannerMenuRef.current.contains(event.target as Node)) {
        setIsScannerMenuOpen(false);
        setIsOthersSubmenuOpen(false);
        setIsTallySubmenuOpen(false);
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
  const scannerInputRef = useRef<HTMLInputElement>(null);
  const [extractionMode, setExtractionMode] = useState<'finpixe' | 'tally'>('finpixe');

  // Tally Master Scanner Modal state
  const [isTallyMasterScannerOpen, setIsTallyMasterScannerOpen] = useState(false);
  const [masterScannerFiles, setMasterScannerFiles] = useState<FileList | null>(null);
  const masterScannerInputRef = useRef<HTMLInputElement>(null);
  const [uploadedInvoiceFiles, setUploadedInvoiceFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Bulk Upload State
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const bulkScannerInputRef = useRef<HTMLInputElement>(null);

  // Scan type: 'single' (Finpixe Single Scan) or 'bulk' handled via BulkInvoiceUploadModal
  const [scanType, setScanType] = useState<'single' | 'bulk'>('single');
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
      showError('FINPIXE SINGLE SCAN allows only one invoice. Use FINPIXE BULK SCAN for multiple invoices.');
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

  const openScanner = (mode: 'finpixe' | 'tally' = 'finpixe', type: 'single' | 'bulk' = 'single') => {
    setExtractionMode(mode);
    setScanType(type);
    if (isLimitReached) {
      handleLimitReached();
    } else if (mode === 'finpixe' && type === 'single') {
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

  const handleClearPrefilledData = () => {
    clearPrefilledData();
    setLocalPrefilledData(null);
  };

  const handleLimitReached = () => {
    setIsUpgradeModalOpen(true);
  };

  // Common state
  const [date, setDate] = useState(getTodayDate());
  const [party, setParty] = useState('');
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [narration, setNarration] = useState('');
  const [isNarrationLoading, setIsNarrationLoading] = useState(false);

  // Sales/Purchase
  const [invoiceNo, setInvoiceNo] = useState('');
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

  // Purchase Voucher Tabs
  const [purchaseActiveTab, setPurchaseActiveTab] = useState<'supplier' | 'supply' | 'supply_foreign' | 'supply_inr' | 'due' | 'transit'>('supplier');
  const [grnRefNo, setGrnRefNo] = useState('');
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
  }, [sameAsBillFrom, billFromAddress1, billFromAddress2, billFromAddress3, billFromCity, billFromPincode, billFromState, billFromCountry]);


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
  const [exchangeRate, setExchangeRate] = useState(''); // Added exchangeRate state
  const [purchaseLedger, setPurchaseLedger] = useState('');
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [selectedPurchaseItems, setSelectedPurchaseItems] = useState<string[]>([]);
  const [purchaseItems, setPurchaseItems] = useState([
    { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '' }
  ]);

  // Purchase Due Details State
  const [purchaseTdsGst, setPurchaseTdsGst] = useState('0.00');
  const [purchaseTdsIt, setPurchaseTdsIt] = useState('0.00');
  const [purchaseAdvancePaid, setPurchaseAdvancePaid] = useState('0.00');
  const [purchaseToPay, setPurchaseToPay] = useState('0.00');
  const [purchasePostingNote, setPurchasePostingNote] = useState('');
  const [purchaseTerms, setPurchaseTerms] = useState('');
  const [purchaseAdvanceRefs, setPurchaseAdvanceRefs] = useState<Array<{
    id: number;
    date: string;
    refNo: string;
    amount: string;
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

  // Item Options for Dropdowns
  const itemCodeOptions = React.useMemo(() =>
    Array.from(new Set(stockItems.map((item: any) => item.item_code || item.code).filter(Boolean) as string[])),
    [stockItems]
  );
  const itemNameOptions = React.useMemo(() =>
    Array.from(new Set(stockItems.map((item: any) => item.name || item.item_name).filter(Boolean) as string[])),
    [stockItems]
  );

  // From PORT (Local) - Renaming or reusing variables for clarity if needed, 
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
      // Fetch all POs when on Purchase Voucher, without needing vendor filter
      if (voucherType === 'Purchase') {
        setIsFetchingPOs(true);
        try {
          const res = await apiService.getVendorPurchaseOrders(); // Fetch all
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

    // Always trigger a fetch on mount and whenever the user switches between tabs on Purchase Voucher
    fetchPOs();
  }, [voucherType, purchaseActiveTab]);

  useEffect(() => {
    const fetchPODetails = async () => {
      if (purchaseOrderNo) {
        const selectedPO = availablePOs.find(p => p.po_number === purchaseOrderNo);
        if (selectedPO?.id) {
          try {
            const res = await apiService.getVendorPurchaseOrderById(selectedPO.id);
            if (res.success && res.data?.items) {
              const mappedItems = res.data.items.map((item: any, idx: number) => {
                const qty = parseFloat(item.quantity) || 0;
                const rate = parseFloat(item.final_rate) || 0;
                const gstAmount = parseFloat(item.gst_amount) || 0;
                const isInter = isInterState;

                return {
                  id: item.id?.toString() || String(idx),
                  itemCode: item.item_code || '',
                  itemName: item.item_name || '',
                  hsnSac: '',
                  qty: qty,
                  uom: item.uom || '',
                  rate: rate,
                  taxableValue: parseFloat(item.taxable_value) || (qty * rate),
                  foreignRate: 0,
                  foreignAmount: 0,
                  igst: isInter ? gstAmount : 0,
                  cgst: isInter ? 0 : (gstAmount / 2),
                  sgst: isInter ? 0 : (gstAmount / 2),
                  cess: 0,
                  invoiceValue: parseFloat(item.invoice_value) || 0,
                  description: item.description || ''
                };
              });

              setPurchaseItems(mappedItems.length > 0 ? mappedItems : [{ id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, foreignRate: 0, foreignAmount: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '' }]);

              setPurchaseAdvanceRefs([]);

              // Let's also auto-populate the party text if it isn't set yet.
              if (!party && selectedPO.vendor_name) {
                setParty(selectedPO.vendor_name);
              }
            }
          } catch (error) {
            console.error('Failed to fetch PO details:', error);
          }
        }
      } else {
        setPurchaseAdvanceRefs([]);
      }
    };
    fetchPODetails();
  }, [purchaseOrderNo, availablePOs, isInterState, party, setParty]);

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

  // Contra specific ledgers (Cash/Bank + OD/CC)
  const contraLedgers = useMemo(() => {
    return ledgers.filter(l => {
      const group = (l.group || '').toLowerCase();
      // Match "Cash and Bank Accounts" (fuzzy) & "Bank OD/CC Accounts"
      // Includes standard Tally groups: Bank Accounts, Cash-in-Hand, Bank OD A/c, Bank OCC A/c
      return (
        group.includes('cash') ||
        group.includes('bank') ||
        group.includes('od') ||
        group.includes('cc')
      );
    });
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
          if (purchaseConfigs && purchaseConfigs.length > 0 && !selectedPurchaseConfig) {
            const first = purchaseConfigs[0];
            setSelectedPurchaseConfig(first.voucher_name);

            if (first.enable_auto_numbering) {
              try {
                const res: any = await httpClient.get(`/api/masters/master-voucher-purchases/${first.id}/next-number/`);
                if (res?.invoice_number) setVoucherNumber(res.invoice_number);
              } catch { }
            }
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
            onMassUploadComplete(validVouchers);
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
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
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

        const getWorksheetRows = (preferredSheetNames: string[]) => {
          const sheetName = preferredSheetNames.find(name => workbook.Sheets[name]) || workbook.SheetNames[0];
          if (!sheetName) return [];
          const sheet = workbook.Sheets[sheetName];
          return XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, any>[];
        };

        if (voucherType === 'Purchase' || voucherType === 'Sales') {
          const rows = getWorksheetRows(['SalesPurchases', 'Invoices']);
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
              const gstRate = stockItem?.gstRate || 0;
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
          const rows = getWorksheetRows(['PaymentsReceipts', 'Invoices']);
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
          const rows = getWorksheetRows(['Contra', 'Invoices']);
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
          const rows = getWorksheetRows(['Journal', 'Invoices']);
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
          // Multiple vouchers - Bulk Review
          onMassUploadComplete(allVouchers);
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

  const handleDownloadTemplate = () => {
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

  // Recalculate all item taxes when transaction type (isInterState) changes
  useEffect(() => {
    // Safety check: only run if stockItems is defined
    if (!stockItems || !Array.isArray(stockItems)) {
      return;
    }

    setItems(currentItems => currentItems.map(item => {
      if (!item.name) return item;
      const stockItem = stockItems.find(si => si.name && si.name.toLowerCase() === item.name.toLowerCase());

      if (!stockItem) {
        return item;
      }

      const gstRate = stockItem.gstRate || 0;
      const taxableAmount = item.qty * item.rate;
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
  }, [isInterState, stockItems]);

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
    if (prefilledData) {



      // Keep current voucher type - don't change tabs, just populate form data

      if (voucherType === 'Purchase') {
        const partyLedger = ledgers.find(l => l.name.toLowerCase() === (prefilledData.sellerName || '').toLowerCase());
        const newIsInterState = (partyLedger && partyLedger.state && companyDetails.state)
          ? partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase()
          : false;

        setDate(formatDateForInput(prefilledData.invoiceDate) || getTodayDate());
        setInvoiceNo(prefilledData.invoiceNumber || '');
        setParty(prefilledData.sellerName || '');
        setIsInterState(newIsInterState);

        if (prefilledData.lineItems && prefilledData.lineItems.length > 0) {
          const newItems = prefilledData.lineItems.map(item => {
            const stockItem = stockItems.find(si => si.name?.toLowerCase() === (item.itemDescription || '').toLowerCase());
            const gstRate = stockItem?.gstRate || 18;
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
          setItems(newItems);
        } else {
          setItems([{ name: '', qty: 1, rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);
        }
      } else if (voucherType === 'Contra') {
        setDate(formatDateForInput(prefilledData.invoiceDate) || getTodayDate());
        setFromAccount(prefilledData.sellerName || '');
        setToAccount(prefilledData.invoiceNumber || ''); // Use invoice number as to account
        setSimpleAmount(prefilledData.totalAmount || 0);
      } else if (voucherType === 'Journal') {
        setDate(formatDateForInput(prefilledData.invoiceDate) || getTodayDate());
        // For journal, we could create entries based on the invoice data
        setEntries([
          { ledger: prefilledData.sellerName || '', note: '', refNo: '', debit: prefilledData.totalAmount || 0, credit: 0 },
          { ledger: '', note: '', refNo: '', debit: 0, credit: prefilledData.totalAmount || 0 }
        ]);
      }

      clearPrefilledData();
    }
  }, [prefilledData, clearPrefilledData, stockItems, ledgers, companyDetails.state]);

  const setAddressFields = useCallback((addressData: any) => {
    if (typeof addressData === 'string') {
      // Fallback parsing for single string address
      setBillFromAddress1(addressData);
      setBillFromAddress2('');
      setBillFromAddress3('');
      setBillFromCity('');
      setBillFromPincode('');
      setBillFromState('');
      setBillFromCountry('India');

      if (!sameAsBillFrom) {
        setShipFromAddress1(addressData);
        setShipFromAddress2('');
        setShipFromAddress3('');
        setShipFromCity('');
        setShipFromPincode('');
        setShipFromState('');
        setShipFromCountry('India');
      }
    } else if (addressData) {
      const a1 = addressData.addressLine1 || addressData.address_line_1 || '';
      const a2 = addressData.addressLine2 || addressData.address_line_2 || '';
      const a3 = addressData.addressLine3 || addressData.address_line_3 || '';
      const c = addressData.city || '';
      const p = addressData.pincode || '';
      const s = addressData.state || '';
      const co = addressData.country || 'India';

      setBillFromAddress1(a1);
      setBillFromAddress2(a2);
      setBillFromAddress3(a3);
      setBillFromCity(c);
      setBillFromPincode(p);
      setBillFromState(s);
      setBillFromCountry(co);

      if (!sameAsBillFrom) {
        setShipFromAddress1(a1);
        setShipFromAddress2(a2);
        setShipFromAddress3(a3);
        setShipFromCity(c);
        setShipFromPincode(p);
        setShipFromState(s);
        setShipFromCountry(co);
      }
    }
  }, [sameAsBillFrom]);

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

  const { partyLedgers, accountLedgers, allLedgers, partyOptions } = useMemo(() => {
    // Helper to identify cash/bank accounts robustly
    const isCashBank = (l: Ledger) => {
      const g = (l.group || '').toLowerCase();
      return g.includes('cash') || g.includes('bank') || g.includes('od') || g.includes('cc');
    };

    const accountLedgers = cashBankLedgers.length > 0
      ? cashBankLedgers
      : ledgers.filter(isCashBank);

    const allLedgers = [...ledgers];

    // partyLedgers (excluding cash/bank for Receipt/Payment party selection if needed)
    // For now, keeping it as all ledgers but we can filter it in the UI or here
    const partyLedgers = ledgers.filter(l => !isCashBank(l));

    // Combine Ledgers with rich Vendor/Customer names only (no combined branch names)
    // Filter out cash/bank accounts from party options to avoid accounting errors
    const partyOptions = [...new Set([
      ...ledgers.filter(l => !isCashBank(l)).map(l => l.name),
      ...richVendors.map(v => v.vendor_name),
      ...richCustomers.map(c => c.customer_name)
    ])].filter(Boolean);
    // Note: Branch/reference names are now shown in the separate "Branch" dropdown

    return { partyLedgers, accountLedgers, allLedgers, partyOptions };
  }, [ledgers, cashBankLedgers, richVendors, vendorGstDetails, richCustomers]);

  const handlePartyChange = useCallback((value: string, forcedId?: number | null) => {
    setParty(value);

    if (forcedId !== undefined) {
      setVendorId(forcedId);
    } else {
      setVendorId(null); // Reset until matched
    }

    // Auto-population logic for Vouchers
    if (voucherType === 'Purchase' || voucherType === 'Sales') {
      const match = value.match(/^(.*) \((.*)\)$/);
      const entityName = match ? match[1] : value;
      const refName = match ? match[2] : null;

      // 1. Try to match Vendor from Rich Data
      const lowerEntityName = (entityName || '').toLowerCase();
      const vendor = richVendors.find(v => (v.vendor_name || '').toLowerCase() === lowerEntityName);
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

        return;
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

        return;
      }

      // 3. Fallback to Ledgers
      const ledger = ledgers.find(l => (l.name || '').toLowerCase() === (value || '').toLowerCase());
      if (ledger) {
        if (ledger.gstin) setGstin(ledger.gstin);
        if (ledger.additional_data?.address) {
          setAddressFields(ledger.additional_data.address);
        }
        setVendorAddresses([]);
      }
    }
  }, [richVendors, richCustomers, vendorGstDetails, voucherType, setAddressFields, setGstin, setVendorBillingCurrency, setVendorAddresses, setPurchaseTerms, setMasterTermsData, ledgers]);

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

  const handleCreateVendorFromInvoice = async (data: any) => {
    try {
      const response = await httpClient.post<any>('/api/purchase/vendors/create/', data);
      if (response && response.status === 'CREATED') {
        showSuccess('Vendor Created Successfully!');
        setIsCreateVendorModalOpen(false);
        setVendorValidationStatus('FOUND');
        setVendorMatchedBy('Newly Created');
        setIsVendorDisabled(true);
        setParty(data.vendor_name);
        setVendorId(response.vendor_id); // Set the newly created vendor ID
        handlePartyChange(data.vendor_name, response.vendor_id);

        // Refresh master data to include the new vendor
        fetchRichData();
      }
    } catch (err: any) {
      showError(`Failed to create vendor: ${err.message || 'Error'}`);
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
      setPurchaseTerms(parts.join('\n\n'));
    } else {
      setPurchaseTerms('');
    }
    setIsTermsModalOpen(false);
  };


  const { totalTaxableAmount, totalCgst, totalSgst, totalIgst, grandTotal } = useMemo(() => {
    return items.reduce((acc, item) => {
      acc.totalTaxableAmount += item.taxableAmount;
      acc.totalCgst += item.cgstAmount;
      acc.totalSgst += item.sgstAmount;
      acc.totalIgst += item.igstAmount;
      acc.grandTotal += item.totalAmount;
      return acc;
    }, { totalTaxableAmount: 0, totalCgst: 0, totalSgst: 0, totalIgst: 0, grandTotal: 0 });
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
    const gstRate = stockItem?.gstRate || 0;

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

  const handleSaveVoucher = async () => {
    let voucher: Voucher | null = null;

    if (voucherType === 'Purchase') {
      let currentVendorId = vendorId;
      if (!currentVendorId && party) {
        // Try auto-match from richVendors
        const lowerParty = party.toLowerCase();
        const match = richVendors.find(v => v.vendor_name.toLowerCase() === lowerParty);
        if (match) {
          currentVendorId = match.id;
          setVendorId(match.id);
        }
      }

      if (!currentVendorId) {
        showError("Please select a valid Vendor from the Master list.");
        return;
      }
      // Construct Payload for Purchase Voucher
      const purchaseData: any = {
        date: date,
        supplier_invoice_no: invoiceNo,
        purchase_voucher_series: selectedPurchaseConfig,
        purchase_voucher_no: voucherNumber,
        vendor_id: currentVendorId,
        vendor_name: party,
        branch: selectedBranch,
        gstin: gstin,
        grn_reference: grnRefNo,
        bill_from: JSON.stringify({
          address_line_1: billFromAddress1,
          address_line_2: billFromAddress2,
          address_line_3: billFromAddress3,
          city: billFromCity,
          pincode: billFromPincode,
          state: billFromState,
          country: billFromCountry
        }),
        ship_from: JSON.stringify({
          address_line_1: shipFromAddress1,
          address_line_2: shipFromAddress2,
          address_line_3: shipFromAddress3,
          city: shipFromCity,
          pincode: shipFromPincode,
          state: shipFromState,
          country: shipFromCountry
        }),
        input_type: purchaseInputTypes.join(', '),
        invoice_in_foreign_currency: invoiceInForeignCurrency,

        due_details: {
          tds_gst: purchaseTdsGst || 0,
          tds_it: purchaseTdsIt || 0,
          advance_paid: purchaseAdvancePaid || 0,
          to_pay: purchaseToPay || 0,
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

      // Conditionally add Supply Details to avoid sending 'null' which creates strict validation errors
      // Always include Supply INR Details
      purchaseData.supply_inr_details = {
        purchase_order_no: purchaseOrderNo,
        purchase_ledger: purchaseLedger,
        description: purchaseDescription,
        items: purchaseItems
      };

      // Conditionally add Supply Foreign Details
      if (invoiceInForeignCurrency === 'Yes') {
        purchaseData.supply_foreign_details = {
          purchase_order_no: purchaseOrderNo,
          purchase_ledger: purchaseLedger,
          exchange_rate: exchangeRate || 1.0,
          description: purchaseDescription,
          items: purchaseItems
        };
      }

      // DEBUG: Alert/log the final payload

      // alert('Debug: Sending Payload. Check Console.');

      try {

        const response = await httpClient.post('/api/vouchers/purchase/', purchaseData);

        showSuccess('Purchase Voucher Saved Successfully!');


        // Optional: Handle file upload separately if needed, or if we switch to FormData later.

        resetForm();
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

    switch (voucherType) {
      // (Removed Purchase case from switch and handled above)
      case 'Sales':
        voucher = { id: '', type: voucherType, date, isInterState, invoiceNo, party, items, totalTaxableAmount, totalCgst, totalSgst, totalIgst, total: grandTotal, narration };
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
        voucher = { id: '', type: voucherType, date, fromAccount, toAccount, amount: simpleAmount, narration };
        break;
      case 'Journal':
        if (isJournalBalanced) {
          voucher = { id: '', type: voucherType, date, entries, totalDebit, totalCredit, narration };
        } else {
          showError("Journal entries are not balanced!");

        }
        break;
      case 'Expenses':
        voucher = { id: '', type: voucherType, date, account, party, amount: simpleAmount, narration };
        break;
    }

    if (voucher) {
      onAddVouchers([voucher]);
      resetForm();
      refetch(); // Refresh usage statistics
    }
  };

  const handleGenerateNarration = async () => {
    setIsNarrationLoading(true);
    let voucherData: any = null;

    switch (voucherType) {
      case 'Purchase':
      case 'Sales':
        voucherData = { type: voucherType, party, invoiceNo, total: grandTotal, items };
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

    // Auto-populate based on Item Code or Name
    if (field === 'itemCode' || field === 'itemName') {
      let selectedItem: any;
      if (field === 'itemCode') {
        selectedItem = stockItems.find((i: any) => (i.item_code || i.code) === value);
      } else if (field === 'itemName') {
        selectedItem = stockItems.find((i: any) => (i.name || i.item_name) === value);
      }

      if (selectedItem) {
        item.itemCode = selectedItem.item_code || selectedItem.code || item.itemCode;
        item.itemName = selectedItem.name || selectedItem.item_name || item.itemName;
        item.uom = selectedItem.unit || selectedItem.uom || item.uom;
        item.hsnSac = selectedItem.hsn_code || selectedItem.hsn || selectedItem.hsnSac || item.hsnSac;
        // Optionally update rate if available
        if (selectedItem.rate || selectedItem.selling_price) {
          item.rate = Number(selectedItem.rate || selectedItem.selling_price);
        }
      }
    }


    // Auto-calculate Taxable Value (Qty * Rate) and Taxes (INR)
    if (field === 'qty' || field === 'rate' || field === 'itemCode' || field === 'itemName') {
      const qty = parseFloat(item.qty.toString()) || 0;
      const rate = parseFloat(item.rate.toString()) || 0;
      item.taxableValue = qty * rate;

      // Fetch GST Rate from stock items
      const selectedStockItem = stockItems.find((si: any) =>
        (si.item_code || si.code) === item.itemCode ||
        (si.name || si.item_name) === item.itemName
      );

      const gstRate = selectedStockItem?.gstRate || 0;
      const totalTax = item.taxableValue * (gstRate / 100);

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

    // Auto-calculate Foreign Amount (Qty * Foreign Rate) and sync to INR Rate if exchangeRate is set
    if (field === 'qty' || field === 'foreignRate') {
      const qty = parseFloat(item.qty.toString()) || 0;
      const fRate = parseFloat(item.foreignRate?.toString() || '0') || 0;
      item.foreignAmount = qty * fRate;

      const exRate = parseFloat(exchangeRate) || 0;
      if (exRate > 0) {
        item.rate = fRate * exRate;
        item.taxableValue = qty * item.rate;

        // Recalculate taxes based on new taxable value
        const selectedStockItem = stockItems.find((si: any) =>
          (si.item_code || si.code) === item.itemCode ||
          (si.name || si.item_name) === item.itemName
        );
        const gstRate = selectedStockItem?.gstRate || 0;
        const totalTax = item.taxableValue * (gstRate / 100);

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
    (ref as any)[field] = value;
    newRefs[index] = ref;
    setPurchaseAdvanceRefs(newRefs);
  };

  // Auto-calculate Advance Paid from Advance References
  useEffect(() => {
    const totalAppliedNow = purchaseAdvanceRefs.reduce((sum, ref) => {
      const val = parseFloat(ref.appliedNow) || 0;
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
      description: ''
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
        description: ''
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

  // New Purchase Voucher Form with Tabs
  const renderPurchaseForm = () => {
    return (
      <div className="space-y-6">
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
        <div className="p-4 bg-white rounded-[4px] border border-gray-200 min-h-[200px]">
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
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="From Document"
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

              {/* Row 2: Vendor Name, Branch, GSTIN, Upload */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Vendor Name <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    value={party}
                    onChange={handlePartyChange}
                    options={partyOptions}
                    placeholder="Select Vendor"
                    className="w-full"
                    disabled={isVendorDisabled}
                  />

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
                  <SearchableSelect
                    value={selectedBranch}
                    onChange={(val) => setSelectedBranch(val)}
                    options={inventoryLocations.map((loc: any) => loc.name || loc.location_name || loc).filter(Boolean)}
                    placeholder="Select Branch"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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

              {/* Row 3: Create GRN */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex gap-4 items-end">
                  <button
                    onClick={() => setIsCreateGRNModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium h-[42px]"
                  >
                    Create GRN
                  </button>
                  <div className="flex-1">
                    <SearchableSelect
                      value={grnRefNo}
                      onChange={(val) => {
                        setGrnRefNo(val);
                        // Auto-fill logic if needed
                      }}
                      options={pendingGRNs.map(g => g.grn_no).filter(Boolean)}
                      placeholder="Select Pending GRN"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Address Headers & Toggle */}
              <div className="flex justify-between items-end mb-4 pt-4 border-t border-gray-100">
                <label className="block text-sm font-semibold text-gray-800">Bill From (Full Address)</label>
                <div className="flex items-center gap-4">
                  <label className="block text-sm font-semibold text-gray-800">Ship From</label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-600">
                    <input
                      type="checkbox"
                      checked={sameAsBillFrom}
                      onChange={(e) => setSameAsBillFrom(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                    />
                    SAME AS BILL FROM ADDRESS
                  </label>
                </div>
              </div>

              {/* Row 5: Granular Address Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Bill From Section */}
                <div className="space-y-3">
                  {vendorAddresses.length > 1 ? (
                    <SearchableSelect
                      value={billFromAddress1}
                      onChange={(val) => {
                        if (vendorAddresses.includes(val)) {
                          setAddressFields(val);
                        } else {
                          setBillFromAddress1(val);
                        }
                      }}
                      options={vendorAddresses}
                      placeholder="Address Line 1 / Select from existing"
                      className="w-full"
                    />
                  ) : (
                    <input
                      type="text"
                      value={billFromAddress1}
                      onChange={(e) => setBillFromAddress1(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Address Line 1"
                    />
                  )}
                  <input
                    type="text"
                    value={billFromAddress2}
                    onChange={(e) => setBillFromAddress2(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Address Line 2"
                  />
                  <input
                    type="text"
                    value={billFromAddress3}
                    onChange={(e) => setBillFromAddress3(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Address Line 3"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={billFromCity}
                      onChange={(e) => setBillFromCity(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      value={billFromPincode}
                      onChange={(e) => setBillFromPincode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Pincode"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={billFromState}
                      onChange={(e) => setBillFromState(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="State"
                    />
                    <input
                      type="text"
                      value={billFromCountry}
                      onChange={(e) => setBillFromCountry(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Country"
                    />
                  </div>
                </div>

                {/* Ship From Section */}
                <div className={`space-y-3 ${sameAsBillFrom ? 'opacity-60 pointer-events-none' : ''}`}>
                  {vendorAddresses.length > 1 ? (
                    <SearchableSelect
                      value={shipFromAddress1}
                      onChange={(val) => {
                        if (vendorAddresses.includes(val)) {
                          setAddressFields(val);
                        } else {
                          setShipFromAddress1(val);
                        }
                      }}
                      options={vendorAddresses}
                      placeholder="Address Line 1 / Select from existing"
                      className="w-full"
                    />
                  ) : (
                    <input
                      type="text"
                      value={shipFromAddress1}
                      onChange={(e) => setShipFromAddress1(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Address Line 1"
                    />
                  )}
                  <input
                    type="text"
                    value={shipFromAddress2}
                    onChange={(e) => setShipFromAddress2(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Address Line 2"
                  />
                  <input
                    type="text"
                    value={shipFromAddress3}
                    onChange={(e) => setShipFromAddress3(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="Address Line 3"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={shipFromCity}
                      onChange={(e) => setShipFromCity(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="City"
                    />
                    <input
                      type="text"
                      value={shipFromPincode}
                      onChange={(e) => setShipFromPincode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Pincode"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input
                      type="text"
                      value={shipFromState}
                      onChange={(e) => setShipFromState(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="State"
                    />
                    <input
                      type="text"
                      value={shipFromCountry}
                      onChange={(e) => setShipFromCountry(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Country"
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
                      disabled={invoiceInForeignCurrency === 'Yes'}
                      onClick={() => setInvoiceInForeignCurrency('No')}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-all duration-200 ${purchaseInputTypes.includes('Intrastate')
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        } ${invoiceInForeignCurrency === 'Yes' ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                    >
                      CGST & SGST
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceInForeignCurrency('Yes')}
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
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setInvoiceInForeignCurrency('Yes')}
                      className={`px-8 py-2 border rounded-[4px] transition-all duration-200 ${invoiceInForeignCurrency === 'Yes'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceInForeignCurrency('No')}
                      className={`px-8 py-2 border rounded-[4px] transition-all duration-200 ${invoiceInForeignCurrency === 'No'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md font-semibold scale-105'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600'
                        }`}
                    >
                      No
                    </button>
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
                    <div className="flex items-center gap-2">
                      <select
                        value={purchaseOrderNo}
                        onChange={(e) => setPurchaseOrderNo(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 min-w-[200px]"
                        disabled={isFetchingPOs}
                      >
                        <option value="">{isFetchingPOs ? 'Loading POs...' : 'Select Purchase Order'}</option>
                        {availablePOs.map(po => (
                          <option key={po.id} value={po.po_number}>{po.po_number}</option>
                        ))}
                      </select>
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
                      const exRateNum = parseFloat(exRateVal) || 0;
                      if (exRateNum > 0) {
                        const updatedItems = purchaseItems.map(item => {
                          const fRate = parseFloat(item.foreignRate?.toString() || '0') || 0;
                          const qty = parseFloat(item.qty.toString()) || 0;

                          const newRate = fRate * exRateNum;
                          const newTaxable = qty * newRate;

                          const selectedStockItem = stockItems.find((si: any) =>
                            (si.item_code || si.code) === item.itemCode ||
                            (si.name || si.item_name) === item.itemName
                          );
                          const gstRate = selectedStockItem?.gstRate || 0;
                          const totalTax = newTaxable * (gstRate / 100);

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
                            invoiceValue: newTaxable + igst + cgst + sgst + (parseFloat(item.cess.toString()) || 0)
                          };
                        });
                        setPurchaseItems(updatedItems);
                      }
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
                      <th className="px-3 py-3 text-sm font-semibold text-center border-r border-indigo-500">Description</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-indigo-500">Quantity</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-indigo-500">UQC</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-indigo-500">Rate ({vendorBillingCurrency || 'FC'})</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-indigo-500">Amount ({vendorBillingCurrency || 'FC'})</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {purchaseItems.map((row, index) => (
                      <tr key={row.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-center border-r border-gray-200">
                          <input
                            type="checkbox"
                            checked={selectedPurchaseItems.includes(row.id)}
                            onChange={() => handleTogglePurchaseItemSelection(row.id)}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200">
                          <input
                            type="text"
                            value={row.description}
                            onChange={(e) => handlePurchaseItemChange(index, 'description', e.target.value)}
                            className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm bg-transparent"
                            placeholder="Item description"
                          />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200">
                          <input
                            type="number"
                            min="0"
                            value={row.qty}
                            onChange={(e) => handlePurchaseItemChange(index, 'qty', e.target.value)}
                            className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200">
                          <input
                            type="text"
                            value={row.uom}
                            onChange={(e) => handlePurchaseItemChange(index, 'uom', e.target.value)}
                            className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                            placeholder="UQC"
                          />
                        </td>
                        <td className="px-3 py-2 border-r border-gray-200">
                          <input
                            type="number"
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
                    ))}
                  </tbody>
                  {/* Purchase Ledger and Description Row (Like Sales Voucher) */}
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={2} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Purchase Ledger:</label>
                          <div className="flex-1">
                            <SearchableSelect
                              value={purchaseLedger}
                              onChange={setPurchaseLedger}
                              options={ledgers.filter(l => l.group === 'Purchase Accounts').map(l => l.name)} // Assuming 'Purchase Accounts' group
                              placeholder="Select Purchase Ledger"
                            />
                          </div>
                        </div>
                      </td>
                      <td colSpan={4} className="px-3 py-2 border-l border-gray-200">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Description:</label>
                          <input
                            type="text"
                            value={purchaseDescription}
                            onChange={(e) => setPurchaseDescription(e.target.value)}
                            className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500"
                            placeholder="Enter description"
                          />
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
                  <select
                    value={purchaseOrderNo}
                    onChange={(e) => setPurchaseOrderNo(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 w-64"
                    disabled={isFetchingPOs}
                  >
                    <option value="">{isFetchingPOs ? 'Loading POs...' : 'Select Purchase Order'}</option>
                    {availablePOs.map(po => (
                      <option key={po.id} value={po.po_number}>{po.po_number}</option>
                    ))}
                  </select>
                </div>



                {/* Items Table */}
                <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none">
                  <table className="w-full">
                    <thead className="bg-indigo-600 text-white">
                      <tr>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">S. No.</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Item Code</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Item Name</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">HSN/SAC</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Qty</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">UQC</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Item Rate</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Taxable Value</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">IGST</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">CESS</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center border-r border-indigo-500">Invoice Value</th>
                        <th className="px-3 py-3 text-xs font-semibold text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseItems.map((row, index) => (
                        <tr key={row.id} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="px-2 py-2 text-center text-sm border-r border-gray-200">
                            <div className="flex items-center justify-center gap-2">
                              <input type="checkbox" className="w-4 h-4 rounded text-indigo-600" />
                              {index + 1}
                            </div>
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <SearchableSelect
                              value={row.itemCode}
                              onChange={(val) => handlePurchaseItemChange(index, 'itemCode', val)}
                              options={itemCodeOptions}
                              placeholder="Code"
                              className="w-full"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <SearchableSelect
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
                            <input
                              type="number"
                              min="0"
                              value={row.qty}
                              onChange={(e) => handlePurchaseItemChange(index, 'qty', e.target.value)}
                              className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="text"
                              value={row.uom}
                              onChange={(e) => handlePurchaseItemChange(index, 'uom', e.target.value)}
                              className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              placeholder="UOM"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              min="0"
                              value={row.rate}
                              onChange={(e) => handlePurchaseItemChange(index, 'rate', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              value={row.taxableValue}
                              readOnly
                              className="w-24 px-2 py-1 bg-transparent border-0 text-right text-sm font-medium"
                            />
                          </td>
                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              min="0"
                              value={row.igst}
                              onChange={(e) => handlePurchaseItemChange(index, 'igst', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                            />
                          </td>


                          <td className="px-2 py-2 border-r border-gray-200">
                            <input
                              type="number"
                              min="0"
                              value={row.cess}
                              onChange={(e) => handlePurchaseItemChange(index, 'cess', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                            />
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
                      ))}
                    </tbody>
                    {/* Purchase Ledger and Description Row (Like Sales Voucher) */}
                    <tfoot>
                      <tr className="border-t border-gray-200 bg-gray-50">
                        <td colSpan={4} className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Purchase Ledger:</label>
                            <div className="flex-1">
                              <SearchableSelect
                                value={purchaseLedger}
                                onChange={setPurchaseLedger}
                                options={ledgers.filter(l => l.group === 'Purchase Accounts').map(l => l.name)} // Assuming 'Purchase Accounts' group
                                placeholder="Select Purchase Ledger"
                              />
                            </div>
                          </div>
                        </td>
                        <td colSpan={8} className="px-3 py-2 border-l border-gray-200">
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Description:</label>
                            <input
                              type="text"
                              value={purchaseDescription}
                              onChange={(e) => setPurchaseDescription(e.target.value)}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-indigo-500"
                              placeholder="Enter description"
                            />
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
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700 border-r border-gray-300">Cess</th>
                        <th className="px-4 py-2 text-sm font-semibold text-gray-700">State Cess</th>
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
                        <td className="px-4 py-3 border-r border-gray-200 text-center text-sm font-medium">
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.cess) || 0), 0)).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium">
                          0.00
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column: Payment Summary */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Value</label>
                      <input
                        type="text"
                        readOnly
                        value={(purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0)).toFixed(2)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">TDS/TCS under GST</label>
                      <input
                        type="text"
                        value={purchaseTdsGst}
                        onChange={(e) => setPurchaseTdsGst(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">TDS/TCS under Income Tax</label>
                      <input
                        type="text"
                        value={purchaseTdsIt}
                        onChange={(e) => setPurchaseTdsIt(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-right"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Advance Paid</label>
                      <input
                        type="text"
                        readOnly
                        value={purchaseAdvancePaid}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-semibold"
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount Due</label>
                      <input
                        type="text"
                        readOnly
                        value={((purchaseItems.reduce((sum, item) => sum + (Number(item.invoiceValue) || 0), 0)) - (Number(purchaseTdsGst) || 0) - (Number(purchaseTdsIt) || 0) - (Number(purchaseAdvancePaid) || 0)).toFixed(2)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-right font-bold text-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note:</label>
                      <textarea
                        value={purchasePostingNote}
                        onChange={(e) => setPurchasePostingNote(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none h-24"
                        placeholder="Enter posting notes..."
                      />
                    </div>
                  </div>

                  {/* Middle Column: Advance Reference Grid */}
                  <div className="border border-gray-300 rounded-[4px] p-4 bg-indigo-50/50">
                    <div className="space-y-3">
                      <div className="grid grid-cols-4 gap-2 text-xs font-semibold text-gray-700 border-b border-gray-200 pb-2">
                        <div className="text-center">Date</div>
                        <div className="text-center">Advance Ref. No.</div>
                        <div className="text-center text-right pr-4">Amount</div>
                        <div className="text-center">Applied Now</div>
                      </div>

                      {purchaseAdvanceRefs.length > 0 ? (
                        <div className="max-h-[250px] overflow-y-auto space-y-2">
                          {purchaseAdvanceRefs.map((ref, idx) => (
                            <div key={ref.id || idx} className="grid grid-cols-4 gap-2 items-center text-sm py-1 border-b border-indigo-100/50">
                              <div className="text-center text-gray-600">{ref.date}</div>
                              <div className="text-center font-medium text-indigo-900">{ref.refNo}</div>
                              <div className="text-right pr-4 text-gray-700">{Number(ref.amount).toFixed(2)}</div>
                              <div className="px-2">
                                <input
                                  type="number"
                                  min="0"
                                  max={ref.amount}
                                  value={ref.appliedNow}
                                  onChange={(e) => handlePurchaseAdvanceRefChange(idx, 'appliedNow', e.target.value)}
                                  className="w-full px-2 py-1 border border-gray-300 rounded text-right focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500 text-sm italic">
                          No advance references available for selected Purchase Order.
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
                          onClick={openTermsModal}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] transition-colors text-sm font-medium shadow-none border border-slate-200"
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

                    {/* Received Quantity & UQC */}
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Received Quantity
                        </label>
                        <input
                          type="number"
                          value={purchaseTransitReceivedQty}
                          onChange={(e) => setPurchaseTransitReceivedQty(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="w-1/3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          UQC
                        </label>
                        <input
                          type="text"
                          value={purchaseTransitReceivedUqc}
                          onChange={(e) => setPurchaseTransitReceivedUqc(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                          placeholder="UQC"
                        />
                      </div>
                    </div>
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
                              onChange={(e) => setPurchaseTransitTransporterId(e.target.value)}
                              disabled={purchaseTransitDeliveryType === 'Courier'}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                            onChange={(e) => setPurchaseTransitTransporterId(e.target.value)}
                            disabled={purchaseTransitDeliveryType === 'Courier'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
            )
          }
        </div >

        {/* Common Action Buttons (Save/Cancel) can go here if needed globally for the tabs */}
      </div >
    );
  };

  const renderSalesPurchaseForm = () => {
    if (voucherType === 'Purchase') return renderPurchaseForm();

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div><label className="form-label">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" /></div>
          <div><label className="form-label">Invoice No.</label><input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="form-input" /></div>
          <div><label className="form-label">Party</label><SearchableSelect value={party} onChange={setParty} options={partyLedgers.map(l => l.name)} placeholder="Select Party" /></div>
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
                <td><input type="number" value={item.qty} onChange={e => handleItemChange(index, 'qty', e.target.value)} className="table-input text-right" /></td>
                <td><input type="number" value={item.rate} onChange={e => handleItemChange(index, 'rate', e.target.value)} className="table-input text-right" /></td>
                <td><input type="number" value={item.taxableAmount.toFixed(2)} readOnly className="table-input text-right" /></td>
                {!isInterState && <>
                  <td><input type="number" value={item.cgstAmount.toFixed(2)} readOnly className="table-input text-right" /></td>
                  <td><input type="number" value={item.sgstAmount.toFixed(2)} readOnly className="table-input text-right" /></td>
                </>}
                {isInterState && <td><input type="number" value={item.igstAmount.toFixed(2)} readOnly className="table-input text-right" /></td>}
                <td><input type="number" value={item.totalAmount.toFixed(2)} readOnly className="table-input text-right font-semibold" /></td>
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
              <div className="flex justify-between items-center border-t pt-2 mt-2"><span className="text-lg font-bold text-gray-800">Grand Total</span><span className="text-lg font-bold text-gray-800">{grandTotal.toFixed(2)}</span></div>
            </div>
          </div>

        </div>
      </>
    );
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
                  onChange={e => setDate(e.target.value)}
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
                    <SearchableSelect
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
                      <SearchableSelect
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
                      type="number"
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
                              type="number"
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
                      type="number"
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
                    type="number"
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
                        type="number"
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
                                type="number"
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
                          type="number"
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

  const handleBulkRowChange = (index: number, field: keyof BulkRow, value: string | number) => {
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
                    type="number"
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
                  <SearchableSelect
                    value={account}
                    onChange={setAccount}
                    options={accountLedgers.map(l => l.name)}
                    placeholder={`Select ${labelA}`}
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">{labelB}</label>
                    <SearchableSelect
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
                        type="number"
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
                        type="number"
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
                          type="number"
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
                          type="number"
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
                  <SearchableSelect
                    value={account}
                    onChange={setAccount}
                    options={accountLedgers.map(l => l.name)}
                    placeholder={`Select ${labelA}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Balance</label>
                  <input
                    type="number"
                    value={balance}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                  />
                </div>
              </div>

              {/* Party Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">{labelB}</label>
                <SearchableSelect
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
                            <SearchableSelect
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
                              type="number"
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
                        type="number"
                        value={simpleAmount}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                      <input
                        type="number"
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
                              <SearchableSelect
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
                          type="number"
                          value={simpleAmount}
                          readOnly
                          className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-xs"
                        />
                        <label className="block text-xs font-medium text-gray-700 mb-1 mt-2">Running Balance</label>
                        <input
                          type="number"
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
                                type="number"
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
      return (
        <div className="space-y-6">
          {/* Top Row: Date and Voucher Number */}
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
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
          </div>

          {/* Main Form Container */}
          <div className="border-2 border-gray-200 rounded-[4px] p-6 max-w-6xl">
            {/* Paid from */}
            <div className="grid grid-cols-[160px_1fr_auto_120px] gap-4 items-center mb-4">
              <label className="text-sm font-medium text-gray-700">Transfer From</label>
              <SearchableSelect
                value={fromAccount}
                onChange={setFromAccount}
                options={contraLedgers.map(l => l.name)}
                placeholder="Select Account"
              />
              <div></div>
              <div className="text-right">
                <div className="text-xs text-gray-500 mb-1">Balance</div>
                <input
                  type="text"
                  value={fromAccountBalance.toFixed(2)}
                  readOnly
                  className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-sm text-center"
                />
              </div>
            </div>

            {/* Received in */}
            <div className="grid grid-cols-[160px_1fr_auto_120px] gap-4 items-center mb-4">
              <label className="text-sm font-medium text-gray-700">Transfer To</label>
              <SearchableSelect
                value={toAccount}
                onChange={setToAccount}
                options={contraLedgers.map(l => l.name)}
                placeholder="Select Account"
              />
              <div></div>
              <div className="text-right">
                <input
                  type="text"
                  value={toAccountBalance.toFixed(2)}
                  readOnly
                  className="w-full px-2 py-1 border border-gray-300 rounded bg-gray-50 text-gray-500 text-sm text-center"
                />
              </div>
            </div>

            {/* Amount */}
            <div className="grid grid-cols-[160px_1fr] gap-4 items-center">
              <label className="text-sm font-medium text-gray-700">Amount</label>
              <input
                type="number"
                value={simpleAmount}
                onChange={e => setSimpleAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Posting Note */}
          <div className="max-w-2xl">
            <label className="block text-sm font-medium text-gray-700 mb-1">Posting Note:</label>
            <textarea
              value={narration}
              onChange={e => setNarration(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={4}
              placeholder="Enter posting note..."
            />
          </div>
        </div>
      );
    }

    // Original simple form for other types (shouldn't reach here)
    return (
      <div className="max-w-md mx-auto space-y-4">
        <div><label className="form-label">Date</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" /></div>
        {type !== 'Contra' && <div><label className="form-label">Account (Cash/Bank)</label><SearchableSelect value={account} onChange={setAccount} options={accountLedgers.map(l => l.name)} placeholder="Select Account" /></div>}
        {type === 'Contra' && <>
          <div><label className="form-label">From Account</label><SearchableSelect value={fromAccount} onChange={setFromAccount} options={accountLedgers.map(l => l.name)} placeholder="Select From Account" /></div>
          <div><label className="form-label">To Account</label><SearchableSelect value={toAccount} onChange={setToAccount} options={accountLedgers.map(l => l.name)} placeholder="Select To Account" /></div>
        </>}
        {type !== 'Contra' && <div><label className="form-label">Party</label><SearchableSelect value={party} onChange={setParty} options={partyLedgers.map(l => l.name)} placeholder="Select Party" /></div>}
        <div><label className="form-label">Amount</label><input type="number" value={simpleAmount} onChange={e => setSimpleAmount(parseFloat(e.target.value))} className="form-input" /></div>
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

  // Get expense ledgers
  const expenseLedgers = useMemo(() => {
    return allLedgers.filter(l => {
      const searchFields = [
        l.category,
        l.group,
        l.sub_group_1,
        l.sub_group_2,
        l.sub_group_3,
        l.ledger_type
      ].map(f => (f || '').toLowerCase());

      return searchFields.some(f =>
        f.includes('expense') ||
        f.includes('indirect') ||
        f.includes('expenditure')
      );
    });
  }, [allLedgers]);

  // Get Post To ledgers (Liabilities + Cash & Bank)
  const postToLedgers = useMemo(() => {
    return allLedgers.filter(l => {
      const searchFields = [
        l.category,
        l.group,
        l.sub_group_1,
        l.sub_group_2,
        l.sub_group_3,
        l.ledger_type
      ].map(f => (f || '').toLowerCase());

      return searchFields.some(f =>
        f.includes('liabilit') ||
        f.includes('bank') ||
        f.includes('cash') ||
        f.includes('od') ||
        f.includes('cc')
      );
    });
  }, [allLedgers]);

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
      uploaded_files: uploadedFiles.map(f => f.name) // In a real app, you'd handle file uploads separately/first
    };


    try {
      const response = await httpClient.post('/api/vouchers/expenses/', payload);

      showSuccess('Expense voucher saved successfully!');

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
      <div className="grid grid-cols-2 gap-6 mb-6 max-w-2xl">
        <div>
          <label className="erp-label">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="erp-input"
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
                <SearchableSelect
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
                <SearchableSelect
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
                  type="number"
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
                      type="number"
                      value={row.taxableValue || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'taxableValue', parseFloat(e.target.value) || 0)}
                      className="erp-input"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="erp-label">IGST</label>
                    <input
                      type="number"
                      value={row.igst || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'igst', parseFloat(e.target.value) || 0)}
                      className="erp-input bg-gray-50"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="erp-label">CGST</label>
                    <input
                      type="number"
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
                      type="number"
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
                      type="number"
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

      {/* Action Buttons */}
      <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
        <button
          onClick={resetForm}
          className="erp-button-secondary px-8"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveExpenseVoucher}
          className="erp-button-primary px-10"
        >
          Post Voucher
        </button>
      </div>
    </>
  );

  const renderJournalForm = () => (
    <>
      {/* Top Row: Date and Voucher Number */}
      <div className="grid grid-cols-2 gap-6 mb-6 max-w-2xl">
        <div>
          <label className="erp-label">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="erp-input"
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
                    <SearchableSelect
                      value={entry.ledger}
                      onChange={(val) => handleEntryChange(index, 'ledger', val)}
                      options={allLedgers.map(l => l.name)}
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
                      type="number"
                      value={entry.debit || ''}
                      onChange={e => handleEntryChange(index, 'debit', parseFloat(e.target.value) || 0)}
                      className="erp-input h-9 text-right font-mono"
                      placeholder="0.00"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="erp-section-title">
        <div>
          <h1 className="page-title">Voucher Entry</h1>
          <p className="helper-text mb-0">
            Record transactions — sales, purchases, payments, and more
          </p>
        </div>
      </div>

      {isSalesExcelWorkflowOpen ? (
        <div className="erp-container relative">
          <SalesExcelUploadWorkflow onClose={() => setIsSalesExcelWorkflowOpen(false)} />
        </div>
      ) : (
        <>
          {/* Main Tabs */}
          <div className="erp-tab-container">
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
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative" ref={scannerMenuRef}>
                  <button
                    onClick={() => isLimitReached ? handleLimitReached() : setIsScannerMenuOpen(prev => !prev)}
                    className={`erp-button-primary ${isLimitReached ? 'opacity-50 cursor-not-allowed !bg-gray-400 !shadow-none' : ''}`}
                    title={isLimitReached ? "Limit Reached" : "Upload Invoices"}
                  >
                    <Icon name="upload" className="w-4 h-4 mr-2" />
                    Upload Invoices
                    <Icon name="chevron-down" className="w-3 h-3 ml-2" />
                  </button>

                  {isScannerMenuOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-[60]">
                      <div className="py-1" role="menu">
                        <button
                          onClick={() => { openScanner('finpixe', 'single'); setIsScannerMenuOpen(false); }}
                          className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          <Icon name="sparkles" className="w-4 h-4 mr-3 text-indigo-500" />
                          Finpixe Single Scan
                        </button>
                        <button
                          onClick={() => { setIsBulkUploadOpen(true); setIsScannerMenuOpen(false); }}
                          className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 border-t border-gray-50"
                          role="menuitem"
                        >
                          <Icon name="scanner" className="w-4 h-4 mr-3 text-emerald-500" />
                          Finpixe Bulk Scan
                        </button>
                        <button
                          onClick={() => setIsOthersSubmenuOpen(prev => !prev)}
                          className="flex items-center justify-between w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          <div className="flex items-center">
                            <Icon name="menu" className="w-4 h-4 mr-3 text-gray-500" />
                            Others
                          </div>
                          <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${isOthersSubmenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isOthersSubmenuOpen && (
                          <div className="bg-gray-50 py-1 shadow-inner">
                            <button
                              onClick={() => setIsTallySubmenuOpen(prev => !prev)}
                              className="flex items-center justify-between w-full text-left px-8 py-2 text-sm text-gray-600 hover:bg-gray-100"
                              role="menuitem"
                            >
                              <div className="flex items-center">
                                <Icon name="document" className="w-3 h-3 mr-3" />
                                Tally
                              </div>
                              <Icon name="chevron-down" className={`w-2.5 h-2.5 transition-transform ${isTallySubmenuOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isTallySubmenuOpen && (
                              <div className="bg-gray-100/50 py-0.5 shadow-inner">
                                <button
                                  onClick={() => { openScanner('tally'); setIsScannerMenuOpen(false); setIsOthersSubmenuOpen(false); setIsTallySubmenuOpen(false); }}
                                  className="flex items-center w-full text-left px-12 py-1.5 text-xs text-gray-500 hover:bg-gray-200"
                                  role="menuitem"
                                >
                                  <Icon name="plus" className="w-3 h-3 mr-2" />
                                  Voucher
                                </button>
                                <button
                                  onClick={() => { masterScannerInputRef.current?.click(); setIsScannerMenuOpen(false); setIsOthersSubmenuOpen(false); setIsTallySubmenuOpen(false); }}
                                  className="flex items-center w-full text-left px-12 py-1.5 text-xs text-gray-500 hover:bg-gray-200"
                                  role="menuitem"
                                >
                                  <Icon name="masters" className="w-3 h-3 mr-2" />
                                  Master
                                </button>
                              </div>
                            )}
                            <button
                              onClick={() => { showInfo("Zoho import triggered"); setIsScannerMenuOpen(false); setIsOthersSubmenuOpen(false); }}
                              className="flex items-center w-full text-left px-8 py-2 text-sm text-gray-600 hover:bg-gray-100"
                              role="menuitem"
                            >
                              <Icon name="document" className="w-3 h-3 mr-3" />
                              Zoho
                            </button>
                            <button
                              onClick={() => { showInfo("SAP import triggered"); setIsScannerMenuOpen(false); setIsOthersSubmenuOpen(false); }}
                              className="flex items-center w-full text-left px-8 py-2 text-sm text-gray-600 hover:bg-gray-100"
                              role="menuitem"
                            >
                              <Icon name="document" className="w-3 h-3 mr-3" />
                              SAP
                            </button>
                          </div>
                        )}

                        <div className="border-t border-gray-100 my-1"></div>
                        <button
                          onClick={() => { excelInputRef.current?.click(); setIsScannerMenuOpen(false); }}
                          className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          <Icon name="receipt" className="w-4 h-4 mr-3 text-green-500" />
                          From Excel
                        </button>

                        <button
                          onClick={() => { setIsSalesExcelWorkflowOpen(true); setIsScannerMenuOpen(false); }}
                          className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          <Icon name="file-spreadsheet" className="w-4 h-4 mr-3 text-blue-500" />
                          {voucherType === 'Sales' ? 'Sales Excel Workflow (Upload)' : 'Sales Excel Workflow'}
                        </button>
                        <button
                          onClick={() => { jsonInputRef.current?.click(); setIsScannerMenuOpen(false); }}
                          className="flex items-center w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          role="menuitem"
                        >
                          <Icon name="tag" className="w-4 h-4 mr-3 text-amber-500" />
                          From JSON
                        </button>
                      </div>
                    </div>
                  )}
                </div>


                {/* Single scan input – NO multiple attribute */}
                <input type="file" ref={singleScanInputRef} onClick={(e) => { (e.target as any).value = null; }} onChange={handleSingleScanFileChange} accept=".pdf,.jpg,.jpeg,.png" className="hidden" />
                {/* Multi-file scanner input for tally/other modes */}
                <input type="file" ref={scannerInputRef} onClick={(e) => { (e.target as any).value = null; }} onChange={handleScannerFileChange} accept="image/*,.pdf" multiple className="hidden" />
                <input type="file" ref={masterScannerInputRef} onClick={(e) => { (e.target as any).value = null; }} onChange={handleMasterScannerFileChange} accept="image/*,.pdf" multiple className="hidden" />
                <input type="file" ref={excelInputRef} onChange={handleExcelFileChange} accept=".xlsx, .xls" className="hidden" />
                <input type="file" ref={jsonInputRef} onChange={handleJsonFileChange} accept=".json" className="hidden" />
                <input type="file" ref={imageInputRef} onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (voucherType === 'Purchase') setPurchaseSupportingDocument(file);
                    showInfo(`File "${file.name}" attached for manual entry.`);
                  }
                }} accept="image/*,.pdf" className="hidden" />
              </div>
            </div>
            <style>{`
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
            border-color: #3b82f6;
            box-shadow: 0 0 0 1px #3b82f6;
          }
          .table-input[readOnly] {
            background-color: #f9fafb;
            color: #4b5563;
            cursor: not-allowed;
          }
          .table-header { padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; background-color: #f9fafb; }
        `}
            </style>
            {voucherType === 'Sales' && <SalesVoucher prefilledData={localPrefilledData} clearPrefilledData={handleClearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} customers={richCustomers} companyDetails={companyDetails} />}
            {voucherType === 'Payment' && <PaymentVoucherSingle prefilledData={localPrefilledData} clearPrefilledData={handleClearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} />}
            {voucherType === 'Receipt' && <ReceiptVoucher prefilledData={localPrefilledData} clearPrefilledData={handleClearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} />}
            {voucherType === 'Purchase' && renderSalesPurchaseForm()}
            {voucherType === 'Contra' && renderSimpleForm(voucherType)}
            {voucherType === 'Journal' && renderJournalForm()}
            {voucherType === 'Expenses' && renderExpensesForm()}
            {voucherType === 'Credit Note' && (
              <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 rounded-[4px] bg-gray-50">
                <h3 className="text-xl font-medium text-gray-900 mb-2">Credit Note Voucher</h3>
                <p className="text-gray-500">Credit Note entry form is under development.</p>
              </div>
            )}
            {voucherType === 'Debit Note' && (
              <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 rounded-[4px] bg-gray-50">
                <h3 className="text-xl font-medium text-gray-900 mb-2">Debit Note Voucher</h3>
                <p className="text-gray-500">Debit Note entry form is under development.</p>
              </div>
            )}

            {/* Hide page-level buttons for Receipt, Payment, Expenses and Sales since they have their own buttons */}
            {voucherType !== 'Receipt' && voucherType !== 'Payment' && voucherType !== 'Expenses' && voucherType !== 'Sales' && (
              <div className="mt-8 pt-4 border-t flex justify-end space-x-3">
                <button
                  onClick={resetForm}
                  className="erp-button-secondary"
                >
                  Cancel
                </button>

                {voucherType === 'Purchase' && purchaseActiveTab !== 'transit' ? (
                  <button
                    onClick={() => {
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
                  <div className="flex space-x-3">
                    <button
                      onClick={handleSaveVoucher}
                      className="erp-button-primary"
                    >
                      Post & Close
                    </button>
                    <button
                      onClick={handleSaveVoucher}
                      className="erp-button-secondary border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                    >
                      Post & Print/Email
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>



          {/* Recent / Imported Vouchers - show below the form so imports are visible immediately */}
          {
            vouchers && vouchers.length > 0 && (
              <div className="mt-8 erp-container p-0 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="erp-section-title border-none mb-0 pb-0 shadow-none">Recent Vouchers</h3>
                </div>
                <div className="erp-table-container border-none rounded-none shadow-none">
                  <table className="erp-table">
                    <thead><tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Inv No.</th>
                      <th>Party</th>
                      <th className="text-right">Taxable</th>
                      <th className="text-right">Tax</th>
                      <th className="text-right">Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-200">
                      {vouchers.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((v, idx) => (
                        <tr key={`${v.type}-${v.date}-${(v as any).invoiceNo || (v as any).party || ''}-${idx}`}>
                          <td className="px-4 py-2 text-sm text-gray-700">{v.date}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{v.type}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{(v as any).invoiceNo || ''}</td>
                          <td className="px-4 py-2 text-sm text-gray-700">{(v as any).party || ''}</td>
                          <td className="px-4 py-2 text-sm text-gray-800 text-right font-mono">
                            {Number((v as any).totalTaxableAmount || (v as any).amount || 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-800 text-right font-mono">
                            {Number(((v as any).totalCgst || 0) + ((v as any).totalSgst || 0) + ((v as any).totalIgst || 0)).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-sm text-gray-900 text-right font-bold font-mono">
                            {Number((v as any).total || (v as any).amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }


          {/* Tally Master Scanner Modal */}
          {
            isTallyMasterScannerOpen && (
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
            )
          }

          {/* Invoice Scanner Modal */}
          {
            isInvoiceScannerOpen && (
              <InvoiceScannerModal
                extractionMode={extractionMode}
                scanType={scanType}
                initialFiles={scannerFiles}
                voucherType={voucherType}
                onClose={() => {
                  setIsInvoiceScannerOpen(false);
                  setScannerFiles(null);
                  refetch(); // Refresh usage after scan
                }}
                onExtractionSuccess={(extractedData) => {
                  if (voucherType !== 'Purchase') return;

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
                    if (firstRow['Date'] || firstRow['Voucher Date'])
                      setDate(formatDateForInput(firstRow['Date'] || firstRow['Voucher Date']) || getTodayDate());

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
                    if (firstRow['TDS/TCS under GST']) setPurchaseTdsGst(firstRow['TDS/TCS under GST']);
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

                    const mappedItems = data.map((row, idx) => {
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
                        description: row['Description'] || ''
                      };
                    });
                    console.log('[VouchersPage] Mapped Purchase Items:', mappedItems);
                    setPurchaseItems(mappedItems);
                  } else {
                    // For Sales, Payment, Receipt: use reconstructed ExtractedInvoiceData for sub-components
                    const lineItems = data.map(row => ({
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
                    const computedTaxableValue = data.reduce((s, r) => s + (parseFloat(r['Taxable Value'] || '0') || 0), 0);
                    const computedCgst = data.reduce((s, r) => s + (parseFloat(r['CGST'] || '0') || 0), 0);
                    // Schema uses "SGST/UTGST" as the unified key
                    const computedSgst = data.reduce((s, r) => s + (parseFloat(r['SGST/UTGST'] || r['SGST'] || '0') || 0), 0);
                    const computedIgst = data.reduce((s, r) => s + (parseFloat(r['IGST'] || '0') || 0), 0);
                    const computedCess = data.reduce((s, r) => s + (parseFloat(r['Cess'] || '0') || 0), 0);
                    const computedInvoiceValue = data.reduce((s, r) => s + (parseFloat(r['Invoice Value'] || r['Item Amount'] || '0') || 0), 0);

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
            )
          }

          {/* Create Vendor Modal */}
          {isCreateVendorModalOpen && extractedVendorData && (
            <CreateVendorModal
              onClose={() => setIsCreateVendorModalOpen(false)}
              onSave={handleCreateVendorFromInvoice}
              initialData={extractedVendorData}
            />
          )}

          {/* Create GRN Modal */}
          {
            isCreateGRNModalOpen && (
              <CreateGRNModal
                onClose={() => setIsCreateGRNModalOpen(false)}
                onSave={async (data) => {
                  try {

                    const response = await apiService.createInventoryOperationGRN(data);

                    setGrnRefNo(response.grn_no);
                    showSuccess('GRN Created Successfully!');

                    // Sync items to Supply Details table
                    if (data.items && data.items.length > 0) {
                      const mappedItems = data.items.map((item: any, index: number) => {
                        // Try to find full item details from stockItems
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
                          hsnSac: stockItem?.hsn_sac || '',
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

                    // Sync other relevant fields
                    if (data.vendor_name) setParty(data.vendor_name);
                    if (data.gstin) setGstin(data.gstin);
                    if (data.address) {
                      setAddressFields(data.address);
                    }
                    if (data.secondary_ref_no) setInvoiceNo(data.secondary_ref_no);
                    if (data.reference_no) setPurchaseOrderNo(data.reference_no);

                    // Add to pending list and select it
                    if (response.grn_no) {
                      setPendingGRNs(prev => [...prev, response]);
                    }

                    setIsCreateGRNModalOpen(false);
                  } catch (error) {
                    console.error("Failed to create GRN");
                    showError("Failed to create GRN. Please check inputs.");
                  }

                }}
              />
            )
          }
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

          {/* Bulk Invoice Upload Modal */}
          {isBulkUploadOpen && (
            <BulkInvoiceUploadModal
              voucherType={voucherType}
              onClose={() => {
                setIsBulkUploadOpen(false);
                refetch(); // Refresh usage
              }}
              onFinalized={(summary) => {
                showSuccess(`Successfully processed ${summary.created} invoices!`);
                setIsBulkUploadOpen(false);
                // Optionally reload vouchers list or navigate
                if (window.location.reload) {
                  // We might want to refresh the page or the list
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


