import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface SearchableDropdownProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    label?: string; // Optional label if you want it inside, but usually outside
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
    options,
    value,
    onChange,
    placeholder = 'Select...',
    disabled = false,
    required = false
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<string[]>(options);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Update filtered options when search term or options change
    useEffect(() => {
        setFilteredOptions(
            options.filter(option =>
                option.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [searchTerm, options]);

    // Handle outside click to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                // Reset search term if no value selected or keep it? 
                // Better to reset search term to empty if we close, 
                // but maybe we want to keep the selected value visible in the input?
                // Actually, the main button shows the value. The search input is inside the dropdown.
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // When dropdown opens, clear search or set it? 
    // Design choice: Search input is inside the dropdown menu
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    return (
        <div className="relative w-full" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`w-full px-4 py-2 text-left border-2 rounded-[4px] flex justify-between items-center bg-white
          ${disabled ? 'bg-gray-100 cursor-not-allowed border-gray-300 text-gray-500' : 'border-slate-300 focus:ring-2 focus:ring-indigo-500 hover:border-indigo-500'}
          ${!value ? 'text-gray-500' : 'text-gray-900'}
        `}
            >
                <span className="truncate block">{value || placeholder}</span>
                <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
            </button>

            {/* Required hidden input for form validation if needed, though usually handled by state */}
            {required && (
                <input
                    type="text"
                    value={value}
                    required={required}
                    className="absolute opacity-0 h-0 w-0 bottom-0 left-0"
                    onChange={() => { }}
                    onInvalid={(e) => (e.target as HTMLInputElement).setCustomValidity('Please select an option')}
                    onInput={(e) => (e.target as HTMLInputElement).setCustomValidity('')}
                />
            )}

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 max-h-60 flex flex-col">

                    {/* Search Input Sticky Header */}
                    <div className="p-2 border-b border-gray-200 sticky top-0 bg-white rounded-t-md">
                        <div className="relative">
                            <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                autoFocus // Focus search input when opened
                            />
                        </div>
                    </div>

                    {/* Options List */}
                    <div className="overflow-y-auto flex-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => (
                                <div
                                    key={option}
                                    onClick={() => {
                                        onChange(option);
                                        setIsOpen(false);
                                        setSearchTerm('');
                                    }}
                                    className={`px-4 py-2 cursor-pointer text-sm hover:bg-indigo-50/50 hover:text-slate-700
                    ${value === option ? 'bg-indigo-100 text-indigo-800 font-medium' : 'text-gray-700'}
                  `}
                                >
                                    {option}
                                </div>
                            ))
                        ) : (
                            <div className="p-4 text-center text-sm text-gray-500">No results found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown;

