import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

interface SearchableDropdownProps {
    options: string[];
    value: string | string[];
    onChange: (value: any) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    label?: string;
    noResultsText?: string;
    onCreateAction?: { label: string; onClick: () => void };
    isMulti?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    disabled = false,
    required = false,
    noResultsText = 'No results found',
    onCreateAction,
    isMulti = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<string[]>(options);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Update filtered options
    useEffect(() => {
        setFilteredOptions(
            options.filter(option =>
                (option || '').toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [searchTerm, options]);

    const updatePosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    };

    const toggleDropdown = () => {
        if (!disabled) {
            if (!isOpen) {
                updatePosition();
            }
            setIsOpen(!isOpen);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        const handleScroll = (event: Event) => {
            // Only close if scrolling something other than the dropdown itself
            if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
                return;
            }
            setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            // Use capture phase for scroll to catch it before it bubbles
            window.addEventListener('scroll', handleScroll, true);
            window.addEventListener('resize', () => setIsOpen(false));
            updatePosition();
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    return (
        <div className="relative w-full" ref={containerRef}>
            <button
                type="button"
                onClick={toggleDropdown}
                disabled={disabled}
                className={`min-h-[42px] w-full px-3 py-2 text-left border rounded-[4px] flex justify-between items-center bg-white transition-all
                    ${disabled ? 'bg-gray-100 cursor-not-allowed border-gray-300 text-gray-500' : 'border-gray-300 focus:ring-1 focus:ring-indigo-500 hover:border-indigo-400'}
                    ${!value || (Array.isArray(value) && value.length === 0) ? 'text-gray-500' : 'text-gray-900 shadow-sm'}
                `}
            >
                <div className="flex flex-wrap gap-1 flex-1 overflow-hidden">
                    {isMulti && Array.isArray(value) && value.length > 0 ? (
                        value.map(val => (
                            <span key={val} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded border border-indigo-100 flex items-center gap-1">
                                {val}
                                <span 
                                    className="hover:text-red-500 cursor-pointer font-bold ml-1"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newValue = (value as string[]).filter(v => v !== val);
                                        onChange(newValue);
                                    }}
                                >×</span>
                            </span>
                        ))
                    ) : (
                        <span className="truncate block font-medium">
                            {Array.isArray(value) ? (value.length > 0 ? value.join(', ') : placeholder) : (value || placeholder)}
                        </span>
                    )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {required && (
                <input
                    type="text"
                    value={Array.isArray(value) ? value.join(',') : value}
                    required={required}
                    className="absolute opacity-0 h-0 w-0"
                    onChange={() => { }}
                    tabIndex={-1}
                />
            )}

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] bg-white border border-slate-200 rounded-[4px] shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in duration-100"
                    style={{
                        top: position.top - window.scrollY,
                        left: position.left - window.scrollX,
                        width: position.width,
                        maxHeight: '250px'
                    }}
                >
                    <style>
                        {`
                            .custom-scrollbar {
                                scrollbar-width: thin;
                                scrollbar-color: #475569 #f1f5f9;
                            }
                            .custom-scrollbar::-webkit-scrollbar {
                                width: 12px;
                                display: block !important;
                            }
                            .custom-scrollbar::-webkit-scrollbar-track {
                                background: #f1f5f9;
                                border-radius: 6px;
                            }
                            .custom-scrollbar::-webkit-scrollbar-thumb {
                                background: #475569;
                                border-radius: 6px;
                                border: 3px solid #f1f5f9;
                            }
                            .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                                background: #1e293b;
                            }
                        `}
                    </style>
                    <div className="p-2 border-b border-gray-100 bg-slate-50">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                autoFocus
                            />
                        </div>
                    </div>

                    {onCreateAction && (
                        <div className="border-b border-gray-100 bg-indigo-50/50">
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    setIsOpen(false);
                                    onCreateAction.onClick();
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-indigo-700 font-semibold hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                            >
                                <span className="text-base leading-none font-bold">+</span>
                                {onCreateAction.label}
                            </button>
                        </div>
                    )}

                    <div className="overflow-y-scroll flex-1 overscroll-contain custom-scrollbar" style={{ minHeight: '100px' }}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => {
                                const isSelected = Array.isArray(value) ? value.includes(option) : value === option;
                                return (
                                    <div
                                        key={option}
                                        onClick={(e) => {
                                            if (isMulti) {
                                                e.stopPropagation();
                                                const currentArr = Array.isArray(value) ? value : [];
                                                const next = isSelected 
                                                    ? currentArr.filter(v => v !== option)
                                                    : [...currentArr, option];
                                                onChange(next);
                                            } else {
                                                onChange(option);
                                                setIsOpen(false);
                                            }
                                        }}
                                        className={`px-4 py-2.5 cursor-pointer text-sm transition-colors flex items-center gap-2
                                            ${isSelected && !isMulti
                                                ? 'bg-indigo-600 text-white font-semibold'
                                                : 'text-gray-700 hover:bg-indigo-50 hover:text-indigo-700'}
                                        `}
                                    >
                                        {isMulti && (
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected} 
                                                readOnly 
                                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                            />
                                        )}
                                        {option}
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-8 text-center text-sm text-gray-400 italic">{noResultsText}</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default SearchableDropdown;
