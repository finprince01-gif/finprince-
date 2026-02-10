import React, { useState } from 'react';
import Icon from '../../Icon';

/**
 * ReportTable Component
 * 
 * Generic table component with sorting, pagination, and loading states.
 */

interface Column {
    key: string;
    label: string;
    sortable?: boolean;
    render?: (value: any, row: any) => React.ReactNode;
    align?: 'left' | 'right' | 'center';
}

interface ReportTableProps {
    columns: Column[];
    data: any[];
    loading?: boolean;
    onRowClick?: (row: any) => void;
    pageSize?: number;
}

const ReportTable: React.FC<ReportTableProps> = ({
    columns,
    data,
    loading = false,
    onRowClick,
    pageSize = 10
}) => {
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(pageSize);

    // Sorting logic
    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDirection('asc');
        }
    };

    const sortedData = React.useMemo(() => {
        if (!sortKey) return data;

        return [...data].sort((a, b) => {
            const aVal = a[sortKey];
            const bVal = b[sortKey];

            if (aVal === bVal) return 0;

            const comparison = aVal < bVal ? -1 : 1;
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }, [data, sortKey, sortDirection]);

    // Pagination logic
    const totalPages = Math.ceil(sortedData.length / rowsPerPage);
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const paginatedData = sortedData.slice(startIndex, endIndex);

    const handlePageChange = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    if (loading) {
        return (
            <div className="bg-white p-12 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200 text-center">
                <Icon name="spinner" className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-3" />
                <p className="text-gray-500">Loading report data...</p>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="bg-white p-12 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200 text-center">
                <div className="text-6xl mb-3">📭</div>
                <p className="text-gray-500">No data available for the selected filters.</p>
                <p className="text-sm text-gray-400 mt-1">Try adjusting your filter criteria.</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200">
            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    className={`table-header ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'} ${column.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                                    onClick={() => column.sortable !== false && handleSort(column.key)}
                                >
                                    <div className="flex items-center gap-1">
                                        {column.label}
                                        {column.sortable !== false && sortKey === column.key && (
                                            <span className="text-xs">
                                                {sortDirection === 'asc' ? '▲' : '▼'}
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {paginatedData.map((row, rowIndex) => (
                            <tr
                                key={rowIndex}
                                onClick={() => onRowClick?.(row)}
                                className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                            >
                                {columns.map((column) => (
                                    <td
                                        key={column.key}
                                        className={`table-cell ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
                                    >
                                        {column.render
                                            ? column.render(row[column.key], row)
                                            : row[column.key] ?? '-'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">Rows per page:</span>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => {
                                setRowsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="form-input py-1 px-2 text-sm"
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-700">
                            Page {currentPage} of {totalPages} ({sortedData.length} total)
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => handlePageChange(1)}
                                disabled={currentPage === 1}
                                className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                                ⏮
                            </button>
                            <button
                                onClick={() => handlePageChange(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                                ◀
                            </button>
                            <button
                                onClick={() => handlePageChange(currentPage + 1)}
                                disabled={currentPage === totalPages}
                                className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                                ▶
                            </button>
                            <button
                                onClick={() => handlePageChange(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-2 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                            >
                                ⏭
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportTable;

