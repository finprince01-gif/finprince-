import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import LedgerQuestions from './LedgerQuestions';
import { showError, showSuccess, showWarning } from '../utils/toast';
import { httpClient } from '../services';

interface HierarchyRow {
    id: number;
    type_of_business_1: string | null;
    financial_reporting_1: string | null;
    major_group_1: string | null;
    group_1: string | null;
    sub_group_1_1: string | null;
    sub_group_2_1: string | null;
    sub_group_3_1: string | null;
    ledger_1: string | null;
    custom_ledger?: string | null;  // 7th level for nested custom ledgers
    code: string | null;
    isCustom?: boolean; // Flag for tenant-specific ledgers
}

interface Ledger {
    id: number;
    name: string;
    category: string | null;
    group: string | null;
    sub_group_1: string | null;
    sub_group_2: string | null;
    sub_group_3: string | null;
    ledger_type: string | null;
    parent_ledger_id: number | null;
}

interface TreeNode {
    name: string;
    children: TreeNode[];
    level: number;
    isCustom?: boolean;
    ledgerId?: number;  // Store ledger ID for custom ledgers
    fullPath: {
        category: string | null;
        group: string | null;
        sub_group_1: string | null;
        sub_group_2: string | null;
        sub_group_3: string | null;
        ledger_type: string | null;
        parent_ledger_id?: number | null;
    };
}

// --- GLOBAL HIERARCHY ORDERING SYSTEM (RANK-BASED) ---
const clean = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();

// Absolute ranks for specific item names to ensure they stay pinned regardless of parent
const ITEM_RANKS: Record<string, number> = {
    // Root level
    'npofunds': 0,
    'ownersfunds': 1,
    'liability': 2,
    'asset': 3,
    'income': 4,
    'expenditure': 5,

    // Owners' Funds
    'sharecapital': 10,
    'reservesandsurplus': 11,
    'moneyreceivedagainstsharewarrants': 12,

    // Reserves and Surplus
    'generalreserves': 20,
    'revaluationreserves': 21,
    'surplus': 22,
    'othercapitalreserves': 23,
    'otherrevenuereserves': 24,

    // Investments (Both Current and Non-Current)
    'investmentsinotherentities': 30,
    'investmentsinpreferenceshares': 31,
    'investmentsinequityinstruments': 32,
    'investmentsingovernmentortrustsecurities': 33,
    'investmentsindebenturesorbonds': 34,
    'investmentsinmutualfunds': 35,
    'investmentsproperty': 36,
    'othernoncurrentinvestment': 38,


    'unrestrictedfunds': 0.1,
    'restrictedfunds': 0.2,

    // Liabilities
    'longtermborrowings': 40,
    'otherlongtermliabilities': 41,
    'deferredtaxliabilitiesnet': 42,
    'longtermprovisions': 43,
    'shorttermborrowings': 44,
    'othercurrentliabilities': 45,
    'shorttermprovisions': 47,

    // Loans
    'longtermloansfrombankssecured': 50,
    'longtermloansfromrelatedpartiessecured': 51,
    'longtermloansfromotherpartiessecured': 52,
    'longtermloansfrombanksunsecured': 53,
    'longtermloansfromrelatedpartiesunsecured': 54,
    'longtermloansfromotherpartiesunsecured': 55,

    // Other Current Liab
    'interestaccrued': 60,
    'bankodccaccounts': 61,
    'gstpayable': 62,
    'tdspayable': 63,
    'dutiestaxesliability': 64,
    'dividendpayable': 65,

    // Income
    'revenuefromoperations': 70,
    'otherincome': 71,

    // Assets
    'propertyplantequipment': 80,
    'noncurrentinvestments': 81,
    'deferredtaxassetsnet': 82,
    'longtermloansandadvances': 83,
    'othernoncurrentassets': 84,
    'currentinvestments': 85,
    'cashandcashequivalents': 86,
    'shorttermloansandadvances': 87,

    // Property, Plant & Equipment Sub-groups
    'tangibleassets': 90,
    'intangibleassets': 91,
    'capitalworkinprogress': 92,
    'intangibleassetsunderdevelopment': 93,

    // Cash and cash equivalents Sub-groups
    'cash': 100,
    'inbankaccounts': 101,
    'others': 999,

    // Revenue from operations Sub-groups
    'donationsandgrants': 109,
    'saleofservices': 110,
    'saleofgoods': 111,
    'saleofservice': 112,

    // GST Sales Sub-groups
    'localsalesservices': 120,
    'interstatesalesservices': 121,

    // Local Sales Sub-groups
    'localsaleofservicesnilrated': 130,
    'localsaleofservicesexempted': 131,
    'localsaleofservicestaxable': 132,

    // Inter-state Sales Sub-groups
    'interstatesaleofservicesnilrated': 140,
    'interstatesaleofservicesexempted': 141,
    'interstatesaleofservicestaxable': 142,

    // GST Sales Goods Sub-groups
    'localsalesgoods': 150,
    'interstatesalesgoods': 151,
    'exportofgoods': 152,

    // Local Sales Goods Sub-groups
    'localsaleofgoodsnilrated': 160,
    'localsaleofgoodsexempted': 161,
    'localsaleofgoodstaxable': 162,

    // Export of Goods Sub-groups
    'exportofgoodsnilrated': 170,
    'exportofgoodsexempted': 171,
    'exportofgoodswithpaymentoftax': 172,
    'exportofgoodswithoutpaymentoftax': 173,

    // Export of Service Sub-groups
    'exportofservicenilrated': 180,
    'exportofserviceexempted': 181,
    'exportofservicewithpaymentoftax': 182,
    'exportofservicewithoutpaymentoftax': 183,

    // Other Income Sub-groups
    'interestincome': 190,
    'dividendincome': 191,
    'netgainonfairvaluechanges': 192,
    'netgainonderecognitionoffinancialinstrumentsunderamortisedcostcategory': 193,

    // Expenditure Sub-groups
    'costofmaterialsconsumed': 200,
    'changesininventoriesoffinishedgoodsstockintradeandworkinprogress': 201,
    'employeebenefitsexpenses': 202,
    'financecosts': 203,
    'depreciationamortizationandimpairment': 204,
    'otherexpenses': 205,

    // Employee Benefits Sub-groups
    'salary': 210,
    'bonus': 211,
    'wages': 212,
    'staffwelfareexpenses': 213,
    'incentives': 214,

    // Finance Costs Sub-groups
    'interestonbankloan': 220,
    'interestonotherloans': 221,
    'otherborrowingcosts': 222,
    'impairmentonfinancialinstruments': 223,

    // Depreciation Sub-groups
    'depreciationexpense': 230,
    'amortizationexpense': 231,

    // Other Expenses Sub-groups & Ledgers
    'feesandcommissionexpense': 250,
    'netlossonfairvaluechanges': 251,
    'netlossonderecognitionoffinancialinstrumentsunderamortisedcostcategory': 252,
    'rent': 253,
    'electricity': 254,
    'repairsmaintenance': 255,
    'insurance': 256,
    'processinglabourcharges': 257,
    'travellingconveyanceboarding': 258,
    'auditorsremuneration': 259,
    'printingstationery': 260,
    'advertisementexpense': 261,
    'commission': 262,
    'legalandprofessionalcharges': 263,
    'miscellaneousexpenses': 264,
    'fuelexpenses': 265,
    'communicationexpenses': 266,
    'freightclearingandforwarding': 267,
    'commissionandbrokerage': 268,
    'rocfees': 269,
    'gstandvatpayments': 270,
    'donations': 271,
    'baddebtswrittenoff': 272,
    'itinternetservermaintenanceexpenses': 273,
    'businesssalespromotionexpenses': 274,
    'exchangegain': 275,
    'exchangeloss': 276,
    'officemaintenance': 277,
    'roundoff': 278,
    'rebatesanddiscounts': 279,
    'consumptionofstoresandspareparts': 280,
    'licencesandtaxesexcludingtaxesonincome': 281,
    'lossonsaleofassets': 282,
    'statutoryfeeinterestpenalty': 283,
    'directorsremuneration': 284,
    'msmeinterestexpense': 285,
    'dividendtoshareholders': 286,

    // Long term loans Sub-groups
    'termloans': 300,
    'otherloansfacilities': 301,

    // Short term loans Sub-groups
    'shorttermloansfrombankssecured': 310,
    'shorttermloansfromrelatedpartiessecured': 311,
    'shorttermloansfromotherpartiessecured': 312,

    // Unsecured Short term loans Sub-groups
    'shorttermloansfrombanksunsecured': 320,
    'shorttermloansfromrelatedpartiesunsecured': 321,
    'shorttermloansfromotherpartiesunsecured': 322,
};

const sortHierarchyNodes = (nodes: TreeNode[], isLLP = false, isCompany = false, isOtherEntities = false) => {
    const isLiab = (node: TreeNode) => {
        const cat = (node.fullPath?.category || '').toLowerCase().trim();
        return cat === 'liability' || cat === 'liabilities';
    };

    const getRank = (node: TreeNode, ranksMap: Record<string, number>, liabRank: number, assetRank: number) => {
        const c = clean(node.name);
        if (c === 'othercurrentassets') {
            return isLiab(node) ? liabRank : assetRank;
        }
        return ranksMap[c];
    };

    nodes.sort((a, b) => {
        let ar = getRank(a, ITEM_RANKS, 46, 88) ?? 9999;
        let br = getRank(b, ITEM_RANKS, 46, 88) ?? 9999;

        if (isOtherEntities) {
            const otherRanks: Record<string, number> = {
                'ownerscapitalaccount': 1,
                'reservesandsurplus': 2,
                'longtermborrowings': 10,
                'otherlongtermliabilities': 11,
                'deferredtaxliabilitiesnet': 12,
                'longtermprovisions': 13,
                'shorttermborrowings': 14,
                'othercurrentliabilities': 15,
                'shorttermprovisions': 17,
                'propertyplantequipment': 20,
                'noncurrentinvestments': 21,
                'deferredtaxassetsnet': 22,
                'longtermloansandadvances': 23,
                'othernoncurrentassets': 24,
                'currentinvestments': 25,
                'cashandcashequivalents': 26,
                'shorttermloansandadvances': 27,
            };
            const customAr = getRank(a, otherRanks, 16, 28);
            const customBr = getRank(b, otherRanks, 16, 28);
            if (customAr !== undefined) ar = customAr;
            if (customBr !== undefined) br = customBr;
        } else if (isCompany) {
            const companyRanks: Record<string, number> = {
                'sharecapital': 1,
                'reservesandsurplus': 2,
                'moneyreceivedagainstsharewarrants': 3,
                'longtermborrowings': 10,
                'otherlongtermliabilities': 11,
                'deferredtaxliabilitiesnet': 12,
                'longtermprovisions': 13,
                'shorttermborrowings': 14,
                'othercurrentliabilities': 15,
                'shorttermprovisions': 17,
                'propertyplantequipment': 20,
                'noncurrentinvestments': 21,
                'deferredtaxassetsnet': 22,
                'longtermloansandadvances': 23,
                'othernoncurrentassets': 24,
                'currentinvestments': 25,
                'cashandcashequivalents': 26,
                'shorttermloansandadvances': 27,
            };
            const customAr = getRank(a, companyRanks, 16, 28);
            const customBr = getRank(b, companyRanks, 16, 28);
            if (customAr !== undefined) ar = customAr;
            if (customBr !== undefined) br = customBr;
        } else if (isLLP) {
            const llpRanks: Record<string, number> = {
                'partnerscapitalcontribution': 1,
                'partnerscurrentaccount': 2,
                'reservessurplus': 3,
                'reservesandsurplus': 4,
                'longtermborrowings': 10,
                'otherlongtermliabilities': 11,
                'deferredtaxliabilitiesnet': 12,
                'longtermprovisions': 13,
                'shorttermborrowings': 14,
                'othercurrentliabilities': 15,
                'shorttermprovisions': 17,
                'propertyplantequipment': 20,
                'noncurrentinvestments': 21,
                'deferredtaxassetsnet': 22,
                'longtermloansandadvances': 23,
                'othernoncurrentassets': 24,
                'currentinvestments': 25,
                'cashandcashequivalents': 26,
                'shorttermloansandadvances': 27,
                'feesandcommissionexpense': 100,
                'netlossonfairvaluechanges': 101,
                'netlossonderecognitionoffinancialinstrumentsunderamortisedcostcategory': 102,
                'rent': 103,
                'electricity': 104,
                'repairsmaintenance': 105,
                'insurance': 106,
                'processinglabourcharges': 107,
                'travellingconveyanceboarding': 108,
                'auditorsremuneration': 109,
                'printingstationery': 110,
                'advertisementexpense': 111,
                'commission': 112,
                'legalandprofessionalcharges': 113,
                'miscellaneousexpenses': 114,
                'fuelexpenses': 115,
                'communicationexpenses': 116,
                'freightclearingandforwarding': 117,
                'commissionandbrokerage': 118,
                'rocfees': 119,
                'gstandvatpayments': 120,
                'donations': 121,
                'baddebtswrittenoff': 122,
                'itinternetservermaintenanceexpenses': 123,
                'businesssalespromotionexpenses': 124,
                'exchangegain': 125,
                'exchangeloss': 126,
                'officemaintenance': 127,
                'roundoff': 128,
                'rebatesanddiscounts': 129,
                'consumptionofstoresandspareparts': 130,
                'licencesandtaxesexcludingtaxesonincome': 131,
                'lossonsaleofassets': 132,
                'statutoryfeeinterestpenalty': 133,
                'partnersremuneration': 134,
                'msmeinterestexpense': 135,
                'interestoncapitalcontributedbypartners': 136,
            };
            const customAr = getRank(a, llpRanks, 16, 28);
            const customBr = getRank(b, llpRanks, 16, 28);
            if (customAr !== undefined) ar = customAr;
            if (customBr !== undefined) br = customBr;
        }

        if (ar !== br) return ar - br;
        return a.name.localeCompare(b.name);
    });
    nodes.forEach(node => {
        if (node.children && node.children.length > 0) {
            sortHierarchyNodes(node.children, isLLP, isCompany, isOtherEntities);
        }
    });
};

interface LedgerCreationWizardProps {
    onCreateLedger: (data: {
        customName: string;
        entryLevel?: 'sub_group_2' | 'sub_group_3' | 'ledger';
        group: string | null;
        category: string | null;
        sub_group_1: string | null;
        sub_group_2: string | null;
        sub_group_3: string | null;
        ledger_type: string | null;
        parent_ledger_id?: number | null;
        question_answers?: Record<number | string, any>;
        opening_balance?: number;
        opening_balance_type?: string;
    }) => void;
}

export const LedgerCreationWizard: React.FC<LedgerCreationWizardProps> = ({ onCreateLedger }) => {
    const [hierarchyData, setHierarchyData] = useState<HierarchyRow[]>([]);
    const [tenantLedgers, setTenantLedgers] = useState<Ledger[]>([]);
    const [loading, setLoading] = useState(true);
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
    const [subGroup2Input, setSubGroup2Input] = useState('');
    const [subGroup3Input, setSubGroup3Input] = useState('');
    const [ledgerTypeInput, setLedgerTypeInput] = useState('');
    const [questionAnswers, setQuestionAnswers] = useState<Record<number, any>>({});

    // Edit existing (tenant) ledgers directly in the preview panel
    const [isEditingExistingLedger, setIsEditingExistingLedger] = useState(false);
    const [editLedgerName, setEditLedgerName] = useState('');
    const [editSubGroup2, setEditSubGroup2] = useState('');
    const [editSubGroup3, setEditSubGroup3] = useState('');

    // Opening balance step state
    const [showOpeningBalanceStep, setShowOpeningBalanceStep] = useState(false);
    const [pendingLedgerData, setPendingLedgerData] = useState<Parameters<LedgerCreationWizardProps['onCreateLedger']>[0] | null>(null);
    const [openingBalance, setOpeningBalance] = useState('');
    const [openingBalanceType, setOpeningBalanceType] = useState<'debit' | 'credit'>('debit');

    // Helper: treat '-', '–', '—', empty as blank
    const isBlankStr = (v: string | null | undefined): boolean => {
        if (!v) return true;
        const t = v.trim();
        return t === '' || t === '-' || t === '\u2013' || t === '\u2014';
    };

    // Convert tenant ledger to hierarchy row format
    const convertLedgerToHierarchy = (ledger: Ledger, allLedgers: Ledger[]): HierarchyRow => {
        // Normalise blank dash values to null
        const normSg1 = isBlankStr(ledger.sub_group_1) ? null : ledger.sub_group_1;
        const normSg2 = isBlankStr(ledger.sub_group_2) ? null : ledger.sub_group_2;
        const normSg3 = isBlankStr(ledger.sub_group_3) ? null : ledger.sub_group_3;

        // Normalize Category
        const normalizeCategory = (cat: string | null): string | null => {
            if (!cat) return null;
            const c = cat.trim().toLowerCase();
            if (c === 'expense' || c === 'expenses') return 'Expenditure';
            if (c === 'asset' || c === 'assets') return 'Asset';
            if (c === 'liability' || c === 'liabilities') return 'Liability';
            if (c === 'income') return 'Income';
            if (c.includes("owner") && c.includes("fund")) return "Owners'  Funds";
            if (c.includes("npo")) return "NPO Funds";
            return cat;
        };

        const finalCategory = normalizeCategory(ledger.category);

        const ledgerLeafName = (ledger.ledger_type && ledger.ledger_type.trim()) || ledger.name;

        // If this ledger has a parent, find the parent and use its hierarchy + name as ledger_type
        if (ledger.parent_ledger_id) {
            const parent = allLedgers.find(l => l.id === ledger.parent_ledger_id);
            if (parent) {
                const pSg2 = isBlankStr(parent.sub_group_2) ? null : parent.sub_group_2;
                const pSg3 = isBlankStr(parent.sub_group_3) ? null : parent.sub_group_3;
                const parentLeafName = (parent.ledger_type && parent.ledger_type.trim()) || parent.name;
                return {
                    id: ledger.id,
                    type_of_business_1: null,
                    financial_reporting_1: null,
                    major_group_1: normalizeCategory(parent.category),
                    group_1: parent.group,
                    sub_group_1_1: isBlankStr(parent.sub_group_1) ? null : parent.sub_group_1,
                    sub_group_2_1: pSg2,
                    sub_group_3_1: pSg3,
                    ledger_1: parentLeafName || null,  // Parent name becomes the "type"
                    custom_ledger: ledgerLeafName || null,  // Child name goes here!
                    code: null,
                    isCustom: true
                };
            }
        }

        // Regular custom ledger (no parent)
        // Determine if ledger name duplicates the deepest hierarchy level
        // If so, we treat the ledger as residing AT that level, not below it.
        let ledgerLevelVal: string | null = ledgerLeafName || null;

        // If the name is already used in ANY of the subgroup levels,
        // don't repeat it again at the ledger level. This prevents the UI from
        // showing the same string twice (e.g. subgroup "X" and ledger "X").
        if (ledgerLevelVal && (normSg3 === ledgerLevelVal || normSg2 === ledgerLevelVal || normSg1 === ledgerLevelVal)) {
            ledgerLevelVal = null;
        }

        return {
            id: ledger.id,
            type_of_business_1: null,
            financial_reporting_1: null,
            major_group_1: finalCategory,
            group_1: ledger.group,
            sub_group_1_1: normSg1,
            sub_group_2_1: normSg2,
            sub_group_3_1: normSg3,
            ledger_1: ledgerLevelVal,
            custom_ledger: null,
            code: null,
            isCustom: true
        };
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch both global hierarchy and tenant ledgers
                const [globalHierarchy, ledgers] = await Promise.all([
                    httpClient.get<HierarchyRow[]>('/api/masters/hierarchy/'),
                    httpClient.get<Ledger[]>('/api/masters/ledgers/').catch(() => [])
                ]);

                // Set tenant ledgers state
                setTenantLedgers(ledgers);

                // Convert tenant ledgers to hierarchy format
                const customHierarchy = ledgers.map(ledger => convertLedgerToHierarchy(ledger, ledgers));

                // Merge global hierarchy with custom ledgers,
                // then strip out groups that should never appear in the ledger type list.
                const HIDDEN_GROUPS = ['sundry debtors', 'sundry creditors'];
                const isHiddenRow = (row: HierarchyRow) => {
                    const vals = [
                        row.major_group_1,
                        row.group_1,
                        row.sub_group_1_1,
                        row.sub_group_2_1,
                    ].map(v => (v || '').toLowerCase().trim());
                    return vals.some(v => HIDDEN_GROUPS.includes(v));
                };

                const isNPO = globalHierarchy.some(r => r.type_of_business_1?.toLowerCase().includes('non-profit'));
                
                // Enhanced detection: Check both explicit field and presence of characteristic items
                const hasCompanyItems = globalHierarchy.some(r => 
                    r.type_of_business_1?.toLowerCase().trim() === 'company' ||
                    r.group_1?.toLowerCase().includes('share capital') ||
                    r.ledger_1?.toLowerCase().includes('share capital')
                );
                
                const hasLLPItems = globalHierarchy.some(r => 
                    r.type_of_business_1?.toLowerCase().includes('llp') || 
                    r.type_of_business_1?.toLowerCase().includes('partnership') ||
                    r.group_1?.toLowerCase().includes('partners') ||
                    r.ledger_1?.toLowerCase().includes('partners')
                );
                
                const hasOtherEntitiesItems = globalHierarchy.some(r => 
                    r.type_of_business_1?.toLowerCase().trim() === 'all other entities' ||
                    r.group_1?.toLowerCase().includes("owners' capital account") ||
                    r.ledger_1?.toLowerCase().includes("owners' capital account")
                );

                const isCompany = hasCompanyItems;
                const isOtherEntities = !isCompany && hasOtherEntitiesItems;
                const isLLP = !isCompany && !isOtherEntities && hasLLPItems;

                const mergedHierarchy = [...globalHierarchy, ...customHierarchy]
                    .filter(row => {
                        if (isHiddenRow(row)) return false;

                        // Special filter for Non-Profit Organizations: 
                        // Under Export of Service, only show specific ledgers.
                        if (isNPO && row.sub_group_3_1?.toLowerCase().trim() === 'export of service') {
                            const cleanedLedger = (row.ledger_1 || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
                            const allowed = [
                                'exportofservicenilrated',
                                'exportofservicewithpaymentoftax',
                                'exportofservicewithoutpaymentoftax'
                            ];
                            // If it's a ledger row under Export of Service and not in allowed list, hide it.
                            if (cleanedLedger && !allowed.includes(cleanedLedger)) return false;
                        }

                        // Special filter for LLP/Partnership:
                        // Under Other current liabilities, only show specific items.
                        if (isLLP && row.group_1?.toLowerCase().trim() === 'other current liabilities') {
                            const sg1 = (row.sub_group_1_1 || '').toLowerCase().trim();
                            const allowed = [
                                'interest accrued',
                                'bank od/cc accounts',
                                'gst payable',
                                'tds payable',
                                'duties & taxes (liability)',
                                'others'
                            ];
                            // If it's an item under Other current liabilities and not in allowed list, hide it.
                            if (sg1 && !allowed.includes(sg1)) return false;
                        }

                        return true;
                    })
                    .map(row => {
                        // Merge duplicate "Finance costs" groups into a single "Finance Costs" entry
                        if (row.group_1?.toLowerCase().trim() === 'finance costs') {
                            return { ...row, group_1: 'Finance Costs' };
                        }
                        return row;
                    });
                setHierarchyData(mergedHierarchy);

                // Build tree structure
                const tree = buildTreeStructure(mergedHierarchy, ledgers);
                sortHierarchyNodes(tree, isLLP, isCompany, isOtherEntities);

                setTreeData([...tree]);

                setLoading(false);
            } catch (error) {
                console.error('Error loading data:');
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Helper: treat '-', '–', '—', and empty/whitespace as blank (skip as tree node)
    const isBlankValue = (v: string | null | undefined): boolean => {
        if (!v) return true;
        const trimmed = v.trim();
        return trimmed === '' || trimmed === '-' || trimmed === '\u2013' || trimmed === '\u2014';
    };

    const buildTreeStructure = (data: HierarchyRow[], ledgers: Ledger[]): TreeNode[] => {
        const tree: Map<string, TreeNode> = new Map();
        const ledgerIdToPath: Map<number, string> = new Map(); // Track ledger ID to tree path

        // First pass: Build tree from hierarchy data (excluding nested custom ledgers)
        data.forEach(row => {
            // Skip rows that represent nested custom ledgers (they have custom_ledger filled)
            if (row.custom_ledger) return;

            // Determine deepest level for this row to correctly place the "Custom" marker
            // Treat blank dash values as absent
            const sg1 = isBlankValue(row.sub_group_1_1) ? null : row.sub_group_1_1;
            const sg2 = isBlankValue(row.sub_group_2_1) ? null : row.sub_group_2_1;
            const sg3 = isBlankValue(row.sub_group_3_1) ? null : row.sub_group_3_1;
            const led = isBlankValue(row.ledger_1) ? null : row.ledger_1;

            let maxLevel = -1;
            if (led) maxLevel = 5;
            else if (sg3) maxLevel = 4;
            else if (sg2) maxLevel = 3;
            else if (sg1) maxLevel = 2;
            else if (row.group_1) maxLevel = 1;

            const levels = [
                { key: 'major_group_1', value: row.major_group_1, level: 0 },
                { key: 'group_1', value: row.group_1, level: 1 },
                { key: 'sub_group_1_1', value: sg1, level: 2 },
                { key: 'sub_group_2_1', value: sg2, level: 3 },
                { key: 'sub_group_3_1', value: sg3, level: 4 },
                { key: 'ledger_1', value: led, level: 5 },
            ];

            let currentPath = '';
            let parentPath = '';

            levels.forEach((level, index) => {
                if (!level.value) return;

                parentPath = currentPath;
                const normalizedValue = (level.value || '').toLowerCase().trim();
                currentPath = currentPath ? `${currentPath}>${normalizedValue}` : normalizedValue;

                if (!tree.has(currentPath)) {
                    // For custom rows, ALL intermediate nodes (sub_group_2, sub_group_3)
                    // AND the leaf node get isCustom=true and the row's ledger ID,
                    // so the Edit button appears when any of them is selected.
                    // We only colour red (italic) at leaf level (maxLevel);
                    // sub_group nodes are black but still editable.
                    const isLeafNode = row.isCustom && level.level === maxLevel;
                    // Sub-groups (level 3 or 4) from a custom row are also editable
                    const isCustomNode = !!row.isCustom && level.level >= 3;
                    const ledgerId = isCustomNode ? row.id : undefined;

                    const node: TreeNode = {
                        name: level.value,
                        children: [],
                        level: level.level,
                        isCustom: isLeafNode, // red colour only for leaf
                        ledgerId: ledgerId,   // ID assigned for all custom sub-groups
                        fullPath: {
                            category: row.major_group_1,
                            group: row.group_1,
                            sub_group_1: sg1,
                            sub_group_2: sg2,
                            sub_group_3: sg3,
                            ledger_type: led,
                        }
                    };

                    tree.set(currentPath, node);

                    if (ledgerId) {
                        ledgerIdToPath.set(ledgerId, currentPath);
                    }

                    if (parentPath && tree.has(parentPath)) {
                        const parent = tree.get(parentPath)!;
                        if (!parent.children.find(c => c.name === node.name)) {
                            parent.children.push(node);
                        }
                    }
                } else {
                    // Node already exists in tree (created by a previous row).
                    // If the current row is custom and this level >= 3 (sub_group_2+),
                    // update the node with the ledger ID so Edit becomes available.
                    if (row.isCustom && level.level >= 3) {
                        const existingNode = tree.get(currentPath)!;
                        // Only assign if not already set (first custom row wins)
                        if (!existingNode.ledgerId) {
                            existingNode.ledgerId = row.id;
                        }
                        if (level.level === maxLevel) {
                            existingNode.isCustom = true;
                            ledgerIdToPath.set(row.id, currentPath);
                        }
                    }
                }
            });
        });

        // Second pass: Add nested custom ledgers — smart placement
        ledgers.forEach(ledger => {
            if (!ledger.parent_ledger_id) return;
            // If this ledger already got placed in pass-1 (via custom_ledger row),
            // do not add it again here. This prevents duplicate/incorrect nesting.
            if (ledgerIdToPath.has(ledger.id)) return;

            const nSg3 = isBlankValue(ledger.sub_group_3) ? null : ledger.sub_group_3;
            const nLt = isBlankValue(ledger.ledger_type) ? null : ledger.ledger_type;
            const nSg1 = isBlankValue(ledger.sub_group_1) ? null : ledger.sub_group_1;
            const nSg2 = isBlankValue(ledger.sub_group_2) ? null : ledger.sub_group_2;

            const parentPath = ledgerIdToPath.get(ledger.parent_ledger_id);
            if (!parentPath || !tree.has(parentPath)) return;

            // --- Smart case: ledger.sub_group_3 === ledger.name ---
            // e.g. test2.sg3 = "test2", lt = "testing".
            // This means "test2" is really a sub_group_3 node and "testing" is the leaf ledger.
            // We should insert a sub_group_3 node ABOVE the parent ("testing") node, then
            // move the parent ("testing") to be a child of it.
            if (nSg3 === ledger.name && nLt) {
                // grandparent path = everything before the parent node
                const grandparentPath = parentPath.includes('>')
                    ? parentPath.substring(0, parentPath.lastIndexOf('>'))
                    : '';

                const normalizedSg3 = (nSg3 || '').toLowerCase().trim();
                const sg3NodePath = grandparentPath ? `${grandparentPath}>${normalizedSg3}` : normalizedSg3;

                // Only do this once — check if sg3 node already exists
                if (!tree.has(sg3NodePath)) {
                    const parentNode = tree.get(parentPath)!;

                    const sg3Node: TreeNode = {
                        name: nSg3,
                        children: [],
                        level: 4, // sub_group_3 level — black, non-custom
                        isCustom: false,
                        ledgerId: undefined,
                        fullPath: {
                            category: ledger.category,
                            group: ledger.group,
                            sub_group_1: nSg1,
                            sub_group_2: nSg2,
                            sub_group_3: nSg3,
                            ledger_type: null,
                        }
                    };

                    // The parent ledger ("testing") becomes a child of this sg3 node
                    sg3Node.children.push(parentNode);
                    tree.set(sg3NodePath, sg3Node);
                    ledgerIdToPath.set(ledger.id, sg3NodePath); // track for potential grand-children

                    // Re-parent: remove "testing" from its current grandparent's children,
                    // add the new sg3 node instead
                    if (grandparentPath && tree.has(grandparentPath)) {
                        const grandparent = tree.get(grandparentPath)!;
                        grandparent.children = grandparent.children.filter(c => c !== parentNode);
                        if (!grandparent.children.find(c => c.name === sg3Node.name)) {
                            grandparent.children.push(sg3Node);
                        }
                    }
                } else {
                    // sg3 node already exists → update it to be a parent if needed
                    const sg3Node = tree.get(sg3NodePath)!;
                    const parentNode = tree.get(parentPath)!;

                    // The parent ledger ("testing") becomes a child of this sg3 node
                    if (!sg3Node.children.find(c => c.name === parentNode.name)) {
                        sg3Node.children.push(parentNode);
                    }

                    // Re-parent: remove "testing" from its current grandparent's children
                    if (grandparentPath && tree.has(grandparentPath)) {
                        const grandparent = tree.get(grandparentPath)!;
                        grandparent.children = grandparent.children.filter(c => c !== parentNode);
                        if (!grandparent.children.find(c => c.name === sg3Node.name)) {
                            grandparent.children.push(sg3Node);
                        }
                    }
                    ledgerIdToPath.set(ledger.id, sg3NodePath);
                }
                return;
            }

            // --- Default case: add as a child of the parent ledger node ---
            const parentNode = tree.get(parentPath)!;
            const childDisplayName =
                (ledger.name || '').trim() ||
                (nLt || '').trim() ||
                (nSg3 || '').trim() ||
                (nSg2 || '').trim();
            if (!childDisplayName) return;

            const inferredLevel =
                ((ledger.name || '').trim() || (nLt || '').trim())
                    ? 6
                    : (nSg3 ? 4 : (nSg2 ? 3 : 6));

            const childPath = `${parentPath}>${childDisplayName.toLowerCase().trim()}`;

            if (tree.has(childPath)) {
                // Update existing node instead of replacing it (to preserve references in parent's children array)
                const existingNode = tree.get(childPath)!;
                existingNode.isCustom = true;
                existingNode.ledgerId = ledger.id;
                existingNode.fullPath = {
                    category: ledger.category,
                    group: ledger.group,
                    sub_group_1: nSg1,
                    sub_group_2: nSg2,
                    sub_group_3: nSg3,
                    ledger_type: nLt,
                    parent_ledger_id: ledger.parent_ledger_id
                };
            } else {
                const childNode: TreeNode = {
                    name: childDisplayName,
                    children: [],
                    level: inferredLevel,
                    isCustom: true,
                    ledgerId: ledger.id,
                    fullPath: {
                        category: ledger.category,
                        group: ledger.group,
                        sub_group_1: nSg1,
                        sub_group_2: nSg2,
                        sub_group_3: nSg3,
                        ledger_type: nLt,
                        parent_ledger_id: ledger.parent_ledger_id
                    }
                };
                parentNode.children.push(childNode);
                tree.set(childPath, childNode);
            }
            ledgerIdToPath.set(ledger.id, childPath);
        });

        // Get root nodes (major groups)
        const roots: TreeNode[] = [];
        const seenNames = new Set<string>();

        tree.forEach((node, path) => {
            if (!path.includes('>')) {
                // Normalize name to handle duplicates (Asset/Assets, Liability/Liabilities, Expense/Expenditure etc.)
                const catMap: { [key: string]: string } = {
                    'expense': 'expenditure',
                    'expenses': 'expenditure',
                    'assets': 'asset',
                    'liabilities': 'liability'
                };
                const rawName = node.name.toLowerCase().trim();
                const normalizedName = catMap[rawName] || rawName.replace(/s$/, '');

                if (!seenNames.has(normalizedName)) {
                    seenNames.add(normalizedName);
                    roots.push(node);
                }
            }
        });

        // Preserve the hierarchy table's ordering (as provided by the backend).
        // Sorting here would fight the expected "table order" users rely on.
        return roots;
    };

    const toggleNode = (nodePath: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(nodePath)) {
            newExpanded.delete(nodePath);
        } else {
            newExpanded.add(nodePath);
        }
        setExpandedNodes(newExpanded);
    };

    const selectNodeForPreview = (node: TreeNode) => {
        // Create a partial path based on the level clicked
        const partialPath = {
            category: node.level >= 0 ? node.fullPath.category : null,
            group: node.level >= 1 ? node.fullPath.group : null,
            sub_group_1: node.level >= 2 ? node.fullPath.sub_group_1 : null,
            sub_group_2: node.level >= 3 ? node.fullPath.sub_group_2 : null,
            sub_group_3: node.level >= 4 ? node.fullPath.sub_group_3 : null,
            ledger_type: node.level >= 5 ? node.fullPath.ledger_type : null,
            // Only set parent_ledger_id when user explicitly creates a nested *ledger* under a custom ledger.
            // Setting it here causes subgroup inputs to be saved as child-ledgers (confusing UI like "subgroup inside ledger").
            parent_ledger_id: null,
        };

        setSelectedNode({
            ...node,
            fullPath: partialPath
        });
        // Reset inputs when selection changes
        setSubGroup2Input('');
        setSubGroup3Input('');
        setLedgerTypeInput('');
        setQuestionAnswers({});
        setIsEditingExistingLedger(false);
        setEditLedgerName('');
        setEditSubGroup2('');
        setEditSubGroup3('');
    };

    const renderTree = (nodes: TreeNode[], parentPath = '', level = 0): React.ReactElement[] => {
        const HIDDEN = ['sundry debtors', 'sundry creditors', 'duties & taxes', 'sales accounts', 'purchase accounts', 'purchase account'];
        return nodes
            .filter(node => !HIDDEN.includes((node.name || '').toLowerCase().trim()))
            .map((node, index) => {
                const nodePath = parentPath ? `${parentPath}>${node.name}` : node.name;
                const isExpanded = expandedNodes.has(nodePath);
                const hasChildren = node.children.length > 0;
                const isSelected = selectedNode?.name === node.name &&
                    selectedNode?.level === node.level &&
                    JSON.stringify(selectedNode?.fullPath) === JSON.stringify(node.fullPath);

                let textStyle = '';
                let iconStyle = 'text-gray-400';

                if (!hasChildren && node.level >= 5) {
                    // True ledger endpoints (ledger level only) are red + italic.
                    // Sub-group nodes with no children are structural and should not look like ledgers.
                    const sizeClass = level === 0 ? 'text-sm' : level === 1 ? 'text-[13.5px]' : 'text-[13px]';
                    textStyle = `${sizeClass} text-red-600 font-medium italic`;
                    iconStyle = 'text-red-500';
                } else if (node.level === 0) {
                    // Category: Blue, Bold, Uppercase, Largest
                    textStyle = 'text-sm text-blue-600 font-bold uppercase tracking-wider';
                    iconStyle = 'text-blue-500';
                } else if (node.level === 1) {
                    // Group: Black, Bold, Slightly smaller
                    textStyle = 'text-[13.5px] text-black font-bold';
                    iconStyle = 'text-black';
                } else if (node.level === 2) {
                    // Sub Group 1: Black, Semi-bold
                    textStyle = 'text-[13px] text-gray-900 font-semibold';
                    iconStyle = 'text-gray-800';
                } else if (node.level === 3) {
                    // Sub Group 2: Black, Medium weight
                    textStyle = 'text-[12px] text-gray-800 font-medium';
                    iconStyle = 'text-gray-700';
                } else {
                    // Sub Group 3 and others: Normal weight, Smallest
                    textStyle = 'text-[11px] text-gray-700 font-normal';
                    iconStyle = 'text-gray-600';
                }

                return (
                    <div key={nodePath} style={{ marginLeft: `${level * 20}px` }}>
                        <div
                            className={`flex items-center py-1.5 px-2 cursor-pointer hover:bg-gray-100 rounded transition-colors ${isSelected ? 'bg-indigo-50 border-l-2 border-indigo-500' : ''}`}
                            onClick={() => {
                                selectNodeForPreview(node);
                                // Reset inputs when selection changes
                                setSubGroup3Input('');
                                setLedgerTypeInput('');
                            }}
                            onDoubleClick={() => {
                                if (hasChildren) {
                                    toggleNode(nodePath);
                                }
                            }}
                        >
                            {hasChildren ? (
                                <span className={`mr-1 text-xs font-bold select-none ${iconStyle}`}>
                                    {isExpanded ? '−' : '+'}
                                </span>
                            ) : (
                                <span className={`mr-1 text-xs ${iconStyle}`}>
                                    {(node.isCustom && node.level >= 5) ? '★' : '•'}
                                </span>
                            )}
                            <span className={`text-sm select-none ${textStyle}`}>
                                {node.name}
                            </span>
                        </div>
                        {hasChildren && isExpanded && (
                            <div>
                                {renderTree(node.children, nodePath, level + 1)}
                            </div>
                        )}
                    </div>
                );
            });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Determine values based on selection + inputs
        const finalSubGroup2 = selectedNode?.fullPath.sub_group_2 || subGroup2Input.trim();
        const finalSubGroup3 = selectedNode?.fullPath.sub_group_3 || subGroup3Input.trim();
        const finalLedgerType = selectedNode?.fullPath.ledger_type || ledgerTypeInput.trim();

        const canEditSubGroup2 = !selectedNode?.fullPath.sub_group_2;
        const canEditSubGroup3 = !selectedNode?.fullPath.sub_group_3;
        const canEditLedgerType = !selectedNode?.fullPath.ledger_type;

        // Determine the most specific NEW value and which level it belongs to.
        // Only user-editable fields count as "new".
        let finalName = '';
        let entryLevel: 'sub_group_2' | 'sub_group_3' | 'ledger' | null = null;
        let isLedgerLevel = false;  // true only when ledger name (ledger_type) is filled

        if (canEditLedgerType && ledgerTypeInput.trim()) {
            finalName = ledgerTypeInput.trim();
            isLedgerLevel = true;   // opening balance only makes sense at ledger level
            entryLevel = 'ledger';
        } else if (canEditSubGroup3 && subGroup3Input.trim()) {
            finalName = subGroup3Input.trim();
            entryLevel = 'sub_group_3';
        } else if (canEditSubGroup2 && subGroup2Input.trim()) {
            finalName = subGroup2Input.trim();
            entryLevel = 'sub_group_2';
        }

        if (!finalName || !selectedNode) {
            showWarning('Please enter a name in Sub Group 2, Sub Group 3 or Ledger Type fields.');
            return;
        }

        const resolvedParentLedgerId =
            // When creating from a selected custom ledger, nest new subgroup/ledger under it.
            (selectedNode.isCustom && selectedNode.ledgerId)
                ? selectedNode.ledgerId
                : null;

        const newLedgerData = {
            customName: finalName,
            entryLevel: entryLevel || undefined,
            group: selectedNode.fullPath.group,
            category: selectedNode.fullPath.category,
            sub_group_1: selectedNode.fullPath.sub_group_1,
            sub_group_2: finalSubGroup2 || null,
            sub_group_3: finalSubGroup3 || null,
            ledger_type: isLedgerLevel ? (finalLedgerType || finalName) : null,
            parent_ledger_id: resolvedParentLedgerId,
            question_answers: questionAnswers
        };

        // Only show opening balance step when creating at the ledger (name) level
        if (isLedgerLevel) {
            setPendingLedgerData(newLedgerData);
            setOpeningBalance('');
            setOpeningBalanceType('debit');
            setShowOpeningBalanceStep(true);
        } else {
            // Sub group level — save directly without asking for opening balance
            onCreateLedger(newLedgerData);
            resetAfterSave();
        }
    };

    const refetchHierarchy = async (): Promise<TreeNode[] | null> => {
        try {
            const [globalHierarchy, ledgers] = await Promise.all([
                httpClient.get<HierarchyRow[]>('/api/masters/hierarchy/'),
                httpClient.get<Ledger[]>('/api/masters/ledgers/').catch(() => [])
            ]);

            setTenantLedgers(ledgers);
            const customHierarchy = ledgers.map(ledger => convertLedgerToHierarchy(ledger, ledgers));
            const mergedHierarchy = [...globalHierarchy, ...customHierarchy];
            setHierarchyData(mergedHierarchy);
            const tree = buildTreeStructure(mergedHierarchy, ledgers);
            sortHierarchyNodes(tree); // ← Apply pinned order after every re-fetch
            setTreeData([...tree]);
            return tree;
        } catch (error) {
            console.error('Error refetching data:');
        }
        return null;
    };

    const handleConfirmOpeningBalance = () => {
        if (!pendingLedgerData) return;

        const balanceAmount = parseFloat(openingBalance) || 0;

        const finalData = {
            ...pendingLedgerData,
            // Pass as direct top-level fields (not in additional_data)
            opening_balance: balanceAmount > 0 ? balanceAmount : 0,
            opening_balance_type: openingBalanceType === 'debit' ? 'Dr' : 'Cr',
        };

        onCreateLedger(finalData);
        resetAfterSave();
    };

    const handleSkipOpeningBalance = () => {
        if (!pendingLedgerData) return;
        onCreateLedger(pendingLedgerData);
        resetAfterSave();
    };

    const resetAfterSave = () => {
        setShowOpeningBalanceStep(false);
        setPendingLedgerData(null);
        setOpeningBalance('');
        setOpeningBalanceType('debit');
        setSubGroup2Input('');
        setSubGroup3Input('');
        setLedgerTypeInput('');
        setSelectedNode(null);
        setQuestionAnswers({});
        setIsEditingExistingLedger(false);
        setEditLedgerName('');
        setEditSubGroup2('');
        setEditSubGroup3('');
        setTimeout(refetchHierarchy, 500);
    };

    if (loading) return <div className="text-gray-500 text-sm">Loading hierarchy...</div>;

    // Helper to determine if input should be disabled (value comes from parent hierarchy)
    const isSubGroup2Fixed = !!selectedNode && (selectedNode.level >= 3 || !!selectedNode.fullPath.sub_group_2);
    const isSubGroup3Fixed = !!selectedNode && (selectedNode.level >= 4 || !!selectedNode.fullPath.sub_group_3);
    const isLedgerTypeFixed = !!selectedNode && (selectedNode.level >= 5 || !!selectedNode.fullPath.ledger_type);

    const canEditSelectedLedger = !!selectedNode?.ledgerId;

    const findNodeByLedgerId = (nodes: TreeNode[], ledgerId: number): TreeNode | null => {
        for (const n of nodes) {
            if (n.isCustom && n.ledgerId === ledgerId) return n;
            if (n.children?.length) {
                const found = findNodeByLedgerId(n.children, ledgerId);
                if (found) return found;
            }
        }
        return null;
    };

    const beginEditSelectedLedger = () => {
        if (!canEditSelectedLedger || !selectedNode) return;
        setIsEditingExistingLedger(true);
        setShowOpeningBalanceStep(false);
        setPendingLedgerData(null);

        const lvl = selectedNode.level;

        if (lvl === 3) {
            // Editing Sub Group 2: only pre-fill sub_group_2; clear sub_group_3 & ledger name
            setEditSubGroup2(selectedNode.name || '');
            setEditSubGroup3('');
            setEditLedgerName('');
        } else if (lvl === 4) {
            // Editing Sub Group 3: pre-fill sub_group_2 (fixed) and sub_group_3
            setEditSubGroup2(selectedNode.fullPath.sub_group_2 || '');
            setEditSubGroup3(selectedNode.name || '');
            setEditLedgerName('');
        } else {
            // Editing a leaf Ledger: pre-fill all fields
            setEditSubGroup2(selectedNode.fullPath.sub_group_2 || '');
            setEditSubGroup3(selectedNode.fullPath.sub_group_3 || '');
            setEditLedgerName(selectedNode.name || selectedNode.fullPath.ledger_type || '');
        }
    };

    const cancelEditSelectedLedger = () => {
        setIsEditingExistingLedger(false);
        setEditLedgerName('');
        setEditSubGroup2('');
        setEditSubGroup3('');
    };

    const deleteSelectedLedger = async () => {
        if (!selectedNode?.ledgerId) return;

        const itemName = selectedNode.name || 'this item';
        const confirmed = window.confirm(`Are you sure you want to delete "${itemName}"? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const res = await httpClient.delete(`/api/masters/ledgers/${selectedNode.ledgerId}/`);
            showSuccess(`"${itemName}" deleted successfully.`);
            setSelectedNode(null);
            setIsEditingExistingLedger(false);
            setTimeout(refetchHierarchy, 300);
        } catch (err: any) {
            console.error('Delete error:', err);
            const errMsg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Unknown error';
            showError(`Failed to delete: ${errMsg}`);
        }
    };

    const saveEditedLedger = async () => {
        if (!selectedNode?.ledgerId) return;

        const lvl = selectedNode.level;
        const isSubGroupEdit = lvl === 3 || lvl === 4; // editing a sub_group node, not a leaf ledger

        const nextName = editLedgerName.trim();
        // Ledger name is only required when editing a leaf ledger node
        if (!isSubGroupEdit && !nextName) {
            showWarning('Ledger name cannot be empty.');
            return;
        }

        try {
            const ledgerId = selectedNode.ledgerId;
            const patchPayload: Record<string, string | null> = {};

            if (!isSubGroupEdit && nextName) {
                patchPayload.name = nextName;
            }

            const sg2 = editSubGroup2.trim();
            const sg3 = editSubGroup3.trim();

            // For sub_group_2 edit: always send the new sg2 value
            if (lvl === 3) {
                patchPayload.sub_group_2 = sg2 || null;
            }
            // For sub_group_3 edit: send the new sg3, and also allow updating its parent sg2
            if (lvl === 4) {
                patchPayload.sub_group_3 = sg3 || null;
                if (sg2 !== (selectedNode.fullPath.sub_group_2 || '')) {
                    patchPayload.sub_group_2 = sg2 || null;
                }
            }
            // For leaf ledger: send changed sub_groups + name
            if (!isSubGroupEdit) {
                if (sg2 !== (selectedNode.fullPath.sub_group_2 || '')) {
                    patchPayload.sub_group_2 = sg2 || null;
                }
                if (sg3 !== (selectedNode.fullPath.sub_group_3 || '')) {
                    patchPayload.sub_group_3 = sg3 || null;
                }
            }
            await httpClient.patch(`/api/masters/ledgers/${ledgerId}/`, patchPayload);
            showSuccess('Ledger updated successfully.');

            setIsEditingExistingLedger(false);
            setEditLedgerName('');
            setEditSubGroup2('');
            setEditSubGroup3('');

            const tree = await refetchHierarchy();
            if (tree) {
                const found = findNodeByLedgerId(tree, ledgerId);
                if (found) {
                    selectNodeForPreview(found);
                } else {
                    setSelectedNode(null);
                }
            }
        } catch (e) {
            console.error('Error updating ledger:', e);
            showError('Failed to update ledger.');
        }
    };

    return (
        <div className="bg-white rounded-[4px] border border-gray-200 space-y-4">
            <div className="p-4 border-b border-gray-200">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Icon name="wand-sparkles" />
                    Create Ledger
                </h4>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Hierarchy Tree */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Ledger Type
                    </label>
                    <div className="border border-gray-300 rounded-[4px] p-3 max-h-[32rem] overflow-y-auto bg-gray-50">
                        {treeData.length > 0 ? (
                            renderTree(treeData)
                        ) : (
                            <div className="text-gray-500 text-sm">No hierarchy data available</div>
                        )}
                    </div>
                    <p className="text-[13.5px] text-gray-600 mt-4 leading-relaxed bg-blue-50/50 p-2 rounded border border-blue-100/50">
                        <strong>Single click</strong> to select any level. <strong>Double click</strong> to expand/collapse categories.
                        <br />
                        <span className="text-red-600 font-semibold italic">★ Red Italic items</span> are your endpoints (ledgers). Click them to create nested entries if needed!
                    </p>
                </div>

                {/* Right Column: Preview & Form */}
                <div>
                    <div className="bg-gray-50 border border-gray-200 rounded-[4px] p-4">
                        <h5 className="text-sm font-semibold text-gray-700 mb-4">Ledger Preview</h5>

                        {/* Hierarchy Details Grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
                            {/* Category */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Category
                                </label>
                                <div className="text-sm font-medium text-gray-800 py-2 border-b border-gray-100">
                                    {selectedNode?.fullPath.category || '-'}
                                </div>
                            </div>

                            {/* Group */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Group
                                </label>
                                <div className="text-sm font-medium text-gray-800 py-2 border-b border-gray-100">
                                    {selectedNode?.fullPath.group || '-'}
                                </div>
                            </div>

                            {/* Sub Group 1 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Sub Group 1
                                </label>
                                <div className="text-sm font-medium text-gray-800 py-2 border-b border-gray-100">
                                    {selectedNode?.fullPath.sub_group_1 || '-'}
                                </div>
                            </div>

                            {/* Sub Group 2 - INPUT */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Sub Group 2
                                </label>
                                <input
                                    type="text"
                                    value={
                                        isEditingExistingLedger
                                            ? editSubGroup2
                                            : (isSubGroup2Fixed ? (selectedNode?.fullPath.sub_group_2 || '') : subGroup2Input)
                                    }
                                    onChange={(e) => {
                                        if (isEditingExistingLedger) { setEditSubGroup2(e.target.value); return; }
                                        if (!isSubGroup2Fixed) setSubGroup2Input(e.target.value);
                                    }}
                                    disabled={!selectedNode || (!isEditingExistingLedger && isSubGroup2Fixed)}
                                    className={`w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!selectedNode || (!isEditingExistingLedger && isSubGroup2Fixed)
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-white border-gray-300'
                                        }`}
                                    placeholder={!selectedNode ? '-' : ((!isEditingExistingLedger && isSubGroup2Fixed) ? '' : 'Enter Name')}
                                />
                            </div>

                            {/* Sub Group 3 - INPUT */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Sub Group 3
                                </label>
                                <input
                                    type="text"
                                    value={
                                        isEditingExistingLedger
                                            ? editSubGroup3
                                            : (isSubGroup3Fixed ? (selectedNode?.fullPath.sub_group_3 || '') : subGroup3Input)
                                    }
                                    onChange={(e) => {
                                        if (isEditingExistingLedger) { setEditSubGroup3(e.target.value); return; }
                                        if (!isSubGroup3Fixed) setSubGroup3Input(e.target.value);
                                    }}
                                    disabled={!selectedNode || (!isEditingExistingLedger && isSubGroup3Fixed)}
                                    className={`w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!selectedNode || (!isEditingExistingLedger && isSubGroup3Fixed)
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-white border-gray-300'
                                        }`}
                                    placeholder={!selectedNode ? '-' : ((!isEditingExistingLedger && isSubGroup3Fixed) ? '' : 'Enter Name')}
                                />
                            </div>

                            {/* Ledger Name - INPUT */}
                            <div className="flex flex-col">
                                <label className="text-sm font-medium text-gray-700 mb-1">
                                    Ledger Name
                                </label>
                                <input
                                    type="text"
                                    value={isEditingExistingLedger
                                        ? editLedgerName
                                        : (isLedgerTypeFixed ? (selectedNode?.fullPath.ledger_type || '') : ledgerTypeInput)
                                    }
                                    onChange={(e) => {
                                        if (isEditingExistingLedger) {
                                            setEditLedgerName(e.target.value);
                                            return;
                                        }
                                        if (!isLedgerTypeFixed) setLedgerTypeInput(e.target.value);
                                    }}
                                    disabled={!selectedNode || (!isEditingExistingLedger && isLedgerTypeFixed)}
                                    className={`w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!selectedNode || (!isEditingExistingLedger && isLedgerTypeFixed)
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-white border-gray-300'
                                        }`}
                                    placeholder={!selectedNode ? '-' : (isLedgerTypeFixed ? '' : 'Enter Name')}
                                />
                            </div>
                        </div>

                        {/* DYNAMIC QUESTIONS SECTION */}
                        {selectedNode?.fullPath.sub_group_1 && (
                            <LedgerQuestions
                                selectedLedgerType={selectedNode.fullPath.sub_group_1}
                                onAnswersChange={setQuestionAnswers}
                            />
                        )}
                        <div className="flex items-center justify-between gap-2 mb-2">
                            {/* Debug info - temporary */}
                            <div className="text-[10px] text-gray-400">
                                L-ID: {selectedNode?.ledgerId || 'N/A'} | Level: {selectedNode?.level}
                            </div>
                            {canEditSelectedLedger && !showOpeningBalanceStep && (
                                <div className="flex items-center gap-2">
                                    {!isEditingExistingLedger ? (
                                        <button
                                            type="button"
                                            onClick={beginEditSelectedLedger}
                                            className="px-4 py-2 rounded-[4px] text-sm font-medium text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50 transition-colors"
                                        >
                                            Edit Ledger
                                        </button>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                onClick={cancelEditSelectedLedger}
                                                className="px-4 py-2 rounded-[4px] text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                onClick={saveEditedLedger}
                                                className="px-4 py-2 rounded-[4px] text-sm font-medium text-white bg-indigo-600 border border-transparent hover:bg-indigo-700 transition-colors shadow-sm"
                                            >
                                                Save Changes
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Create Ledger Button OR Opening Balance Step */}
                        {isEditingExistingLedger ? null : showOpeningBalanceStep ? (
                            <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-lg">💰</span>
                                    <h6 className="text-sm font-semibold text-indigo-800">
                                        Opening Balance for <span className="italic">{pendingLedgerData?.customName}</span>
                                    </h6>
                                </div>
                                <p className="text-xs text-indigo-600 leading-relaxed">
                                    Enter the opening balance for this ledger. You can skip if not applicable.
                                </p>

                                {/* Amount Row */}
                                <div className="flex gap-3 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
                                        <input
                                            type="number"
                                            value={openingBalance}
                                            onChange={(e) => setOpeningBalance(e.target.value)}
                                            className="w-full p-2 border border-indigo-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                            placeholder="0.00"
                                            min="0"
                                            step="0.01"
                                            autoFocus
                                        />
                                    </div>
                                    {/* Dr / Cr Toggle */}
                                    <div className="flex rounded overflow-hidden border border-indigo-300 text-sm font-medium shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setOpeningBalanceType('debit')}
                                            className={`px-4 py-2 transition-colors ${openingBalanceType === 'debit'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white text-indigo-700 hover:bg-indigo-50'
                                                }`}
                                        >
                                            Dr
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOpeningBalanceType('credit')}
                                            className={`px-4 py-2 transition-colors border-l border-indigo-300 ${openingBalanceType === 'credit'
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white text-indigo-700 hover:bg-indigo-50'
                                                }`}
                                        >
                                            Cr
                                        </button>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleConfirmOpeningBalance}
                                        className="flex-1 bg-indigo-600 text-white px-4 py-2.5 rounded text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Save Ledger
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSkipOpeningBalance}
                                        className="px-4 py-2.5 rounded text-sm font-medium text-indigo-700 bg-white border border-indigo-300 hover:bg-indigo-50 transition-colors"
                                    >
                                        Skip
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-6">
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    className="w-full bg-indigo-600 text-white px-6 py-3 rounded-[4px] font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Create Ledger
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};


