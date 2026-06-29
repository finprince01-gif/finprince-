/**
 * ============================================================================
 * SERVICE PAGE COMPONENT (Service.tsx)
 * ============================================================================
 * Service management page - handles service management and operations.
 * 
 * FEATURES:
 * - Service Group management
 * - Service List management
 * - Tab-based navigation between Service Group and Service List
 * 
 * FOR NEW DEVELOPERS:
 * - This component uses tabs to switch between Service Group and Service List
 * - Add your service-related logic and components here
 */

import finpixeLogo from '../../assets/finpixe with empty bg.png';
import React, { useState, useEffect } from 'react';
import Icon from '../../components/Icon';
import { httpClient } from '../../services/httpClient';
import { usePermissions } from '../../hooks/usePermissions';
import { showSuccess, showError, showWarning } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';
import { SERVICE_UOM_LIST } from '../../constants/serviceConstants';

type ServiceTab = 'service-group' | 'service-list';

interface ServiceGroup {
  id: number;
  category: string;
  group: string | null;
  subgroup: string | null;
  is_active: boolean;
}

interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
  level: number;
  isSystem: boolean;
  data: {
    category: string;
    group: string | null;
    subgroup: string | null;
  };
}

interface ServicePageProps {
  // Add props as needed
}

const DEFAULT_SYSTEM_CATEGORIES = [
  'Professional Services',
  'Technical Support',
  'Consulting',
  'Development',
  'Maintenance'
];

const DEFAULT_GROUPS = ['Direct', 'Indirect'];

// UOM Master Data
const UOM_LIST = SERVICE_UOM_LIST;


const GST_RATES = [0, 5, 12, 18, 28];

/**
 * Service Page Component with Tabs
 */
const ServicePage: React.FC<ServicePageProps> = () => {
  const { hasTabAccess, isSuperuser } = usePermissions();

  const allServiceTabs = [
    { id: 'service-group', label: 'SERVICE GROUP', perm: 'Service Group' },
    { id: 'service-list', label: 'SERVICE LIST', perm: 'Service List' }
  ] as const;

  const availableTabs = isSuperuser
    ? allServiceTabs
    : allServiceTabs.filter(tab => hasTabAccess('Service', tab.perm));

  const [activeTab, setActiveTab] = useState<ServiceTab>(availableTabs.length > 0 ? availableTabs[0].id : 'service-group');

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.find(t => t.id === activeTab)) {
      setActiveTab(availableTabs[0].id);
    }
  }, [availableTabs, activeTab]);
  const [services, setServices] = useState<any[]>([
    {
      id: 1,
      serviceCode: 'SRV-001',
      serviceName: 'Consulting Service',
      serviceGroup: 'Professional Services',
      sacCode: '9983',
      gstRate: 18,
      uom: 'HRS',
      description: 'Professional consulting services for business solutions'
    },
    {
      id: 2,
      serviceCode: 'SRV-002',
      serviceName: 'Software Development',
      serviceGroup: 'Development',
      sacCode: '9983',
      gstRate: 18,
      uom: 'HRS',
      description: 'Custom software development and coding services'
    },
    {
      id: 3,
      serviceCode: 'SRV-003',
      serviceName: 'Technical Support',
      serviceGroup: 'Technical Support',
      sacCode: '9983',
      gstRate: 12,
      uom: 'HRS',
      description: '24/7 technical support and maintenance services'
    },
    {
      id: 4,
      serviceCode: 'SRV-004',
      serviceName: 'System Maintenance',
      serviceGroup: 'Maintenance',
      sacCode: '9983',
      gstRate: 5,
      uom: 'MTH',
      description: 'Monthly system maintenance and updates'
    },
    {
      id: 5,
      serviceCode: 'SRV-005',
      serviceName: 'Training Program',
      serviceGroup: 'Professional Services',
      sacCode: '9983',
      gstRate: 0,
      uom: 'DAY',
      description: 'Employee training and skill development programs'
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [serviceGroups, setServiceGroups] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);

  // Create Service Form State
  const [createFormData, setCreateFormData] = useState({
    serviceName: '',
    serviceGroup: '',
    serviceCode: '',
    uom: '',
    sacCode: '',
    gstRate: 18,
    description: '',
    expenseLedger: ''
  });

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // View/Edit/Delete State
  const [selectedService, setSelectedService] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editFormData, setEditFormData] = useState({
    serviceName: '',
    serviceGroup: '',
    serviceCode: '',
    uom: '',
    sacCode: '',
    gstRate: 18,
    description: '',
    expenseLedger: ''
  });

  // Service Group Tab State
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [apiData, setApiData] = useState<ServiceGroup[]>([]);

  const [formData, setFormData] = useState({
    category: '',
    group: '',
    subgroup: ''
  });

  // Fetch service groups, ledgers, and services on mount
  useEffect(() => {
    fetchServiceGroups();
    fetchLedgers();
    fetchServices();
  }, []);

  // Rebuild tree when apiData changes
  useEffect(() => {
    buildTree(apiData);
  }, [apiData]);

  const fetchServiceGroups = async () => {
    setLoading(true);
    try {

      const response = await httpClient.get<ServiceGroup[]>('/api/services/groups/');

      if (response && Array.isArray(response)) {

        setApiData(response);
      } else {

      }
    } catch (error) {
      handleApiError(error, 'Fetch Service Groups');
      setApiData([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLedgers = async () => {
    try {
      const response = await httpClient.get('/api/masters/ledgers/');
      if (response && Array.isArray(response)) {
        setLedgers(response);
      }
    } catch (error) {
      handleApiError(error, 'Fetch Ledgers');
      setLedgers([]);
    }
  };

  const fetchServices = async () => {
    setIsLoading(true);
    try {
      const response = await httpClient.get('/api/services/?is_active=true');
      if (response && Array.isArray(response)) {
        setServices(response);
      }
    } catch (error) {
      handleApiError(error, 'Fetch Services');
      setServices([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ============================================================================
  // CREATE SERVICE FORM FUNCTIONS
  // ============================================================================

  const handleOpenCreateModal = () => {
    setCreateFormData({
      serviceName: '',
      serviceGroup: '',
      serviceCode: '',
      uom: '',
      sacCode: '',
      gstRate: 18,
      description: '',
      expenseLedger: ''
    });
    setFormErrors({});
    setShowCreateForm(true);
  };

  const handleViewService = (service: any) => {
    setSelectedService(service);
    setEditFormData({
      serviceName: service.serviceName || '',
      serviceGroup: service.serviceGroup || '',
      serviceCode: service.serviceCode || '',
      uom: service.uom || '',
      sacCode: service.sacCode || '',
      gstRate: service.gstRate || 18,
      description: service.description || '',
      expenseLedger: service.expenseLedger || ''
    });
    setIsEditMode(false);
  };

  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: name === 'gstRate' ? parseInt(value) : value
    }));
  };

  const handleSaveEdit = async () => {
    if (!selectedService) return;
    try {
      const response = await httpClient.put(`/api/services/${selectedService.id}/`, editFormData);
      if (response) {
        fetchServices();
        setSelectedService(null);
        setIsEditMode(false);
      }
    } catch (error) {
      handleApiError(error, 'Update Service');
    }
  };

  const handleDeleteService = async () => {
    if (!selectedService) return;
    try {
      await httpClient.delete(`/api/services/${selectedService.id}/`);
      fetchServices();
      setSelectedService(null);
      setShowDeleteConfirm(false);
    } catch (error) {
      handleApiError(error, 'Delete Service');
    }
  };

  const handleCreateFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setCreateFormData(prev => ({
      ...prev,
      [name]: name === 'gstRate' ? parseFloat(value) || 18 : value
    }));
    // Clear error for this field when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateCreateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!createFormData.serviceName.trim()) {
      errors.serviceName = 'Service Name is required';
    }
    if (!createFormData.serviceGroup.trim()) {
      errors.serviceGroup = 'Service Group is required';
    }
    if (!createFormData.serviceCode.trim()) {
      errors.serviceCode = 'Service Code is required';
    }
    if (!createFormData.sacCode.trim()) {
      errors.sacCode = 'SAC Code is required';
    }
    if (!createFormData.expenseLedger.trim()) {
      errors.expenseLedger = 'Expense Ledger is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveCreateService = async () => {
    if (!validateCreateForm()) {
      return;
    }

    try {
      await httpClient.post('/api/services/', {
        serviceName: createFormData.serviceName,
        serviceGroup: createFormData.serviceGroup,
        serviceCode: createFormData.serviceCode,
        uom: createFormData.uom || null,
        sacCode: createFormData.sacCode,
        gstRate: createFormData.gstRate,
        description: createFormData.description || null,
        expenseLedger: createFormData.expenseLedger
      });
      showSuccess('Service created successfully');
      setShowCreateForm(false);
      // Refresh services list
      fetchServices();
    } catch (error: any) {
      handleApiError(error, 'Create Service');
    }
  };

  const buildTree = (data: ServiceGroup[]) => {
    const rootMap = new Map<string, TreeNode>();

    // Initialize System Categories with Direct/Indirect groups
    DEFAULT_SYSTEM_CATEGORIES.forEach(catName => {
      const categoryNode: TreeNode = {
        id: `root-${catName}`,
        name: catName,
        children: [],
        level: 0,
        isSystem: true,
        data: { category: catName, group: null, subgroup: null }
      };

      // Add Direct and Indirect as default groups
      DEFAULT_GROUPS.forEach(groupName => {
        const groupNode: TreeNode = {
          id: `group-${catName}-${groupName}`,
          name: groupName,
          children: [],
          level: 1,
          isSystem: true,
          data: { category: catName, group: groupName, subgroup: null }
        };
        categoryNode.children.push(groupNode);
      });

      rootMap.set(`root-${catName}`, categoryNode);
    });

    // 4. Add API data (ensure categories exist and add subgroups)
    data.forEach(item => {
      if (!item.category || !item.category.trim()) return;

      const categoryKey = `root-${item.category}`;
      let categoryNode = rootMap.get(categoryKey);

      // If category doesn't exist, create it with default groups
      if (!categoryNode) {
        categoryNode = {
          id: categoryKey,
          name: item.category,
          children: [],
          level: 0,
          isSystem: false,
          data: { category: item.category, group: null, subgroup: null }
        };

        DEFAULT_GROUPS.forEach(groupName => {
          categoryNode!.children.push({
            id: `group-${item.category}-${groupName}`,
            name: groupName,
            children: [],
            level: 1,
            isSystem: false,
            data: { category: item.category, group: groupName, subgroup: null }
          });
        });
        rootMap.set(categoryKey, categoryNode);
      }

      // If there's a group and a subgroup, add the subgroup node
      if (item.group && item.subgroup) {
        const groupNode = categoryNode.children.find(child => child.name === item.group);
        if (groupNode) {
          // Check if subgroup already exists to avoid duplicates
          const subgroupKey = `subgroup-${item.category}-${item.group}-${item.subgroup}`;
          if (!groupNode.children.find(child => child.id === subgroupKey)) {
            groupNode.children.push({
              id: subgroupKey,
              name: item.subgroup,
              children: [],
              level: 2,
              isSystem: false,
              data: { category: item.category, group: item.group, subgroup: item.subgroup }
            });
          }
        }
      }
    });

    setTreeData(Array.from(rootMap.values()));
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const handleNodeSelect = (node: TreeNode) => {
    setSelectedNode(node);
    setFormData({
      category: node.data.category,
      group: node.data.group || '',
      subgroup: ''
    });
  };

  const handleSubgroupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, subgroup: e.target.value }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!selectedNode) {
      showWarning('Please select a category from the left');
      return;
    }

    // Level 0 = category selected → must pick Direct or Indirect
    if (selectedNode.level === 0 && !formData.group) {
      showWarning('Please select Direct or Indirect');
      return;
    }

    // Level 1 = Direct/Indirect selected → must enter subgroup name
    if (selectedNode.level === 1 && !formData.subgroup.trim()) {
      showWarning('Please enter a Subgroup Name');
      return;
    }

    try {
      let payload;
      if (selectedNode.level === 0) {
        // Creating a group (Direct/Indirect) under a category
        payload = {
          category: formData.category,
          group: formData.group,
          subgroup: ''
        };
      } else {
        // Creating a subgroup under Direct/Indirect
        payload = {
          category: formData.category,
          group: formData.group,
          subgroup: formData.subgroup.trim()
        };
      }

      await httpClient.post('/api/services/groups/', payload);
      setFormData(prev => ({ ...prev, group: selectedNode.level === 0 ? '' : prev.group, subgroup: '' }));
      await fetchServiceGroups();
      showSuccess('Service Group created successfully!');
    } catch (error: any) {
      const errorMsg = error.toString();
      if (
        errorMsg.includes('Duplicate') ||
        errorMsg.includes('IntegrityError') ||
        errorMsg.includes('already exists')
      ) {
        showSuccess('Service Group already exists!');
        setFormData(prev => ({ ...prev, subgroup: '' }));
        fetchServiceGroups();
      } else {
        handleApiError(error, 'Create Service Group');
      }
    }
  };

  const renderTree = (nodes: TreeNode[]): React.ReactElement[] => {
    return nodes.map(node => {
      const isExpanded = expandedNodes.has(node.id);
      const hasChildren = node.children.length > 0;
      const isSelected = selectedNode?.id === node.id;

      return (
        <div key={node.id} style={{ marginLeft: `${node.level * 20}px` }}>
          <div
            className={`flex items-center py-1.5 px-2 cursor-pointer hover:bg-gray-100 rounded transition-colors ${isSelected ? 'bg-indigo-50 text-slate-700 font-medium border-l-2 border-indigo-500' : ''
              }`}
            onClick={() => handleNodeSelect(node)}
            onDoubleClick={() => {
              if (hasChildren || node.level < 2) {
                toggleNode(node.id);
              }
            }}
          >
            {hasChildren ? (
              <span
                className="mr-1 text-gray-500 text-xs font-bold select-none w-4 text-center hover:text-gray-700"
                onClick={e => {
                  e.stopPropagation();
                  toggleNode(node.id);
                }}
              >
                {isExpanded ? '−' : '+'}
              </span>
            ) : (
              <span className="mr-1 text-xs w-4 text-center text-gray-400">•</span>
            )}

            <span className="text-sm select-none truncate">{node.name}</span>
          </div>
          {hasChildren && isExpanded && <div>{renderTree(node.children)}</div>}
        </div>
      );
    });
  };

  return (
    <div className="space-y-8">
      <div className="erp-section-title">
        <div>
          <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-white border border-[#E0E2FF] shadow-[0_8px_16px_rgba(75,60,255,0.08)] flex items-center justify-center overflow-hidden shrink-0">
            <img src={finpixeLogo} alt="Finpixe logo" className="w-9 h-9 object-contain drop-shadow-sm" />
          </div>
          <div>
<h1 className="page-title">Services</h1>
          <p className="helper-text">Operations and service management</p>
                  </div>
        </div></div>
      </div>

      {/* Main Tabs */}
      <div className="erp-tab-container">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`erp-tab ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Service Group Tab */}
      {activeTab === 'service-group' && (
        <div className="bg-white rounded-[4px] erp-card min-h-[500px] flex flex-col">
          <div className="px-6 pt-4 pb-3 flex items-center gap-2">
            <Icon name="tag" className="w-5 h-5 text-gray-600" />
            <h3 className="section-title">Create Service Group</h3>
          </div>

          <div className="flex flex-col md:flex-row gap-5 px-6 pb-6 flex-1 min-h-0">
            {/* Left Panel: Service Group Tree */}
            <div className="w-full md:w-1/2 bg-white rounded-[4px] border border-gray-200 flex flex-col">
              <div className="p-4 border-b border-gray-200">
                <h3 className="section-title text-sm">Select Category</h3>
                <p className="helper-text mt-0.5">
                  Single click to select level. Double click to expand/collapse categories.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {loading ? (
                  <div className="text-center py-8 text-gray-400 text-sm">Loading hierarchy...</div>
                ) : (
                  renderTree(treeData)
                )}
              </div>
            </div>

            {/* Right Panel: Service Group Creation Form */}
            <div className="w-full md:w-1/2 bg-white rounded-[4px] border border-gray-200">
              <div className="p-5">
                <h3 className="section-title text-sm mb-6">Service Group Preview</h3>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-5">
                    {/* Category Display */}
                    <div>
                      <label className="label-text">
                        CATEGORY
                      </label>
                      {selectedNode ? (
                        <div className="text-gray-900 font-semibold text-base">
                          {formData.category}
                        </div>
                      ) : (
                        <div className="text-gray-400 font-normal text-sm italic">
                          Select a category from the left
                        </div>
                      )}
                    </div>

                    {/* GROUP: show buttons if level 0, show text if level 1 */}
                    <div>
                      <label className="label-text">
                        GROUP
                      </label>
                      {selectedNode && selectedNode.level === 1 ? (
                        // Level 1 selected: show which group (Direct/Indirect) as read-only text
                        <div className="text-gray-900 font-semibold text-base">{formData.group}</div>
                      ) : (
                        // Level 0 selected or nothing: show Direct/Indirect toggle buttons
                        <div className="flex gap-3">
                          {DEFAULT_GROUPS.map(grp => (
                            <button
                              key={grp}
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, group: grp }))}
                              className={`flex-1 py-2 px-4 rounded border text-sm font-medium transition-colors ${formData.group === grp
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-gray-700 border-slate-300 hover:border-indigo-400'
                                }`}
                            >
                              {grp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* SUBGROUP: only show when level 1 (Direct/Indirect) is selected */}
                    {selectedNode && selectedNode.level === 1 && (
                      <div>
                        <label className="label-text">
                          SUBGROUP
                        </label>
                        <input
                          type="text"
                          value={formData.subgroup}
                          onChange={handleSubgroupChange}
                          className="w-full px-3 py-2 border border-slate-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder-gray-400 bg-white text-gray-800 text-sm"
                          placeholder="Enter Subgroup Name"
                          autoFocus
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={
                      !selectedNode ||
                      (selectedNode.level === 0 && !formData.group) ||
                      (selectedNode.level === 1 && !formData.subgroup.trim())
                    }
                    className={`w-full py-2.5 px-4 rounded-[4px] font-medium transition-colors ${!selectedNode ||
                      (selectedNode.level === 0 && !formData.group) ||
                      (selectedNode.level === 1 && !formData.subgroup.trim())
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                  >
                    CREATE SERVICE GROUP
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service List Tab */}
      {activeTab === 'service-list' && !showCreateForm && !selectedService && (
        <div className="bg-white rounded-[4px] erp-card min-h-[500px] p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="section-title">Service List</h2>
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 transition-colors font-medium"
            >
              + Add New Service Item
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-[4px] h-8 w-8 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <div className="bg-white rounded-[4px] border border-slate-200 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Service Code</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Service Name</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Service Group</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">SAC Code</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">GST Rate</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">UOM</th>
                    <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {services.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center">
                        <p className="text-gray-600">No services found. Create one to get started.</p>
                      </td>
                    </tr>
                  ) : (
                    services.map((service, index) => (
                      <tr key={index} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-800">{service.serviceCode || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{service.serviceName || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{service.serviceGroup || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{service.sacCode || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{service.gstRate ? `${service.gstRate}%` : '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-800">{service.uom || '-'}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => handleViewService(service)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create New Service List Form Page */}
      {activeTab === 'service-list' && showCreateForm && (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setShowCreateForm(false)}
              className="text-gray-600 hover:text-gray-800 text-lg"
            >
              ← Back to overview
            </button>
          </div>

          <div className="bg-white rounded-[4px] border border-slate-200 p-8">
            <h2 className="section-title mb-8">Create New Service List</h2>

            <div className="space-y-6 max-w-4xl">
              {/* Service Name */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Service Name *</label>
                <input
                  type="text"
                  name="serviceName"
                  value={createFormData.serviceName}
                  onChange={handleCreateFormChange}
                  placeholder="Enter service name"
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.serviceName ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {formErrors.serviceName && (
                  <p className="text-red-500 text-xs col-span-3">{formErrors.serviceName}</p>
                )}
              </div>

              {/* Service Group */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Service Group *</label>
                <select
                  name="serviceGroup"
                  value={createFormData.serviceGroup}
                  onChange={handleCreateFormChange}
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.serviceGroup ? 'border-red-500' : 'border-gray-300'
                    }`}
                >
                  <option value="">Select service group</option>
                  {/* System Categories */}
                  {DEFAULT_SYSTEM_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  {/* API Loaded Groups/Subgroups */}
                  {apiData.map(group => {
                    const label = [group.category, group.group, group.subgroup].filter(Boolean).join(' > ');
                    return (
                      <option key={group.id} value={label}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                {formErrors.serviceGroup && (
                  <p className="text-red-500 text-xs col-span-3">{formErrors.serviceGroup}</p>
                )}
              </div>

              {/* Service Code */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Service Code *</label>
                <input
                  type="text"
                  name="serviceCode"
                  value={createFormData.serviceCode}
                  onChange={handleCreateFormChange}
                  placeholder="Enter service code"
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.serviceCode ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {formErrors.serviceCode && (
                  <p className="text-red-500 text-xs col-span-3">{formErrors.serviceCode}</p>
                )}
              </div>

              {/* UOM and GST Rate */}
              {/* GST Rate */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">GST Rate *</label>
                <select
                  name="gstRate"
                  value={createFormData.gstRate}
                  onChange={handleCreateFormChange}
                  className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {GST_RATES.map(rate => (
                    <option key={rate} value={rate}>
                      {rate}%
                    </option>
                  ))}
                </select>
              </div>

              {/* UOM */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">UOM</label>
                <select
                  name="uom"
                  value={createFormData.uom}
                  onChange={handleCreateFormChange}
                  className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select UOM</option>
                  {UOM_LIST.map(uom => (
                    <option key={uom.code} value={uom.code}>
                      {uom.code} - {uom.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* SAC Code */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">SAC Code *</label>
                <input
                  type="text"
                  name="sacCode"
                  value={createFormData.sacCode}
                  onChange={handleCreateFormChange}
                  placeholder="Enter SAC code"
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.sacCode ? 'border-red-500' : 'border-gray-300'
                    }`}
                />
                {formErrors.sacCode && (
                  <p className="text-red-500 text-xs col-span-3">{formErrors.sacCode}</p>
                )}
              </div>

              {/* Description */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                  name="description"
                  value={createFormData.description}
                  onChange={handleCreateFormChange}
                  placeholder="Enter description (optional)"
                  maxLength={500}
                  rows={4}
                  className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
                <p className="text-gray-400 text-xs col-span-3">{createFormData.description.length}/500</p>
              </div>

              {/* Expense Ledger */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Expense Ledger *</label>
                <select
                  name="expenseLedger"
                  value={createFormData.expenseLedger}
                  onChange={handleCreateFormChange}
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 ${formErrors.expenseLedger ? 'border-red-500' : 'border-gray-300'
                    }`}
                >
                  <option value="">Select expense ledger</option>
                  {ledgers.map((ledger: any, index: number) => (
                    <option key={index} value={ledger.name || ledger.id}>
                      {ledger.name || `Ledger ${ledger.id}`}
                    </option>
                  ))}
                </select>
                {formErrors.expenseLedger && (
                  <p className="text-red-500 text-xs col-span-3">{formErrors.expenseLedger}</p>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-8 mt-8 border-t border-gray-200">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-6 py-2 border border-slate-200 text-gray-700 rounded-[4px] hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCreateService}
                className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium"
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View/Edit Service Item Page */}
      {activeTab === 'service-list' && selectedService && (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setSelectedService(null)}
              className="text-gray-600 hover:text-gray-800 text-lg"
            >
              ← Back to overview
            </button>
          </div>

          <div className="bg-white rounded-[4px] border border-slate-200 p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-8">
              {isEditMode ? 'Edit Service Item' : 'Service Item Details'}
            </h2>

            <div className="space-y-6 max-w-4xl">
              {/* Service Code */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Service Code</label>
                <input
                  type="text"
                  value={editFormData.serviceCode}
                  readOnly
                  className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-50 text-gray-600"
                />
              </div>

              {/* Service Name */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Service Name</label>
                <input
                  type="text"
                  name="serviceName"
                  value={editFormData.serviceName}
                  onChange={handleEditFormChange}
                  readOnly={!isEditMode}
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none ${isEditMode ? 'border-gray-300 focus:ring-2 focus:ring-indigo-500' : 'border-gray-300 bg-gray-50 text-gray-600'
                    }`}
                />
              </div>

              {/* Service Group */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Service Group</label>
                {isEditMode ? (
                  <select
                    name="serviceGroup"
                    value={editFormData.serviceGroup}
                    onChange={handleEditFormChange}
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select service group</option>
                    {DEFAULT_SYSTEM_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    {apiData.map(group => {
                      const label = [group.category, group.group, group.subgroup].filter(Boolean).join(' > ');
                      return (
                        <option key={group.id} value={label}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editFormData.serviceGroup}
                    readOnly
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-50 text-gray-600"
                  />
                )}
              </div>

              {/* SAC Code */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">SAC Code</label>
                <input
                  type="text"
                  name="sacCode"
                  value={editFormData.sacCode}
                  onChange={handleEditFormChange}
                  readOnly={!isEditMode}
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none ${isEditMode ? 'border-gray-300 focus:ring-2 focus:ring-indigo-500' : 'border-gray-300 bg-gray-50 text-gray-600'
                    }`}
                />
              </div>

              {/* GST Rate */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">GST Rate</label>
                {isEditMode ? (
                  <select
                    name="gstRate"
                    value={editFormData.gstRate}
                    onChange={handleEditFormChange}
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {GST_RATES.map(rate => (
                      <option key={rate} value={rate}>
                        {rate}%
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={`${editFormData.gstRate}%`}
                    readOnly
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-50 text-gray-600"
                  />
                )}
              </div>

              {/* UOM */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">UOM</label>
                {isEditMode ? (
                  <select
                    name="uom"
                    value={editFormData.uom}
                    onChange={handleEditFormChange}
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select UOM</option>
                    {UOM_LIST.map(uom => (
                      <option key={uom.code} value={uom.code}>
                        {uom.code} - {uom.description}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editFormData.uom}
                    readOnly
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-50 text-gray-600"
                  />
                )}
              </div>

              {/* Description */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Description</label>
                <textarea
                  name="description"
                  value={editFormData.description}
                  onChange={handleEditFormChange}
                  readOnly={!isEditMode}
                  rows={4}
                  className={`col-span-2 px-4 py-2 border rounded-[4px] focus:outline-none resize-none ${isEditMode ? 'border-gray-300 focus:ring-2 focus:ring-indigo-500' : 'border-gray-300 bg-gray-50 text-gray-600'
                    }`}
                />
              </div>

              {/* Expense Ledger */}
              <div className="grid grid-cols-3 gap-6 items-start">
                <label className="text-sm font-medium text-gray-700">Expense Ledger</label>
                {isEditMode ? (
                  <select
                    name="expenseLedger"
                    value={editFormData.expenseLedger}
                    onChange={handleEditFormChange}
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select expense ledger</option>
                    {ledgers.map((ledger: any, index: number) => (
                      <option key={index} value={ledger.name || ledger.id}>
                        {ledger.name || `Ledger ${ledger.id}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editFormData.expenseLedger}
                    readOnly
                    className="col-span-2 px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-50 text-gray-600"
                  />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3 pt-8 mt-8 border-t border-gray-200">
              {!isEditMode && (
                <>
                  <button
                    onClick={() => setSelectedService(null)}
                    className="px-6 py-2 border border-slate-200 text-gray-700 rounded-[4px] hover:bg-gray-50 font-medium"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-6 py-2 bg-red-600 text-white rounded-[4px] hover:bg-red-700 font-medium"
                  >
                    Delete
                  </button>
                </>
              )}
              {isEditMode && (
                <>
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="px-6 py-2 border border-slate-200 text-gray-700 rounded-[4px] hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium"
                  >
                    Save
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="erp-card p-6 max-w-sm w-full mx-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Delete Service Item?</h3>
                <p className="text-gray-600 mb-6">Are you sure you want to delete this service item? This action cannot be undone.</p>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-4 py-2 border border-slate-200 text-gray-700 rounded-[4px] hover:bg-gray-50 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteService}
                    className="px-4 py-2 bg-red-600 text-white rounded-[4px] hover:bg-red-700 font-medium"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ServicePage;

