import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';

interface MultiSelectDropdownProps {
    options: { value: string; label: string }[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
    options,
    selectedValues,
    onChange,
    placeholder = 'Select...',
    disabled = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (value: string) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter((v) => v !== value));
        } else {
            onChange([...selectedValues, value]);
        }
    };

    const removeValue = (e: React.MouseEvent, value: string) => {
        e.stopPropagation();
        onChange(selectedValues.filter((v) => v !== value));
    };

    return (
        <div className="relative w-full" ref={dropdownRef}>
            <div
                className={`w-full px-3 py-2 border rounded text-sm flex justify-between items-center bg-white cursor-pointer ${disabled ? 'bg-gray-100 cursor-not-allowed border-gray-300' : 'border-gray-300 focus:ring-2 focus:ring-indigo-500'
                    }`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
                tabIndex={0}
            >
                <div className="flex flex-wrap gap-1 items-center max-w-[calc(100%-24px)]">
                    {selectedValues.length === 0 && <span className="text-gray-500">{placeholder}</span>}
                    {selectedValues.length > 0 && (
                        <div className="text-gray-900 truncate">
                            {selectedValues.length === 1
                                ? options.find(o => o.value === selectedValues[0])?.label || selectedValues[0]
                                : `${selectedValues.length} selected`
                            }
                        </div>
                    )}
                </div>
                <ChevronDown className="w-4 h-4 text-gray-500" />
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                    {options.length > 0 ? (
                        options.map((option) => {
                            const isSelected = selectedValues.includes(option.value);
                            return (
                                <div
                                    key={option.value}
                                    className={`px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-indigo-50 ${isSelected ? 'bg-indigo-50' : ''
                                        }`}
                                    onClick={() => toggleOption(option.value)}
                                >
                                    <span className={`text-sm ${isSelected ? 'font-medium text-indigo-700' : 'text-gray-700'}`}>
                                        {option.label}
                                    </span>
                                    {isSelected && <Check className="w-4 h-4 text-indigo-600" />}
                                </div>
                            );
                        })
                    ) : (
                        <div className="px-3 py-2 text-sm text-gray-500">No options available</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MultiSelectDropdown;
