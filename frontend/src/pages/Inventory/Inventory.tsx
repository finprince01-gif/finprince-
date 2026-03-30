import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';
import { apiService } from '../../services/api';
import { CompanyDetails } from '../../types';
import { InventoryCategoryWizard } from '../../components/InventoryCategoryWizard';
import CategoryHierarchicalDropdown from '../../components/CategoryHierarchicalDropdown';
import { usePermissions } from '../../hooks/usePermissions';
import { getCountries, getStates, getCities } from '../../utils/locationData';
import SearchableDropdown from '../../components/SearchableDropdown';
import { showError, showSuccess, confirm } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';



// Interfaces
interface Location {
  id: number;
  name: string;
  location_type: string;
  location_type_display: string;
  address_line1: string;
  address_line2: string | null;
  address_line3: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  gstin: string | null;
  vendor_name?: string | null;
  customer_name?: string | null;
  state_code?: string | null;
  location_address?: string | null;
}

interface Item {
  id: number;
  item_code: string;
  item_name?: string; // Backend style
  name: string;      // Frontend style
  category: number;
  category_name: string;
  hsn_code: string | null;
  description: string;
  unit: string;
  uom?: string;      // Backend style
  has_multiple_units: boolean;
  alternative_unit: string | null;
  alternate_uom?: string | null; // Backend style
  conversion_factor: string | number | null;
  gst_rate: string | number | null;
  rate: string;
  location: number | null;
  location_name: string | null;
  standard_rate?: string | number | null;
  is_active: boolean;
}

const InventoryPage: React.FC = () => {
  // Permissions
  const { hasTabAccess, getAccessibleTabs, isSuperuser } = usePermissions();

  // Top Level Tabs
  const allTabs = ['Master', 'Operations'] as const;
  type Tab = typeof allTabs[number];

  const masterSubTabsList = ['Category', 'Location', 'Inventory Items', 'GRN & Issue Slip'] as const;
  const operationsSubTabsList = ['Stock Movement', 'Issue Slip Creation', 'GRN Creation'];

  // Filter tabs based on permissions
  const visibleTabs = isSuperuser
    ? allTabs
    : allTabs.filter(tab => {
      if (tab === 'Master') {
        return masterSubTabsList.some(sub => hasTabAccess('Inventory', sub));
      }
      if (tab === 'Operations') {
        return operationsSubTabsList.some(sub => hasTabAccess('Inventory', sub));
      }
      return false;
    });

  const [activeTab, setActiveTab] = useState<Tab>('Master');

  // Ensure activeTab is valid
  // If current activeTab is not visible, switch to first visible tab
  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.includes(activeTab)) {
      setActiveTab(visibleTabs[0]);
    }
  }, [visibleTabs, activeTab]);

  // Master Sub Tabs
  // Filter based on granular permissions
  const masterSubTabs = isSuperuser
    ? masterSubTabsList
    : masterSubTabsList.filter(tab => hasTabAccess('Inventory', tab));

  type MasterSubTab = typeof masterSubTabsList[number];
  const [activeMasterSubTab, setActiveMasterSubTab] = useState<MasterSubTab>('Category');

  // Ensure activeMasterSubTab is valid
  useEffect(() => {
    if (masterSubTabs.length > 0 && !masterSubTabs.includes(activeMasterSubTab)) {
      setActiveMasterSubTab(masterSubTabs[0]);
    }
  }, [masterSubTabs, activeMasterSubTab]);

  // GRN & Issue Slip Sub Tabs
  const grnIssueSlipSubTabs = ['GRN', 'Issue Slip'] as const;
  type GRNIssueSlipSubTab = typeof grnIssueSlipSubTabs[number];
  const [activeGRNIssueSlipSubTab, setActiveGRNIssueSlipSubTab] = useState<GRNIssueSlipSubTab>('GRN');

  // --- Location State ---
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState('');
  const [isCustomLocationType, setIsCustomLocationType] = useState(false);
  const [customLocationTypeValue, setCustomLocationTypeValue] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [locAddressLine1, setLocAddressLine1] = useState('');
  const [locAddressLine2, setLocAddressLine2] = useState('');
  const [locAddressLine3, setLocAddressLine3] = useState('');
  const [locCity, setLocCity] = useState('');
  const [locState, setLocState] = useState('');
  const [locCountry, setLocCountry] = useState('');
  const [locPincode, setLocPincode] = useState('');
  const [locationGstin, setLocationGstin] = useState('');
  const [isEditModeLocation, setIsEditModeLocation] = useState(false);
  const [isViewModeLocation, setIsViewModeLocation] = useState(false);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [locationSearchQuery, setLocationSearchQuery] = useState('');

  // --- Item State ---
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemCode, setItemCode] = useState('');
  const [itemName, setItemName] = useState('');
  const [itemCategory, setItemCategory] = useState<number | null>(null);
  const [itemCategoryPath, setItemCategoryPath] = useState('');
  const [itemHsn, setItemHsn] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [itemUnit, setItemUnit] = useState('nos');
  const [itemHasMultipleUnits, setItemHasMultipleUnits] = useState(false);
  const [itemAltUnit, setItemAltUnit] = useState('');
  const [itemConversionFactor, setItemConversionFactor] = useState('');
  const [itemGstRate, setItemGstRate] = useState('0.00');
  const [itemRate, setItemRate] = useState('');
  const [itemLocation, setItemLocation] = useState<number | null>(null);
  const [isEditModeItem, setIsEditModeItem] = useState(false);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // --- Dynamic Data State for Location ---
  const [vendors, setVendors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vendorAddresses, setVendorAddresses] = useState<any[]>([]);
  const [customerAddresses, setCustomerAddresses] = useState<any[]>([]);
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [categoryUpdateCount, setCategoryUpdateCount] = useState(0);

  // --- Company Details State ---
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(null);

  // --- GRN Series State ---
  const [grnSeriesName, setGrnSeriesName] = useState('');
  const [grnSeriesType, setGrnSeriesType] = useState('');
  const [grnPrefix, setGrnPrefix] = useState('');
  const [grnSuffix, setGrnSuffix] = useState('');
  const [grnYear, setGrnYear] = useState('');
  const [grnRequiredDigits, setGrnRequiredDigits] = useState('');
  const [grnPreview, setGrnPreview] = useState('');
  const [isEditModeGRNSeries, setIsEditModeGRNSeries] = useState(false);
  const [grnSeriesList, setGrnSeriesList] = useState<any[]>([]);
  const [selectedGrnSeries, setSelectedGrnSeries] = useState<any>(null);
  const [loadingGrnSeries, setLoadingGrnSeries] = useState(false);

  // --- Issue Slip Series State ---
  const [issueSlipSeriesName, setIssueSlipSeriesName] = useState('');
  const [issueSlipType, setIssueSlipType] = useState('');
  const [issueSlipPrefix, setIssueSlipPrefix] = useState('');
  const [issueSlipSuffix, setIssueSlipSuffix] = useState('');
  const [issueSlipYear, setIssueSlipYear] = useState('');
  const [issueSlipRequiredDigits, setIssueSlipRequiredDigits] = useState('');
  const [issueSlipPreview, setIssueSlipPreview] = useState('');
  const [isEditModeIssueSlipSeries, setIsEditModeIssueSlipSeries] = useState(false);
  const [issueSlipSeriesList, setIssueSlipSeriesList] = useState<any[]>([]);
  const [selectedIssueSlipSeries, setSelectedIssueSlipSeries] = useState<any>(null);
  const [loadingIssueSlipSeries, setLoadingIssueSlipSeries] = useState(false);

  // --- API Functions for Series ---
  const fetchGrnSeries = async () => {
    try {
      setLoadingGrnSeries(true);
      const response = await apiService.getGRNSeries();
      const mapped = Array.isArray(response) ? response.map((item: any) => ({
        id: item.id,
        name: item.name,
        grnType: item.grn_type,
        prefix: item.prefix,
        suffix: item.suffix,
        year: item.year,
        requiredDigits: item.required_digits,
        preview: item.preview,
        original: item
      })) : [];
      setGrnSeriesList(mapped);
    } catch (error) {
      console.error('Error fetching GRN series:');
    } finally {
      setLoadingGrnSeries(false);
    }
  };

  const fetchIssueSlipSeries = async () => {
    try {
      setLoadingIssueSlipSeries(true);
      const response = await apiService.getIssueSlipSeries();
      const mapped = Array.isArray(response) ? response.map((item: any) => ({
        id: item.id,
        name: item.name,
        issueSlipType: item.issue_slip_type,
        prefix: item.prefix,
        suffix: item.suffix,
        year: item.year,
        requiredDigits: item.required_digits,
        preview: item.preview,
        original: item
      })) : [];
      setIssueSlipSeriesList(mapped);
    } catch (error) {
      console.error('Error fetching Issue Slip series:');
    } finally {
      setLoadingIssueSlipSeries(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'Master') {
      if (activeMasterSubTab === 'GRN & Issue Slip') {
        if (activeGRNIssueSlipSubTab === 'GRN') fetchGrnSeries();
        if (activeGRNIssueSlipSubTab === 'Issue Slip') fetchIssueSlipSeries();
      }
    }
  }, [activeTab, activeMasterSubTab, activeGRNIssueSlipSubTab]);

  // --- Inventory Items State ---
  const [selectedItemDetail, setSelectedItemDetail] = useState<any>(null);
  const [itemSearchQuery2, setItemSearchQuery2] = useState('');
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [isVendorSpecificItemCode, setIsVendorSpecificItemCode] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [availableSubgroups, setAvailableSubgroups] = useState<any[]>([]);

  // --- Operations State ---
  const [selectedItemForOps, setSelectedItemForOps] = useState<any>(null);
  const [showItemDetail, setShowItemDetail] = useState(false);
  const [showIssueSlipForm, setShowIssueSlipForm] = useState(false);
  const [issueSlipTab, setIssueSlipTab] = useState<'job-work' | 'inter-unit' | 'location-change' | 'production' | 'consumption' | 'outward' | 'scrap'>('job-work');
  const [jobWorkSubTab, setJobWorkSubTab] = useState<'received' | 'sent'>('received');
  const [jobWorkSentType, setJobWorkSentType] = useState<'outward' | 'receipt'>('outward');
  const [productionType, setProductionType] = useState<'materials_issued' | 'inter_process' | 'finished_goods'>('materials_issued');
  const [outwardType, setOutwardType] = useState('sales');
  const [issueSlipNumber, setIssueSlipNumber] = useState('');
  const [issueSlipDate, setIssueSlipDate] = useState('');
  const [issueSlipTime, setIssueSlipTime] = useState('');
  const [goodsFromLocation, setGoodsFromLocation] = useState('');
  const [goodsToLocation, setGoodsToLocation] = useState('');
  const [interProcessToLocation, setInterProcessToLocation] = useState('');
  const [jobWorkOrderNo, setJobWorkOrderNo] = useState('');
  const [jobWorkOrderNoOptions, setJobWorkOrderNoOptions] = useState<any[]>([]); // Options for Job Work POs
  const [jobWorkReceiptNo, setJobWorkReceiptNo] = useState('');
  const [jobWorkOutwardRefNo, setJobWorkOutwardRefNo] = useState('');
  const [jobWorkOutwardOptions, setJobWorkOutwardOptions] = useState<any[]>([]);
  const [vendorDeliveryChallan, setVendorDeliveryChallan] = useState('');
  const [jwItemTab, setJwItemTab] = useState<'outward' | 'received'>('outward');
  const [outwardSalesOrder, setOutwardSalesOrder] = useState('');
  const [outwardCustomerName, setOutwardCustomerName] = useState('');
  const [outwardBranch, setOutwardBranch] = useState('');
  const [outwardAddress, setOutwardAddress] = useState('');
  const [outwardGstin, setOutwardGstin] = useState('');
  const [outwardTotalBoxes, setOutwardTotalBoxes] = useState('');
  const [outwardSupplierInvoice, setOutwardSupplierInvoice] = useState('');
  const [outwardVendorName, setOutwardVendorName] = useState('');
  const [outwardBranchOptions, setOutwardBranchOptions] = useState<any[]>([]); // Added for dynamic branches
  const [outwardSalesOrderOptions, setOutwardSalesOrderOptions] = useState<any[]>([]);
  const [outwardSupplierInvoiceOptions, setOutwardSupplierInvoiceOptions] = useState<any[]>([]);
  const [materialIssueSlipNo, setMaterialIssueSlipNo] = useState('');
  const [materialIssueSlipOptions, setMaterialIssueSlipOptions] = useState<any[]>([]);
  const [selectedMaterialIssueSlips, setSelectedMaterialIssueSlips] = useState<string[]>([]);
  const [processTransferSlipOptions, setProcessTransferSlipOptions] = useState<any[]>([]);
  const [selectedProcessTransferSlips, setSelectedProcessTransferSlips] = useState<string[]>([]);
  const [processTransferSlipNo, setProcessTransferSlipNo] = useState('');
  const [prodItemTab, setProdItemTab] = useState<'materials_issued' | 'converted_output'>('materials_issued');
  const [issueSlipItems, setIssueSlipItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantity: '', rate: '', value: 0, noOfBoxes: '' }]);
  const [resultingWIPItems, setResultingWIPItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantity: '' }]);
  const [convertedOutputItems, setConvertedOutputItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantity: '', rate: '', amount: '' }]);
  const [fgReceiptSlipNo, setFgReceiptSlipNo] = useState('');
  const [fgItemTab, setFgItemTab] = useState<'materials_issued' | 'goods_produced'>('materials_issued');
  const [fgMaterialsIssuedItems, setFgMaterialsIssuedItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantityAvailable: '', quantityIssued: '', rate: '', amount: '' }]);
  const [goodsProducedItems, setGoodsProducedItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantityProduced: '', costAllocation: '100', rate: '', amount: '' }]);
  const [showGRNForm, setShowGRNForm] = useState(false);
  const [grnType, setGrnType] = useState('purchases');
  const [grnNumber, setGrnNumber] = useState('');
  const [grnSelectedSeriesId, setGrnSelectedSeriesId] = useState<number | null>(null);
  const [grnSelectedSeriesName, setGrnSelectedSeriesName] = useState('');
  const [grnDate, setGrnDate] = useState('');
  const [grnTime, setGrnTime] = useState('');
  const [grnLocation, setGrnLocation] = useState('');
  const [grnVendorName, setGrnVendorName] = useState('');
  const [grnCustomerName, setGrnCustomerName] = useState('');
  const [grnBranch, setGrnBranch] = useState('');
  const [grnBranchOptions, setGrnBranchOptions] = useState<any[]>([]);
  const [grnAddress, setGrnAddress] = useState('');
  const [grnGstin, setGrnGstin] = useState('');
  const [grnSelectedPOs, setGrnSelectedPOs] = useState<string[]>([]); // Multi-select for Purchase Orders
  const [grnSelectedSalesVouchers, setGrnSelectedSalesVouchers] = useState<string[]>([]); // Multi-select for Sales Return
  const [grnReferenceNoOptions, setGrnReferenceNoOptions] = useState<any[]>([]);
  const [grnSecondaryRefNo, setGrnSecondaryRefNo] = useState(''); // Supplier Invoice or Debit Note
  const [grnSecondaryRefNoOptions, setGrnSecondaryRefNoOptions] = useState<any[]>([]);
  const [consumptionType, setConsumptionType] = useState<'fixed_assets' | 'daily_operations'>('fixed_assets');
  const [fixedAssetLedger, setFixedAssetLedger] = useState('');
  const [expenseLedger, setExpenseLedger] = useState('');
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [selectedIssueSlipSeriesName, setSelectedIssueSlipSeriesName] = useState('');

  // --- Scrap Tab State ---
  const [scrapSubType, setScrapSubType] = useState<'production' | 'other' | 'disposed'>('production');
  // Production Scrap
  const [scrapProdSlipSeries, setScrapProdSlipSeries] = useState('');
  const [scrapProdSlipNo, setScrapProdSlipNo] = useState('');
  const [scrapProdDate, setScrapProdDate] = useState('');
  const [scrapProdTime, setScrapProdTime] = useState('');
  const [scrapProdIssuedTo, setScrapProdIssuedTo] = useState('');
  const [scrapProdProductionSlipNo, setScrapProdProductionSlipNo] = useState('');
  const [scrapProdItems, setScrapProdItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantityGenerated: '' }]);
  const [scrapProdPostingNote, setScrapProdPostingNote] = useState('');
  // Other Scrap
  const [scrapOtherSlipSeries, setScrapOtherSlipSeries] = useState('');
  const [scrapOtherSlipNo, setScrapOtherSlipNo] = useState('');
  const [scrapOtherDate, setScrapOtherDate] = useState('');
  const [scrapOtherTime, setScrapOtherTime] = useState('');
  const [scrapOtherIssuedFrom, setScrapOtherIssuedFrom] = useState('');
  const [scrapOtherIssuedTo, setScrapOtherIssuedTo] = useState('');
  const [scrapOtherItemsScrapped, setScrapOtherItemsScrapped] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantity: '' }]);
  const [scrapOtherResultingItems, setScrapOtherResultingItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantity: '', rate: '', value: 0 }]);
  const [scrapOtherPostingNote, setScrapOtherPostingNote] = useState('');
  // Scrap Disposed
  const [scrapDispSlipSeries, setScrapDispSlipSeries] = useState('');
  const [scrapDispSlipNo, setScrapDispSlipNo] = useState('');
  const [scrapDispDate, setScrapDispDate] = useState('');
  const [scrapDispTime, setScrapDispTime] = useState('');
  const [scrapDispIssuedFrom, setScrapDispIssuedFrom] = useState('');
  const [scrapDispItems, setScrapDispItems] = useState<any[]>([{ itemCode: '', itemName: '', uom: '', quantityDisposed: '', rate: '', value: 0 }]);
  const [scrapDispReasonForDisposal, setScrapDispReasonForDisposal] = useState('');
  const [scrapDispMethodOfDisposal, setScrapDispMethodOfDisposal] = useState('');
  const [scrapDispAgency, setScrapDispAgency] = useState('');
  const [scrapDispCertificate, setScrapDispCertificate] = useState<File | null>(null);

  // Document Upload State
  const [grnDocument, setGrnDocument] = useState<File | null>(null);
  const [grnDocumentPreview, setGrnDocumentPreview] = useState<string | null>(null);
  const [isGrnDocumentModalOpen, setIsGrnDocumentModalOpen] = useState(false);
  const [grnItems, setGrnItems] = useState<any[]>([{
    itemCode: '', itemName: '', uom: '', refQty: '', secondaryQty: '', receivedQty: '', acceptedQty: '', rejectedQty: '', shortExcessQty: '', remarks: ''
  }]);
  const [grnReason, setGrnReason] = useState('');
  const [grnPostingNote, setGrnPostingNote] = useState('');
  const [postingNote, setPostingNote] = useState('');
  const [showDeliveryChallan, setShowDeliveryChallan] = useState(false);
  const [deliveryChallanAddress, setDeliveryChallanAddress] = useState('');
  const [deliveryChallanDate, setDeliveryChallanDate] = useState('');

  const [showEWayBill, setShowEWayBill] = useState(false);
  const [irn, setIrn] = useState('');
  const [ackNo, setAckNo] = useState('');

  // E-Invoice & E-way Bill Details State
  interface EwayBillEntry {
    id: number;
    available: string;
    ewayBillNo: string;
    date: string;
    validityPeriod: string;
    distance: string;
    // Extended details
    extensionDate: string;
    extendedEwbNo: string;
    extensionReason: string;
    fromPlace: string;
    remainingDistance: string;
    newValidity: string;
    updatedVehicleNo: string;
  }

  const [ewayValidationEntries, setEwayValidationEntries] = useState<EwayBillEntry[]>([{
    id: 1,
    available: 'Yes',
    ewayBillNo: '',
    date: '',
    validityPeriod: '',
    distance: '',
    extensionDate: '',
    extendedEwbNo: '',
    extensionReason: '',
    fromPlace: '',
    remainingDistance: '',
    newValidity: '',
    updatedVehicleNo: ''
  }]);

  const handleEwayEntryChange = (id: number, field: keyof EwayBillEntry, value: string) => {
    setEwayValidationEntries(prev => prev.map(entry =>
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  const handleAddEwayEntry = () => {
    setEwayValidationEntries(prev => [...prev, {
      id: Date.now(),
      available: 'Yes',
      ewayBillNo: '',
      date: '',
      validityPeriod: '',
      distance: '',
      extensionDate: '',
      extendedEwbNo: '',
      extensionReason: '',
      fromPlace: '',
      remainingDistance: '',
      newValidity: '',
      updatedVehicleNo: ''
    }]);
  };

  const handleRemoveEwayEntry = (id: number) => {
    if (ewayValidationEntries.length > 1) {
      setEwayValidationEntries(prev => prev.filter(entry => entry.id !== id));
    }
  };


  // Dispatch Details State
  const [dispatchFrom, setDispatchFrom] = useState('');
  const [receiptDocument, setReceiptDocument] = useState<File | null>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [modeOfTransport, setModeOfTransport] = useState('');
  const [dispatchDate, setDispatchDate] = useState('');
  const [dispatchTime, setDispatchTime] = useState('');
  const [dispatchDocument, setDispatchDocument] = useState<File | null>(null);
  const [deliveryType, setDeliveryType] = useState('');
  const [transporterId, setTransporterId] = useState('');
  const [transporterName, setTransporterName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [lrGrConsignment, setLrGrConsignment] = useState('');
  const [uptoPortShippingBillNo, setUptoPortShippingBillNo] = useState('');
  const [uptoPortShipPortCode, setUptoPortShipPortCode] = useState('');
  const [uptoPortShippingBillDate, setUptoPortShippingBillDate] = useState('');
  const [uptoPortOrigin, setUptoPortOrigin] = useState('');

  // Beyond Port Details (for Air/Sea transport)
  const [beyondPortShippingBillNo, setBeyondPortShippingBillNo] = useState('');
  const [beyondPortShippingBillDate, setBeyondPortShippingBillDate] = useState('');
  const [beyondPortShipPortCode, setBeyondPortShipPortCode] = useState('');
  const [beyondPortVesselFlightNo, setBeyondPortVesselFlightNo] = useState('');
  const [beyondPortPortOfLoading, setBeyondPortPortOfLoading] = useState('');
  const [beyondPortPortOfDischarge, setBeyondPortPortOfDischarge] = useState('');
  const [beyondPortFinalDestination, setBeyondPortFinalDestination] = useState('');
  const [beyondPortOriginCountry, setBeyondPortOriginCountry] = useState('');
  const [beyondPortDestCountry, setBeyondPortDestCountry] = useState('');

  // Rail Details (for Rail transport)
  const [railUptoPortDeliveryType, setRailUptoPortDeliveryType] = useState('');
  const [railUptoPortTransporterId, setRailUptoPortTransporterId] = useState('');
  const [railUptoPortTransporterName, setRailUptoPortTransporterName] = useState('');
  const [railBeyondPortRailwayReceiptNo, setRailBeyondPortRailwayReceiptNo] = useState('');
  const [railBeyondPortRailwayReceiptDate, setRailBeyondPortRailwayReceiptDate] = useState('');
  const [railBeyondPortOrigin, setRailBeyondPortOrigin] = useState('');
  const [railBeyondPortOriginCountry, setRailBeyondPortOriginCountry] = useState('');
  const [railBeyondPortRailNo, setRailBeyondPortRailNo] = useState('');
  const [railBeyondPortStationOfLoading, setRailBeyondPortStationOfLoading] = useState('');
  const [railBeyondPortStationOfDischarge, setRailBeyondPortStationOfDischarge] = useState('');
  const [railBeyondPortFinalDestination, setRailBeyondPortFinalDestination] = useState('');
  const [railBeyondPortDestCountry, setRailBeyondPortDestCountry] = useState('');

  const [operationsStockData, setOperationsStockData] = useState<any[]>([
    { id: 1, category: 'Electronics', subCategory: 'Mobile', itemCode: 'IT001', itemName: 'Product A', uom: 'Nos', openingQty: 100, openingValue: 150000, inwardQty: 50, inwardValue: 75000, outwardQty: 30, outwardValue: 45000, closingQty: 120, closingValue: 180000 },
    { id: 2, category: 'Furniture', subCategory: 'Chairs', itemCode: 'IT002', itemName: 'Product B', uom: 'Nos', openingQty: 200, openingValue: 1000000, inwardQty: 100, inwardValue: 500000, outwardQty: 50, outwardValue: 250000, closingQty: 250, closingValue: 1250000 },
    { id: 3, category: 'Textiles', subCategory: 'Fabric', itemCode: 'IT003', itemName: 'Product C', uom: 'Mtr', openingQty: 1000, openingValue: 250000, inwardQty: 500, inwardValue: 125000, outwardQty: 300, outwardValue: 75000, closingQty: 1200, closingValue: 300000 },
  ]);

  const [stockDetailsData, setStockDetailsData] = useState<any[]>([
    { id: 1, date: '2024-01-01', particulars: 'Purchase', refNo: 'GRN-2024-001', location: 'Main Store', uom: 'Nos', openingQty: 100, openingValue: 150000, inwardQty: 50, inwardValue: 75000, outwardQty: 0, outwardValue: 0, closingQty: 150, closingValue: 225000 },
    { id: 2, date: '2024-01-05', particulars: 'Job Work', refNo: 'ISS-2024-005', location: 'Floor 1', uom: 'Nos', openingQty: 150, openingValue: 225000, inwardQty: 0, inwardValue: 0, outwardQty: 20, outwardValue: 30000, closingQty: 130, closingValue: 195000 },
    { id: 3, date: '2024-01-10', particulars: 'Sales Return', refNo: 'GRN-2024-010', location: 'Main Store', uom: 'Nos', openingQty: 130, openingValue: 195000, inwardQty: 10, inwardValue: 15000, outwardQty: 0, outwardValue: 0, closingQty: 140, closingValue: 210000 },
  ]);

  const [detailsFilters, setDetailsFilters] = useState({
    date: '',
    particulars: '',
    refNo: '',
    location: '',
    uom: ''
  });

  const [stockFilters, setStockFilters] = useState({
    category: '',
    subCategory: '',
    itemCode: '',
    itemName: '',
    uom: ''
  });

  // Constants
  const locationTypes = [
    { value: 'company_premises', label: 'Company Premises' },
    { value: 'job_worker_location', label: 'Job Worker Location' },
    { value: 'customer_location', label: 'Customer Location' },
    { value: 'vendor_location', label: 'Vendor Location' },
    { value: 'agent_location', label: 'Agent Location' },
    { value: 'distributor_location', label: 'Distributor Location' },
    { value: 'customs_warehouse', label: 'Customs Warehouse' },
    { value: 'other_third_party', label: 'Other Third-Party Location' },
  ];

  const unitOptions = [
    { value: 'nos', label: 'Numbers' },
    { value: 'kg', label: 'Kilograms' },
    { value: 'gm', label: 'Grams' },
    { value: 'm', label: 'Meters' },
    { value: 'cm', label: 'Centimeters' },
    { value: 'l', label: 'Liters' },
    { value: 'ml', label: 'Milliliters' },
    { value: 'box', label: 'Box' },
    { value: 'pch', label: 'Pouch' },
    { value: 'set', label: 'Set' },
    { value: 'pcs', label: 'Pieces' },
    { value: 'doz', label: 'Dozen' },
    { value: 'bag', label: 'Bag' },
    { value: 'bdl', label: 'Bundle' },
    { value: 'can', label: 'Can' },
    { value: 'btl', label: 'Bottle' },
  ];

  // API Methods
  const fetchLocations = async () => {
    try {
      setLoadingLocations(true);
      const response = await httpClient.get<Location[]>('/api/inventory/locations/');
      setLocations(response);
    } catch (error) {
      console.error('Error fetching locations:');
    } finally {
      setLoadingLocations(false);
    }
  };

  const fetchItems = async () => {
    try {
      setLoadingItems(true);
      const response = await httpClient.get<Item[]>('/api/inventory/items/');
      setItems(response);
    } catch (error) {
      console.error('Error fetching items:');
    } finally {
      setLoadingItems(false);
    }
  };

  const fetchCompanyDetails = async () => {
    try {
      const details = await apiService.getCompanyDetails();
      setCompanyDetails(details);
    } catch (error) {
      console.error('Error fetching company details:');
    }
  };

  const fetchVendors = async () => {
    try {
      const data = await apiService.getRichVendors();
      setVendors(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching vendors:');
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await apiService.getRichCustomers();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching customers:');
    }
  };

  const fetchJobWorkOutwardOptions = async () => {
    try {
      // Mock or use endpoint if available. Assume getJobWorkOutwardSlips exists in apiService (added previously).
      const response = await apiService.getJobWorkOutwardSlips();
      if (Array.isArray(response)) {
        setJobWorkOutwardOptions(response);
      }
    } catch (error) {
      console.error('Error fetching job work outward slips:', error);
    }
  };

  const fetchProcessTransferSlips = async () => {
    try {
      const slips = await apiService.getProductionSlips('inter_process');
      if (Array.isArray(slips)) {
        setProcessTransferSlipOptions(slips);
      }
    } catch (error) {
      console.error('Error fetching process transfer slips:', error);
    }
  };

  const fetchMaterialIssueSlips = async () => {
    try {
      const slips = await apiService.getProductionSlips('materials_issued');
      if (Array.isArray(slips)) {
        setMaterialIssueSlipOptions(slips);
      }
    } catch (error) {
      console.error('Error fetching material issue slips:', error);
    }
  };

  const fetchLedgers = async () => {
    try {
      const response = await apiService.getLedgers();
      setLedgers(Array.isArray(response) ? response : []);
    } catch (error) {
      console.error('Error fetching ledgers:', error);
    }
  };

  // Helper function for Creating Category from Wizard
  const handleCreateCategory = async (data: { category: string; group: string; subgroup: string; sub_subgroup?: string }) => {
    try {
      // Create only the exact record requested — no extra placeholder rows
      await httpClient.post('/api/inventory/master-categories/', {
        category: data.category,
        group: data.group || '',
        subgroup: data.subgroup || '',
        sub_subgroup: data.sub_subgroup || ''
      });
      setCategoryUpdateCount(prev => prev + 1);
    } catch (error) {
      console.error("Error creating category:");
      throw error;
    }
  };

  const handleEditCategory = async (data: { id: number; category: string; group: string | null; subgroup: string; sub_subgroup?: string }) => {
    try {
      await httpClient.put(`/api/inventory/master-categories/${data.id}/`, {
        category: data.category,
        group: data.group || '',
        subgroup: data.subgroup || '',
        sub_subgroup: data.sub_subgroup || ''
      });
      setCategoryUpdateCount(prev => prev + 1);
    } catch (error) {
      console.error("Error updating category:");
      throw error;
    }
  };

  const handleDeleteCategory = async (id: number) => {
    try {
      await httpClient.delete(`/api/inventory/master-categories/${id}/`);
      setCategoryUpdateCount(prev => prev + 1);
    } catch (error) {
      console.error("Error deleting category:");
      throw error;
    }
  };

  // Effects
  useEffect(() => {
    if (activeTab === 'Master') {
      if (activeMasterSubTab === 'Location') {
        fetchLocations();
        fetchCompanyDetails();
        fetchVendors();
        fetchCustomers();
      } else if (activeMasterSubTab === 'Inventory Items') {
        fetchItems();
        fetchLocations(); // For dropdown
        fetchVendors();
      }
    }
  }, [activeTab, activeMasterSubTab]);

  // Handlers - Location
  const handleLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalLocationType = isCustomLocationType ? customLocationTypeValue : locationType;
    if (!finalLocationType) {
      showError('Please specify a location type');
      return;
    }


    try {
      const data = {
        name: locationName,
        location_type: finalLocationType,
        address_line1: locAddressLine1,
        address_line2: locAddressLine2 || null,
        address_line3: locAddressLine3 || null,
        city: locCity,
        state: locState,
        pincode: locPincode,
        country: locCountry,
        gstin: locationGstin || null,
        vendor_name: vendorName || null,
        customer_name: customerName || null,
        location_address: locationAddress || null
      };

      if (isEditModeLocation && selectedLocation) {
        await httpClient.put(`/api/inventory/locations/${selectedLocation.id}/`, data);
      } else {
        await httpClient.post('/api/inventory/locations/', data);
      }
      resetLocationForm();
      fetchLocations();
    } catch (error) {
      handleApiError(error, 'Save Location');
    }

  };

  const handleEditLocation = () => {
    if (!selectedLocation) return;
    setLocationName(selectedLocation.name);
    const predefinedType = locationTypes.find(t => t.value === selectedLocation.location_type);
    if (predefinedType) {
      setLocationType(selectedLocation.location_type);
      setIsCustomLocationType(false);
      setCustomLocationTypeValue('');
    } else {
      setLocationType('custom');
      setIsCustomLocationType(true);
      setCustomLocationTypeValue(selectedLocation.location_type);
    }
    setLocAddressLine1(selectedLocation.address_line1);
    setLocAddressLine2(selectedLocation.address_line2 || '');
    setLocAddressLine3(selectedLocation.address_line3 || '');
    setLocCity(selectedLocation.city);
    setLocState(selectedLocation.state);
    setLocCountry(selectedLocation.country || 'India');
    setLocPincode(selectedLocation.pincode);
    setLocationGstin(selectedLocation.gstin || '');
    setVendorName('');
    setCustomerName('');
    setLocationAddress(selectedLocation.location_address || '');
    setIsEditModeLocation(true);
  };

  const handleViewLocation = () => {
    if (!selectedLocation) return;
    setLocationName(selectedLocation.name);
    const predefinedType = locationTypes.find(t => t.value === selectedLocation.location_type);
    if (predefinedType) {
      setLocationType(selectedLocation.location_type);
      setIsCustomLocationType(false);
      setCustomLocationTypeValue('');
    } else {
      setLocationType('custom');
      setIsCustomLocationType(true);
      setCustomLocationTypeValue(selectedLocation.location_type);
    }
    setLocAddressLine1(selectedLocation.address_line1);
    setLocAddressLine2(selectedLocation.address_line2 || '');
    setLocAddressLine3(selectedLocation.address_line3 || '');
    setLocCity(selectedLocation.city);
    setLocState(selectedLocation.state);
    setLocCountry(selectedLocation.country || 'India');
    setLocPincode(selectedLocation.pincode);
    setLocationGstin(selectedLocation.gstin || '');
    setVendorName('');
    setCustomerName('');
    setLocationAddress(selectedLocation.location_address || '');
    setIsEditModeLocation(false); // read-only: NOT edit mode
    setIsViewModeLocation(true);
  };

  const handleDeleteLocation = async () => {
    if (!selectedLocation) return;
    if (!await confirm(`Are you sure you want to delete "${selectedLocation.name}"?`)) return;
    try {
      await httpClient.delete(`/api/inventory/locations/${selectedLocation.id}/`);
      resetLocationForm();
      fetchLocations();
      showSuccess('Location deleted successfully');
    } catch (error: any) {
      handleApiError(error, 'Delete Location');
    }

  };

  const resetLocationForm = () => {
    setLocationName('');
    setLocationType('');
    setIsCustomLocationType(false);
    setCustomLocationTypeValue('');
    setVendorName('');
    setCustomerName('');
    setCustomerName('');
    setLocationAddress('');
    setLocAddressLine1('');
    setLocAddressLine2('');
    setLocAddressLine3('');
    setLocCity('');
    setLocState('');
    setLocCountry('');
    setLocPincode('');
    setLocationGstin('');
    setIsEditModeLocation(false);
    setIsViewModeLocation(false);
    setSelectedLocation(null);
    setSelectedVendorId(null);
    setSelectedCustomerId(null);
    setVendorAddresses([]);
    setCustomerAddresses([]);
  };

  const fetchInventoryItems = async () => {
    try {
      const response = await httpClient.get('/api/inventory/items/');
      // Map API response to frontend format if needed
      if (Array.isArray(response)) {
        const mappedItems = response.map((item: any) => ({
          ...item,
          itemCode: item.item_code,
          itemName: item.item_name,
          category: item.category_path || item.category, // Display path if avaiable
          categoryPath: item.category_path,
          categoryId: item.category,
          hsnCode: item.hsn_code,
          gstRate: item.gst_rate,
          cessRate: item.cess_rate,
          uom: item.uom,
          rate: item.rate
        }));
        setInventoryItems(mappedItems);
      }
    } catch (error) {
      console.error('Error fetching inventory items:');
    }
  };

  useEffect(() => {
    fetchInventoryItems();
  }, []);

  useEffect(() => {
    if (issueSlipTab === 'job-work' && jobWorkSubTab === 'sent' && jobWorkSentType === 'receipt') {
      fetchJobWorkOutwardOptions();
      // Also ensure vendors/locations are loaded if needed
      if (vendors.length === 0) fetchVendors();
      if (locations.length === 0) fetchLocations();
    }
  }, [issueSlipTab, jobWorkSubTab, jobWorkSentType]);

  useEffect(() => {
    if (['inter-unit', 'location-change', 'consumption', 'scrap', 'production'].includes(issueSlipTab)) {
      if (locations.length === 0) fetchLocations();
      if (issueSlipTab === 'consumption' && ledgers.length === 0) fetchLedgers();
      if (issueSlipSeriesList.length === 0) fetchIssueSlipSeries();
    }
  }, [issueSlipTab]);

  useEffect(() => {
    if (showIssueSlipForm && issueSlipTab === 'production') {
      if (productionType === 'inter_process') {
        fetchMaterialIssueSlips();
      } else if (productionType === 'finished_goods') {
        fetchProcessTransferSlips();
      }
    }
  }, [showIssueSlipForm, issueSlipTab, productionType]);

  useEffect(() => {
    if (showIssueSlipForm && issueSlipTab === 'consumption') {
      const now = new Date();
      setIssueSlipDate(now.toISOString().split('T')[0]);
      setIssueSlipTime(now.toTimeString().slice(0, 5));
    }
  }, [showIssueSlipForm, issueSlipTab]);

  // Fetch GRN series when GRN form is opened
  useEffect(() => {
    if (showGRNForm) {
      if (grnSeriesList.length === 0) fetchGrnSeries();
      if (vendors.length === 0) fetchVendors();
      if (locations.length === 0) fetchLocations();
    }
  }, [showGRNForm]);

  // Handlers - Items
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemCategory) {
      showError('Please select a category');
      return;
    }

    try {
      const data = {
        item_code: itemCode,
        item_name: itemName,
        category: itemCategory,
        hsn_code: itemHsn || null,
        description: itemDescription,
        uom: itemUnit,
        has_multiple_units: itemHasMultipleUnits,
        alternate_uom: itemHasMultipleUnits ? itemAltUnit : null,
        conversion_factor: itemHasMultipleUnits && itemConversionFactor ? itemConversionFactor : null,
        gst_rate: itemGstRate,
        rate: itemRate || '0.00'
      };
      if (isEditModeItem && selectedItem) {
        await httpClient.put(`/api/inventory/items/${selectedItem.id}/`, data);
      } else {
        await httpClient.post('/api/inventory/items/', data);
      }
      resetItemForm();
      fetchItems();
    } catch (error) {
      handleApiError(error, 'Save Item');
    }

  };

  const handleEditItem = () => {
    if (!selectedItem) return;
    setItemCode(selectedItem.item_code);
    setItemName(selectedItem.item_name || selectedItem.name);
    setItemCategory(selectedItem.category);
    setItemCategoryPath(selectedItem.category_name);
    setItemHsn(selectedItem.hsn_code || '');
    setItemDescription(selectedItem.description || '');
    setItemUnit(selectedItem.unit);
    setItemHasMultipleUnits(selectedItem.has_multiple_units);
    setItemAltUnit(selectedItem.alternative_unit || '');
    setItemConversionFactor(String(selectedItem.conversion_factor || ''));
    setItemGstRate(String(selectedItem.gst_rate || ''));
    setItemRate(String(selectedItem.rate || ''));
    setItemLocation(selectedItem.location);
    setIsEditModeItem(true);
  };

  const handleDeleteItem = async (itemId: number) => {
    if (await confirm('Are you sure you want to delete this item?')) {
      try {
        await httpClient.delete(`/api/inventory/items/${itemId}/`);
        fetchInventoryItems();
        if (selectedItemDetail?.id === itemId) {
          setSelectedItemDetail(null);
        }
        showSuccess('Item deleted successfully');
      } catch (error) {
        handleApiError(error, 'Delete Item');
      }
    }
  };


  const handleEditItemOpen = (item: any) => {
    // Ensure all fields are mapped correctly for editing
    setEditFormData({
      ...item,
      id: item.id,
      isEditMode: true,
      itemCode: item.item_code || item.itemCode,
      itemName: item.item_name || item.itemName,
      description: item.description,
      category: item.categoryId !== undefined ? item.categoryId : (typeof item.category === 'number' ? item.category : null), // Ensure ID is used, avoiding string fallback
      categoryPath: item.category_path || item.categoryPath,
      subgroup: item.subgroup || item.subgroup_id,
      uom: item.uom,
      altUnit: item.alternate_uom || item.altUnit,
      conversionFactor: item.conversion_factor || item.conversionFactor,
      rate: item.rate,
      rateUnit: item.rate_unit || item.rateUnit || item.uom,
      hsnCode: item.hsn_code || item.hsnCode,
      gstRate: item.gst_rate || item.gstRate,
      cessRate: item.cess_rate || item.cessRate,
      reorderLevel: item.reorder_level || item.reorderLevel,
      reorderLevel2: item.reorder_level_2 || item.reorderLevel2,
      isSaleable: item.is_saleable || item.isSaleable,
      vendorName: item.vendor_specific_name || item.vendorName,
      vendorSuffix: item.vendor_specific_suffix || item.vendorSuffix
    });
    setSelectedItemDetail({ ...item, isEditMode: true });
    setIsVendorSpecificItemCode(item.is_vendor_specific || false);
  };

  const handleSaveItem = async () => {
    try {
      if (!editFormData.itemCode || !editFormData.itemName) {
        showError('Item Code and Item Name are required');
        return;
      }


      const data = {
        item_code: editFormData.itemCode,
        item_name: editFormData.itemName,
        description: editFormData.description || null,
        category: editFormData.category || null,
        category_path: editFormData.categoryPath || null,
        subgroup: editFormData.subgroup || null,

        is_vendor_specific: !!isVendorSpecificItemCode,
        vendor_specific_name: isVendorSpecificItemCode ? editFormData.vendorName : null,
        vendor_specific_suffix: isVendorSpecificItemCode ? editFormData.vendorSuffix : null,

        uom: editFormData.uom || 'nos',
        alternate_uom: editFormData.altUnit || null,
        conversion_factor: editFormData.conversionFactor || null,

        rate: editFormData.rate || 0,
        rate_unit: editFormData.rateUnit || editFormData.uom || 'nos',

        hsn_code: editFormData.hsnCode || null,
        gst_rate: editFormData.gstRate || null,
        cess_rate: editFormData.cessRate || null,

        reorder_level: editFormData.reorderLevel || null,
        reorder_level_2: editFormData.reorderLevel2 || null,
        is_saleable: editFormData.isSaleable || false
      };



      if (editFormData.id) {
        await httpClient.put(`/api/inventory/items/${editFormData.id}/`, data);
      } else {
        await httpClient.post('/api/inventory/items/', data);
      }

      showSuccess('Item saved successfully');
      await fetchInventoryItems();
      setSelectedItemDetail(null);
      setEditFormData(null);
      setIsVendorSpecificItemCode(false);
    } catch (error: any) {
      handleApiError(error, 'Save Item');
    }

  };

  const handleFormChange = (field: string, value: any) => {
    setEditFormData({
      ...editFormData,
      [field]: value
    });
  };

  // HSN debounce timer ref
  const hsnDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchedHsn = React.useRef<string>('');

  // HSN live auto-fill: debounced onChange, fires 500ms after typing stops
  const handleHsnChange = (value: string) => {
    handleFormChange('hsnCode', value);

    const hsn = value.trim();
    // Clear GST if HSN is too short
    if (hsn.length < 4) {
      setEditFormData((prev: any) => ({ ...prev, gstRate: '' }));
      lastFetchedHsn.current = '';
      return;
    }
    // Skip if same HSN already fetched
    if (hsn === lastFetchedHsn.current) return;

    // Cancel previous timer
    if (hsnDebounceRef.current) clearTimeout(hsnDebounceRef.current);

    // Fire after 500ms pause
    hsnDebounceRef.current = setTimeout(async () => {
      try {
        const response = await httpClient.get<{ igst: string }>(
          '/api/hsn-details/',
          { hsn_code: hsn }
        );
        if (response && response.igst !== undefined) {
          lastFetchedHsn.current = hsn;
          setEditFormData((prev: any) => ({ ...prev, gstRate: response.igst }));
        }
      } catch {
        setEditFormData((prev: any) => ({ ...prev, gstRate: '' }));
        lastFetchedHsn.current = '';
      }
    }, 500);
  };

  const resetItemForm = () => {
    setItemCode('');
    setItemName('');
    setItemCategory(null);
    setItemCategoryPath('');
    setItemHsn('');
    setItemDescription('');
    setItemUnit('nos');
    setItemHasMultipleUnits(false);
    setItemAltUnit('');
    setItemConversionFactor('');
    setItemGstRate('0.00');
    setItemRate('');
    setItemLocation(null);
    setIsEditModeItem(false);
    setSelectedItem(null);
  };

  // Renderers
  const renderLocation = () => {
    const filteredLocations = locations.filter(loc =>
      loc.name.toLowerCase().includes(locationSearchQuery.toLowerCase()) ||
      loc.city.toLowerCase().includes(locationSearchQuery.toLowerCase())
    );

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Create/Edit Form */}
        <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-300">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">
            {isViewModeLocation ? '👁 View Location' : isEditModeLocation ? 'Edit Location' : 'Create Location'}
          </h3>
          <form onSubmit={handleLocationSubmit} className="space-y-4">
            <fieldset disabled={isViewModeLocation} className="contents">
            {/* ... Location inputs ... */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location Name <span className="text-red-500">*</span></label>
              <input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter location name" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Location Type <span className="text-red-500">*</span></label>
              <select value={locationType} onChange={(e) => {
                const value = e.target.value;
                setLocationType(value);
              }} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
                <option value="">Select location type</option>
                {locationTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
              {isCustomLocationType && (
                <div className="mt-3">
                  <input type="text" value={customLocationTypeValue} onChange={(e) => setCustomLocationTypeValue(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter custom location type" required />
                </div>
              )}
            </div>

            {/* Conditional fields based on location type */}
            {(locationType === 'vendor_location' || locationType === 'agent_location' || locationType === 'distributor_location' || locationType === 'job_worker_location') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{locationType === 'job_worker_location' ? 'Job Worker Name' : 'Vendor/Agent Name'} <span className="text-red-500">*</span></label>
                <select
                  value={selectedVendorId || ''}
                  onChange={async (e) => {
                    const vId = Number(e.target.value);
                    setSelectedVendorId(vId);
                    const v = vendors.find(ven => ven.id === vId);
                    setVendorName(v ? v.vendor_name : '');

                    // Fetch addresses
                    if (vId) {
                      try {
                        const details = await apiService.getVendorGSTDetails(vId);
                        // Map to common structure
                        const mapped = Array.isArray(details) ? details.map((d: any) => ({
                          id: d.id,
                          reference_name: d.reference_name || 'Main Branch',
                          address: d.branch_address || '',
                          gstin: d.gstin,
                          state: d.gst_state_code || d.gst_state || '',
                          fullObj: d
                        })) : [];
                        setVendorAddresses(mapped);
                      } catch (err) {
                        console.error("Error fetching vendor addresses");
                        setVendorAddresses([]);
                      }
                    } else {
                      setVendorAddresses([]);
                    }
                  }}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select {locationType === 'job_worker_location' ? 'Job Worker' : 'Vendor/Agent'}</option>
                  {vendors
                    .filter(v => locationType !== 'job_worker_location' || (v.vendor_category || '').toLowerCase().includes('jobwork'))
                    .map(v => (
                      <option key={v.id} value={v.id}>{v.vendor_name} ({v.vendor_code})</option>
                    ))}
                </select>
              </div>
            )}

            {(locationType === 'customer_location') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Customer Name <span className="text-red-500">*</span></label>
                <select
                  value={selectedCustomerId || ''}
                  onChange={(e) => {
                    const cId = Number(e.target.value);
                    setSelectedCustomerId(cId);
                    const c = customers.find(cus => cus.id === cId);
                    setCustomerName(c ? c.customer_name : '');

                    // Extract addresses from customer object
                    if (c && c.gst_details && Array.isArray(c.gst_details.branches)) {
                      setCustomerAddresses(c.gst_details.branches.map((b: any) => ({
                        id: b.id,
                        reference_name: b.defaultRef || b.branch_reference_name || 'Main Branch',
                        address: b.addressLine1 || b.address || '',
                        addressLine1: b.addressLine1 || '',
                        addressLine2: b.addressLine2 || '',
                        addressLine3: b.addressLine3 || '',
                        city: b.city || '',
                        pincode: b.pincode || '',
                        state: b.state || '',
                        country: b.country || 'India',
                        gstin: b.gstin || ''
                      })));
                    } else {
                      setCustomerAddresses([]);
                    }
                  }}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.customer_name} ({c.customer_code})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Location Address - conditional based on type */}
            {(locationType === 'company_premises' || locationType === 'vendor_location' || locationType === 'agent_location' || locationType === 'distributor_location') && locationType === 'company_premises' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location Address <span className="text-red-500">*</span></label>
                <select
                  value={locationAddress}
                  onChange={(e) => {
                    const selectedAddr = e.target.value;
                    setLocationAddress(selectedAddr);
                    if (selectedAddr && companyDetails) {
                      // If user selects an address from company profile, auto-fill details
                      setLocAddressLine1(selectedAddr);
                      // We don't split further blindly, but we can assume state/country from company details
                      if (companyDetails.state) setLocState(companyDetails.state);
                      if (companyDetails.country) setLocCountry(companyDetails.country);
                      if (companyDetails.pincode) setLocPincode(companyDetails.pincode);
                      if (companyDetails.gstin) setLocationGstin(companyDetails.gstin);
                    }
                  }}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select address</option>
                  {companyDetails?.address && companyDetails.address.split('\n').map((addrLine, idx) => (
                    addrLine.trim() && <option key={idx} value={addrLine.trim()}>{addrLine.trim()}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Location Address for other types */}
            {/* Location Address for other types */}
            {(locationType !== 'company_premises' && locationType !== '' && locationType !== 'custom' && !isCustomLocationType) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Location Address <span className="text-red-500">*</span></label>
                <select
                  value={locationAddress}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLocationAddress(val);

                    // Try to find more details
                    if (locationType === 'customer_location' || locationType === 'customs_warehouse' || locationType === 'other_third_party') {
                      // Check for both address match or reference name match (legacy vs new)
                      const addrObj = customerAddresses.find(a => a.address === val || a.reference_name === val);
                      if (addrObj) {
                        setLocAddressLine1(addrObj.addressLine1 || addrObj.address || '');
                        setLocAddressLine2(addrObj.addressLine2 || '');
                        setLocAddressLine3(addrObj.addressLine3 || '');
                        setLocCity(addrObj.city || '');
                        setLocState(addrObj.state || '');
                        setLocCountry(addrObj.country || 'India');
                        setLocPincode(addrObj.pincode || '');
                        if (addrObj.gstin) setLocationGstin(addrObj.gstin);
                      }
                    } else if (locationType.includes('vendor') || locationType.includes('agent') || locationType.includes('job') || locationType.includes('distributor')) {
                      const addrObj = vendorAddresses.find(a => a.reference_name === val || a.address === val);
                      if (addrObj) {
                        setLocAddressLine1(addrObj.address || '');
                        if (addrObj.gstin) setLocationGstin(addrObj.gstin);
                        if (addrObj.state) setLocState(addrObj.state);
                      }
                    }
                  }}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select address</option>
                  {/* Vendor Addresses */}
                  {(locationType === 'vendor_location' || locationType === 'agent_location' || locationType === 'distributor_location' || locationType === 'job_worker_location') &&
                    vendorAddresses.map((addr, idx) => (
                      <option key={addr.id || idx} value={addr.reference_name}>{addr.reference_name} {addr.gstin ? `(GST: ${addr.gstin})` : ''}</option>
                    ))}
                  {/* Customer Addresses */}
                  {(locationType === 'customer_location' || locationType === 'customs_warehouse' || locationType === 'other_third_party') &&
                    customerAddresses.map((addr, idx) => (
                      <option key={addr.id || idx} value={addr.reference_name}>{addr.reference_name} {addr.gstin ? `(GST: ${addr.gstin})` : ''}</option>
                    ))}
                </select>
              </div>
            )}

            {/* Manual address entry for Customer Location */}
            {(locationType === 'customer_location') && (
              <>
                <div className="bg-indigo-50/50 border border-slate-200 rounded p-3 text-sm text-slate-700">
                  📌 Manual Address Entry
                </div>
              </>
            )}

            {/* Country & State */}
            <div className="grid grid-cols-2 gap-4">
              <div className="relative z-20">
                <label className="block text-sm font-medium text-gray-700 mb-2">Country <span className="text-red-500">*</span></label>
                <SearchableDropdown
                  options={getCountries()}
                  value={locCountry}
                  onChange={(val) => {
                    setLocCountry(val);
                    setLocState('');
                    setLocCity('');
                  }}
                  placeholder="Select Country"
                  required
                />
              </div>
              <div className="relative z-20">
                <label className="block text-sm font-medium text-gray-700 mb-2">State <span className="text-red-500">*</span></label>
                <SearchableDropdown
                  options={getStates(locCountry)}
                  value={locState}
                  onChange={(val) => {
                    setLocState(val);
                    setLocCity('');
                  }}
                  placeholder="Select State"
                  disabled={!locCountry}
                  required
                />
              </div>
            </div>

            {/* City & Pincode */}
            <div className="grid grid-cols-2 gap-4 relative z-10">
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">City <span className="text-red-500">*</span></label>
                <SearchableDropdown
                  options={getCities(locCountry, locState)}
                  value={locCity}
                  onChange={(val) => setLocCity(val)}
                  placeholder="Select City"
                  disabled={!locState}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Pincode <span className="text-red-500">*</span></label>
                <input type="text" value={locPincode} onChange={(e) => setLocPincode(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Pincode/Zip Code" required />
              </div>
            </div>

            {/* Address Lines */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 1 <span className="text-red-500">*</span></label>
              <input type="text" value={locAddressLine1} onChange={(e) => setLocAddressLine1(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Building/Street/Area" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Address Line 2</label><input type="text" value={locAddressLine2} onChange={(e) => setLocAddressLine2(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Landmark (Optional)" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-2">Address Line 3</label><input type="text" value={locAddressLine3} onChange={(e) => setLocAddressLine3(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Additional Info (Optional)" /></div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GSTIN (Optional)</label>
              <input type="text" value={locationGstin} onChange={(e) => setLocationGstin(e.target.value)} className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter GSTIN (15 characters)" maxLength={15} />
            </div>
            </fieldset>
            <div className="flex gap-3 pt-4">
              {isViewModeLocation ? (
                <button type="button" onClick={resetLocationForm} className="flex-1 px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] text-gray-700 bg-white hover:bg-gray-50">Close</button>
              ) : (
                <>
                  <button type="submit" className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500">{isEditModeLocation ? 'Update Location' : 'Create Location'}</button>
                  {isEditModeLocation && <button type="button" onClick={resetLocationForm} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none">Cancel</button>}
                </>
              )}
            </div>
          </form>
        </div>
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Existing Locations</h3>
            <input type="text" placeholder="Search locations..." value={locationSearchQuery} onChange={(e) => setLocationSearchQuery(e.target.value)} className="block w-full px-3 py-2 border border-gray-300 rounded-[4px] leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loadingLocations ? <p className="text-gray-500 text-center py-8">Loading...</p> : filteredLocations.length === 0 ? <p className="text-gray-500 text-center py-8">No locations</p> : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0"><tr><th className="px-6 py-3 w-12"></th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th><th className="px-6 py-3 text-right"></th></tr></thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredLocations.map(loc => {
                    const isSelected = selectedLocation?.id === loc.id;
                    const typeOption = locationTypes.find(t => t.value === loc.location_type);
                    const displayType = typeOption ? typeOption.label : loc.location_type;

                    return (
                      <tr key={loc.id} className={isSelected ? 'bg-indigo-50/50' : ''}>
                        <td className="px-6 py-4"><input type="radio" checked={isSelected} onChange={() => setSelectedLocation(loc)} className="text-indigo-600 focus:ring-indigo-500" /></td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 cursor-pointer" onClick={() => setSelectedLocation(loc)}>{loc.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500"><span className="px-2 font-semibold rounded-[4px] bg-indigo-100 text-indigo-800 text-xs">{displayType}</span></td>
                        <td className="px-6 py-4 text-right">
                          {isSelected && (
                            <div className="inline-flex gap-2">
                              <button onClick={handleViewLocation} className="text-white bg-gray-500 px-2 py-1 rounded text-xs hover:bg-gray-600">View</button>
                              <button onClick={handleEditLocation} className="text-white bg-indigo-600 px-2 py-1 rounded text-xs">Edit</button>
                              <button onClick={handleDeleteLocation} className="text-white bg-red-600 px-2 py-1 rounded text-xs">Del</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleIssueSlipSubmit = async () => {
    try {
      if (issueSlipTab === 'outward') {
        const outwardPayload = {
          outward_slip_no: issueSlipNumber,
          date: issueSlipDate || null,
          time: issueSlipTime || null,
          outward_type: outwardType,
          location: itemLocation || null,
          sales_order_no: outwardSalesOrder,
          customer_name: outwardCustomerName,
          supplier_invoice_no: outwardSupplierInvoice,
          vendor_name: outwardVendorName,
          branch: outwardBranch,
          address: outwardAddress,
          gstin: outwardGstin,
          total_boxes: outwardTotalBoxes,
          posting_note: postingNote,
          items: issueSlipItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            hsn_code: item.hsnCode || null,
            uom: item.uom,
            quantity: item.quantity || 0,
            no_of_boxes: item.noOfBoxes || null
          })),
          delivery_challan: {
            dispatch_from: dispatchFrom || deliveryChallanAddress,
            mode_of_transport: modeOfTransport,
            dispatch_date: dispatchDate || deliveryChallanDate,
            dispatch_time: dispatchTime,
            delivery_type: deliveryType,
            transporter_id: transporterId,
            transporter_name: transporterName,
            vehicle_no: vehicleNo,
            lr_gr_consignment: lrGrConsignment,
            // Air/Sea Upto Port
            shipping_bill_no: uptoPortShippingBillNo,
            ship_port_code: uptoPortShipPortCode,
            shipping_bill_date: uptoPortShippingBillDate,
            origin: uptoPortOrigin,
            // Air/Sea Beyond Port
            beyond_port_shipping_bill_no: beyondPortShippingBillNo,
            beyond_port_shipping_bill_date: beyondPortShippingBillDate,
            beyond_port_ship_port_code: beyondPortShipPortCode,
            beyond_port_vessel_flight_no: beyondPortVesselFlightNo,
            beyond_port_port_of_loading: beyondPortPortOfLoading,
            beyond_port_port_of_discharge: beyondPortPortOfDischarge,
            beyond_port_final_destination: beyondPortFinalDestination,
            beyond_port_origin_country: beyondPortOriginCountry,
            beyond_port_dest_country: beyondPortDestCountry,
            // Rail Upto Port
            rail_upto_port_delivery_type: railUptoPortDeliveryType,
            rail_upto_port_transporter_id: railUptoPortTransporterId,
            rail_upto_port_transporter_name: railUptoPortTransporterName,
            // Rail Beyond Port
            rail_beyond_port_receipt_no: railBeyondPortRailwayReceiptNo,
            rail_beyond_port_receipt_date: railBeyondPortRailwayReceiptDate,
            rail_beyond_port_origin: railBeyondPortOrigin,
            rail_beyond_port_origin_country: railBeyondPortOriginCountry,
            rail_beyond_port_rail_no: railBeyondPortRailNo,
            rail_beyond_port_station_loading: railBeyondPortStationOfLoading,
            rail_beyond_port_station_discharge: railBeyondPortStationOfDischarge,
            rail_beyond_port_final_destination: railBeyondPortFinalDestination,
            rail_beyond_port_dest_country: railBeyondPortDestCountry,

            // Maintained for compatibility
            dispatch_address: dispatchFrom || deliveryChallanAddress,
          },
          eway_bill: (ewayValidationEntries.length > 0 && (ewayValidationEntries[0].updatedVehicleNo || ewayValidationEntries[0].date || ewayValidationEntries[0].ewayBillNo)) ? {
            eway_bill_no: ewayValidationEntries[0].ewayBillNo || null,
            vehicle_number: ewayValidationEntries[0].updatedVehicleNo || null,
            valid_till: ewayValidationEntries[0].date || null
          } : null,
          eway_bill_details: ewayValidationEntries // Pass full details
        };
        await httpClient.post('/api/inventory/operations/outward/', outwardPayload);

      } else if (issueSlipTab === 'job-work') {
        const jobWorkPayload = {
          operation_type: jobWorkSentType, // 'outward' or 'receipt'
          transaction_date: issueSlipDate || new Date().toISOString().split('T')[0],
          transaction_time: issueSlipTime || new Date().toTimeString().split(' ')[0],
          location_id: itemLocation || goodsFromLocation || null, // Map correctly

          // Outward specific
          job_work_outward_no: jobWorkSentType === 'outward' ? issueSlipNumber : null,
          po_reference_no: jobWorkSentType === 'outward' ? jobWorkOrderNo : null,

          // Receipt specific
          job_work_receipt_no: jobWorkSentType === 'receipt' ? jobWorkReceiptNo : null,
          related_outward_no: jobWorkSentType === 'receipt' ? jobWorkOutwardRefNo : null,
          vendor_delivery_challan_no: jobWorkSentType === 'receipt' ? vendorDeliveryChallan : null,
          supplier_invoice_no: jobWorkSentType === 'receipt' ? outwardSupplierInvoice : null,

          // Vendor details
          vendor_name: outwardVendorName,
          vendor_branch: outwardBranch,
          vendor_address: outwardAddress,
          vendor_gstin: outwardGstin,

          posting_note: postingNote,
          status: 'Posted',

          items: issueSlipItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            // Outward
            quantity: item.quantity || 0,
            rate: item.rate || 0,
            taxable_value: item.value || 0,

            // Receipt columns
            vendor_qty: item.vendorQty || 0,
            received_qty: item.receivedQty || 0,
            accepted_qty: item.acceptedQty || 0,
            rejected_qty: item.rejectedQty || 0,
            shortage_excess_qty: item.shortageExcessQty || 0,
            remarks: item.remarks || ''
          })),

          delivery_challan: {
            dispatch_from: dispatchFrom || deliveryChallanAddress,
            mode_of_transport: modeOfTransport,
            dispatch_date: dispatchDate || deliveryChallanDate,
            dispatch_time: dispatchTime,
            delivery_type: deliveryType,
            transporter_id: transporterId,
            transporter_name: transporterName,
            vehicle_no: vehicleNo,
            lr_gr_consignment: lrGrConsignment
          },

          eway_bill: (ewayValidationEntries.length > 0 && (ewayValidationEntries[0].updatedVehicleNo || ewayValidationEntries[0].date || ewayValidationEntries[0].ewayBillNo)) ? {
            eway_bill_no: ewayValidationEntries[0].ewayBillNo || null,
            vehicle_number: ewayValidationEntries[0].updatedVehicleNo || null,
            valid_till: ewayValidationEntries[0].date || null
          } : null,
          eway_bill_details: ewayValidationEntries // Pass as details for future backend updates
        };
        await httpClient.post('/api/inventory/operations/job-work/', jobWorkPayload);
      } else if (issueSlipTab === 'production') {
        let productionItems = [];

        if (productionType === 'materials_issued') {
          // Input: issueSlipItems (Raw Materials)
          const inputs = issueSlipItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0,
            qty_issued: item.quantity || 0, // In this context, same
            item_type: 'input' // Raw Material
          }));
          // Output: resultingWIPItems
          const outputs = resultingWIPItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0,
            item_type: 'output' // WIP
          }));
          productionItems = [...inputs, ...outputs];
        } else if (productionType === 'inter_process') {
          // For Inter-process, logic might be different if tabs are used.
          // Input: 'Materials issued' tab -> resultingWIPItems (reused name in form)
          // Output: 'Converted Output' tab -> convertedOutputItems

          // Check which tab or data is relevant. Usually both are submitted.
          const inputs = resultingWIPItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0, // Available
            qty_issued: item.issueQty || 0, // Should be bound to input
            rate: item.rate || 0,
            amount: item.amount || 0,
            item_type: 'input'
          }));
          const outputs = convertedOutputItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0,
            rate: item.rate || 0,
            amount: item.amount || 0,
            item_type: 'output'
          }));
          productionItems = [...inputs, ...outputs];
        } else {
          // Finished Goods (Implied 'finished_goods' type)
          // Assuming standard issueSlipItems for consumption and maybe another list for output?
          // For now, mapping standard input items if that's what the form uses
          productionItems = issueSlipItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0,
            item_type: 'input'
          }));
        }

        const productionPayload = {
          issue_slip_no: productionType === 'materials_issued' ? materialIssueSlipNo : (productionType === 'inter_process' ? processTransferSlipNo : fgReceiptSlipNo), // Use correct slip no. state based on type
          date: issueSlipDate || null,
          time: issueSlipTime || null,
          status: 'Posted',
          goods_from_location: productionType === 'inter_process' ? goodsToLocation : goodsFromLocation,
          goods_to_location: productionType === 'inter_process' ? interProcessToLocation : goodsToLocation,
          posting_note: postingNote,

          production_type: productionType,
          material_issue_slip_no: productionType === 'inter_process' ? selectedMaterialIssueSlips.join(',') : '',
          process_transfer_slip_no: productionType === 'finished_goods' ? selectedProcessTransferSlips.join(',') : (productionType === 'inter_process' ? processTransferSlipNo : ''),
          // finished_goods_production_no: ... (add if variable exists, else map to issueSlipNumber)

          items: productionItems,

          delivery_challan: {
            dispatch_from: dispatchFrom || deliveryChallanAddress,
            mode_of_transport: modeOfTransport,
            dispatch_date: dispatchDate || deliveryChallanDate,
            dispatch_time: dispatchTime,
            delivery_type: deliveryType,
            transporter_id: transporterId,
            transporter_name: transporterName,
            vehicle_no: vehicleNo,
            lr_gr_consignment: lrGrConsignment
          },
          eway_bill: (ewayValidationEntries.length > 0 && (ewayValidationEntries[0].updatedVehicleNo || ewayValidationEntries[0].date || ewayValidationEntries[0].ewayBillNo)) ? {
            eway_bill_no: ewayValidationEntries[0].ewayBillNo || null,
            vehicle_number: ewayValidationEntries[0].updatedVehicleNo || null,
            valid_till: ewayValidationEntries[0].date || null
          } : null,
          eway_bill_details: ewayValidationEntries
        };
        await httpClient.post('/api/inventory/operations/production/', productionPayload);

      } else if (issueSlipTab === 'inter-unit') {
        const interUnitPayload = {
          issue_slip_no: issueSlipNumber,
          date: issueSlipDate || null,
          time: issueSlipTime || null,
          status: 'Posted',
          goods_from_location: goodsFromLocation,
          goods_to_location: goodsToLocation,
          posting_note: postingNote,
          items: issueSlipItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0,
            rate: item.rate || 0,
            value: item.value || 0
          })),
          delivery_challan: {
            dispatch_from: dispatchFrom,
            mode_of_transport: modeOfTransport,
            dispatch_date: dispatchDate,
            dispatch_time: dispatchTime,
            delivery_type: deliveryType,
            transporter_id: transporterId,
            transporter_name: transporterName,
            vehicle_no: vehicleNo,
            lr_gr_consignment: lrGrConsignment,
            // Air/Sea Upto Port
            shipping_bill_no: uptoPortShippingBillNo,
            ship_port_code: uptoPortShipPortCode,
            shipping_bill_date: uptoPortShippingBillDate,
            origin: uptoPortOrigin,
            // Air/Sea Beyond Port
            beyond_port_shipping_bill_no: beyondPortShippingBillNo,
            beyond_port_shipping_bill_date: beyondPortShippingBillDate,
            beyond_port_ship_port_code: beyondPortShipPortCode,
            beyond_port_vessel_flight_no: beyondPortVesselFlightNo,
            beyond_port_port_of_loading: beyondPortPortOfLoading,
            beyond_port_port_of_discharge: beyondPortPortOfDischarge,
            beyond_port_final_destination: beyondPortFinalDestination,
            beyond_port_origin_country: beyondPortOriginCountry,
            beyond_port_dest_country: beyondPortDestCountry,
            // Rail Upto Port
            rail_upto_port_delivery_type: railUptoPortDeliveryType,
            rail_upto_port_transporter_id: railUptoPortTransporterId,
            rail_upto_port_transporter_name: railUptoPortTransporterName,
            // Rail Beyond Port
            rail_beyond_port_receipt_no: railBeyondPortRailwayReceiptNo,
            rail_beyond_port_receipt_date: railBeyondPortRailwayReceiptDate,
            rail_beyond_port_origin: railBeyondPortOrigin,
            rail_beyond_port_origin_country: railBeyondPortOriginCountry,
            rail_beyond_port_rail_no: railBeyondPortRailNo,
            rail_beyond_port_station_loading: railBeyondPortStationOfLoading,
            rail_beyond_port_station_discharge: railBeyondPortStationOfDischarge,
            rail_beyond_port_final_destination: railBeyondPortFinalDestination,
            rail_beyond_port_dest_country: railBeyondPortDestCountry,

            // Maintained for compatibility
            dispatch_address: dispatchFrom,
          },
          irn: irn,
          ack_no: ackNo,
          eway_bill: (ewayValidationEntries.length > 0 && (ewayValidationEntries[0].updatedVehicleNo || ewayValidationEntries[0].date || ewayValidationEntries[0].ewayBillNo)) ? {
            eway_bill_no: ewayValidationEntries[0].ewayBillNo || null,
            vehicle_number: ewayValidationEntries[0].updatedVehicleNo || null,
            valid_till: ewayValidationEntries[0].date || null
          } : null,
          eway_bill_details: ewayValidationEntries
        };
        await httpClient.post('/api/inventory/operations/inter-unit/', interUnitPayload);
      } else {
        // Common payload for remaining tabs 
        const commonPayload: any = {
          issue_slip_no: issueSlipNumber,
          date: issueSlipDate || null,
          time: issueSlipTime || null,
          status: 'Posted',
          goods_from_location: goodsFromLocation,
          goods_to_location: issueSlipTab === 'consumption' ? null : goodsToLocation, // NIL for consumption
          posting_note: postingNote,
          items: issueSlipItems.map(item => ({
            item_code: item.itemCode,
            item_name: item.itemName,
            uom: item.uom,
            quantity: item.quantity || 0,
            rate: item.rate || 0,
            value: item.value || 0
          })),
        };

        // Add Consumption Specific fields
        if (issueSlipTab === 'consumption') {
          commonPayload.consumption_type = consumptionType;
          commonPayload.issue_slip_series = selectedIssueSlipSeriesName;
          if (consumptionType === 'fixed_assets') {
            commonPayload.fixed_asset_ledger = fixedAssetLedger;
          } else {
            commonPayload.expense_ledger = expenseLedger;
          }
        } else {
          // Add Delivery Challan for others if relevant
          commonPayload.delivery_challan = {
            dispatch_from: dispatchFrom || deliveryChallanAddress,
            mode_of_transport: modeOfTransport,
            dispatch_date: dispatchDate || deliveryChallanDate,
            dispatch_time: dispatchTime,
            delivery_type: deliveryType,
            transporter_id: transporterId,
            transporter_name: transporterName,
            vehicle_no: vehicleNo,
            lr_gr_consignment: lrGrConsignment
          };
          commonPayload.eway_bill = (ewayValidationEntries.length > 0 && (ewayValidationEntries[0].updatedVehicleNo || ewayValidationEntries[0].date || ewayValidationEntries[0].ewayBillNo)) ? {
            eway_bill_no: ewayValidationEntries[0].ewayBillNo || null,
            vehicle_number: ewayValidationEntries[0].updatedVehicleNo || null,
            valid_till: ewayValidationEntries[0].date || null
          } : null;
          commonPayload.eway_bill_details = ewayValidationEntries;
        }

        const endpoints: { [key: string]: string } = {
          // 'inter-unit': handled above
          'location-change': '/api/inventory/operations/location-change/',
          'production': '/api/inventory/operations/production/', // If not handled in earlier if-block? production IS handled in earlier if-block
          'consumption': '/api/inventory/operations/consumption/',
          'scrap': '/api/inventory/operations/scrap/'
        };

        const endpoint = endpoints[issueSlipTab];
        if (endpoint) {
          await httpClient.post(endpoint, commonPayload);
        }
      }

      showSuccess('Operation saved successfully!');
      setShowIssueSlipForm(false);
      // Optional: Reset form fields here if needed
    } catch (error) {
      console.error('Error saving operation:');
      showError('Failed to save operation. Please check your inputs.');
    }
  };

  const handleOutwardVendorChange = async (selectedVendorName: string) => {
    setOutwardVendorName(selectedVendorName);
    setOutwardBranch('');
    setOutwardBranchOptions([]);
    setOutwardAddress('');
    setOutwardGstin('');
    setJobWorkOrderNo('');
    setJobWorkOrderNoOptions([]);

    const vendor = vendors.find(v => v.vendor_name === selectedVendorName);
    if (vendor) {
      try {
        const branchResponse = await apiService.getVendorGSTDetails(vendor.id);
        const mappedBranches = Array.isArray(branchResponse) ? branchResponse.map((b: any) => ({
          ...b,
          reference_name: b.reference_name || b.defaultRef || b.branch_name || b.name || b.gstin || `Branch ${b.id}` || 'Main',
          branch_address: b.branch_address || b.address
        })) : [];
        setOutwardBranchOptions(mappedBranches);

        // Auto-select first branch if available
        if (mappedBranches.length > 0) {
          const defaultBranch = mappedBranches[0];
          setOutwardBranch(defaultBranch.reference_name);
          setOutwardAddress(defaultBranch.branch_address || '');
          setOutwardGstin(defaultBranch.gstin || '');
        }

        // Fetch PENDING POs for this vendor using the new specific endpoint
        const poResponse = await apiService.getPendingPOs(vendor.id);
        if (Array.isArray(poResponse)) {
          setJobWorkOrderNoOptions(poResponse);
        } else if (poResponse && (poResponse as any).success && Array.isArray((poResponse as any).data)) {
          setJobWorkOrderNoOptions((poResponse as any).data);
        }
      } catch (error) {
        handleApiError(error, "Fetching vendor details");
      }
    }
  };

  const handleOutwardBranchChange = (branchReferenceName: string) => {
    setOutwardBranch(branchReferenceName);
    const branchDetails = outwardBranchOptions.find(b => b.reference_name === branchReferenceName);
    if (branchDetails) {
      // Robustly check for address fields as backend serialization might vary
      setOutwardAddress(branchDetails.branch_address || branchDetails.address || '');
      setOutwardGstin(branchDetails.gstin || '');
    } else {
      setOutwardAddress('');
      setOutwardGstin('');
    }
  };

  // --- Handlers for Outward Sales & Purchase Return ---

  const handleOutwardSalesOrderChange = (soId: string) => {
    setOutwardSalesOrder(soId);
    if (!soId) {
      setOutwardCustomerName('');
      setOutwardBranch('');
      setOutwardBranchOptions([]);
      setOutwardAddress('');
      setOutwardGstin('');
      setIssueSlipItems([{ itemCode: '', itemName: '', uom: '', quantity: '', rate: '', value: 0, noOfBoxes: '' }]);
      return;
    }

    const so = outwardSalesOrderOptions.find(o => o.id?.toString() === soId || o.so_number === soId);
    if (so) {
      console.log("Selected Order:", so); // Mandatory log for debugging
      if (so.customer_name) {
        setOutwardCustomerName(so.customer_name);

        // Populate branch options safely without an external async handler
        const customer = customers.find(c => c.customer_name === so.customer_name);
        if (customer && customer.gst_details && Array.isArray(customer.gst_details.branches)) {
          const branches = customer.gst_details.branches.map((b: any) => {
            // Concatenate address lines if separate fields are provided instead of a single address field
            const lines = [b.address_line1 || b.addressLine1, b.address_line2 || b.addressLine2, b.address_line3 || b.addressLine3];
            const fullAddress = lines.filter(Boolean).join(', ');
            
            return {
              ...b,
              reference_name: b.defaultRef || b.branch_reference_name || 'Main',
              branch_address: b.address || b.branch_address || fullAddress || '',
              gstin: b.gstin
            };
          });
          setOutwardBranchOptions(branches);
        } else {
          setOutwardBranchOptions([]);
        }
      } else {
        setOutwardCustomerName('');
        setOutwardBranchOptions([]);
      }

      // Safely apply specific populated branch and address mapping
      if (so.branch) {
        setOutwardBranch(so.branch);
      } else {
        setOutwardBranch('');
      }

      if (so.address) {
        setOutwardAddress(so.address);
      } else {
        setOutwardAddress('');
      }

      const gst = so.gst_no || so.gstin || '';
      if (gst) {
        setOutwardGstin(gst);
      } else {
        setOutwardGstin('');
      }

      // Populate items from Sales Order
      if (so.items && Array.isArray(so.items)) {
        const itemsList = so.items.map((item: any) => {
          // Lookup HSN code from Master Items list
          const masterItem = items.find(i => i.item_code === item.item_code);
          return {
            itemCode: item.item_code || '',
            itemName: item.item_name || '',
            hsnCode: masterItem?.hsn_code || (masterItem as any)?.hsn || item.hsn_code || '',
            uom: item.uom || '',
            quantity: item.quantity || 0,
            rate: item.price || 0,
            value: item.taxable_value || 0,
            noOfBoxes: item.packing_notes || ''
          };
        });
        setIssueSlipItems(itemsList.length > 0 ? itemsList : [{ itemCode: '', itemName: '', uom: '', hsnCode: '', quantity: '', rate: '', value: 0, noOfBoxes: '' }]);
      }
    }
  };

  const handleSalesOutwardCustomerChange = async (customerName: string) => {
    setOutwardCustomerName(customerName);
    setOutwardBranch('');
    setOutwardBranchOptions([]);
    setOutwardAddress('');
    setOutwardGstin('');

    const customer = customers.find(c => c.customer_name === customerName);
    if (customer) {
      // Set branches from customer object
      if (customer.gst_details && Array.isArray(customer.gst_details.branches)) {
        const branches = customer.gst_details.branches.map((b: any) => {
          const lines = [b.address_line1 || b.addressLine1, b.address_line2 || b.addressLine2, b.address_line3 || b.addressLine3];
          const fullAddress = lines.filter(Boolean).join(', ');

          return {
            ...b,
            reference_name: b.defaultRef || b.branch_reference_name || 'Main',
            branch_address: b.address || b.branch_address || fullAddress || '',
            gstin: b.gstin
          };
        });
        setOutwardBranchOptions(branches);

        if (branches.length > 0) {
          handleOutwardBranchChange(branches[0].reference_name);
        }
      }
    }
  };

  const handleOutwardSupplierInvoiceChange = (invNumber: string) => {
    setOutwardSupplierInvoice(invNumber);
    const inv = outwardSupplierInvoiceOptions.find(i => i.voucher_number === invNumber || i.id?.toString() === invNumber || i.supplier_invoice_no === invNumber);
    if (inv) {
      if (inv.party_name) {
        handlePurchaseReturnVendorChange(inv.party_name);
      }
    }
  };

  const handlePurchaseReturnVendorChange = async (vendorName: string) => {
    setOutwardVendorName(vendorName);
    setOutwardBranch('');
    setOutwardBranchOptions([]);
    setOutwardAddress('');
    setOutwardGstin('');

    const vendor = vendors.find(v => v.vendor_name === vendorName);
    if (vendor) {
      try {
        const branchResponse = await apiService.getVendorGSTDetails(vendor.id);
        const mappedBranches = Array.isArray(branchResponse) ? branchResponse.map((b: any) => ({
          ...b,
          reference_name: b.reference_name || b.defaultRef || b.branch_name || b.name || b.gstin || `Branch ${b.id}` || 'Main',
          branch_address: b.branch_address || b.address
        })) : [];
        setOutwardBranchOptions(mappedBranches);

        if (mappedBranches.length > 0) {
          handleOutwardBranchChange(mappedBranches[0].reference_name);
        }
      } catch (error) {
        handleApiError(error, "Fetching vendor details");
      }
    }
  };

  const handleJobWorkOutwardChange = async (outwardNo: string) => {
    setJobWorkOutwardRefNo(outwardNo);
    const selectedSlip = jobWorkOutwardOptions.find(o => o.outward_no === outwardNo || o.issue_slip_no === outwardNo || o.job_work_outward_no === outwardNo);

    if (selectedSlip) {
      // Auto-populate
      const loc = selectedSlip.issue_from_location || selectedSlip.location_id || selectedSlip.location;
      setGoodsFromLocation(typeof loc === 'object' && loc ? String(loc.id) : String(loc || ''));

      const vName = selectedSlip.vendor_name || selectedSlip.vendorName;
      if (vName) {
        setOutwardVendorName(vName);

        // Trigger vendor change logic to fetch branches
        await handleOutwardVendorChange(vName);

        // Then set specific values from outward slip if available
        // Backend payload uses vendor_branch, vendor_address, vendor_gstin
        const branch = selectedSlip.vendor_branch || selectedSlip.branch || selectedSlip.vendorBranch;
        const address = selectedSlip.vendor_address || selectedSlip.address || selectedSlip.vendorAddress;
        const gstin = selectedSlip.vendor_gstin || selectedSlip.gstin || selectedSlip.vendorGstin;

        if (branch) setOutwardBranch(branch);
        if (address) setOutwardAddress(address);
        if (gstin) setOutwardGstin(gstin);

        // Also fetch items if possible? (User didn't explicitly ask for items but "System must fetch the details...").
        // Usually selecting the outward ref should load items into "Outward Items" tab.
        // That logic might fit here too. 
        if (Array.isArray(selectedSlip.items)) {
          // Map items to outward items view...
          // Logic for that can be added later if needed, user prioritized vendor details.
          // But let's check if we can populate it.
          // setOutwardItems(...) or similar?
          // The form uses 'items' state for both input and output tabs, heavily dependent on 'jwItemTab'.
          // I'll leave items for now unless requested, as it might conflict with current state structure if not careful.
        }
      }
    }
  };

  const handleGrnSeriesChange = async (seriesId: string) => {
    if (!seriesId) {
      setGrnSelectedSeriesId(null);
      setGrnNumber('');
      return;
    }
    const id = parseInt(seriesId, 10);
    setGrnSelectedSeriesId(id);
    const series = grnSeriesList.find((s: any) => s.id === id);
    if (series) {
      setGrnSelectedSeriesName(series.name);
      if (series.preview) {
        setGrnNumber(series.preview);
      }
    }
    try {
      const response = await httpClient.get<{ grn_no: string; series_name: string }>(
        `/api/inventory/master-voucher-grn/${id}/next-number/`
      );
      if (response && response.grn_no) {
        setGrnNumber(response.grn_no);
      }
    } catch (error) {
      console.error('Error fetching next GRN number:', error);
    }
  };

  const handleGrnVendorChange = async (selectedVendorName: string) => {
    setGrnVendorName(selectedVendorName);
    setGrnBranch('');
    setGrnBranchOptions([]);
    setGrnAddress('');
    setGrnGstin('');
    setGrnSelectedPOs([]);
    setGrnReferenceNoOptions([]);
    setGrnSecondaryRefNo('');
    setGrnSecondaryRefNoOptions([]);
    setGrnDocument(null);
    setGrnDocumentPreview(null);

    const vendor = vendors.find(v => v.vendor_name === selectedVendorName);
    if (vendor) {
      try {
        const branchResponse = await apiService.getVendorGSTDetails(vendor.id);
        setGrnBranchOptions(Array.isArray(branchResponse) ? branchResponse : []);

        // Fetch PENDING POs for this vendor using the new specific endpoint
        const poResponse = await apiService.getPendingPOs(vendor.id, vendor.vendor_name);
        if (Array.isArray(poResponse)) {
          setGrnReferenceNoOptions(poResponse);
        } else if (poResponse && (poResponse as any).success && Array.isArray((poResponse as any).data)) {
          setGrnReferenceNoOptions((poResponse as any).data);
        }

        const invResponse = await apiService.getVendorPurchaseInvoices(selectedVendorName);
        if (Array.isArray(invResponse)) {
          setGrnSecondaryRefNoOptions(invResponse);
        }
      } catch (error) {
        handleApiError(error, "Fetching vendor details");
      }

    }
  };

  const handleGrnCustomerChange = async (selectedCustomerName: string) => {
    setGrnCustomerName(selectedCustomerName);
    setGrnBranch('');
    setGrnBranchOptions([]);
    setGrnAddress('');
    setGrnGstin('');
    setGrnSelectedPOs([]);
    setGrnSelectedSalesVouchers([]); // Reset selected vouchers
    setGrnReferenceNoOptions([]);
    setGrnSecondaryRefNo('');
    setGrnSecondaryRefNoOptions([]);

    const customer = customers.find(c => c.customer_name === selectedCustomerName);
    if (customer) {
      // Set branches from customer object (similar to renderLocation logic)
      if (customer.gst_details && Array.isArray(customer.gst_details.branches)) {
        const branches = customer.gst_details.branches.map((b: any) => {
          const lines = [b.address_line1 || b.addressLine1, b.address_line2 || b.addressLine2, b.address_line3 || b.addressLine3];
          const fullAddress = lines.filter(Boolean).join(', ');

          return {
            id: b.id,
            reference_name: b.defaultRef || b.branch_reference_name || 'Main',
            branch_address: b.address || b.branch_address || fullAddress || '',
            gstin: b.gstin
          };
        });
        setGrnBranchOptions(branches);
      }

      try {
        // Fetch Sales Vouchers for the customer
        const salesVouchers = await apiService.getSalesVouchers({ 
          customer_id: customer.id,
          customer_name: customer.customer_name 
        });
        if (Array.isArray(salesVouchers)) {
          setGrnReferenceNoOptions(salesVouchers);
        }
      } catch (error) {
        handleApiError(error, "Fetching sales vouchers");
      }

    }
  };

  const handleGrnBranchChange = (branchReferenceName: string) => {
    setGrnBranch(branchReferenceName);
    const branchDetails = grnBranchOptions.find(b => b.reference_name === branchReferenceName);
    if (branchDetails) {
      setGrnAddress(branchDetails.branch_address || '');
      setGrnGstin(branchDetails.gstin || '');
    } else {
      setGrnAddress('');
      setGrnGstin('');
    }
  };


  const handleGrnReferenceNoChange = async (selectedPOList: string[]) => {
    setGrnSelectedPOs(selectedPOList);
    
    if (selectedPOList.length === 0) {
      setGrnItems([{
        itemCode: '', itemName: '', uom: '', refQty: '', secondaryQty: '', receivedQty: '', acceptedQty: '', rejectedQty: '', shortExcessQty: '', remarks: ''
      }]);
      return;
    }

    try {
      const allNewItems: any[] = [];
      const processedItemCodes = new Set();

      for (const poNumber of selectedPOList) {
        const selectedOption = grnReferenceNoOptions.find(po => po.po_number === poNumber);
        if (selectedOption) {
          const fullPOResponse = await apiService.getVendorPurchaseOrderById(selectedOption.id);
          if (fullPOResponse && fullPOResponse.success && fullPOResponse.data) {
            const fullPO = fullPOResponse.data;
            if (fullPO.items && fullPO.items.length > 0) {
              fullPO.items.forEach((poItem: any) => {
                allNewItems.push({
                  itemCode: poItem.item_code,
                  itemName: poItem.item_name,
                  uom: poItem.uom,
                  refQty: poItem.quantity,
                  secondaryQty: '',
                  receivedQty: poItem.quantity,
                  acceptedQty: poItem.quantity,
                  rejectedQty: '0',
                  shortExcessQty: '0',
                  remarks: `From PO: ${poNumber}`,
                  po_number: poNumber // Track source PO for color coding
                });
              });
            }
          }
        }
      }
      
      if (allNewItems.length > 0) {
        setGrnItems(allNewItems);
      }
    } catch (err) {
      console.error("Error fetching full PO details:", err);
    }
  };

  const handleGrnSecondaryRefNoChange = (invNumber: string) => {
    setGrnSecondaryRefNo(invNumber);
    const selectedInv = grnSecondaryRefNoOptions.find(inv => inv.supplier_invoice_no === invNumber);
    if (selectedInv) {
      const invItems = selectedInv.supply_inr_details?.items || selectedInv.supply_foreign_details?.items || [];
      const updatedGrnItems = [...grnItems];

      invItems.forEach((invItem: any) => {
        const itemCode = invItem.itemCode || invItem.item_code;
        const existingItemIndex = updatedGrnItems.findIndex(i => i.itemCode === itemCode);

        if (existingItemIndex > -1) {
          updatedGrnItems[existingItemIndex].secondaryQty = invItem.qty || invItem.quantity;
        } else {
          updatedGrnItems.push({
            itemCode: itemCode,
            itemName: invItem.itemName || invItem.item_name,
            uom: invItem.uom,
            refQty: '',
            secondaryQty: invItem.qty || invItem.quantity,
            receivedQty: invItem.qty || invItem.quantity,
            acceptedQty: invItem.qty || invItem.quantity,
            rejectedQty: '0',
            shortExcessQty: '0',
            remarks: ''
          });
        }
      });

      if (updatedGrnItems.length > 1 && updatedGrnItems[0].itemCode === '') {
        updatedGrnItems.shift();
      }
      setGrnItems(updatedGrnItems);
    }
  };

  const handleGrnDocumentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGrnDocument(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setGrnDocumentPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddGrnItem = () => {
    setGrnItems([...grnItems, { itemCode: '', itemName: '', uom: '', refQty: '', secondaryQty: '', receivedQty: '', acceptedQty: '', rejectedQty: '', shortExcessQty: '', remarks: '' }]);
  };

  const handleRemoveGrnItem = (index: number) => {
    setGrnItems(grnItems.filter((_, i) => i !== index));
  };

  const handleGrnItemChange = (index: number, field: string, value: any) => {
    const updatedItems = [...grnItems];
    updatedItems[index][field] = value;

    if (field === 'itemCode' || field === 'itemName') {
      let selectedItem;
      if (field === 'itemCode') {
        selectedItem = items.find(i => i.item_code === value);
      } else {
        selectedItem = items.find(i => (i.name || i.item_name) === value);
      }

      if (selectedItem) {
        updatedItems[index].itemCode = selectedItem.item_code;
        updatedItems[index].itemName = selectedItem.item_name || selectedItem.name;
        updatedItems[index].uom = selectedItem.uom || selectedItem.unit;
        updatedItems[index].itemId = selectedItem.id;

        // Fetch PO Qty if PO is selected
        if (grnSelectedPOs.length > 0) {
          // This logic is trickier with multiple POs. 
          // For now, we search across all selected POs for this item code.
          for (const poNum of grnSelectedPOs) {
            const poOption = grnReferenceNoOptions.find(po => po.po_number === poNum);
            if (poOption && poOption.items) {
              const poItem = poOption.items.find((pi: any) => pi.item_code === updatedItems[index].itemCode);
              if (poItem) {
                updatedItems[index].refQty = poItem.quantity;
                break; // Use the first one found
              }
            }
          }
        }

        // Fetch Invoice Qty if Invoice is selected
        if (grnSecondaryRefNo) {
          const selectedInv = grnSecondaryRefNoOptions.find(inv => inv.supplier_invoice_no === grnSecondaryRefNo);
          if (selectedInv) {
            const invItems = selectedInv.supply_inr_details?.items || selectedInv.supply_foreign_details?.items || [];
            const invItem = invItems.find((ii: any) => (ii.itemCode || ii.item_code) === updatedItems[index].itemCode);
            if (invItem) {
              updatedItems[index].secondaryQty = invItem.qty || invItem.quantity;
            }
          }
        }
      }
    }

    // Auto-calculate shortage/excess and rejected qty
    if (field === 'receivedQty' || field === 'secondaryQty' || field === 'acceptedQty') {
      const received = parseFloat(updatedItems[index].receivedQty) || 0;
      const secondary = parseFloat(updatedItems[index].secondaryQty) || 0;
      const accepted = parseFloat(updatedItems[index].acceptedQty) || 0;

      updatedItems[index].shortExcessQty = (secondary - received).toString();
      updatedItems[index].rejectedQty = (received - accepted).toString();
    }

    // Update po_number if remarks changed manually and it indicates a different PO
    if (field === 'remarks' && value.includes('From PO: ')) {
      const parts = value.split('From PO: ');
      if (parts.length > 1) {
        updatedItems[index].po_number = parts[1].trim();
      }
    }

    setGrnItems(updatedItems);
  };


  useEffect(() => {
    if (showGRNForm) {
      if (items.length === 0) fetchItems();
      if (vendors.length === 0) fetchVendors();
      if (customers.length === 0) fetchCustomers();
      // Default date to today
      if (!grnDate) setGrnDate(new Date().toISOString().split('T')[0]);
    }
  }, [showGRNForm]);

  useEffect(() => {
    if (showIssueSlipForm) {
      if (locations.length === 0) fetchLocations();
      if (items.length === 0) fetchItems();
      if (vendors.length === 0) fetchVendors();
      if (customers.length === 0) fetchCustomers();
      // Auto-init scrap form dates/times
      const today = new Date().toISOString().split('T')[0];
      const now = new Date().toTimeString().slice(0, 5);
      if (!scrapProdDate) setScrapProdDate(today);
      if (!scrapProdTime) setScrapProdTime(now);
      if (!scrapOtherDate) setScrapOtherDate(today);
      if (!scrapOtherTime) setScrapOtherTime(now);
      if (!scrapDispDate) setScrapDispDate(today);
      if (!scrapDispTime) setScrapDispTime(now);
    }
  }, [showIssueSlipForm]);

  useEffect(() => {
    if (showIssueSlipForm && issueSlipTab === 'outward') {
      const fetchOutwardData = async () => {
        try {
          if (outwardType === 'sales') {
            const response = await apiService.getSalesOrders({ status: 'pending' });
            setOutwardSalesOrderOptions(Array.isArray(response) ? response : []);
          } else if (outwardType === 'purchase_return') {
            const response = await apiService.getVouchers('Purchase');
            setOutwardSupplierInvoiceOptions(Array.isArray(response) ? response : []);
          }
        } catch (error) {
          console.error("Error fetching outward options", error);
        }
      };
      fetchOutwardData();
    }
  }, [showIssueSlipForm, issueSlipTab, outwardType]);

  useEffect(() => {
    if (showIssueSlipForm && issueSlipTab === 'scrap') {
      if (materialIssueSlipOptions.length === 0) fetchMaterialIssueSlips();
      if (processTransferSlipOptions.length === 0) fetchProcessTransferSlips();
      if (issueSlipSeriesList.length === 0) fetchIssueSlipSeries();
    }
  }, [showIssueSlipForm, issueSlipTab]);

  const handleGRNSubmit = async () => {
    try {
      const payload = {
        grn_type: grnType,
        grn_no: grnNumber,
        grn_series_name: grnSelectedSeriesName,
        date: grnDate || null,
        time: grnTime || null,
        location_id: grnLocation || null, // Assuming this is ID

        vendor_name: grnVendorName,
        customer_name: grnCustomerName,
        branch: grnBranch,
        address: grnAddress,
        gstin: grnGstin,

        reference_no: grnSelectedPOs.join(', '),
        secondary_ref_no: grnSecondaryRefNo,

        return_reason: grnReason,
        posting_note: grnPostingNote,
        status: 'Posted',

        items: grnItems.map(item => ({
          item_code: item.itemCode,
          item_name: item.itemName,
          uom: item.uom,
          ref_qty: item.refQty || 0,
          secondary_qty: item.secondaryQty || 0,
          received_qty: item.receivedQty || 0,
          accepted_qty: item.acceptedQty || 0,
          rejected_qty: item.rejectedQty || 0,
          short_excess_qty: item.shortExcessQty || 0,
          remarks: item.remarks
        }))
      };

      await httpClient.post('/api/inventory/operations/new-grn/', payload);
      showSuccess('GRN saved successfully!');
      setShowGRNForm(false);
      setGrnDocument(null);
      setGrnDocumentPreview(null);
    } catch (error) {
      console.error('Error saving GRN:');
      showError('Failed to save GRN. Please check your inputs.');
    }
  };

  const handleAddIssueSlipItem = () => {
    setIssueSlipItems([...issueSlipItems, { itemCode: '', itemName: '', uom: '', quantity: '', rate: 0, value: 0, hsnCode: '', remainingQty: undefined }]);
  };

  const handleRemoveIssueSlipItem = (index: number) => {
    setIssueSlipItems(issueSlipItems.filter((_, i) => i !== index));
  };

  const handleIssueSlipItemChange = (index: number, field: string, value: any) => {
    const updatedItems = [...issueSlipItems];
    updatedItems[index][field] = value;

    if (field === 'itemCode') {
      const selectedItem = items.find(i => i.item_code === value);
      if (selectedItem) {
        updatedItems[index].itemName = selectedItem.name || selectedItem.item_name;
        updatedItems[index].uom = selectedItem.uom || selectedItem.unit;
        updatedItems[index].hsnCode = (selectedItem as any).hsn_code || (selectedItem as any).hsn || (selectedItem as any).hsn_sac || (selectedItem as any).hsn_sac_code || '';
        updatedItems[index].rate = selectedItem.standard_rate || selectedItem.rate || 0;
        updatedItems[index].remainingQty = selectedItem.remaining_qty || 0;
        const qty = parseFloat(updatedItems[index].quantity) || 0;
        updatedItems[index].value = qty * updatedItems[index].rate;
      }
    } else if (field === 'itemName') {
      const selectedItem = items.find(i => i.name === value || i.item_name === value);
      if (selectedItem) {
        updatedItems[index].itemCode = selectedItem.item_code;
        updatedItems[index].uom = selectedItem.uom || selectedItem.unit;
        updatedItems[index].hsnCode = (selectedItem as any).hsn_code || (selectedItem as any).hsn || (selectedItem as any).hsn_sac || (selectedItem as any).hsn_sac_code || '';
        updatedItems[index].rate = selectedItem.standard_rate || selectedItem.rate || 0;
        updatedItems[index].remainingQty = selectedItem.remaining_qty || 0;
        const qty = parseFloat(updatedItems[index].quantity) || 0;
        updatedItems[index].value = qty * updatedItems[index].rate;
      }
    }

    // Calculate Value (Qty * Rate)
    if (field === 'quantity' || field === 'rate') {
      const qty = parseFloat(updatedItems[index].quantity) || 0;
      const rate = parseFloat(updatedItems[index].rate) || 0;
      updatedItems[index].value = qty * rate;
    }

    // Calculate Shortage/Excess for Receipt (Received - Vendor) & Rejected (Received - Accepted)
    if (field === 'vendorQty' || field === 'receivedQty' || field === 'acceptedQty') {
      const vendorQty = parseFloat(updatedItems[index].vendorQty) || 0;
      const receivedQty = parseFloat(updatedItems[index].receivedQty) || 0;
      const acceptedQty = parseFloat(updatedItems[index].acceptedQty) || 0;

      updatedItems[index].shortageExcessQty = receivedQty - vendorQty;
      updatedItems[index].rejectedQty = receivedQty - acceptedQty;
    }

    // Calculate Remaining for Outward (Total - Consumed - Scrapped)
    // Note: 'quantity' is the Total Quantity here
    if (field === 'quantity' || field === 'consumedQty' || field === 'scrappedQty') {
      const total = parseFloat(updatedItems[index].quantity) || 0;
      const consumed = parseFloat(updatedItems[index].consumedQty) || 0;
      const scrapped = parseFloat(updatedItems[index].scrappedQty) || 0;
      updatedItems[index].remainingQty = total - consumed - scrapped;
    }

    setIssueSlipItems(updatedItems);
  };

  const getTotalValue = () => {
    return issueSlipItems.reduce((sum, item) => sum + (item.value || 0), 0);
  };

  const renderOperations = () => {
    const canViewStock = isSuperuser || hasTabAccess('Inventory', 'Stock Movement');
    const canCreateIssue = isSuperuser || hasTabAccess('Inventory', 'Issue Slip Creation');
    const canCreateGRN = isSuperuser || hasTabAccess('Inventory', 'GRN Creation');

    const filteredStockData = operationsStockData.filter(item => {
      const matchCategory = item.category.toLowerCase().includes(stockFilters.category.toLowerCase());
      const matchSubCategory = item.subCategory.toLowerCase().includes(stockFilters.subCategory.toLowerCase());
      const matchItemCode = item.itemCode.toLowerCase().includes(stockFilters.itemCode.toLowerCase());
      const matchItemName = item.itemName.toLowerCase().includes(stockFilters.itemName.toLowerCase());
      const matchUom = item.uom.toLowerCase().includes(stockFilters.uom.toLowerCase());
      return matchCategory && matchSubCategory && matchItemCode && matchItemName && matchUom;
    });

    const filteredDetailsData = stockDetailsData.filter(item => {
      const matchDate = item.date.toLowerCase().includes(detailsFilters.date.toLowerCase());
      const matchParticulars = item.particulars.toLowerCase().includes(detailsFilters.particulars.toLowerCase());
      const matchRefNo = item.refNo.toLowerCase().includes(detailsFilters.refNo.toLowerCase());
      const matchLocation = item.location.toLowerCase().includes(detailsFilters.location.toLowerCase());
      const matchUom = item.uom.toLowerCase().includes(detailsFilters.uom.toLowerCase());
      return matchDate && matchParticulars && matchRefNo && matchLocation && matchUom;
    });

    const deliveryChallanFieldsJSX = (
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-lg font-bold text-gray-800 mb-4">Delivery Challan / Dispatch Details</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-4">
            {/* Dispatch From */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dispatch From
              </label>
              <textarea
                value={dispatchFrom}
                onChange={(e) => setDispatchFrom(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={3}
              />
            </div>

            {/* Mode of Transport */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mode of Transport
              </label>
              <select
                value={modeOfTransport}
                onChange={(e) => setModeOfTransport(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Select Mode</option>
                <option value="Road">Road</option>
                <option value="Air">Air</option>
                <option value="Sea">Sea</option>
                <option value="Rail">Rail</option>
                <option value="Courier">Courier</option>
              </select>
            </div>

            {/* Dispatch Date & Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dispatch Date
                </label>
                <input
                  type="date"
                  value={dispatchDate}
                  onChange={(e) => setDispatchDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dispatch Time
                </label>
                <input
                  type="time"
                  value={dispatchTime}
                  onChange={(e) => setDispatchTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Upload Document */}
            <div className="mt-2">
              <input
                type="file"
                id="dispatch-doc-inventory"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setDispatchDocument(file);
                }}
                className="hidden"
                accept=".jpg,.jpeg,.pdf"
              />
              <button
                type="button"
                onClick={() => document.getElementById('dispatch-doc-inventory')?.click()}
                className="w-full h-32 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-indigo-50/50 text-gray-600 rounded transition-colors flex flex-col items-center justify-center gap-2"
              >
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-xs font-medium">UPLOAD DOCUMENT</span>
                {dispatchDocument && (
                  <span className="text-xs mt-1 text-indigo-600 font-medium">✓ {dispatchDocument.name}</span>
                )}
              </button>
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            {/* Delivery Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Delivery Type
              </label>
              <select
                value={deliveryType}
                onChange={(e) => {
                  setDeliveryType(e.target.value);
                  if (e.target.value === 'Courier') {
                    setTransporterId('');
                    setTransporterName('');
                    setVehicleNo('');
                    setLrGrConsignment('');
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                <option value="">Select</option>
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
                value={transporterId}
                onChange={(e) => setTransporterId(e.target.value)}
                disabled={deliveryType === 'Courier'}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Editable with numerics and alphabet"
              />
            </div>

            {/* Transporter Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transporter Name
              </label>
              <input
                type="text"
                value={transporterName}
                onChange={(e) => setTransporterName(e.target.value)}
                disabled={deliveryType === 'Courier'}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Editable with numerics and alphabet"
              />
            </div>

            {/* Vehicle No. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle No.
              </label>
              <input
                type="text"
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                disabled={deliveryType === 'Courier'}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Editable with numerics and alphabet"
              />
            </div>

            {/* LR/GR/Consignment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                LR/GR/Consignment
              </label>
              <input
                type="text"
                value={lrGrConsignment}
                onChange={(e) => setLrGrConsignment(e.target.value)}
                disabled={deliveryType === 'Courier'}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder="Editable with numerics and alphabet"
              />
            </div>
          </div>
        </div>

        {(modeOfTransport === 'Air' || modeOfTransport === 'Sea') && (
          <div className="space-y-6 mt-6 border-t border-gray-200 pt-4">
            {/* UPTO PORT */}
            <div>
              <h3 className="text-md font-semibold text-gray-800 mb-3">UPTO PORT</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                    <input type="text" value={uptoPortShippingBillNo} onChange={(e) => setUptoPortShippingBillNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ship/Port Code</label>
                    <input type="text" value={uptoPortShipPortCode} onChange={(e) => setUptoPortShipPortCode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                    <input type="date" value={uptoPortShippingBillDate} onChange={(e) => setUptoPortShippingBillDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                    <input type="text" value={uptoPortOrigin} onChange={(e) => setUptoPortOrigin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="City" />
                  </div>
                </div>
              </div>
            </div>

            {/* BEYOND PORT */}
            <div>
              <h3 className="text-md font-semibold text-gray-800 mb-3">BEYOND PORT</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill No.</label>
                    <input type="text" value={beyondPortShippingBillNo} onChange={(e) => setBeyondPortShippingBillNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ship/Port Code</label>
                    <input type="text" value={beyondPortShipPortCode} onChange={(e) => setBeyondPortShipPortCode(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port of Loading</label>
                    <input type="text" value={beyondPortPortOfLoading} onChange={(e) => setBeyondPortPortOfLoading(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                    <input type="text" value={beyondPortFinalDestination} onChange={(e) => setBeyondPortFinalDestination(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
                    <input type="text" value={beyondPortDestCountry} onChange={(e) => setBeyondPortDestCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Bill Date</label>
                    <input type="date" value={beyondPortShippingBillDate} onChange={(e) => setBeyondPortShippingBillDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vessel/Flight No.</label>
                    <input type="text" value={beyondPortVesselFlightNo} onChange={(e) => setBeyondPortVesselFlightNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Port of Discharge</label>
                    <input type="text" value={beyondPortPortOfDischarge} onChange={(e) => setBeyondPortPortOfDischarge(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Origin Country</label>
                    <input type="text" value={beyondPortOriginCountry} onChange={(e) => setBeyondPortOriginCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Conditional Details for Rail */}
        {modeOfTransport === 'Rail' && (
          <div className="space-y-6 mt-6 border-t border-gray-200 pt-4">
            {/* UPTO PORT (Rail) */}
            <div>
              <h3 className="text-md font-semibold text-gray-800 mb-3">UPTO PORT</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Type</label>
                    <input type="text" value={railUptoPortDeliveryType} onChange={(e) => setRailUptoPortDeliveryType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transporter Name</label>
                    <input type="text" value={railUptoPortTransporterName} onChange={(e) => setRailUptoPortTransporterName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Transporter ID</label>
                    <input type="text" value={railUptoPortTransporterId} onChange={(e) => setRailUptoPortTransporterId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>
            </div>

            {/* BEYOND PORT (Rail) */}
            <div>
              <h3 className="text-md font-semibold text-gray-800 mb-3">BEYOND PORT</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt No.</label>
                    <input type="text" value={railBeyondPortRailwayReceiptNo} onChange={(e) => setRailBeyondPortRailwayReceiptNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
                    <input type="text" value={railBeyondPortOrigin} onChange={(e) => setRailBeyondPortOrigin(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rail No.</label>
                    <input type="text" value={railBeyondPortRailNo} onChange={(e) => setRailBeyondPortRailNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Station of Discharge</label>
                    <input type="text" value={railBeyondPortStationOfDischarge} onChange={(e) => setRailBeyondPortStationOfDischarge(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Destination Country</label>
                    <input type="text" value={railBeyondPortDestCountry} onChange={(e) => setRailBeyondPortDestCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Railway Receipt Date</label>
                    <input type="date" value={railBeyondPortRailwayReceiptDate} onChange={(e) => setRailBeyondPortRailwayReceiptDate(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Origin Country</label>
                    <input type="text" value={railBeyondPortOriginCountry} onChange={(e) => setRailBeyondPortOriginCountry(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Station of Loading</label>
                    <input type="text" value={railBeyondPortStationOfLoading} onChange={(e) => setRailBeyondPortStationOfLoading(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Final Destination</label>
                    <input type="text" value={railBeyondPortFinalDestination} onChange={(e) => setRailBeyondPortFinalDestination(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );


    return (
      <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-6">
        {!showItemDetail ? (
          <>
            {/* Stock Movement Main View */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-gray-800">Stock Movement Summary</h2>

              {/* Top Action Buttons */}
              <div className="flex gap-4">
                {canCreateIssue && (
                  <button
                    onClick={() => setShowIssueSlipForm(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    ➕ Add New Issue Slip
                  </button>
                )}
                {canCreateGRN && (
                  <button
                    onClick={() => setShowGRNForm(true)}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    ➕ Add New GRN
                  </button>
                )}
              </div>

              {/* Stock Movement Table */}
              {/* Stock Movement Table */}
              {canViewStock ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Sub-Cat</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item Code</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">UOM</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Opening Stock</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Inward</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Outward</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Closing Stock</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Action</th>
                      </tr>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={stockFilters.category} onChange={(e) => setStockFilters({ ...stockFilters, category: e.target.value })} className="w-20 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={stockFilters.subCategory} onChange={(e) => setStockFilters({ ...stockFilters, subCategory: e.target.value })} className="w-20 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={stockFilters.itemCode} onChange={(e) => setStockFilters({ ...stockFilters, itemCode: e.target.value })} className="w-20 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={stockFilters.itemName} onChange={(e) => setStockFilters({ ...stockFilters, itemName: e.target.value })} className="w-24 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={stockFilters.uom} onChange={(e) => setStockFilters({ ...stockFilters, uom: e.target.value })} className="w-16 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredStockData.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{item.category}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.subCategory}</td>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.itemCode}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.itemName}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.uom}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.openingQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.openingValue}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.inwardQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.inwardValue}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.outwardQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.outwardValue}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.closingQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.closingValue}</td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => {
                                setSelectedItemForOps(item);
                                setShowItemDetail(true);
                              }}
                              className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-[4px]">
                  You do not have permission to view Stock Movement.
                </div>
              )}
            </div>
          </>
        ) : (
          canViewStock ? (
            <>
              {/* Item Detail - GRN & Issue Slip View */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-gray-800">
                    {selectedItemForOps.itemCode} - {selectedItemForOps.itemName}
                  </h2>
                  <button
                    onClick={() => {
                      setShowItemDetail(false);
                      setSelectedItemForOps(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ✕
                  </button>
                </div>

                <div className="bg-gray-50 p-4 rounded-[4px]">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Item Code</p>
                      <p className="font-semibold text-gray-900">{selectedItemForOps.itemCode}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Item Name</p>
                      <p className="font-semibold text-gray-900">{selectedItemForOps.itemName}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Category</p>
                      <p className="font-semibold text-gray-900">{selectedItemForOps.category}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Sub-Category</p>
                      <p className="font-semibold text-gray-900">{selectedItemForOps.subCategory}</p>
                    </div>
                  </div>
                </div>

                {/* GRN & Issue Slip Transactions Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 border border-gray-300">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Particulars</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Ref No</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Location</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">UOM</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Opening Stock</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Inward</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Outward</th>
                        <th colSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Closing Stock</th>
                      </tr>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={detailsFilters.date} onChange={(e) => setDetailsFilters({ ...detailsFilters, date: e.target.value })} className="w-20 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={detailsFilters.particulars} onChange={(e) => setDetailsFilters({ ...detailsFilters, particulars: e.target.value })} className="w-32 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={detailsFilters.refNo} onChange={(e) => setDetailsFilters({ ...detailsFilters, refNo: e.target.value })} className="w-20 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={detailsFilters.location} onChange={(e) => setDetailsFilters({ ...detailsFilters, location: e.target.value })} className="w-24 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2"><input type="text" placeholder="Filter..." value={detailsFilters.uom} onChange={(e) => setDetailsFilters({ ...detailsFilters, uom: e.target.value })} className="w-16 px-2 py-1 border rounded text-xs" /></th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Qty</th>
                        <th className="px-2 py-2 text-center text-xs font-medium text-gray-600">Value</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {filteredDetailsData.map((item) => (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">{item.date}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.particulars}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.refNo}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.location}</td>
                          <td className="px-4 py-3 text-sm text-gray-900">{item.uom}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.openingQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.openingValue}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.inwardQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.inwardValue}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.outwardQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.outwardValue}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">{item.closingQty}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-900">₹{item.closingValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-[4px]">
              You do not have permission to view Stock Movement Details.
            </div>
          )
        )}

        {/* Issue Slip Form Modal */}
        {
          showIssueSlipForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
              <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 w-full h-[90vh] max-w-7xl flex flex-col">
                <div className="bg-white border-b border-gray-200 p-5 flex justify-between items-center shrink-0">
                  <h3 className="text-2xl font-bold text-gray-900">Create Issue Slip</h3>
                  <button
                    onClick={() => setShowIssueSlipForm(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-8 space-y-6 overflow-y-auto flex-1">
                  {/* Tabs */}
                  <div className="flex gap-6 border-b border-gray-200">
                    {(['job-work', 'inter-unit', 'location-change', 'production', 'consumption', 'outward', 'scrap'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setIssueSlipTab(tab)}
                        className={`px-6 py-3 font-semibold text-base border-b-3 ${issueSlipTab === tab
                          ? 'border-indigo-600 text-indigo-600'
                          : 'border-transparent text-gray-600 hover:text-gray-800'
                          }`}
                      >
                        {tab === 'job-work' ? 'Job-work' :
                          tab === 'inter-unit' ? 'Inter-unit' :
                            tab === 'location-change' ? 'Location Change' :
                              tab.charAt(0).toUpperCase() + tab.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Job Work Sub Tabs */}
                  {/* Job Work Sub Tabs */}
                  {issueSlipTab === 'job-work' && (
                    <div className="flex flex-col gap-6 mb-6">
                      <div className="flex gap-6 border-b border-gray-100">
                        <button
                          onClick={() => setJobWorkSubTab('received')}
                          className={`pb-2 text-base font-medium transition-colors relative ${jobWorkSubTab === 'received' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Goods received for Jobwork
                        </button>
                        <button
                          onClick={() => setJobWorkSubTab('sent')}
                          className={`pb-2 text-base font-medium transition-colors relative ${jobWorkSubTab === 'sent' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Goods sent for Jobwork
                        </button>
                      </div>

                      {jobWorkSubTab === 'sent' && (
                        <div className="flex gap-6 ml-1">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              name="jobWorkSentType"
                              value="outward"
                              checked={jobWorkSentType === 'outward'}
                              onChange={(e) => setJobWorkSentType(e.target.value as 'outward')}
                              className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            />
                            <span className={`font-medium ${jobWorkSentType === 'outward' ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'}`}>Outward</span>
                          </label>

                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="radio"
                              name="jobWorkSentType"
                              value="receipt"
                              checked={jobWorkSentType === 'receipt'}
                              onChange={(e) => setJobWorkSentType(e.target.value as 'receipt')}
                              className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                            />
                            <span className={`font-medium ${jobWorkSentType === 'receipt' ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'}`}>Receipt</span>
                          </label>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Jobwork Outward Form */}
                  {issueSlipTab === 'job-work' && jobWorkSubTab === 'sent' && jobWorkSentType === 'outward' && (
                    <div className="mt-8 space-y-6">
                      {/* Top Row: Jobwork Outward No */}
                      <div className="flex justify-end">
                        <div className="w-1/4">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Jobwork Outward No.</label>
                          <input
                            type="text"
                            value={issueSlipNumber}
                            onChange={(e) => setIssueSlipNumber(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Issued From & To */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued From</label>
                          <select
                            value={goodsFromLocation}
                            onChange={(e) => setGoodsFromLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                        {/* Placeholder for Issued To layout alignment if needed, or just start Vendor section */}
                      </div>

                      {/* Vendor Details */}
                      <div>
                        <h4 className="text-sm font-bold text-gray-800 mb-3 border-b border-gray-200 pb-1">Issued To (Job Worker)</h4>
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Vendor Name</label>
                            <select
                              value={outwardVendorName}
                              onChange={(e) => handleOutwardVendorChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select Vendor</option>
                              {vendors
                                .filter(v => (v.vendor_category || '').toLowerCase().includes('jobwork'))
                                .map(vendor => (
                                  <option key={vendor.id} value={vendor.vendor_name}>{vendor.vendor_name}</option>
                                ))
                              }
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Branch</label>
                            <select
                              value={outwardBranch}
                              onChange={(e) => handleOutwardBranchChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select Branch</option>
                              {outwardBranchOptions.map((branch, idx) => (
                                <option key={branch.id || idx} value={branch.reference_name}>{branch.reference_name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mt-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
                            <textarea
                              value={outwardAddress}
                              readOnly
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                            />
                          </div>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">GSTIN No</label>
                              <input
                                type="text"
                                value={outwardGstin}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-700 mb-1">Purchase Order No.</label>
                              <select
                                value={jobWorkOrderNo}
                                onChange={(e) => setJobWorkOrderNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="">Select PO</option>
                                {jobWorkOrderNoOptions.length === 0 ? (
                                  <option disabled>No Pending POs</option>
                                ) : (
                                  jobWorkOrderNoOptions.map((po: any) => (
                                    <option key={po.id} value={po.po_number}>{po.po_number}</option>
                                  ))
                                )}

                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Items Table */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-bold text-gray-800">Items</label>
                          <button
                            onClick={handleAddIssueSlipItem}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
                          >
                            + Add Item
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          <table className="min-w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Name</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">HSN Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">UOM</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Quantity</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Rate</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Taxable Value</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {issueSlipItems.map((slipItem, index) => {
                                // Find selected item for this row to populate UOM options
                                const selectedItemForUom = items.find(i => i.item_code === slipItem.itemCode);
                                const uomOptions = [];
                                if (selectedItemForUom) {
                                  const u1 = selectedItemForUom.uom || selectedItemForUom.unit;
                                  const u2 = selectedItemForUom.alternate_uom || selectedItemForUom.alternative_unit;
                                  if (u1) uomOptions.push(u1);
                                  if (u2 && u2 !== u1) uomOptions.push(u2);
                                }

                                return (
                                  <tr key={index}>
                                    <td className="px-3 py-2">
                                      <select
                                        value={slipItem.itemCode}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        <option value="">Select Code</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <select
                                        value={slipItem.itemName}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)}
                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        <option value="">Select Item</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <input type="text" value={slipItem.hsnCode || ''} readOnly className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                                    </td>
                                    <td className="px-3 py-2">
                                      <select
                                        value={slipItem.uom || ''}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'uom', e.target.value)}
                                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        <option value="">Select</option>
                                        {uomOptions.map(u => (
                                          <option key={u} value={u}>{u}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2"><input type="number" value={slipItem.quantity} onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2"><input type="number" value={slipItem.rate} readOnly className="w-full px-2 py-1 bg-gray-50 border border-gray-300 rounded text-sm cursor-not-allowed" /></td>
                                    <td className="px-3 py-2"><input type="text" value={slipItem.value ? slipItem.value.toFixed(2) : ''} readOnly className="w-full px-2 py-1 bg-gray-50 border border-gray-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 text-center">
                                      <button onClick={() => handleRemoveIssueSlipItem(index)} className="text-red-600 hover:text-red-800 text-sm font-medium">Remove</button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-2 text-right text-sm font-bold text-gray-900">
                          Total Value: ₹{getTotalValue().toFixed(2)}
                        </div>
                      </div>

                      {/* Posting Note */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={2}
                          placeholder="Fetch the inventory item's most recent inward stock rate"
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Dispatch Details Section */}
                      <div className="border shadow-none border border-slate-200-none border border-slate-200 rounded-[4px] p-4 bg-gray-50">
                        <h4 className="text-sm font-bold text-gray-800 mb-3 border-b border-gray-200 pb-2">Dispatch Details</h4>
                        {/* This would ideally be a collapsible section or a set of fields matching Sales Voucher dispatch details. For now, we use a placeholder or partial fields as per sketches often implying standard dispatch fields */}
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column */}
                            <div className="space-y-4">
                              {/* Dispatch From */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Dispatch From
                                </label>
                                <textarea
                                  value={dispatchFrom}
                                  onChange={(e) => setDispatchFrom(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                  rows={3}
                                />
                              </div>

                              {/* Mode of Transport */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Mode of Transport
                                </label>
                                <select
                                  value={modeOfTransport}
                                  onChange={(e) => setModeOfTransport(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                  <option value="">Select</option>
                                  <option value="Road">Road</option>
                                  <option value="Air">Air</option>
                                  <option value="Sea">Sea</option>
                                  <option value="Rail">Rail</option>
                                  <option value="Courier">Courier</option>
                                </select>
                              </div>

                              {/* Dispatch Date */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Dispatch Date
                                </label>
                                <input
                                  type="date"
                                  value={dispatchDate}
                                  onChange={(e) => setDispatchDate(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>

                              {/* Dispatch Time */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Dispatch Time
                                </label>
                                <input
                                  type="time"
                                  value={dispatchTime}
                                  onChange={(e) => setDispatchTime(e.target.value)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                />
                              </div>

                              {/* Upload Document */}
                              <div className="mt-6">
                                <input
                                  type="file"
                                  id="dispatch-doc"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) setDispatchDocument(file);
                                  }}
                                  className="hidden"
                                  accept=".jpg,.jpeg,.pdf"
                                />
                                <button
                                  type="button"
                                  onClick={() => document.getElementById('dispatch-doc')?.click()}
                                  className="w-full h-40 border-2 border-dashed border-gray-300 hover:border-indigo-500 bg-gray-50 hover:bg-indigo-50/50 text-gray-600 rounded-[4px] transition-colors flex flex-col items-center justify-center gap-2"
                                >
                                  <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                  </svg>
                                  <span className="text-sm font-medium">UPLOAD DOCUMENT</span>
                                  {dispatchDocument && (
                                    <span className="text-xs mt-2 text-indigo-600 font-medium">✓ {dispatchDocument.name}</span>
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-4">
                              {/* Delivery Type */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Delivery Type
                                </label>
                                <select
                                  value={deliveryType}
                                  onChange={(e) => {
                                    setDeliveryType(e.target.value);
                                    if (e.target.value === 'Courier') {
                                      setTransporterId('');
                                      setTransporterName('');
                                      setVehicleNo('');
                                      setLrGrConsignment('');
                                    }
                                  }}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                >
                                  <option value="">Select</option>
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
                                  value={transporterId}
                                  onChange={(e) => setTransporterId(e.target.value)}
                                  disabled={deliveryType === 'Courier'}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  placeholder="Editable with numerics and alphabet"
                                />
                              </div>

                              {/* Transporter Name */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Transporter Name
                                </label>
                                <input
                                  type="text"
                                  value={transporterName}
                                  onChange={(e) => setTransporterName(e.target.value)}
                                  disabled={deliveryType === 'Courier'}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  placeholder="Editable with numerics and alphabet"
                                />
                              </div>

                              {/* Vehicle No. */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Vehicle No.
                                </label>
                                <input
                                  type="text"
                                  value={vehicleNo}
                                  onChange={(e) => setVehicleNo(e.target.value)}
                                  disabled={deliveryType === 'Courier'}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  placeholder="Editable with numerics and alphabet"
                                />
                              </div>

                              {/* LR/GR/Consignment */}
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  LR/GR/Consignment
                                </label>
                                <input
                                  type="text"
                                  value={lrGrConsignment}
                                  onChange={(e) => setLrGrConsignment(e.target.value)}
                                  disabled={deliveryType === 'Courier'}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                  placeholder="Editable with numerics and alphabet"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Conditional Port Details for Air/Sea */}
                          {(modeOfTransport === 'Air' || modeOfTransport === 'Sea') && (
                            <div className="space-y-6 mt-6 border-t border-gray-200 pt-4">
                              {/* UPTO PORT Section */}
                              <div>
                                <h3 className="text-sm font-bold text-gray-800 mb-4">UPTO PORT</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Shipping Bill No.
                                      </label>
                                      <input
                                        type="text"
                                        value={uptoPortShippingBillNo}
                                        onChange={(e) => setUptoPortShippingBillNo(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Ship/Port Code
                                      </label>
                                      <input
                                        type="text"
                                        value={uptoPortShipPortCode}
                                        onChange={(e) => setUptoPortShipPortCode(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-4">
                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Shipping Bill Date
                                      </label>
                                      <input
                                        type="date"
                                        value={uptoPortShippingBillDate}
                                        onChange={(e) => setUptoPortShippingBillDate(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Origin
                                      </label>
                                      <input
                                        type="text"
                                        value={uptoPortOrigin}
                                        onChange={(e) => setUptoPortOrigin(e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="City"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-4 mt-4">
                          <button
                            onClick={() => setShowDeliveryChallan(true)}
                            className="px-4 py-2 border border-black text-black rounded hover:bg-gray-100 text-sm font-medium"
                          >
                            Generate Delivery Challan
                          </button>
                          <button
                            onClick={() => setShowEWayBill(true)}
                            className="px-4 py-2 border border-black text-black rounded hover:bg-gray-100 text-sm font-medium"
                          >
                            Generate E-way Bill
                          </button>
                        </div>
                      </div>


                      {/* Action Buttons */}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5">
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Jobwork Receipt Form */}
                  {issueSlipTab === 'job-work' && jobWorkSubTab === 'sent' && jobWorkSentType === 'receipt' && (
                    <div className="mt-8 space-y-6">
                      {/* Top Row: Job work Receipt No */}
                      <div className="flex justify-end">
                        <div className="w-1/4">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Job work Receipt No.</label>
                          <input
                            type="text"
                            value={jobWorkReceiptNo}
                            onChange={(e) => setJobWorkReceiptNo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Issued From & Outward Ref */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued From</label>
                          <select
                            value={goodsFromLocation}
                            onChange={(e) => setGoodsFromLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Job work Outward No.</label>
                          <select
                            value={jobWorkOutwardRefNo}
                            onChange={(e) => handleJobWorkOutwardChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Outward No</option>
                            {jobWorkOutwardOptions.map((opt: any) => (
                              <option key={opt.id} value={opt.issue_slip_no}>{opt.issue_slip_no}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Vendor Details */}
                      <div>
                        <h4 className="text-sm font-bold text-gray-800 mb-3 border-b border-gray-200 pb-1">Vendor Details</h4>
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Vendor Name</label>
                            <select
                              value={outwardVendorName}
                              onChange={(e) => handleOutwardVendorChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select Vendor</option>
                              {vendors
                                .filter(v => (v.vendor_category || '').toLowerCase().includes('jobwork'))
                                .map(vendor => (
                                  <option key={vendor.id} value={vendor.vendor_name}>{vendor.vendor_name}</option>
                                ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Branch</label>
                            <select
                              value={outwardBranch}
                              onChange={(e) => handleOutwardBranchChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select Branch</option>
                              {outwardBranchOptions.map((branch, idx) => (
                                <option key={branch.id || idx} value={branch.reference_name}>{branch.reference_name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 mt-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Address</label>
                            <textarea
                              value={outwardAddress}
                              readOnly
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">GSTIN No</label>
                            <input
                              type="text"
                              value={outwardGstin}
                              readOnly
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Scanner / Manual Input Fields */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Vendor's Return Delivery Challan No.</label>
                          <input
                            type="text"
                            value={vendorDeliveryChallan}
                            onChange={(e) => setVendorDeliveryChallan(e.target.value)}
                            placeholder=""
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Supplier Invoice No.</label>
                          <input
                            type="text"
                            value={outwardSupplierInvoice}
                            onChange={(e) => setOutwardSupplierInvoice(e.target.value)}
                            placeholder=""
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Upload Document Section */}
                      <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                        <input
                          type="file"
                          id="receipt-doc-upload"
                          className="hidden"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setReceiptDocument(file);
                              const url = URL.createObjectURL(file);
                              setReceiptPreviewUrl(url);
                            }
                          }}
                        />
                        <div className="flex flex-col items-center gap-2">
                          {!receiptDocument ? (
                            <>
                              <div className="bg-indigo-100 p-3 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                              </div>
                              <p className="text-sm font-semibold text-gray-700 mt-1">Upload Receipt Document</p>
                              <p className="text-xs text-gray-500">Supported formats: PDF, PNG, JPG (Max 5MB)</p>
                              <button
                                type="button"
                                onClick={() => document.getElementById('receipt-doc-upload')?.click()}
                                className="mt-2 px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
                              >
                                Select File
                              </button>
                            </>
                          ) : (
                            <div className="flex flex-col items-center gap-4 w-full">
                              <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-gray-200 w-full max-w-md shadow-sm">
                                <div className="bg-green-100 p-2 rounded">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div className="flex-1 text-left truncate">
                                  <p className="text-sm font-semibold text-gray-900 truncate">{receiptDocument.name}</p>
                                  <p className="text-xs text-gray-500">{(receiptDocument.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setShowReceiptPreview(true)}
                                  className="text-indigo-600 hover:text-indigo-800 text-sm font-bold uppercase tracking-wider px-3"
                                >
                                  Preview
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptDocument(null);
                                    setReceiptPreviewUrl(null);
                                  }}
                                  className="text-red-500 hover:text-red-700"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Items Section */}
                      <div>
                        <div className="flex gap-6 border-b border-gray-200 mb-4">
                          <button
                            onClick={() => setJwItemTab('outward')}
                            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${jwItemTab === 'outward' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            Outward Items
                          </button>
                          <button
                            onClick={() => setJwItemTab('received')}
                            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${jwItemTab === 'received' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            Received Items
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          {jwItemTab === 'outward' ? (
                            <table className="min-w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Name</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">HSN Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">UOM</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Total Quantity</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Consumed Quantity</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Scrapped Quantity</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Remaining Quantity</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {issueSlipItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemCode} readOnly className="w-full px-2 py-1 bg-gray-50 border-none rounded text-sm text-gray-700" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemName} readOnly className="w-full px-2 py-1 bg-gray-50 border-none rounded text-sm text-gray-700" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.hsnCode || ''} readOnly className="w-full px-2 py-1 bg-gray-50 border-none rounded text-sm text-gray-700" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.uom} readOnly className="w-full px-2 py-1 bg-gray-50 border-none rounded text-sm text-gray-700" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.quantity || ''} onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)} placeholder="Total" className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.consumedQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'consumedQty', e.target.value)} placeholder="Consumed" className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.scrappedQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'scrappedQty', e.target.value)} placeholder="Scrap" className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2"><input type="number" value={item.remainingQty || ''} placeholder="Remaining" readOnly className="w-full px-2 py-1 bg-gray-50 border-none rounded text-sm text-center text-gray-700" /></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <table className="min-w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Name</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">HSN Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">UOM</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r bg-indigo-50/50">Vendor's RDC Qty</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r bg-indigo-50/50">Received Qty</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Accepted Qty</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Rejected Qty</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Shortage/Excess</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Remarks</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {issueSlipItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemCode} onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)} className="w-24 px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemName} onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)} className="w-32 px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.hsnCode || ''} readOnly className="w-full px-2 py-1 bg-gray-50 border-none rounded text-sm text-gray-700" /></td>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.uom || ''}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'uom', e.target.value)}
                                        className="w-16 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        <option value="">Select</option>
                                        {(() => {
                                          const selectedItem = items.find(i => i.item_code === item.itemCode);
                                          const units = [];
                                          if (selectedItem) {
                                            const u1 = selectedItem.uom || selectedItem.unit;
                                            const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                            if (u1) units.push(u1);
                                            if (u2 && u2 !== u1) units.push(u2);
                                          }
                                          return units.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                          ));
                                        })()}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r bg-indigo-50/50"><input type="number" value={item.vendorQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'vendorQty', e.target.value)} placeholder="Vendor Qty" className="w-20 px-2 py-1 border border-indigo-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r bg-indigo-50/50"><input type="number" value={item.receivedQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'receivedQty', e.target.value)} placeholder="Recv Qty" className="w-20 px-2 py-1 border border-indigo-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.acceptedQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'acceptedQty', e.target.value)} placeholder="Accept" className="w-20 px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.rejectedQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'rejectedQty', e.target.value)} placeholder="Reject" readOnly className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.shortageExcessQty || ''} onChange={(e) => handleIssueSlipItemChange(index, 'shortageExcessQty', e.target.value)} readOnly className="w-20 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.remarks || ''} onChange={(e) => handleIssueSlipItemChange(index, 'remarks', e.target.value)} placeholder="Remarks" className="w-32 px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                    <td className="px-3 py-2 text-center">
                                      <button onClick={() => handleRemoveIssueSlipItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={10} className="px-3 py-2">
                                    <button onClick={handleAddIssueSlipItem} className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold">+ Add Received Item</button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>

                      </div>

                      {/* Posting Note */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>


                      {/* Action Buttons */}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5">
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {issueSlipTab === 'outward' && (
                    <div className="flex gap-6 mb-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="outwardType"
                          value="sales"
                          checked={outwardType === 'sales'}
                          onChange={(e) => setOutwardType(e.target.value)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 font-medium">Sales</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="outwardType"
                          value="purchase_return"
                          checked={outwardType === 'purchase_return'}
                          onChange={(e) => setOutwardType(e.target.value)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-gray-700 font-medium">Purchase Return</span>
                      </label>
                    </div>
                  )}

                  {/* Sales Outward Specifc Form */}
                  {issueSlipTab === 'outward' && outwardType === 'sales' && (
                    <>
                      <div className="grid grid-cols-4 gap-5">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Outward Slip No</label>
                          <input
                            type="text"
                            value={issueSlipNumber}
                            onChange={(e) => setIssueSlipNumber(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                          <select
                            value={itemLocation || ''}
                            onChange={(e) => setItemLocation(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Sales Order No.</label>
                          <select
                            value={outwardSalesOrder}
                            onChange={(e) => handleOutwardSalesOrderChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Pending Sales Order</option>
                            {outwardSalesOrderOptions.map(order => (
                              <option key={order.id} value={order.id}>
                                {order.so_number}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name</label>
                            {outwardSalesOrder ? (
                              <input
                                type="text"
                                value={outwardCustomerName}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100"
                              />
                            ) : (
                              <select
                                value={outwardCustomerName}
                                onChange={(e) => handleSalesOutwardCustomerChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="">Select Customer</option>
                                {customers.map(c => (
                                  <option key={c.id} value={c.customer_name}>{c.customer_name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
                            <select
                              value={outwardBranch}
                              onChange={(e) => handleOutwardBranchChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select Branch</option>
                              {outwardBranchOptions.map((b, idx) => (
                                <option key={idx} value={b.reference_name}>{b.reference_name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                          <textarea
                            value={outwardAddress}
                            readOnly
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                          <input
                            type="text"
                            value={outwardGstin}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Items Table for Sales Outward */}
                      <div className="mt-6">
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-semibold text-gray-700">Items</label>
                          <button
                            onClick={handleAddIssueSlipItem}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
                          >
                            + Add Item
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          <table className="min-w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Name</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">HSN Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">UOM</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Quantity</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">No. of boxes/packs</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {issueSlipItems.map((item, index) => (
                                <tr key={index}>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemCode}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm min-w-[120px]"
                                    >
                                      <option value="">Code</option>
                                      {items.map(i => (<option key={i.id} value={i.item_code}>{i.item_code}</option>))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemName}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm min-w-[150px]"
                                    >
                                      <option value="">Item</option>
                                      {items.map(i => (<option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="text" value={item.hsnCode || ''} readOnly className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.uom || ''}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'uom', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center"
                                    >
                                      <option value="">Unit</option>
                                      {(() => {
                                        const selectedItem = items.find(i => i.item_code === item.itemCode);
                                        const units = [];
                                        if (selectedItem) {
                                          const u1 = selectedItem.uom || selectedItem.unit;
                                          const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                          if (u1) units.push(u1);
                                          if (u2 && u2 !== u1) units.push(u2);
                                        }
                                        return units.map(u => (<option key={u} value={u}>{u}</option>));
                                      })()}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                  <td className="px-3 py-2"><input type="text" value={item.noOfBoxes || ''} onChange={(e) => handleIssueSlipItemChange(index, 'noOfBoxes', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                  <td className="px-3 py-2 text-center">
                                    <button onClick={() => handleRemoveIssueSlipItem(index)} className="text-red-600 hover:text-red-800 text-sm font-medium">Remove</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex justify-end items-center gap-4">
                          <label className="text-sm font-bold text-gray-900">Total Number of Boxes / Packs:</label>
                          <input
                            type="text"
                            value={outwardTotalBoxes}
                            onChange={(e) => setOutwardTotalBoxes(e.target.value)}
                            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-bold text-right"
                          />
                        </div>
                      </div>

                      <div className="mt-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      {deliveryChallanFieldsJSX}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5 mt-4"><button onClick={() => setShowDeliveryChallan(true)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm">Delivery Challan</button>
                        <button onClick={() => setShowEWayBill(true)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm">E-Way Bill</button>

                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                  {/* Purchase Return Outward Specific Form */}
                  {issueSlipTab === 'outward' && outwardType === 'purchase_return' && (
                    <>
                      <div className="grid grid-cols-4 gap-5">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Outward Slip No</label>
                          <input
                            type="text"
                            value={issueSlipNumber}
                            onChange={(e) => setIssueSlipNumber(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                          <select
                            value={itemLocation || ''}
                            onChange={(e) => setItemLocation(Number(e.target.value))}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Supplier Invoice No.</label>
                          <select
                            value={outwardSupplierInvoice}
                            onChange={(e) => handleOutwardSupplierInvoiceChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Supplier Invoice</option>
                            {outwardSupplierInvoiceOptions.map(inv => (
                              <option key={inv.id} value={inv.voucher_number || inv.id}>{inv.voucher_number || inv.supplier_invoice_no || `INV #${inv.id}`}</option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Vendor Name</label>
                            {outwardSupplierInvoice ? (
                              <input
                                type="text"
                                value={outwardVendorName}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100"
                              />
                            ) : (
                              <select
                                value={outwardVendorName}
                                onChange={(e) => handlePurchaseReturnVendorChange(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                <option value="">Select Vendor</option>
                                {vendors.map(v => (
                                  <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
                            <select
                              value={outwardBranch}
                              onChange={(e) => handleOutwardBranchChange(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select Branch</option>
                              {outwardBranchOptions.map((b, idx) => (
                                <option key={idx} value={b.reference_name}>{b.reference_name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                          <textarea
                            value={outwardAddress}
                            readOnly
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                          <input
                            type="text"
                            value={outwardGstin}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Items Table for Purchase Return Outward */}
                      <div className="mt-6">
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-semibold text-gray-700">Items</label>
                          <button
                            onClick={handleAddIssueSlipItem}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
                          >
                            + Add Item
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          <table className="min-w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Name</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">HSN Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">UOM</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Quantity</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">No. of boxes/packs</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {issueSlipItems.map((item, index) => (
                                <tr key={index}>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemCode}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm min-w-[120px]"
                                    >
                                      <option value="">Code</option>
                                      {items.map(i => (<option key={i.id} value={i.item_code}>{i.item_code}</option>))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemName}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm min-w-[150px]"
                                    >
                                      <option value="">Item</option>
                                      {items.map(i => (<option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="text" value={item.hsnCode || ''} readOnly className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.uom || ''}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'uom', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center"
                                    >
                                      <option value="">Unit</option>
                                      {(() => {
                                        const selectedItem = items.find(i => i.item_code === item.itemCode);
                                        const units = [];
                                        if (selectedItem) {
                                          const u1 = selectedItem.uom || selectedItem.unit;
                                          const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                          if (u1) units.push(u1);
                                          if (u2 && u2 !== u1) units.push(u2);
                                        }
                                        return units.map(u => (<option key={u} value={u}>{u}</option>));
                                      })()}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                  <td className="px-3 py-2"><input type="text" value={item.noOfBoxes || ''} onChange={(e) => handleIssueSlipItemChange(index, 'noOfBoxes', e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                  <td className="px-3 py-2 text-center">
                                    <button onClick={() => handleRemoveIssueSlipItem(index)} className="text-red-600 hover:text-red-800 text-sm font-medium">Remove</button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-4 flex justify-end items-center gap-4">
                          <label className="text-sm font-bold text-gray-900">Total Number of Boxes / Packs:</label>
                          <input
                            type="text"
                            value={outwardTotalBoxes}
                            onChange={(e) => setOutwardTotalBoxes(e.target.value)}
                            className="w-32 px-2 py-1 border border-gray-300 rounded text-sm font-bold text-right"
                          />
                        </div>
                      </div>

                      <div className="mt-6">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5 mt-4">
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                  {/* Production Tab Content */}
                  {issueSlipTab === 'production' && (
                    <div className="flex gap-8 mb-8 ml-1">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="radio"
                          name="productionType"
                          value="materials_issued"
                          checked={productionType === 'materials_issued'}
                          onChange={(e) => setProductionType(e.target.value as 'materials_issued')}
                          className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                        />
                        <span className={`font-medium text-base ${productionType === 'materials_issued' ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'}`}>Materials issued for production</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="radio"
                          name="productionType"
                          value="inter_process"
                          checked={productionType === 'inter_process'}
                          onChange={(e) => setProductionType(e.target.value as 'inter_process')}
                          className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                        />
                        <span className={`font-medium text-base ${productionType === 'inter_process' ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'}`}>Inter-process transfer</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="radio"
                          name="productionType"
                          value="finished_goods"
                          checked={productionType === 'finished_goods'}
                          onChange={(e) => setProductionType(e.target.value as 'finished_goods')}
                          className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                        />
                        <span className={`font-medium text-base ${productionType === 'finished_goods' ? 'text-gray-900' : 'text-gray-600 group-hover:text-gray-900'}`}>Finished Goods produced</span>
                      </label>
                    </div>
                  )}



                  {/* Production - Materials Issued Form */}
                  {issueSlipTab === 'production' && productionType === 'materials_issued' && (
                    <div className="mt-8 space-y-6">
                      {/* Material Issue Slip No */}
                      <div className="flex justify-end">
                        <div className="w-1/4">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Material Issue Slip No.</label>
                          <input
                            type="text"
                            value={materialIssueSlipNo}
                            onChange={(e) => setMaterialIssueSlipNo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Issued From & To */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued From</label>
                          <select
                            value={goodsFromLocation}
                            onChange={(e) => setGoodsFromLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued To</label>
                          <select
                            value={goodsToLocation}
                            onChange={(e) => setGoodsToLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Side-by-Side Tables: Raw Materials & Resulting WIP */}
                      <div className="grid grid-cols-2 gap-6">
                        {/* Raw Materials Table */}
                        <div className="border border-gray-300 rounded overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 font-bold text-gray-800 text-center">
                            Raw Materials
                          </div>
                          <div className="p-2 overflow-x-auto">
                            <table className="min-w-full">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Item Code</th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Item Name</th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">HSN Code</th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">UOM</th>
                                  <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Quantity</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {/* We reuse issueSlipItems for Raw Materials here */}
                                {issueSlipItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="p-1">
                                      <select
                                        value={item.itemCode}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)}
                                        className="w-full border rounded px-1 text-xs"
                                      >
                                        <option value="">Code</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <select
                                        value={item.itemName}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)}
                                        className="w-full border rounded px-1 text-xs"
                                      >
                                        <option value="">Item</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <input type="text" value={item.hsnCode || ''} readOnly className="w-full border rounded px-1 text-xs bg-gray-50" />
                                    </td>
                                    <td className="p-1">
                                      <select
                                        value={item.uom || ''}
                                        onChange={(e) => handleIssueSlipItemChange(index, 'uom', e.target.value)}
                                        className="w-16 border rounded px-1 text-xs"
                                      >
                                        <option value="">Unit</option>
                                        {(() => {
                                          const selectedItem = items.find(i => i.item_code === item.itemCode);
                                          const units = [];
                                          if (selectedItem) {
                                            const u1 = selectedItem.uom || selectedItem.unit;
                                            const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                            if (u1) units.push(u1);
                                            if (u2 && u2 !== u1) units.push(u2);
                                          }
                                          return units.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                          ));
                                        })()}
                                      </select>
                                    </td>
                                    <td className="p-1"><input type="number" value={item.quantity} onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)} className="w-full border rounded px-1 text-xs text-right" /></td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={5} className="p-2 text-center">
                                    <button onClick={handleAddIssueSlipItem} className="text-indigo-600 text-xs font-bold hover:underline">+ Add Raw Material</button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Resulting WIP Table */}
                        <div className="border border-gray-300 rounded overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 font-bold text-gray-800 text-center">
                            Resulting WIP
                          </div>
                          <div className="p-2 overflow-x-auto">
                            <table className="min-w-full">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Item Code</th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Item Name</th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">HSN Code</th>
                                  <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">UOM</th>
                                  <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Quantity</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {resultingWIPItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="p-1">
                                      <select
                                        value={item.itemCode}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newWIP = [...resultingWIPItems];
                                          newWIP[index].itemCode = val;
                                          const selectedItem = items.find(i => i.item_code === val);
                                          if (selectedItem) {
                                            newWIP[index].itemName = selectedItem.name || selectedItem.item_name;
                                            newWIP[index].uom = selectedItem.uom || selectedItem.unit;
                                            newWIP[index].hsnCode = (selectedItem as any).hsn_code || (selectedItem as any).hsn || (selectedItem as any).hsn_sac || (selectedItem as any).hsn_sac_code || '';
                                          }
                                          setResultingWIPItems(newWIP);
                                        }}
                                        className="w-full border rounded px-1 text-xs"
                                      >
                                        <option value="">Code</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <select
                                        value={item.itemName}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newWIP = [...resultingWIPItems];
                                          newWIP[index].itemName = val;
                                          const selectedItem = items.find(i => (i.name || i.item_name) === val);
                                          if (selectedItem) {
                                            newWIP[index].itemCode = selectedItem.item_code;
                                            newWIP[index].uom = selectedItem.uom || selectedItem.unit;
                                            newWIP[index].hsnCode = (selectedItem as any).hsn_code || (selectedItem as any).hsn || (selectedItem as any).hsn_sac || (selectedItem as any).hsn_sac_code || '';
                                          }
                                          setResultingWIPItems(newWIP);
                                        }}
                                        className="w-full border rounded px-1 text-xs"
                                      >
                                        <option value="">Item</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <input type="text" value={item.hsnCode || ''} readOnly className="w-full border rounded px-1 text-xs bg-gray-50" />
                                    </td>
                                    <td className="p-1">
                                      <select
                                        value={item.uom || ''}
                                        onChange={(e) => {
                                          const newWIP = [...resultingWIPItems];
                                          newWIP[index].uom = e.target.value;
                                          setResultingWIPItems(newWIP);
                                        }}
                                        className="w-16 border rounded px-1 text-xs"
                                      >
                                        <option value="">Unit</option>
                                        {(() => {
                                          const selectedItem = items.find(i => i.item_code === item.itemCode);
                                          const units = [];
                                          if (selectedItem) {
                                            const u1 = selectedItem.uom || selectedItem.unit;
                                            const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                            if (u1) units.push(u1);
                                            if (u2 && u2 !== u1) units.push(u2);
                                          }
                                          return units.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                          ));
                                        })()}
                                      </select>
                                    </td>
                                    <td className="p-1">
                                      <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          const newWIP = [...resultingWIPItems];
                                          newWIP[index].quantity = e.target.value;
                                          setResultingWIPItems(newWIP);
                                        }}
                                        className="w-full border rounded px-1 text-xs text-right"
                                      />
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={5} className="p-2 text-center">
                                    <button
                                      onClick={() => setResultingWIPItems([...resultingWIPItems, { itemCode: '', itemName: '', uom: '', quantity: '' }])}
                                      className="text-indigo-600 text-xs font-bold hover:underline"
                                    >
                                      + Add WIP Item
                                    </button>
                                  </td>

                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>

                      {/* Posting Note */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5">
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>

                    </div>
                  )}



                  {/* Production - Inter-process Transfer Form */}
                  {issueSlipTab === 'production' && productionType === 'inter_process' && (
                    <div className="mt-8 space-y-6">
                      {/* Process Transfer Slip No */}
                      <div className="flex justify-end">
                        <div className="w-1/4">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Process Transfer Slip No.</label>
                          <input
                            type="text"
                            value={processTransferSlipNo}
                            onChange={(e) => setProcessTransferSlipNo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Material Issue Slip No Select */}
                      <div className="w-1/2">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Material Issue Slip No.</label>
                        <select
                          multiple
                          value={selectedMaterialIssueSlips}
                          onChange={(e) => {
                            const newSelectedSlips = Array.from(e.target.selectedOptions, option => option.value);
                            setSelectedMaterialIssueSlips(newSelectedSlips);

                            // Auto-fetch source location from first selected slip
                            if (newSelectedSlips.length > 0) {
                              const found = materialIssueSlipOptions.find(o => o.issue_slip_no === newSelectedSlips[0]);
                              if (found) {
                                // For inter-process, the "From" (goodsToLocation) is actually the "To" of previous slip
                                setGoodsToLocation(String(found.goods_to_location || found.location_id || ''));

                                // Reset the interProcessToLocation to avoid confusion (or keep as needed)
                                // setInterProcessToLocation(''); 
                              }
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 font-bold"
                        >
                          {materialIssueSlipOptions.length === 0 ? (
                            <option disabled>No slips found</option>
                          ) : (
                            materialIssueSlipOptions.map((slip, idx) => (
                              <option key={idx} value={slip.issue_slip_no}>{slip.issue_slip_no}</option>
                            ))
                          )}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Cmd) to select multiple</p>
                      </div>

                      {/* Issued From & To */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued From</label>
                          <input
                            type="text"
                            readOnly
                            value={locations.find(l => String(l.id) === String(goodsToLocation))?.name || ''}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued To</label>
                          <select
                            value={interProcessToLocation}
                            onChange={(e) => setInterProcessToLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Tabs: Materials issued vs Converted Output */}
                      <div>
                        <div className="flex gap-6 border-b border-gray-200 mb-4">
                          <button
                            onClick={() => setProdItemTab('materials_issued')}
                            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${prodItemTab === 'materials_issued' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            Materials issued
                          </button>
                          <button
                            onClick={() => setProdItemTab('converted_output')}
                            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${prodItemTab === 'converted_output' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            Converted Output
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          {prodItemTab === 'materials_issued' ? (
                            <table className="min-w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Name</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">UOM</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Quantity Available</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Quantity Issued</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Rate</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {/* Mock data representing fetch from Material Issue Slip Resulting WIP */}
                                {resultingWIPItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemCode} readOnly className="w-full bg-gray-50 border-none rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemName} readOnly className="w-full bg-gray-50 border-none rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.uom} readOnly className="w-full bg-gray-50 border-none rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.quantity} readOnly className="w-full bg-gray-50 border-none rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.issueQty || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...resultingWIPItems];
                                          const qty = Number(val || 0);
                                          const rate = Number(newItems[index].rate || 0);
                                          const amount = parseFloat((qty * rate).toFixed(2));

                                          newItems[index] = {
                                            ...newItems[index],
                                            issueQty: val,
                                            amount: amount.toString()
                                          };
                                          setResultingWIPItems(newItems);
                                        }}
                                        placeholder="Issue Qty"
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.rate || ''}
                                        readOnly
                                        placeholder="Rate"
                                        className="w-full bg-gray-50 border-none rounded text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        value={item.amount || ''}
                                        readOnly
                                        disabled
                                        placeholder="0.00"
                                        className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm text-center cursor-not-allowed"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <table className="min-w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Name</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">HSN Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">UOM</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Quantity</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Rate</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {convertedOutputItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.itemCode}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...convertedOutputItems];
                                          newItems[index].itemCode = val;
                                          const selectedItem = items.find(i => i.item_code === val);
                                          if (selectedItem) {
                                            newItems[index].itemName = selectedItem.name || selectedItem.item_name;
                                            newItems[index].uom = selectedItem.uom || selectedItem.unit;
                                          }
                                          setConvertedOutputItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                      >
                                        <option value="">Code</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.itemName}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...convertedOutputItems];
                                          newItems[index].itemName = val;
                                          const selectedItem = items.find(i => (i.name || i.item_name) === val);
                                          if (selectedItem) {
                                            newItems[index].itemCode = selectedItem.item_code;
                                            newItems[index].uom = selectedItem.uom || selectedItem.unit;
                                          }
                                          setConvertedOutputItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                      >
                                        <option value="">Item</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.uom || ''}
                                        onChange={(e) => {
                                          const newItems = [...convertedOutputItems];
                                          newItems[index].uom = e.target.value;
                                          setConvertedOutputItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      >
                                        <option value="">Unit</option>
                                        {(() => {
                                          const selectedItem = items.find(i => i.item_code === item.itemCode);
                                          const units = [];
                                          if (selectedItem) {
                                            const u1 = selectedItem.uom || selectedItem.unit;
                                            const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                            if (u1) units.push(u1);
                                            if (u2 && u2 !== u1) units.push(u2);
                                          }
                                          return units.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                          ));
                                        })()}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.quantity}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...convertedOutputItems];
                                          const qty = Number(val || 0);
                                          const rate = Number(newItems[index].rate || 0);
                                          const amount = parseFloat((qty * rate).toFixed(2));

                                          newItems[index] = {
                                            ...newItems[index],
                                            quantity: val,
                                            amount: amount.toString()
                                          };
                                          setConvertedOutputItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.rate}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...convertedOutputItems];
                                          const rate = Number(val || 0);
                                          const qty = Number(newItems[index].quantity || 0);
                                          const amount = parseFloat((qty * rate).toFixed(2));

                                          newItems[index] = {
                                            ...newItems[index],
                                            rate: val,
                                            amount: amount.toString()
                                          };
                                          setConvertedOutputItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        value={item.amount}
                                        readOnly
                                        disabled
                                        placeholder="0.00"
                                        className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm text-center cursor-not-allowed"
                                      />
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={6} className="p-2 text-center">
                                    <button
                                      onClick={() => setConvertedOutputItems([...convertedOutputItems, { itemCode: '', itemName: '', uom: '', quantity: '', rate: '', amount: '' }])}
                                      className="text-indigo-600 text-xs font-bold hover:underline"
                                    >
                                      + Add Output Item
                                    </button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      {/* Posting Note */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5">
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>

                    </div>
                  )}



                  {/* Production - Finished Goods Produced Form */}
                  {issueSlipTab === 'production' && productionType === 'finished_goods' && (
                    <div className="mt-8 space-y-6">
                      {/* FG Receipt Slip No */}
                      <div className="flex justify-end">
                        <div className="w-1/4">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">FG Receipt Slip No.</label>
                          <input
                            type="text"
                            value={fgReceiptSlipNo}
                            onChange={(e) => setFgReceiptSlipNo(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="grid grid-cols-4 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Process Transfer Slip No Select */}
                      <div className="w-1/2">
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Process Transfer Slip No.</label>
                        <select
                          multiple
                          value={selectedProcessTransferSlips}
                          onChange={(e) => {
                            const newSelectedSlips = Array.from(e.target.selectedOptions, option => option.value);
                            setSelectedProcessTransferSlips(newSelectedSlips);
                            if (newSelectedSlips.length > 0) {
                              const found = processTransferSlipOptions.find(o => o.issue_slip_no === newSelectedSlips[0]);
                              if (found) {
                                setGoodsFromLocation(String(found.goods_to_location || ''));
                              }
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 font-bold"
                        >
                          {processTransferSlipOptions.length === 0 ? (
                            <option disabled>No slips found</option>
                          ) : (
                            processTransferSlipOptions.map((slip, idx) => (
                              <option key={idx} value={slip.issue_slip_no}>{slip.issue_slip_no}</option>
                            ))
                          )}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Hold Ctrl (Cmd) to select multiple</p>
                      </div>

                      {/* Issued From & To */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued From</label>
                          <input
                            type="text"
                            readOnly
                            value={locations.find(l => String(l.id) === goodsFromLocation)?.name || ''}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Issued To</label>
                          <select
                            value={goodsToLocation}
                            onChange={(e) => setGoodsToLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Tabs: Materials issued vs Goods Produced */}
                      <div>
                        <div className="flex gap-6 border-b border-gray-200 mb-4">
                          <button
                            onClick={() => setFgItemTab('materials_issued')}
                            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${fgItemTab === 'materials_issued' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            Materials issued
                          </button>
                          <button
                            onClick={() => setFgItemTab('goods_produced')}
                            className={`text-lg font-bold pb-1 border-b-2 transition-colors ${fgItemTab === 'goods_produced' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                          >
                            Goods Produced
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          {fgItemTab === 'materials_issued' ? (
                            <table className="min-w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Name</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">HSN Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">UOM</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Quantity Available</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Quantity Issued</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Rate</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {/* Mock data representing fetch from converted output */}
                                {fgMaterialsIssuedItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemCode} readOnly className="w-full bg-gray-50 border-none rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.itemName} readOnly className="w-full bg-gray-50 border-none rounded text-sm" /></td>
                                    <td className="px-3 py-2 border-r"><input type="text" value={item.uom} readOnly className="w-full bg-gray-50 border-none rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.quantityAvailable} readOnly className="w-full bg-gray-50 border-none rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.quantityIssued}
                                        placeholder="Issue Qty"
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...fgMaterialsIssuedItems];
                                          const qty = Number(val || 0);
                                          const rate = Number(newItems[index].rate || 0);
                                          const amount = parseFloat((qty * rate).toFixed(2));

                                          newItems[index] = {
                                            ...newItems[index],
                                            quantityIssued: val,
                                            amount: amount.toString()
                                          };
                                          setFgMaterialsIssuedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border-r"><input type="number" value={item.rate} readOnly className="w-full bg-gray-50 border-none rounded text-sm text-center" /></td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        value={item.amount}
                                        readOnly
                                        disabled
                                        placeholder="0.00"
                                        className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm text-center cursor-not-allowed"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <table className="min-w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">Item Name</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">HSN Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-r">UOM</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Quantity Produced</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Cost Alloc %</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 border-r">Rate</th>
                                  <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700">Amount</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-200">
                                {goodsProducedItems.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.itemCode}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...goodsProducedItems];
                                          newItems[index].itemCode = val;
                                          const selectedItem = items.find(i => i.item_code === val);
                                          if (selectedItem) {
                                            newItems[index].itemName = selectedItem.name || selectedItem.item_name;
                                            newItems[index].uom = selectedItem.uom || selectedItem.unit;
                                          }
                                          setGoodsProducedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                      >
                                        <option value="">Code</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.itemName}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...goodsProducedItems];
                                          newItems[index].itemName = val;
                                          const selectedItem = items.find(i => (i.name || i.item_name) === val);
                                          if (selectedItem) {
                                            newItems[index].itemCode = selectedItem.item_code;
                                            newItems[index].uom = selectedItem.uom || selectedItem.unit;
                                          }
                                          setGoodsProducedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                                      >
                                        <option value="">Item</option>
                                        {items.map(i => (
                                          <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <select
                                        value={item.uom || ''}
                                        onChange={(e) => {
                                          const newItems = [...goodsProducedItems];
                                          newItems[index].uom = e.target.value;
                                          setGoodsProducedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      >
                                        <option value="">Unit</option>
                                        {(() => {
                                          const selectedItem = items.find(i => i.item_code === item.itemCode);
                                          const units = [];
                                          if (selectedItem) {
                                            const u1 = selectedItem.uom || selectedItem.unit;
                                            const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                            if (u1) units.push(u1);
                                            if (u2 && u2 !== u1) units.push(u2);
                                          }
                                          return units.map(u => (
                                            <option key={u} value={u}>{u}</option>
                                          ));
                                        })()}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.quantityProduced}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...goodsProducedItems];
                                          const qty = Number(val || 0);
                                          const rate = Number(newItems[index].rate || 0);
                                          const amount = parseFloat((qty * rate).toFixed(2));

                                          newItems[index] = {
                                            ...newItems[index],
                                            quantityProduced: val,
                                            amount: amount.toString()
                                          };
                                          setGoodsProducedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.costAllocation}
                                        onChange={(e) => {
                                          const newItems = [...goodsProducedItems];
                                          newItems[index].costAllocation = e.target.value;
                                          setGoodsProducedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2 border-r">
                                      <input
                                        type="number"
                                        value={item.rate}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const newItems = [...goodsProducedItems];
                                          const rate = Number(val || 0);
                                          const qty = Number(newItems[index].quantityProduced || 0);
                                          const amount = parseFloat((qty * rate).toFixed(2));

                                          newItems[index] = {
                                            ...newItems[index],
                                            rate: val,
                                            amount: amount.toString()
                                          };
                                          setGoodsProducedItems(newItems);
                                        }}
                                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-2">
                                      <input
                                        type="number"
                                        value={item.amount}
                                        readOnly
                                        disabled
                                        placeholder="0.00"
                                        className="w-full bg-gray-100 border border-gray-300 rounded px-2 py-1 text-sm text-center cursor-not-allowed"
                                      />
                                    </td>
                                  </tr>
                                ))}
                                <tr>
                                  <td colSpan={7} className="p-2 text-center">
                                    <button
                                      onClick={() => setGoodsProducedItems([...goodsProducedItems, { itemCode: '', itemName: '', uom: '', quantityProduced: '', costAllocation: '100', rate: '', amount: '' }])}
                                      className="text-indigo-600 text-xs font-bold hover:underline"
                                    >
                                      + Add Product
                                    </button>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      {/* Posting Note */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5">
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-6 py-2 bg-white border border-black text-black font-semibold rounded hover:bg-gray-50 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                      </div>

                    </div>
                  )}

                  {issueSlipTab === 'consumption' && (
                    <div className="space-y-6">
                      {/* Consumption Type Selectors */}
                      <div className="bg-slate-50 border border-gray-200 rounded p-4 flex gap-8 items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="consumptionType"
                            checked={consumptionType === 'fixed_assets'}
                            onChange={() => {
                              setConsumptionType('fixed_assets');
                              setFixedAssetLedger('');
                            }}
                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <span className="text-xs font-bold text-gray-700 uppercase">Issued for Fixed Assets</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="consumptionType"
                            checked={consumptionType === 'daily_operations'}
                            onChange={() => {
                              setConsumptionType('daily_operations');
                              setExpenseLedger('');
                            }}
                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                          />
                          <span className="text-xs font-bold text-gray-700 uppercase">Issued for Daily Operations</span>
                        </label>
                      </div>

                      {/* Header Fields */}
                      <div className="grid grid-cols-3 gap-6">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">
                            ISSUE SLIP SERIES
                          </label>
                          <select
                            value={selectedIssueSlipSeriesName}
                            onChange={(e) => {
                              const seriesName = e.target.value;
                              setSelectedIssueSlipSeriesName(seriesName);
                              const series = issueSlipSeriesList.find(s => s.name === seriesName);
                              if (series) {
                                setIssueSlipNumber(series.preview || '');
                              } else {
                                setIssueSlipNumber('');
                              }
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                          >
                            <option value="">Select Series</option>
                            {issueSlipSeriesList.filter(s => (s.issueSlipType || '').toLowerCase() === 'consumption').map(s => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">
                            ISSUE SLIP NO
                          </label>
                          <input
                            type="text"
                            value={issueSlipNumber}
                            readOnly
                            placeholder="Auto/Manual"
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-slate-50 font-bold text-gray-500 cursor-not-allowed"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">
                              DATE
                            </label>
                            <input
                              type="date"
                              value={issueSlipDate}
                              onChange={(e) => setIssueSlipDate(e.target.value)}
                              max={new Date().toISOString().split('T')[0]}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">
                              TIME
                            </label>
                            <input
                              type="time"
                              value={issueSlipTime}
                              onChange={(e) => setIssueSlipTime(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Ledger and Location Row */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">
                            {consumptionType === 'fixed_assets' ? 'FIXED ASSET LEDGER' : 'EXPENSE LEDGER'}
                          </label>
                          <select
                            value={consumptionType === 'fixed_assets' ? fixedAssetLedger : expenseLedger}
                            onChange={(e) => consumptionType === 'fixed_assets' ? setFixedAssetLedger(e.target.value) : setExpenseLedger(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                          >
                            <option value="">{consumptionType === 'fixed_assets' ? 'Select Asset Account' : 'Select Expense Account'}</option>
                            {ledgers.filter(l => {
                              if (consumptionType === 'fixed_assets') {
                                return (l.ledger_group_name || '').toLowerCase().includes('fixed asset') ||
                                  (l.ledger_group_name || '').toLowerCase().includes('property, plant & equipment') ||
                                  (l.category || '').toLowerCase() === 'assets';
                              } else {
                                return (l.ledger_group_name || '').toLowerCase().includes('expense') ||
                                  (l.category || '').toLowerCase() === 'expenses';
                              }
                            }).map(l => (
                              <option key={l.id} value={l.name}>{l.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">
                            ISSUED FROM (LOCATION)
                          </label>
                          <select
                            value={goodsFromLocation}
                            onChange={(e) => setGoodsFromLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                          >
                            <option value="">Select location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Items Grid */}
                      <div className="space-y-4">
                      {/* Items Grid */}
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <h4 className="text-sm font-bold text-gray-700 uppercase tracking-tight">ITEMS</h4>
                          <button
                            onClick={handleAddIssueSlipItem}
                            className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold uppercase transition-colors"
                          >
                            + ADD ITEM
                          </button>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Code</th>
                                <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Name</th>
                                <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">UOM</th>
                                <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Qty</th>
                                <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Rate</th>
                                <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Value</th>
                                <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500">Action</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {issueSlipItems.map((item, index) => (
                                <tr key={index}>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemCode}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white"
                                    >
                                      <option value="">Select Code</option>
                                      {items.map(i => <option key={i.id} value={i.item_code}>{i.item_code}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemName}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white"
                                    >
                                      <option value="">Select Item</option>
                                      {items.map(i => <option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      value={item.uom || ''}
                                      readOnly
                                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] bg-slate-50 text-gray-500"
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)}
                                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500"
                                      placeholder="Qty"
                                    />
                                    {item.remainingQty !== undefined && parseFloat(item.quantity) > item.remainingQty && (
                                      <p className="text-[9px] text-red-500 mt-1">Stock: {item.remainingQty}</p>
                                    )}
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="number"
                                      value={item.rate}
                                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] bg-slate-50 text-gray-500"
                                      readOnly
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      value={`₹${(item.value || 0).toFixed(2)}`}
                                      readOnly
                                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] bg-slate-50 text-gray-800 font-bold"
                                    />
                                  </td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      onClick={() => handleRemoveIssueSlipItem(index)}
                                      className="text-red-500 hover:text-red-700 text-[11px] font-bold uppercase transition-colors"
                                    >
                                      REMOVE
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-end pt-2">
                          <div className="text-right">
                            <span className="text-xs font-bold text-gray-900">Total Value: ₹{getTotalValue().toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                      </div>

                      {/* Narration */}
                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-2 uppercase">Narration / Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          rows={2}
                          placeholder="Internal remarks..."
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-6 py-2 border border-gray-300 text-gray-700 rounded text-sm font-semibold hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-6 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700"
                        >
                          Post & Close
                        </button>
                      </div>
                    </div>
                  )}

                  {issueSlipTab !== 'outward' && issueSlipTab !== 'job-work' && issueSlipTab !== 'production' && issueSlipTab !== 'consumption' && issueSlipTab !== 'scrap' && (
                    <>
                      {/* Basic Details */}
                      <div className="grid grid-cols-4 gap-5">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Issue Slip No</label>
                          <input
                            type="text"
                            value={issueSlipNumber}
                            onChange={(e) => setIssueSlipNumber(e.target.value)}
                            placeholder="Auto/Manual"
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                          <input
                            type="date"
                            value={issueSlipDate}
                            onChange={(e) => setIssueSlipDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Time</label>
                          <input
                            type="time"
                            value={issueSlipTime}
                            onChange={(e) => setIssueSlipTime(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>

                      </div>

                      {/* Location Details */}
                      <div className="grid grid-cols-2 gap-5">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Goods Sent From</label>
                          <select
                            value={goodsFromLocation}
                            onChange={(e) => setGoodsFromLocation(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select location</option>
                            {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Goods Sent To</label>
                          {(issueSlipTab === 'inter-unit' || issueSlipTab === 'location-change') ? (
                            <select
                              value={goodsToLocation}
                              onChange={(e) => setGoodsToLocation(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">Select location</option>
                              {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                                <option key={loc.id} value={loc.id}>{loc.name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={goodsToLocation}
                              onChange={(e) => setGoodsToLocation(e.target.value)}
                              placeholder="Enter location"
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          )}
                        </div>
                      </div>

                      {/* Items Table */}
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <label className="block text-sm font-semibold text-gray-700">Items</label>
                          <button
                            onClick={handleAddIssueSlipItem}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-semibold"
                          >
                            + Add Item
                          </button>
                        </div>
                        <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                          <table className="min-w-full">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Code</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Item Name</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">UOM</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Qty</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Rate</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Value</th>
                                <th className="px-3 py-2 text-left text-sm font-semibold text-gray-700">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {issueSlipItems.map((item, index) => (
                                <tr key={index}>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemCode}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemCode', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="">Select Code</option>
                                      {items.map(i => (
                                        <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.itemName}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'itemName', e.target.value)}
                                      className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="">Select Item</option>
                                      {items.map(i => (
                                        <option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2">
                                    <input type="text" value={item.hsnCode || ''} readOnly className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-gray-50" />
                                  </td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={item.uom || ''}
                                      onChange={(e) => handleIssueSlipItemChange(index, 'uom', e.target.value)}
                                      className="w-20 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    >
                                      <option value="">Select</option>
                                      {(() => {
                                        const selectedItem = items.find(i => i.item_code === item.itemCode);
                                        const units = [];
                                        if (selectedItem) {
                                          const u1 = selectedItem.uom || selectedItem.unit;
                                          const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                          if (u1) units.push(u1);
                                          if (u2 && u2 !== u1) units.push(u2);
                                        }
                                        return units.map(u => (
                                          <option key={u} value={u}>{u}</option>
                                        ));
                                      })()}
                                    </select>
                                  </td>
                                  <td className="px-3 py-2"><input type="number" value={item.quantity} onChange={(e) => handleIssueSlipItemChange(index, 'quantity', e.target.value)} placeholder="Qty" className="w-full px-2 py-1 border border-gray-300 rounded text-sm" /></td>
                                  <td className="px-3 py-2"><input type="number" value={item.rate} readOnly className="w-full px-2 py-1 bg-gray-50 border border-gray-300 rounded text-sm cursor-not-allowed" /></td>
                                  <td className="px-3 py-2 text-sm font-medium">₹{item.value.toFixed(2)}</td>
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      onClick={() => handleRemoveIssueSlipItem(index)}
                                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                                    >
                                      Remove
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-2 text-right text-sm font-bold text-gray-900">
                          Total Value: ₹{getTotalValue().toFixed(2)}
                        </div>
                      </div>

                      {/* Posting Note */}
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">Posting Note</label>
                        <textarea
                          value={postingNote}
                          onChange={(e) => setPostingNote(e.target.value)}
                          placeholder="Enter posting note..."
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>

                      {/* Delivery Challan Details - For Inter-unit & Outward (Sales/Pur Return) */}
                      {issueSlipTab === 'inter-unit' && deliveryChallanFieldsJSX}

                      {/* Action Buttons */}
                      <div className="flex gap-3 justify-end border-t border-gray-200 pt-5">
                        {issueSlipTab !== 'location-change' && (
                          <>
                            <button
                              onClick={() => setShowDeliveryChallan(true)}
                              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm"
                            >
                              Delivery Challan
                            </button>
                            <button
                              onClick={() => setShowEWayBill(true)}
                              className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm"
                            >
                              E-Way Bill
                            </button>
                          </>
                        )}
                        <button
                          onClick={handleIssueSlipSubmit}
                          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold text-sm"
                        >
                          Post & Close
                        </button>
                        <button
                          onClick={() => setShowIssueSlipForm(false)}
                          className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm"
                        >
                          Cancel
                        </button>
                      </div>                    </>
                  )}

                  {/* ===== SCRAP TAB ===== */}
                  {issueSlipTab === 'scrap' && (
                    <div className="space-y-5">
                      {/* Scrap Sub-Type Selector */}
                      <div className="bg-slate-50 border border-gray-200 rounded p-3 flex gap-8 items-center">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="scrapSubType"
                            checked={scrapSubType === 'production'}
                            onChange={() => setScrapSubType('production')}
                            className="w-4 h-4 text-indigo-600 border-gray-300"
                          />
                          <span className="text-xs font-bold text-gray-700 uppercase">Production Scrap</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="scrapSubType"
                            checked={scrapSubType === 'other'}
                            onChange={() => setScrapSubType('other')}
                            className="w-4 h-4 text-indigo-600 border-gray-300"
                          />
                          <span className="text-xs font-bold text-gray-700 uppercase">Other Scrap</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="scrapSubType"
                            checked={scrapSubType === 'disposed'}
                            onChange={() => setScrapSubType('disposed')}
                            className="w-4 h-4 text-indigo-600 border-gray-300"
                          />
                          <span className="text-xs font-bold text-gray-700 uppercase">Scrap Disposed</span>
                        </label>
                      </div>

                      {/* ---- PRODUCTION SCRAP ---- */}
                      {scrapSubType === 'production' && (
                        <div className="space-y-5">
                          {/* Header Row 1: Series + Slip No */}
                          <div className="grid grid-cols-3 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Scrap Issue Slip Series</label>
                              <select
                                value={scrapProdSlipSeries}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setScrapProdSlipSeries(v);
                                  const s = issueSlipSeriesList.find((x: any) => x.name === v);
                                  setScrapProdSlipNo(s ? (s.preview || '') : '');
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              >
                                <option value="">Select Series</option>
                                {issueSlipSeriesList.filter((s: any) => (s.issueSlipType || '').toLowerCase().includes('scrap')).map((s: any) => (
                                  <option key={s.id} value={s.name}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Scrap Issue Slip No.</label>
                              <input
                                type="text"
                                value={scrapProdSlipNo}
                                readOnly
                                placeholder="Auto-generated"
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-slate-50 text-gray-500 cursor-not-allowed font-bold"
                              />
                            </div>
                          </div>

                          {/* Header Row 2: Date, Time, Issued To */}
                          <div className="grid grid-cols-4 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Date</label>
                              <input
                                type="date"
                                value={scrapProdDate}
                                onChange={(e) => setScrapProdDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Time</label>
                              <input
                                type="time"
                                value={scrapProdTime}
                                onChange={(e) => setScrapProdTime(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Issued To</label>
                              <select
                                value={scrapProdIssuedTo}
                                onChange={(e) => setScrapProdIssuedTo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                              >
                                <option value="">Select Location</option>
                                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Production Slip No */}
                          <div className="w-1/2">
                            <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Production Slip No.</label>
                            <select
                              value={scrapProdProductionSlipNo}
                              onChange={(e) => setScrapProdProductionSlipNo(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                            >
                              <option value="">Select Production Slip</option>
                              {[...materialIssueSlipOptions, ...processTransferSlipOptions].map((s: any, i) => (
                                <option key={i} value={s.issue_slip_no}>{s.issue_slip_no}</option>
                              ))}
                            </select>
                          </div>

                          {/* Items Grid */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Items</h4>
                              <button
                                onClick={() => setScrapProdItems([...scrapProdItems, { itemCode: '', itemName: '', uom: '', quantityGenerated: '' }])}
                                className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold uppercase"
                              >+ ADD ITEM</button>
                            </div>
                            <div className="overflow-x-auto border border-gray-200 rounded">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Code</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Name</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">UOM</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Qty Generated</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {scrapProdItems.map((item, idx) => {
                                    const scrapItems = items.filter(i => (i.category_name || '').toLowerCase().includes('scrap'));
                                    return (
                                      <tr key={idx}>
                                        <td className="px-3 py-2">
                                          <select value={item.itemCode} onChange={(e) => {
                                            const v = e.target.value; const ni = [...scrapProdItems]; ni[idx].itemCode = v;
                                            const si = scrapItems.find(i => i.item_code === v);
                                            if (si) { ni[idx].itemName = si.name || si.item_name; ni[idx].uom = si.uom || si.unit; }
                                            setScrapProdItems(ni);
                                          }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                            <option value="">Select Code</option>
                                            {scrapItems.map(i => <option key={i.id} value={i.item_code}>{i.item_code}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <select value={item.itemName} onChange={(e) => {
                                            const v = e.target.value; const ni = [...scrapProdItems]; ni[idx].itemName = v;
                                            const si = scrapItems.find(i => (i.name || i.item_name) === v);
                                            if (si) { ni[idx].itemCode = si.item_code; ni[idx].uom = si.uom || si.unit; }
                                            setScrapProdItems(ni);
                                          }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                            <option value="">Select Item</option>
                                            {scrapItems.map(i => <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <select value={item.uom || ''} onChange={(e) => { const ni = [...scrapProdItems]; ni[idx].uom = e.target.value; setScrapProdItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                            <option value="">Unit</option>
                                            {(() => { const si = scrapItems.find(i => i.item_code === item.itemCode); const us: string[] = []; if (si) { const u1 = si.uom || si.unit; const u2 = si.alternate_uom || si.alternative_unit; if (u1) us.push(u1); if (u2 && u2 !== u1) us.push(u2); } return us.map(u => <option key={u} value={u}>{u}</option>); })()}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <input type="number" value={item.quantityGenerated} onChange={(e) => { const ni = [...scrapProdItems]; ni[idx].quantityGenerated = e.target.value; setScrapProdItems(ni); }} placeholder="Qty" className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500" />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <button onClick={() => setScrapProdItems(scrapProdItems.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 text-[11px] font-bold uppercase">REMOVE</button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Posting Note */}
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-2 uppercase">Posting Note</label>
                            <textarea value={scrapProdPostingNote} onChange={(e) => setScrapProdPostingNote(e.target.value)} rows={2} placeholder="Internal remarks..." className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                            <button onClick={() => setShowIssueSlipForm(false)} className="px-6 py-2 border border-gray-300 text-gray-700 rounded text-sm font-semibold hover:bg-gray-50">Cancel</button>
                            <button onClick={handleIssueSlipSubmit} className="px-6 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700">Post & Close</button>
                          </div>
                        </div>
                      )}

                      {/* ---- OTHER SCRAP ---- */}
                      {scrapSubType === 'other' && (
                        <div className="space-y-5">
                          {/* Series + Slip No */}
                          <div className="grid grid-cols-3 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Scrap Issue Slip Series</label>
                              <select value={scrapOtherSlipSeries} onChange={(e) => { const v = e.target.value; setScrapOtherSlipSeries(v); const s = issueSlipSeriesList.find((x: any) => x.name === v); setScrapOtherSlipNo(s ? (s.preview || '') : ''); }} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                                <option value="">Select Series</option>
                                {issueSlipSeriesList.filter((s: any) => (s.issueSlipType || '').toLowerCase().includes('scrap')).map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Scrap Issue Slip No.</label>
                              <input type="text" value={scrapOtherSlipNo} readOnly placeholder="Auto-generated" className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-slate-50 text-gray-500 cursor-not-allowed font-bold" />
                            </div>
                          </div>

                          {/* Date, Time, Issued From, Issued To */}
                          <div className="grid grid-cols-4 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Date</label>
                              <input type="date" value={scrapOtherDate} onChange={(e) => setScrapOtherDate(e.target.value)} max={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Time</label>
                              <input type="time" value={scrapOtherTime} onChange={(e) => setScrapOtherTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Issued From</label>
                              <select value={scrapOtherIssuedFrom} onChange={(e) => setScrapOtherIssuedFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                                <option value="">Select Location</option>
                                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Issued To</label>
                              <select value={scrapOtherIssuedTo} onChange={(e) => setScrapOtherIssuedTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                                <option value="">Select Location</option>
                                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Items Scrapped Grid */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Items Scrapped</h4>
                              <button onClick={() => setScrapOtherItemsScrapped([...scrapOtherItemsScrapped, { itemCode: '', itemName: '', uom: '', quantity: '' }])} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold uppercase">+ ADD ITEM</button>
                            </div>
                            <div className="overflow-x-auto border border-gray-200 rounded">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Code</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Name</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">UOM</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Quantity</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {scrapOtherItemsScrapped.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2">
                                        <select value={item.itemCode} onChange={(e) => { const v = e.target.value; const ni = [...scrapOtherItemsScrapped]; ni[idx].itemCode = v; const si = items.find(i => i.item_code === v); if (si) { ni[idx].itemName = si.name || si.item_name; ni[idx].uom = si.uom || si.unit; } setScrapOtherItemsScrapped(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">Select Code</option>
                                          {items.map(i => <option key={i.id} value={i.item_code}>{i.item_code}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <select value={item.itemName} onChange={(e) => { const v = e.target.value; const ni = [...scrapOtherItemsScrapped]; ni[idx].itemName = v; const si = items.find(i => (i.name || i.item_name) === v); if (si) { ni[idx].itemCode = si.item_code; ni[idx].uom = si.uom || si.unit; } setScrapOtherItemsScrapped(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">Select Item</option>
                                          {items.map(i => <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <select value={item.uom || ''} onChange={(e) => { const ni = [...scrapOtherItemsScrapped]; ni[idx].uom = e.target.value; setScrapOtherItemsScrapped(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">Unit</option>
                                          {(() => { const si = items.find(i => i.item_code === item.itemCode); const us: string[] = []; if (si) { const u1 = si.uom || si.unit; const u2 = si.alternate_uom || si.alternative_unit; if (u1) us.push(u1); if (u2 && u2 !== u1) us.push(u2); } return us.map(u => <option key={u} value={u}>{u}</option>); })()}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" value={item.quantity} onChange={(e) => { const ni = [...scrapOtherItemsScrapped]; ni[idx].quantity = e.target.value; setScrapOtherItemsScrapped(ni); }} placeholder="Qty" className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500" />
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <button onClick={() => setScrapOtherItemsScrapped(scrapOtherItemsScrapped.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 text-[11px] font-bold uppercase">REMOVE</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Resulting Scrap Grid */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Resulting Scrap</h4>
                              <button onClick={() => setScrapOtherResultingItems([...scrapOtherResultingItems, { itemCode: '', itemName: '', uom: '', quantity: '', rate: '', value: 0 }])} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold uppercase">+ ADD ITEM</button>
                            </div>
                            <div className="overflow-x-auto border border-gray-200 rounded">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Code</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Name</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">UOM</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Quantity</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Rate</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Value</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {scrapOtherResultingItems.map((item, idx) => {
                                    const scrapItems = items.filter(i => (i.category_name || '').toLowerCase().includes('scrap'));
                                    return (
                                      <tr key={idx}>
                                        <td className="px-3 py-2">
                                          <select value={item.itemCode} onChange={(e) => { const v = e.target.value; const ni = [...scrapOtherResultingItems]; ni[idx].itemCode = v; const si = scrapItems.find(i => i.item_code === v); if (si) { ni[idx].itemName = si.name || si.item_name; ni[idx].uom = si.uom || si.unit; } setScrapOtherResultingItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                            <option value="">Select Code</option>
                                            {scrapItems.map(i => <option key={i.id} value={i.item_code}>{i.item_code}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <select value={item.itemName} onChange={(e) => { const v = e.target.value; const ni = [...scrapOtherResultingItems]; ni[idx].itemName = v; const si = scrapItems.find(i => (i.name || i.item_name) === v); if (si) { ni[idx].itemCode = si.item_code; ni[idx].uom = si.uom || si.unit; } setScrapOtherResultingItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                            <option value="">Select Item</option>
                                            {scrapItems.map(i => <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>)}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <select value={item.uom || ''} onChange={(e) => { const ni = [...scrapOtherResultingItems]; ni[idx].uom = e.target.value; setScrapOtherResultingItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                            <option value="">Unit</option>
                                            {(() => { const si = scrapItems.find(i => i.item_code === item.itemCode); const us: string[] = []; if (si) { const u1 = si.uom || si.unit; const u2 = si.alternate_uom || si.alternative_unit; if (u1) us.push(u1); if (u2 && u2 !== u1) us.push(u2); } return us.map(u => <option key={u} value={u}>{u}</option>); })()}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2">
                                          <input type="number" value={item.quantity} onChange={(e) => { const ni = [...scrapOtherResultingItems]; const qty = parseFloat(e.target.value) || 0; const rate = parseFloat(ni[idx].rate) || 0; ni[idx].quantity = e.target.value; ni[idx].value = parseFloat((qty * rate).toFixed(2)); setScrapOtherResultingItems(ni); }} placeholder="Qty" className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500" />
                                        </td>
                                        <td className="px-3 py-2">
                                          <input type="number" value={item.rate} onChange={(e) => { const ni = [...scrapOtherResultingItems]; const rate = parseFloat(e.target.value) || 0; const qty = parseFloat(ni[idx].quantity) || 0; ni[idx].rate = e.target.value; ni[idx].value = parseFloat((qty * rate).toFixed(2)); setScrapOtherResultingItems(ni); }} placeholder="Rate" className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500" />
                                        </td>
                                        <td className="px-3 py-2">
                                          <input type="text" value={`₹${(item.value || 0).toFixed(2)}`} readOnly className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] bg-slate-50 text-gray-800 font-bold" />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          <button onClick={() => setScrapOtherResultingItems(scrapOtherResultingItems.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 text-[11px] font-bold uppercase">REMOVE</button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Posting Note */}
                          <div>
                            <label className="block text-[11px] font-bold text-gray-600 mb-2 uppercase">Posting Note</label>
                            <textarea value={scrapOtherPostingNote} onChange={(e) => setScrapOtherPostingNote(e.target.value)} rows={2} placeholder="Internal remarks..." className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                            <button onClick={() => setShowIssueSlipForm(false)} className="px-6 py-2 border border-gray-300 text-gray-700 rounded text-sm font-semibold hover:bg-gray-50">Cancel</button>
                            <button onClick={handleIssueSlipSubmit} className="px-6 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700">Post & Close</button>
                          </div>
                        </div>
                      )}

                      {/* ---- SCRAP DISPOSED ---- */}
                      {scrapSubType === 'disposed' && (
                        <div className="space-y-5">
                          {/* Series + Slip No */}
                          <div className="grid grid-cols-3 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Scrap Issue Slip Series</label>
                              <select value={scrapDispSlipSeries} onChange={(e) => { const v = e.target.value; setScrapDispSlipSeries(v); const s = issueSlipSeriesList.find((x: any) => x.name === v); setScrapDispSlipNo(s ? (s.preview || '') : ''); }} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                                <option value="">Select Series</option>
                                {issueSlipSeriesList.filter((s: any) => (s.issueSlipType || '').toLowerCase().includes('scrap')).map((s: any) => <option key={s.id} value={s.name}>{s.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Scrap Disposal Slip No.</label>
                              <input type="text" value={scrapDispSlipNo} readOnly placeholder="Auto-generated" className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-slate-50 text-gray-500 cursor-not-allowed font-bold" />
                            </div>
                          </div>

                          {/* Date, Time, Issued From */}
                          <div className="grid grid-cols-4 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Date</label>
                              <input type="date" value={scrapDispDate} onChange={(e) => setScrapDispDate(e.target.value)} max={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Time</label>
                              <input type="time" value={scrapDispTime} onChange={(e) => setScrapDispTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white" />
                            </div>
                            <div className="col-span-2">
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Issued From</label>
                              <select value={scrapDispIssuedFrom} onChange={(e) => setScrapDispIssuedFrom(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                                <option value="">Select Location</option>
                                {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                              </select>
                            </div>
                          </div>

                          {/* Items Grid */}
                          <div className="space-y-2">
                            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-tight">Items</h4>
                              <button onClick={() => setScrapDispItems([...scrapDispItems, { itemCode: '', itemName: '', uom: '', quantityDisposed: '', rate: '', value: 0 }])} className="text-indigo-600 hover:text-indigo-800 text-[11px] font-bold uppercase">+ ADD ITEM</button>
                            </div>
                            <div className="overflow-x-auto border border-gray-200 rounded">
                              <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Code</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Item Name</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">UOM</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Qty Disposed</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Rate</th>
                                    <th className="px-3 py-3 text-left text-[11px] font-bold text-gray-500">Value</th>
                                    <th className="px-3 py-3 text-center text-[11px] font-bold text-gray-500">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {scrapDispItems.map((item, idx) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2">
                                        <select value={item.itemCode} onChange={(e) => { const v = e.target.value; const ni = [...scrapDispItems]; ni[idx].itemCode = v; const si = items.find(i => i.item_code === v); if (si) { ni[idx].itemName = si.name || si.item_name; ni[idx].uom = si.uom || si.unit; } setScrapDispItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">Select Code</option>
                                          {items.map(i => <option key={i.id} value={i.item_code}>{i.item_code}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <select value={item.itemName} onChange={(e) => { const v = e.target.value; const ni = [...scrapDispItems]; ni[idx].itemName = v; const si = items.find(i => (i.name || i.item_name) === v); if (si) { ni[idx].itemCode = si.item_code; ni[idx].uom = si.uom || si.unit; } setScrapDispItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">Select Item</option>
                                          {items.map(i => <option key={i.id} value={i.name || i.item_name}>{i.name || i.item_name}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <select value={item.uom || ''} onChange={(e) => { const ni = [...scrapDispItems]; ni[idx].uom = e.target.value; setScrapDispItems(ni); }} className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500 bg-white">
                                          <option value="">Unit</option>
                                          {(() => { const si = items.find(i => i.item_code === item.itemCode); const us: string[] = []; if (si) { const u1 = si.uom || si.unit; const u2 = si.alternate_uom || si.alternative_unit; if (u1) us.push(u1); if (u2 && u2 !== u1) us.push(u2); } return us.map(u => <option key={u} value={u}>{u}</option>); })()}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" value={item.quantityDisposed} onChange={(e) => { const ni = [...scrapDispItems]; const qty = parseFloat(e.target.value) || 0; const rate = parseFloat(ni[idx].rate) || 0; ni[idx].quantityDisposed = e.target.value; ni[idx].value = parseFloat((qty * rate).toFixed(2)); setScrapDispItems(ni); }} placeholder="Qty" className="w-full px-2 py-1.5 border border-gray-300 rounded text-[11px] focus:ring-1 focus:ring-indigo-500" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="number" value={item.rate} readOnly placeholder="Auto" className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] bg-slate-50 text-gray-500 cursor-not-allowed" />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input type="text" value={`₹${(item.value || 0).toFixed(2)}`} readOnly className="w-full px-2 py-1.5 border border-gray-200 rounded text-[11px] bg-slate-50 text-gray-800 font-bold" />
                                      </td>
                                      <td className="px-3 py-2 text-center">
                                        <button onClick={() => setScrapDispItems(scrapDispItems.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 text-[11px] font-bold uppercase">REMOVE</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex justify-end pt-1">
                              <span className="text-xs font-bold text-gray-900">Total Value: ₹{scrapDispItems.reduce((s, i) => s + (i.value || 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>

                          {/* Disposal Details */}
                          <div className="grid grid-cols-2 gap-5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Reason for Disposal</label>
                              <textarea value={scrapDispReasonForDisposal} onChange={(e) => setScrapDispReasonForDisposal(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Method of Disposal</label>
                              <textarea value={scrapDispMethodOfDisposal} onChange={(e) => setScrapDispMethodOfDisposal(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-5 items-end">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Disposal Agency</label>
                              <select value={scrapDispAgency} onChange={(e) => setScrapDispAgency(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                                <option value="">Select Vendor</option>
                                {vendors.map((v: any) => <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-600 mb-2 uppercase">Certificate of Disposal</label>
                              <label className="cursor-pointer inline-flex items-center gap-2 bg-white border-2 border-dashed border-indigo-200 rounded px-4 py-2 text-xs text-indigo-600 font-semibold hover:bg-indigo-50 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                {scrapDispCertificate ? scrapDispCertificate.name : 'Upload Certificate'}
                                <input type="file" className="hidden" onChange={(e) => setScrapDispCertificate(e.target.files?.[0] || null)} accept="image/*,application/pdf" />
                              </label>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
                            <button onClick={() => setShowIssueSlipForm(false)} className="px-6 py-2 border border-gray-300 text-gray-700 rounded text-sm font-semibold hover:bg-gray-50">Cancel</button>
                            <button onClick={handleIssueSlipSubmit} className="px-6 py-2 bg-indigo-600 text-white rounded text-sm font-semibold hover:bg-indigo-700">Post & Close</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {/* ===== END SCRAP TAB ===== */}

                </div>
              </div>
            </div>
          )
        }

        {/* GRN Form Modal */}
        {
          showGRNForm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2">
              <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 w-full h-[90vh] max-w-7xl flex flex-col">
                <div className="bg-white border-b border-gray-200 p-5 flex justify-between items-center shrink-0">
                  <h3 className="text-2xl font-bold text-gray-900">Goods Receipt Note</h3>
                  <button onClick={() => setShowGRNForm(false)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
                </div>

                <div className="p-8 space-y-6 overflow-y-auto flex-1">
                  {/* Radio Buttons */}
                  <div className="flex gap-6 mb-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="grnType"
                        value="purchases"
                        checked={grnType === 'purchases'}
                        onChange={(e) => setGrnType(e.target.value)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 font-medium">Purchases</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="grnType"
                        value="sales_return"
                        checked={grnType === 'sales_return'}
                        onChange={(e) => setGrnType(e.target.value)}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-gray-700 font-medium">Sales Return</span>
                    </label>
                  </div>

                  {/* Common Fields */}
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Date</label>
                      <input type="date" value={grnDate} onChange={(e) => setGrnDate(e.target.value)} max={new Date().toISOString().split('T')[0]} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Time</label>
                      <input type="time" value={grnTime} onChange={(e) => setGrnTime(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Location</label>
                      <select value={grnLocation} onChange={(e) => setGrnLocation(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="">Select Location</option>
                        {locations.filter(l => l.location_type === 'company_premises').map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Conditional Fields Based on Type */}
                  {grnType === 'purchases' ? (
                    // PURCHASES FORM
                    <>
                      {/* GRN Series Name */}
                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">GRN Series Name</label>
                          <select
                            value={grnSelectedSeriesId ?? ''}
                            onChange={(e) => handleGrnSeriesChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select GRN Series</option>
                            {grnSeriesList.map((series: any) => (
                              <option key={series.id} value={series.id}>{series.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            GRN No.
                          </label>
                          <input
                            type="text"
                            value={grnNumber}
                            onChange={(e) => setGrnNumber(e.target.value)}
                            readOnly={!!grnSelectedSeriesId}
                            className={`w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${grnSelectedSeriesId ? 'bg-gray-50 text-indigo-700 font-semibold cursor-not-allowed' : ''}`}
                            placeholder="Enter GRN No. or select a series above"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Vendor Name</label>
                          <select value={grnVendorName} onChange={(e) => handleGrnVendorChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">Select Vendor</option>
                            {vendors.map(vendor => (
                              <option key={vendor.id} value={vendor.vendor_name}>{vendor.vendor_name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
                          <select value={grnBranch} onChange={(e) => handleGrnBranchChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">Select Branch</option>
                            {grnBranchOptions.map((branch, index) => (
                              <option key={branch.id || index} value={branch.reference_name}>
                                {branch.reference_name || branch.trade_name || 'Main'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                          <textarea value={grnAddress} readOnly rows={2} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed" />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                          <input type="text" value={grnGstin} readOnly className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div className="flex flex-col gap-2">
                          <label className="block text-sm font-semibold text-gray-700">Purchase Order No.</label>
                          <div className="flex items-start gap-4">
                            <div className="w-1/2">
                              <MultiSelectDropdown
                                options={grnReferenceNoOptions.map((po: any) => ({
                                  value: po.po_number,
                                  label: po.po_number
                                }))}
                                selectedValues={grnSelectedPOs}
                                onChange={handleGrnReferenceNoChange}
                                placeholder="Select PO(s)"
                              />
                            </div>
                            <div className="w-1/2 flex flex-wrap gap-2 pt-1">
                              {grnSelectedPOs.map((po, idx) => (
                                <span 
                                  key={po} 
                                  className={`px-2 py-1 rounded text-xs font-bold text-white shadow-sm border border-black/10`}
                                  style={{ 
                                    backgroundColor: [
                                      '#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED'
                                    ][idx % 6] 
                                  }}
                                >
                                  {po}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Document</label>
                          <div className="flex items-center space-x-4">
                            <label className="cursor-pointer bg-white border border-gray-300 rounded px-3 py-1.5 text-xs text-indigo-600 font-semibold hover:bg-indigo-50 flex items-center space-x-2 transition-colors border-dashed border-2 border-indigo-200">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              <span>{grnDocument ? 'Change Document' : 'Upload Document'}</span>
                              <input type="file" className="hidden" onChange={handleGrnDocumentChange} accept="image/*,application/pdf" />
                            </label>
                            {grnDocumentPreview && (
                              <div className="relative group flex items-center bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-100 shadow-sm hover:shadow-md transition-all cursor-pointer" onClick={() => setIsGrnDocumentModalOpen(true)}>
                                {grnDocument?.type.startsWith('image/') ? (
                                  <div className="relative">
                                    <img src={grnDocumentPreview} alt="Preview" className="h-9 w-9 object-cover rounded-md border border-indigo-200" />
                                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 flex items-center justify-center rounded-md transition-all">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="h-9 w-9 flex items-center justify-center bg-white rounded-md border border-indigo-200 group-hover:bg-indigo-600 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500 group-hover:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                  </div>
                                )}
                                <div className="ml-3 flex flex-col">
                                  <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Preview Document</span>
                                  <span className="text-xs text-gray-700 font-semibold max-w-[120px] truncate leading-tight">{grnDocument?.name}</span>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setGrnDocument(null); setGrnDocumentPreview(null); }}
                                  className="ml-3 p-1.5 bg-white text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full shadow-sm transition-all border border-gray-100"
                                  title="Remove Document"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>{/* Empty col to balance grid */}</div>
                      </div>
                    </>
                  ) : (
                    // SALES RETURN FORM
                    <>
                      {/* GRN Series Name + GRN No. for Sales Return */}
                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">GRN Series Name</label>
                          <select
                            value={grnSelectedSeriesId ?? ''}
                            onChange={(e) => handleGrnSeriesChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select GRN Series</option>
                            {grnSeriesList.map((series: any) => (
                              <option key={series.id} value={series.id}>{series.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">
                            GRN No.
                          </label>
                          <input
                            type="text"
                            value={grnNumber}
                            onChange={(e) => setGrnNumber(e.target.value)}
                            readOnly={!!grnSelectedSeriesId}
                            className={`w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${grnSelectedSeriesId ? 'bg-gray-50 text-indigo-700 font-semibold cursor-not-allowed' : ''}`}
                            placeholder="Enter GRN No. or select a series above"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name</label>
                          <select value={grnCustomerName} onChange={(e) => handleGrnCustomerChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">Select Customer</option>
                            {customers.map(customer => (
                              <option key={customer.id} value={customer.customer_name}>{customer.customer_name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Branch</label>
                          <select value={grnBranch} onChange={(e) => handleGrnBranchChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value="">Select Branch</option>
                            {grnBranchOptions.map((branch, index) => (
                              <option key={branch.id || index} value={branch.reference_name}>
                                {branch.reference_name || 'Main'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Address</label>
                          <textarea
                            value={grnAddress}
                            readOnly
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                          <input
                            type="text"
                            value={grnGstin}
                            readOnly
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-100 cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-5 mt-4">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Sales Voucher No.</label>
                          <MultiSelectDropdown
                            options={grnReferenceNoOptions.map((sv: any) => ({
                              value: sv.sales_invoice_number || String(sv.id),
                              label: sv.sales_invoice_number || `Voucher #${sv.id}`
                            }))}
                            selectedValues={grnSelectedSalesVouchers}
                            onChange={setGrnSelectedSalesVouchers}
                            placeholder="Select Sales Voucher(s)"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-2">Debit Note No.</label>
                          <input type="text" value={grnSecondaryRefNo} onChange={(e) => setGrnSecondaryRefNo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Items Table */}
                  <div className="mt-6">
                    <h4 className="text-lg font-bold text-gray-800 mb-3 block border-b border-gray-200 pb-2">Items</h4>
                    <div className="overflow-x-auto border border-gray-300 rounded text-sm">
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Item Code</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Item Name</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">UOM</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">{grnType === 'purchases' ? 'PO Qty' : 'Sales Voucher Qty'}</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">{grnType === 'purchases' ? 'Inv Qty' : 'Debit Note Qty'}</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Received</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Accepted</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Rejected</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Shrt/Excess</th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {grnItems.map((item, index) => {
                            // Find color index for the source PO
                            const poIdx = item.po_number ? grnSelectedPOs.indexOf(item.po_number) : -1;
                            const colors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED'];
                            const bgColor = poIdx > -1 ? `${colors[poIdx % 6]}15` : 'transparent'; // 15% opacity

                            return (
                              <tr key={index} style={{ backgroundColor: bgColor }}>
                                <td className="px-3 py-2">
                                  <select
                                    value={item.itemCode || ''}
                                    onChange={(e) => handleGrnItemChange(index, 'itemCode', e.target.value)}
                                    className="w-32 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">Select Code</option>
                                    {items.map(i => (
                                      <option key={i.id} value={i.item_code}>{i.item_code}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={item.itemName || ''}
                                    onChange={(e) => handleGrnItemChange(index, 'itemName', e.target.value)}
                                    className="w-48 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">Select Item</option>
                                    {items.map(i => (
                                      <option key={i.id} value={i.item_name || i.name}>{i.item_name || i.name}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <select
                                    value={item.uom || ''}
                                    onChange={(e) => {
                                      const newItems = [...grnItems];
                                      newItems[index].uom = e.target.value;
                                      setGrnItems(newItems);
                                    }}
                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  >
                                    <option value="">Select</option>
                                    {(() => {
                                      const selectedItem = items.find(i => i.item_code === item.itemCode);
                                      const units = [];
                                      if (selectedItem) {
                                        const u1 = selectedItem.uom || selectedItem.unit;
                                        const u2 = selectedItem.alternate_uom || selectedItem.alternative_unit;
                                        if (u1) units.push(u1);
                                        if (u2 && u2 !== u1) units.push(u2);
                                      }
                                      return units.map(u => (
                                        <option key={u} value={u}>{u}</option>
                                      ));
                                    })()}
                                  </select>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={item.refQty || ''}
                                    readOnly
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-xs bg-gray-100 cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={item.secondaryQty || ''}
                                    onChange={(e) => handleGrnItemChange(index, 'secondaryQty', e.target.value)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={item.receivedQty || ''}
                                    onChange={(e) => handleGrnItemChange(index, 'receivedQty', e.target.value)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={item.acceptedQty || ''}
                                    onChange={(e) => handleGrnItemChange(index, 'acceptedQty', e.target.value)}
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={item.rejectedQty || ''}
                                    readOnly
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-xs bg-gray-100 cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="number"
                                    value={item.shortExcessQty || ''}
                                    readOnly
                                    className="w-16 px-2 py-1 border border-gray-300 rounded text-xs bg-gray-100 cursor-not-allowed"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={item.remarks || ''}
                                    onChange={(e) => handleGrnItemChange(index, 'remarks', e.target.value)}
                                    className="w-32 px-2 py-1 border border-gray-300 rounded text-xs"
                                  />
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <button
                                    onClick={() => handleRemoveGrnItem(index)}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="p-2 border-t border-gray-200">
                        <button
                          type="button"
                          onClick={handleAddGrnItem}
                          className="text-indigo-600 hover:text-indigo-900 text-sm font-medium flex items-center"
                        >
                          + ADD ITEM
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Additional Fields for Sales Return */}
                  {grnType === 'sales_return' && (
                    <div className="mt-4">
                      <label className="block text-sm font-bold text-gray-700 mb-2">Reasons for Return (mandatory) <span className="text-red-500">*</span></label>
                      <textarea value={grnReason} onChange={(e) => setGrnReason(e.target.value)} rows={3} className="w-full px-3 py-2 border-2 border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Enter reason..." />
                    </div>
                  )}

                  <div className="mt-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Posting Note</label>
                    <textarea value={grnPostingNote} onChange={(e) => setGrnPostingNote(e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>

                  <div className="flex gap-3 justify-end border-t border-gray-200 pt-5 mt-4">
                    <button onClick={handleGRNSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-semibold text-sm">Post & Close</button>
                    <button onClick={() => { setShowGRNForm(false); setGrnSelectedSeriesId(null); setGrnNumber(''); setGrnDocument(null); setGrnDocumentPreview(null); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 font-semibold text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* Delivery Challan Modal - Printable Preview */}
        {
          showDeliveryChallan && (() => {
            const consignorLocation = locations.find(loc => loc.id === itemLocation || loc.id === Number(goodsFromLocation));
            const consignorName = consignorLocation?.name || "YOUR COMPANY NAME";
            const consignorAddress = consignorLocation ?
              [consignorLocation.address_line1, consignorLocation.address_line2, consignorLocation.city, consignorLocation.pincode]
                .filter(Boolean).join(', ') : "Company Address Not Available";
            const consignorGstin = consignorLocation?.gstin || "N/A";
            const consignorState = consignorLocation?.state || "N/A";
            const consignorStateCode = consignorLocation?.state_code || "";

            const consigneeName = issueSlipTab === 'job-work' ? outwardVendorName :
              (outwardType === 'sales' ? outwardCustomerName : outwardVendorName) || "N/A";
            const consigneeAddress = outwardAddress || "Address Not Available";
            const consigneeGstin = outwardGstin || "N/A";
            const consigneeState = "N/A";
            const consigneeStateCode = outwardGstin ? outwardGstin.substring(0, 2) : "";

            return (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 print:p-0">
                <div className="bg-white rounded shadow-lg w-full max-w-4xl max-h-[95vh] flex flex-col print:max-w-none print:max-h-none print:w-full print:h-full print:shadow-none print:rounded-none">

                  {/* Modal Header - Hidden in Print */}
                  <div className="flex justify-between items-center p-4 border-b border-gray-200 print:hidden">
                    <h3 className="text-xl font-bold text-gray-800">Delivery Challan Preview</h3>
                    <div className="flex gap-3">
                      <button
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium text-sm flex items-center gap-2"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Print
                      </button>
                      <button
                        onClick={() => setShowDeliveryChallan(false)}
                        className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  {/* Printable Content */}
                  <div className="p-8 overflow-y-auto print:p-0 print:overflow-visible flex-1 bg-white text-black" id="delivery-challan-print">

                    {/* Header Section */}
                    <div className="text-center mb-8">
                      <h1 className="text-2xl font-bold uppercase underline mb-2 tracking-wide">Delivery Challan</h1>
                      <p className="text-sm text-gray-600">(See Rule 55 of CGST Rules, 2017)</p>
                    </div>

                    {/* Company & Consignee Info */}
                    <div className="grid grid-cols-2 gap-0 border border-black mb-6">
                      {/* Left: Consignor (Sender) */}
                      <div className="p-4 border-r border-black">
                        <h4 className="font-bold text-sm text-gray-600 mb-1 uppercase">Consignor (Issued From)</h4>
                        <p className="font-bold text-lg">{consignorName}</p>
                        <p className="whitespace-pre-wrap text-sm">{consignorAddress}</p>
                        <p className="text-sm mt-2"><span className="font-semibold">GSTIN:</span> {consignorGstin}</p>
                        <p className="text-sm"><span className="font-semibold">State:</span> {consignorState} {consignorStateCode ? `(${consignorStateCode})` : ''}</p>
                      </div>

                      {/* Right: Consignee (Receiver) */}
                      <div className="p-4">
                        <h4 className="font-bold text-sm text-gray-600 mb-1 uppercase">Consignee (Issued To)</h4>
                        <p className="font-bold text-lg">{consigneeName}</p>
                        <p className="whitespace-pre-wrap text-sm">{consigneeAddress}</p>
                        <p className="text-sm mt-2"><span className="font-semibold">GSTIN:</span> {consigneeGstin}</p>
                        <p className="text-sm"><span className="font-semibold">State:</span> {consigneeState} {consigneeStateCode ? `(${consigneeStateCode})` : ''}</p>
                      </div>
                    </div>

                    {/* Document Details grid */}
                    <div className="grid grid-cols-2 gap-0 border border-black border-t-0 mb-6 -mt-6">
                      <div className="grid grid-cols-2">
                        <div className="p-2 border-r border-b border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Challan No.</span>
                          <span className="font-bold">{issueSlipNumber || "-"}</span>
                        </div>
                        <div className="p-2 border-r border-b border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Date</span>
                          <span className="font-bold">{dispatchDate || issueSlipDate || "-"}</span>
                        </div>
                        <div className="p-2 border-r border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Dispatch Doc No.</span>
                          <span className="font-bold">-</span>
                        </div>
                        <div className="p-2 border-r border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Mode of Transport</span>
                          <span className="font-bold">{modeOfTransport || "-"}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2">
                        <div className="p-2 border-r border-b border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Transporter Name</span>
                          <span className="font-bold">{transporterName || "-"}</span>
                        </div>
                        <div className="p-2 border-b border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Vehicle No.</span>
                          <span className="font-bold">{vehicleNo || "-"}</span>
                        </div>
                        <div className="p-2 border-r border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">LR/GR No.</span>
                          <span className="font-bold">{lrGrConsignment || "-"}</span>
                        </div>
                        <div className="p-2 border-black">
                          <span className="block text-xs font-semibold text-gray-500 uppercase">Total Boxes</span>
                          <span className="font-bold">{outwardTotalBoxes || "-"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Additional Transport Details for Air/Sea */}
                    {(modeOfTransport === 'Air' || modeOfTransport === 'Sea') && (
                      <div className="mb-6 border border-black border-t-0 -mt-6 text-sm">
                        {/* Upto Port */}
                        <div className="bg-gray-100 p-1 px-2 border-b border-black font-bold text-xs uppercase text-center">Upto Port Details</div>
                        <div className="grid grid-cols-4 border-b border-black">
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">SB No.</span>
                            <span className="font-bold">{uptoPortShippingBillNo || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">SB Date</span>
                            <span className="font-bold">{uptoPortShippingBillDate || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Port Code</span>
                            <span className="font-bold">{uptoPortShipPortCode || "-"}</span>
                          </div>
                          <div className="p-2">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Origin</span>
                            <span className="font-bold">{uptoPortOrigin || "-"}</span>
                          </div>
                        </div>

                        {/* Beyond Port */}
                        <div className="bg-gray-100 p-1 px-2 border-b border-black font-bold text-xs uppercase text-center">Beyond Port Details</div>
                        <div className="grid grid-cols-3">
                          {/* Row 1 */}
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">SB No.</span>
                            <span className="font-bold">{beyondPortShippingBillNo || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">SB Date</span>
                            <span className="font-bold">{beyondPortShippingBillDate || "-"}</span>
                          </div>
                          <div className="p-2 border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Port Code</span>
                            <span className="font-bold">{beyondPortShipPortCode || "-"}</span>
                          </div>

                          {/* Row 2 */}
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Vessel/Flight No.</span>
                            <span className="font-bold">{beyondPortVesselFlightNo || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Port of Loading</span>
                            <span className="font-bold">{beyondPortPortOfLoading || "-"}</span>
                          </div>
                          <div className="p-2 border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Port of Discharge</span>
                            <span className="font-bold">{beyondPortPortOfDischarge || "-"}</span>
                          </div>

                          {/* Row 3 */}
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Final Dest.</span>
                            <span className="font-bold">{beyondPortFinalDestination || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Origin Country</span>
                            <span className="font-bold">{beyondPortOriginCountry || "-"}</span>
                          </div>
                          <div className="p-2 border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Dest. Country</span>
                            <span className="font-bold">{beyondPortDestCountry || "-"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Additional Transport Details for Rail */}
                    {modeOfTransport === 'Rail' && (
                      <div className="mb-6 border border-black border-t-0 -mt-6 text-sm">
                        {/* Upto Port */}
                        <div className="bg-gray-100 p-1 px-2 border-b border-black font-bold text-xs uppercase text-center">Upto Port Details</div>
                        <div className="grid grid-cols-3 border-b border-black">
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Delivery Type</span>
                            <span className="font-bold">{railUptoPortDeliveryType || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Transporter Name</span>
                            <span className="font-bold">{railUptoPortTransporterName || "-"}</span>
                          </div>
                          <div className="p-2">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Transporter ID</span>
                            <span className="font-bold">{railUptoPortTransporterId || "-"}</span>
                          </div>
                        </div>

                        {/* Beyond Port */}
                        <div className="bg-gray-100 p-1 px-2 border-b border-black font-bold text-xs uppercase text-center">Beyond Port Details</div>
                        <div className="grid grid-cols-3">
                          {/* Row 1 */}
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">RR No.</span>
                            <span className="font-bold">{railBeyondPortRailwayReceiptNo || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">RR Date</span>
                            <span className="font-bold">{railBeyondPortRailwayReceiptDate || "-"}</span>
                          </div>
                          <div className="p-2 border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Origin</span>
                            <span className="font-bold">{railBeyondPortOrigin || "-"}</span>
                          </div>

                          {/* Row 2 */}
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Rail No.</span>
                            <span className="font-bold">{railBeyondPortRailNo || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Loading Stn</span>
                            <span className="font-bold">{railBeyondPortStationOfLoading || "-"}</span>
                          </div>
                          <div className="p-2 border-black border-b">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Discharge Stn</span>
                            <span className="font-bold">{railBeyondPortStationOfDischarge || "-"}</span>
                          </div>

                          {/* Row 3 */}
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Final Dest.</span>
                            <span className="font-bold">{railBeyondPortFinalDestination || "-"}</span>
                          </div>
                          <div className="p-2 border-r border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Origin Country</span>
                            <span className="font-bold">{railBeyondPortOriginCountry || "-"}</span>
                          </div>
                          <div className="p-2 border-black">
                            <span className="block text-xs font-semibold text-gray-500 uppercase">Dest. Country</span>
                            <span className="font-bold">{railBeyondPortDestCountry || "-"}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Items Table */}
                    <div className="mb-6">
                      <table className="w-full border-collapse border border-black text-sm">
                        <thead>
                          <tr className="bg-gray-100 print:bg-gray-200">
                            <th className="border border-black px-2 py-2 w-12 text-center">S.No</th>
                            <th className="border border-black px-2 py-2 text-left">Description of Goods</th>
                            <th className="border border-black px-2 py-2 w-24 text-center">HSN/SAC</th>
                            <th className="border border-black px-2 py-2 w-20 text-center">Qty</th>
                            <th className="border border-black px-2 py-2 w-16 text-center">Unit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {issueSlipItems.map((item, index) => (
                            <tr key={index}>
                              <td className="border border-black px-2 py-2 text-center">{index + 1}</td>
                              <td className="border border-black px-2 py-2">
                                {item.itemName}
                                {item.itemCode && <div className="text-xs text-gray-500 mt-1">Code: {item.itemCode}</div>}
                              </td>
                              <td className="border border-black px-2 py-2 text-center">{item.hsnCode || "-"}</td>
                              <td className="border border-black px-2 py-2 text-center font-bold">{item.quantity}</td>
                              <td className="border border-black px-2 py-2 text-center">{item.uom}</td>
                            </tr>
                          ))}
                          {/* Empty rows filler if needed */}
                          {issueSlipItems.length === 0 && (
                            <tr><td colSpan={5} className="border border-black py-8 text-center text-gray-500">No items added</td></tr>
                          )}
                          {/* Total Row */}
                          <tr className="font-bold bg-gray-50 print:bg-white">
                            <td colSpan={3} className="border border-black px-2 py-2 text-right">Total</td>
                            <td className="border border-black px-2 py-2 text-center">
                              {issueSlipItems.reduce((acc, curr) => acc + (parseFloat(curr.quantity as any) || 0), 0)}
                            </td>
                            <td className="border border-black px-2 py-2"></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Footer Signatures */}
                    <div className="grid grid-cols-2 gap-8 mt-12 page-break-inside-avoid">
                      <div className="text-center pt-16">
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-semibold text-sm mt-2">Receiver's Signature</p>
                      </div>
                      <div className="text-center pt-16">
                        <div className="border-t border-black w-3/4 mx-auto"></div>
                        <p className="font-semibold text-sm mt-2">Authorized Signatory</p>
                        <p className="text-xs text-gray-500">(For {consignorName})</p>
                      </div>
                    </div>

                  </div>

                  {/* Modal Footer - Hidden in Print */}
                  <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 print:hidden">
                    <button
                      onClick={() => setShowDeliveryChallan(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 font-medium text-sm"
                    >
                      Close
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="px-6 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 font-medium text-sm"
                    >
                      Print Challan
                    </button>
                  </div>
                </div>
              </div >
            );
          })()
        }

        {/* E-Way Bill Modal */}
        {
          showEWayBill && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
                <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex justify-between items-center z-10">
                  <h3 className="text-xl font-bold text-gray-900">E-Invoice & E-Way Bill Details</h3>
                  <button
                    onClick={() => setShowEWayBill(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ✕
                  </button>
                </div>
                <div className="p-6 space-y-8">
                  {/* IRN & Ack No Section */}
                  <div className="bg-gray-50 p-6 rounded-[4px] border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">E-Invoice Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">IRN</label>
                          <input type="text" value={irn} onChange={(e) => setIrn(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Ack No</label>
                          <input type="text" value={ackNo} onChange={(e) => setAckNo(e.target.value)} className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {ewayValidationEntries.map((entry, index) => (
                    <div key={entry.id} className="bg-gray-50 p-6 rounded-[4px] relative">
                      {ewayValidationEntries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEwayEntry(entry.id)}
                          className="absolute top-4 right-4 text-red-500 hover:text-red-700"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Availability</label>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={entry.available === 'Yes'}
                                  onChange={() => handleEwayEntryChange(entry.id, 'available', 'Yes')}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-700">Yes</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  checked={entry.available === 'No'}
                                  onChange={() => handleEwayEntryChange(entry.id, 'available', 'No')}
                                  className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-700">No</span>
                              </label>
                            </div>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              E-Way Bill No.
                            </label>
                            <input
                              type="text"
                              value={entry.ewayBillNo}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'ewayBillNo', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Date
                            </label>
                            <input
                              type="date"
                              value={entry.date}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'date', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Validity Period
                            </label>
                            <input
                              type="text"
                              value={entry.validityPeriod}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'validityPeriod', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Distance
                            </label>
                            <input
                              type="text"
                              value={entry.distance}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'distance', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>

                      <h3 className="text-lg font-semibold text-gray-800 mb-4 mt-6">Extended E-way Bill</h3>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Extension Date
                            </label>
                            <input
                              type="date"
                              value={entry.extensionDate}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'extensionDate', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Extended EWB No.
                            </label>
                            <input
                              type="text"
                              value={entry.extendedEwbNo}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'extendedEwbNo', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Extension Reason
                            </label>
                            <input
                              type="text"
                              value={entry.extensionReason}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'extensionReason', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              From Place
                            </label>
                            <input
                              type="text"
                              value={entry.fromPlace}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'fromPlace', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Remaining Distance
                            </label>
                            <input
                              type="text"
                              value={entry.remainingDistance}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'remainingDistance', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              New Validity
                            </label>
                            <input
                              type="text"
                              value={entry.newValidity}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'newValidity', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Updated Vehicle No.
                            </label>
                            <input
                              type="text"
                              value={entry.updatedVehicleNo}
                              onChange={(e) => handleEwayEntryChange(entry.id, 'updatedVehicleNo', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-3 justify-end border-t border-gray-200 pt-4">
                    <button
                      type="button"
                      onClick={handleAddEwayEntry}
                      className="mr-auto px-4 py-2 bg-blue-50 text-indigo-600 hover:bg-blue-100 rounded-[4px] font-medium flex items-center gap-2 border border-blue-200"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add E-way Bill
                    </button>

                    <button
                      onClick={() => setShowEWayBill(false)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium text-sm"
                    >
                      Save & Close
                    </button>
                    <button
                      onClick={() => setShowEWayBill(false)}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-[4px] hover:bg-gray-50 font-medium text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        }

        {/* Document Preview Modal */}
        {showReceiptPreview && receiptPreviewUrl && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden animate-in zoom-in duration-300">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white sticky top-0 z-10">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-50 p-2 rounded-lg">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 leading-tight">Document Preview</h3>
                    <p className="text-sm text-gray-500 font-medium">{receiptDocument?.name || 'document.pdf'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (receiptPreviewUrl) {
                        const link = document.createElement('a');
                        link.href = receiptPreviewUrl;
                        link.download = receiptDocument?.name || 'download';
                        link.click();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors font-semibold border border-gray-200"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download
                  </button>
                  <button
                    onClick={() => setShowReceiptPreview(false)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all"
                  >
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Preview Body */}
              <div className="flex-1 bg-gray-800 p-4 flex items-center justify-center overflow-auto">
                {receiptDocument?.type === 'application/pdf' ? (
                  <iframe
                    src={receiptPreviewUrl}
                    className="w-full h-full rounded shadow-lg bg-white"
                    title="Document Preview"
                  />
                ) : (
                  <img
                    src={receiptPreviewUrl}
                    alt="Document Preview"
                    className="max-w-full max-h-full object-contain rounded shadow-2xl"
                  />
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-center">
                <button
                  onClick={() => setShowReceiptPreview(false)}
                  className="px-12 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-bold text-base shadow-md uppercase tracking-wide transition-transform active:scale-95"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div >
    );
  };

  const renderItemCode = () => {
    // Mock data for demonstration
    const mockItems = [
      { id: 1, itemCode: 'IT001', itemName: 'Product A', category: 'Electronics', hsnCode: '8471', gstRate: '18%', uom: 'Nos', rate: '1500' },
      { id: 2, itemCode: 'IT002', itemName: 'Product B', category: 'Furniture', hsnCode: '9403', gstRate: '18%', uom: 'Nos', rate: '5000' },
      { id: 3, itemCode: 'IT003', itemName: 'Product C', category: 'Textiles', hsnCode: '6204', gstRate: '5%', uom: 'Mtr', rate: '250' },
    ];

    return (
      <div className="space-y-6">
        {/* Header with Buttons */}
        <div className="erp-container">
          <div className="flex justify-between items-center mb-6">
            <h3 className="erp-section-title border-none pb-0 mb-0">Inventory Items</h3>
            <div className="flex gap-3">
              <button className="erp-button-secondary">
                📥 Upload Excel
              </button>
              <button
                onClick={() => {
                  setSelectedItemDetail({ isNew: true });
                  setEditFormData({ isNew: true, itemCode: '', itemName: '', description: '', category: '', uom: '', rate: '', hsnCode: '', gstRate: '', cessRate: '' });
                }}
                className="erp-button-primary"
              >
                ➕ Add Item
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mb-4">
            <input
              type="text"
              placeholder="Search items..."
              className="block w-full px-3 py-2 border border-gray-300 rounded-[4px] leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          {/* Items Table */}
          <div className="erp-table-container">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>HSN Code</th>
                  <th>GST Rate</th>
                  <th>UOM</th>
                  <th>Rate</th>
                  <th className="text-center">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {inventoryItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.itemCode}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{item.itemName}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.category}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.hsnCode}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.gstRate}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.uom}</td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">₹{item.rate}</td>
                    <td className="px-6 py-4 text-center space-x-2">
                      <button
                        onClick={() => handleEditItemOpen(item)}
                        className="inline-block px-3 py-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200 font-medium text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="inline-block px-3 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 font-medium text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Item Detail View */}
        {selectedItemDetail && (
          <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-gray-800">{selectedItemDetail.isNew ? 'Create New Item' : selectedItemDetail.isEditMode ? 'Edit Item' : 'View Item'}</h3>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ✕
              </button>
            </div>

            <form className="space-y-4">
              {/* Item Code & Name */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Item Code</label>
                  <input
                    type="text"
                    value={editFormData?.itemCode || ''}
                    onChange={(e) => handleFormChange('itemCode', e.target.value)}
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    placeholder="Enter item code"
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                  <input
                    type="text"
                    value={editFormData?.itemName || ''}
                    onChange={(e) => handleFormChange('itemName', e.target.value)}
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    placeholder="Enter item name"
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Item Description</label>
                <input
                  type="text"
                  value={editFormData?.description || ''}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                  placeholder="Enter item description"
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>

              {/* Category & Subgroup */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <CategoryHierarchicalDropdown
                  key={categoryUpdateCount}
                  onlyRoots={false}
                  mergeSystem={true}
                  onSelect={async (selection) => {
                    handleFormChange('category', selection.id);
                    handleFormChange('categoryPath', selection.fullPath);
                    setSelectedCategoryId(selection.id);
                    // Subgroup fetching logic removed as it's no longer used
                  }}
                  value={editFormData?.categoryPath || editFormData?.category || ''}
                />
              </div>

              {/* Vendor-Specific Item Code */}
              <div className="border-t pt-4">
                <label className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 text-indigo-600 rounded"
                    checked={isVendorSpecificItemCode}
                    onChange={(e) => setIsVendorSpecificItemCode(e.target.checked)}
                    disabled={!selectedItemDetail.isNew && !selectedItemDetail.isEditMode}
                  />
                  <span className="ml-2 text-sm font-medium text-gray-700">Create Vendor-specific item code</span>
                </label>
                {isVendorSpecificItemCode && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Vendor Name</label>
                      <SearchableDropdown
                        options={Array.from(new Set(vendors.map((v: any) => v.vendor_name).filter(Boolean)))}
                        value={editFormData?.vendorName || ''}
                        onChange={(val) => handleFormChange('vendorName', val)}
                        placeholder="Select Vendor"
                        disabled={!selectedItemDetail.isNew && !selectedItemDetail.isEditMode}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Suffix</label>
                      <input
                        type="text"
                        placeholder="Enter suffix"
                        value={editFormData?.vendorSuffix || ''}
                        onChange={(e) => handleFormChange('vendorSuffix', e.target.value)}
                        readOnly={!selectedItemDetail.isNew && !selectedItemDetail.isEditMode}
                        className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Unit Configuration */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Unit (UOM)</label>
                    <select
                      value={editFormData?.uom || ''}
                      onChange={(e) => handleFormChange('uom', e.target.value)}
                      disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                      className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Select UOM</option>
                      {unitOptions.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Alternate Unit</label>
                    <select
                      value={editFormData?.altUnit || ''}
                      onChange={(e) => handleFormChange('altUnit', e.target.value)}

                      disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                      className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Select alternate unit</option>
                      {unitOptions.map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Conversion</label>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value="1"
                        readOnly
                        disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                        className="w-32 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed bg-gray-50 text-center font-bold shadow-sm"
                      />
                      <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded border border-indigo-100 min-w-[100px] text-center shadow-sm">
                        {unitOptions.find(u => u.value === editFormData?.uom)?.label || 'UOM'}
                      </span>
                    </div>
                    <span className="text-xl font-bold text-gray-400">=</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editFormData?.conversionFactor || ''}
                        onChange={(e) => handleFormChange('conversionFactor', e.target.value)}
                        disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                        className="w-48 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed hover:border-slate-400 transition-colors"
                      />
                      <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded border border-emerald-100 min-w-[100px] text-center shadow-sm">
                        {unitOptions.find(u => u.value === editFormData?.altUnit)?.label || 'Alt Unit'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rate */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Rate</label>
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    value={editFormData?.rate || ''}
                    onChange={(e) => handleFormChange('rate', e.target.value)}
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    placeholder="Enter rate"
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                  <select
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    value={editFormData?.rateUnit || ''}
                    onChange={(e) => handleFormChange('rateUnit', e.target.value)}
                  >
                    <option value="">Select unit</option>
                    {unitOptions
                      .filter(unit => unit.value === editFormData?.uom || (editFormData?.altUnit && unit.value === editFormData?.altUnit))
                      .map((unit) => (
                        <option key={unit.value} value={unit.value}>
                          {unit.label}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* HSN & GST & CESS */}
              <div className="border-t pt-4 grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">HSN Code</label>
                  <input
                    type="text"
                    value={editFormData?.hsnCode || ''}
                    onChange={(e) => handleHsnChange(e.target.value)}
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    placeholder="Enter HSN code"
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">GST Rate</label>
                  <input
                    type="text"
                    value={editFormData?.gstRate || ''}
                    onChange={(e) => handleFormChange('gstRate', e.target.value)}
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    placeholder="Enter GST rate"
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cess Rate</label>
                  <input
                    type="text"
                    value={editFormData?.cessRate || ''}
                    onChange={(e) => handleFormChange('cessRate', e.target.value)}
                    disabled={!editFormData?.isNew && !editFormData?.isEditMode}
                    placeholder="Enter Cess rate"
                    className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Reorder & Saleable */}
              <div className="border-t pt-4 space-y-4">
                {/* Reorder Level - Only for specific categories */}
                {editFormData?.categoryPath && ['raw material', 'stock-in-trade', 'stock in trade', 'stores & spares', 'stores and spares', 'packing material'].some(cat => editFormData.categoryPath.toLowerCase().includes(cat)) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Reorder Level</label>
                    <div className="flex items-center gap-6">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editFormData?.reorderLevel || ''}
                          onChange={(e) => handleFormChange('reorderLevel', e.target.value)}
                          className="w-48 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                        <span className="text-sm font-semibold text-indigo-700 bg-indigo-50 px-4 py-2 rounded border border-indigo-100 min-w-[100px] text-center shadow-sm">
                          {unitOptions.find(u => u.value === editFormData?.uom)?.label || 'UOM'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editFormData?.reorderLevel2 || ''}
                          onChange={(e) => handleFormChange('reorderLevel2', e.target.value)}
                          className="w-48 px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                        />
                        <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 px-4 py-2 rounded border border-emerald-100 min-w-[100px] text-center shadow-sm">
                          {unitOptions.find(u => u.value === editFormData?.altUnit)?.label || 'Alt Unit'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {editFormData?.categoryPath?.includes('Work in Progress') && (
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      className="h-4 w-4 text-indigo-600 rounded"
                      checked={editFormData?.isSaleable || false}
                      onChange={(e) => handleFormChange('isSaleable', e.target.checked)}
                    />
                    <span className="ml-2 text-sm font-medium text-gray-700">Saleable Item</span>
                  </label>
                )}
              </div>

              {/* Buttons */}
              <div className="border-t pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveItem}
                  className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Save & Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItemDetail(null);
                    setEditFormData(null);
                  }}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div >
        )}
      </div >
    );
  };

  const handleGRNSeriesSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grnSeriesName || !grnSeriesType || !grnRequiredDigits) {
      showError('Please fill all required fields');
      return;
    }

    try {
      if (parseInt(grnRequiredDigits) > 20) {
        showError('Required digits cannot exceed 20');
        return;
      }

      // Generate preview
      const paddedNumber = '1'.padStart(parseInt(grnRequiredDigits), '0');
      const preview = (grnPrefix || '') + paddedNumber + (grnSuffix || '');

      if (preview.length > 255) {
        showError('Generated preview exceeds maximum length of 255 characters. Please shorten prefix, suffix or digits.');
        return;
      }

      const data = {
        name: grnSeriesName,
        grn_type: grnSeriesType,
        prefix: grnPrefix,
        suffix: grnSuffix,
        year: grnYear || new Date().getFullYear().toString(),
        required_digits: parseInt(grnRequiredDigits),
        preview: preview
      };

      if (isEditModeGRNSeries && selectedGrnSeries) {
        await apiService.saveGRNSeries({ ...data, id: selectedGrnSeries.id });
        showSuccess('GRN Series updated successfully!');
      } else {
        await apiService.saveGRNSeries(data);
        showSuccess('GRN Series created successfully!');
      }

      fetchGrnSeries();

      // Reset form
      setGrnSeriesName('');
      setGrnSeriesType('');
      setGrnPrefix('');
      setGrnSuffix('');
      setGrnYear('');
      setGrnRequiredDigits('');
      setGrnPreview('');
      setIsEditModeGRNSeries(false);
      setSelectedGrnSeries(null);
    } catch (error: any) {
      handleApiError(error, 'Save GRN Series');
      // Also reset on error to avoid getting stuck in edit mode for non-existent record
      setIsEditModeGRNSeries(false);
      setSelectedGrnSeries(null);
    }
  };

  const renderGRN = () => {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Create/Edit GRN Series Form */}
        <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-300">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">{isEditModeGRNSeries ? 'Edit GRN Series' : 'Create GRN Series'}</h3>
          <form onSubmit={handleGRNSeriesSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GRN Series Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={grnSeriesName}
                onChange={(e) => setGrnSeriesName(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter GRN Series name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">GRN Type <span className="text-red-500">*</span></label>
              <select
                value={grnSeriesType}
                onChange={(e) => setGrnSeriesType(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">Select GRN Type</option>
                <option value="purchase">Purchase</option>
                <option value="sales_return">Sales Return</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Prefix</label>
                <input
                  type="text"
                  value={grnPrefix}
                  onChange={(e) => setGrnPrefix(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., GRN"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Suffix</label>
                <input
                  type="text"
                  value={grnSuffix}
                  onChange={(e) => setGrnSuffix(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., /2024"
                />
              </div>
            </div>
            <div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Digits <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={grnRequiredDigits}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || parseInt(val) > 0) {
                      setGrnRequiredDigits(val);
                    }
                  }}
                  min="1"
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 4"
                  required
                />
              </div>
            </div>

            <div className="mt-6 bg-slate-50 p-6 rounded text-center">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sample Preview</label>
              <div className="text-2xl font-bold text-gray-800">
                {grnPrefix + (grnRequiredDigits ? '1'.padStart(parseInt(grnRequiredDigits), '0') : '0001') + grnSuffix}
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isEditModeGRNSeries ? 'Update Series' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGrnSeriesName('');
                  setGrnSeriesType('');
                  setGrnPrefix('');
                  setGrnSuffix('');
                  setGrnYear('');
                  setGrnRequiredDigits('');
                  setGrnPreview('');
                  setIsEditModeGRNSeries(false);
                  setSelectedGrnSeries(null);
                }}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
              >
                Close
              </button>
            </div>
          </form>
        </div>

        {/* Right Column - Existing GRN Series */}
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-300">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">GRN Series Preview</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loadingGrnSeries ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : grnSeriesList.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No GRN Series created</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GRN Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GRN Series Name</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {grnSeriesList.map((series, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{series.grnType || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{series.preview || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{series.name || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => {
                              setGrnSeriesName(series.name);
                              setGrnSeriesType(series.grnType);
                              setGrnPrefix(series.prefix);
                              setGrnSuffix(series.suffix);
                              setGrnYear(series.year);
                              setGrnRequiredDigits(series.requiredDigits);
                              setIsEditModeGRNSeries(true);
                              setSelectedGrnSeries(series);
                            }}
                            className="text-white bg-indigo-600 px-3 py-1 rounded text-xs hover:bg-indigo-700"
                            title="Edit"
                          >
                            ✎ Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (await confirm('Are you sure you want to delete this GRN Series?')) {
                                try {
                                  await apiService.deleteGRNSeries(series.id);
                                  showSuccess('GRN Series deleted successfully!');
                                  fetchGrnSeries();
                                } catch (error) {
                                  handleApiError(error, 'Delete GRN Series');
                                }
                              }
                            }}
                            className="text-white bg-red-600 px-3 py-1 rounded text-xs hover:bg-red-700"
                            title="Delete"
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  const handleIssueSlipSeriesSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueSlipSeriesName || !issueSlipType || !issueSlipRequiredDigits) {
      showError('Please fill all required fields');
      return;
    }

    try {
      if (parseInt(issueSlipRequiredDigits) > 20) {
        showError('Required digits cannot exceed 20');
        return;
      }

      // Generate preview
      const paddedNumber = '1'.padStart(parseInt(issueSlipRequiredDigits), '0');
      const preview = (issueSlipPrefix || '') + paddedNumber + (issueSlipSuffix || '');

      if (preview.length > 255) {
        showError('Generated preview exceeds maximum length of 255 characters. Please shorten prefix, suffix or digits.');
        return;
      }

      const data = {
        name: issueSlipSeriesName,
        issue_slip_type: issueSlipType,
        prefix: issueSlipPrefix,
        suffix: issueSlipSuffix,
        year: issueSlipYear || new Date().getFullYear().toString(),
        required_digits: parseInt(issueSlipRequiredDigits),
        preview: preview
      };

      if (isEditModeIssueSlipSeries && selectedIssueSlipSeries) {
        await apiService.saveIssueSlipSeries({ ...data, id: selectedIssueSlipSeries.id });
        showSuccess('Issue Slip Series updated successfully!');
      } else {
        await apiService.saveIssueSlipSeries(data);
        showSuccess('Issue Slip Series created successfully!');
      }

      fetchIssueSlipSeries();

      // Reset form
      setIssueSlipSeriesName('');
      setIssueSlipType('');
      setIssueSlipPrefix('');
      setIssueSlipSuffix('');
      setIssueSlipYear('');
      setIssueSlipRequiredDigits('');
      setIssueSlipPreview('');
      setIsEditModeIssueSlipSeries(false);
      setSelectedIssueSlipSeries(null);
    } catch (error: any) {
      handleApiError(error, 'Save Issue Slip Series');
      // Reset on error
      setIsEditModeIssueSlipSeries(false);
      setSelectedIssueSlipSeries(null);
    }
  };

  const renderIssueSlip = () => {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Create/Edit Issue Slip Series Form */}
        <div className="bg-white p-6 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-300">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">{isEditModeIssueSlipSeries ? 'Edit Issue Slip Series' : 'Create Issue Slip Series'}</h3>
          <form onSubmit={handleIssueSlipSeriesSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Issue Slip Series Name <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={issueSlipSeriesName}
                onChange={(e) => setIssueSlipSeriesName(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Enter Issue Slip Series name"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Issue Slip Type <span className="text-red-500">*</span></label>
              <select
                value={issueSlipType}
                onChange={(e) => setIssueSlipType(e.target.value)}
                className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              >
                <option value="">Select Issue Slip Type</option>
                <option value="job_work">Job-work</option>
                <option value="inter_unit">Inter-unit</option>
                <option value="location_change">Location Change</option>
                <option value="production">Production</option>
                <option value="consumption">Consumption</option>
                <option value="outward">Outward</option>
                <option value="scrap">Scrap</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Prefix</label>
                <input
                  type="text"
                  value={issueSlipPrefix}
                  onChange={(e) => setIssueSlipPrefix(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., ISP"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Suffix</label>
                <input
                  type="text"
                  value={issueSlipSuffix}
                  onChange={(e) => setIssueSlipSuffix(e.target.value)}
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., /2024"
                />
              </div>
            </div>
            <div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Digits <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={issueSlipRequiredDigits}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || parseInt(val) > 0) {
                      setIssueSlipRequiredDigits(val);
                    }
                  }}
                  min="1"
                  className="w-full px-4 py-2 border-2 border-slate-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g., 4"
                  required
                />
              </div>
            </div>

            <div className="mt-6 bg-slate-50 p-6 rounded text-center">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sample Preview</label>
              <div className="text-2xl font-bold text-gray-800">
                {issueSlipPrefix + (issueSlipRequiredDigits ? '1'.padStart(parseInt(issueSlipRequiredDigits), '0') : '0001') + issueSlipSuffix}
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                {isEditModeIssueSlipSeries ? 'Update Series' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIssueSlipSeriesName('');
                  setIssueSlipType('');
                  setIssueSlipPrefix('');
                  setIssueSlipSuffix('');
                  setIssueSlipYear('');
                  setIssueSlipRequiredDigits('');
                  setIssueSlipPreview('');
                  setIsEditModeIssueSlipSeries(false);
                  setSelectedIssueSlipSeries(null);
                }}
                className="flex-1 inline-flex items-center justify-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
              >
                Close
              </button>
            </div>
          </form>
        </div>

        {/* Right Column - Existing Issue Slip Series */}
        <div className="erp-container p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-slate-50">
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Issue Slip Series Preview</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loadingIssueSlipSeries ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : issueSlipSeriesList.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No Issue Slip Series created</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Slip Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Preview</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Issue Slip Series Name</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {issueSlipSeriesList.map((series, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">{series.issueSlipType || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{series.preview || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{series.name || '-'}</td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => {
                              setIssueSlipSeriesName(series.name);
                              setIssueSlipType(series.issueSlipType);
                              setIssueSlipPrefix(series.prefix);
                              setIssueSlipSuffix(series.suffix);
                              setIssueSlipYear(series.year);
                              setIssueSlipRequiredDigits(series.requiredDigits);
                              setIsEditModeIssueSlipSeries(true);
                              setSelectedIssueSlipSeries(series);
                            }}
                            className="text-white bg-indigo-600 px-3 py-1 rounded text-xs hover:bg-indigo-700"
                            title="Edit"
                          >
                            ✎ Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (await confirm('Are you sure you want to delete this Issue Slip Series?')) {
                                try {
                                  await apiService.deleteIssueSlipSeries(series.id);
                                  showSuccess('Issue Slip Series deleted successfully!');
                                  fetchIssueSlipSeries();
                                } catch (error) {
                                  handleApiError(error, 'Delete Issue Slip Series');
                                }
                              }
                            }}
                            className="text-white bg-red-600 px-3 py-1 rounded text-xs hover:bg-red-700"
                            title="Delete"
                          >
                            🗑 Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderGRNIssueSlip = () => {
    return (
      <div className="space-y-6">
        <div className="flex space-x-6 border-b border-slate-200">
          {grnIssueSlipSubTabs.map((subTab) => (
            <button
              key={subTab}
              onClick={() => setActiveGRNIssueSlipSubTab(subTab)}
              className={`pb-3 px-4 text-[12px] font-bold uppercase tracking-widest transition-all relative ${activeGRNIssueSlipSubTab === subTab
                ? 'text-indigo-600'
                : 'text-slate-400 hover:text-slate-600'
                }`}
            >
              {subTab}
              {activeGRNIssueSlipSubTab === subTab && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />
              )}
            </button>
          ))}
        </div>
        <div className="p-0 animate-in fade-in duration-300">
          {activeGRNIssueSlipSubTab === 'GRN' && renderGRN()}
          {activeGRNIssueSlipSubTab === 'Issue Slip' && renderIssueSlip()}
        </div>
      </div>
    );
  };

  const renderMaster = () => (
    <div className="space-y-6">
      <div className="erp-tab-container mb-0">
        {masterSubTabs.map((subTab) => (
          <button
            key={subTab}
            onClick={() => setActiveMasterSubTab(subTab)}
            className={`erp-tab ${activeMasterSubTab === subTab ? 'active' : ''}`}
          >
            {subTab}
          </button>
        ))}
      </div>
      <div className="p-0 animate-in fade-in duration-300">
        {activeMasterSubTab === 'Category' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-h-[500px]">
            <InventoryCategoryWizard
              onCreateCategory={handleCreateCategory}
              onEditCategory={handleEditCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          </div>
        )}
        {activeMasterSubTab === 'Location' && renderLocation()}
        {activeMasterSubTab === 'Inventory Items' && renderItemCode()}
        {activeMasterSubTab === 'GRN & Issue Slip' && renderGRNIssueSlip()}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page Section Title */}
      <div className="erp-section-title">
        <h1 className="page-title">Inventory Management</h1>
        <p className="helper-text mb-0">
          Manage categories, locations, items, and operations
        </p>
      </div>

      {/* Main Tabs */}
      <div className="erp-tab-container">
        {visibleTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`erp-tab ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-in fade-in duration-300">
        {activeTab === 'Master' && renderMaster()}
        {activeTab === 'Operations' && renderOperations()}
      </div>

      {/* Document Preview Modal (Centered like Screenshot) */}
      {isGrnDocumentModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col overflow-hidden border border-gray-100 transform animate-in zoom-in-95 duration-300">
            {/* Header Area */}
            <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-white">
              <div className="flex items-center space-x-5">
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-100">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">Document Preview</h3>
                  <p className="text-sm text-gray-500 font-medium truncate max-w-md mt-0.5">{grnDocument?.name || 'Uploaded File'}</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <button
                  onClick={() => {
                    if (grnDocumentPreview) {
                      const link = document.createElement('a');
                      link.href = grnDocumentPreview;
                      link.download = grnDocument?.name || 'document';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  }}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-xl text-sm font-bold transition-all border border-gray-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download</span>
                </button>
                <button onClick={() => setIsGrnDocumentModalOpen(false)} className="bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-500 p-2.5 rounded-xl transition-all border border-gray-200">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Viewer Body */}
            <div className="flex-1 bg-[#2b2b2b] p-6 flex items-center justify-center overflow-auto shadow-inner">
              {grnDocumentPreview && (
                grnDocument?.type.startsWith('image/') ? (
                  <img src={grnDocumentPreview} alt="Preview" className="max-w-full max-h-full object-contain shadow-2xl rounded-sm border border-black/10 transition-all" />
                ) : (
                  <iframe src={grnDocumentPreview} className="w-full h-full min-h-[65vh] rounded shadow-2xl border-none" title="PDF Preview" />
                )
              )}
              {!grnDocumentPreview && (
                <div className="text-gray-400 font-medium">No document selected to preview</div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="px-8 py-6 border-t border-gray-100 bg-white flex justify-center shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.05)]">
              <button
                onClick={() => setIsGrnDocumentModalOpen(false)}
                className="px-14 py-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-black shadow-xl shadow-indigo-200 transform hover:-translate-y-0.5 active:translate-y-0 transition-all uppercase underline-offset-4 decoration-2 decoration-indigo-300"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryPage;


