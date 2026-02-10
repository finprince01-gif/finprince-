import React, { useState } from 'react';
import Icon from '../../Icon';

/**
 * ExportButton Component
 * 
 * Dropdown button for exporting report data to CSV, Excel, or PDF formats.
 */

interface ExportButtonProps {
    data: any[];
    filename: string;
    columns: { key: string; label: string }[];
}

const ExportButton: React.FC<ExportButtonProps> = ({ data, filename, columns }) => {
    const [isOpen, setIsOpen] = useState(false);

    const exportToCSV = () => {
        if (data.length === 0) return;

        // Create CSV header
        const headers = columns.map(col => col.label).join(',');

        // Create CSV rows
        const rows = data.map(row =>
            columns.map(col => {
                const value = row[col.key];
                // Escape commas and quotes
                if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value ?? '';
            }).join(',')
        );

        const csv = [headers, ...rows].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${filename}.csv`;
        link.click();

        setIsOpen(false);
    };

    const exportToExcel = async () => {
        // Dependencies xlsx and jspdf are optional.
        // Uncomment the code below and install the packages to enable these features.
        // npm install xlsx jspdf jspdf-autotable
        alert("Export to Excel is currently disabled. Please install 'xlsx' package to enable.");
    };

    const exportToPDF = async () => {
        alert("Export to PDF is currently disabled. Please install 'jspdf' and 'jspdf-autotable' packages to enable.");
    };

    return (
        <div className="relative inline-block">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-[4px] hover:bg-green-700 text-sm font-medium"
                disabled={data.length === 0}
            >
                <Icon name="download" className="w-4 h-4" />
                Export ▼
            </button>

            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 z-20">
                        <div className="py-1">
                            <button
                                onClick={exportToCSV}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                                📄 Export as CSV
                            </button>
                            <button
                                onClick={exportToExcel}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                                📊 Export as Excel
                            </button>
                            <button
                                onClick={exportToPDF}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                            >
                                📕 Export as PDF
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ExportButton;

