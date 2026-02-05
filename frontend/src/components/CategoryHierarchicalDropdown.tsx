import React, { useState, useEffect, useRef } from 'react';
import { httpClient } from '../services/httpClient';

export interface Category {
    id: number;
    category: string;
    group: string | null;
    subgroup: string | null;
    full_path?: string;
    is_active: boolean;
}

interface DropdownProps {
    onSelect: (data: { id: number; fullPath: string }) => void;
    value?: string;
    excludeId?: number;
    placeholder?: string;
    className?: string;
    onlyRoots?: boolean;
    staticCategories?: Category[];
    colorTheme?: 'teal' | 'indigo';
}

const CategoryHierarchicalDropdown: React.FC<DropdownProps> = ({
    onSelect,
    value = '',
    excludeId,
    placeholder = 'Select Category',
    className = '',
    onlyRoots = false,
    staticCategories,
    colorTheme = 'teal'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Theme Classes
    const themeClasses = {
        teal: {
            hoverBorder: 'hover:border-teal-400',
            focusRing: 'focus:ring-teal-500',
            focusBorder: 'focus:border-teal-500',
            activeBg: 'bg-teal-100',
            activeText: 'text-teal-800',
            hoverBg: 'hover:bg-teal-50'
        },
        indigo: {
            hoverBorder: 'hover:border-indigo-400',
            focusRing: 'focus:ring-indigo-500',
            focusBorder: 'focus:border-indigo-500',
            activeBg: 'bg-indigo-100',
            activeText: 'text-indigo-800',
            hoverBg: 'hover:bg-indigo-50'
        }
    }[colorTheme];

    useEffect(() => {
        if (staticCategories && staticCategories.length > 0) {
            setCategories(staticCategories);
        } else {
            fetchCategories();
        }

        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [staticCategories]);

    // Default system categories to ensure they always appear
    const DEFAULT_CATS = [
        'Raw Material', 'Work in Progress', 'Finished Goods',
        'Stores and Spares', 'Packing Material', 'Stock in Trade',
        'By-product', 'Scrap'
    ];

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const data = await httpClient.get<Category[]>('/api/inventory/master-categories/');

            // 1. Process API data
            let processed = data.map(c => ({
                ...c,
                full_path: [c.category, c.group, c.subgroup].filter(Boolean).join(' > ')
            }));

            // 2. Ensure Default Categories exist (if missing from API)
            // This mirrors the InventoryCategoryWizard logic
            const existingNames = new Set(processed.map(c => c.category)); // Check top-level names

            let idCounter = 10000; // Temp IDs for defaults
            const missingDefaults = DEFAULT_CATS.filter(name => !existingNames.has(name)).map(name => ({
                id: idCounter++,
                category: name,
                group: null,
                subgroup: null,
                is_active: true,
                full_path: name
            }));

            // 3. Combine API data + Missing Defaults
            setCategories([...missingDefaults, ...processed]);

        } catch (error) {
            console.error('Error fetching categories:', error);
            // Fallback mock data
            const mockCategories: Category[] = [
                { id: 1, category: 'Raw Material', is_active: true, group: null, subgroup: null, full_path: 'Raw Material' },
                { id: 2, category: 'Work in Progress', is_active: true, group: null, subgroup: null, full_path: 'Work in Progress' },
                { id: 3, category: 'Finished Goods', is_active: true, group: null, subgroup: null, full_path: 'Finished Goods' },
                { id: 4, category: 'Stores and Spares', is_active: true, group: null, subgroup: null, full_path: 'Stores and Spares' },
                { id: 5, category: 'Packing Material', is_active: true, group: null, subgroup: null, full_path: 'Packing Material' },
                { id: 6, category: 'Stock in Trade', is_active: true, group: null, subgroup: null, full_path: 'Stock in Trade' },
                { id: 7, category: 'By-product', is_active: true, group: null, subgroup: null, full_path: 'By-product' },
                { id: 8, category: 'Scrap', is_active: true, group: null, subgroup: null, full_path: 'Scrap' },
            ];
            setCategories(mockCategories);
        } finally {
            setLoading(false);
        }
    };

    const filteredCategories = categories.filter(cat => {
        // Exclude specific ID if needed (for editing parent)
        if (excludeId && cat.id === excludeId) return false;

        // NEW: Filter for only roots (top-level categories) if requested
        if (onlyRoots && cat.group) return false;

        // Search filter
        if (searchQuery) {
            return (cat.full_path || '').toLowerCase().includes(searchQuery.toLowerCase());
        }
        return true;
    });

    const handleSelect = (cat: Category) => {
        onSelect({
            id: cat.id,
            fullPath: cat.full_path || ''
        });
        setIsOpen(false);
        setSearchQuery('');
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full px-4 py-2 border border-gray-300 rounded-md cursor-pointer bg-white flex items-center justify-between ${themeClasses.hoverBorder} focus:outline-none focus:ring-2 ${themeClasses.focusRing} transition-colors`}
            >
                <span className={value ? 'text-gray-700' : 'text-gray-400'}>
                    {value || placeholder}
                </span>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    <div className="p-2 sticky top-0 bg-white border-b border-gray-100">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={`w-full px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none ${themeClasses.focusBorder}`}
                            placeholder="Search..."
                            autoFocus
                        />
                    </div>

                    {loading ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">Loading...</div>
                    ) : filteredCategories.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">No categories found</div>
                    ) : (
                        <ul>
                            {filteredCategories.map((cat) => (
                                <li
                                    key={cat.id}
                                    onClick={() => handleSelect(cat)}
                                    className={`px-4 py-2 text-sm cursor-pointer ${themeClasses.hoverBg} ${value === cat.full_path ? `${themeClasses.activeBg} ${themeClasses.activeText}` : 'text-gray-700'
                                        }`}
                                >
                                    {cat.full_path}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default CategoryHierarchicalDropdown;
