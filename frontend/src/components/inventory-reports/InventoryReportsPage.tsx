import React, { useState } from 'react';
import { ReportType } from '../../types/inventoryReports';
import StockSummaryReport from './reports/StockSummaryReport';
import InventoryValuationSummary from './reports/InventoryValuationSummary';
import InventoryValuationDetail from './reports/InventoryValuationDetail';

/**
 * Inventory Reports Page
 * 
 * Main component for inventory reports module.
 * Provides dropdown selector for different report types and renders the selected report.
 */

interface ReportOption {
    value: ReportType;
    label: string;
    description: string;
    component: React.ComponentType;
}

const REPORT_OPTIONS: ReportOption[] = [
    {
        value: ReportType.STOCK_SUMMARY,
        label: 'Stock Summary',
        description: 'Summary of item movement and stock levels',
        component: StockSummaryReport
    },
    {
        value: ReportType.INVENTORY_VALUATION_SUMMARY,
        label: 'Inventory Valuation Summary',
        description: 'Summary of inventory value by item',
        component: InventoryValuationSummary
    },
    {
        value: ReportType.INVENTORY_VALUATION_DETAIL,
        label: 'Inventory Valuation Detail',
        description: 'Detailed transaction-level inventory valuation',
        component: InventoryValuationDetail
    },
    // Additional reports can be added here as they are implemented
    // ... etc
];

const InventoryReportsPage: React.FC = () => {
    const [selectedReport, setSelectedReport] = useState<ReportType>(ReportType.STOCK_SUMMARY);

    const currentReportOption = REPORT_OPTIONS.find(opt => opt.value === selectedReport);
    const ReportComponent = currentReportOption?.component;

    return (
        <div>
            {/* Report Selector */}
            <div className="mb-6">
                <label htmlFor="reportType" className="block text-sm font-medium text-gray-700 mb-2">
                    Select Report Type
                </label>
                <div className="flex gap-4 items-start">
                    <select
                        id="reportType"
                        value={selectedReport}
                        onChange={(e) => setSelectedReport(e.target.value as ReportType)}
                        className="form-input max-w-md"
                    >
                        {REPORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {currentReportOption && (
                        <p className="text-sm text-gray-500 mt-2">
                            {currentReportOption.description}
                        </p>
                    )}
                </div>
            </div>

            {/* Render Selected Report */}
            <div>
                {ReportComponent ? (
                    <ReportComponent />
                ) : (
                    <div className="bg-white p-12 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200 text-center">
                        <p className="text-gray-500">This report is not yet implemented.</p>
                        <p className="text-sm text-gray-400 mt-1">Coming soon...</p>
                    </div>
                )}
            </div>

            {/* CSS Styles */}
            <style>{`
        .form-input {
          display: block;
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          box-shadow-none border border-slate-200: 0 1px 2px 0 rgb(0 0 0 / 0.05);
          outline: none;
          transition: border-color 0.15s ease-in-out, box-shadow-none border border-slate-200 0.15s ease-in-out;
        }
        .form-input:focus {
          border-color: #3b82f6;
          box-shadow-none border border-slate-200: 0 0 0 1px #3b82f6;
        }
        .form-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 1rem;
          border: 1px solid transparent;
          font-size: 0.875rem;
          font-weight: 500;
          border-radius: 0.375rem;
          box-shadow-none border border-slate-200: 0 1px 2px 0 rgb(0 0 0 / 0.05);
          color: white;
          background-color: #2563eb;
        }
        .form-button:hover {
          background-color: #1d4ed8;
        }
        .table-header {
          padding: 0.75rem 1.5rem;
          text-align: left;
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .table-cell {
          padding: 1rem 1.5rem;
          white-space: nowrap;
          font-size: 0.875rem;
          color: #111827;
        }
      `}</style>
        </div>
    );
};

export default InventoryReportsPage;

