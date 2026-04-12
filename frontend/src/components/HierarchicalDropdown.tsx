import React, { useState, useEffect } from 'react';

interface HierarchyRow {
    id: number;
    type_of_business_1: string | null;
    financial_reporting_1: string | null;
    major_group_1: string | null;
    group_1: string | null;
    sub_group_1_1: string | null;
    sub_group_2_1: string | null;
    sub_group_3_1: string | null;
    ledger_1: string | null;
    code: string | null;
}

interface HierarchyOption {
    value: string;
    displayLabel: string;
    code: string | null;
    fullPath: string[];
}

interface HierarchicalDropdownProps {
    onSelect: (selection: {
        group: string;
        code: string;
        fullPath: string[];
    }) => void;
    value?: string;
}

export const HierarchicalDropdown: React.FC<HierarchicalDropdownProps> = ({ onSelect, value }) => {
    const [hierarchyData, setHierarchyData] = useState<HierarchyRow[]>([]);
    const [options, setOptions] = useState<HierarchyOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedValue, setSelectedValue] = useState('');

    // Load hierarchy data
    useEffect(() => {
        const fetchHierarchy = async () => {
            try {
                
                const response = await fetch('/api/masters/hierarchy/');
                

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                
                

                setHierarchyData(data);

                // Build flattened hierarchy options
                const flatOptions = buildHierarchyOptions(data);
                
                

                setOptions(flatOptions);
                setLoading(false);
            } catch (error) {
                console.error('❌ Error loading hierarchy:');
                setLoading(false);
            }
        };
        fetchHierarchy();
    }, []);

    const buildHierarchyOptions = (data: HierarchyRow[]): HierarchyOption[] => {
        const optionsMap = new Map<string, HierarchyOption>();

        data.forEach(row => {
            const levels = [
                row.type_of_business_1,
                row.financial_reporting_1,
                row.major_group_1,
                row.group_1,
                row.sub_group_1_1,
                row.sub_group_2_1,
                row.sub_group_3_1,
                row.ledger_1,
            ].filter(Boolean) as string[];

            if (levels.length > 0) {
                const key = levels.join(' > ');
                const lastLevel = levels[levels.length - 1];

                if (!optionsMap.has(key)) {
                    // Create display label without indentation
                    const displayLabel = levels.join(' > ');

                    optionsMap.set(key, {
                        value: lastLevel,
                        displayLabel: displayLabel,
                        code: row.code,
                        fullPath: levels
                    });
                }
            }
        });

        // Convert to array and sort alphabetically
        return Array.from(optionsMap.values()).sort((a, b) => {
            return a.displayLabel.localeCompare(b.displayLabel);
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedOption = options.find(opt => opt.displayLabel === e.target.value);

        if (selectedOption) {
            setSelectedValue(e.target.value);
            onSelect({
                group: selectedOption.value,
                code: selectedOption.code || '',
                fullPath: selectedOption.fullPath
            });
        }
    };

    if (loading) {
        return <div className="text-gray-500 text-sm">Loading hierarchy...</div>;
    }

    return (
        <div className="space-y-2">
            <select
                value={selectedValue}
                onChange={handleChange}
                className="block w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
                <option value="">Select a Group</option>
                {options.map((option, index) => (
                    <option
                        key={index}
                        value={option.displayLabel}
                    >
                        {option.displayLabel}
                    </option>
                ))}
            </select>

            {/* Display selected code if available */}
            {selectedValue && options.find(opt => opt.displayLabel === selectedValue)?.code && (
                <div className="mt-2 p-2 bg-indigo-50/50 border border-slate-200 rounded-[4px]">
                    <div className="text-xs font-medium text-teal-900">Code:</div>
                    <div className="text-sm font-bold text-slate-700">
                        {options.find(opt => opt.displayLabel === selectedValue)?.code}
                    </div>
                </div>
            )}
        </div>
    );
};


