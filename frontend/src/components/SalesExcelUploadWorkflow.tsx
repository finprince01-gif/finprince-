import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../services';
import { showError, showSuccess, showInfo } from '../utils/toast';
import AddNewCustomerModal from './AddNewCustomerModal';
import Icon from './Icon';
import SearchableDropdown from './SearchableDropdown';

import { SALES_VOUCHER_COLUMNS_BY_TAB, SalesVoucherTab, SALES_VOUCHER_KEY_MAP, SalesVoucherColumn } from '../constants/salesVoucherColumns';
import { INDIA_STATE_CODES, GST_INVOICE_TYPES, EXPORT_TYPES } from '../utils/gstConstants';

const TDS_RATE_MAP: Record<string, number> = {
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
};

const TCS_RATE_MAP: Record<string, number> = {
    'Sale of Scrap, Alcoholic Liquor, Minerals': 0.01,
    'Sale of Tendu Leaves': 0.05,
    'Sale of Forest Produce': 0.02,
    'Sale of Timber': 0.02,
    'Sale of Motor Vehicles': 0.01,
    'Sale of Specified Luxury Goods': 0.01,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SalesInvoiceGroup {
    invoice_no: string;
    header: any;
    items: any[];
    /** READY | CUSTOMER_MISSING | GSTIN_CONFLICT | VALIDATION_FAILED | DUPLICATE_INVOICE */
    status: string;
    message: string;
    customer_id?: number;
    matched_by?: string;
    session_id: string;
    row_index: number;
    field_errors?: Record<string, any>;
}

interface SalesEditModalProps {
    invoice: SalesInvoiceGroup;
    index: number;
    onClose: () => void;
    onSave: (index: number, updated: SalesInvoiceGroup) => Promise<void>;
    onCreateCustomer: (inv: SalesInvoiceGroup) => void;
}

const SalesEditModal: React.FC<SalesEditModalProps> = ({ invoice, index, onClose, onSave, onCreateCustomer }) => {
    const [draft, setDraft] = useState<SalesInvoiceGroup>({ ...invoice });
    const [saving, setSaving] = useState(false);
    const [stockItems, setStockItems] = useState<any[]>([]);
    const [ledgers, setLedgers] = useState<any[]>([]);
    const [companyDetails, setCompanyDetails] = useState<any>(null);
    const [voucherSeries, setVoucherSeries] = useState<any[]>([]);
    const [richCustomers, setRichCustomers] = useState<any[]>([]);
    const [locations, setLocations] = useState<any[]>([]);
    const [outwardSlips, setOutwardSlips] = useState<any[]>([]);
    const [sameAsBillTo, setSameAsBillTo] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [items, services, ledgersData, company, series, customers, locs, slips] = await Promise.all([
                    apiService.getStockItems({ params: { page_size: 10000 } }).catch(() => []),
                    apiService.getServiceItems({ params: { page_size: 10000 } }).catch(() => []),
                    apiService.getLedgers().catch(() => []),
                    apiService.getCompanyDetails().catch(() => ({} as any)),
                    apiService.getMasterVoucherSales().catch(() => []),
                    apiService.getRichCustomers().catch(() => []),
                    apiService.getInventoryLocations().catch(() => []),
                    apiService.getOutwardSlips().catch(() => [])
                ]);
                const itemList = Array.isArray(items) ? items : ((items as any).results || []);
                const serviceList = Array.isArray(services) ? services : ((services as any).results || []);
                const allItems = [...itemList, ...serviceList];
                console.log(`[SalesEditModal] Loaded ${allItems.length} items (${itemList.length} products, ${serviceList.length} services)`);
                setStockItems(allItems);
                setLedgers(ledgersData);
                setCompanyDetails(company);
                setVoucherSeries(series);
                setRichCustomers(Array.isArray(customers) ? customers : ((customers as any).results || []));
                setLocations(Array.isArray(locs) ? locs : ((locs as any).results || []));
                setOutwardSlips(Array.isArray(slips) ? slips : ((slips as any).results || []));
            } catch (e) {
                console.error('Failed to fetch modal data', e);
            }
        };
        fetchData();
    }, []);

    // Same as Bill To sync
    useEffect(() => {
        if (!sameAsBillTo) return;
        setDraft(prev => ({
            ...prev,
            header: {
                ...prev.header,
                ship_to_address_1: prev.header.bill_to_address_1,
                ship_to_address_2: prev.header.bill_to_address_2,
                ship_to_address_3: prev.header.bill_to_address_3,
                ship_to_city: prev.header.bill_to_city,
                ship_to_state: prev.header.bill_to_state,
                ship_to_pincode: prev.header.bill_to_pincode,
                ship_to_country: prev.header.bill_to_country,
            }
        }));
    }, [sameAsBillTo, draft.header.bill_to_address_1, draft.header.bill_to_city,
        draft.header.bill_to_state, draft.header.bill_to_pincode, draft.header.bill_to_country]);

    // Reactive Enrichment Logic
    useEffect(() => {
        if (stockItems.length === 0 || draft.items.length === 0) return;

        let needsUpdate = false;
        const enrichedItems = draft.items.map(item => {
            // Check if item already has name and rate
            const hasName = !!(item.item_name || item.itemName);
            const hasRate = !!(parseFloat(item.item_rate || item.itemRate) > 0);

            // We only enrich if it has a code but missing name/rate
            const code = String(item.item_code || item.itemCode || item.code || item.serviceCode || '').trim().toLowerCase();
            const name = String(item.item_name || item.itemName || item.name || item.serviceName || '').trim().toLowerCase();

            if (!code && !name) return item;
            if (hasName && hasRate) return item; // Already enriched

            const matched = stockItems.find(si => {
                const siCode = String(si.item_code || si.itemCode || si.code || si.serviceCode || si.service_code || '').trim().toLowerCase();
                const siName = String(si.item_name || si.itemName || si.name || si.serviceName || si.service_name || '').trim().toLowerCase();
                const isMatch = (code && siCode === code) || (name && siName === name);
                if (isMatch) console.log(`[SalesEditModal] Matched ${code || name} to:`, si);
                return isMatch;
            });

            if (matched) {
                needsUpdate = true;
                const newItem = {
                    ...item,
                    item_code: matched.item_code || matched.itemCode || matched.code || matched.serviceCode || matched.service_code || item.item_code || '',
                    item_name: matched.item_name || matched.itemName || matched.name || matched.serviceName || matched.service_name || item.item_name || '',
                    hsn_sac: matched.hsn_sac || matched.hsn_code || matched.sac_code || matched.hsn || matched.hsnCode || matched.sacCode || item.hsn_sac || '',
                    uom: matched.uom || matched.unit || matched.uom_name || item.uom || '',
                    item_rate: matched.rate || matched.standard_rate || matched.price || matched.standardRate || item.item_rate || 0,
                };
                return calculateItemTotals(newItem, matched, companyDetails?.state, draft.header.place_of_supply);
            }
            return item;
        });

        if (needsUpdate) {
            const tTaxable = enrichedItems.reduce((s, i) => s + (parseFloat(i.taxable_value) || 0), 0);
            const tCgst = enrichedItems.reduce((s, i) => s + (parseFloat(i.cgst) || 0), 0);
            const tSgst = enrichedItems.reduce((s, i) => s + (parseFloat(i.sgst) || 0), 0);
            const tIgst = enrichedItems.reduce((s, i) => s + (parseFloat(i.igst) || 0), 0);
            const tCess = enrichedItems.reduce((s, i) => s + (parseFloat(i.cess) || 0), 0);
            const tValue = enrichedItems.reduce((s, i) => s + (parseFloat(i.invoice_value) || 0), 0);

            const customer = richCustomers.find(c => c.customer_name === draft.header.customer_name);
            let tdsIT = 0;
            let tdsGST = 0;
            if (customer) {
                // Derive rates from sections
                const tdsSec = (customer.tds_section || '').includes('|') ? customer.tds_section.split('|')[1] : customer.tds_section;
                const tcsSec = (customer.tcs_section || '').includes('|') ? customer.tcs_section.split('|')[1] : customer.tcs_section;
                const tdsRate = TDS_RATE_MAP[tdsSec] || 0;
                const tcsRate = TCS_RATE_MAP[tcsSec] || 0;

                if (tdsRate + tcsRate > 0) tdsIT = tValue * (tdsRate + tcsRate);
                if (customer.gst_tds_applicable && tTaxable > 250000) tdsGST = tTaxable * 0.02;
            }

            const isTcsActive = customer?.tcs_enabled || (parseFloat(customer?.tcs_rate) > 0);
            let gross = tValue - tdsGST;
            if (isTcsActive) gross += tdsIT; else gross -= tdsIT;

            setDraft(prev => ({
                ...prev,
                items: enrichedItems,
                header: {
                    ...prev.header,
                    payment_taxable_value: tTaxable,
                    payment_cgst: tCgst,
                    payment_sgst: tSgst,
                    payment_igst: tIgst,
                    payment_cess: tCess,
                    payment_invoice_value: tValue,
                    payment_tds_income_tax: tdsIT,
                    payment_tds_gst: tdsGST,
                    payment_gross_receivable: gross,
                    payment_payable: gross - (parseFloat(prev.header.payment_advance) || 0)
                }
            }));
        }
    }, [stockItems, companyDetails, draft.header.place_of_supply, richCustomers]);

    const calculateItemTotals = (item: any, matched: any, companyState: string, placeOfSupply: string) => {
        const q = parseFloat(item.qty) || 0;
        const r = parseFloat(item.item_rate) || 0;
        item.taxable_value = q * r;

        const taxable = parseFloat(item.taxable_value) || 0;
        const rate = parseFloat(matched?.gstRate || matched?.gst_rate || matched?.tax_rate || 0);
        const cessRate = parseFloat(matched?.cessRate || matched?.cess_rate || 0);

        if (taxable > 0 && rate > 0) {
            const tax = (taxable * rate) / 100;
            const cState = companyState?.trim().toLowerCase();
            const pos = placeOfSupply?.trim().toLowerCase();
            if (pos && cState && pos !== cState) {
                item.igst = tax; item.cgst = 0; item.sgst = 0;
            } else {
                item.igst = 0; item.cgst = tax / 2; item.sgst = tax / 2;
            }

            // Cess calculation: Cess Rate % of Total Tax (matching SalesVoucher logic)
            if (cessRate > 0) {
                const totalTax = (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) + (parseFloat(item.igst) || 0);
                item.cess = (totalTax * cessRate) / 100;
            } else {
                item.cess = 0;
            }
        } else if (taxable > 0) {
            // Fallback if rate is missing but it's taxable
            item.igst = 0; item.cgst = 0; item.sgst = 0; item.cess = 0;
        } else {
            item.igst = 0; item.cgst = 0; item.sgst = 0; item.cess = 0;
        }
        item.invoice_value = taxable + (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) + (parseFloat(item.igst) || 0) + (parseFloat(item.cess) || 0);
        
        // Calculate Foreign Currency amount if applicable
        item.fc_invoice_value = (parseFloat(item.fc_qty ?? item.qty) || 0) * (parseFloat(item.fc_item_rate) || 0);
        
        return item;
    };

    const updateHeader = (key: string, value: any) => {
        setDraft(prev => {
            let newHeader = { ...prev.header, [key]: value };

            // Series Auto-number logic
            if (key === 'voucher_name') {
                const config = voucherSeries.find(v => v.voucher_name === value);
                if (config) {
                    apiService.getNextVoucherNumber(config.id)
                        .then((res: any) => {
                            if (res?.invoice_number) {
                                setDraft(d => ({
                                    ...d,
                                    invoice_no: res.invoice_number,
                                    header: { ...d.header, sales_invoice_no: res.invoice_number }
                                }));
                            }
                        }).catch(() => { });
                }
            }

            const updatedItems = prev.items;
            // Totals Recalculation (Cascades to TDS/TCS logic)
            const tTaxable = updatedItems.reduce((s, i) => s + (parseFloat(i.taxable_value) || 0), 0);
            const tCgst = updatedItems.reduce((s, i) => s + (parseFloat(i.cgst) || 0), 0);
            const tSgst = updatedItems.reduce((s, i) => s + (parseFloat(i.sgst) || 0), 0);
            const tIgst = updatedItems.reduce((s, i) => s + (parseFloat(i.igst) || 0), 0);
            const tCess = updatedItems.reduce((s, i) => s + (parseFloat(i.cess) || 0), 0);
            const tValue = updatedItems.reduce((s, i) => s + (parseFloat(i.invoice_value) || 0), 0);

            const customer = richCustomers.find(c => c.customer_name === newHeader.customer_name);
            let tdsIT = 0;
            let tdsGST = 0;
            if (customer) {
                const tdsSec = (customer.tds_section || '').includes('|') ? customer.tds_section.split('|')[1] : customer.tds_section;
                const tcsSec = (customer.tcs_section || '').includes('|') ? customer.tcs_section.split('|')[1] : customer.tcs_section;
                const tdsRate = TDS_RATE_MAP[tdsSec] || 0;
                const tcsRate = TCS_RATE_MAP[tcsSec] || 0;

                if (tdsRate + tcsRate > 0) tdsIT = tValue * (tdsRate + tcsRate);
                if (customer.gst_tds_applicable && tTaxable > 250000) tdsGST = tTaxable * 0.02;
            }

            const isTcsActive = customer?.tcs_enabled || (parseFloat(customer?.tcs_rate) > 0);
            let gross = tValue - tdsGST;
            if (isTcsActive) gross += tdsIT; else gross -= tdsIT;

            newHeader = {
                ...newHeader,
                payment_taxable_value: tTaxable,
                payment_cgst: tCgst,
                payment_sgst: tSgst,
                payment_igst: tIgst,
                payment_cess: tCess,
                payment_invoice_value: tValue,
                payment_tds_income_tax: tdsIT,
                payment_tds_gst: tdsGST,
                payment_gross_receivable: gross,
                payment_payable: gross - (parseFloat(newHeader.payment_advance) || 0)
            };

            // Customer Auto-fill logic
            if (key === 'customer_name') {
                const customer = richCustomers.find(c => c.customer_name === value);
                if (customer) {
                    const branches = customer.gst_details?.branches || [];
                    if (branches.length === 1) {
                        const b = branches[0];
                        newHeader.customer_branch = b.defaultRef || b.referenceName || '';
                        newHeader.gstin = b.gstin || '';
                        newHeader.bill_to_address_1 = b.addressLine1 || b.address || '';
                        newHeader.bill_to_address_2 = b.addressLine2 || '';
                        newHeader.bill_to_address_3 = b.addressLine3 || '';
                        newHeader.bill_to_city = b.city || '';
                        newHeader.bill_to_pincode = b.pincode || '';
                        newHeader.bill_to_state = b.state || '';
                        newHeader.bill_to_country = b.country || 'India';
                        if (b.contactNumber) newHeader.contact = b.contactNumber;
                    } else if (customer.gstin) {
                        newHeader.gstin = customer.gstin;
                    }
                }
            }

            // Branch selection logic
            if (key === 'customer_branch') {
                const customer = richCustomers.find(c => c.customer_name === prev.header.customer_name);
                const branch = (customer?.gst_details?.branches || []).find((b: any) => (b.defaultRef || b.referenceName) === value);
                if (branch) {
                    newHeader.gstin = branch.gstin || '';
                    newHeader.bill_to_address_1 = branch.addressLine1 || branch.address || '';
                    newHeader.bill_to_address_2 = branch.addressLine2 || '';
                    newHeader.bill_to_address_3 = branch.addressLine3 || '';
                    newHeader.bill_to_city = branch.city || '';
                    newHeader.bill_to_pincode = branch.pincode || '';
                    newHeader.bill_to_state = branch.state || '';
                    newHeader.bill_to_country = branch.country || 'India';
                    if (branch.contactNumber) newHeader.contact = branch.contactNumber;
                }
            }

            return { ...prev, header: newHeader, items: prev.items };
        });
    };

    const updateItem = (itemIdx: number, key: string, value: any) => {
        const newItems = [...draft.items];
        let item = { ...newItems[itemIdx], [key]: value };

        const exchangeRate = parseFloat(draft.header.exchange_rate) || 1;

        // Foreign Currency sync logic
        if (key === 'fc_item_name') item.item_name = value;
        if (key === 'fc_qty') item.qty = value;
        if (key === 'fc_uom') item.uom = value;
        if (key === 'fc_sales_ledger') item.sales_ledger = value;
        if (key === 'fc_description') item.description = value;
        
        if (key === 'fc_item_rate') {
            item.item_rate = (parseFloat(value) || 0) * exchangeRate;
        }

        // Reverse sync logic (INR to FC)
        if (key === 'item_name') item.fc_item_name = value;
        if (key === 'qty') item.fc_qty = value;
        if (key === 'uom') item.fc_uom = value;
        if (key === 'sales_ledger') item.fc_sales_ledger = value;
        if (key === 'description') item.fc_description = value;

        if (key === 'item_rate') {
            item.fc_item_rate = exchangeRate > 0 ? ((parseFloat(value) || 0) / exchangeRate) : 0;
        }

        // Auto-fetch details when Code or Name changes
        let matchedItem = null;
        if (key === 'item_code' || key === 'item_name' || key === 'itemCode' || key === 'itemName') {
            matchedItem = stockItems.find(si => {
                const siCode = String(si.item_code || si.itemCode || si.code || si.serviceCode || si.service_code || '').trim().toLowerCase();
                const siName = String(si.item_name || si.itemName || si.name || si.serviceName || si.service_name || '').trim().toLowerCase();
                const searchVal = String(value).trim().toLowerCase();
                return (key === 'item_code' || key === 'itemCode') ? siCode === searchVal : siName === searchVal;
            });

            if (matchedItem) {
                // Bidirectional update: always set both code and name if matched
                item.item_code = matchedItem.item_code || matchedItem.itemCode || matchedItem.code || matchedItem.serviceCode || matchedItem.service_code || item.item_code;
                item.item_name = matchedItem.item_name || matchedItem.itemName || matchedItem.name || matchedItem.serviceName || matchedItem.service_name || item.item_name;
                item.hsn_sac = matchedItem.hsn_sac || matchedItem.hsn_code || matchedItem.sac_code || matchedItem.hsn || matchedItem.hsnCode || matchedItem.sacCode || item.hsn_sac;
                item.uom = matchedItem.uom || matchedItem.unit || matchedItem.uom_name || item.uom;
                item.item_rate = matchedItem.rate || matchedItem.standard_rate || matchedItem.price || matchedItem.standardRate || item.item_rate;
            }
        }

        if (!matchedItem) {
            matchedItem = stockItems.find(si => {
                const siName = String(si.item_name || si.name || si.serviceName || si.service_name || si.itemName || '').trim().toLowerCase();
                return siName === String(item.item_name || '').trim().toLowerCase();
            });
        }

        item = calculateItemTotals(item, matchedItem, companyDetails?.state, draft.header.place_of_supply);
        newItems[itemIdx] = item;

        // Update footer totals
        const tTaxable = newItems.reduce((s, i) => s + (parseFloat(i.taxable_value) || 0), 0);
        const tCgst = newItems.reduce((s, i) => s + (parseFloat(i.cgst) || 0), 0);
        const tSgst = newItems.reduce((s, i) => s + (parseFloat(i.sgst) || 0), 0);
        const tIgst = newItems.reduce((s, i) => s + (parseFloat(i.igst) || 0), 0);
        const tCess = newItems.reduce((s, i) => s + (parseFloat(i.cess) || 0), 0);
        const tValue = newItems.reduce((s, i) => s + (parseFloat(i.invoice_value) || 0), 0);

        const customer = richCustomers.find(c => c.customer_name === draft.header.customer_name);
        let tdsIT = 0;
        let tdsGST = 0;
        if (customer) {
            const tdsSec = (customer.tds_section || '').includes('|') ? customer.tds_section.split('|')[1] : customer.tds_section;
            const tcsSec = (customer.tcs_section || '').includes('|') ? customer.tcs_section.split('|')[1] : customer.tcs_section;
            const tdsRate = TDS_RATE_MAP[tdsSec] || 0;
            const tcsRate = TCS_RATE_MAP[tcsSec] || 0;

            if (tdsRate + tcsRate > 0) tdsIT = tValue * (tdsRate + tcsRate);
            if (customer.gst_tds_applicable && tTaxable > 250000) tdsGST = tTaxable * 0.02;
        }

        const isTcsActive = customer?.tcs_enabled || (parseFloat(customer?.tcs_rate) > 0);
        let gross = tValue - tdsGST;
        if (isTcsActive) gross += tdsIT; else gross -= tdsIT;

        setDraft(prev => ({
            ...prev,
            items: newItems,
            header: {
                ...prev.header,
                payment_taxable_value: tTaxable,
                payment_cgst: tCgst,
                payment_sgst: tSgst,
                payment_igst: tIgst,
                payment_cess: tCess,
                payment_invoice_value: tValue,
                payment_tds_income_tax: tdsIT,
                payment_tds_gst: tdsGST,
                payment_gross_receivable: gross,
                payment_payable: gross - (parseFloat(prev.header.payment_advance) || 0)
            }
        }));
    };

    const addItem = () => setDraft(p => ({ ...p, items: [...p.items, { item_name: '', qty: 0, item_rate: 0, taxable_value: 0 }] }));
    const removeItem = (idx: number) => setDraft(p => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));

    const [activeTab, setActiveTab] = useState<SalesVoucherTab>('Invoice Details');

    const seriesOptions = useMemo(() => Array.from(new Set(voucherSeries.map(v => v.voucher_name).filter(Boolean))), [voucherSeries]);
    const customerOptions = useMemo(() => Array.from(new Set(richCustomers.map(c => c.customer_name).filter(Boolean))), [richCustomers]);
    const branchOptions = useMemo(() => {
        const customer = richCustomers.find(c => c.customer_name === draft.header.customer_name);
        return (customer?.gst_details?.branches || []).map((b: any) => b.defaultRef || b.referenceName || '').filter(Boolean);
    }, [draft.header.customer_name, richCustomers]);
    const gstinOptions = useMemo(() => {
        const customer = richCustomers.find(c => c.customer_name === draft.header.customer_name);
        const opts = (customer?.gst_details?.branches || []).map((b: any) => b.gstin).filter(Boolean);
        if (customer?.gstin) opts.push(customer.gstin);
        return Array.from(new Set(opts));
    }, [draft.header.customer_name, richCustomers]);
    const uomOptions = useMemo(() => Array.from(new Set(stockItems.map(si => si.uom || si.unit).filter(Boolean))), [stockItems]);
    const itemCodeOptions = useMemo(() => stockItems.map(si => {
        const code = si.item_code || si.code || si.serviceCode || si.service_code || '';
        const name = si.name || si.item_name || si.serviceName || si.service_name || si.itemName || '';
        return {
            label: code || name || 'No Code',
            value: code || name || 'Unknown'
        };
    }).filter(o => o.label && o.label !== 'No Code'), [stockItems]);

    const itemNameOptions = useMemo(() => stockItems.map(si => {
        const code = si.item_code || si.code || si.serviceCode || si.service_code || '';
        const name = si.name || si.item_name || si.serviceName || si.service_name || si.itemName || '';
        return {
            label: name || code || 'No Name',
            value: name || code || 'Unknown'
        };
    }).filter(o => o.label && o.label !== 'No Name'), [stockItems]);
    const ledgerOptions = useMemo(() => Array.from(new Set(ledgers.map(l => l.name).filter(Boolean))), [ledgers]);

    const renderField = (col: SalesVoucherColumn) => {
        const isValueEmpty = !draft.header[col.key] || String(draft.header[col.key]).trim() === '';
        
        const currentName = String(draft.header.customer_name || '').trim().toLowerCase();
        const existsInMasters = richCustomers.some(c => String(c.customer_name || '').trim().toLowerCase() === currentName);
        const isMissingInMasters = col.key === 'customer_name' && currentName !== '' && !existsInMasters;

        // Priority Error Message
        const customErrorMsg = (col.key === 'customer_name' && (draft.status === 'CUSTOMER_MISSING' || isMissingInMasters)) 
            ? 'Customer is not available. Create a new customer for this.' 
            : (col.key === 'gstin' && draft.status === 'GSTIN_CONFLICT') ? 'GSTIN belongs to a different customer — conflict detected.'
            : (col.key === 'sales_invoice_no' && draft.status === 'DUPLICATE_INVOICE') ? `Invoice number "${draft.header.sales_invoice_no || draft.invoice_no}" already exists in the system. Use a different invoice number.`
            : null;

        const backendError = draft.field_errors?.[col.key];
        const errorText = customErrorMsg || (Array.isArray(backendError) ? backendError[0] : String(backendError || ''));
        
        const hasError = !!errorText || (col.required && isValueEmpty);

        const dropdownFields = [
            'voucher_name', 'customer_name', 'customer_branch', 'gstin',
            'place_of_supply', 'reverse_charge', 'invoice_type',
            'bill_to_state', 'bill_to_country', 'ship_to_state', 'ship_to_country',
            'export_type', 'gst_export_type'
        ];

        return (
            <div key={col.key} className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
                    {col.label}
                    {col.required && <span className="text-red-500">*</span>}
                </label>
                {dropdownFields.includes(col.key) ? (
                    <SearchableDropdown
                        value={String(draft.header[col.key] || '')}
                        onChange={val => updateHeader(col.key, val)}
                        options={
                            col.key === 'voucher_name' ? seriesOptions :
                                col.key === 'customer_name' ? customerOptions :
                                    col.key === 'customer_branch' ? branchOptions :
                                        col.key === 'gstin' ? gstinOptions :
                                            ['place_of_supply', 'bill_to_state', 'ship_to_state'].includes(col.key) ? INDIA_STATE_CODES.map(s => s.name) :
                                                ['bill_to_country', 'ship_to_country'].includes(col.key) ? ['India', 'United States', 'United Kingdom', 'Canada', 'Australia', 'United Arab Emirates', 'Singapore', 'Others'] :
                                                    col.key === 'reverse_charge' ? ['Y', 'N'] :
                                                        col.key === 'invoice_type' ? GST_INVOICE_TYPES.map(t => t.label) :
                                                            ['export_type', 'gst_export_type'].includes(col.key) ? EXPORT_TYPES.map(t => t.label) : []
                        }
                        placeholder={`Select ${col.label}`}
                        error={hasError}
                    />
                ) : (
                    <input
                        type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                        value={draft.header[col.key] ?? ''}
                        onChange={e => updateHeader(col.key, e.target.value)}
                        className={`min-h-[42px] w-full px-3 py-2 text-left border rounded-[4px] flex justify-between items-center bg-white transition-all
                            ${hasError ? 'border-red-500 bg-red-50 ring-1 ring-red-500' : 'border-gray-300 focus:ring-1 focus:ring-indigo-500 hover:border-indigo-400'}
                            text-gray-900 shadow-sm
                        `}
                        placeholder={`Enter ${col.label}`}
                    />
                )}
                {hasError && (
                    <div className="flex flex-col gap-1.5 mt-1.5 ml-1">
                        {errorText && (
                            <p className="text-[10px] text-red-600 font-black uppercase tracking-tight flex items-center gap-1">
                                <Icon name="exclamation-triangle" className="w-3 h-3" />
                                {errorText}
                            </p>
                        )}
                        {col.key === 'customer_name' && (draft.status === 'CUSTOMER_MISSING' || isMissingInMasters) && (
                            <button
                                onClick={() => onCreateCustomer(draft)}
                                className="mt-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-[11px] font-black flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg hover:shadow-indigo-500/40 w-fit group active:scale-95"
                            >
                                <Icon name="plus" className="w-4 h-4 group-hover:rotate-90 transition-transform" />
                                <span>ADD NEW CUSTOMER</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95%] max-h-[95vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold">Edit Sales Invoice</h2>
                        <p className="text-blue-100 text-xs mt-0.5">Invoice No: {draft.header.sales_invoice_no || draft.invoice_no || 'Pending'}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                        <Icon name="x" className="w-6 h-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b px-6 bg-gray-50/50 space-x-8 overflow-x-auto no-scrollbar flex-shrink-0">
                    {(() => {
                        const isExport = (draft.header.invoice_type || '').toLowerCase().includes('export');
                        const tabsToRender: SalesVoucherTab[] = isExport 
                            ? ['Invoice Details', 'Foreign Currency (Item & Tax Details)', 'Item & Tax Details', 'Payment Details', 'Dispatch Details', 'E-Invoice & E-Way Bill Details']
                            : ['Invoice Details', 'Item & Tax Details', 'Payment Details', 'Dispatch Details', 'E-Invoice & E-Way Bill Details'];
                            
                        return tabsToRender.map((tab) => {
                            let displayLabel: string = tab;
                            if (isExport && tab === 'Item & Tax Details') {
                                displayLabel = 'Item & Tax Details (INR)';
                            } else if (tab === 'Foreign Currency (Item & Tax Details)') {
                                displayLabel = 'Item & Tax Details (Foreign Currency)';
                            }
                            return (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-2 py-4 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                >
                                    {displayLabel}
                                </button>
                            );
                        });
                    })()}
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1 p-6 bg-gray-50/30">
                    {activeTab === 'Invoice Details' ? (
                        <div className="space-y-6">
                            {/* Row 1: Date | Sales Invoice Series | Sales Invoice No */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {renderField(SALES_VOUCHER_KEY_MAP.get('date')!)}
                                {renderField(SALES_VOUCHER_KEY_MAP.get('voucher_name')!)}
                                {renderField(SALES_VOUCHER_KEY_MAP.get('sales_invoice_no')!)}
                            </div>

                            {/* Row 2: Customer Name | Branch | GSTIN */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {renderField(SALES_VOUCHER_KEY_MAP.get('customer_name')!)}
                                {renderField(SALES_VOUCHER_KEY_MAP.get('customer_branch')!)}
                                {renderField(SALES_VOUCHER_KEY_MAP.get('gstin')!)}
                            </div>

                            {/* Row 3: Outward Slip | Upload Supporting Document */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {renderField(SALES_VOUCHER_KEY_MAP.get('outward_slip_no')!)}
                                <div className="md:col-span-2 space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Upload Supporting Document</label>
                                    <button className="w-full h-[42px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm font-bold text-xs uppercase tracking-wider">
                                        <Icon name="upload" className="w-4 h-4" />
                                        Upload Document
                                    </button>
                                    <p className="text-[9px] text-gray-400 text-center font-bold uppercase">Accepted: JPG, JPEG, PDF</p>
                                </div>
                            </div>

                            {/* Row 4: Bill To / Ship To Addresses */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t pt-6">
                                {/* Bill To */}
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-gray-700 text-sm">Bill To (Full Address)</h3>
                                    <div className="space-y-3">
                                        {['bill_to_address_1', 'bill_to_address_2', 'bill_to_address_3'].map(k => renderField(SALES_VOUCHER_KEY_MAP.get(k)!))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['bill_to_city', 'bill_to_pincode'].map(k => renderField(SALES_VOUCHER_KEY_MAP.get(k)!))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['bill_to_state', 'bill_to_country'].map(k => renderField(SALES_VOUCHER_KEY_MAP.get(k)!))}
                                    </div>
                                    <div className="border-t pt-3">
                                        {renderField(SALES_VOUCHER_KEY_MAP.get('contact')!)}
                                    </div>
                                </div>

                                {/* Ship To */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-gray-700 text-sm">Ship To</h3>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={sameAsBillTo}
                                                onChange={e => setSameAsBillTo(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                            />
                                            <span className="text-xs text-gray-600 font-medium">Same as Bill To Address</span>
                                        </label>
                                    </div>
                                    <div className="space-y-3">
                                        {['ship_to_address_1', 'ship_to_address_2', 'ship_to_address_3'].map(k => renderField(SALES_VOUCHER_KEY_MAP.get(k)!))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['ship_to_city', 'ship_to_pincode'].map(k => renderField(SALES_VOUCHER_KEY_MAP.get(k)!))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {['ship_to_state', 'ship_to_country'].map(k => renderField(SALES_VOUCHER_KEY_MAP.get(k)!))}
                                    </div>
                                </div>
                            </div>

                            {/* Row 5: GST Details */}
                            <div className="border-t pt-6">
                                <h3 className="text-sm font-semibold text-gray-800 mb-4">GST Details</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {renderField(SALES_VOUCHER_KEY_MAP.get('place_of_supply')!)}
                                    {renderField(SALES_VOUCHER_KEY_MAP.get('invoice_type')!)}
                                    {renderField(SALES_VOUCHER_KEY_MAP.get('reverse_charge')!)}
                                </div>
                            </div>
                        </div>
                    ) : activeTab === 'Foreign Currency (Item & Tax Details)' ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-bold text-gray-700">Line Items (Foreign Currency)</h3>
                                <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-indigo-200 rounded-[4px] shadow-sm">
                                        <span className="text-xs font-medium text-gray-700">
                                            1 {draft.header.fc_billing_currency || 'Foreign Currency'} =
                                        </span>
                                        <input
                                            type="number"
                                            value={draft.header.exchange_rate ?? ''}
                                            onChange={(e) => updateHeader('exchange_rate', parseFloat(e.target.value) || 0)}
                                            className="w-20 border-b border-gray-300 focus:border-indigo-500 focus:outline-none px-1 text-center font-bold text-indigo-600 text-sm"
                                            placeholder="Rate"
                                        />
                                        <span className="text-xs font-medium text-gray-700">INR</span>
                                    </div>
                                    <button onClick={addItem} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2">
                                        <Icon name="plus" className="w-4 h-4" /> Add New Item
                                    </button>
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border shadow-sm overflow-x-auto custom-scrollbar">
                                <table className="w-full text-left min-w-[800px]">
                                    <thead className="bg-[#5c56d6] text-white sticky top-0 z-10">
                                        <tr>
                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-12">S. No.</th>
                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] min-w-[200px]">Item Name</th>
                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[100px]">Quantity</th>
                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[100px]">UQC</th>
                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[120px]">Rate ({draft.header.fc_billing_currency || 'FC'})</th>
                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[120px]">Amount ({draft.header.fc_billing_currency || 'FC'})</th>
                                            <th className="px-3 py-3 text-center w-12 border-b"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200">
                                        {draft.items.map((item, idx) => (
                                            <React.Fragment key={idx}>
                                                <tr className="hover:bg-indigo-50/30 transition-colors group">
                                                    <td className="px-2 py-3 text-center text-sm border-r border-gray-200">{idx + 1}</td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <SearchableDropdown
                                                            value={item.fc_item_name ?? item.item_name ?? ''}
                                                            onChange={val => updateItem(idx, 'fc_item_name', val)}
                                                            options={itemNameOptions}
                                                            placeholder="Select item"
                                                            error={!!(draft.field_errors?.items?.[idx]?.fc_item_name || draft.field_errors?.items?.[idx]?.item_name || (!item.fc_item_name && !item.item_name))}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        {(() => {
                                                            const hasErr = !!(draft.field_errors?.items?.[idx]?.fc_qty || draft.field_errors?.items?.[idx]?.qty || (!item.fc_qty && !item.qty));
                                                            return (
                                                                <input
                                                                    type="number"
                                                                    value={item.fc_qty ?? item.qty ?? ''}
                                                                    onChange={e => updateItem(idx, 'fc_qty', parseFloat(e.target.value) || 0)}
                                                                    className={`w-full px-2 py-1.5 border focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center bg-transparent ${hasErr ? 'border-red-500 bg-red-50' : 'border-none'}`}
                                                                    placeholder="0"
                                                                />
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        <SearchableDropdown
                                                            value={item.fc_uom ?? item.uom ?? ''}
                                                            onChange={val => updateItem(idx, 'fc_uom', val)}
                                                            options={uomOptions}
                                                            placeholder="UQC"
                                                            error={!!(draft.field_errors?.items?.[idx]?.fc_uom || draft.field_errors?.items?.[idx]?.uom || (!item.fc_uom && !item.uom))}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                        {(() => {
                                                            const hasErr = !!(draft.field_errors?.items?.[idx]?.fc_item_rate || draft.field_errors?.items?.[idx]?.item_rate || !item.fc_item_rate);
                                                            return (
                                                                <input
                                                                    type="number"
                                                                    value={item.fc_item_rate ?? ''}
                                                                    onChange={e => updateItem(idx, 'fc_item_rate', parseFloat(e.target.value) || 0)}
                                                                    className={`w-full px-2 py-1.5 border focus:ring-1 focus:ring-indigo-500 rounded text-sm text-center font-bold text-indigo-700 bg-transparent pr-1 ${hasErr ? 'border-red-500 bg-red-50' : 'border-none'}`}
                                                                    placeholder="0.00"
                                                                    step="0.01"
                                                                />
                                                            );
                                                        })()}
                                                    </td>
                                                    <td className="px-2 py-2 border-r border-gray-200 text-center font-bold text-sm bg-indigo-50/20 text-gray-800">
                                                        {((item.fc_invoice_value) || 0).toFixed(2)}
                                                    </td>
                                                    <td className="p-2 text-center sticky right-0 bg-white group-hover:bg-indigo-50/30">
                                                        <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                                                            <Icon name="trash" className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                                <tr className="border-b border-gray-200 bg-gray-50/50">
                                                    <td colSpan={3} className="px-4 py-2 border-r border-gray-200">
                                                        <div className="flex items-center gap-3">
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Sales Ledger:</label>
                                                            <div className="flex-1">
                                                                <SearchableDropdown
                                                                    value={item.fc_sales_ledger ?? item.sales_ledger ?? ''}
                                                                    onChange={val => updateItem(idx, 'fc_sales_ledger', val)}
                                                                    options={ledgerOptions}
                                                                    placeholder="Select sales ledger"
                                                                    className={draft.field_errors?.items?.[idx]?.fc_sales_ledger || draft.field_errors?.items?.[idx]?.sales_ledger ? 'border-red-500 bg-red-50' : ''}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td colSpan={4} className="px-4 py-2">
                                                        <div className="flex items-center gap-3">
                                                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Ledger Narration:</label>
                                                            <input
                                                                type="text"
                                                                value={item.fc_description ?? item.description ?? ''}
                                                                onChange={e => updateItem(idx, 'fc_description', e.target.value)}
                                                                placeholder="Enter ledger narration"
                                                                className={`flex-1 border-b focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors ${draft.field_errors?.items?.[idx]?.fc_description || draft.field_errors?.items?.[idx]?.description ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                                        <tr>
                                            <td colSpan={5} className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-gray-500 border-r border-gray-200">Total Foreign Amount</td>
                                            <td className="px-2 py-3 text-center text-[13px] text-indigo-700 font-bold border-r border-gray-200">
                                                {draft.items.reduce((s, i) => s + (parseFloat(i.fc_invoice_value) || 0), 0).toFixed(2)}
                                            </td>
                                            <td className="bg-gray-50"></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    ) : activeTab === 'Item & Tax Details' ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-sm font-bold text-gray-700">Line Items ({draft.items.length})</h3>
                                    <div className="flex items-center gap-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sales Order/Quotation No.</label>
                                        <input 
                                            type="text" 
                                            value={draft.header.sales_order_no ?? ''} 
                                            onChange={e => updateHeader('sales_order_no', e.target.value)}
                                            placeholder="Select/Enter Sales Order No."
                                            className="px-3 py-1 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-indigo-500 w-64 bg-white"
                                        />
                                    </div>
                                </div>
                                <button onClick={addItem} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2">
                                    <Icon name="plus" className="w-4 h-4" /> Add New Item
                                </button>
                            </div>

                            <div className="bg-white rounded-xl border shadow-sm overflow-x-auto custom-scrollbar">
                                {(() => {
                                    const isInterState = companyDetails?.state && draft.header.place_of_supply && 
                                        companyDetails.state.trim().toLowerCase() !== draft.header.place_of_supply.trim().toLowerCase();
                                    
                                    return (
                                        <table className="w-full text-left min-w-[1200px]">
                                            <thead className="bg-[#5c56d6] text-white sticky top-0 z-10">
                                                <tr>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-12">S. No.</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[140px]">Item Code</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] min-w-[180px]">Item Name</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[100px]">HSN/SAC</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[80px]">Qty</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[80px]">UOM</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[100px]">Alt Unit</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[100px]">Rate</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[100px]">Taxable Val</th>
                                                    {!isInterState ? (
                                                        <>
                                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[80px]">CGST</th>
                                                            <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[80px]">SGST</th>
                                                        </>
                                                    ) : (
                                                        <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[80px]">IGST</th>
                                                    )}
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[80px]">Cess</th>
                                                    <th className="px-3 py-3 text-[10px] font-semibold text-center border-r border-[#4b45bd] w-[120px]">Invoice Val</th>
                                                    <th className="px-3 py-3 text-center w-12 border-b"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {draft.items.map((item, idx) => {
                                                    const itemError = draft.field_errors?.items?.[idx];
                                                    return (
                                                        <React.Fragment key={idx}>
                                                            <tr className="hover:bg-indigo-50/30 transition-colors group">
                                                                <td className="px-2 py-3 text-center text-sm border-r border-gray-200">{idx + 1}</td>
                                                                <td className={`px-2 py-2 border-r border-gray-200`}>
                                                                    <SearchableDropdown
                                                                        value={item.item_code ?? ''}
                                                                        onChange={val => updateItem(idx, 'item_code', val)}
                                                                        options={itemCodeOptions}
                                                                        placeholder="Code"
                                                                        error={!!(itemError?.item_code || !item.item_code)}
                                                                    />
                                                                </td>
                                                                <td className={`px-2 py-2 border-r border-gray-200`}>
                                                                    <SearchableDropdown
                                                                        value={item.item_name ?? ''}
                                                                        onChange={val => updateItem(idx, 'item_name', val)}
                                                                        options={itemNameOptions}
                                                                        placeholder="Select item"
                                                                        error={!!(itemError?.item_name || !item.item_name)}
                                                                    />
                                                                </td>
                                                                <td className={`px-2 py-2 border-r border-gray-200`}>
                                                                    {(() => {
                                                                        const hasErr = !!(itemError?.hsn_sac || !item.hsn_sac);
                                                                        return (
                                                                            <input
                                                                                type="text"
                                                                                value={item.hsn_sac ?? ''}
                                                                                onChange={e => updateItem(idx, 'hsn_sac', e.target.value)}
                                                                                className={`w-full px-2 py-1.5 border focus:ring-1 focus:ring-indigo-500 rounded text-xs text-center bg-transparent ${hasErr ? 'border-red-500 bg-red-50' : 'border-none'}`}
                                                                                placeholder="HSN"
                                                                            />
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className={`px-2 py-2 border-r border-gray-200`}>
                                                                    {(() => {
                                                                        const hasErr = !!(itemError?.qty || !item.qty);
                                                                        return (
                                                                            <input
                                                                                type="number"
                                                                                value={item.qty ?? ''}
                                                                                onChange={e => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)}
                                                                                className={`w-full px-2 py-1.5 border focus:ring-1 focus:ring-indigo-500 rounded text-xs text-center bg-transparent ${hasErr ? 'border-red-500 bg-red-50' : 'border-none'}`}
                                                                                placeholder="0"
                                                                            />
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className={`px-2 py-2 border-r border-gray-200`}>
                                                                    <SearchableDropdown
                                                                        value={item.uom ?? ''}
                                                                        onChange={val => updateItem(idx, 'uom', val)}
                                                                        options={uomOptions}
                                                                        placeholder="UQC"
                                                                        error={!!(itemError?.uom || !item.uom)}
                                                                    />
                                                                </td>
                                                                <td className="px-2 py-2 border-r border-gray-200">
                                                                    <input
                                                                        type="text"
                                                                        value={item.alternate_unit ?? ''}
                                                                        readOnly
                                                                        className="w-full px-2 py-1.5 border-none text-[10px] text-center bg-gray-50 text-gray-500 rounded"
                                                                        placeholder="Alt Unit"
                                                                    />
                                                                </td>
                                                                <td className={`px-2 py-2 border-r border-gray-200`}>
                                                                    {(() => {
                                                                        const hasErr = !!(itemError?.item_rate || !item.item_rate);
                                                                        return (
                                                                            <input
                                                                                type="number"
                                                                                value={item.item_rate ?? ''}
                                                                                onChange={e => updateItem(idx, 'item_rate', parseFloat(e.target.value) || 0)}
                                                                                className={`w-full px-2 py-1.5 border focus:ring-1 focus:ring-indigo-500 rounded text-xs text-right bg-transparent font-medium ${hasErr ? 'border-red-500 bg-red-50' : 'border-none'}`}
                                                                                placeholder="0.00"
                                                                                step="0.01"
                                                                            />
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className="px-2 py-2 border-r border-gray-200 text-right text-xs font-bold text-gray-700 bg-gray-50/30">
                                                                    {(parseFloat(item.taxable_value) || 0).toFixed(2)}
                                                                </td>
                                                                {!isInterState ? (
                                                                    <>
                                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                                            <input
                                                                                type="number"
                                                                                value={item.cgst ?? ''}
                                                                                onChange={e => updateItem(idx, 'cgst', parseFloat(e.target.value) || 0)}
                                                                                className="w-full px-2 py-1.5 border-none focus:ring-1 focus:ring-indigo-500 rounded text-xs text-right bg-transparent"
                                                                                placeholder="0.00"
                                                                            />
                                                                        </td>
                                                                        <td className="px-2 py-2 border-r border-gray-200">
                                                                            <input
                                                                                type="number"
                                                                                value={item.sgst ?? ''}
                                                                                onChange={e => updateItem(idx, 'sgst', parseFloat(e.target.value) || 0)}
                                                                                className="w-full px-2 py-1.5 border-none focus:ring-1 focus:ring-indigo-500 rounded text-xs text-right bg-transparent"
                                                                                placeholder="0.00"
                                                                            />
                                                                        </td>
                                                                    </>
                                                                ) : (
                                                                    <td className="px-2 py-2 border-r border-gray-200">
                                                                        <input
                                                                            type="number"
                                                                            value={item.igst ?? ''}
                                                                            onChange={e => updateItem(idx, 'igst', parseFloat(e.target.value) || 0)}
                                                                            className="w-full px-2 py-1.5 border-none focus:ring-1 focus:ring-indigo-500 rounded text-xs text-right bg-transparent"
                                                                            placeholder="0.00"
                                                                        />
                                                                    </td>
                                                                )}
                                                                <td className="px-2 py-2 border-r border-gray-200">
                                                                    <input
                                                                        type="number"
                                                                        value={item.cess ?? ''}
                                                                        onChange={e => updateItem(idx, 'cess', parseFloat(e.target.value) || 0)}
                                                                        className="w-full px-2 py-1.5 border-none focus:ring-1 focus:ring-indigo-500 rounded text-xs text-right bg-transparent"
                                                                        placeholder="0.00"
                                                                    />
                                                                </td>
                                                                <td className="px-2 py-2 border-r border-gray-200 text-right text-xs font-black text-indigo-700 bg-indigo-50/10">
                                                                    {(parseFloat(item.invoice_value) || 0).toFixed(2)}
                                                                </td>
                                                                <td className="p-2 text-center sticky right-0 bg-white group-hover:bg-indigo-50/30">
                                                                    <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                                                                        <Icon name="trash" className="w-4 h-4" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                            <tr className="border-b border-gray-200 bg-gray-50/50">
                                                                <td colSpan={5} className="px-4 py-2 border-r border-gray-200">
                                                                    <div className="flex items-center gap-3">
                                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Sales Ledger:</label>
                                                                        <div className="flex-1">
                                                                            <SearchableDropdown
                                                                                value={item.sales_ledger ?? ''}
                                                                                onChange={val => updateItem(idx, 'sales_ledger', val)}
                                                                                options={ledgerOptions}
                                                                                placeholder="Select sales ledger"
                                                                                className={itemError?.sales_ledger ? 'border-red-500 bg-red-50' : ''}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td colSpan={isInterState ? 8 : 9} className="px-4 py-2">
                                                                    <div className="flex items-center gap-3">
                                                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">Ledger Narration:</label>
                                                                        <input
                                                                            type="text"
                                                                            value={item.description ?? ''}
                                                                            onChange={e => updateItem(idx, 'description', e.target.value)}
                                                                            placeholder="Enter ledger narration"
                                                                            className={`flex-1 border-b focus:border-indigo-500 bg-transparent py-1 text-sm outline-none transition-colors ${itemError?.description ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}
                                                                        />
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                                                <tr>
                                                    <td colSpan={8} className="px-4 py-3 text-right text-[10px] uppercase tracking-widest text-gray-500 border-r border-gray-200">Total INR Summary</td>
                                                    <td className="px-2 py-3 text-right text-xs border-r border-gray-200">
                                                        {draft.items.reduce((s, i) => s + (parseFloat(i.taxable_value) || 0), 0).toFixed(2)}
                                                    </td>
                                                    {!isInterState ? (
                                                        <>
                                                            <td className="px-2 py-3 text-right text-xs border-r border-gray-200">
                                                                {draft.items.reduce((s, i) => s + (parseFloat(i.cgst) || 0), 0).toFixed(2)}
                                                            </td>
                                                            <td className="px-2 py-3 text-right text-xs border-r border-gray-200">
                                                                {draft.items.reduce((s, i) => s + (parseFloat(i.sgst) || 0), 0).toFixed(2)}
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <td className="px-2 py-3 text-right text-xs border-r border-gray-200">
                                                            {draft.items.reduce((s, i) => s + (parseFloat(i.igst) || 0), 0).toFixed(2)}
                                                        </td>
                                                    )}
                                                    <td className="px-2 py-3 text-right text-xs border-r border-gray-200">
                                                        {draft.items.reduce((s, i) => s + (parseFloat(i.cess) || 0), 0).toFixed(2)}
                                                    </td>
                                                    <td className="px-2 py-3 text-right text-xs text-indigo-700 font-black">
                                                        {draft.items.reduce((s, i) => s + (parseFloat(i.invoice_value) || 0), 0).toFixed(2)}
                                                    </td>
                                                    <td className="bg-gray-50"></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    );
                                })()}
                            </div>
                        </div>
                    ) : activeTab === 'Payment Details' ? (
                        <div className="space-y-6">
                            {/* Tax Summary Table */}
                            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase border-r">Taxable Value</th>
                                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase border-r">CGST</th>
                                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase border-r">SGST</th>
                                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase border-r">IGST</th>
                                            <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase">Cess</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        <tr>
                                            <td className="px-4 py-3 border-r"><input type="number" readOnly value={draft.header.payment_taxable_value || 0} className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0" /></td>
                                            <td className="px-4 py-3 border-r"><input type="number" readOnly value={draft.header.payment_cgst || 0} className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0" /></td>
                                            <td className="px-4 py-3 border-r"><input type="number" readOnly value={draft.header.payment_sgst || 0} className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0" /></td>
                                            <td className="px-4 py-3 border-r"><input type="number" readOnly value={draft.header.payment_igst || 0} className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0" /></td>
                                            <td className="px-4 py-3"><input type="number" readOnly value={draft.header.payment_cess || 0} className="w-full bg-transparent border-none text-sm font-semibold focus:ring-0" /></td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            {/* Payment Summary Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {['payment_invoice_value', 'payment_tds_income_tax', 'payment_tds_gst', 'payment_gross_receivable', 'payment_advance', 'payment_payable', 'payment_cess', 'posting_note', 'terms_conditions']
                                    .map(k => SALES_VOUCHER_KEY_MAP.get(k))
                                    .filter((col): col is SalesVoucherColumn => !!col)
                                    .map(col => renderField(col))}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {SALES_VOUCHER_COLUMNS_BY_TAB[activeTab].map(col => renderField(col))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 flex-shrink-0">
                    <div className="flex gap-4">
                        <div className="text-center px-4 border-r">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Grand Total</p>
                            <p className="text-sm font-black text-gray-800">₹ {(draft.header.payment_invoice_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="text-center px-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Net Payable</p>
                            <p className="text-sm font-black text-blue-700">₹ {(draft.header.payment_payable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
                        <button
                            onClick={async () => { setSaving(true); try { await onSave(index, draft); onClose(); } catch { showError('Save failed'); } finally { setSaving(false); } }}
                            disabled={saving}
                            className="px-6 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-lg shadow-blue-500/20 disabled:opacity-50 flex items-center gap-2"
                        >
                            {saving && <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                            Save & Revalidate
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
    switch (status) {
        case 'READY':
            return <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 uppercase">Ready ✅</span>;
        case 'CUSTOMER_MISSING':
            return <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold border border-amber-200 uppercase">No Customer ❌</span>;
        case 'GSTIN_CONFLICT':
            return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200 uppercase">GSTIN Conflict ❗</span>;
        case 'DUPLICATE_INVOICE':
            return <span className="px-2 py-1 rounded-full bg-red-100 text-red-800 text-[10px] font-bold border border-red-300 uppercase tracking-wide">Duplicate Invoice 🚫</span>;
        case 'VALIDATION_FAILED':
            return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold border border-red-200 uppercase">Fail ❌</span>;
        default:
            return <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-[10px] font-bold border border-gray-200 uppercase">{status}</span>;
    }
};

interface SalesExcelUploadWorkflowProps {
    onClose?: () => void;
}

const SalesExcelUploadWorkflow: React.FC<SalesExcelUploadWorkflowProps> = ({ onClose }) => {
    const [invoices, setInvoices] = useState<SalesInvoiceGroup[]>([]);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [finalizing, setFinalizing] = useState(false);
    const [editModal, setEditModal] = useState<{ invoice: SalesInvoiceGroup; index: number } | null>(null);
    const [createCustomerFor, setCreateCustomerFor] = useState<SalesInvoiceGroup | null>(null);
    const [summary, setSummary] = useState<any>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        setSummary(null); // Clear old summary on new upload
        try {
            const res = await apiService.uploadSalesExcelWorkflow(file);
            setInvoices(res.invoices);
            setSessionId(res.session_id);
            showSuccess(`Successfully parsed ${res.invoices.length} invoices`);
        } catch (error) {
            showError('Excel parsing failed');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleUpdate = async (index: number, updated: SalesInvoiceGroup) => {
        if (!sessionId) return;
        try {
            const res = await apiService.updateSalesWorkflowInvoice({
                session_id: sessionId,
                index,
                invoice: updated
            });
            setInvoices(res.invoices);
            showSuccess('Invoice updated and revalidated');
        } catch (error) {
            showError('Update failed');
            throw error;
        }
    };

    const revalidateAll = async () => {
        if (!sessionId) return;
        try {
            const res = await apiService.updateSalesWorkflowInvoice({
                session_id: sessionId,
                revalidate_all: true
            });
            setInvoices(res.invoices);
        } catch (error) {
            showError('Revalidation failed');
        }
    };

    const handleCreateCustomer = async (customerData: any) => {
        if (!createCustomerFor || !sessionId) return;
        try {
            await apiService.createCustomerFromSalesWorkflow(customerData);
            showSuccess('Customer created successfully. Revalidating all records...');
            setCreateCustomerFor(null);
            await revalidateAll();
        } catch (error: any) {
            showError(error?.message || 'Customer creation failed');
        }
    };

    const handleFinalize = async () => {
        if (!sessionId) return;
        setFinalizing(true);
        try {
            const res = await apiService.finalizeSalesWorkflow(sessionId);
            setSummary(res.summary);
            setInvoices(res.remaining);
            if (res.summary.created > 0) {
                showSuccess(`Created ${res.summary.created} vouchers successfully!`);
            } else {
                showInfo('No vouchers were created. Check for errors.');
            }
        } catch (error) {
            showError('Finalization failed');
        } finally {
            setFinalizing(false);
        }
    };

    const counts = {
        total: invoices.length,
        ready: invoices.filter(i => i.status === 'READY').length,
        missing: invoices.filter(i => i.status === 'CUSTOMER_MISSING').length,
        duplicate: invoices.filter(i => i.status === 'DUPLICATE_INVOICE').length,
        error: invoices.filter(i => i.status === 'VALIDATION_FAILED' || i.status === 'GSTIN_CONFLICT').length
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Header / Toolbar */}
            <div className="bg-white border-b px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm z-10">
                <div className="flex items-center gap-4">
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500 mr-2"
                            title="Go Back"
                        >
                            <Icon name="arrow-left" className="w-5 h-5" />
                        </button>
                    )}
                    <div className="p-2 bg-blue-50 rounded-lg">
                        <Icon name="file-text" className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 tracking-tight">Sales Excel Workflow</h1>
                        <p className="text-[11px] text-gray-500 font-medium">Group by Invoice → Validate Customer → Upload Vouchers</p>
                    </div>

                    {invoices.length > 0 && (
                        <div className="ml-6 flex items-center gap-3">
                            <div className="flex flex-col">
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total</span>
                                <span className="text-sm font-bold text-gray-700">{counts.total}</span>
                            </div>
                            <div className="w-px h-6 bg-gray-200"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">Ready</span>
                                <span className="text-sm font-bold text-emerald-600">{counts.ready}</span>
                            </div>
                            <div className="w-px h-6 bg-gray-200"></div>
                            <div className="flex flex-col">
                                <span className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">Missing</span>
                                <span className="text-sm font-bold text-amber-600">{counts.missing}</span>
                            </div>
                            {counts.duplicate > 0 && (
                                <>
                                    <div className="w-px h-6 bg-gray-200"></div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Duplicate</span>
                                        <span className="text-sm font-bold text-red-600">{counts.duplicate}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />

                    <button
                        onClick={async () => {
                            try {
                                const blob = await apiService.getSalesExcelTemplate();
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'Sales_Excel_Template.xlsx';
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                            } catch (e) {
                                showError('Failed to download template');
                            }
                        }}
                        className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                    >
                        <Icon name="download" className="w-4 h-4" />
                        Download Template
                    </button>



                    {invoices.length > 0 && (
                        <button
                            onClick={handleFinalize}
                            disabled={finalizing || counts.ready === 0}
                            className="px-6 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {finalizing ? <Icon name="loader" className="w-4 h-4 animate-spin" /> : <Icon name="check-circle" className="w-4 h-4" />}
                            Finalize Invoices ({counts.ready})
                        </button>
                    )}
                </div>
            </div>

            {/* Hint Bar - Customer Missing */}
            {counts.missing > 0 && (
                <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-500">
                    <div className="p-1.5 bg-orange-100 rounded-lg animate-pulse">
                        <Icon name="exclamation-triangle" className="w-5 h-5 text-orange-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-orange-900 font-bold">Customer Master Missing</p>
                        <p className="text-[11px] text-orange-700 font-medium">
                            {counts.missing} invoices have customers that don't exist in your records. You must <strong>Create Customer</strong> or edit to match existing masters before finalizing.
                        </p>
                    </div>
                </div>
            )}

            {/* Hint Bar - Duplicate Invoice */}
            {counts.duplicate > 0 && (
                <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-500">
                    <div className="p-1.5 bg-red-100 rounded-lg animate-pulse">
                        <Icon name="exclamation-triangle" className="w-5 h-5 text-red-600" />
                    </div>
                    <div className="flex-1">
                        <p className="text-xs text-red-900 font-bold">Duplicate Invoice Number Detected</p>
                        <p className="text-[11px] text-red-700 font-medium">
                            {counts.duplicate} invoice{counts.duplicate > 1 ? 's' : ''} ha{counts.duplicate > 1 ? 've' : 's'} a <strong>Sales Invoice No.</strong> that already exists in the system. Click <strong>Edit</strong> to assign a unique invoice number before finalizing.
                        </p>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto p-6">
                {summary && (
                    <div className="mb-8 p-6 bg-white border rounded-xl shadow-sm animate-in zoom-in duration-300">
                        <div className="flex items-center justify-between mb-4 border-b pb-4">
                            <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                <Icon name="bar-chart-2" className="w-5 h-5 text-indigo-500" />
                                Last Upload Summary
                            </h2>
                            <button onClick={() => setSummary(null)} className="text-gray-400 hover:text-gray-600">
                                <Icon name="x" className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mb-1">Created</p>
                                <p className="text-2xl font-black text-emerald-700">{summary.created}</p>
                            </div>
                            <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                                <p className="text-[10px] text-red-600 font-bold uppercase tracking-widest mb-1">Failed</p>
                                <p className="text-2xl font-black text-red-700">{summary.failed}</p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Skipped</p>
                                <p className="text-2xl font-black text-gray-600">{summary.skipped || 0}</p>
                            </div>
                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mb-1">Total</p>
                                <p className="text-2xl font-black text-indigo-700">{summary.total}</p>
                            </div>
                        </div>

                        {summary.errors && summary.errors.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Errors Details</h3>
                                <div className="space-y-2">
                                    {summary.errors.map((err: any, idx: number) => {
                                        const invIndex = invoices.findIndex(i => i.invoice_no === err.invoice_no);
                                        const inv = invIndex !== -1 ? invoices[invIndex] : null;

                                        return (
                                            <div key={idx} className="p-3 bg-red-50/30 border border-red-100 rounded-lg text-[11px] text-red-700 flex justify-between items-start gap-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="font-bold">Invoice #{err.invoice_no}:</span>
                                                    <span className="font-mono">{typeof err.errors === 'string' ? err.errors : JSON.stringify(err.errors)}</span>
                                                </div>
                                                {inv && (
                                                    <button
                                                        onClick={() => setEditModal({ invoice: inv, index: invIndex })}
                                                        className="flex-shrink-0 px-3 py-1 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-[10px] font-bold shadow-sm transition-all"
                                                    >
                                                        Edit & Fix
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {invoices.length === 0 && !uploading && !summary ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-20 bg-white rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="w-20 h-20 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6">
                            <Icon name="file-spreadsheet" className="w-10 h-10" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-800">No Invoices Uploaded</h2>
                        <p className="text-slate-400 mt-2 max-w-sm">Upload a Sales Excel file to begin the validation and voucher creation workflow.</p>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-8 px-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95"
                        >
                            Select Excel File
                        </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-900 text-white">
                                <tr>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest w-12">#</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest">Customer & Invoice</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-widest">Branch / Location</th>
                                    <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-widest">Amount</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-widest">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {invoices.map((inv, idx) => (
                                    <tr key={idx} className={`hover:bg-slate-50/80 transition-colors ${inv.status === 'READY' ? '' : 'bg-amber-50/20'}`}>
                                        <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold text-slate-800">{inv.header.customer_name || '—'}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">INV-{inv.invoice_no}</span>
                                                    <span className="text-[10px] text-slate-400 font-medium font-mono">{inv.header.gstin || 'No GSTIN'}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-medium text-slate-600">{inv.header.customer_branch || '—'}</span>
                                            {inv.header.invoice_date && <p className="text-[10px] text-slate-400 mt-0.5">📅 {inv.header.invoice_date}</p>}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="font-bold text-slate-800">₹ {(inv.header.total_invoice_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            <p className="text-[10px] text-slate-400 mt-0.5">{inv.items.length} items</p>
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <StatusBadge status={inv.status} />
                                            {inv.message && <p className="text-[10px] text-red-400 mt-1 max-w-[120px] mx-auto truncate" title={inv.message}>{inv.message}</p>}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setEditModal({ invoice: inv, index: idx })}
                                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                    title="Edit Record"
                                                >
                                                    <Icon name="edit-3" className="w-4 h-4" />
                                                </button>

                                                {inv.status === 'CUSTOMER_MISSING' && (
                                                    <button
                                                        onClick={() => setCreateCustomerFor(inv)}
                                                        className="px-3 py-1.5 bg-orange-50 text-orange-600 hover:bg-orange-100 text-[10px] font-bold rounded-lg border border-orange-200 transition-all flex items-center gap-1.5"
                                                    >
                                                        <Icon name="user-plus" className="w-3.5 h-3.5" />
                                                        Create Customer
                                                    </button>
                                                )}

                                                <button
                                                    onClick={() => setInvoices(prev => prev.filter((_, i) => i !== idx))}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Remove from list"
                                                >
                                                    <Icon name="trash-2" className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modals */}
            {editModal && (
                <SalesEditModal
                    invoice={editModal.invoice}
                    index={editModal.index}
                    onClose={() => setEditModal(null)}
                    onSave={handleUpdate}
                    onCreateCustomer={(inv) => {
                        setEditModal(null);
                        setCreateCustomerFor(inv);
                    }}
                />
            )}

            {createCustomerFor && (
                <AddNewCustomerModal
                    isOpen={!!createCustomerFor}
                    onClose={() => setCreateCustomerFor(null)}
                    onCustomerCreated={async () => {
                        setCreateCustomerFor(null);
                        await revalidateAll();
                    }}
                    initialData={{
                        customer_name: createCustomerFor.header.customer_name,
                        gstin: createCustomerFor.header.gstin,
                        address: createCustomerFor.header.bill_to_address_1 || '',
                        state: createCustomerFor.header.bill_to_state || '',
                        branch: createCustomerFor.header.customer_branch,
                        email: '',
                        phone: createCustomerFor.header.contact || ''
                    }}
                />
            )}
        </div>
    );
};

export default SalesExcelUploadWorkflow;
