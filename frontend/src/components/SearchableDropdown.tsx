import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search } from 'lucide-react';

interface SearchableOption {
    label: string;
    value: any;
}

interface SearchableDropdownProps {
    options: (string | SearchableOption)[];
    value: any;
    onChange: (value: any) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    label?: string;
    noResultsText?: string;
    onCreateAction?: { label: string; onClick: () => void };
    isMulti?: boolean;
    allowCustomValue?: boolean;
    className?: string;
    error?: boolean;
    onFocus?: () => void;
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
    isMulti = false,
    allowCustomValue = false,
    className = '',
    error = false,
    onFocus
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<(string | SearchableOption)[]>(options);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0, dropUp: false });

    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Update filtered options
    useEffect(() => {
        setFilteredOptions(
            options.filter(option => {
                const label = typeof option === 'string' ? option : option.label;
                return (label || '').toLowerCase().includes(searchTerm.toLowerCase());
            })
        );
    }, [searchTerm, options]);

    const updatePosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const dropUp = spaceBelow < 250 && spaceAbove > spaceBelow;

            setPosition({
                top: dropUp ? rect.top + window.scrollY : rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                dropUp
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

    const handleCustomValueSubmit = () => {
        if (allowCustomValue && searchTerm.trim()) {
            onChange(searchTerm.trim());
            setIsOpen(false);
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
            if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
                return;
            }
            setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
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

    const getOptionLabel = (val: any) => {
        const option = options.find(o => typeof o === 'string' ? o === val : o.value === val);
        return typeof option === 'string' ? option : (option?.label || val);
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <button
                type="button"
                onClick={toggleDropdown}
                disabled={disabled}
                onFocus={() => {
                    if (onFocus) onFocus();
                }}
                className={`min-h-[42px] w-full px-3 py-2 text-left border rounded-[4px] flex justify-between items-center bg-white transition-all
                    ${disabled ? 'bg-gray-100 cursor-not-allowed border-gray-300 text-gray-500' : 
                      error ? 'border-red-500 bg-red-50 ring-1 ring-red-500' :
                      'border-gray-300 focus:ring-1 focus:ring-indigo-500 hover:border-indigo-400'}
                    ${!value || (Array.isArray(value) && value.length === 0) ? (error ? 'text-red-600' : 'text-gray-500') : 'text-gray-900 shadow-sm'}
                    ${className}
                `}
            >
                <div className="flex flex-wrap gap-1 flex-1 overflow-hidden">
                    {isMulti && Array.isArray(value) && value.length > 0 ? (
                        value.map(val => (
                            <span key={val} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded border border-indigo-100 flex items-center gap-1">
                                {getOptionLabel(val)}
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
                            {Array.isArray(value) ? (value.length > 0 ? value.map(v => getOptionLabel(v)).join(', ') : placeholder) : (getOptionLabel(value) || placeholder)}
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
                        top: position.dropUp ? 'auto' : position.top - window.scrollY,
                        bottom: position.dropUp ? window.innerHeight - (position.top - window.scrollY) : 'auto',
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
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (filteredOptions.length > 0) {
                                            const opt = filteredOptions[0];
                                            onChange(typeof opt === 'string' ? opt : opt.value);
                                            setIsOpen(false);
                                        } else {
                                            handleCustomValueSubmit();
                                        }
                                    }
                                }}
                                placeholder="Search..."
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                autoFocus
                            />
                        </div>
                    </div>

                    {allowCustomValue && searchTerm.trim() && !options.includes(searchTerm.trim()) && (
                        <div className="border-b border-gray-100 bg-teal-50/50">
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={handleCustomValueSubmit}
                                className="w-full px-4 py-2 text-left text-sm text-teal-700 font-semibold hover:bg-teal-100 transition-colors flex items-center gap-1.5"
                            >
                                <span className="text-base leading-none font-bold">+</span>
                                Use custom: "{searchTerm}"
                            </button>
                        </div>
                    )}

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
                            filteredOptions.map((option, index) => {
                                const label = typeof option === 'string' ? option : option.label;
                                const optValue = typeof option === 'string' ? option : option.value;
                                const isSelected = isMulti && Array.isArray(value) 
                                    ? value.includes(optValue)
                                    : value === optValue;

                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                            if (isMulti) {
                                                const newValue = Array.isArray(value) ? [...value] : [];
                                                if (newValue.includes(optValue)) {
                                                    onChange(newValue.filter(v => v !== optValue));
                                                } else {
                                                    onChange([...newValue, optValue]);
                                                }
                                            } else {
                                                onChange(optValue);
                                                setIsOpen(false);
                                            }
                                        }}
                                        className={`w-full px-4 py-2 text-left text-sm transition-colors flex items-center justify-between
                                            ${isSelected ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'}
                                        `}
                                    >
                                        <span className="truncate">{label}</span>
                                        {isSelected && <span className="text-indigo-600 font-bold">✓</span>}
                                    </button>
                                );
                            })
                        ) : (
                            !allowCustomValue && <div className="p-8 text-center text-sm text-gray-400 italic">{noResultsText}</div>
                        )}
                        {allowCustomValue && filteredOptions.length === 0 && !searchTerm.trim() && (
                            <div className="p-8 text-center text-sm text-gray-400 italic">Type to add custom value...</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default SearchableDropdown;
