import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import { httpClient } from '../services/httpClient';
import { showSuccess, showError, showWarning, showInfo, confirm as toastConfirm } from '../utils/toast';
import { handleApiError } from '../utils/errorHandler';

interface MasterCategory {
    id: number;
    category: string;
    group: string | null;
    subgroup: string | null;
    sub_subgroup: string | null;
    is_active: boolean;
    full_path?: string;
}

interface TreeNode {
    id: string; // Composite ID for tree tracking
    name: string;
    children: TreeNode[];
    level: number; // 0=Category, 1=Group, 2=Subgroup, 3=Item
    isSystem: boolean;
    data: {
        id?: number;
        category: string;
        group: string | null;
        subgroup: string | null;
        sub_subgroup: string | null;
    };
}

interface InventoryCategoryWizardProps {
    onCreateCategory: (data: {
        category: string;
        group: string;
        subgroup: string;
        sub_subgroup?: string;
    }) => Promise<void>;
    onEditCategory?: (data: {
        id: number;
        category: string;
        group: string | null;
        subgroup: string;
        sub_subgroup?: string;
    }) => Promise<void>;
    onDeleteCategory?: (id: number) => Promise<void>;
    apiEndpoint?: string; // Optional API endpoint, defaults to inventory
    allowCreateGroup?: boolean;
    systemCategories?: string[];
    defaultGroups?: any[]; // Using any[] for simplicity as the shape is defined in DEFAULT_GROUPS_DATA
    showSubgroup?: boolean; // Optional prop to control visibility of Subgroups
    excludeGroups?: string[]; // Names of groups to exclude mainly from view
    defaultSubgroupsOnlyFor?: string[]; // If provided, default subgroups are ONLY prepopulated for these categories
}

// Hardcoded base categories (System Categories) - Default
const DEFAULT_SYSTEM_CATEGORIES = [
    'Raw Material',
    'Work in Progress',
    'Finished Goods',
    'Stores and Spares',
    'Packing Material',
    'Stock in Trade',
    'By-product',
    'Scrap'
];

const DEFAULT_GROUPS_DATA = [
    {
        name: 'With in country (Indigenous)',
        subgroups: ['Consumables', 'Machinery Spares', 'Others']
    },
    {
        name: 'Import',
        subgroups: ['Consumables', 'Machinery Spares', 'Others']
    }
];

const DEFAULT_EXCLUDE_GROUPS: string[] = [];

export const InventoryCategoryWizard: React.FC<InventoryCategoryWizardProps> = ({
    onCreateCategory,
    onEditCategory,
    onDeleteCategory,
    apiEndpoint = '/api/inventory/master-categories/',
    systemCategories = DEFAULT_SYSTEM_CATEGORIES,
    defaultGroups = DEFAULT_GROUPS_DATA,
    allowCreateGroup = true,
    showSubgroup = true, // Default to true to maintain existing behavior,
    excludeGroups = DEFAULT_EXCLUDE_GROUPS,
    defaultSubgroupsOnlyFor
}) => {
    const [loading, setLoading] = useState(false);
    const [treeData, setTreeData] = useState<TreeNode[]>([]);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);

    const [restoredNodes, setRestoredNodes] = useState<Set<string>>(new Set());

    // NEW: We need to store API data to rebuild tree without re-fetching
    const [apiData, setApiData] = useState<MasterCategory[]>([]);

    const [isEditing, setIsEditing] = useState(false);

    const [formData, setFormData] = useState({
        category: '',
        group: '',
        subgroup: '',
        sub_subgroup: ''
    });

    useEffect(() => {
        fetchMasterCategories();
    }, [apiEndpoint]); // Re-fetch when endpoint changes

    // Re-build tree when apiData or restoredNodes change
    useEffect(() => {
        buildTree(apiData);
    }, [apiData, restoredNodes, systemCategories, defaultGroups, showSubgroup, excludeGroups]);


    const fetchMasterCategories = async () => {
        setLoading(true);
        try {
            const response = await httpClient.get<MasterCategory[]>(apiEndpoint);
            if (response && Array.isArray(response)) {
                setApiData(response); // Store the fetched data
                // buildTree(response); // buildTree is now called by the useEffect hook
            }
        } catch (error) {
            handleApiError(error, 'Fetch Categories');
            // Fallback to system categories + manual build if API fails?
            // For now, just show system categories by passing empty array to buildTree
            setApiData([]); // Clear API data on error
            // buildTree([]); // buildTree is now called by the useEffect hook
        } finally {
            setLoading(false);
        }
    };

    const buildTree = (data: MasterCategory[]) => {
        const rootMap = new Map<string, TreeNode>();



        // 1. Initialize System Categories with default groups and subgroups
        systemCategories.forEach(catName => {
            const categoryNode: TreeNode = {
                id: `root-${catName}`,
                name: catName,
                children: [],
                level: 0,
                isSystem: true,
                data: { category: catName, group: null, subgroup: null, sub_subgroup: null }
            };

            // Add default groups and subgroups to each system category
            // EXCEPTION: 'By-product' and 'Scrap' should NOT have default groups
            if (catName !== 'By-product' && catName !== 'Scrap' && catName !== 'Work in Progress' && catName !== 'Finished Goods') {
                defaultGroups.forEach(groupData => {
                    if (excludeGroups.includes(groupData.name)) return;

                    const groupNode: TreeNode = {
                        id: `group-${catName}-${groupData.name}`,
                        name: groupData.name,
                        children: [],
                        level: 1,
                        isSystem: true,
                        data: { category: catName, group: groupData.name, subgroup: null, sub_subgroup: null }
                    };

                    // Logic for adding subgroups
                    // Only add subgroups if showSubgroup is true
                    if (showSubgroup) {
                        if (defaultSubgroupsOnlyFor) {
                            if (defaultSubgroupsOnlyFor.includes(catName) && groupData.subgroups && groupData.subgroups.length > 0) {
                                groupData.subgroups.forEach((subgroupName: string) => {
                                    const subgroupNode: TreeNode = {
                                        id: `sub-${catName}-${groupData.name}-${subgroupName}`,
                                        name: subgroupName,
                                        children: [],
                                        level: 2,
                                        isSystem: true,
                                        data: { category: catName, group: groupData.name, subgroup: subgroupName, sub_subgroup: null }
                                    };
                                    groupNode.children.push(subgroupNode);
                                });
                            }
                        } else {
                            // If this is the specific 'Inventory' case with 'Stores and Spares', keep original logic
                            if (catName === 'Stores and Spares' && defaultGroups === DEFAULT_GROUPS_DATA) {
                                groupData.subgroups.forEach(subgroupName => {
                                    const subgroupNode: TreeNode = {
                                        id: `sub-${catName}-${groupData.name}-${subgroupName}`,
                                        name: subgroupName,
                                        children: [],
                                        level: 2,
                                        isSystem: true,
                                        data: { category: catName, group: groupData.name, subgroup: subgroupName, sub_subgroup: null }
                                    };
                                    groupNode.children.push(subgroupNode);
                                });
                            }
                            // If custom groups are provided (not the default inventory ones), we apply subgroups to ALL categories
                            // This allows other modules (like Customer) to have subgroups for all their categories if defined
                            else if (defaultGroups !== DEFAULT_GROUPS_DATA && groupData.subgroups && groupData.subgroups.length > 0) {
                                groupData.subgroups.forEach((subgroupName: string) => {
                                    const subgroupNode: TreeNode = {
                                        id: `sub-${catName}-${groupData.name}-${subgroupName}`,
                                        name: subgroupName,
                                        children: [],
                                        level: 2,
                                        isSystem: true,
                                        data: { category: catName, group: groupData.name, subgroup: subgroupName, sub_subgroup: null }
                                    };
                                    groupNode.children.push(subgroupNode);
                                });
                            }
                        }
                    }

                    categoryNode.children.push(groupNode);
                });
            }

            rootMap.set(catName, categoryNode);
        });

        // 2. Process fetched data to build hierarchy (only for standard/system categories)
        data.filter(item => rootMap.has(item.category)).forEach(item => {
            const catName = item.category;
            const rootNode = rootMap.get(catName)!;

            // Handle three cases:
            // 1. Group with optional Subgroup
            // 2. Subgroup without Group (direct under category)
            // 3. Just Group (no subgroup)

            if (item.group && item.group !== '') {
                if (excludeGroups.includes(item.group)) return;

                // Case 1 & 3: Has a group
                let groupNode = rootNode.children.find(c => c.name === item.group);

                if (!groupNode) {
                    groupNode = {
                        id: `group-${catName}-${item.group}`,
                        name: item.group,
                        children: [],
                        level: 1,
                        isSystem: false,
                        data: {
                            id: (item.subgroup || item.sub_subgroup) ? undefined : item.id,
                            category: catName,
                            group: item.group,
                            subgroup: null,
                            sub_subgroup: null
                        }
                    };
                    rootNode.children.push(groupNode);
                } else if (!item.subgroup && !groupNode.data.id) {
                    // Update existing group node (system or previous) with ID if it doesn't have one
                    groupNode.data.id = item.id;
                }

                // Process Subgroup under Group
                if (showSubgroup && item.subgroup && item.subgroup !== '') {
                    // Check if subgroup already exists to avoid duplicates
                    let subgroupNode = groupNode.children.find(c => c.name === item.subgroup);
                    if (!subgroupNode) {
                        subgroupNode = {
                            id: `sub-${catName}-${item.group}-${item.subgroup}`,
                            name: item.subgroup,
                            children: [],
                            level: 2,
                            isSystem: false,
                            data: {
                                id: item.sub_subgroup ? undefined : item.id,
                                category: catName,
                                group: item.group,
                                subgroup: item.subgroup,
                                sub_subgroup: null
                            }
                        };
                        groupNode.children.push(subgroupNode);
                    }

                    // Process Sub-subgroup (Item) under Subgroup
                    if (item.sub_subgroup && item.sub_subgroup !== '') {
                        if (!subgroupNode.children.find(c => c.name === item.sub_subgroup)) {
                            const subsubNode: TreeNode = {
                                id: `item-${catName}-${item.group}-${item.subgroup}-${item.sub_subgroup}`,
                                name: item.sub_subgroup,
                                children: [],
                                level: 3,
                                isSystem: false,
                                data: {
                                    id: item.id,
                                    category: catName,
                                    group: item.group,
                                    subgroup: item.subgroup,
                                    sub_subgroup: item.sub_subgroup
                                }
                            };
                            subgroupNode.children.push(subsubNode);
                        }
                    }
                }
            } else if (showSubgroup && item.subgroup && item.subgroup !== '') {
                // Case 2: Subgroup without Group (direct under category)
                // Check if subgroup already exists to avoid duplicates
                let subgroupNode = rootNode.children.find(c => c.name === item.subgroup);
                if (!subgroupNode) {
                    subgroupNode = {
                        id: `sub-${catName}-null-${item.subgroup}`,
                        name: item.subgroup,
                        children: [],
                        level: 1, // Level 1 since it's directly under category
                        isSystem: false,
                        data: {
                            id: item.sub_subgroup ? undefined : item.id,
                            category: catName,
                            group: null,
                            subgroup: item.subgroup,
                            sub_subgroup: null
                        }
                    };
                    rootNode.children.push(subgroupNode);
                }

                // Process Sub-subgroup (Item) under Subgroup
                if (item.sub_subgroup && item.sub_subgroup !== '') {
                    if (!subgroupNode.children.find(c => c.name === item.sub_subgroup)) {
                        const subsubNode: TreeNode = {
                            id: `item-${catName}-null-${item.subgroup}-${item.sub_subgroup}`,
                            name: item.sub_subgroup,
                            children: [],
                            level: 2, // Level 2 since Parent Subgroup is Level 1
                            isSystem: false,
                            data: {
                                id: item.id,
                                category: catName,
                                group: null,
                                subgroup: item.subgroup,
                                sub_subgroup: item.sub_subgroup
                            }
                        };
                        subgroupNode.children.push(subsubNode);
                    }
                }
            }
        });

        // Convert Map to Array and Sort
        const sortedRoots = Array.from(rootMap.values()).sort((a, b) => {
            // System categories first, then alphabetical
            const aSys = systemCategories.indexOf(a.name);
            const bSys = systemCategories.indexOf(b.name);
            if (aSys !== -1 && bSys !== -1) return aSys - bSys;
            if (aSys !== -1) return -1;
            if (bSys !== -1) return 1;
            return a.name.localeCompare(b.name);
        });

        // Sort children
        const sortChildren = (node: TreeNode) => {
            node.children.sort((a, b) => a.name.localeCompare(b.name));
            node.children.forEach(sortChildren);
        };
        sortedRoots.forEach(sortChildren);

        setTreeData(sortedRoots);
    };

    const toggleNode = (nodeId: string) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(nodeId)) {
            newExpanded.delete(nodeId);
        } else {
            newExpanded.add(nodeId);
        }
        setExpandedNodes(newExpanded);
    };

    const handleNodeSelect = (node: TreeNode) => {
        // Force reset editing state
        setIsEditing(false);
        setSelectedNode(node);

        // Update form data based on selection
        setFormData({
            category: node.data.category,
            group: node.data.group || '',
            subgroup: node.data.subgroup || '',
            sub_subgroup: node.data.sub_subgroup || ''
        });

        // Auto-expand if selecting a root/group to make workflow smoother
        if (!expandedNodes.has(node.id)) {
            toggleNode(node.id);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();


        if (!selectedNode) {
            showWarning('Please select a category or group.');
            return;
        }

        // If we're in edit mode, handle the edit
        if (isEditing && selectedNode.data.id && onEditCategory) {


            try {
                // Determine if we are updating a Group or Subgroup based on showSubgroup prop
                if (!showSubgroup) {
                    // Case 1: Updating Group (e.g. Customer Portal)
                    if (!formData.group.trim()) {
                        showWarning('Please enter a Group Name');
                        return;
                    }

                    await onEditCategory({
                        id: selectedNode.data.id,
                        category: selectedNode.data.category,
                        group: formData.group.trim(),
                        subgroup: '',
                        sub_subgroup: ''
                    });
                } else {
                    // Case 2: Updating Subgroup (e.g. Inventory Portal)
                    if (!formData.subgroup.trim()) {
                        showWarning('Please enter a Subgroup Name');
                        return;
                    }

                    await onEditCategory({
                        id: selectedNode.data.id,
                        category: selectedNode.data.category,
                        group: selectedNode.data.group || '',
                        subgroup: formData.subgroup.trim(),
                        sub_subgroup: formData.sub_subgroup.trim()
                    });
                }

                showSuccess('Category updated successfully!');
                setIsEditing(false);
                fetchMasterCategories(); // Refresh tree
                return;
            } catch (error: any) {
                handleApiError(error, 'Update Category');
                return;
            }
        }

        // Validations
        if (selectedNode.level === 0) {
            if (!formData.group.trim()) {
                showWarning('Please enter a Group Name');
                return;
            }
        }

        if (selectedNode.level === 2 && !formData.sub_subgroup.trim() && showSubgroup) {
            // Selected Subgroup, user MUST enter Item Name
            showWarning('Please enter an Item Name');
            return;
        }

        try {
            // 1. Create Group (Level 0 selected)
            if (selectedNode.level === 0) {
                await onCreateCategory({
                    category: selectedNode.data.category,
                    group: formData.group.trim(),
                    subgroup: '',
                    sub_subgroup: ''
                });
                setFormData(prev => ({ ...prev, group: '', subgroup: '', sub_subgroup: '' })); // Clear inputs
                showSuccess('Group created successfully!');
            }
            // 2. Create Subgroup (under Group)
            else if (showSubgroup && selectedNode.level === 1 && !selectedNode.data.subgroup) {
                await onCreateCategory({
                    category: selectedNode.data.category,
                    group: selectedNode.data.group || '',
                    subgroup: formData.subgroup.trim(),
                    sub_subgroup: ''
                });
                setFormData(prev => ({ ...prev, group: '', subgroup: '', sub_subgroup: '' })); // Clear inputs
                showSuccess('Subgroup created successfully!');
            }
            // 3. Create Item (under Subgroup)
            else if (showSubgroup && (selectedNode.level === 2 || (selectedNode.level === 1 && selectedNode.data.subgroup)) && !selectedNode.data.sub_subgroup) {
                await onCreateCategory({
                    category: selectedNode.data.category,
                    group: selectedNode.data.group || '',
                    subgroup: selectedNode.data.subgroup || '',
                    sub_subgroup: formData.sub_subgroup.trim()
                });
                setFormData(prev => ({ ...prev, group: '', subgroup: '', sub_subgroup: '' })); // Clear inputs
                showSuccess('Item created successfully!');
            }

            // Success
            fetchMasterCategories(); // Refresh tree

        } catch (error: any) {
            // Check for duplicate error (409 status or specific error strings)
            const errorMsg = error.toString();
            const isDuplicate = error.status === 409 || 
                               error.response?.status === 409 ||
                               errorMsg.includes('Duplicate') || 
                               errorMsg.includes('IntegrityError') || 
                               errorMsg.includes('already exists');

            if (isDuplicate) {
                // It's a duplicate! Reveal it if it was hidden.
                const restoreKey = `${selectedNode.data.category}-${formData.group.trim() || 'null'}-${formData.subgroup.trim() || 'null'}-${formData.sub_subgroup.trim() || 'null'}`;

                // Add to restored set
                setRestoredNodes(prev => new Set(prev).add(restoreKey));

                showInfo("Category already exists! It has been restored to the view.");
                setFormData(prev => ({ ...prev, group: '', subgroup: '', sub_subgroup: '' })); // Clear inputs
                fetchMasterCategories(); // Re-fetch to ensure the restored item is visible
            } else {
                handleApiError(error, 'Create/Update Category');
            }
        }
    };

    const handleDelete = async () => {
        if (!selectedNode || !selectedNode.data.id || !onDeleteCategory) return;

        const itemType = showSubgroup ? "subgroup" : "group";
        if (await toastConfirm(`Are you sure you want to delete ${itemType} "${selectedNode.name}"?`)) {
            try {
                await onDeleteCategory(selectedNode.data.id);
                setSelectedNode(null);
                setFormData({ category: '', group: '', subgroup: '', sub_subgroup: '' });
                fetchMasterCategories();
            } catch (error: any) {
                handleApiError(error, 'Delete Category');
                // Refresh anyway if it looks like the item is already gone
                if (error.status === 404 || (error.response && error.response.status === 404)) {
                    setSelectedNode(null);
                    fetchMasterCategories();
                }
            }
        }
    };

    const renderTree = (nodes: TreeNode[]): React.ReactElement[] => {
        return nodes.map((node) => {
            const isExpanded = expandedNodes.has(node.id);
            const hasChildren = node.children.length > 0;
            const isSelected = selectedNode?.id === node.id;

            return (
                <div key={node.id} style={{ marginLeft: `${node.level * 20}px` }}>
                    <div
                        className={`flex items-center py-1.5 px-2 cursor-pointer hover:bg-gray-100 rounded transition-colors ${isSelected ? 'bg-indigo-100 text-slate-700 font-medium border-l-2 border-indigo-500' : ''}`}
                        onClick={() => handleNodeSelect(node)}
                        onDoubleClick={() => {
                            if (hasChildren || node.level < 3) {
                                toggleNode(node.id);
                            }
                        }}
                    >
                        {hasChildren ? (
                            <span
                                className="mr-1 text-gray-500 text-xs font-bold select-none w-4 text-center hover:text-gray-700"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleNode(node.id);
                                }}
                            >
                                {isExpanded ? '−' : '+'}
                            </span>
                        ) : (
                            <span className="mr-1 text-xs w-4 text-center text-gray-400">
                                •
                            </span>
                        )}

                        <span className={`text-sm select-none truncate ${!isSelected && node.level === (showSubgroup ? 2 : 1) ? 'text-blue-800 font-medium' : 'text-gray-900'}`}>
                            {node.name}
                        </span>
                    </div>
                    {hasChildren && isExpanded && (
                        <div>
                            {renderTree(node.children)}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)]">
            <div className="px-6 pt-4 pb-3 flex items-center gap-2">
                <Icon name="tag" className="w-5 h-5 text-gray-600" />
                <h3 className="section-title">Create Category</h3>
            </div>
            <div className="flex flex-col md:flex-row gap-5 px-6 pb-6 flex-1 min-h-0">
                {/* Left Panel: Category Tree */}
                <div className="w-full md:w-1/2 bg-white rounded-[4px] border border-gray-200 flex flex-col">
                    <div className="p-4 border-b border-gray-200">
                        <h3 className="section-title text-sm">Select Category</h3>
                        <p className="helper-text mt-0.5">Single click to select level. Double click to expand/collapse categories.</p>

                    </div>

                    <div className="flex-1 overflow-y-auto p-3">
                        {loading ? (
                            <div className="text-center py-8 text-gray-400 text-sm">Loading hierarchy...</div>
                        ) : (
                            renderTree(treeData)
                        )}
                    </div>
                </div>

                {/* Right Panel: Creation Form */}
                <div className="w-full md:w-1/2 bg-white rounded-[4px] border border-gray-200">
                    <div className="p-5">
                        <h3 className="section-title text-sm mb-2">Category Preview</h3>
                        <p className="text-xs text-indigo-600 font-medium mb-4">
                            {selectedNode 
                                ? (selectedNode.level === 0 ? `Creating New Group under ${selectedNode.name}` : `Creating New Subgroup under ${selectedNode.name}`)
                                : "Please select a category to begin"}
                        </p>
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Logic for Creation Inputs based on Selection Level */}
                            <div className="space-y-5">

                                {/* 1. Category Display (Always Fixed) */}
                                <div>
                                    {selectedNode ? (
                                        <div className="flex items-center justify-between">
                                            <div className="text-gray-900 font-semibold text-base">
                                                {selectedNode.level === 0 ? selectedNode.name : selectedNode.data.category}
                                            </div>
                                            {(selectedNode.level > 0) && (
                                                <button 
                                                    type="button"
                                                    onClick={() => {
                                                        const rootNode = treeData.find(n => n.name === selectedNode.data.category);
                                                        if (rootNode) handleNodeSelect(rootNode);
                                                    }}
                                                    className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                                                >
                                                    Change Parent
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-gray-400 font-normal text-sm italic">
                                            Select a category from the left
                                        </div>
                                    )}
                                </div>

                                {/* 2. Group Input/Display */}
                                {selectedNode && (
                                    <div>
                                        <label className="label-text">
                                            GROUP
                                        </label>

                                        {selectedNode && selectedNode.level === 0 ? (
                                            // If Root selected, allow typing Group
                                            <input
                                                type="text"
                                                name="group"
                                                value={formData.group}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-gray-400 bg-white text-gray-800 text-sm"
                                                placeholder="Enter Group Name"
                                                autoFocus
                                            />
                                        ) : selectedNode && selectedNode.level === 1 && selectedNode.data.group && !selectedNode.data.subgroup ? (
                                            // If GROUP (not subgroup) selected at level 1
                                            <div className="flex items-center justify-between">
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        name="group"
                                                        value={formData.group}
                                                        onChange={handleInputChange}
                                                        className="w-full px-3 py-2 border border-blue-500 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-400 bg-white text-gray-800 text-sm"
                                                        placeholder="Enter Group Name"
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <div className="text-gray-900 font-semibold text-base">
                                                        {selectedNode.name}
                                                    </div>
                                                )}

                                                {/* Only show actions if NOT editing, or cancel if editing */}
                                                {/* Edit/Delete buttons removed to avoid duplication with bottom preview actions */}
                                            </div>
                                        ) : selectedNode.level === 2 && selectedNode.data.group ? (
                                            // If SUBGROUP selected, show the parent group
                                            <div className="text-gray-900 font-semibold text-base">
                                                {selectedNode.data.group}
                                            </div>
                                        ) : (
                                            <div className="text-gray-400 font-normal text-sm italic">
                                                Select a group from the left
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 3. Subgroup Input - CONDITIONAL */}
                                {showSubgroup && selectedNode && selectedNode.level >= 1 && (
                                    <div>
                                        <label className="label-text">
                                            SUBGROUP
                                        </label>

                                        {!selectedNode.data.id ? (
                                            // Case 1: New Subgroup (No ID yet) - Always allow input
                                            <input
                                                type="text"
                                                name="subgroup"
                                                value={formData.subgroup}
                                                onChange={handleInputChange}
                                                disabled={!selectedNode || selectedNode.level > 1}
                                                className={`w-full px-3 py-2 border border-gray-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-gray-400 text-sm ${!selectedNode || selectedNode.level > 1
                                                    ? 'bg-gray-50 text-gray-400 cursor-not-allowed'
                                                    : 'bg-white text-gray-800'
                                                    }`}
                                                placeholder="Enter Subgroup Name (Optional - Create Group First)"
                                            />
                                        ) : isEditing ? (
                                            // Case 2: Editing Existing Subgroup
                                            <input
                                                type="text"
                                                name="subgroup"
                                                value={formData.subgroup}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-gray-300 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all placeholder-gray-400 text-sm bg-white text-gray-800"
                                                placeholder="Edit Subgroup Name"
                                                autoFocus
                                            />
                                        ) : (
                                            // Case 3: Viewing Existing Subgroup
                                            <div className="text-gray-900 font-semibold text-base py-2">
                                                {selectedNode.data.subgroup}
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* 4. Item Input - CONDITIONAL */}
                                {showSubgroup && selectedNode && selectedNode.level >= 2 && (
                                    <div className="mt-4">
                                        <label className="label-text">
                                            ITEM (SUB-SUBGROUP)
                                        </label>

                                        {(!selectedNode.data.id || (selectedNode.level === 2 && !isEditing)) ? (
                                            // Case 1: New Item (Selected a Subgroup to create an Item under it)
                                            <input
                                                type="text"
                                                name="sub_subgroup"
                                                value={formData.sub_subgroup}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-blue-500 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder-gray-400 bg-white text-gray-800 text-sm"
                                                placeholder="Enter Item Name"
                                                autoFocus
                                            />
                                        ) : isEditing ? (
                                            // Case 2: Editing Existing Item
                                            <input
                                                type="text"
                                                name="sub_subgroup"
                                                value={formData.sub_subgroup}
                                                onChange={handleInputChange}
                                                className="w-full px-3 py-2 border border-teal-500 rounded focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none transition-all placeholder-gray-400 text-sm bg-white text-gray-800 font-medium"
                                                placeholder="Edit Item Name"
                                                autoFocus
                                            />
                                        ) : (
                                            // Case 3: Viewing Existing Item
                                            <div className="text-gray-900 font-semibold text-base py-2">
                                                {selectedNode.data.sub_subgroup}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="pt-4">
                                {/* Show Edit and Delete buttons for existing subgroups */}
                                {selectedNode && selectedNode.data.id && !isEditing ? (
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();

                                                setIsEditing(true);
                                            }}
                                            className="flex-1 py-2.5 px-4 rounded font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm bg-blue-600 text-white hover:bg-blue-700 cursor-pointer focus:ring-blue-500"
                                        >
                                            <Icon name="edit" className="w-4 h-4 inline-block mr-1" />
                                            Edit
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                handleDelete();
                                            }}
                                            className="flex-1 py-2.5 px-4 rounded font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm bg-red-600 text-white hover:bg-red-700 cursor-pointer focus:ring-red-500"
                                        >
                                            <Icon name="trash" className="w-4 h-4 inline-block mr-1" />
                                            Delete
                                        </button>
                                    </div>
                                ) : isEditing ? (
                                    // Show Save and Cancel buttons when editing
                                    <div className="flex gap-3">
                                        <button
                                            type="submit"
                                            className="flex-1 py-2.5 px-4 rounded font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm bg-green-600 text-white hover:bg-green-700 cursor-pointer focus:ring-green-500"
                                        >
                                            <Icon name="check" className="w-4 h-4 inline-block mr-1" />
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditing(false);
                                                // Reset form data to original values
                                                if (selectedNode) {
                                                    setFormData({
                                                        category: selectedNode.data.category,
                                                        group: selectedNode.data.group || '',
                                                        subgroup: selectedNode.data.subgroup || '',
                                                        sub_subgroup: selectedNode.data.sub_subgroup || ''
                                                    });
                                                }
                                            }}
                                            className="flex-1 py-2.5 px-4 rounded font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm bg-gray-500 text-white hover:bg-gray-600 cursor-pointer focus:ring-gray-500"
                                        >
                                            <Icon name="close" className="w-4 h-4 inline-block mr-1" />
                                            Cancel
                                        </button>
                                    </div>
                                ) : (
                                    // Show Create Subgroup button for new entries
                                    <button
                                        type="submit"
                                        disabled={!selectedNode || (
                                            selectedNode.level === 0 ? !formData.group.trim() : 
                                            (selectedNode.level === 1 && !selectedNode.data.subgroup) ? !formData.subgroup.trim() :
                                            ((selectedNode.level === 2 || (selectedNode.level === 1 && selectedNode.data.subgroup)) && !selectedNode.data.sub_subgroup) ? !formData.sub_subgroup.trim() :
                                            true
                                        )}
                                        className={`w-full py-2.5 px-4 rounded font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 text-sm ${selectedNode && (
                                            (selectedNode.level === 0 && formData.group.trim()) || 
                                            (selectedNode.level === 1 && !selectedNode.data.subgroup && formData.subgroup.trim()) ||
                                            ((selectedNode.level === 2 || (selectedNode.level === 1 && selectedNode.data.subgroup)) && formData.sub_subgroup.trim())
                                        )
                                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer focus:ring-indigo-500'
                                            : selectedNode
                                                ? 'bg-gray-300 text-gray-700 hover:bg-gray-400 cursor-pointer focus:ring-gray-400'
                                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                            }`}
                                    >
                                        {selectedNode ? (selectedNode.level === 0 ? "Create Group" : selectedNode.level === 1 ? "Create Subgroup" : "Create Item") : "Create"}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};


