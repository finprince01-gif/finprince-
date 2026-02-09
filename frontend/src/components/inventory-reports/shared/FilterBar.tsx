import React, { useState } from 'react';
import Icon from '../../Icon';

/**
 * FilterBar Component
 * 
 * Reusable filter component for inventory reports with date ranges, item selection, and warehouse filtering.
 */

interface FilterBarProps {
    filters: {
        dateFrom: string;
        dateTo: string;
        itemId?: string;
        warehouseId?: string;
        category?: string;
    };
    onFilterChange: (filters: any) => void;
    onRunReport: () => void;
    onReset: () => void;
    showItemFilter?: boolean;
    showWarehouseFilter?: boolean;
    items?: { id: string; name: string }[];
    warehouses?: { id: string; name: string }[];
    categories?: string[];
}

const FilterBar: React.FC<FilterBarProps> = ({
    filters,
    onFilterChange,
    onRunReport,
    onReset,
    showItemFilter = true,
    showWarehouseFilter = false,
    items = [],
    warehouses = [],
    categories = []
}) => {
    const handleChange = (field: string, value: string) => {
        onFilterChange({ ...filters, [field]: value });
    };

    return (
        <div className="bg-white p-4 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-slate-200 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Date From */}
                <div>
                    <label htmlFor="dateFrom" className="block text-sm font-medium text-gray-700 mb-1">
                        From Date
                    </label>
                    <input
                        type="date"
                        id="dateFrom"
                        value={filters.dateFrom}
                        onChange={(e) => handleChange('dateFrom', e.target.value)}
                        className="form-input"
                    />
                </div>

                {/* Date To */}
                <div>
                    <label htmlFor="dateTo" className="block text-sm font-medium text-gray-700 mb-1">
                        To Date
                    </label>
                    <input
                        type="date"
                        id="dateTo"
                        value={filters.dateTo}
                        onChange={(e) => handleChange('dateTo', e.target.value)}
                        className="form-input"
                    />
                </div>

                {/* Item Filter */}
                {showItemFilter && (
                    <div>
                        <label htmlFor="itemId" className="block text-sm font-medium text-gray-700 mb-1">
                            Item
                        </label>
                        <select
                            id="itemId"
                            value={filters.itemId || ''}
                            onChange={(e) => handleChange('itemId', e.target.value)}
                            className="form-input"
                        >
                            <option value="">All Items</option>
                            {items.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Category Filter */}
                {categories.length > 0 && (
                    <div>
                        <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
                            Category
                        </label>
                        <select
                            id="category"
                            value={filters.category || ''}
                            onChange={(e) => handleChange('category', e.target.value)}
                            className="form-input"
                        >
                            <option value="">All Categories</option>
                            {categories.map((cat) => (
                                <option key={cat} value={cat}>
                                    {cat}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Warehouse Filter */}
                {showWarehouseFilter && (
                    <div>
                        <label htmlFor="warehouseId" className="block text-sm font-medium text-gray-700 mb-1">
                            Warehouse
                        </label>
                        <select
                            id="warehouseId"
                            value={filters.warehouseId || ''}
                            onChange={(e) => handleChange('warehouseId', e.target.value)}
                            className="form-input"
                        >
                            <option value="">All Warehouses</option>
                            {warehouses.map((wh) => (
                                <option key={wh.id} value={wh.id}>
                                    {wh.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
                <button
                    onClick={onRunReport}
                    className="form-button bg-blue-600 hover:bg-blue-700"
                >
                    Run Report
                </button>
                <button
                    onClick={onReset}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-[4px] hover:bg-gray-50 text-sm font-medium"
                >
                    Reset
                </button>
            </div>
        </div>
    );
};

export default FilterBar;

