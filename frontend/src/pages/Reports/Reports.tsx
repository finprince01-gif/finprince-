import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import type { Ledger, Voucher, StockItem, SalesPurchaseVoucher, LedgerGroupMaster } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area } from 'recharts';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5003';

// Hardcoded groups and ledgers for dropdown
const hardcodedGroups = [
  "Bank Accounts",
  "Cash-in-Hand",
  "Duties & Taxes",
  "Provisions",
  "Reserves & Surplus",
  "Secured Loans",
  "Sundry Creditors",
  "Sundry Debtors",
  "Unsecured Loans",
  "Stock-in-Hand",
  "Bank OD A/c"
];

const hardcodedLedgers = [
  "Cash",
  "HDFC Bank",
  "Sales",
  "Purchases",
  "Consulting Income",
  "CGST",
  "SGST",
  "IGST",
  "Balamurugan Fabricators",
  "Local Supplier",
  "Global Tech Supplies",
  "Local Customer",
  "Prime Retail Customer",
  "Rent Expense",
  "Office Supplies",
  "Owner Capital"
];

// Ledger Selector Component
interface LedgerSelectorProps {
  selectedValue: string;
  onChange: (value: string) => void;
  groups: string[];
  ledgers: string[];
}

const LedgerSelector: React.FC<LedgerSelectorProps> = ({
  selectedValue,
  onChange,
  groups,
  ledgers
}) => {
  return (
    <select
      value={selectedValue}
      onChange={(e) => onChange(e.target.value)}
      className="block w-full pl-4 pr-10 py-3 text-base border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
    >
      <option value="">All Ledgers</option>
      <optgroup label="Groups">
        {groups.map(g => <option key={g} value={`group:${g}`}>{g}</option>)}
      </optgroup>
      <optgroup label="Ledgers">
        {ledgers.map(l => <option key={l} value={`ledger:${l}`}>{l}</option>)}
      </optgroup>
    </select>
  );
};

interface ReportsPageProps {
  vouchers: Voucher[];
  ledgers: Ledger[];
  ledgerGroups: LedgerGroupMaster[];
  stockItems: StockItem[];
}

type ReportType = 'DayBook' | 'LedgerReport' | 'TrialBalance' | 'BalanceSheet' | 'StockSummary' | 'GSTReports' | 'AIReport';

type GSTForm = 'GSTR-1' | 'GSTR-2' | 'GSTR-2A' | 'GSTR-2B' | 'GSTR-3B' | 'GSTR-4' | 'GSTR-5' | 'GSTR-5A' | 'GSTR-6' | 'GSTR-7' | 'GSTR-8' | 'GSTR-9' | 'GSTR-9A' | 'GSTR-9C' | 'GSTR-10';

type GSTTab = 'B2B' | 'B2C-L' | 'B2C-S' | 'Exports' | 'CDN' | 'Advances' | 'ITC-Eligible' | 'ITC-Ineligible' | 'RCM-Liability' | 'ITC-Available' | 'ITC-Reversal' | 'Outward' | 'ITC' | 'Payment';

const ReportsPage: React.FC<ReportsPageProps> = ({ vouchers = [], ledgers = [], ledgerGroups = [], stockItems = [] }) => {
  // Report Options Mapping
  const { hasTabAccess, isSuperuser } = usePermissions();

  // Report Options Mapping
  const allReports: { id: ReportType; label: string }[] = [
    { id: 'DayBook', label: 'DAY BOOK' },
    { id: 'LedgerReport', label: 'LEDGER REPORT' },
    { id: 'TrialBalance', label: 'TRIAL BALANCE' },
    { id: 'BalanceSheet', label: 'BALANCE SHEET' },
    { id: 'StockSummary', label: 'STOCK SUMMARY' },
    { id: 'GSTReports', label: 'GST REPORTS' },
    { id: 'AIReport', label: 'AI REPORT' }
  ];

  // Map ReportType IDs to permission tab names
  const reportPermissionMap: { [key in ReportType]: string } = {
    'DayBook': 'DayBook',
    'LedgerReport': 'LedgerReport',
    'TrialBalance': 'TrialBalance',
    'BalanceSheet': 'BalanceSheet',
    'StockSummary': 'StockSummary',
    'GSTReports': 'GSTReports',
    'AIReport': 'AIReport'
  };

  // Filter Reports based on permissions
  const availableReports = isSuperuser
    ? allReports
    : allReports.filter(report => {
      const permissionTabName = reportPermissionMap[report.id];
      return hasTabAccess('Reports', permissionTabName);
    });

  const defaultReport = availableReports.length > 0 ? availableReports[0].id : ('DayBook' as ReportType);

  const [reportType, setReportType] = useState<ReportType>(defaultReport);

  // Ensure active report is valid
  useEffect(() => {
    if (availableReports.length > 0 && !availableReports.find(r => r.id === reportType)) {
      setReportType(availableReports[0].id);
    }
  }, [availableReports, reportType]);

  const [selectedLedger, setSelectedLedger] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Download mappings for each report type
  const downloadMappings: { [key in ReportType]: { endpoint: string; filename: string } } = {
    DayBook: { endpoint: '/api/reports/daybook/excel', filename: 'DayBook.xlsx' },
    LedgerReport: { endpoint: '/api/reports/ledger/excel', filename: 'Ledger.xlsx' },
    TrialBalance: { endpoint: '/api/reports/trialbalance/excel', filename: 'TrialBalance.xlsx' },
    StockSummary: { endpoint: '/api/reports/stocksummary/excel', filename: 'StockSummary.xlsx' },
    GSTReports: { endpoint: '/api/reports/gst/excel', filename: 'GstReport.xlsx' },
    AIReport: { endpoint: '/api/reports/ai/excel', filename: 'AIReport.xlsx' },
    BalanceSheet: { endpoint: '/api/reports/balancesheet/excel', filename: 'BalanceSheet.xlsx' }
  };

  // Handle Excel download
  const handleDownload = async () => {
    const mapping = downloadMappings[reportType];
    try {
      // Construct Query Params
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      if (reportType === 'LedgerReport' && selectedLedger) {
        // Extract actual name if it has prefix
        const cleanName = selectedLedger.includes(':') ? selectedLedger.split(':')[1] : selectedLedger;
        params.append('ledger', cleanName);
      }

      const response = await fetch(`${API_BASE_URL}${mapping.endpoint}?${params.toString()}`, {
        method: 'GET',
        headers: {
          // 'Authorization': ... removed, using cookies now
        },
        credentials: 'include', // Important: Send cookies
      });
      if (!response.ok) throw new Error('Failed to download');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = mapping.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading Excel:', error);
      alert('Failed to download Excel file. Please try again.');
    }
  };

  const [gstForm, setGstForm] = useState<GSTForm>('GSTR-1');
  const [gstTab, setGstTab] = useState<GSTTab>('B2B');
  const [selectedGstReturn, setSelectedGstReturn] = useState<GSTForm>('GSTR-1');

  // Handle GST return dropdown changes
  useEffect(() => {
    setSelectedGstReturn(gstForm);
  }, [gstForm]);

  // ============================================================================
  // AI REPORT STATE
  // ============================================================================
  interface KPIMetric {
    label: string;
    value: string;
    change?: string;
    changeType?: 'positive' | 'negative' | 'neutral';
    icon: 'sales' | 'purchase' | 'payment' | 'receipt' | 'tax' | 'profit';
  }

  interface AIMessage {
    role: 'user' | 'ai';
    text: string;
    reportData?: {
      title: string;
      summary: string;
      tableData: { [key: string]: string | number }[];
      chartData: { name: string; value: number; color?: string }[];
      chartType: 'bar' | 'pie' | 'line' | 'area';
      kpiMetrics?: KPIMetric[];
    };
  }

  const [aiInput, setAiInput] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [currentReport, setCurrentReport] = useState<AIMessage['reportData'] | null>(null);
  const [reportView, setReportView] = useState<'table' | 'chart'>('table'); // Default to table view

  // Chart colors
  const CHART_COLORS = ['#f97316', '#3b82f6', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#eab308', '#ec4899'];

  // Generate report data based on query
  const generateReportFromQuery = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    let reportData: AIMessage['reportData'] | null = null;

    // Calculate common metrics with proper number conversion
    const salesVouchers = vouchers.filter(v => v.type === 'Sales') as SalesPurchaseVoucher[];
    const purchaseVouchers = vouchers.filter(v => v.type === 'Purchase') as SalesPurchaseVoucher[];

    // Ensure proper number conversion
    const totalSales = salesVouchers.reduce((sum, v) => {
      const total = Number(v.total) || 0;
      return sum + total;
    }, 0);

    const totalPurchases = purchaseVouchers.reduce((sum, v) => {
      const total = Number(v.total) || 0;
      return sum + total;
    }, 0);

    const grossProfit = totalSales - totalPurchases;
    const profitMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : '0';

    // Sales related queries
    if (lowerQuery.includes('sales') || lowerQuery.includes('revenue')) {
      // Calculate detailed metrics for each customer
      const customerDetails: {
        [key: string]: {
          total: number;
          count: number;
          taxableAmount: number;
          cgst: number;
          sgst: number;
          igst: number;
          dates: Date[];
        }
      } = {};

      salesVouchers.forEach(v => {
        if (!customerDetails[v.party]) {
          customerDetails[v.party] = {
            total: 0,
            count: 0,
            taxableAmount: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            dates: []
          };
        }
        customerDetails[v.party].total += Number(v.total) || 0;
        customerDetails[v.party].count += 1;
        customerDetails[v.party].taxableAmount += Number(v.totalTaxableAmount) || 0;
        customerDetails[v.party].cgst += Number(v.totalCgst) || 0;
        customerDetails[v.party].sgst += Number(v.totalSgst) || 0;
        customerDetails[v.party].igst += Number(v.totalIgst) || 0;
        customerDetails[v.party].dates.push(new Date(v.date));
      });

      const chartData = Object.entries(customerDetails)
        .map(([name, details], idx) => ({ name, value: details.total, color: CHART_COLORS[idx % CHART_COLORS.length] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const tableData = chartData.map((item, idx) => {
        const details = customerDetails[item.name];
        const avgValue = details.count > 0 ? details.total / details.count : 0;
        const totalTax = details.cgst + details.sgst + details.igst;
        const sortedDates = details.dates.sort((a, b) => a.getTime() - b.getTime());
        const firstDate = sortedDates[0];
        const lastDate = sortedDates[sortedDates.length - 1];

        return {
          '#': String(idx + 1),
          'Customer': item.name,
          'Total Sales (₹)': `₹${item.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Transactions': String(details.count),
          'Avg Transaction (₹)': `₹${avgValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Taxable Amount (₹)': `₹${details.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Total Tax (₹)': `₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'CGST (₹)': `₹${details.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'SGST (₹)': `₹${details.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'IGST (₹)': `₹${details.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'First Transaction': firstDate.toLocaleDateString('en-IN'),
          'Last Transaction': lastDate.toLocaleDateString('en-IN'),
          'Share (%)': totalSales > 0 ? `${((item.value / totalSales) * 100).toFixed(1)}%` : '0%'
        };
      });

      const avgOrderValue = salesVouchers.length > 0 ? totalSales / salesVouchers.length : 0;

      reportData = {
        title: 'Sales Analytics Dashboard',
        summary: `Comprehensive analysis of ${salesVouchers.length} sales transactions`,
        tableData,
        chartData,
        chartType: 'bar',
        kpiMetrics: [
          {
            label: 'Total Revenue',
            value: `₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: 'sales',
            change: '+12.5%',
            changeType: 'positive'
          },
          {
            label: 'Transactions',
            value: salesVouchers.length.toString(),
            icon: 'receipt',
            change: '+8',
            changeType: 'positive'
          },
          {
            label: 'Avg Order Value',
            value: `₹${avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: 'payment'
          },
          {
            label: 'Top Customers',
            value: Object.keys(customerDetails).length.toString(),
            icon: 'profit'
          }
        ]
      };
    }
    // Purchase/Expense related queries
    else if (lowerQuery.includes('purchase') || lowerQuery.includes('expense') || lowerQuery.includes('spending') || lowerQuery.includes('vendor')) {
      // Calculate detailed metrics for each vendor
      const vendorDetails: {
        [key: string]: {
          total: number;
          count: number;
          taxableAmount: number;
          cgst: number;
          sgst: number;
          igst: number;
          dates: Date[];
        }
      } = {};

      purchaseVouchers.forEach(v => {
        if (!vendorDetails[v.party]) {
          vendorDetails[v.party] = {
            total: 0,
            count: 0,
            taxableAmount: 0,
            cgst: 0,
            sgst: 0,
            igst: 0,
            dates: []
          };
        }
        vendorDetails[v.party].total += Number(v.total) || 0;
        vendorDetails[v.party].count += 1;
        vendorDetails[v.party].taxableAmount += Number(v.totalTaxableAmount) || 0;
        vendorDetails[v.party].cgst += Number(v.totalCgst) || 0;
        vendorDetails[v.party].sgst += Number(v.totalSgst) || 0;
        vendorDetails[v.party].igst += Number(v.totalIgst) || 0;
        vendorDetails[v.party].dates.push(new Date(v.date));
      });

      const chartData = Object.entries(vendorDetails)
        .map(([name, details], idx) => ({ name, value: details.total, color: CHART_COLORS[idx % CHART_COLORS.length] }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const tableData = chartData.map((item, idx) => {
        const details = vendorDetails[item.name];
        const avgValue = details.count > 0 ? details.total / details.count : 0;
        const totalTax = details.cgst + details.sgst + details.igst;
        const sortedDates = details.dates.sort((a, b) => a.getTime() - b.getTime());
        const firstDate = sortedDates[0];
        const lastDate = sortedDates[sortedDates.length - 1];

        return {
          '#': String(idx + 1),
          'Vendor': item.name,
          'Total Purchases (₹)': `₹${item.value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Transactions': String(details.count),
          'Avg Transaction (₹)': `₹${avgValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Taxable Amount (₹)': `₹${details.taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'Total Tax (₹)': `₹${totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'CGST (₹)': `₹${details.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'SGST (₹)': `₹${details.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'IGST (₹)': `₹${details.igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          'First Transaction': firstDate.toLocaleDateString('en-IN'),
          'Last Transaction': lastDate.toLocaleDateString('en-IN'),
          'Share (%)': totalPurchases > 0 ? `${((item.value / totalPurchases) * 100).toFixed(1)}%` : '0%'
        };
      });

      const avgPurchaseValue = purchaseVouchers.length > 0 ? totalPurchases / purchaseVouchers.length : 0;

      reportData = {
        title: 'Expense Analytics Dashboard',
        summary: `Detailed breakdown of ${purchaseVouchers.length} expense transactions`,
        tableData,
        chartData,
        chartType: 'pie',
        kpiMetrics: [
          { label: 'Total Expenses', value: `₹${totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'purchase', change: '-5.2%', changeType: 'positive' },
          { label: 'Transactions', value: purchaseVouchers.length.toString(), icon: 'receipt' },
          { label: 'Avg Purchase', value: `₹${avgPurchaseValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'payment' },
          { label: 'Vendors', value: Object.keys(vendorDetails).length.toString(), icon: 'profit' }
        ]
      };
    }
    // GST/Tax related queries
    else if (lowerQuery.includes('gst') || lowerQuery.includes('tax')) {
      const outputCGST = salesVouchers.reduce((sum, v) => sum + (v.totalCgst || 0), 0);
      const outputSGST = salesVouchers.reduce((sum, v) => sum + (v.totalSgst || 0), 0);
      const outputIGST = salesVouchers.reduce((sum, v) => sum + (v.totalIgst || 0), 0);

      const inputCGST = purchaseVouchers.reduce((sum, v) => sum + (v.totalCgst || 0), 0);
      const inputSGST = purchaseVouchers.reduce((sum, v) => sum + (v.totalSgst || 0), 0);
      const inputIGST = purchaseVouchers.reduce((sum, v) => sum + (v.totalIgst || 0), 0);

      const totalOutput = outputCGST + outputSGST + outputIGST;
      const totalInput = inputCGST + inputSGST + inputIGST;
      const netLiability = totalOutput - totalInput;

      const chartData = [
        { name: 'Output CGST', value: outputCGST, color: '#f97316' },
        { name: 'Output SGST', value: outputSGST, color: '#fb923c' },
        { name: 'Output IGST', value: outputIGST, color: '#fdba74' },
        { name: 'Input CGST', value: inputCGST, color: '#3b82f6' },
        { name: 'Input SGST', value: inputSGST, color: '#60a5fa' },
        { name: 'Input IGST', value: inputIGST, color: '#93c5fd' }
      ];

      const tableData = [
        { 'Tax Type': 'CGST', 'Output (₹)': `₹${outputCGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Input (₹)': `₹${inputCGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Net (₹)': `₹${(outputCGST - inputCGST).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { 'Tax Type': 'SGST', 'Output (₹)': `₹${outputSGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Input (₹)': `₹${inputSGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Net (₹)': `₹${(outputSGST - inputSGST).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { 'Tax Type': 'IGST', 'Output (₹)': `₹${outputIGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Input (₹)': `₹${inputIGST.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Net (₹)': `₹${(outputIGST - inputIGST).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
        { 'Tax Type': 'TOTAL', 'Output (₹)': `₹${totalOutput.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Input (₹)': `₹${totalInput.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Net (₹)': `₹${netLiability.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }
      ];

      reportData = {
        title: 'GST Analytics Dashboard',
        summary: `Complete GST overview with input tax credit analysis`,
        tableData,
        chartData,
        chartType: 'bar',
        kpiMetrics: [
          { label: 'Output Tax', value: `₹${totalOutput.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'tax', change: 'Collected', changeType: 'neutral' },
          { label: 'Input Credit', value: `₹${totalInput.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'receipt', change: 'Claimable', changeType: 'positive' },
          { label: 'Net Liability', value: `₹${netLiability.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'payment', change: netLiability > 0 ? 'Payable' : 'Refund', changeType: netLiability > 0 ? 'negative' : 'positive' },
          { label: 'Effective Rate', value: totalSales > 0 ? `${((totalOutput / totalSales) * 100).toFixed(1)}%` : '0%', icon: 'profit' }
        ]
      };
    }
    // Default - Show customer/vendor breakdown
    else {
      // Combine sales and purchase data for a comprehensive view
      const partyDetails: {
        [key: string]: {
          sales: number;
          purchases: number;
          salesCount: number;
          purchasesCount: number;
          totalTax: number;
          dates: Date[];
        }
      } = {};

      // Process sales vouchers
      salesVouchers.forEach(v => {
        if (!partyDetails[v.party]) {
          partyDetails[v.party] = {
            sales: 0,
            purchases: 0,
            salesCount: 0,
            purchasesCount: 0,
            totalTax: 0,
            dates: []
          };
        }
        partyDetails[v.party].sales += Number(v.total) || 0;
        partyDetails[v.party].salesCount += 1;
        partyDetails[v.party].totalTax += (Number(v.totalCgst) || 0) + (Number(v.totalSgst) || 0) + (Number(v.totalIgst) || 0);
        partyDetails[v.party].dates.push(new Date(v.date));
      });

      // Process purchase vouchers
      purchaseVouchers.forEach(v => {
        if (!partyDetails[v.party]) {
          partyDetails[v.party] = {
            sales: 0,
            purchases: 0,
            salesCount: 0,
            purchasesCount: 0,
            totalTax: 0,
            dates: []
          };
        }
        partyDetails[v.party].purchases += Number(v.total) || 0;
        partyDetails[v.party].purchasesCount += 1;
        partyDetails[v.party].totalTax += (Number(v.totalCgst) || 0) + (Number(v.totalSgst) || 0) + (Number(v.totalIgst) || 0);
        partyDetails[v.party].dates.push(new Date(v.date));
      });

      const chartData = Object.entries(partyDetails)
        .map(([name, details]) => ({
          name,
          value: details.sales + details.purchases,
          color: CHART_COLORS[0]
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const tableData = Object.entries(partyDetails)
        .sort(([, a], [, b]) => (b.sales + b.purchases) - (a.sales + a.purchases))
        .slice(0, 10)
        .map(([name, details], idx) => {
          const totalTransactions = details.salesCount + details.purchasesCount;
          const totalAmount = details.sales + details.purchases;
          const netBalance = details.sales - details.purchases;
          const sortedDates = details.dates.sort((a, b) => a.getTime() - b.getTime());
          const firstDate = sortedDates[0];
          const lastDate = sortedDates[sortedDates.length - 1];

          return {
            '#': String(idx + 1),
            'Party Name': name,
            'Sales (₹)': `₹${details.sales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Purchases (₹)': `₹${details.purchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Net Balance (₹)': `₹${netBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Total Tax (₹)': `₹${details.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Transactions': String(totalTransactions),
            'First Transaction': firstDate ? firstDate.toLocaleDateString('en-IN') : '-',
            'Last Transaction': lastDate ? lastDate.toLocaleDateString('en-IN') : '-'
          };
        });

      reportData = {
        title: 'Party-wise Financial Overview',
        summary: `Comprehensive analysis of ${Object.keys(partyDetails).length} parties with ${vouchers.length} total transactions`,
        tableData,
        chartData,
        chartType: 'bar',
        kpiMetrics: [
          { label: 'Total Sales', value: `₹${totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'sales', change: '+15.3%', changeType: 'positive' },
          { label: 'Total Expenses', value: `₹${totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'purchase', change: '-3.2%', changeType: 'positive' },
          { label: 'Gross Profit', value: `₹${grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: 'profit', change: `${profitMargin}%`, changeType: grossProfit >= 0 ? 'positive' : 'negative' },
          { label: 'Transactions', value: vouchers.length.toString(), icon: 'receipt' }
        ]
      };
    }

    return reportData;
  }, [vouchers]);

  // Handle AI Report send
  const handleAiSend = useCallback(() => {
    if (!aiInput.trim() || aiLoading) return;

    setAiLoading(true);

    // Simulate AI processing
    setTimeout(() => {
      const reportData = generateReportFromQuery(aiInput);
      setCurrentReport(reportData);
      setAiLoading(false);
    }, 1500);

    setAiInput('');
  }, [aiInput, aiLoading, generateReportFromQuery]);

  // Handle Enter key in AI input
  const handleAiKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAiSend();
    }
  };

  // Download report as Excel
  const downloadReportExcel = useCallback((report: AIMessage['reportData']) => {
    if (!report) return;

    // Create CSV content
    const headers = Object.keys(report.tableData[0] || {});
    const csvContent = [
      headers.join(','),
      ...report.tableData.map(row => headers.map(h => `"${row[h]}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Download report as PDF (simple print)
  const downloadReportPDF = useCallback((report: AIMessage['reportData']) => {
    if (!report) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tableHtml = `
      <table border="1" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr style="background: #f97316; color: white;">
            ${Object.keys(report.tableData[0] || {}).map(h => `<th style="padding: 8px;">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${report.tableData.map(row => `
            <tr>
              ${Object.values(row).map(v => `<td style="padding: 8px;">${v}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    printWindow.document.write(`
      <html>
        <head>
          <title>${report.title}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #f97316; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <h1>${report.title}</h1>
          <p>${report.summary}</p>
          ${tableHtml}
          <p style="margin-top: 20px; font-size: 12px; color: #999;">Generated on ${new Date().toLocaleString()}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }, []);

  // Prevent rendering if data arrays are not properly initialized
  if (!Array.isArray(vouchers) || !Array.isArray(ledgers) || !Array.isArray(stockItems)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading reports data...</div>
      </div>
    );
  }

  const ledgersByName = useMemo(() => {
    if (!ledgers || !Array.isArray(ledgers)) return {};
    return ledgers.filter(ledger => ledger && ledger.name).reduce((acc, ledger) => {
      acc[ledger.name] = ledger;
      return acc;
    }, {} as { [key: string]: Ledger });
  }, [ledgers]);

  const ledgerToGroup = useMemo(() => {
    const map: { [key: string]: string } = {};
    ledgers.forEach(l => map[l.name] = l.group);
    return map;
  }, [ledgers]);

  const getInvolvedLedgers = (v: Voucher): string[] => {
    switch (v.type) {
      case 'Purchase':
      case 'Sales':
        return [v.party];
      case 'Payment':
      case 'Receipt':
        return [v.party, (v as any).account];
      case 'Contra':
        const contra = v as any;
        return [contra.fromAccount, contra.toAccount];
      case 'Journal':
        return (v as any).entries.map((e: any) => e.ledger);
      default:
        return [];
    }
  };



  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    if (vouchers && Array.isArray(vouchers)) {
      vouchers.forEach(v => {
        const d = new Date(v.date);
        // Handle potential invalid dates from user input
        if (!isNaN(d.getTime())) {
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.add(monthKey);
        }
      });
    }
    return Array.from(months).sort((a, b) => b.localeCompare(a)).map(monthKey => {
      const [year, month] = monthKey.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return {
        value: monthKey,
        label: date.toLocaleString('default', { month: 'long', year: 'numeric' })
      };
    });
  }, [vouchers]);

  const trialBalanceData = useMemo(() => {
    if (reportType !== 'TrialBalance') return null;

    try {
      const balances: { [key: string]: { debit: number; credit: number } } = {};

      // Helper to safely initialize a ledger if it doesn't exist
      const ensureLedger = (name: string) => {
        if (name && typeof name === 'string' && !balances[name]) {
          balances[name] = { debit: 0, credit: 0 };
        }
      };

      // Initialize with all known ledgers from the master list
      if (ledgers && Array.isArray(ledgers)) {
        ledgers.forEach(l => ensureLedger(l.name));
      }

      if (vouchers && Array.isArray(vouchers)) {
        vouchers.forEach(v => {
          // Ensure all ledgers mentioned in the voucher exist in our balances object
          // before we start calculating. This prevents crashes if data is out of sync.
          switch (v.type) {
            case 'Purchase':
              ensureLedger(v.party);
              ensureLedger('Purchases');
              ensureLedger('IGST'); ensureLedger('CGST'); ensureLedger('SGST');

              if (balances[v.party]) balances[v.party].credit += Number(v.total || 0);
              if (balances['Purchases']) balances['Purchases'].debit += Number(v.totalTaxableAmount || 0);
              if (v.isInterState) {
                if (balances['IGST']) balances['IGST'].debit += Number(v.totalIgst || 0);
              } else {
                if (balances['CGST']) balances['CGST'].debit += Number(v.totalCgst || 0);
                if (balances['SGST']) balances['SGST'].debit += Number(v.totalSgst || 0);
              }
              break;
            case 'Sales':
              ensureLedger(v.party);
              ensureLedger('Sales');
              ensureLedger('IGST'); ensureLedger('CGST'); ensureLedger('SGST');

              if (balances[v.party]) balances[v.party].debit += Number(v.total || 0);
              if (balances['Sales']) balances['Sales'].credit += Number(v.totalTaxableAmount || 0);
              if (v.isInterState) {
                if (balances['IGST']) balances['IGST'].credit += Number(v.totalIgst || 0);
              } else {
                if (balances['CGST']) balances['CGST'].credit += Number(v.totalCgst || 0);
                if (balances['SGST']) balances['SGST'].credit += Number(v.totalSgst || 0);
              }
              break;
            case 'Payment':
              ensureLedger(v.party);
              ensureLedger((v as any).account);
              if (balances[v.party]) balances[v.party].debit += Number((v as any).amount || 0);
              if (balances[(v as any).account]) balances[(v as any).account].credit += Number((v as any).amount || 0);
              break;
            case 'Receipt':
              ensureLedger(v.party);
              ensureLedger((v as any).account);
              if (balances[v.party]) balances[v.party].credit += Number((v as any).amount || 0);
              if (balances[(v as any).account]) balances[(v as any).account].debit += Number((v as any).amount || 0);
              break;
            case 'Contra':
              ensureLedger((v as any).fromAccount);
              ensureLedger((v as any).toAccount);
              if (balances[(v as any).fromAccount]) balances[(v as any).fromAccount].credit += Number((v as any).amount || 0);
              if (balances[(v as any).toAccount]) balances[(v as any).toAccount].debit += Number((v as any).amount || 0);
              break;
            case 'Journal':
              if ((v as any).entries && Array.isArray((v as any).entries)) {
                (v as any).entries.forEach((e: any) => {
                  if (e && typeof e === 'object' && e.ledger && typeof e.ledger === 'string') {
                    ensureLedger(e.ledger);
                    if (balances[e.ledger]) {
                      balances[e.ledger].debit += Number(e.debit || 0);
                      balances[e.ledger].credit += Number(e.credit || 0);
                    }
                  }
                });
              }
              break;
          }
        });
      }

      const result = Object.entries(balances)
        .map(([ledger, { debit, credit }]) => {
          if (debit > credit) return { ledger, debit: debit - credit, credit: 0 };
          if (credit > debit) return { ledger, debit: 0, credit: credit - debit };
          return { ledger, debit: 0, credit: 0 };
        })
        .filter(item => item.debit > 0 || item.credit > 0);

      const totals = result.reduce((acc, curr) => ({
        debit: acc.debit + curr.debit,
        credit: acc.credit + curr.credit
      }), { debit: 0, credit: 0 });

      return { result, totals };
    } catch (error) {
      console.error('Error calculating trial balance:', error);
      return { result: [], totals: { debit: 0, credit: 0 } };
    }
  }, [reportType, vouchers, ledgers]);

  const stockSummaryData = useMemo(() => {
    if (reportType !== 'StockSummary') return null;

    const summary: { [key: string]: { inward: number, outward: number } } = {};
    if (stockItems && Array.isArray(stockItems)) {
      stockItems.filter(i => i && i.name).forEach(i => {
        summary[i.name] = { inward: 0, outward: 0 };
      });
    }

    if (vouchers && Array.isArray(vouchers)) {
      vouchers.forEach(v => {
        if (v.type === 'Purchase' || v.type === 'Sales') {
          const voucher = v as SalesPurchaseVoucher;
          if (voucher.items && Array.isArray(voucher.items)) {
            voucher.items.filter(item => item && item.name).forEach(item => {
              if (summary[item.name]) {
                if (v.type === 'Purchase') {
                  summary[item.name].inward += item.qty || 0;
                } else {
                  summary[item.name].outward += item.qty || 0;
                }
              }
            });
          }
        }
      });
    }

    return Object.entries(summary).map(([name, data]) => ({
      name,
      opening: 0,
      ...data,
      closing: data.inward - data.outward,
    }));
  }, [reportType, vouchers, stockItems]);

  const gstr1Data = useMemo(() => {
    if (reportType !== 'GSTR1') return null;
    if (!vouchers || !Array.isArray(vouchers)) return { b2b: [], b2c: [] };

    const salesVouchers = vouchers.filter(v => v.type === 'Sales') as SalesPurchaseVoucher[];

    const b2b = salesVouchers.filter(v => {
      const partyLedger = ledgersByName[v.party];
      return partyLedger?.registrationType === 'Registered' && partyLedger?.gstin;
    });

    const b2c = salesVouchers.filter(v => {
      const partyLedger = ledgersByName[v.party];
      return !partyLedger || partyLedger.registrationType !== 'Registered' || !partyLedger.gstin;
    });

    return { b2b, b2c };
  }, [reportType, vouchers, ledgersByName]);




  const filteredVouchers = useMemo(() => {
    if (!vouchers || !Array.isArray(vouchers)) return [];

    let filtered = vouchers;

    if (reportType === 'LedgerReport' && selectedLedger) {
      filtered = filtered.filter(v => {
        switch (v.type) {
          case 'Purchase':
          case 'Sales':
          case 'Payment':
          case 'Receipt':
            return v.party === selectedLedger || ('account' in v && v.account === selectedLedger);
          case 'Contra':
            return v.fromAccount === selectedLedger || v.toAccount === selectedLedger;
          case 'Journal':
            return v.entries && Array.isArray(v.entries) && v.entries.some(e => e && e.ledger === selectedLedger);
          default:
            return false;
        }
      });
    }

    if ((reportType === 'DayBook' || reportType === 'LedgerReport') && (startDate || endDate)) {
      filtered = filtered.filter(v => {
        const vDate = new Date(v.date);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start && vDate < start) return false;
        if (end && vDate > end) return false;
        return true;
      });
    }

    return filtered;
  }, [vouchers, reportType, selectedLedger, startDate, endDate]);

  const getVoucherAmount = (v: Voucher) => {
    if ('total' in v && v.total != null) {
      const num = Number(v.total);
      if (!isNaN(num)) return num;
    }
    if ('amount' in v && v.amount != null) {
      const num = Number(v.amount);
      if (!isNaN(num)) return num;
    }
    return 0;
  };
  const getVoucherParty = (v: Voucher) => ('party' in v ? v.party : 'N/A');

  const ledgerEntries = useMemo(() => {
    if (reportType !== 'LedgerReport' || !selectedLedger || !filteredVouchers.length) return [];

    let balance = 0;
    return filteredVouchers.map(v => {
      let debit = 0, credit = 0, particulars = '';

      switch (v.type) {
        case 'Purchase':
          if (v.party === selectedLedger) {
            credit = v.total || 0;
            particulars = 'Purchases';
          } else if ('account' in v && v.account === selectedLedger) {
            debit = v.total || 0;
            particulars = v.party;
          }
          break;
        case 'Sales':
          if (v.party === selectedLedger) {
            debit = v.total || 0;
            particulars = 'Sales';
          } else if ('account' in v && v.account === selectedLedger) {
            credit = v.total || 0;
            particulars = v.party;
          }
          break;
        case 'Payment':
          if (v.party === selectedLedger) {
            debit = v.amount || 0;
            particulars = v.account;
          } else if (v.account === selectedLedger) {
            credit = v.amount || 0;
            particulars = v.party;
          }
          break;
        case 'Receipt':
          if (v.party === selectedLedger) {
            credit = v.amount || 0;
            particulars = v.account;
          } else if (v.account === selectedLedger) {
            debit = v.amount || 0;
            particulars = v.party;
          }
          break;
        case 'Contra':
          if (v.fromAccount === selectedLedger) {
            credit = v.amount || 0;
            particulars = v.toAccount;
          } else if (v.toAccount === selectedLedger) {
            debit = v.amount || 0;
            particulars = v.fromAccount;
          }
          break;
        case 'Journal':
          if (v.entries && Array.isArray(v.entries)) {
            const entry = v.entries.find(e => e.ledger === selectedLedger);
            if (entry) {
              debit = entry.debit || 0;
              credit = entry.credit || 0;
              particulars = v.entries.filter(e => e.ledger !== selectedLedger).map(e => e.ledger).join(', ') || 'Journal Entry';
            }
          }
          break;
      }

      balance += debit - credit;

      return {
        id: v.id,
        date: v.date,
        type: v.type,
        particulars,
        debit,
        credit,
        balance
      };
    });
  }, [reportType, selectedLedger, filteredVouchers]);

  const renderDayBook = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Voucher Type</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Party</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {filteredVouchers.length > 0 ? filteredVouchers.map((v, idx) => (
            <tr key={`daybook-${v.type}-${v.date}-${v.id || idx}`} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(v.date).toLocaleDateString()}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{v.type}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{getVoucherParty(v)}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹{getVoucherAmount(v).toFixed(2)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-sm text-center text-gray-500">
                {(startDate || endDate) ? 'No transactions found for the selected filter.' : 'No transactions found.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderLedger = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Particulars</th>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Voucher Type</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Debit</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Credit</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Balance</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {ledgerEntries.length > 0 ? ledgerEntries.map((entry, idx) => (
            <tr key={`ledger-${entry.date}-${entry.type}-${entry.id || idx}`} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{new Date(entry.date).toLocaleDateString()}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{entry.particulars}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{entry.type}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{entry.debit > 0 ? `₹${entry.debit.toFixed(2)}` : ''}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{entry.credit > 0 ? `₹${entry.credit.toFixed(2)}` : ''}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹{entry.balance.toFixed(2)}</td>
            </tr>
          )) : (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-sm text-center text-gray-500">
                {!selectedLedger ? 'Please select a ledger.' :
                  (startDate || endDate) ? 'No transactions found for the selected filter.' :
                    'No transactions found.'
                }
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderTrialBalance = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Ledger</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Debit</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Credit</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {trialBalanceData?.result.map(item => (
            <tr key={item.ledger} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{item.ledger}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{item.debit > 0 ? `₹${item.debit.toFixed(2)}` : ''}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{item.credit > 0 ? `₹${item.credit.toFixed(2)}` : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="bg-gray-100">
          <tr>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-gray-900">Total</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-bold text-gray-900">₹{trialBalanceData?.totals.debit.toFixed(2)}</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-bold text-gray-900">₹{trialBalanceData?.totals.credit.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  const renderStockSummary = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Item Name</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Opening Stock</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Inward</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Outward</th>
            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Closing Stock</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {stockSummaryData?.map(item => (
            <tr key={item.name} className="hover:bg-gray-50 transition-colors">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{item.name}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{item.opening}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{item.inward}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{item.outward}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">{item.closing}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // GST Report Render Functions
  const renderGSTR1 = () => (
    <>
      <h3 className="text-xl font-semibold text-gray-900 mb-6">GSTR-1: Details of outward supplies of goods or services</h3>

      {/* Section 1: B2B Invoices */}
      <div className="mb-8">
        <h4 className="text-lg font-medium text-gray-800 mb-4">1. B2B Invoices (Registered Dealers)</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">GSTIN</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">PARTY NAME</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">TAXABLE VALUE</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">TOTAL TAX</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">INVOICE VALUE</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {/* Sample mock data for B2B */}
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">22AAAAA0000A1Z5</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">ABC Corporation Ltd</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹50,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹9,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹59,000.00</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">33BBBBB1111B2Y6</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">XYZ Enterprises Pvt Ltd</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹75,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹13,500.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹88,500.00</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">44CCCCC2222C3X7</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Global Tech Solutions</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹30,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹5,400.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹35,400.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: B2C Invoices */}
      <div className="mb-8">
        <h4 className="text-lg font-medium text-gray-800 mb-4">2. B2C Invoices (Unregistered Dealers)</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">PARTY NAME</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">TAXABLE VALUE</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">TOTAL TAX</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">INVOICE VALUE</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {/* Sample mock data for B2C */}
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Local Customer A</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹25,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹4,500.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹29,500.00</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Walk-in Customer B</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹15,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹2,700.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹17,700.00</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">Online Customer C</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹40,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹7,200.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹47,200.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderGSTR2A = () => (
    <>
      <h3 className="text-xl font-semibold text-gray-900 mb-6">GSTR-2A: Details of inward supplies from registered persons</h3>

      <div className="mb-8">
        <h4 className="text-lg font-medium text-gray-800 mb-4">Purchase Invoices from Registered Suppliers</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">GSTIN</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">SUPPLIER NAME</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">INVOICE NO</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">DATE</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">TAXABLE VALUE</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">IGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">CGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">SGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">INVOICE VALUE</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">22AAAAA0000A1Z5</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">ABC Suppliers Ltd</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">INV-001</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">15/11/2025</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹45,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹4,050.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹4,050.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹53,100.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  const renderGSTR3B = () => (
    <>
      <h3 className="text-xl font-semibold text-gray-900 mb-6">GSTR-3B: Monthly Return</h3>

      <div className="mb-8">
        <h4 className="text-lg font-medium text-gray-800 mb-4">3.1 Details of Outward Supplies</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">DESCRIPTION</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">TAXABLE VALUE</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">IGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">CGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">SGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">CESS</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">(a) Outward Taxable supplies (other than zero rated, nil rated and exempted)</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹155,000.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹13,950.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹13,950.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
              </tr>
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">(b) Outward Taxable supplies (zero rated)</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-8">
        <h4 className="text-lg font-medium text-gray-800 mb-4">4. Eligible ITC</h4>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">DESCRIPTION</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">IGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">CGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">SGST</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">CESS</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              <tr className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">(A) ITC Available (whether in full or part)</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹4,050.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹4,050.00</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-right font-semibold text-gray-900">₹0.00</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );

  // Default render function for other GST forms
  const renderDefaultGST = (form: GSTForm) => (
    <>
      <h3 className="text-xl font-semibold text-gray-900 mb-6">{form}: GST Return</h3>
      <div className="text-center py-12">
        <p className="text-gray-500">{form} report is under development.</p>
        <p className="text-sm text-gray-400 mt-2">This GST return type will be implemented in future updates.</p>
      </div>
    </>
  );

  // Dynamic GST renderer
  const renderGSTReport = () => {
    switch (selectedGstReturn) {
      case 'GSTR-1':
        return renderGSTR1();
      case 'GSTR-2A':
        return renderGSTR2A();
      case 'GSTR-3B':
        return renderGSTR3B();
      default:
        return renderDefaultGST(selectedGstReturn);
    }
  };






  return (
    <div className="bg-gray-50 min-h-screen p-6">
      {/* PRINT STYLES */}
      <style>{`
        @media print {
          /* Hide sidebar, buttons, filters, and other UI Chrome */
          aside, 
          button, 
          input, 
          select, 
          label, 
          .mb-8.flex.p-1.bg-gray-200, /* Tabs container */
          .mb-6.flex.p-6.bg-gray-50, /* Filter sections */
          nav,
          .fixed,
          h2.text-3xl.font-bold.mb-8 /* Page Main Title */
          {
            display: none !important;
          }

          /* Reset Container Styles for Print */
          body, #root, .min-h-screen, .bg-gray-50, .p-6, .p-8 {
            background-color: white !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
          }

          /* Ensure Table Logic */
          .bg-white.rounded-xl.shadow-sm.border {
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Force Table Visibility */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 1px solid #ddd !important;
            font-size: 10pt;
          }
          
          th, td {
            border: 1px solid #ddd !important;
            padding: 4px 8px !important;
            text-align: left;
          }

          th {
            background-color: #f3f4f6 !important;
            -webkit-print-color-adjust: exact;
            color: #1f2937 !important;
            font-weight: bold;
          }

          /* Custom Print Header */
          .print-header {
            display: block !important;
            text-align: center;
            margin-bottom: 20px;
          }
          
          .print-header h1 {
            font-size: 18pt;
            font-weight: bold;
            color: #ea580c; /* teal-600 */
            margin-bottom: 5px;
          }
          
          .print-header p {
            font-size: 10pt;
            color: #6b7280;
          }
        }

        /* Hide Print Header on Screen */
        .print-header {
          display: none;
        }
      `}</style>

      <div className="print-header">
        <h1>{allReports.find(r => r.id === reportType)?.label}</h1>
        <p>Generated on {new Date().toLocaleDateString()}</p>
      </div>

      <h2 className="text-3xl font-bold text-gray-900 mb-8">Reports</h2>

      <div className="mb-8 border-b border-gray-200">
        <nav className="flex space-x-8" aria-label="Report Tabs">
          {availableReports.map(({ id, label }, idx) => (
            <button
              key={`report-tab-${id}-${idx}`}
              onClick={() => setReportType(id as ReportType)}
              className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${reportType === id
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
        {reportType === 'DayBook' && (
          <>
            <div className="mb-6 flex flex-wrap items-end gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="min-w-[200px]">
                <label htmlFor="startDate" className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="endDate" className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="px-6 py-3 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                title="Create PDF"
              >
                Create PDF
              </button>
            </div>
          </>
        )}
        {reportType === 'LedgerReport' && (
          <>
            <div className="mb-6 flex flex-wrap items-end gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="min-w-[250px]">
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Ledger/Group</label>
                <LedgerSelector
                  selectedValue={selectedLedger}
                  onChange={setSelectedLedger}
                  groups={hardcodedGroups}
                  ledgers={hardcodedLedgers}
                />
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="ledgerStartDate" className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  id="ledgerStartDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="ledgerEndDate" className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  id="ledgerEndDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="px-6 py-3 border border-gray-300 text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                title="Create PDF"
              >
                Create PDF
              </button>
            </div>
          </>
        )}
        {reportType === 'TrialBalance' && (
          <>
            <div className="mb-6 flex flex-wrap items-end gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="min-w-[200px]">
                <label htmlFor="trialStartDate" className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  id="trialStartDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="trialEndDate" className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  id="trialEndDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                title="Create PDF"
              >
                Create PDF
              </button>
            </div>
          </>
        )}
        {reportType === 'BalanceSheet' && (
          <>
            <div className="mb-6 flex flex-wrap items-end gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="min-w-[200px]">
                <label className="block text-sm font-semibold text-gray-700 mb-2">As of Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                title="Create PDF"
              >
                Create PDF
              </button>
            </div>

            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="p-4 bg-gray-50 border-b font-bold text-center">Balance Sheet</div>
              <div className="p-8 text-center text-gray-500">
                Feature coming soon
              </div>
            </div>
          </>
        )}
        {reportType === 'StockSummary' && (
          <>
            <div className="mb-6 flex flex-wrap items-end gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="min-w-[200px]">
                <label htmlFor="stockStartDate" className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  id="stockStartDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="stockEndDate" className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  id="stockEndDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                title="Create PDF"
              >
                Create PDF
              </button>
            </div>
          </>
        )}
        {reportType === 'GSTReports' && (
          <>
            {/* Filter Section Row */}
            <div className="mb-6 flex flex-wrap items-end gap-4 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <div className="min-w-[200px]">
                <label className="block text-sm font-semibold text-gray-700 mb-2">GST Return</label>
                <select
                  value={gstForm}
                  onChange={(e) => setGstForm(e.target.value as GSTForm)}
                  className="block w-full pl-4 pr-10 py-3 text-base border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors bg-white"
                >
                  <option value="GSTR-1">GSTR-1</option>
                  <option value="GSTR-2">GSTR-2</option>
                  <option value="GSTR-2A">GSTR-2A</option>
                  <option value="GSTR-2B">GSTR-2B</option>
                  <option value="GSTR-3B">GSTR-3B</option>
                  <option value="GSTR-4">GSTR-4</option>
                  <option value="GSTR-5">GSTR-5</option>
                  <option value="GSTR-5A">GSTR-5A</option>
                  <option value="GSTR-6">GSTR-6</option>
                  <option value="GSTR-7">GSTR-7</option>
                  <option value="GSTR-8">GSTR-8</option>
                  <option value="GSTR-9">GSTR-9</option>
                  <option value="GSTR-9A">GSTR-9A</option>
                  <option value="GSTR-9C">GSTR-9C</option>
                  <option value="GSTR-10">GSTR-10</option>
                </select>
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="gstStartDate" className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                <input
                  type="date"
                  id="gstStartDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
              <div className="min-w-[200px]">
                <label htmlFor="gstEndDate" className="block text-sm font-semibold text-gray-700 mb-2">End Date</label>
                <input
                  type="date"
                  id="gstEndDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors"
                />
              </div>
            </div>

            <div className="flex justify-end mb-4">
              <button
                onClick={() => window.print()}
                className="px-6 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                title="Create PDF"
              >
                Create PDF
              </button>
            </div>

            {/* Dynamic GST Report Content */}
            <div className="mb-8">
              {renderGSTReport()}
            </div>
          </>
        )}
        {reportType === 'AIReport' && (
          <div className="space-y-6">
            {/* Simple Heading */}
            <h2 className="text-xl font-semibold text-gray-800 mb-4">AI Report</h2>

            {/* Simple Input Interface */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={handleAiKeyPress}
                  placeholder="What would you like to know? (e.g., 'Show sales report', 'GST summary', 'Expense analysis')"
                  disabled={aiLoading}
                  className="flex-1 px-5 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-colors disabled:bg-gray-100 text-base"
                />
                <button
                  onClick={handleAiSend}
                  disabled={aiLoading || !aiInput.trim()}
                  className="px-8 py-4 bg-teal-600 text-white font-semibold rounded-xl hover:bg-teal-700 transition-colors shadow-sm flex items-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  {aiLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                      </svg>
                      Generate
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Report Output Section - Professional Tableau-Style Dashboard */}
            {currentReport && (
              <div className="space-y-5">
                {/* Clean Professional Header */}
                <div className="bg-[#0d9488] rounded-lg p-5 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <h4 className="text-xl font-semibold text-white">{currentReport.title}</h4>
                      <p className="text-blue-100 text-sm mt-1">{currentReport.summary}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => downloadReportExcel(currentReport)} className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white text-sm font-medium rounded hover:bg-white/20 transition-colors border border-white/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        Excel
                      </button>
                      <button onClick={() => downloadReportPDF(currentReport)} className="flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-sm text-white text-sm font-medium rounded hover:bg-white/20 transition-colors border border-white/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        PDF
                      </button>
                    </div>
                  </div>
                </div>

                {/* View Toggle Buttons */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setReportView('table')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${reportView === 'table'
                        ? 'bg-white text-[#0d9488] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Table View
                      </div>
                    </button>
                    <button
                      onClick={() => setReportView('chart')}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${reportView === 'chart'
                        ? 'bg-white text-[#0d9488] shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                        }`}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Chart View
                      </div>
                    </button>
                  </div>
                </div>

                {/* Conditional View Rendering */}
                {reportView === 'table' ? (
                  /* Table View */
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                      <h5 className="text-sm font-semibold text-gray-700">Data Table</h5>
                    </div>
                    <div className="overflow-auto max-h-[500px]">
                      <table className="w-full">
                        <thead className="bg-[#0d9488] sticky top-0">
                          <tr>{Object.keys(currentReport.tableData[0] || {}).map((h, i) => (<th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-white uppercase">{h}</th>))}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">{currentReport.tableData.map((row, ri) => (<tr key={ri} className="hover:bg-gray-50">{Object.values(row).map((c, ci) => (<td key={ci} className="px-4 py-3 text-sm text-gray-700">{c}</td>))}</tr>))}</tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  /* Chart View */
                  <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                      <h5 className="text-sm font-semibold text-gray-700">Chart</h5>
                    </div>
                    <div className="p-6">
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          {currentReport.chartType === 'pie' ? (
                            <PieChart><Pie data={currentReport.chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={120} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>{currentReport.chartData.map((_, index) => (<Cell key={`cell-${index}`} fill={index === 0 ? '#0d9488' : index === 1 ? '#14b8a6' : index === 2 ? '#2dd4bf' : index === 3 ? '#5eead4' : '#99f6e4'} />))}</Pie><Tooltip formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} /></PieChart>
                          ) : currentReport.chartType === 'area' ? (
                            <AreaChart data={currentReport.chartData}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} /><YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} /><Tooltip formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} /><Area type="monotone" dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.2} strokeWidth={2} /></AreaChart>
                          ) : (
                            <BarChart data={currentReport.chartData} barSize={50}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} /><YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} /><Tooltip formatter={(value: number) => `₹${value.toLocaleString('en-IN')}`} cursor={{ fill: 'rgba(13, 148, 136, 0.05)' }} /><Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} /></BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div className="overflow-x-auto">
          {reportType === 'DayBook' && renderDayBook()}
          {reportType === 'LedgerReport' && renderLedger()}
          {reportType === 'TrialBalance' && renderTrialBalance()}
          {reportType === 'StockSummary' && renderStockSummary()}
        </div>
      </div>
    </div>
  );
};

export default ReportsPage;

