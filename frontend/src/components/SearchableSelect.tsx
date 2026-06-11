import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

interface SearchableOption {
    label: string;
    value: string;
}

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: (string | SearchableOption)[];
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    onFocus?: () => void;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ 
    value, 
    onChange, 
    options, 
    placeholder = "Select...", 
    className = "", 
    disabled = false,
    onFocus 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const [isTyping, setIsTyping] = useState(false);
    const [searchValue, setSearchValue] = useState("");

    const normalizedOptions = useMemo(() => 
        options.map(opt => typeof opt === 'string' ? { label: opt, value: opt } : opt),
    [options]);

    const updatePosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom,
                left: rect.left,
                width: Math.max(rect.width, 250)
            });
        }
    };

    // When value changes from outside, update search value to match its label
    useEffect(() => {
        if (!isTyping) {
            const selected = normalizedOptions.find(o => o.value === value);
            setSearchValue(selected ? selected.label : value || "");
        }
    }, [value, normalizedOptions, isTyping]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                portalRef.current && !portalRef.current.contains(target)
            ) {
                setIsOpen(false);
                // If the user was typing, commit whatever they typed instead of reverting.
                // This preserves free-text edits (e.g. manually correcting a vendor name)
                // when they click away without selecting from the dropdown list.
                if (isTyping && searchValue !== value) {
                    onChange(searchValue);
                }
                setIsTyping(false);
            }
        };

        const handleScroll = (event: Event) => {
            if (portalRef.current && portalRef.current.contains(event.target as Node)) {
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
    }, [isOpen, value, normalizedOptions, isTyping, searchValue, onChange]);

    const filteredOptions = isTyping
        ? normalizedOptions.filter(opt =>
            (opt.label || '').toLowerCase().includes((searchValue || '').toLowerCase())
        )
        : normalizedOptions;

    return (
        <div className={`relative ${className} ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`} ref={containerRef}>
            <div className="relative">
                <input
                    type="text"
                    className={`w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm text-slate-900 bg-white focus:ring-indigo-500 focus:border-indigo-500 pr-10 ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                    value={searchValue}
                    disabled={disabled}
                    onChange={(e) => {
                        const newVal = e.target.value;
                        setSearchValue(newVal);
                        if (!isOpen) {
                            setIsOpen(true);
                        }
                        setIsTyping(true);
                        
                        // If user clears input, notify parent
                        if (!newVal) {
                            onChange("");
                        }
                    }}
                    onFocus={() => {
                        if (!disabled) {
                            setIsOpen(true);
                            setIsTyping(false);
                            if (onFocus) onFocus();
                        }
                    }}
                    placeholder={placeholder}
                />
                <div
                    className={`absolute inset-y-0 right-0 flex items-center pr-3 ${disabled ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}
                    onClick={() => {
                        if (!disabled) {
                            setIsOpen(!isOpen);
                            setIsTyping(false);
                        }
                    }}
                >
                    <Icon name="chevron-down" className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </div>

            {isOpen && createPortal(
                <div
                    ref={portalRef}
                    className="fixed z-[9999] bg-white border border-gray-200 rounded-[4px] shadow-xl max-h-60 overflow-y-auto"
                    style={{
                        top: position.top + 4,
                        left: position.left,
                        width: position.width,
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((opt, i) => (
                            <div
                                key={i}
                                className={`px-4 py-2 text-sm hover:bg-indigo-50 cursor-pointer transition-colors ${value === opt.value ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                                onClick={() => {
                                    onChange(opt.value);
                                    setSearchValue(opt.label);
                                    setIsOpen(false);
                                    setIsTyping(false);
                                }}
                            >
                                {opt.label}
                            </div>
                        ))
                    ) : (
                        <div className="px-4 py-2 text-sm text-gray-500">No results found</div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

export default SearchableSelect;
