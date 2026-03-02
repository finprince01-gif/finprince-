import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import LedgerQuestions from './LedgerQuestions';
import { showWarning } from '../utils/toast';

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
    custom_ledger?: string | null;  // 7th level for nested custom ledgers
    code: string | null;
    isCustom?: boolean; // Flag for tenant-specific ledgers
}

interface Ledger {
    id: number;
    name: string;
    category: string | null;
    group: string | null;
    sub_group_1: string | null;
    sub_group_2: string | null;
    sub_group_3: string | null;
    ledger_type: string | null;
    parent_ledger_id: number | null;
}

interface TreeNode {
    name: string;
    children: TreeNode[];
    level: number;
    isCustom?: boolean;
    ledgerId?: number;  // Store ledger ID for custom ledgers
    fullPath: {
        category: string | null;
        group: string | null;
        sub_group_1: string | null;
        sub_group_2: string | null;
        sub_group_3: string | null;
        ledger_type: string | null;
        parent_ledger_id?: number | null;
    };
}

interface LedgerCreationWizardProps {
    onCreateLedger: (data: {
        customName: string;
        group: string | null;
        category: string | null;
        sub_group_1: string | null;
        sub_group_2: string | null;
        sub_group_3: string | null;
        ledger_type: string | null;
        parent_ledger_id?: number | null;
        question_answers?: Record<number, any>;
    }) => void;
}

export const LedgerCreationWizard: React.FC<LedgerCreationWizardProps> = ({ onCreateLedger }) => {
    const [hierarchyData, setHierarchyData] = useState<HierarchyRow[]>([]);
    const [tenantLedgers, setTenantLedgers] = useState<Ledger[]>([]);
    const [loading, setLoading] = useState(true);
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
    const [subGroup2Input, setSubGroup2Input] = useState('');
    const [subGroup3Input, setSubGroup3Input] = useState('');
    const [ledgerTypeInput, setLedgerTypeInput] = useState('');
    const [questionAnswers, setQuestionAnswers] = useState<Record<number, any>>({});

    // Convert tenant ledger to hierarchy row format
    const convertLedgerToHierarchy = (ledger: Ledger, allLedgers: Ledger[]): HierarchyRow => {
        // If this ledger has a parent, find the parent and use its hierarchy + name as ledger_type
        if (ledger.parent_ledger_id) {
            const parent = allLedgers.find(l => l.id === ledger.parent_ledger_id);
            if (parent) {
                return {
                    id: ledger.id,
                    type_of_business_1: null,
                    financial_reporting_1: null,
                    major_group_1: parent.category,
                    group_1: parent.group,
                    sub_group_1_1: parent.sub_group_1,
                    sub_group_2_1: parent.sub_group_2,
                    sub_group_3_1: parent.sub_group_3,
                    ledger_1: parent.name,  // Parent name becomes the "type"
                    custom_ledger: ledger.name,  // Child name goes here!
                    code: null,
                    isCustom: true
                };
            }
        }

        // Regular custom ledger (no parent)
        // Determine if ledger name duplicates the deepest hierarchy level
        // If so, we treat the ledger as residing AT that level, not below it.
        let ledgerLevelVal: string | null = ledger.name;

        if (!ledger.ledger_type) {
            if (ledger.sub_group_3 === ledger.name) ledgerLevelVal = null;
            else if (!ledger.sub_group_3 && ledger.sub_group_2 === ledger.name) ledgerLevelVal = null;
            else if (!ledger.sub_group_3 && !ledger.sub_group_2 && ledger.sub_group_1 === ledger.name) ledgerLevelVal = null;
        }

        return {
            id: ledger.id,
            type_of_business_1: null,
            financial_reporting_1: null,
            major_group_1: ledger.category,
            group_1: ledger.group,
            sub_group_1_1: ledger.sub_group_1,
            sub_group_2_1: ledger.sub_group_2,
            sub_group_3_1: ledger.sub_group_3,
            ledger_1: ledgerLevelVal,
            custom_ledger: null,
            code: null,
            isCustom: true
        };
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch both global hierarchy and tenant ledgers
                const [hierarchyRes, ledgersRes] = await Promise.all([
                    fetch('http://localhost:8000/api/hierarchy/'),
                    fetch('http://localhost:8000/api/masters/ledgers/', {
                        credentials: 'include' // Include cookies for authentication
                    })
                ]);

                if (!hierarchyRes.ok) throw new Error('Failed to fetch hierarchy');

                const globalHierarchy: HierarchyRow[] = await hierarchyRes.json();

                // Fetch tenant ledgers (may fail if not authenticated, that's ok)
                let ledgers: Ledger[] = [];
                if (ledgersRes.ok) {
                    ledgers = await ledgersRes.json();
                    setTenantLedgers(ledgers);
                }

                // Convert tenant ledgers to hierarchy format
                const customHierarchy = ledgers.map(ledger => convertLedgerToHierarchy(ledger, ledgers));

                // Merge global hierarchy with custom ledgers
                const mergedHierarchy = [...globalHierarchy, ...customHierarchy];
                setHierarchyData(mergedHierarchy);

                // Build tree structure
                const tree = buildTreeStructure(mergedHierarchy, ledgers);
                setTreeData(tree);

                setLoading(false);
            } catch (error) {
                console.error('Error loading data:');
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const buildTreeStructure = (data: HierarchyRow[], ledgers: Ledger[]): TreeNode[] => {
        const tree: Map<string, TreeNode> = new Map();
        const ledgerIdToPath: Map<number, string> = new Map(); // Track ledger ID to tree path

        // First pass: Build tree from hierarchy data (excluding nested custom ledgers)
        data.forEach(row => {
            // Skip rows that represent nested custom ledgers (they have custom_ledger filled)
            if (row.custom_ledger) return;

            // Determine deepest level for this row to correctly place the "Custom" marker
            let maxLevel = -1;
            if (row.ledger_1) maxLevel = 5;
            else if (row.sub_group_3_1) maxLevel = 4;
            else if (row.sub_group_2_1) maxLevel = 3;
            else if (row.sub_group_1_1) maxLevel = 2;
            else if (row.group_1) maxLevel = 1;

            const levels = [
                { key: 'major_group_1', value: row.major_group_1, level: 0 },
                { key: 'group_1', value: row.group_1, level: 1 },
                { key: 'sub_group_1_1', value: row.sub_group_1_1, level: 2 },
                { key: 'sub_group_2_1', value: row.sub_group_2_1, level: 3 },
                { key: 'sub_group_3_1', value: row.sub_group_3_1, level: 4 },
                { key: 'ledger_1', value: row.ledger_1, level: 5 },
            ];

            let currentPath = '';
            let parentPath = '';

            levels.forEach((level, index) => {
                if (!level.value) return;

                parentPath = currentPath;
                currentPath = currentPath ? `${currentPath}>${level.value}` : level.value;

                if (!tree.has(currentPath)) {
                    // Check if this node is the custom ledger itself
                    // It must be at the deepest level of the row, and the row must be custom
                    const isCustomLedger = row.isCustom && level.level === maxLevel;
                    const ledgerId = isCustomLedger ? row.id : undefined;

                    const node: TreeNode = {
                        name: level.value,
                        children: [],
                        level: level.level,
                        isCustom: isCustomLedger,
                        ledgerId: ledgerId,
                        fullPath: {
                            category: row.major_group_1,
                            group: row.group_1,
                            sub_group_1: row.sub_group_1_1,
                            sub_group_2: row.sub_group_2_1,
                            sub_group_3: row.sub_group_3_1,
                            ledger_type: row.ledger_1,
                        }
                    };

                    tree.set(currentPath, node);

                    // Track ledger ID to path mapping for custom ledgers
                    if (ledgerId) {
                        ledgerIdToPath.set(ledgerId, currentPath);
                    }

                    if (parentPath && tree.has(parentPath)) {
                        const parent = tree.get(parentPath)!;
                        if (!parent.children.find(c => c.name === node.name)) {
                            parent.children.push(node);
                        }
                    }
                }
            });
        });

        // Second pass: Add nested custom ledgers as children of their parents
        ledgers.forEach(ledger => {
            if (ledger.parent_ledger_id) {
                const parentPath = ledgerIdToPath.get(ledger.parent_ledger_id);
                if (parentPath && tree.has(parentPath)) {
                    const parentNode = tree.get(parentPath)!;

                    // Create child node
                    const childNode: TreeNode = {
                        name: ledger.name,
                        children: [],
                        level: 6, // Nested custom ledger level
                        isCustom: true,
                        ledgerId: ledger.id,
                        fullPath: {
                            category: ledger.category,
                            group: ledger.group,
                            sub_group_1: ledger.sub_group_1,
                            sub_group_2: ledger.sub_group_2,
                            sub_group_3: ledger.sub_group_3,
                            ledger_type: ledger.ledger_type,
                            parent_ledger_id: ledger.parent_ledger_id
                        }
                    };

                    // Add to parent's children if not already there
                    if (!parentNode.children.find(c => c.name === childNode.name && c.ledgerId === childNode.ledgerId)) {
                        parentNode.children.push(childNode);
                    }

                    // Track this nested ledger's path for potential grandchildren
                    const childPath = `${parentPath}>${ledger.name}`;
                    tree.set(childPath, childNode);
                    ledgerIdToPath.set(ledger.id, childPath);
                }
            }
        });

        // Get root nodes (major groups)
        const roots: TreeNode[] = [];
        const seenNames = new Set<string>();

        tree.forEach((node, path) => {
            if (!path.includes('>')) {
                // Normalize name to handle duplicates (Asset/Assets, Liability/Liabilities, etc.)
                const normalizedName = node.name.toLowerCase().replace(/s$/, '');

                if (!seenNames.has(normalizedName)) {
                    seenNames.add(normalizedName);
                    roots.push(node);
                }
            }
        });

        // Custom sort order for accounting major groups
        const sortOrder: { [key: string]: number } = {
            "owners' funds": 1,
            "owner's funds": 1,
            "npo funds": 2,
            "npo": 2,
            "liability": 3,
            "liabilities": 3,
            "asset": 4,
            "assets": 4,
            "income": 5,
            "expenditure": 6,
            "expenses": 6,
            "expense": 6
        };

        return roots.sort((a, b) => {
            const orderA = sortOrder[a.name.toLowerCase()] || 999;
            const orderB = sortOrder[b.name.toLowerCase()] || 999;

            if (orderA !== orderB) {
                return orderA - orderB;
            }

            // Fallback to alphabetical if same order or not in map
            return a.name.localeCompare(b.name);
        });
    };

    const toggleNode = (nodePath: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(nodePath)) {
            newExpanded.delete(nodePath);
        } else {
            newExpanded.add(nodePath);
        }
        setExpandedNodes(newExpanded);
    };

    const selectNodeForPreview = (node: TreeNode) => {
        // Create a partial path based on the level clicked
        const partialPath = {
            category: node.level >= 0 ? node.fullPath.category : null,
            group: node.level >= 1 ? node.fullPath.group : null,
            sub_group_1: node.level >= 2 ? node.fullPath.sub_group_1 : null,
            sub_group_2: node.level >= 3 ? node.fullPath.sub_group_2 : null,
            sub_group_3: node.level >= 4 ? node.fullPath.sub_group_3 : null,
            ledger_type: node.level >= 5 ? node.fullPath.ledger_type : null,
            parent_ledger_id: node.isCustom && node.ledgerId ? node.ledgerId : null,  // If custom ledger, use its ID as parent
        };

        setSelectedNode({
            ...node,
            fullPath: partialPath
        });
        // Reset inputs when selection changes
        setSubGroup2Input('');
        setSubGroup3Input('');
        setLedgerTypeInput('');
        setQuestionAnswers({});
    };

    const renderTree = (nodes: TreeNode[], parentPath = '', level = 0): React.ReactElement[] => {
        return nodes.map((node, index) => {
            const nodePath = parentPath ? `${parentPath}>${node.name}` : node.name;
            const isExpanded = expandedNodes.has(nodePath);
            const hasChildren = node.children.length > 0;
            const isSelected = selectedNode?.name === node.name &&
                selectedNode?.level === node.level &&
                JSON.stringify(selectedNode?.fullPath) === JSON.stringify(node.fullPath);

            return (
                <div key={nodePath} style={{ marginLeft: `${level * 20}px` }}>
                    <div
                        className={`flex items-center py-1.5 px-2 cursor-pointer hover:bg-gray-100 rounded transition-colors ${isSelected ? 'bg-indigo-100 text-slate-700 font-medium border-l-2 border-indigo-500' : ''
                            } ${node.isCustom ? 'text-indigo-600' : ''}`}
                        onClick={() => {
                            selectNodeForPreview(node);
                            // Reset inputs when selection changes
                            setSubGroup3Input('');
                            setLedgerTypeInput('');
                        }}
                        onDoubleClick={() => {
                            if (hasChildren) {
                                toggleNode(nodePath);
                            }
                        }}
                    >
                        {hasChildren ? (
                            <span className="mr-1 text-gray-500 text-xs font-bold select-none">
                                {isExpanded ? '−' : '+'}
                            </span>
                        ) : (
                            <span className={`mr-1 text-xs ${node.isCustom ? 'text-indigo-500' : 'text-gray-400'}`}>
                                {node.isCustom ? '★' : '•'}
                            </span>
                        )}
                        <span className={`text-sm select-none ${node.isCustom ? 'font-medium' : ''}`}>
                            {node.name}
                        </span>
                    </div>
                    {hasChildren && isExpanded && (
                        <div>
                            {renderTree(node.children, nodePath, level + 1)}
                        </div>
                    )}
                </div>
            );
        });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Determine values based on selection + inputs
        const finalSubGroup2 = selectedNode?.fullPath.sub_group_2 || subGroup2Input.trim();
        const finalSubGroup3 = selectedNode?.fullPath.sub_group_3 || subGroup3Input.trim();
        const finalLedgerType = selectedNode?.fullPath.ledger_type || ledgerTypeInput.trim();

        // The Name is the most specific new value provided
        let finalName = '';
        if (ledgerTypeInput.trim()) {
            finalName = ledgerTypeInput.trim();
        } else if (subGroup3Input.trim()) {
            finalName = subGroup3Input.trim();
        } else if (subGroup2Input.trim()) {
            finalName = subGroup2Input.trim();
        }

        if (!finalName || !selectedNode) {
            showWarning('Please enter a name in Sub Group 2, Sub Group 3 or Ledger Type fields.');
            return;
        }

        const newLedgerData = {
            customName: finalName,
            group: selectedNode.fullPath.group,
            category: selectedNode.fullPath.category,
            sub_group_1: selectedNode.fullPath.sub_group_1,
            sub_group_2: finalSubGroup2 || null,
            sub_group_3: finalSubGroup3 || null,
            ledger_type: finalLedgerType || null,
            parent_ledger_id: selectedNode.fullPath.parent_ledger_id || null,
            question_answers: questionAnswers // Pass collected answers
        };

        // Call parent's onCreateLedger
        onCreateLedger(newLedgerData);

        // Reset form immediately
        setSubGroup2Input('');
        setSubGroup3Input('');
        setLedgerTypeInput('');
        setSelectedNode(null);
        setQuestionAnswers({}); // Reset answers

        // Refetch data after a short delay to get the newly created ledger with real ID
        setTimeout(async () => {
            try {
                const [hierarchyRes, ledgersRes] = await Promise.all([
                    fetch('http://localhost:8000/api/hierarchy/'),
                    fetch('http://localhost:8000/api/masters/ledgers/', {
                        credentials: 'include'
                    })
                ]);

                if (hierarchyRes.ok && ledgersRes.ok) {
                    const globalHierarchy: HierarchyRow[] = await hierarchyRes.json();
                    const ledgers: Ledger[] = await ledgersRes.json();

                    setTenantLedgers(ledgers);
                    const customHierarchy = ledgers.map(ledger => convertLedgerToHierarchy(ledger, ledgers));
                    const mergedHierarchy = [...globalHierarchy, ...customHierarchy];
                    setHierarchyData(mergedHierarchy);

                    const tree = buildTreeStructure(mergedHierarchy, ledgers);
                    setTreeData(tree);
                }
            } catch (error) {
                console.error('Error refetching data:');
            }
        }, 500); // Wait 500ms for database to save
    };

    if (loading) return <div className="text-gray-500 text-sm">Loading hierarchy...</div>;

    // Helper to determine if input should be disabled (value comes from parent hierarchy)
    const isSubGroup2Fixed = !!selectedNode?.fullPath.sub_group_2;
    const isSubGroup3Fixed = !!selectedNode?.fullPath.sub_group_3;
    const isLedgerTypeFixed = !!selectedNode?.fullPath.ledger_type;

    return (
        <div className="bg-white rounded-[4px] border border-gray-200 space-y-4">
            <div className="p-4 border-b border-gray-200">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Icon name="wand-sparkles" />
                    Create Ledger
                </h4>
            </div>

            <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column: Hierarchy Tree */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Ledger Type
                    </label>
                    <div className="border border-gray-300 rounded-[4px] p-3 max-h-[32rem] overflow-y-auto bg-gray-50">
                        {treeData.length > 0 ? (
                            renderTree(treeData)
                        ) : (
                            <div className="text-gray-500 text-sm">No hierarchy data available</div>
                        )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        <strong>Single click</strong> to select any level. <strong>Double click</strong> to expand/collapse categories.
                        <br />
                        <span className="text-indigo-600">★ Blue items</span> are your custom ledgers. Click them to create nested ledgers!
                    </p>
                </div>

                {/* Right Column: Preview & Form */}
                <div>
                    <div className="bg-gray-50 border border-gray-200 rounded-[4px] p-4">
                        <h5 className="text-sm font-semibold text-gray-700 mb-4">Ledger Preview</h5>

                        {/* Hierarchy Details Grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-4">
                            {/* Category */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Category
                                </label>
                                <div className="text-sm font-medium text-gray-800 py-2 border-b border-gray-100">
                                    {selectedNode?.fullPath.category || '-'}
                                </div>
                            </div>

                            {/* Group */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Group
                                </label>
                                <div className="text-sm font-medium text-gray-800 py-2 border-b border-gray-100">
                                    {selectedNode?.fullPath.group || '-'}
                                </div>
                            </div>

                            {/* Sub Group 1 */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Sub Group 1
                                </label>
                                <div className="text-sm font-medium text-gray-800 py-2 border-b border-gray-100">
                                    {selectedNode?.fullPath.sub_group_1 || '-'}
                                </div>
                            </div>

                            {/* Sub Group 2 - INPUT */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Sub Group 2
                                </label>
                                <input
                                    type="text"
                                    value={isSubGroup2Fixed ? selectedNode?.fullPath.sub_group_2! : subGroup2Input}
                                    onChange={(e) => !isSubGroup2Fixed && setSubGroup2Input(e.target.value)}
                                    disabled={!selectedNode || isSubGroup2Fixed}
                                    className={`w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!selectedNode || isSubGroup2Fixed
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-white border-gray-300'
                                        }`}
                                    placeholder={!selectedNode ? '-' : (isSubGroup2Fixed ? '' : 'Enter Name')}
                                />
                            </div>

                            {/* Sub Group 3 - INPUT */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">
                                    Sub Group 3
                                </label>
                                <input
                                    type="text"
                                    value={isSubGroup3Fixed ? selectedNode?.fullPath.sub_group_3! : subGroup3Input}
                                    onChange={(e) => !isSubGroup3Fixed && setSubGroup3Input(e.target.value)}
                                    disabled={!selectedNode || isSubGroup3Fixed}
                                    className={`w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!selectedNode || isSubGroup3Fixed
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-white border-gray-300'
                                        }`}
                                    placeholder={!selectedNode ? '-' : (isSubGroup3Fixed ? '' : 'Enter Name')}
                                />
                            </div>

                            {/* Ledger Name - INPUT */}
                            <div className="flex flex-col">
                                <label className="text-sm font-medium text-gray-700 mb-1">
                                    Ledger Name
                                </label>
                                <input
                                    type="text"
                                    value={isLedgerTypeFixed ? selectedNode?.fullPath.ledger_type! : ledgerTypeInput}
                                    onChange={(e) => !isLedgerTypeFixed && setLedgerTypeInput(e.target.value)}
                                    disabled={!selectedNode || isLedgerTypeFixed}
                                    className={`w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${!selectedNode || isLedgerTypeFixed
                                        ? 'bg-gray-100 text-gray-600 border-gray-200'
                                        : 'bg-white border-gray-300'
                                        }`}
                                    placeholder={!selectedNode ? '-' : (isLedgerTypeFixed ? '' : 'Enter Name')}
                                />
                            </div>
                        </div>

                        {/* DYNAMIC QUESTIONS SECTION */}
                        {selectedNode?.fullPath.sub_group_1 && (
                            <LedgerQuestions
                                selectedLedgerType={selectedNode.fullPath.sub_group_1}
                                onAnswersChange={setQuestionAnswers}
                            />
                        )}

                        {/* Create Ledger Button */}
                        <div className="mt-6">
                            <button
                                type="button"
                                onClick={handleSubmit}
                                className="w-full bg-indigo-600 text-white px-6 py-3 rounded-[4px] font-medium hover:bg-indigo-700 transition-colors"
                            >
                                Create Ledger
                            </button>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

