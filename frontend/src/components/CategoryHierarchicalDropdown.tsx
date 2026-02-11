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
    apiEndpoint?: string;
    systemCategories?: string[];
}

const CategoryHierarchicalDropdown: React.FC<DropdownProps> = ({
    onSelect,
    value = '',
    excludeId,
    placeholder = 'Select Category',
    className = '',
    onlyRoots = false,
    staticCategories,
    colorTheme = 'teal',
    apiEndpoint = '/api/inventory/master-categories/',
    systemCategories = [
        'Raw Material', 'Work in Progress', 'Finished Goods',
        'Stores and Spares', 'Packing Material', 'Stock in Trade',
        'By-product', 'Scrap'
    ]
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Theme Classes
    const themeClasses = {
        teal: {
            hoverBorder: 'hover:border-slate-300',
            focusRing: 'focus:ring-indigo-500',
            focusBorder: 'focus:border-indigo-500',
            activeBg: 'bg-indigo-100',
            activeText: 'text-indigo-800',
            hoverBg: 'hover:bg-indigo-50/50'
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
    }, [staticCategories, apiEndpoint, systemCategories]);

    const fetchCategories = async () => {
        try {
            setLoading(true);
            const data = await httpClient.get<Category[]>(apiEndpoint);

            // 1. Process API data
            let processed = data.map(c => ({
                ...c,
                full_path: [c.category, c.group, c.subgroup].filter(Boolean).join(' > ')
            }));

            // 2. Ensure Default Categories exist (if missing from API)
            const existingNames = new Set(processed.map(c => c.category));

            let idCounter = 10000;
            const missingDefaults = systemCategories.filter(name => !existingNames.has(name)).map(name => ({
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
            // Fallback mock data matching systemCategories
            const mockCategories: Category[] = systemCategories.map((name, idx) => ({
                id: idx + 1,
                category: name,
                is_active: true,
                group: null,
                subgroup: null,
                full_path: name
            }));
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
                className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] cursor-pointer bg-white flex items-center justify-between ${themeClasses.hoverBorder} focus:outline-none focus:ring-2 ${themeClasses.focusRing} transition-colors`}
            >
                <span className={value ? 'text-gray-700' : 'text-gray-400'}>
                    {value || placeholder}
                </span>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 max-h-60 overflow-y-auto">
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


