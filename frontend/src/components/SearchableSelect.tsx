import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: string[];
    placeholder?: string;
    className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({ value, onChange, options, placeholder = "Select...", className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });

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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                containerRef.current && !containerRef.current.contains(target) &&
                portalRef.current && !portalRef.current.contains(target)
            ) {
                setIsOpen(false);
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
    }, [isOpen]);

    const filteredOptions = options.filter(opt =>
        (opt || '').toLowerCase().includes((value || '').toLowerCase())
    );

    return (
        <div className={`relative ${className}`} ref={containerRef}>
            <div className="relative">
                <input
                    type="text"
                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:ring-indigo-500 focus:border-indigo-500 pr-10"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        if (!isOpen) setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                />
                <div
                    className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer"
                    onClick={() => setIsOpen(!isOpen)}
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
                                className={`px-4 py-2 text-sm hover:bg-indigo-50 cursor-pointer transition-colors ${value === opt ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                                onClick={() => {
                                    onChange(opt);
                                    setIsOpen(false);
                                }}
                            >
                                {opt}
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
