import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
    const [dropdownStyles, setDropdownStyles] = useState<{ top: number, left: number, width: number } | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Update filtered options when search term or options change
    useEffect(() => {
        setFilteredOptions(
            options.filter(option =>
                option.toLowerCase().includes(searchTerm.toLowerCase())
            )
        );
    }, [searchTerm, options]);

    // Handle open/close and positioning
    const toggleDropdown = () => {
        if (!disabled) {
            if (!isOpen) {
                // Determine position
                if (dropdownRef.current) {
                    const rect = dropdownRef.current.getBoundingClientRect();
                    setDropdownStyles({
                        top: rect.bottom + window.scrollY, // For absolute positioning in body (requires document height consideration)
                        // Actually, using fixed positioning is often easier for "breaking out"
                        // because it ignores parent scroll constraints.
                        // Let's us standard Portal with FIXED positioning relative to viewport.
                    });
                }
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }
        }
    };

    // Calculate fixed position
    const getDropdownPosition = () => {
        if (dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            // Check formatted available space below
            const spaceBelow = window.innerHeight - rect.bottom;
            // If space below is small (< 200px) and space above is large, flip it?
            // For now, let's stick to standard "below" positioning but strictly FIXED.
            return {
                top: rect.bottom,
                left: rect.left,
                width: rect.width,
            };
        }
        return { top: 0, left: 0, width: 0 };
    };

    // Handle global click to close
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            // We can't rely on ref.current.contains because Portal is outside.
            // But we can check if the click target is inside the dropdown content wrapper.
            // We'll attach a unique ID or use a Ref for generic portal content if possible,
            // or simply stop propagation on the dropdown content.

            // If we stop propagation on the content, then any click that reaches here (document)
            // MUST be outside the dropdown content.
            // However, we must also check if it was the TRIGGER button.
            if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
                return; // Clicked on the trigger, let toggleDropdown handle it
            }

            setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('scroll', () => setIsOpen(false), true); // Close on scroll
            window.addEventListener('resize', () => setIsOpen(false));
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', () => setIsOpen(false), true);
            window.removeEventListener('resize', () => setIsOpen(false));
        };
    }, [isOpen]);

    // Cleanup search on close
    useEffect(() => {
        if (!isOpen) {
            setSearchTerm('');
        }
    }, [isOpen]);

    const dropdownPortal = isOpen ? createPortal(
        <div
            className="fixed z-[9999] bg-white border border-gray-300 rounded-md shadow-lg flex flex-col"
            style={{
                ...getDropdownPosition(),
                maxHeight: '15rem', // max-h-60 equivalent
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
            {/* Search Input Sticky Header */}
            <div className="p-2 border-b border-gray-200 bg-white rounded-t-md shrink-0">
                <div className="relative">
                    <Search className="absolute left-2 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search..."
                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        autoFocus
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
                            className={`px-4 py-2 cursor-pointer text-sm hover:bg-teal-50 hover:text-teal-700
            ${value === option ? 'bg-teal-100 text-teal-800 font-medium' : 'text-gray-700'}
            `}
                        >
                            {option}
                        </div>
                    ))
                ) : (
                    <div className="p-4 text-center text-sm text-gray-500">No results found</div>
                )}
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div className="relative w-full" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={toggleDropdown}
                disabled={disabled}
                className={`w-full px-4 py-2 text-left border-2 rounded-md flex justify-between items-center bg-white
          ${disabled ? 'bg-gray-100 cursor-not-allowed border-gray-300 text-gray-500' : 'border-teal-400 focus:ring-2 focus:ring-teal-500 hover:border-teal-500'}
          ${!value ? 'text-gray-500' : 'text-gray-900'}
        `}
            >
                <span className="truncate block">{value || placeholder}</span>
                <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0 ml-2" />
            </button>

            {/* Required hidden input */}
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

            {dropdownPortal}
        </div>
    );
};

export default SearchableDropdown;
