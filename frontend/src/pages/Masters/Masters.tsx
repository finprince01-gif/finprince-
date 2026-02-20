import React, { useState, useEffect } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import type { Ledger, LedgerGroupMaster, VoucherTypeMaster } from '../../types';
import Icon from '../../components/Icon';
import { showError, showSuccess, showInfo, showWarning, confirm } from '../../utils/toast';

import { handleApiError } from '../../utils/errorHandler';
import { HierarchicalDropdown } from '../../components/HierarchicalDropdown';
import { LedgerCreationWizard } from '../../components/LedgerCreationWizard.tsx';
import { apiService, httpClient } from '../../services';




interface MastersPageProps {
  ledgers: Ledger[];
  ledgerGroups: LedgerGroupMaster[];
  onAddLedger: (ledger: Ledger) => void;
  onUpdateLedger?: (idOrName: number | string, ledger: Partial<Ledger>) => void;
  onDeleteLedger?: (idOrName: number | string) => void;

  onAddLedgerGroup: (group: LedgerGroupMaster) => void;
  onUpdateLedgerGroup?: (idOrName: number | string, group: Partial<LedgerGroupMaster>) => void;
  onDeleteLedgerGroup?: (idOrName: number | string) => void;

  voucherTypes?: VoucherTypeMaster[];
  onAddVoucherType?: (voucherType: Omit<VoucherTypeMaster, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>) => void;
}


type MasterTab = 'Ledgers' | 'LedgerGroups' | 'Vouchers';

const MastersPage: React.FC<MastersPageProps> = ({
  ledgers,
  ledgerGroups,
  onAddLedger,
  onUpdateLedger,
  onDeleteLedger,
  onAddLedgerGroup,
  onUpdateLedgerGroup,
  onDeleteLedgerGroup,
  onAddVoucherType,
  voucherTypes = []
}) => {
  const { hasTabAccess, isSuperuser } = usePermissions();

  const allTabs: { id: MasterTab; label: string }[] = [
    { id: 'Ledgers', label: 'LEDGERS' },
    { id: 'Vouchers', label: 'VOUCHERS' }
  ];

  const ledgerSubTabs = ['Ledgers', 'Ledger Groups'];
  const voucherSubPermissions = ['Sales', 'Purchase', 'Payment', 'Receipt', 'Contra', 'Journal', 'Expenses', 'Credit Note', 'Debit Note'];

  // Filter tabs - RBAC enabled
  const availableTabs = isSuperuser
    ? allTabs
    : allTabs.filter(tab => {
      if (tab.id === 'Ledgers') return ledgerSubTabs.some(t => hasTabAccess('Masters', t));
      if (tab.id === 'Vouchers') return voucherSubPermissions.some(t => hasTabAccess('Masters', t));
      return true;
    });

  const [activeTab, setActiveTab] = useState<MasterTab>(availableTabs.length > 0 ? availableTabs[0].id : 'Ledgers');

  // Ensure activeTab is valid
  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);

  // Voucher Buttons Definition and Filtering
  const allVoucherButtons = [
    { id: 'sales', label: 'Sales', permission: 'Sales' },
    { id: 'credit-note', label: 'Credit Note', permission: 'Credit Note' },
    { id: 'receipts', label: 'Receipts', permission: 'Receipt' },
    { id: 'purchases', label: 'Purchases', permission: 'Purchase' },
    { id: 'debit-note', label: 'Debit Note', permission: 'Debit Note' },
    { id: 'payments', label: 'Payments', permission: 'Payment' },
    { id: 'expenses', label: 'Expenses', permission: 'Expenses' },
    { id: 'journal', label: 'Journal', permission: 'Journal' },
    { id: 'contra', label: 'Contra', permission: 'Contra' }
  ];

  const voucherButtons = isSuperuser
    ? allVoucherButtons
    : allVoucherButtons.filter(btn => hasTabAccess('Masters', btn.permission));

  // State for Create Ledger
  const [ledgerName, setLedgerName] = useState('');
  const [ledgerGroup, setLedgerGroup] = useState<string>('');
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [ledgerSearchQuery, setLedgerSearchQuery] = useState('');

  // State for Secured Loans additional fields
  const [loanAccountNumber, setLoanAccountNumber] = useState('');
  const [panGstin, setPanGstin] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [interestType, setInterestType] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [tenure, setTenure] = useState('');

  // State for Bank OD/CC Accounts additional fields
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [gstinPan, setGstinPan] = useState('');
  const [enableBankReconciliation, setEnableBankReconciliation] = useState(false);
  const [bankName, setBankName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branch, setBranch] = useState('');
  const [bankingCurrency, setBankingCurrency] = useState('');

  // State for Trade Payables additional fields
  const [referenceWiseTracking, setReferenceWiseTracking] = useState('');
  const [creditPeriod, setCreditPeriod] = useState('');

  // State for Tangible assets additional fields
  const [isDepreciationPerIncomeTax, setIsDepreciationPerIncomeTax] = useState('');
  const [depreciationPercentage, setDepreciationPercentage] = useState('');

  // State for Intangible Assets additional fields
  const [isAmortizationPerIncomeTax, setIsAmortizationPerIncomeTax] = useState('');
  const [amortizationPercentage, setAmortizationPercentage] = useState('');

  // State for Investments in preference shares additional fields
  const [companyCIN, setCompanyCIN] = useState('');
  const [dividendRate, setDividendRate] = useState('');

  // State for Investments in equity instruments additional fields
  const [equityInstrumentsCIN, setEquityInstrumentsCIN] = useState('');

  // State for Investments in debentures or bonds
  const [debentureBondCIN, setDebentureBondCIN] = useState('');
  const [debentureBondInterestRate, setDebentureBondInterestRate] = useState('');
  const [debentureBondMaturityDate, setDebentureBondMaturityDate] = useState('');

  // State for Inventories additional fields
  const [inventoryType, setInventoryType] = useState('');
  const [inventoryValuationMethod, setInventoryValuationMethod] = useState('');

  // State for Hierarchy fields
  const [ledgerCategory, setLedgerCategory] = useState('');
  const [ledgerSubGroup1, setLedgerSubGroup1] = useState('');
  const [ledgerSubGroup2, setLedgerSubGroup2] = useState('');
  const [ledgerSubGroup3, setLedgerSubGroup3] = useState('');
  const [ledgerLedgerType, setLedgerLedgerType] = useState('');

  // State for Create Ledger Group
  const [groupName, setGroupName] = useState('');
  const [groupUnder, setGroupUnder] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<LedgerGroupMaster | null>(null);
  const [isEditModeGroup, setIsEditModeGroup] = useState(false);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // State for Vouchers
  const [newVoucherType, setNewVoucherType] = useState('');
  const [salesNumbering, setSalesNumbering] = useState({ enableAuto: true, prefix: 'INV-', suffix: '/24-25', nextNumber: 1, padding: 4, preview: '' });
  const [purchaseNumbering, setPurchaseNumbering] = useState({ enableAuto: true, prefix: 'PO-', suffix: '/24-25', nextNumber: 1, padding: 4, preview: '' });
  const [selectedVoucher, setSelectedVoucher] = useState<string>(voucherButtons.length > 0 ? voucherButtons[0].id : 'sales');

  // Ensure selectedVoucher is valid
  useEffect(() => {
    if (voucherButtons.length > 0 && !voucherButtons.find(v => v.id === selectedVoucher)) {
      setSelectedVoucher(voucherButtons[0].id);
    }
  }, [voucherButtons, selectedVoucher]);


  // State for Voucher Configuration Form
  const [voucherName, setVoucherName] = useState('');
  const [enableAutoNumbering, setEnableAutoNumbering] = useState(true);
  const [voucherPrefix, setVoucherPrefix] = useState('');
  const [voucherSuffix, setVoucherSuffix] = useState('');
  const [voucherStartFrom, setVoucherStartFrom] = useState(1);
  const [voucherRequiredDigits, setVoucherRequiredDigits] = useState(4);

  const [existingVouchers, setExistingVouchers] = useState<any[]>([]);
  const [selectedVoucherConfig, setSelectedVoucherConfig] = useState<any | null>(null);
  const [isEditModeVoucher, setIsEditModeVoucher] = useState(false);
  const [voucherFormError, setVoucherFormError] = useState('');

  const handleLedgerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ledgerName.trim()) return;
    // Require inventory fields if group is Inventories
    if (ledgerGroup === 'Inventories') {
      if (!inventoryType.trim() || !inventoryValuationMethod.trim()) {
        showError('Please fill in all required inventory fields.');
        return;
      }
    }


    if (isEditMode && selectedLedger) {
      // Update existing ledger
      if (onUpdateLedger) {
        const identifier = selectedLedger.id || selectedLedger.name;
        const updateData: Partial<Ledger> = {
          name: ledgerName.trim(),
          group: ledgerGroup,
          category: ledgerCategory || undefined,
          sub_group_1: ledgerSubGroup1 || undefined,
          sub_group_2: ledgerSubGroup2 || undefined,
          sub_group_3: ledgerSubGroup3 || undefined,
          ledger_type: ledgerLedgerType || undefined
        };

        // Add loan fields if ledger is a loan type
        if (ledgerGroup === 'Secured Loans' || ledgerGroup === 'Unsecured Loans' ||
          ledgerGroup === 'Secured Loans (Short term)' || ledgerGroup === 'Unsecured Loans (Short term)') {
          updateData.loanAccountNumber = loanAccountNumber;
          updateData.panGstin = panGstin;
          updateData.lenderName = lenderName;
          updateData.loanAmount = loanAmount;
          updateData.interestType = interestType;
          updateData.interestRate = interestRate;
          updateData.tenure = tenure;
        }

        // Add bank fields if ledger is a bank account type
        if (ledgerGroup === 'Bank OD/CC Accounts') {
          updateData.bankAccountNumber = bankAccountNumber;
          updateData.gstinPan = gstinPan;
          updateData.enableBankReconciliation = enableBankReconciliation;
          updateData.bankName = bankName;
          updateData.ifscCode = ifscCode;
          updateData.branch = branch;
          updateData.bankingCurrency = bankingCurrency;
        }

        // Add trade payables fields if ledger is trade payables type
        if (ledgerGroup === 'Trade Payables') {
          updateData.referenceWiseTracking = referenceWiseTracking;
          updateData.creditPeriod = creditPeriod;
        }

        // Add tangible assets fields if ledger is tangible assets type
        if (ledgerGroup === 'Tangible assets') {
          updateData.isDepreciationPerIncomeTax = isDepreciationPerIncomeTax;
          updateData.depreciationPercentage = depreciationPercentage;
        }

        // Add intangible assets fields if ledger is intangible assets type
        if (ledgerGroup === 'Intangible Assets') {
          updateData.isAmortizationPerIncomeTax = isAmortizationPerIncomeTax;
          updateData.amortizationPercentage = amortizationPercentage;
        }

        // Add investments in preference shares fields
        if (ledgerGroup === 'Investments in preference shares' || ledgerGroup === 'Investments in preference shares (Current)') {
          updateData.companyCIN = companyCIN;
          updateData.dividendRate = dividendRate;
        }
        // Add investments in equity instruments fields
        if (ledgerGroup === 'Investments in equity instruments' || ledgerGroup === 'Investments in equity instruments (Current)') {
          updateData.equityInstrumentsCIN = equityInstrumentsCIN;
        }

        // Add investments in debentures or bonds fields
        if (
          ledgerGroup === 'Investments in debentures or bonds' ||
          ledgerGroup === 'Investments in debentures or bonds (Current)'
        ) {
          updateData.debentureBondCIN = debentureBondCIN;
          updateData.debentureBondInterestRate = debentureBondInterestRate;
          updateData.debentureBondMaturityDate = debentureBondMaturityDate;
        }

        // Add inventory fields if ledger is inventories type
        if (ledgerGroup === 'Inventories') {
          updateData.inventoryType = inventoryType;
          updateData.inventoryValuationMethod = inventoryValuationMethod;
        }

        onUpdateLedger(identifier, updateData);
      } else {

      }
      setIsEditMode(false);
      setSelectedLedger(null);
    } else {
      // Create new ledger
      if (!ledgers.find(l => l.name.toLowerCase() === ledgerName.trim().toLowerCase())) {
        const newLedger: Ledger = {
          name: ledgerName.trim(),
          group: ledgerGroup,
          category: ledgerCategory || undefined,
          sub_group_1: ledgerSubGroup1 || undefined,
          sub_group_2: ledgerSubGroup2 || undefined,
          sub_group_3: ledgerSubGroup3 || undefined,
          ledger_type: ledgerLedgerType || undefined
        };

        // Add loan fields if ledger is a loan type
        if (ledgerGroup === 'Secured Loans' || ledgerGroup === 'Unsecured Loans' ||
          ledgerGroup === 'Secured Loans (Short term)' || ledgerGroup === 'Unsecured Loans (Short term)') {
          newLedger.loanAccountNumber = loanAccountNumber;
          newLedger.panGstin = panGstin;
          newLedger.lenderName = lenderName;
          newLedger.loanAmount = loanAmount;
          newLedger.interestType = interestType;
          newLedger.interestRate = interestRate;
          newLedger.tenure = tenure;
        }

        // Add bank fields if ledger is a bank account type
        if (ledgerGroup === 'Bank OD/CC Accounts') {
          newLedger.bankAccountNumber = bankAccountNumber;
          newLedger.gstinPan = gstinPan;
          newLedger.enableBankReconciliation = enableBankReconciliation;
          newLedger.bankName = bankName;
          newLedger.ifscCode = ifscCode;
          newLedger.branch = branch;
          newLedger.bankingCurrency = bankingCurrency;
        }

        // Add trade payables fields if ledger is trade payables type
        if (ledgerGroup === 'Trade Payables') {
          newLedger.referenceWiseTracking = referenceWiseTracking;
          newLedger.creditPeriod = creditPeriod;
        }

        // Add tangible assets fields if ledger is tangible assets type
        if (ledgerGroup === 'Tangible assets') {
          newLedger.isDepreciationPerIncomeTax = isDepreciationPerIncomeTax;
          newLedger.depreciationPercentage = depreciationPercentage;
        }

        // Add intangible assets fields if ledger is intangible assets type
        if (ledgerGroup === 'Intangible Assets') {
          newLedger.isAmortizationPerIncomeTax = isAmortizationPerIncomeTax;
          newLedger.amortizationPercentage = amortizationPercentage;
        }

        // Add investments in preference shares fields
        if (ledgerGroup === 'Investments in preference shares' || ledgerGroup === 'Investments in preference shares (Current)') {
          newLedger.companyCIN = companyCIN;
          newLedger.dividendRate = dividendRate;
        }
        // Add investments in equity instruments fields
        if (ledgerGroup === 'Investments in equity instruments' || ledgerGroup === 'Investments in equity instruments (Current)') {
          newLedger.equityInstrumentsCIN = equityInstrumentsCIN;
        }

        // Add investments in debentures or bonds fields
        if (
          ledgerGroup === 'Investments in debentures or bonds' ||
          ledgerGroup === 'Investments in debentures or bonds (Current)'
        ) {
          newLedger.debentureBondCIN = debentureBondCIN;
          newLedger.debentureBondInterestRate = debentureBondInterestRate;
          newLedger.debentureBondMaturityDate = debentureBondMaturityDate;
        }

        // Add inventory fields if ledger is inventories type
        if (ledgerGroup === 'Inventories') {
          newLedger.inventoryType = inventoryType;
          newLedger.inventoryValuationMethod = inventoryValuationMethod;
        }

        onAddLedger(newLedger);
      }
    }
    // Reset form
    setLedgerName('');
    setLedgerGroup('');
    setLoanAccountNumber('');
    setPanGstin('');
    setLenderName('');
    setLoanAmount('');
    setInterestType('');
    setInterestRate('');
    setTenure('');
    setBankAccountNumber('');
    setGstinPan('');
    setEnableBankReconciliation(false);
    setBankName('');
    setIfscCode('');
    setBranch('');
    setBankingCurrency('');
    setDebentureBondCIN('');
    setDebentureBondInterestRate('');
    setDebentureBondMaturityDate('');
    setInventoryType('');
    setInventoryValuationMethod('');
  };

  const handleEditLedger = () => {
    if (!selectedLedger) {
      showError('Please select a ledger first by clicking the radio button.');
      return;
    }


    setLedgerName(selectedLedger.name);
    setLedgerGroup(selectedLedger.group);

    // Populate loan fields if they exist
    if (selectedLedger.loanAccountNumber) setLoanAccountNumber(selectedLedger.loanAccountNumber);
    if (selectedLedger.panGstin) setPanGstin(selectedLedger.panGstin);
    if (selectedLedger.lenderName) setLenderName(selectedLedger.lenderName);
    if (selectedLedger.loanAmount) setLoanAmount(selectedLedger.loanAmount);
    if (selectedLedger.interestType) setInterestType(selectedLedger.interestType);
    if (selectedLedger.interestRate) setInterestRate(selectedLedger.interestRate);
    if (selectedLedger.tenure) setTenure(selectedLedger.tenure);

    // Populate bank fields if they exist
    if (selectedLedger.bankAccountNumber) setBankAccountNumber(selectedLedger.bankAccountNumber);
    if (selectedLedger.gstinPan) setGstinPan(selectedLedger.gstinPan);
    if (selectedLedger.enableBankReconciliation !== undefined) setEnableBankReconciliation(selectedLedger.enableBankReconciliation);
    if (selectedLedger.bankName) setBankName(selectedLedger.bankName);
    if (selectedLedger.ifscCode) setIfscCode(selectedLedger.ifscCode);
    if (selectedLedger.branch) setBranch(selectedLedger.branch);
    if (selectedLedger.bankingCurrency) setBankingCurrency(selectedLedger.bankingCurrency);

    // Populate trade payables fields if they exist
    if (selectedLedger.referenceWiseTracking) setReferenceWiseTracking(selectedLedger.referenceWiseTracking);
    if (selectedLedger.creditPeriod) setCreditPeriod(selectedLedger.creditPeriod);

    // Populate tangible assets fields if they exist
    if (selectedLedger.isDepreciationPerIncomeTax) setIsDepreciationPerIncomeTax(selectedLedger.isDepreciationPerIncomeTax);
    if (selectedLedger.depreciationPercentage) setDepreciationPercentage(selectedLedger.depreciationPercentage);

    // Populate intangible assets fields if they exist
    if (selectedLedger.isAmortizationPerIncomeTax) setIsAmortizationPerIncomeTax(selectedLedger.isAmortizationPerIncomeTax);
    if (selectedLedger.amortizationPercentage) setAmortizationPercentage(selectedLedger.amortizationPercentage);

    // Populate investments in preference shares fields if they exist
    if (selectedLedger.companyCIN) setCompanyCIN(selectedLedger.companyCIN);
    if (selectedLedger.dividendRate) setDividendRate(selectedLedger.dividendRate);
    // Populate investments in equity instruments fields if they exist
    if (selectedLedger.equityInstrumentsCIN) setEquityInstrumentsCIN(selectedLedger.equityInstrumentsCIN);

    // Populate investments in debentures or bonds fields if they exist
    if (selectedLedger.debentureBondCIN) setDebentureBondCIN(selectedLedger.debentureBondCIN);
    if (selectedLedger.debentureBondInterestRate) setDebentureBondInterestRate(selectedLedger.debentureBondInterestRate);
    if (selectedLedger.debentureBondMaturityDate) setDebentureBondMaturityDate(selectedLedger.debentureBondMaturityDate);

    // Populate inventory fields if they exist
    if (selectedLedger.inventoryType) setInventoryType(selectedLedger.inventoryType);
    if (selectedLedger.inventoryValuationMethod) setInventoryValuationMethod(selectedLedger.inventoryValuationMethod);

    // Populate hierarchy fields if they exist
    if (selectedLedger.category) setLedgerCategory(selectedLedger.category);
    if (selectedLedger.sub_group_1) setLedgerSubGroup1(selectedLedger.sub_group_1);
    if (selectedLedger.sub_group_2) setLedgerSubGroup2(selectedLedger.sub_group_2);
    if (selectedLedger.sub_group_3) setLedgerSubGroup3(selectedLedger.sub_group_3);
    if (selectedLedger.ledger_type) setLedgerLedgerType(selectedLedger.ledger_type);

    setIsEditMode(true);
    // Scroll to form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteLedger = async () => {
    if (!selectedLedger) {
      showError('Please select a ledger first by clicking the radio button.');
      return;
    }


    const confirmMessage = `Are you sure you want to delete "${selectedLedger.name}"?`;
    if (!await confirm(confirmMessage)) {
      return;
    }




    if (onDeleteLedger) {
      try {
        const identifier = selectedLedger.id || selectedLedger.name;

        onDeleteLedger(identifier);
        setSelectedLedger(null);
        // Clear form if we were editing this ledger
        if (isEditMode && ledgerName === selectedLedger.name) {
          setLedgerName('');
          setLedgerGroup('Sundry Debtors');
          setIsEditMode(false);
        }
        showSuccess('Ledger deleted successfully');
      } catch (error) {
        handleApiError(error, 'Delete Ledger');
      }

    } else {

      showError('Delete function is not available.');
    }

  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
    setSelectedLedger(null);
    setLedgerName('');
    setLedgerGroup('');
    setLoanAccountNumber('');
    setPanGstin('');
    setLenderName('');
    setLoanAmount('');
    setInterestType('');
    setInterestRate('');
    setTenure('');
    setBankAccountNumber('');
    setGstinPan('');
    setEnableBankReconciliation(false);
    setBankName('');
    setIfscCode('');
    setBranch('');
    setBankingCurrency('');
    setInventoryType('');
    setInventoryValuationMethod('');
  };

  const handleGroupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;

    // Validate: Check for duplicate group names (case-insensitive)
    const trimmedGroupName = groupName.trim();
    const isDuplicate = ledgerGroups.some(
      g => g.name.toLowerCase() === trimmedGroupName.toLowerCase() &&
        (!isEditModeGroup || g.name !== selectedGroup?.name)
    );

    if (isDuplicate) {
      showError(`Group "${trimmedGroupName}" already exists. Please use a different name.`);
      return;
    }


    if (isEditModeGroup && selectedGroup) {
      if (onUpdateLedgerGroup) {
        const identifier = selectedGroup.id || selectedGroup.name;

        onUpdateLedgerGroup(identifier as number, { name: trimmedGroupName, under: groupUnder });
      }
      setIsEditModeGroup(false);
      setSelectedGroup(null);
    } else {
      // Create new group

      onAddLedgerGroup({ name: trimmedGroupName, under: groupUnder });
    }
    // Reset form
    setGroupName('');
    setGroupUnder('');
  };

  const handleEditGroup = () => {
    if (!selectedGroup) {
      showError('Please select a group first by clicking the radio button.');
      return;
    }


    setGroupName(selectedGroup.name);
    setGroupUnder(selectedGroup.under);
    setIsEditModeGroup(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteGroup = async () => {
    if (!selectedGroup) {
      showError('Please select a group first by clicking the radio button.');
      return;
    }


    const confirmMessage = `Are you sure you want to delete "${selectedGroup.name}"?`;
    if (!await confirm(confirmMessage)) {
      return;
    }




    if (onDeleteLedgerGroup) {
      try {
        const identifier = selectedGroup.id || selectedGroup.name;
        onDeleteLedgerGroup(identifier as number);
        setSelectedGroup(null);
        if (isEditModeGroup && groupName === selectedGroup.name) {
          setGroupName('');
          setGroupUnder('Current Assets');
          setIsEditModeGroup(false);
        }
        showSuccess('Group deleted successfully');
      } catch (error) {
        handleApiError(error, 'Delete Group');
      }

    } else {

      showError('Delete function is not available.');
    }

  };

  const handleCancelEditGroup = () => {
    setIsEditModeGroup(false);
    setSelectedGroup(null);
    setGroupName('');
    setGroupUnder('');
  };

  // Helper to get endpoint based on voucher type
  const getVoucherEndpoint = (voucherType: string) => {
    switch (voucherType) {
      case 'sales': return '/api/masters/master-voucher-sales/';
      case 'credit-note': return '/api/masters/master-voucher-creditnote/';
      case 'receipts': return '/api/masters/master-voucher-receipts/';
      case 'purchases': return '/api/masters/master-voucher-purchases/';
      case 'debit-note': return '/api/masters/master-voucher-debitnote/';
      case 'payments': return '/api/masters/master-voucher-payments/';
      case 'expenses': return '/api/masters/master-voucher-expenses/';
      case 'journal': return '/api/masters/master-voucher-journal/';
      case 'contra': return '/api/masters/master-voucher-contra/';
      default: return '/api/masters/master-voucher-sales/';
    }
  };

  // Fetch existing voucher configurations
  const fetchVoucherConfigurations = async () => {
    try {
      if (!selectedVoucher) return;
      const endpoint = getVoucherEndpoint(selectedVoucher);
      const configs = await httpClient.get<any[]>(endpoint);
      setExistingVouchers(configs || []);
    } catch (error) {
      handleApiError(error, 'Fetch Voucher Configurations');
      setExistingVouchers([]);
    }
  };

  // Load voucher configurations when Vouchers tab is active or selected voucher changes
  useEffect(() => {
    if (activeTab === 'Vouchers') {
      fetchVoucherConfigurations();
    }
  }, [activeTab, selectedVoucher]);

  // Reset voucher form
  const resetVoucherForm = () => {
    setVoucherName('');
    setEnableAutoNumbering(true);
    setVoucherPrefix('');
    setVoucherSuffix('');
    setVoucherStartFrom(1);
    setVoucherRequiredDigits(4);
    setSelectedVoucherConfig(null);
    setIsEditModeVoucher(false);
    setVoucherFormError('');
  };

  // Handle voucher configuration form submit
  const handleVoucherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVoucherFormError('');

    // Validation
    if (!voucherName.trim()) {
      setVoucherFormError('Voucher name is required');
      return;
    }

    // Validate voucher number length (Prefix + Required Digits + Suffix <= 16)
    const prefixLen = voucherPrefix?.length || 0;
    const suffixLen = voucherSuffix?.length || 0;
    const digitsLen = voucherRequiredDigits || 0;
    const totalLen = prefixLen + digitsLen + suffixLen;

    if (totalLen > 16) {
      setVoucherFormError(`Total length (${totalLen}) exceeds 16 characters limit (Prefix: ${prefixLen} + Digits: ${digitsLen} + Suffix: ${suffixLen}). GST allows max 16 digits.`);
      return;
    }

    try {
      const payload = {
        voucher_name: voucherName.trim(),
        enable_auto_numbering: enableAutoNumbering,
        prefix: voucherPrefix,
        suffix: voucherSuffix,
        start_from: voucherStartFrom,
        required_digits: voucherRequiredDigits
      };

      const endpoint = getVoucherEndpoint(selectedVoucher);

      const isUpdate = isEditModeVoucher && selectedVoucherConfig?.id;
      const url = isUpdate
        ? `${endpoint}${selectedVoucherConfig.id}/`
        : endpoint;

      let response;
      if (isUpdate) {
        response = await httpClient.put(url, payload);
      } else {
        response = await httpClient.post(url, payload);
      }

      // Success - refresh the list and reset form
      await fetchVoucherConfigurations();
      resetVoucherForm();
      showSuccess(isEditModeVoucher ? 'Voucher configuration updated successfully!' : 'Voucher configuration created successfully!');

    } catch (error: any) {
      handleApiError(error, 'Save Voucher Configuration');
      // Set form error just in case we need validation feedback in UI too, 
      // but handleApiError shows toast.
    }
  };

  // Handle edit voucher configuration
  const handleEditVoucherConfig = () => {
    if (!selectedVoucherConfig) {
      showError('Please select a voucher configuration first');
      return;
    }


    setVoucherName(selectedVoucherConfig.voucher_name || '');
    setEnableAutoNumbering(selectedVoucherConfig.enable_auto_numbering ?? true);
    setVoucherPrefix(selectedVoucherConfig.prefix || '');
    setVoucherSuffix(selectedVoucherConfig.suffix || '');
    setVoucherStartFrom(selectedVoucherConfig.start_from || 1);
    setVoucherRequiredDigits(selectedVoucherConfig.required_digits || 4);
    setIsEditModeVoucher(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle delete voucher configuration
  const handleDeleteVoucherConfig = async () => {
    if (!selectedVoucherConfig) {
      showError('Please select a voucher configuration first');
      return;
    }


    if (!await confirm(`Are you sure you want to delete "${selectedVoucherConfig.voucher_name}"?`)) {
      return;
    }


    try {
      const endpoint = getVoucherEndpoint(selectedVoucher);
      await httpClient.delete(`${endpoint}${selectedVoucherConfig.id}/`);
      await fetchVoucherConfigurations();
      resetVoucherForm();
      showSuccess('Voucher configuration deleted successfully!');
    } catch (error) {
      handleApiError(error, 'Delete Voucher Configuration');
    }

  };

  const handleAddVoucherType = (e: React.FormEvent) => {
    e.preventDefault();
    if (newVoucherType.trim() && onAddVoucherType) {
      onAddVoucherType({ name: newVoucherType.trim(), description: '' });
      setNewVoucherType('');
    }
  };


  const renderLedgers = () => (
    <div className="w-full">

      {/* Create Ledger - RIGHT COLUMN */}
      <div className="bg-white p-6 rounded-[4px] erp-card">
        <form onSubmit={handleLedgerSubmit} className="space-y-4">
          {/* Progressive Ledger Selection Wizard */}
          <LedgerCreationWizard
            onCreateLedger={(data) => {
              // Create the ledger object with all hierarchy data
              const newLedger: Ledger = {
                name: data.customName,
                group: data.group || '',
                category: data.category || undefined,
                sub_group_1: data.sub_group_1 || undefined,
                sub_group_2: data.sub_group_2 || undefined,
                sub_group_3: data.sub_group_3 || undefined,
                ledger_type: data.ledger_type || undefined,
                parent_ledger_id: data.parent_ledger_id || undefined,
                question_answers: data.question_answers
              };

              // Directly add the ledger
              if (!ledgers.find(l => l.name.toLowerCase() === newLedger.name.toLowerCase())) {
                onAddLedger(newLedger);
              } else {
                showError('A ledger with this name already exists!');
              }
            }}

          />

          {/* Conditional fields for Secured Loans */}
          {(ledgerGroup === 'Secured Loans' || ledgerGroup === 'Unsecured Loans' || ledgerGroup === 'Secured Loans (Short term)' || ledgerGroup === 'Unsecured Loans (Short term)') && (
            <>
              <div>
                <label htmlFor="loanAccountNumber" className="block text-sm font-medium text-gray-500 mb-1">
                  Loan Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="loanAccountNumber"
                  value={loanAccountNumber}
                  onChange={(e) => setLoanAccountNumber(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter alphanumeric account number"
                  required
                />
              </div>

              <div>
                <label htmlFor="panGstin" className="block text-sm font-medium text-gray-500 mb-1">
                  PAN/GSTIN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="panGstin"
                  value={panGstin}
                  onChange={(e) => setPanGstin(e.target.value.toUpperCase())}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter PAN or GSTIN"
                  required
                />
              </div>

              <div>
                <label htmlFor="lenderName" className="block text-sm font-medium text-gray-500 mb-1">Lender Name</label>
                <input
                  type="text"
                  id="lenderName"
                  value={lenderName}
                  onChange={(e) => setLenderName(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter lender name"
                  required
                />
              </div>

              <div>
                <label htmlFor="loanAmount" className="block text-sm font-medium text-gray-500 mb-1">
                  Loan Amount <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="loanAmount"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter loan amount"
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Interest Type</label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="fixedInterest"
                      name="interestType"
                      value="Fixed"
                      checked={interestType === 'Fixed'}
                      onChange={(e) => setInterestType(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      required
                    />
                    <label htmlFor="fixedInterest" className="ml-2 text-sm text-gray-700">Fixed</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="floatingInterest"
                      name="interestType"
                      value="Floating"
                      checked={interestType === 'Floating'}
                      onChange={(e) => setInterestType(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="floatingInterest" className="ml-2 text-sm text-gray-700">Floating</label>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="interestRate" className="block text-sm font-medium text-gray-500 mb-1">
                  Interest Rate (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="interestRate"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter interest rate"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                />
              </div>

              <div>
                <label htmlFor="tenure" className="block text-sm font-medium text-gray-500 mb-1">Tenure (Months)</label>
                <input
                  type="number"
                  id="tenure"
                  value={tenure}
                  onChange={(e) => setTenure(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter tenure in months"
                  min="1"
                  required
                />
              </div>
            </>
          )}

          {/* Conditional fields for Bank OD/CC Accounts  */}

          {ledgerGroup === 'Bank OD/CC Accounts' && (
            <>
              <div>
                <label htmlFor="bankAccountNumber" className="block text-sm font-medium text-gray-500 mb-1">
                  Bank Account Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="bankAccountNumber"
                  value={bankAccountNumber}
                  onChange={(e) => setBankAccountNumber(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter bank account number"
                  required
                />
              </div>

              <div>
                <label htmlFor="gstinPan" className="block text-sm font-medium text-gray-500 mb-1">GSTIN/PAN</label>
                <input
                  type="text"
                  id="gstinPan"
                  value={gstinPan}
                  onChange={(e) => setGstinPan(e.target.value.toUpperCase())}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter GSTIN or PAN"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="enableBankReconciliation"
                  checked={enableBankReconciliation}
                  onChange={(e) => setEnableBankReconciliation(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  required
                />
                <label htmlFor="enableBankReconciliation" className="ml-2 text-sm font-medium text-gray-700">
                  Enable Bank Reconciliation <span className="text-red-500">*</span>
                </label>
              </div>

              <div>
                <label htmlFor="bankName" className="block text-sm font-medium text-gray-500 mb-1">Bank Name</label>
                <input
                  type="text"
                  id="bankName"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter bank name"
                />
              </div>

              <div>
                <label htmlFor="ifscCode" className="block text-sm font-medium text-gray-500 mb-1">
                  IFSC Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="ifscCode"
                  value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter IFSC code"
                  required
                />
              </div>

              <div>
                <label htmlFor="branch" className="block text-sm font-medium text-gray-500 mb-1">
                  Branch <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter branch name"
                  required
                />
              </div>

              <div>
                <label htmlFor="bankingCurrency" className="block text-sm font-medium text-gray-500 mb-1">
                  Banking Currency <span className="text-red-500">*</span>
                </label>
                <select
                  id="bankingCurrency"
                  value={bankingCurrency}
                  onChange={(e) => setBankingCurrency(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-[4px]"
                  required
                >
                  <option value="">Select currency</option>
                  <option value="INR">INR - Indian Rupee</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="EUR">EUR - Euro</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="AED">AED - UAE Dirham</option>
                  <option value="SGD">SGD - Singapore Dollar</option>
                </select>
              </div>
            </>

          )}

          {/* Conditional fields for Trade Payables  */}

          {ledgerGroup === 'Trade Payables' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Reference-wise Tracking</label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="refTrackingYes"
                      name="referenceWiseTracking"
                      value="Yes"
                      checked={referenceWiseTracking === 'Yes'}
                      onChange={(e) => setReferenceWiseTracking(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="refTrackingYes" className="ml-2 text-sm text-gray-700">Yes</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="refTrackingNo"
                      name="referenceWiseTracking"
                      value="No"
                      checked={referenceWiseTracking === 'No'}
                      onChange={(e) => setReferenceWiseTracking(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="refTrackingNo" className="ml-2 text-sm text-gray-700">No</label>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="creditPeriod" className="block text-sm font-medium text-gray-500 mb-1">Please enter credit period</label>
                <input
                  type="number"
                  id="creditPeriod"
                  value={creditPeriod}
                  onChange={(e) => setCreditPeriod(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter credit period (in days)"
                  min="0"
                />
              </div>
            </>

          )}

          {/* Conditional fields for Inventories  */}

          {ledgerGroup === 'Inventories' && (
            <>
              <div>
                <label htmlFor="inventoryType" className="block text-sm font-medium text-gray-500 mb-1">
                  Specify type of inventory <span className="text-red-500">*</span>
                </label>
                <select
                  id="inventoryType"
                  value={inventoryType}
                  onChange={(e) => setInventoryType(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-[4px]"
                  required
                >
                  <option value="">Select inventory type</option>
                  <option value="Raw Materials">Raw Materials</option>
                  <option value="Work in Progress (WIP)">Work in Progress (WIP)</option>
                  <option value="Finished Goods">Finished Goods</option>
                  <option value="Trading Goods">Trading Goods</option>
                  <option value="Consumables">Consumables</option>
                  <option value="Packing Materials">Packing Materials</option>
                </select>
              </div>

              <div>
                <label htmlFor="inventoryValuationMethod" className="block text-sm font-medium text-gray-500 mb-1">
                  Specify valuation method <span className="text-red-500">*</span>
                </label>
                <select
                  id="inventoryValuationMethod"
                  value={inventoryValuationMethod}
                  onChange={(e) => setInventoryValuationMethod(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-[4px]"
                  required
                >
                  <option value="">Select valuation method</option>
                  <option value="FIFO (First In, First Out)">FIFO (First In, First Out)</option>
                  <option value="LIFO (Last In, First Out)">LIFO (Last In, First Out)</option>
                  <option value="Weighted Average">Weighted Average</option>
                  <option value="Specific Identification">Specific Identification</option>
                </select>
              </div>
            </>

          )}

          {/* Conditional fields for Tangible assets  */}

          {ledgerGroup === 'Tangible assets' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Is depreciation calculated as per Income Tax Act? <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="depreciationYes"
                      name="isDepreciationPerIncomeTax"
                      value="Yes"
                      checked={isDepreciationPerIncomeTax === 'Yes'}
                      onChange={(e) => setIsDepreciationPerIncomeTax(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      required
                    />
                    <label htmlFor="depreciationYes" className="ml-2 text-sm text-gray-700">Yes</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="depreciationNo"
                      name="isDepreciationPerIncomeTax"
                      value="No"
                      checked={isDepreciationPerIncomeTax === 'No'}
                      onChange={(e) => setIsDepreciationPerIncomeTax(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="depreciationNo" className="ml-2 text-sm text-gray-700">No</label>
                  </div>
                </div>
              </div>

              {isDepreciationPerIncomeTax === 'Yes' && (
                <div>
                  <label htmlFor="depreciationPercentage" className="block text-sm font-medium text-gray-500 mb-1">
                    Confirm the depreciation percentage <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="depreciationPercentage"
                    value={depreciationPercentage}
                    onChange={(e) => setDepreciationPercentage(e.target.value)}
                    className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Enter depreciation percentage"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => showInfo('Update Fixed Assets Register functionality coming soon!')}
                className="inline-flex items-center justify-center w-full px-4 py-2 border border-indigo-600 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-indigo-600 bg-white hover:bg-indigo-50/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Icon name="document" className="w-4 h-4 mr-2" />
                Update Fixed Assets Register
              </button>
            </>

          )}

          {/* Conditional fields for Intangible Assets  */}

          {ledgerGroup === 'Intangible Assets' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Is amortization calculated as per Income Tax Act? <span className="text-red-500">*</span>
                </label>
                <div className="space-y-2">
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="amortizationYes"
                      name="isAmortizationPerIncomeTax"
                      value="Yes"
                      checked={isAmortizationPerIncomeTax === 'Yes'}
                      onChange={(e) => setIsAmortizationPerIncomeTax(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                      required
                    />
                    <label htmlFor="amortizationYes" className="ml-2 text-sm text-gray-700">Yes</label>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="radio"
                      id="amortizationNo"
                      name="isAmortizationPerIncomeTax"
                      value="No"
                      checked={isAmortizationPerIncomeTax === 'No'}
                      onChange={(e) => setIsAmortizationPerIncomeTax(e.target.value)}
                      className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    <label htmlFor="amortizationNo" className="ml-2 text-sm text-gray-700">No</label>
                  </div>
                </div>
              </div>

              {isAmortizationPerIncomeTax === 'Yes' && (
                <div>
                  <label htmlFor="amortizationPercentage" className="block text-sm font-medium text-gray-500 mb-1">
                    Confirm the percentage <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    id="amortizationPercentage"
                    value={amortizationPercentage}
                    onChange={(e) => setAmortizationPercentage(e.target.value)}
                    className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="Enter amortization percentage"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => showInfo('Update Fixed Assets Register functionality coming soon!')}
                className="inline-flex items-center justify-center w-full px-4 py-2 border border-indigo-600 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-indigo-600 bg-white hover:bg-indigo-50/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Icon name="document" className="w-4 h-4 mr-2" />
                Update Fixed Assets Register
              </button>
            </>

          )}

          {/* Conditional fields for Investments in preference shares  */}

          {(ledgerGroup === 'Investments in preference shares' || ledgerGroup === 'Investments in preference shares (Current)') && (
            <>
              <div>
                <label htmlFor="companyCIN" className="block text-sm font-medium text-gray-500 mb-1">Provide Company's CIN</label>
                <input
                  type="text"
                  id="companyCIN"
                  value={companyCIN}
                  onChange={(e) => setCompanyCIN(e.target.value.toUpperCase())}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter Company's CIN"
                />
              </div>

              <div>
                <label htmlFor="dividendRate" className="block text-sm font-medium text-gray-500 mb-1">Dividend Rate (%)</label>
                <input
                  type="number"
                  id="dividendRate"
                  value={dividendRate}
                  onChange={(e) => setDividendRate(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter dividend rate"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>
            </>

          )}

          {/* Conditional fields for Investments in debentures or bonds  */}

          {(ledgerGroup === 'Investments in debentures or bonds' || ledgerGroup === 'Investments in debentures or bonds (Current)') && (
            <>
              <div>
                <label htmlFor="debentureBondCIN" className="block text-sm font-medium text-gray-500 mb-1">
                  Provide Company's CIN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="debentureBondCIN"
                  value={debentureBondCIN}
                  onChange={(e) => setDebentureBondCIN(e.target.value.toUpperCase())}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter Company's CIN"
                  required
                />
              </div>
              <div>
                <label htmlFor="debentureBondInterestRate" className="block text-sm font-medium text-gray-500 mb-1">
                  Interest Rate (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="debentureBondInterestRate"
                  value={debentureBondInterestRate}
                  onChange={(e) => setDebentureBondInterestRate(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter interest rate"
                  min="0"
                  max="100"
                  step="0.01"
                  required
                />
              </div>
              <div>
                <label htmlFor="debentureBondMaturityDate" className="block text-sm font-medium text-gray-500 mb-1">
                  Maturity Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  id="debentureBondMaturityDate"
                  value={debentureBondMaturityDate}
                  onChange={(e) => setDebentureBondMaturityDate(e.target.value)}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  required
                />
              </div>
            </>

          )}
          {/* Conditional fields for Investments in equity instruments  */}

          {(ledgerGroup === 'Investments in equity instruments' || ledgerGroup === 'Investments in equity instruments (Current)') && (
            <>
              <div>
                <label htmlFor="equityInstrumentsCIN" className="block text-sm font-medium text-gray-500 mb-1">Provide Company's CIN</label>
                <input
                  type="text"
                  id="equityInstrumentsCIN"
                  value={equityInstrumentsCIN}
                  onChange={(e) => setEquityInstrumentsCIN(e.target.value.toUpperCase())}
                  className="block w-full px-3 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Enter Company's CIN"
                />
              </div>
            </>

          )}

          {/* Conditional fields for Capital work-in-progress and Intangible assets under development  */}

          {(ledgerGroup === 'Capital work-in-progress' || ledgerGroup === 'Intangible assets under development') && (
            <>
              <button
                type="button"
                onClick={() => showInfo('Update Fixed Assets Register functionality coming soon!')}
                className="inline-flex items-center justify-center w-full px-4 py-2 border border-indigo-600 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-indigo-600 bg-white hover:bg-indigo-50/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Icon name="document" className="w-4 h-4 mr-2" />
                Update Fixed Assets Register
              </button>
            </>

          )}

        </form>
      </div>
    </div >
  );

  const renderLedgerGroups = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white p-6 rounded-[4px] erp-card">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Create Group</h3>
        <form onSubmit={handleGroupSubmit} className="space-y-4">
          <div>
            <label htmlFor="groupName" className="block text-sm font-medium text-gray-500 mb-1">
              Group Name
            </label>
            <input
              type="text"
              id="groupName"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
              className="block w-full px-3 py-2 bg-white erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>
          <div>
            <label htmlFor="groupUnder" className="block text-sm font-medium text-gray-500 mb-1">Under</label>
            <select
              id="groupUnder"
              value={groupUnder}
              onChange={(e) => setGroupUnder(e.target.value)}
              className="block w-full pl-3 pr-10 py-2 text-base border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-[4px]"
              required
            >
              <option value="">Select Parent Group</option>

              {ledgerGroups.length > 0 && (
                ledgerGroups.map(g => (
                  <option key={g.id || g.name} value={g.name}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
          </div>
          <button
            type="submit"
            className={`inline-flex items-center justify-center w-full px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white ${isEditModeGroup ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-600 hover:bg-indigo-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500`}
          >
            <Icon name={isEditModeGroup ? "save" : "plus"} className="w-4 h-4 mr-2" />
            {isEditModeGroup ? 'Update Group' : 'Create Group'}
          </button>
          {isEditModeGroup && (
            <button
              type="button"
              onClick={handleCancelEditGroup}
              className="mt-2 inline-flex items-center justify-center w-full px-4 py-2 border border-gray-300 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
            >
              Cancel Edit
            </button>
          )}
        </form>
      </div>
      <div className="bg-white rounded-[4px] erp-card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Existing Groups</h3>
          <div className="relative">
            <input
              type="text"
              placeholder="Search groups..."
              value={groupSearchQuery}
              onChange={(e) => setGroupSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 erp-input leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Icon name="search" className="h-5 w-5 text-gray-400" />
            </div>
            {groupSearchQuery && (
              <button
                onClick={() => setGroupSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
              >
                <Icon name="x" className="h-5 w-5 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th scope="col" className="w-12 px-6 py-3"></th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Group Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Under</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {ledgerGroups.filter(group =>
                group.name.toLowerCase().includes(groupSearchQuery.toLowerCase()) ||
                (group.under && group.under.toLowerCase().includes(groupSearchQuery.toLowerCase()))
              ).map(group => {
                const isSelected = selectedGroup?.name === group.name;

                return (
                  <tr
                    key={group.id || group.name}
                    className={`transition-colors ${isSelected
                      ? 'bg-indigo-50/50 hover:bg-indigo-50'
                      : 'hover:bg-gray-50'
                      } `}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="radio"
                        name="selectedGroup"
                        value={group.name}
                        checked={isSelected}
                        onChange={() => {

                          setSelectedGroup(group);
                        }}
                        className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        aria-label={`Select ${group.name} `}
                      />
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 cursor-pointer"
                      onClick={() => {

                        setSelectedGroup(group);
                      }}
                    >
                      {group.name}
                    </td>
                    <td
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 cursor-pointer"
                      onClick={() => setSelectedGroup(group)}
                    >
                      {group.under ? (
                        <span className="text-gray-900 font-medium">{group.under}</span>
                      ) : (
                        <span className="text-gray-400 italic">Primary</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {isSelected ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={handleEditGroup}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700 shadow-none border border-slate-200 hover:shadow-none border border-slate-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            style={{ lineHeight: '1' }}
                            aria-label="Edit selected group"
                          >
                            <Icon name="edit" className="w-4 h-4 flex-shrink-0" />
                            Edit
                          </button>
                          <button
                            onClick={handleDeleteGroup}
                            className="inline-flex items-center justify-center w-10 h-10 rounded-[4px] text-white bg-red-600 hover:bg-red-700 shadow-none border border-slate-200 hover:shadow-none border border-slate-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                            aria-label="Delete selected group"
                            title="Delete"
                          >
                            <Icon name="trash" className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs italic">Select to edit</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Update preview for sales
  useEffect(() => {
    const padded = salesNumbering.nextNumber.toString().padStart(salesNumbering.padding, '0');
    let newPreview = '';
    if (salesNumbering.enableAuto) {
      newPreview = padded + (salesNumbering.suffix || '');
    }
    setSalesNumbering(prev => ({ ...prev, preview: newPreview }));
  }, [salesNumbering.enableAuto, salesNumbering.nextNumber, salesNumbering.padding, salesNumbering.suffix]);

  // Update preview for purchase
  useEffect(() => {
    const padded = purchaseNumbering.nextNumber.toString().padStart(purchaseNumbering.padding, '0');
    let newPreview = '';
    if (purchaseNumbering.enableAuto) {
      newPreview = (purchaseNumbering.prefix || '') + padded + (purchaseNumbering.suffix || '');
    }
    setPurchaseNumbering(prev => ({ ...prev, preview: newPreview }));
  }, [purchaseNumbering.enableAuto, purchaseNumbering.prefix, purchaseNumbering.nextNumber, purchaseNumbering.padding, purchaseNumbering.suffix]);

  const renderVouchers = () => {

    // voucherButtons is now defined at top level

    const handleVoucherClick = (voucherId: string) => {

      setSelectedVoucher(voucherId);
      // TODO: Add navigation or action logic here
    };

    // Get today's date in YYYY-MM-DD format for min date restriction
    const today = new Date().toISOString().split('T')[0];

    // Calculate financial year end (31st March)
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1; // January is 0
    // If we're past March (month > 3), financial year end is next year's March 31st
    const financialYearEndYear = currentMonth > 3 ? currentYear + 1 : currentYear;
    const financialYearEnd = `${financialYearEndYear}-03-31`;

    return (
      <div className="space-y-6">
        {/* Select Voucher Type Header */}
        <div className="text-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Select Voucher Type</h2>
        </div>

        {/* Voucher Type Tabs - Horizontal Navigation */}
        <nav className="flex space-x-8 border-b border-gray-200 justify-center mb-6" aria-label="Voucher Types">
          {voucherButtons.map((voucher, index) => {
            const isSelected = selectedVoucher === voucher.id;
            return (
              <button
                key={voucher.id}
                onClick={() => handleVoucherClick(voucher.id)}
                className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors uppercase ${isSelected
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {voucher.label}
              </button>
            );
          })}
        </nav>

        {/* Sales Voucher Form with Existing Vouchers Table */}
        {selectedVoucher === 'sales' && (
          <div className="erp-card p-6 border border-gray-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Sales Voucher Configuration */}
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-6">Sales</h3>

                {/* Error Message */}
                {voucherFormError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-[4px]">
                    <p className="text-sm text-red-600">{voucherFormError}</p>
                  </div>
                )}

                <form onSubmit={handleVoucherSubmit} className="space-y-6">
                  {/* Voucher Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Voucher Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={voucherName}
                      onChange={(e) => setVoucherName(e.target.value)}
                      className="w-full max-w-md px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter voucher name"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">Data Validation: Text</p>
                  </div>

                  {/* Enable Automatic Numbering Series */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="enableAutoNumbering"
                      checked={enableAutoNumbering}
                      onChange={(e) => setEnableAutoNumbering(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="enableAutoNumbering" className="ml-2 text-sm font-medium text-gray-700">
                      Enable Automatic Numbering Series
                    </label>
                  </div>

                  {/* Prefix and Suffix */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prefix <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={voucherPrefix}
                        onChange={(e) => setVoucherPrefix(e.target.value)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., INV-"
                        pattern="[a-zA-Z0-9/\-]*"
                        title="Only alphanumeric characters, slash (/), and hyphen (-) are allowed"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">Alphanumeric (With / Slash and - Hyphen)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Suffix <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={voucherSuffix}
                        onChange={(e) => setVoucherSuffix(e.target.value)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., /24-25"
                        pattern="[a-zA-Z0-9/\-]*"
                        title="Only alphanumeric characters, slash (/), and hyphen (-) are allowed"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">Alphanumeric (With / Slash and - Hyphen)</p>
                    </div>
                  </div>

                  {/* Start From and Required Digits */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start From
                      </label>
                      <input
                        type="number"
                        value={voucherStartFrom}
                        onChange={(e) => setVoucherStartFrom(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="1"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Required Digits
                      </label>
                      <input
                        type="number"
                        value={voucherRequiredDigits}
                        onChange={(e) => setVoucherRequiredDigits(parseInt(e.target.value) || 4)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="4"
                        min="1"
                      />
                      <p className={`mt-1 text-xs ${(voucherPrefix?.length || 0) + (voucherRequiredDigits || 0) + (voucherSuffix?.length || 0) > 16 ? 'text-red-500' : 'text-gray-500'}`}>
                        Total Length: {(voucherPrefix?.length || 0) + (voucherRequiredDigits || 0) + (voucherSuffix?.length || 0)}/16 (GST Limit)
                      </p>
                    </div>
                  </div>



                  {/* Voucher Preview */}
                  <div className="mt-6 p-6 bg-gray-100 rounded-[4px] flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      SAMPLE PREVIEW
                    </span>
                    <p className="text-xl font-bold text-gray-800 tracking-wide">
                      {voucherPrefix || ''}
                      {String(voucherStartFrom || 1).padStart(voucherRequiredDigits || 4, '0')}
                      {voucherSuffix || ''}
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end gap-3 pt-4">
                    {isEditModeVoucher && (
                      <button
                        type="button"
                        onClick={resetVoucherForm}
                        className="px-8 py-3 bg-gray-500 text-white font-semibold rounded-[4px] hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-[4px] hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                    >
                      {isEditModeVoucher ? 'Update' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column - Existing Vouchers */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Existing Vouchers</h3>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">SELECT</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">VOUCHER NAME</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">VOUCHER SERIES PREVIEW (LAST SERIES)</th>

                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingVouchers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-12 text-center">
                            <p className="text-sm text-gray-400">No vouchers configured yet</p>
                          </td>
                        </tr>
                      ) : (
                        existingVouchers
                          .map((voucher) => {
                            const isSelected = selectedVoucherConfig?.id === voucher.id;
                            const seriesPreview = voucher.enable_auto_numbering
                              ? `${voucher.prefix || ''}${String(voucher.current_number || voucher.start_from || 1).padStart(voucher.required_digits || 4, '0')}${voucher.suffix || ''}`
                              : 'Manual';

                            return (
                              <tr
                                key={voucher.id}
                                className={`transition-colors ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-gray-50'}`}
                              >
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <input
                                    type="radio"
                                    name="selectedVoucherConfig"
                                    checked={isSelected}
                                    onChange={() => setSelectedVoucherConfig(voucher)}
                                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {voucher.voucher_name}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                                  {seriesPreview}
                                </td>

                                <td className="px-3 py-3 whitespace-nowrap text-sm">
                                  {isSelected ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={handleEditVoucherConfig}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        onClick={handleDeleteVoucherConfig}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-[4px] text-white bg-red-600 hover:bg-red-700 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">Select to edit</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}


        {/* Other Vouchers Form - For all vouchers except Sales */}
        {selectedVoucher !== 'sales' && (
          <div className="erp-card p-6 border border-gray-200">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Voucher Configuration */}
              <div>
                <h3 className="text-xl font-bold text-gray-800 mb-6">
                  {voucherButtons.find(v => v.id === selectedVoucher)?.label}
                </h3>
                <form onSubmit={handleVoucherSubmit} className="space-y-6">
                  {/* Voucher Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Voucher Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={voucherName}
                      onChange={(e) => setVoucherName(e.target.value)}
                      className="w-full max-w-md px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter voucher name"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">Data Validation: Text</p>
                  </div>

                  {/* Enable Automatic Numbering Series */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="otherEnableAutoNumbering"
                      checked={enableAutoNumbering}
                      onChange={(e) => setEnableAutoNumbering(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="otherEnableAutoNumbering" className="ml-2 text-sm font-medium text-gray-700">
                      Enable Automatic Numbering Series
                    </label>
                  </div>

                  {/* Prefix and Suffix */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prefix <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={voucherPrefix}
                        onChange={(e) => setVoucherPrefix(e.target.value)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., CN-"
                        pattern="[a-zA-Z0-9/\-]*"
                        title="Only alphanumeric characters, slash (/), and hyphen (-) are allowed"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">Alphanumeric (With / Slash and - Hyphen)</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Suffix <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={voucherSuffix}
                        onChange={(e) => setVoucherSuffix(e.target.value)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., /24-25"
                        pattern="[a-zA-Z0-9/\-]*"
                        title="Only alphanumeric characters, slash (/), and hyphen (-) are allowed"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">Alphanumeric (With / Slash and - Hyphen)</p>
                    </div>
                  </div>

                  {/* Start From and Required Digits */}
                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start From
                      </label>
                      <input
                        type="number"
                        value={voucherStartFrom}
                        onChange={(e) => setVoucherStartFrom(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="1"
                        min="1"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Required Digits
                      </label>
                      <input
                        type="number"
                        value={voucherRequiredDigits}
                        onChange={(e) => setVoucherRequiredDigits(parseInt(e.target.value) || 4)}
                        className="w-full px-4 py-2 erp-input focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="4"
                        min="1"
                      />
                      <p className={`mt-1 text-xs ${(voucherPrefix?.length || 0) + (voucherRequiredDigits || 0) + (voucherSuffix?.length || 0) > 16 ? 'text-red-500' : 'text-gray-500'}`}>
                        Total Length: {(voucherPrefix?.length || 0) + (voucherRequiredDigits || 0) + (voucherSuffix?.length || 0)}/16 (GST Limit)
                      </p>
                    </div>
                  </div>



                  {/* Voucher Preview */}
                  <div className="mt-6 p-6 bg-gray-100 rounded-[4px] flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      SAMPLE PREVIEW
                    </span>
                    <p className="text-xl font-bold text-gray-800 tracking-wide">
                      {voucherPrefix || ''}
                      {String(voucherStartFrom || 1).padStart(voucherRequiredDigits || 4, '0')}
                      {voucherSuffix || ''}
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end gap-3 pt-4">
                    {isEditModeVoucher && (
                      <button
                        type="button"
                        onClick={resetVoucherForm}
                        className="px-8 py-3 bg-gray-500 text-white font-semibold rounded-[4px] hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors duration-200"
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-8 py-3 bg-indigo-600 text-white font-semibold rounded-[4px] hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors duration-200"
                    >
                      {isEditModeVoucher ? 'Update' : 'Save'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column - Existing Vouchers */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Existing Vouchers</h3>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">SELECT</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">VOUCHER NAME</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">VOUCHER SERIES PREVIEW (LAST SERIES)</th>

                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-600 uppercase">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existingVouchers.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-3 py-12 text-center">
                            <p className="text-sm text-gray-400">No vouchers configured yet</p>
                          </td>
                        </tr>
                      ) : (
                        existingVouchers
                          .map((voucher) => {
                            const isSelected = selectedVoucherConfig?.id === voucher.id;
                            const seriesPreview = voucher.enable_auto_numbering
                              ? `${voucher.prefix || ''}${String(voucher.current_number || voucher.start_from || 1).padStart(voucher.required_digits || 4, '0')}${voucher.suffix || ''}`
                              : 'Manual';

                            return (
                              <tr
                                key={voucher.id}
                                className={`transition-colors ${isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50' : 'hover:bg-gray-50'}`}
                              >
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <input
                                    type="radio"
                                    name="selectedVoucherConfig"
                                    checked={isSelected}
                                    onChange={() => setSelectedVoucherConfig(voucher)}
                                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                  />
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                                  {voucher.voucher_name}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-700">
                                  {seriesPreview}
                                </td>

                                <td className="px-3 py-3 whitespace-nowrap text-sm">
                                  {isSelected ? (
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={handleEditVoucherConfig}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleDeleteVoucherConfig}
                                        className="px-3 py-1.5 text-xs font-semibold rounded-[4px] text-white bg-red-600 hover:bg-red-700 transition-colors"
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  ) : (
                                    <span className="text-gray-400 text-xs italic">Select to edit</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Accounting Masters</h2>

      <div className="mb-6">
        <nav className="flex space-x-8" aria-label="Tabs">
          {availableTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${activeTab === tab.id
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'Ledgers' ? renderLedgers() : renderVouchers()}
    </div>
  );
};

export default MastersPage;


