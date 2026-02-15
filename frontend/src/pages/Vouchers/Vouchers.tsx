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
import ErrorBoundary from '../../components/ErrorBoundary';
import SalesVoucher from './SalesVoucher';
import PaymentVoucherSingle from './PaymentVoucherSingle';
import PaymentVoucherBulk from './PaymentVoucherBulk';
import ReceiptVoucher from './ReceiptVoucher';
import CreateGRNModal from '../../components/CreateGRNModal';

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

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ value, onChange, options, placeholder = "Select...", className = "" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom,
        left: rect.left,
        width: Math.max(rect.width, 250) // Wider dropdown for better visibility
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        portalRef.current && !portalRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScroll = (event: Event) => {
      // Small optimization: don't close if scrolling inside the dropdown itself
      if (portalRef.current && portalRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', () => setIsOpen(false));
      updatePosition();
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', () => setIsOpen(false));
    };
  }, [isOpen]);

  const filteredOptions = options.filter(opt =>
    (opt || '').toLowerCase().includes((value || '').toLowerCase())
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
        />
        <div
          className="absolute inset-y-0 right-0 flex items-center pr-2 cursor-pointer"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Icon name="chevron-down" className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {isOpen && createPortal(
        <div
          ref={portalRef}
          className="fixed z-[9999] bg-white border border-gray-200 rounded-[4px] shadow-xl max-h-60 overflow-y-auto"
          style={{
            top: position.top + 4,
            left: position.left,
            width: position.width,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, i) => (
              <div
                key={i}
                className={`px-4 py-2 text-sm hover:bg-indigo-50 cursor-pointer transition-colors ${value === opt ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                onClick={() => {
                  onChange(opt);
                  setIsOpen(false);
                }}
              >
                {opt}
              </div>
            ))
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">No results found</div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

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

  // Debug: Log ledgers data
  useEffect(() => {

    if (ledgers.length > 0) {


    }
  }, [ledgers]);

  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [isMassUploadOpen, setIsMassUploadOpen] = useState(false);
  const [isCreateGRNModalOpen, setIsCreateGRNModalOpen] = useState(false);

  // Invoice Scanner Modal state
  const [isInvoiceScannerOpen, setIsInvoiceScannerOpen] = useState(false);
  const [uploadedInvoiceFiles, setUploadedInvoiceFiles] = useState<File[]>([]);
  const [extractedInvoiceData, setExtractedInvoiceData] = useState<any[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Subscription Usage
  const { subscriptionUsage, isLimitReached, refetch } = useSubscriptionUsage();
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const handleLimitReached = () => {
    setIsUpgradeModalOpen(true);
  };

  // Common state
  const [date, setDate] = useState(getTodayDate());
  const [party, setParty] = useState('');
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

  // Purchase Voucher Tabs
  const [purchaseActiveTab, setPurchaseActiveTab] = useState<'supplier' | 'supply' | 'supply_foreign' | 'supply_inr' | 'due' | 'transit'>('supplier');
  const [grnRefNo, setGrnRefNo] = useState('');
  const [billFrom, setBillFrom] = useState(''); // Correspond to 'billTo' in wireframe if needed, but 'From' is better for Purchase
  const [shipFrom, setShipFrom] = useState(''); // Correspond to 'shipTo' in wireframe if needed

  // Rich Vendor Data
  const [richVendors, setRichVendors] = useState<any[]>([]);
  const [richCustomers, setRichCustomers] = useState<any[]>([]);
  const [vendorGstDetails, setVendorGstDetails] = useState<any[]>([]);
  const [pendingGRNs, setPendingGRNs] = useState<any[]>([]);
  const [vendorAddresses, setVendorAddresses] = useState<string[]>([]);
  const [inventoryLocations, setInventoryLocations] = useState<any[]>([]);

  // Fetch rich vendor data on mount
  useEffect(() => {
    const fetchData = async () => {
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
        setVendorGstDetails(Array.isArray(gst) ? gst : []);
      } catch (err) {
        console.warn('Failed to fetch Vendor GST Details', err);
      }

      // 3. Inventory Locations (Critical for Dropdown)
      try {
        const locs = await apiService.getInventoryLocations();
        console.log('Fetched Locations:', locs);
        const locsAny = locs as any;

        if (Array.isArray(locsAny)) {
          setInventoryLocations(locsAny);
        } else if (locsAny && locsAny.results && Array.isArray(locsAny.results)) {
          // Handle pagination if backend returns { results: [...] }
          setInventoryLocations(locsAny.results);
        } else {
          console.warn('Unexpected locations format:', locs);
          setInventoryLocations([]);
        }
      } catch (err) {
        console.warn('Failed to fetch Inventory Locations', err);
      }
    };
    fetchData();
  }, []);

  const [purchaseInputType, setPurchaseInputType] = useState('Intrastate'); // Default to Same State
  const [invoiceInForeignCurrency, setInvoiceInForeignCurrency] = useState<'Yes' | 'No'>('No');
  const [purchaseSupportingDocument, setPurchaseSupportingDocument] = useState<File | null>(null);

  // Purchase Supply Details Tab State
  const [purchaseOrderNo, setPurchaseOrderNo] = useState('');
  const [exchangeRate, setExchangeRate] = useState(''); // Added exchangeRate state
  const [purchaseLedger, setPurchaseLedger] = useState('');
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [selectedPurchaseItems, setSelectedPurchaseItems] = useState<string[]>([]);
  const [purchaseItems, setPurchaseItems] = useState([
    { id: '1', itemCode: '', itemName: '', hsnSac: '', qty: 1, uom: '', rate: 0, taxableValue: 0, igst: 0, cgst: 0, sgst: 0, cess: 0, invoiceValue: 0, description: '' }
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

  // Purchase Transit Details State
  const [purchaseTransitMode, setPurchaseTransitMode] = useState('Road');

  // Basic / Road Details (Left Column)
  const [purchaseTransitReceivedIn, setPurchaseTransitReceivedIn] = useState(''); // Equivalent to Dispatch From
  const [purchaseTransitReceiptDate, setPurchaseTransitReceiptDate] = useState(getTodayDate());
  const [purchaseTransitReceiptTime, setPurchaseTransitReceiptTime] = useState('');

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

  // Mock Data for Verification
  const mockPurchaseOrders: Record<string, typeof purchaseItems> = {
    'PO-001': [
      { id: '1', itemCode: 'ITM001', itemName: 'Dell Laptop', hsnSac: '8471', qty: 2, uom: 'Nos', rate: 50000, taxableValue: 100000, igst: 18000, cgst: 0, sgst: 0, cess: 0, invoiceValue: 118000, description: '' },
      { id: '2', itemCode: 'ITM002', itemName: 'Wireless Mouse', hsnSac: '8471', qty: 5, uom: 'Nos', rate: 500, taxableValue: 2500, igst: 450, cgst: 0, sgst: 0, cess: 0, invoiceValue: 2950, description: '' }
    ],
    'PO-002': [
      { id: '1', itemCode: 'ITM003', itemName: 'Office Chair', hsnSac: '9403', qty: 10, uom: 'Nos', rate: 4500, taxableValue: 45000, igst: 8100, cgst: 0, sgst: 0, cess: 0, invoiceValue: 53100, description: '' }
    ]
  };

  useEffect(() => {
    if (purchaseOrderNo && mockPurchaseOrders[purchaseOrderNo]) {
      setPurchaseItems(mockPurchaseOrders[purchaseOrderNo]);

      // Auto-populate mock advance references
      const mockRefs = [
        { id: 1, date: '2026-01-10', refNo: `ADV/${purchaseOrderNo}/01`, amount: '5000.00', appliedNow: '0.00' },
        { id: 2, date: '2026-01-25', refNo: `ADV/${purchaseOrderNo}/02`, amount: '3500.00', appliedNow: '0.00' }
      ];
      setPurchaseAdvanceRefs(mockRefs);
    } else {
      setPurchaseAdvanceRefs([]);
    }
  }, [purchaseOrderNo]);

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
        const fallback = ledgers.filter(l => l.group === 'Bank Accounts' || l.group === 'Cash-in-Hand');
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
        let allVouchers: Voucher[] = [];
        let failed = 0;

        const processSheet = (sheetName: string, type: 'SalesPurchases' | 'PaymentsReceipts' | 'Contra' | 'Journal') => {
          const sheet = workbook.Sheets[sheetName];
          if (sheet) {
            const rows = XLSX.utils.sheet_to_json(sheet);

            // Helper for robust parsing
            const parseDate = (val: any) => {
              if (!val) return new Date().toISOString().split('T')[0];
              if (typeof val === 'number') {
                // Excel serial date
                return new Date((val - (25567 + 1)) * 86400 * 1000).toISOString().split('T')[0];
              }
              // Try parsing string/date
              const d = new Date(val);
              return isNaN(d.getTime()) ? new Date().toISOString().split('T')[0] : d.toISOString().split('T')[0];
            };

            const parseBool = (val: any) => String(val).toUpperCase() === 'TRUE' || val === true;

            rows.forEach((row: any) => {
              try {
                // Override type with current voucherType to ensure consistency
                let voucher: Partial<Voucher> = {
                  date: parseDate(row.date),
                  type: voucherType as any,
                  narration: row.narration
                };

                if (type === 'SalesPurchases') {
                  voucher = {
                    ...voucher,
                    party: row.party,
                    invoiceNo: row.invoiceNo,
                    isInterState: parseBool(row.isInterState),
                    items: JSON.parse(row.items)
                  } as Partial<SalesPurchaseVoucher>;
                  // Recalculate totals for data integrity
                  const { items, isInterState } = voucher as SalesPurchaseVoucher;
                  const totals = items.reduce((acc, item) => {
                    const stockItem = stockItems.find(si => si.name === item.name);
                    const gstRate = stockItem?.gstRate || 0;
                    const taxable = item.qty * item.rate;
                    const tax = taxable * (gstRate / 100);
                    item.taxableAmount = taxable;
                    if (isInterState) {
                      item.igstAmount = tax; item.cgstAmount = 0; item.sgstAmount = 0;
                    } else {
                      item.igstAmount = 0; item.cgstAmount = tax / 2; item.sgstAmount = tax / 2;
                    }
                    item.totalAmount = taxable + tax;
                    acc.taxable += item.taxableAmount; acc.cgst += item.cgstAmount; acc.sgst += item.sgstAmount; acc.igst += item.igstAmount; acc.total += item.totalAmount;
                    return acc;
                  }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });
                  (voucher as SalesPurchaseVoucher).totalTaxableAmount = totals.taxable;
                  (voucher as SalesPurchaseVoucher).totalCgst = totals.cgst;
                  (voucher as SalesPurchaseVoucher).totalSgst = totals.sgst;
                  (voucher as SalesPurchaseVoucher).totalIgst = totals.igst;
                  (voucher as SalesPurchaseVoucher).total = totals.total;
                } else if (type === 'PaymentsReceipts') {
                  voucher = { ...voucher, party: row.party, account: row.account, amount: row.amount } as PaymentReceiptVoucher;
                } else if (type === 'Contra') {
                  voucher = { ...voucher, fromAccount: row.fromAccount, toAccount: row.toAccount, amount: row.amount } as ContraVoucher;
                } else if (type === 'Journal') {
                  const entries = JSON.parse(row.entries);
                  const { debit, credit } = entries.reduce((acc: any, e: any) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }), { debit: 0, credit: 0 });
                  voucher = { ...voucher, entries, totalDebit: debit, totalCredit: credit } as JournalVoucher;
                }

                if (isVoucher(voucher)) allVouchers.push(voucher as Voucher); else failed++;
              } catch { failed++; }
            });
          }
        };

        // Only process the sheet that matches the current voucherType
        if (voucherType === 'Purchase' || voucherType === 'Sales') {
          processSheet('SalesPurchases', 'SalesPurchases');
        } else if (voucherType === 'Payment' || voucherType === 'Receipt') {
          processSheet('PaymentsReceipts', 'PaymentsReceipts');
        } else if (voucherType === 'Contra') {
          processSheet('Contra', 'Contra');
        } else if (voucherType === 'Journal') {
          processSheet('Journal', 'Journal');
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

            // Map items
            const mappedItems = spVoucher.items.map(item => ({
              name: item.name,
              qty: item.qty,
              rate: item.rate,
              taxableAmount: item.taxableAmount,
              cgstAmount: item.cgstAmount,
              sgstAmount: item.sgstAmount,
              igstAmount: item.igstAmount,
              totalAmount: item.totalAmount
            }));
            setItems(mappedItems);
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

    // Define headers
    const spHeaders = [["date", "type", "invoiceNo", "party", "isInterState", "narration", "items"]];
    const prHeaders = [["date", "type", "account", "party", "amount", "narration"]];
    const cHeaders = [["date", "type", "fromAccount", "toAccount", "amount", "narration"]];
    const jHeaders = [["date", "type", "narration", "entries"]];

    // Example data
    spHeaders.push(["2023-01-01", "Sales", "INV-101", "Local Customer", "FALSE", "Sold goods", '[{"name": "Laptop", "qty": 1, "rate": 50000}]']);
    prHeaders.push(["2023-01-02", "Payment", "HDFC Bank", "Local Supplier", "25000", "Paid for supplies"]);
    cHeaders.push(["2023-01-03", "Contra", "Cash", "HDFC Bank", "10000", "Cash deposited"]);
    jHeaders.push(["2023-01-04", "Journal", "Adjustment entry", '[{"ledger": "Rent Expense", "debit": 15000, "credit": 0}, {"ledger": "Cash", "debit": 0, "credit": 15000}]']);

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
    setItems([{ name: '', qty: 1, rate: 0, taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, totalAmount: 0 }]);
    setAccount('');
    setSimpleAmount(0);
    setNarration('');
    setFromAccount('');
    setToAccount('');
    setEntries([{ ledger: '', note: '', refNo: '', debit: 0, credit: 0 }, { ledger: '', note: '', refNo: '', debit: 0, credit: 0 }]);
    // Removed image clearing
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

  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    // Handles YYYY-MM-DD and DD-MM-YYYY
    const parts = dateString.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) { // YYYY-MM-DD
        return dateString;
      }
      if (parts[2].length === 4) { // DD-MM-YYYY
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
    }
    // Fallback for other formats, might not be perfect
    try {
      return new Date(dateString).toISOString().split('T')[0];
    } catch {
      return '';
    }
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
            const stockItem = stockItems.find(si => si.name.toLowerCase() === (item.itemDescription || '').toLowerCase());
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

  // Sync Input Type and Interstate status based on Party
  useEffect(() => {
    if (party && ledgers.length > 0 && companyDetails?.state) {
      const partyLedger = ledgers.find(l => l.name.toLowerCase() === party.toLowerCase());
      if (partyLedger && partyLedger.state) {
        const isInter = partyLedger.state.toLowerCase() !== companyDetails.state.toLowerCase();
        setIsInterState(isInter);
        setPurchaseInputType(isInter ? 'Interstate' : 'Intrastate');
      }
    }
  }, [party, ledgers, companyDetails]);

  const { partyLedgers, accountLedgers, allLedgers, partyOptions } = useMemo(() => {
    const partyLedgers = [...ledgers]; // Allow all ledgers to be selected as a party across all voucher types
    const accountLedgers = cashBankLedgers.length > 0 ? cashBankLedgers : ledgers.filter(l => l.group === 'Bank Accounts' || l.group === 'Cash-in-Hand');
    const allLedgers = [...ledgers];

    // Combine Ledgers with rich Vendor Reference Names for Purchase Vouchers
    // Combine Ledgers with rich Vendor/Customer names
    const partyOptions = [...new Set([
      ...ledgers.map(l => l.name),
      ...richVendors.map(v => v.vendor_name),
      ...richCustomers.map(c => c.customer_name)
    ])].filter(Boolean);

    // Add vendor reference names (branches)
    vendorGstDetails.forEach(gst => {
      const vendor = richVendors.find(rv => rv.id === gst.vendor_basic_detail);
      if (vendor && gst.reference_name) {
        const combinedName = `${vendor.vendor_name} (${gst.reference_name})`;
        if (!partyOptions.includes(combinedName)) {
          partyOptions.push(combinedName);
        }
      }
    });

    // Add customer reference names (branches)
    richCustomers.forEach(customer => {
      const branches = customer.gst_details?.branches || [];
      branches.forEach((br: any) => {
        if (br.defaultRef) {
          const combinedName = `${customer.customer_name} (${br.defaultRef})`;
          if (!partyOptions.includes(combinedName)) {
            partyOptions.push(combinedName);
          }
        }
      });
    });

    return { partyLedgers, accountLedgers, allLedgers, partyOptions };
  }, [ledgers, cashBankLedgers, richVendors, vendorGstDetails, richCustomers]);

  const handlePartyChange = (value: string) => {
    setParty(value);

    // Auto-population logic for Vouchers
    if (voucherType === 'Purchase' || voucherType === 'Sales') {
      const match = value.match(/^(.*) \((.*)\)$/);
      const entityName = match ? match[1] : value;
      const refName = match ? match[2] : null;

      // 1. Try to match Vendor from Rich Data
      const vendor = richVendors.find(v => v.vendor_name === entityName);
      if (vendor) {
        let matchedGst = vendorGstDetails.find(g =>
          g.vendor_basic_detail === vendor.id && (refName ? g.reference_name === refName : true)
        );

        if (matchedGst) {
          if (matchedGst.gstin) setGstin(matchedGst.gstin);
          if (matchedGst.branch_address) {
            setBillFrom(matchedGst.branch_address);
            setShipFrom(matchedGst.branch_address);
          }
        } else if (vendor.billing_address) {
          setBillFrom(vendor.billing_address);
          setShipFrom(vendor.billing_address);
        }

        // Collect addresses for dropdown
        let addresses = [vendor.billing_address];
        vendorGstDetails.filter(g => g.vendor_basic_detail === vendor.id).forEach(g => {
          if (g.branch_address) addresses.push(g.branch_address);
        });
        setVendorAddresses(Array.from(new Set(addresses.filter(Boolean))));
        return;
      }

      // 2. Try to match Customer from Rich Data
      const customer = richCustomers.find(c => c.customer_name === entityName);
      if (customer) {
        const branches = customer.gst_details?.branches || [];
        let matchedBranch = branches.find((b: any) => refName ? b.defaultRef === refName : true);

        if (matchedBranch) {
          if (matchedBranch.gstin) setGstin(matchedBranch.gstin);
          if (matchedBranch.address) {
            setBillFrom(matchedBranch.address);
            setShipFrom(matchedBranch.address);
          }
        }

        // Collect addresses for dropdown
        let addresses = branches.map((b: any) => b.address).filter(Boolean);
        setVendorAddresses(Array.from(new Set(addresses)));
        return;
      }

      // 3. Fallback to Ledgers
      const ledger = ledgers.find(l => l.name === value);
      if (ledger) {
        if (ledger.gstin) setGstin(ledger.gstin);
        if (ledger.additional_data?.address) {
          setBillFrom(ledger.additional_data.address);
          setShipFrom(ledger.additional_data.address);
        }
        setVendorAddresses([]);
      }
    }
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
    // Only block saving for invoice-related types if limit reached
    const isInvoiceType = voucherType === 'Sales' || voucherType === 'Purchase' || voucherType === 'Expenses';
    if (isLimitReached && isInvoiceType) {
      handleLimitReached();
      return;
    }

    let voucher: Voucher | null = null;

    if (voucherType === 'Purchase') {
      // Construct Payload for Purchase Voucher
      const purchaseData: any = {
        date: date,
        supplier_invoice_no: invoiceNo,
        purchase_voucher_no: voucherNumber,
        vendor_name: party,
        gstin: gstin,
        grn_reference: grnRefNo,
        bill_from: billFrom,
        ship_from: shipFrom,
        input_type: purchaseInputType,
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
        items: purchaseItems
      };

      // Conditionally add Supply Foreign Details
      if (invoiceInForeignCurrency === 'Yes') {
        purchaseData.supply_foreign_details = {
          purchase_order_no: purchaseOrderNo,
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
    if (['qty', 'rate', 'igst', 'cgst', 'sgst', 'cess'].includes(field)) {
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


    // Auto-calculate Taxable Value (Qty * Rate) and Taxes
    if (field === 'qty' || field === 'rate' || field === 'itemCode' || field === 'itemName') { // Recalculate if item changes too (in case rate updated)
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
              {/* Row 1: Date, Supplier Invoice No, Purchase Voucher No */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
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

              {/* Row 2: Vendor Name, GSTIN, Upload */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  />
                  {/* datalist removed in favor of SearchableSelect */}
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
                  <div className="relative">
                    <input
                      type="file"
                      id="purchase-supporting-doc"
                      onChange={(e) => {
                        if (e.target.files) setPurchaseSupportingDocument(e.target.files[0]);
                      }}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                    />
                    <button
                      type="button"
                      onClick={() => document.getElementById('purchase-supporting-doc')?.click()}
                      className="w-full h-[42px] bg-indigo-50/500 hover:bg-indigo-600 text-white rounded-[4px] transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <span className="text-sm">Upload Document</span>
                    </button>
                    {purchaseSupportingDocument && (
                      <p className="mt-2 text-xs text-indigo-600 font-medium truncate">✓ {purchaseSupportingDocument.name}</p>
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

              {/* Row 4: Address Headers */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bill From (Full Address)</label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Ship From</label>
                </div>
              </div>

              {/* Row 5: Address Textareas */}
              <div className="grid grid-cols-2 gap-6">
                <div>
                  {vendorAddresses.length > 1 ? (
                    <SearchableSelect
                      value={billFrom}
                      onChange={(val) => {
                        setBillFrom(val);
                        setShipFrom(val); // Assume Ship From matches Bill From typically, optional
                      }}
                      options={vendorAddresses}
                      placeholder="Select Address"
                      className="w-full"
                    />
                  ) : (
                    <textarea
                      value={billFrom}
                      onChange={(e) => setBillFrom(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                    />
                  )}
                </div>
                <div>
                  <textarea
                    value={shipFrom}
                    onChange={(e) => setShipFrom(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                  />
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
                        setPurchaseInputType('Intrastate');
                        setIsInterState(false);
                      }}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-colors ${purchaseInputType === 'Intrastate'
                        ? 'bg-white border-gray-400 text-gray-800 font-medium'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                    >
                      CGST & SGST
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseInputType('Interstate');
                        setIsInterState(true);
                      }}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-colors ${purchaseInputType === 'Interstate'
                        ? 'bg-white border-gray-400 text-gray-800 font-medium'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                    >
                      IGST
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPurchaseInputType('Import');
                        setIsInterState(true);
                      }}
                      className={`flex-1 px-4 py-2 border rounded-[4px] transition-colors ${purchaseInputType === 'Import'
                        ? 'bg-white border-gray-400 text-gray-800 font-medium'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
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
                      className={`px-8 py-2 border rounded-[4px] transition-colors ${invoiceInForeignCurrency === 'Yes'
                        ? 'bg-white border-gray-400 text-gray-800 font-medium'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
                        }`}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => setInvoiceInForeignCurrency('No')}
                      className={`px-8 py-2 border rounded-[4px] transition-colors ${invoiceInForeignCurrency === 'No'
                        ? 'bg-white border-gray-400 text-gray-800 font-medium'
                        : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
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
                      >
                        <option value="">Select Purchase Order</option>
                        <option value="PO-001">PO-001</option>
                        <option value="PO-002">PO-002</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-white px-4 py-2 border border-slate-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
                  <span className="text-sm font-medium text-gray-700">1 Foreign Currency =</span>
                  <input
                    type="text"
                    value={exchangeRate}
                    onChange={(e) => setExchangeRate(e.target.value)}
                    className="w-24 border-b-2 border-gray-300 focus:border-indigo-500 focus:outline-none px-2 py-1 text-center font-medium text-indigo-600"
                    placeholder="Rate"
                  />
                  <span className="text-sm font-medium text-gray-700">INR</span>
                </div>
              </div>

              {/* Foreign Currency Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
                <table className="w-full">
                  <thead className="bg-indigo-600 text-white">
                    <tr>
                      <th className="px-3 py-3 text-center w-12 border-r border-indigo-500"></th>
                      <th className="px-3 py-3 text-sm font-semibold text-center border-r border-indigo-500">Description</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-indigo-500">Quantity</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-32 border-r border-indigo-500">UQC</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-indigo-500">Rate</th>
                      <th className="px-3 py-3 text-sm font-semibold text-center w-40 border-r border-indigo-500">Amount</th>
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
                            value={row.rate}
                            onChange={(e) => handlePurchaseItemChange(index, 'rate', e.target.value)}
                            className="w-full px-2 py-1.5 border-0 focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent"
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={row.taxableValue}
                            readOnly
                            className="w-full px-2 py-1.5 bg-gray-50 border-0 rounded text-sm font-medium text-center text-gray-700"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
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
                  >
                    <option value="">Select Purchase Order</option>
                    <option value="PO-001">PO-001</option>
                    <option value="PO-002">PO-002</option>
                  </select>
                </div>

                {/* Purchase Ledger Selection (Added) */}
                <div className="flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Purchase Ledger
                  </label>
                  <div className="w-64">
                    <SearchableSelect
                      value={purchaseLedger}
                      onChange={setPurchaseLedger}
                      options={ledgers.filter(l => l.group === 'Purchase Accounts').map(l => l.name)} // Assuming 'Purchase Accounts' group
                      placeholder="Select Purchase Ledger"
                    />
                  </div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
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
                      {/* Add Item Button Row */}
                      <tr className="border-b border-gray-200 bg-indigo-50/50/10">
                        <td colSpan={12} className="px-4 py-2">
                          <button
                            type="button"
                            onClick={handleAddPurchaseItem}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Add Item
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
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
                          {(purchaseItems.reduce((sum, item) => sum + (Number(item.cgst) || 0), 0)).toFixed(2)}
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

                  {/* Right Column: Terms & Conditions */}
                  <div className="border border-gray-200 rounded-[4px] p-6 bg-white">
                    <div className="flex items-center justify-between mb-6">
                      <button
                        type="button"
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Terms & Conditions
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Edit Masters
                      </button>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-gray-700">Edit Here</h4>
                      <textarea
                        value={purchaseTerms}
                        onChange={(e) => setPurchaseTerms(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-gray-600 placeholder-gray-400 resize-none h-64"
                        placeholder="Enter terms and conditions..."
                      />
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
                {/* Main Two-Column Layout (Matching SalesVoucher structure) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">

                  {/* Left Column */}
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

                    {/* Receipt Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Receipt Date
                      </label>
                      <input
                        type="date"
                        value={purchaseTransitReceiptDate}
                        onChange={(e) => setPurchaseTransitReceiptDate(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    {/* Receipt Time */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Receipt Time
                      </label>
                      <input
                        type="time"
                        value={purchaseTransitReceiptTime}
                        onChange={(e) => setPurchaseTransitReceiptTime(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>

                    {/* Upload Document */}
                    <div className="mt-6">
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
                        className="w-full h-40 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-white hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
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

                  {/* Right Column (Transport Details) */}
                  <div className="space-y-4">
                    {/* Delivery Type */}
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



                    {/* Transporter ID/GSTIN */}
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
                        placeholder=""
                      />
                    </div>

                    {/* Transporter Name */}
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
                        placeholder=""
                      />
                    </div>

                    {/* Vehicle No. */}
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
                        placeholder=""
                      />
                    </div>

                    {/* LR/GR/Consignment */}
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
                        placeholder=""
                      />
                    </div>
                  </div>
                </div>

                {/* Air/Sea Mode */}
                {(purchaseTransitMode === 'Air' || purchaseTransitMode === 'Sea') && (
                  <div className="space-y-6 mt-6">
                    {/* Upto PORT (Consolidated for Air/Sea) */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">UPTO PORT</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
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
                      </div>
                    </div>
                  </div>
                )}

                {/* Rail Mode */}
                {purchaseTransitMode === 'Rail' && (
                  <div className="space-y-6 mt-6">
                    {/* Upto PORT (Consolidated for Rail) */}
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">UPTO PORT</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[4px] border border-gray-200">
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
                  value="xxxxxxx"
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
                  value="xxxxxxx"
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
    return allLedgers.filter(l =>
      l.group?.toLowerCase().includes('expense') ||
      l.group?.toLowerCase().includes('indirect')
    );
  }, [allLedgers]);

  // Get Post To ledgers (Liabilities + Cash & Bank)
  const postToLedgers = useMemo(() => {
    return allLedgers.filter(l =>
      l.group?.toLowerCase().includes('liabilit') ||
      l.group?.toLowerCase().includes('bank') ||
      l.group?.toLowerCase().includes('cash') ||
      l.group?.toLowerCase().includes('od') ||
      l.group?.toLowerCase().includes('cc')
    );
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
    if (isLimitReached) {
      handleLimitReached();
      return;
    }
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Voucher Number <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={voucherNumber}
            readOnly
            className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
          />
        </div>
      </div>

      {/* Expense Rows */}
      <div className="space-y-6">
        {expenseRows.map((row, index) => (
          <div key={row.id} className="border-2 border-gray-200 rounded-[4px] p-6 bg-white shadow-none border border-slate-200-none border border-slate-200">
            {/* Row Header */}
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-semibold text-gray-700">Expense Entry #{index + 1}</h4>
              {expenseRows.length > 1 && (
                <button
                  onClick={() => handleRemoveExpenseRow(row.id)}
                  className="text-red-500 hover:text-red-700"
                  title="Remove this expense"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Main Fields Row */}
            <div className="grid grid-cols-5 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
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
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bill Ref No <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={row.billRefNo}
                  onChange={e => handleExpenseRowChange(row.id, 'billRefNo', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!row.billRefNo ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Invoice #"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Entry Note <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={row.entryNote}
                  onChange={e => handleExpenseRowChange(row.id, 'entryNote', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!row.entryNote ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Note"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Total Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={row.totalAmount || ''}
                  onChange={e => handleExpenseRowChange(row.id, 'totalAmount', parseFloat(e.target.value) || 0)}
                  className={`w-full px-3 py-2 border rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${row.totalAmount <= 0 ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Add Tax Button */}
            {!row.showTax && (
              <button
                onClick={() => handleToggleTax(row.id)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-100"
              >
                <Icon name="plus" className="w-4 h-4 mr-2" />
                Add Tax
              </button>
            )}

            {/* GST Section */}
            {row.showTax && (
              <div className="mt-4 p-4 bg-indigo-50/50 border border-slate-200 rounded-[4px]">
                <div className="flex justify-between items-center mb-3">
                  <h5 className="text-xs font-semibold text-gray-700">GST Details</h5>
                  <button
                    onClick={() => handleToggleTax(row.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Hide
                  </button>
                </div>

                <div className="grid grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      GST Rate <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={row.gstRate}
                      onChange={e => handleExpenseRowChange(row.id, 'gstRate', parseFloat(e.target.value))}
                      className="w-full px-2 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {gstRateOptions.map(rate => (
                        <option key={rate} value={rate}>{rate}%</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Taxable Value <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      value={row.taxableValue || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'taxableValue', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">IGST</label>
                    <input
                      type="number"
                      value={row.igst || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'igst', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">CGST</label>
                    <input
                      type="number"
                      value={row.cgst || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'cgst', parseFloat(e.target.value) || 0)}
                      disabled={row.igst > 0}
                      className={`w-full px-2 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${row.igst > 0 ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">SGST</label>
                    <input
                      type="number"
                      value={row.sgst || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'sgst', parseFloat(e.target.value) || 0)}
                      disabled={row.igst > 0}
                      className={`w-full px-2 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${row.igst > 0 ? 'bg-gray-100 cursor-not-allowed' : 'bg-gray-50'}`}
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">CESS</label>
                    <input
                      type="number"
                      value={row.cess || ''}
                      onChange={e => handleExpenseRowChange(row.id, 'cess', parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
        className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-100"
      >
        <Icon name="plus" className="w-4 h-4 mr-2" />
        More Expenses
      </button>

      {/* File Upload Section */}
      <div className="mt-6 p-4 border-2 border-dashed border-gray-300 rounded-[4px]">
        <div className="flex items-center justify-between">
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-1">Upload Supporting Documents</h5>
            <p className="text-xs text-gray-500">PDF, JPG only (Optional)</p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-slate-700 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-100"
          >
            <Icon name="upload" className="w-4 h-4 mr-2" />
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg"
            multiple
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* Uploaded Files List */}
        {uploadedFiles.length > 0 && (
          <div className="mt-4 space-y-2">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center">
                  <Icon name="document" className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="text-sm text-gray-700">{file.name}</span>
                  <span className="ml-2 text-xs text-gray-500">({(file.size / 1024).toFixed(1)} KB)</span>
                </div>
                <button
                  onClick={() => handleRemoveFile(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Posting Note */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Posting Note</label>
        <textarea
          value={narration}
          onChange={e => setNarration(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={3}
          placeholder="Enter posting note..."
        />
      </div>

      {/* Action Buttons */}
      <div className="mt-8 pt-4 border-t flex justify-end space-x-3">
        <button
          onClick={resetForm}
          className="inline-flex items-center justify-center px-6 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Cancel
        </button>
        <button
          onClick={handleSaveExpenseVoucher}
          className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Post & Close
        </button>
      </div>
    </>
  );

  const renderJournalForm = () => (
    <>
      {/* Top Row: Date and Voucher Number */}
      <div className="grid grid-cols-2 gap-4 mb-6 max-w-md">
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

      {/* Journal Entries Table */}
      <div className="border-2 border-gray-200 rounded-[4px] p-6">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">Ledger</th>
              <th className="table-header">Note</th>
              <th className="table-header w-32">Ref. No.</th>
              <th className="table-header w-40">Debit</th>
              <th className="table-header w-40">Credit</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {entries.map((entry, index) => (
              <tr key={index}>
                <td className="px-4 py-2">
                  <SearchableSelect
                    value={entry.ledger}
                    onChange={(val) => handleEntryChange(index, 'ledger', val)}
                    options={allLedgers.map(l => l.name)}
                    placeholder="Select Ledger"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={entry.note}
                    onChange={e => handleEntryChange(index, 'note', e.target.value)}
                    placeholder="Note"
                    className="table-input"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="text"
                    value={entry.refNo}
                    onChange={e => handleEntryChange(index, 'refNo', e.target.value)}
                    placeholder="Ref #"
                    className="table-input"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={entry.debit}
                    onChange={e => handleEntryChange(index, 'debit', parseFloat(e.target.value) || 0)}
                    className="table-input"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={entry.credit}
                    onChange={e => handleEntryChange(index, 'credit', parseFloat(e.target.value) || 0)}
                    className="table-input"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => handleRemoveEntryRow(index)}
                    className="text-red-500 hover:text-red-700 p-1"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold border-t-2 border-gray-200">
            <tr>
              <td colSpan={3} className="px-4 py-3 text-right text-sm">Total</td>
              <td className="px-4 py-3 text-sm">{totalDebit.toFixed(2)}</td>
              <td className="px-4 py-3 text-sm">{totalCredit.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        <button
          onClick={handleAddEntryRow}
          className="mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center"
        >
          <Icon name="plus" className="w-4 h-4 mr-1" /> Add Row
        </button>
      </div>

      {/* Posting Note Section */}
      <div className="mt-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">Posting Note</label>
        <textarea
          value={narration}
          onChange={e => setNarration(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={3}
          placeholder="Enter posting note..."
        />
        {!isJournalBalanced && totalDebit > 0 && (
          <p className="text-red-500 text-sm mt-2">Totals do not match!</p>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-end justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Transaction Entry</p>
          <h2 className="text-[20px] font-bold text-slate-900">
            Voucher Entry
          </h2>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex space-x-6 overflow-x-auto border-b border-slate-200 no-scrollbar">
        {availableVoucherTypes.map(type => (
          <button
            key={type.id}
            onClick={() => { setVoucherType(type.id); resetForm(); }}
            className={`
              whitespace-nowrap pb-4 text-[13px] font-bold uppercase tracking-wider transition-all relative
              ${voucherType === type.id
                ? 'text-indigo-600'
                : 'text-slate-400 hover:text-slate-600'}
            `}
          >
            {type.label}
            {voucherType === type.id && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />
            )}
          </button>
        ))}
      </div>

      <div className="erp-card p-6">
        <div className="flex justify-between items-center border-b pb-4 mb-6">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-semibold text-gray-900">{voucherType} Voucher</h3>
            {subscriptionUsage && (
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${isLimitReached ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                Usage: {subscriptionUsage.used} / {subscriptionUsage.limit}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => isLimitReached ? handleLimitReached() : setIsInvoiceScannerOpen(true)}
              className={`inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isLimitReached ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              title={isLimitReached ? "Limit Reached" : "Upload Invoices"}
            >
              <Icon name="upload" className="w-4 h-4 mr-2" />
              Upload Invoices
            </button>
            <button
              onClick={() => isLimitReached ? handleLimitReached() : setIsMassUploadOpen(true)}
              className={`inline-flex items-center justify-center px-4 py-2 border border-purple-200 text-sm font-medium rounded shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 ${isLimitReached ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'text-purple-700 bg-white hover:bg-purple-50'}`}
              title={isLimitReached ? "Limit Reached" : "Mass Upload"}
            >
              <Icon name="upload" className="w-4 h-4 mr-2" />
              Mass Upload
            </button>
            <div className="relative" ref={importMenuRef}>
              <button
                onClick={() => isLimitReached ? handleLimitReached() : setIsImportMenuOpen(prev => !prev)}
                className={`inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${isLimitReached ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                <Icon name="upload" className="w-5 h-5 mr-2" />
                Import Vouchers
              </button>
              {isImportMenuOpen && (
                <div className="origin-top-right absolute right-0 mt-2 w-56 rounded shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                    <a href="#" onClick={(e) => { e.preventDefault(); if (isLimitReached) { handleLimitReached(); return; } setIsInvoiceScannerOpen(true); setIsImportMenuOpen(false); }} className={`block px-4 py-2 text-sm ${isLimitReached ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`} role="menuitem">Upload Invoices (Scan)</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); if (isLimitReached) { handleLimitReached(); return; } setIsMassUploadOpen(true); setIsImportMenuOpen(false); }} className={`block px-4 py-2 text-sm font-medium ${isLimitReached ? 'text-gray-400 cursor-not-allowed' : 'text-purple-600 hover:bg-gray-100'}`} role="menuitem">Bulk Upload (AI)</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); if (isLimitReached) { handleLimitReached(); return; } triggerFileUpload(imageInputRef); }} className={`block px-4 py-2 text-sm ${isLimitReached ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'}`} role="menuitem">From Image/PDF {(voucherType === 'Purchase' || voucherType === 'Sales') ? '(AI)' : ''}</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); if (isLimitReached) { handleLimitReached(); return; } triggerFileUpload(jsonInputRef); setIsImportMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">From JSON</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); if (isLimitReached) { handleLimitReached(); return; } triggerFileUpload(excelInputRef); setIsImportMenuOpen(false); }} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">From Excel</a>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleDownloadTemplate(); }} className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100" role="menuitem">
                      <Icon name="download" className="w-4 h-4 mr-2" />
                      Download Template
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
          <input type="file" ref={imageInputRef} onChange={handleImageFileChange} accept="image/png, image/jpeg, application/pdf" className="hidden" />
          <input type="file" ref={jsonInputRef} onChange={handleJsonFileChange} accept=".json" className="hidden" />
          <input type="file" ref={excelInputRef} onChange={handleExcelFileChange} accept=".xlsx, .xls" className="hidden" />
        </div>
        <style>{`
          .form-label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.25rem; }
          .form-input { display: block; width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; box-shadow-none border border-slate-200: 0 1px 2px 0 rgb(0 0 0 / 0.05); outline: none; transition: border-color 0.15s ease-in-out, box-shadow-none border border-slate-200 0.15s ease-in-out; }
          .form-input:focus { border-color: #3b82f6; box-shadow-none border border-slate-200: 0 0 0 1px #3b82f6; }
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
            box-shadow-none border border-slate-200: 0 0 0 1px #3b82f6;
          }
          .table-input[readOnly] {
            background-color: #f9fafb;
            color: #4b5563;
            cursor: not-allowed;
          }
          .table-header { padding: 0.75rem 1rem; text-align: center; font-size: 0.75rem; font-weight: 600; color: #4b5563; text-transform: uppercase; letter-spacing: 0.05em; background-color: #f9fafb; }
        `}
        </style>
        {voucherType === 'Sales' && <SalesVoucher prefilledData={prefilledData} clearPrefilledData={clearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} />}
        {voucherType === 'Payment' && <PaymentVoucherSingle prefilledData={prefilledData} clearPrefilledData={clearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} />}
        {voucherType === 'Receipt' && <ReceiptVoucher prefilledData={prefilledData} clearPrefilledData={clearPrefilledData} isLimitReached={isLimitReached} onLimitReached={handleLimitReached} />}
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
            <button onClick={resetForm} className="inline-flex items-center justify-center px-6 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500">
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
                className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Next
              </button>
            ) : (
              <>
                {isLimitReached && (voucherType === 'Purchase') ? (
                  <button
                    className="inline-flex items-center justify-center px-6 py-2 bg-slate-300 text-slate-500 font-medium rounded-[4px] cursor-not-allowed border border-slate-300"
                    title="Monthly invoice limit reached. Please upgrade your plan."
                  >
                    Limit Reached
                  </button>
                ) : (
                  <>
                    <button onClick={handleSaveVoucher} className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                      Post & Close
                    </button>
                    <button onClick={handleSaveVoucher} className="inline-flex items-center justify-center px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">
                      Post & Print/Email
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>



      {/* Recent / Imported Vouchers - show below the form so imports are visible immediately */}
      {
        vouchers && vouchers.length > 0 && (
          <div className="mt-8 bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Vouchers</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-slate-100"><tr>
                  <th className="table-header">Date</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Inv No.</th>
                  <th className="table-header">Party</th>
                  <th className="table-header text-right">Taxable</th>
                  <th className="table-header text-right">Tax</th>
                  <th className="table-header text-right">Total</th>
                </tr></thead>
                <tbody className="bg-white divide-y divide-gray-200">
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
      {/* Mass Upload Modal */}
      {
        isMassUploadOpen && (
          <MassUploadModal
            onClose={() => setIsMassUploadOpen(false)}
            onComplete={(newVouchers) => {
              if (onMassUploadComplete) {
                onMassUploadComplete(newVouchers);
              } else {
                onAddVouchers(newVouchers);
              }
              setIsMassUploadOpen(false);
            }}
            ledgers={ledgers}
            stockItems={stockItems}
            companyDetails={companyDetails}
            voucherType={voucherType}
          />
        )
      }

      {/* Invoice Scanner Modal */}
      {
        isInvoiceScannerOpen && (
          <InvoiceScannerModal
            onClose={() => {
              setIsInvoiceScannerOpen(false);
              refetch(); // Refresh usage after scan
            }}
          />
        )
      }

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

                // Add to pending list and select it
                if (response.grn_no) {
                  setPendingGRNs(prev => [...prev, response]);
                  setGrnRefNo(response.grn_no);
                }

                alert('GRN Created Successfully!');
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
    </div >
  );
};

export default VouchersPage;


