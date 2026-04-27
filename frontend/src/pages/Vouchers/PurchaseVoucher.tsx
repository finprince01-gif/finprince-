import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Voucher, VoucherItem, ExtractedInvoiceData, CompanyDetails, Ledger, StockItem } from '../../types';
import { apiService, httpClient } from '../../services';
import { showError, showSuccess, showInfo } from '../../utils/toast';
import SearchableSelect from '../../components/SearchableSelect';
import SearchableDropdown from '../../components/SearchableDropdown';
import CreateVendorModal from '../../components/CreateVendorModal';
import CreateGRNModal from '../../components/CreateGRNModal';
import Icon from '../../components/Icon';
import { ChevronDown } from 'lucide-react';

interface PurchaseVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData: () => void;
    isLimitReached: boolean;
    onLimitReached: () => void;
    onAddVouchers: (vouchers: Voucher[]) => void;
    companyDetails: CompanyDetails;
    ledgers: Ledger[];
    stockItems: StockItem[];
    richVendors: any[];
    vendorGstDetails: any[];
}

const getTodayDate = () => new Date().toISOString().split('T')[0];

const PurchaseVoucher: React.FC<PurchaseVoucherProps> = ({
    prefilledData,
    clearPrefilledData,
    isLimitReached,
    onLimitReached,
    onAddVouchers,
    companyDetails,
    ledgers,
    stockItems,
    richVendors,
    vendorGstDetails
}) => {
    // Move all Purchase-related state from Vouchers.tsx here
    const [date, setDate] = useState(getTodayDate());
    const [invoiceNo, setInvoiceNo] = useState('');
    const [party, setParty] = useState('');
    const [purchaseLedger, setPurchaseLedger] = useState('');
    const [purchaseDescription, setPurchaseDescription] = useState('');

    const isCashBank = useCallback((l: Ledger) => {
        const g = (l.group || '').toLowerCase();
        return g.includes('cash') || g.includes('bank') || g.includes('od') || g.includes('cc');
    }, []);

    const purchasePartyOptions = useMemo(() => {
        // Only vendor ledgers (avoid showing generic ledgers like Output GST)
        const isVendorLedger = (l: Ledger) => {
            const g = (l.group || '').toLowerCase().trim();
            return g.includes('sundry creditors') || g.includes('trade payables');
        };

        return [...new Set([
            ...ledgers.filter(isVendorLedger).map(l => l.name),
            ...richVendors.map(v => v.vendor_name)
        ])].filter(Boolean);
    }, [ledgers, richVendors]);

    const allLedgerOptions = useMemo(() => {
        return [...new Set(ledgers.map(l => l.name))].filter(Boolean);
    }, [ledgers]);

    // For now, just a placeholder to resolve the import error
    return (
        <div className="p-8 bg-white rounded-lg border border-gray-200">
            <h2 className="text-xl font-bold mb-4">Purchase Voucher</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-left">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                    <SearchableDropdown
                        options={purchasePartyOptions}
                        value={party}
                        onChange={setParty}
                        placeholder="Select Vendor"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Ledger</label>
                    <SearchableDropdown
                        options={allLedgerOptions}
                        value={purchaseLedger}
                        onChange={setPurchaseLedger}
                        placeholder="Select Purchase Ledger"
                    />
                </div>
            </div>

            <p className="text-gray-600 mb-6">Component architecture ready. Migrating full logic from Vouchers.tsx...</p>
        </div>
    );
};

export default PurchaseVoucher;
