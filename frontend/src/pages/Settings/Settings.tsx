import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { CompanyDetails } from '../../types';
import { apiService, masterApiService, AxiosRequestConfig } from '../../services';
import { getUserTypeFromToken } from '../../services/jwtUtils';
import { getAccessToken } from '../../services/authService';
import { usePermissions } from '../../hooks/usePermissions';
import { useTheme } from '../../context/ThemeContext';
import { useSubscriptionUsage } from '../../hooks/useSubscriptionUsage';
import Icon from '../../components/Icon';
import { showSuccess, showError } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';

interface SettingsPageProps {
  companyDetails: CompanyDetails;
  onSave: (details: CompanyDetails) => void;
  tenantId?: string; // Optional tenantId for Master Admin mode
}


const SettingsPage: React.FC<SettingsPageProps> = ({ companyDetails, onSave, tenantId }) => {
  const { theme, toggleTheme } = useTheme();
  const { hasTabAccess, isSuperuser } = usePermissions();
  const userType = getUserTypeFromToken(getAccessToken());
  const isMaster = userType === 'master';

  const allTabs = isMaster 
    ? ['Company Profile', 'Tax Settings', 'Regional Settings']
    : ['Company Profile', 'Tax Settings', 'Regional Settings', 'Subscription'];

  const availableTabs = useMemo(() => {
    return isSuperuser ? allTabs : allTabs.filter(tab => tab === 'Subscription' || hasTabAccess('Settings', tab));
  }, [hasTabAccess, isSuperuser, isMaster]); // added isMaster dependency just in case

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && allTabs.includes(tabParam)) {
      return tabParam;
    }
    return availableTabs.length > 0 ? availableTabs[0] : 'Company Profile';
  });
  const { subscriptionUsage, refetch: refetchUsage } = useSubscriptionUsage();
  const [isUpgrading, setIsUpgrading] = useState(false);

  const handleUpgrade = async (plan: string) => {
    try {
      setIsUpgrading(true);
      // In a real app, this would redirect to a payment gateway.
      // For now, we'll simulate an upgrade by updating the user's plan.
      // Assuming apiService has a method or we use direct put.
      await apiService.updateSubscriptionPlan(plan);

      // Update storage and reload
      sessionStorage.setItem('userPlan', plan);
      localStorage.removeItem('userPlan');

      // Refresh usage
      await refetchUsage();

      showSuccess(`Successfully upgraded to ${plan} plan!`);
      // Use setTimeout to allow toast to be seen before reload
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      handleApiError(error, 'Upgrade Failed');
    } finally {
      setIsUpgrading(false);
    }
  };

  useEffect(() => {
    if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
      setActiveTab(availableTabs[0]);
    }
  }, [availableTabs, activeTab]);
  const [details, setDetails] = useState<CompanyDetails>(companyDetails);
  const [isSaved, setIsSaved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load existing company settings from database
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        let existingSettings;
        
        if (isMaster) {
          if (tenantId && tenantId !== 'all') {
            existingSettings = await masterApiService.getBranchSettings(tenantId);
          } else {
            existingSettings = await masterApiService.getSettings();
          }
        } else {
          const options: AxiosRequestConfig = tenantId ? {
            headers: { 'X-Tenant-ID': tenantId === 'all' ? '' : tenantId }
          } : {};
          existingSettings = await apiService.getCompanyDetails(options);
        }

        if (existingSettings && Object.keys(existingSettings).length > 0) {
          // Use existing settings from database but fill missing email/phone from signup if still missing
          const signupCompanyName = sessionStorage.getItem('companyName') || localStorage.getItem('companyName') || '';
          const signupEmail = sessionStorage.getItem('signupEmail') || localStorage.getItem('signupEmail') || '';

          setDetails({
            ...existingSettings,
            name: existingSettings.name || (isMaster ? existingSettings.username : signupCompanyName),
            email: existingSettings.email || signupEmail,
          });
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [tenantId, isMaster]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDetails({
      ...details,
      [name]: value
    });
  };

  const handleEnter = (e: React.KeyboardEvent, nextId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById(nextId)?.focus();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isMaster) {
        if (tenantId && tenantId !== 'all') {
          await masterApiService.updateBranchSettings(tenantId, details);
        } else {
          await masterApiService.updateSettings(details);
        }
      } else {
        const options: AxiosRequestConfig = tenantId ? {
          headers: { 'X-Tenant-ID': tenantId === 'all' ? '' : tenantId }
        } : {};
        if (logoFile) {
          await apiService.saveCompanyDetails({ ...details, logoFile }, options);
        } else {
          await apiService.saveCompanyDetails(details, options);
        }
      }
      onSave(details);
      setIsSaved(true);
      setIsEditMode(false);
      setTimeout(() => setIsSaved(false), 3000);
    } catch (error) {
      handleApiError(error, 'Save Settings');
    }
  };

  const handleEdit = () => {
    setIsEditMode(true);
  };

  const handleCancel = () => {
    setIsEditMode(false);
    // Reload original settings
    window.location.reload();
  };



  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="erp-section-title flex items-center justify-between">
        <div>
          <h1 className="page-title">{isMaster ? (tenantId && tenantId !== 'all' ? `Entity Configuration: ${details.name || ''}` : 'Master Profile Settings') : 'System Settings'}</h1>
          <p className="helper-text mb-0">{isMaster ? (tenantId && tenantId !== 'all' ? 'Modify company-specific metadata and defaults' : 'Manage your administrator account') : 'Configure your company profile and preferences'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="helper-text">Dark Mode</span>
          <button
            onClick={toggleTheme}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-[22px]' : 'translate-x-1'
                }`}
            />
          </button>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="erp-tab-container">
        {availableTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`erp-tab ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Company Profile' && (
        <div className="erp-container">
          <div className="space-y-10">
            {/* Company Information Section */}
            <div>
              <h2 className="section-title mb-6 pb-2 border-b border-slate-100">
                Company Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label-text">
                    Company Name
                  </label>
                  <input
                    id="sett-name"
                    type="text"
                    name="name"
                    value={details.name || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-address')}
                    disabled={!isEditMode}
                    className="erp-input"
                  />
                </div>
                <div>
                  <label className="label-text">
                    Company Logo
                  </label>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    disabled={!isEditMode}
                    accept="image/*"
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-[4px] file:border-0 file:text-sm file:font-semibold file:bg-indigo-50/50 file:text-slate-700 hover:file:bg-indigo-100"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="label-text">
                    Address
                  </label>
                  <textarea
                    id="sett-address"
                    name="address"
                    rows={4}
                    value={details.address || ''}
                    onChange={handleChange}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        handleEnter(e, 'sett-email');
                      }
                    }}
                    className="erp-input resize-none"
                    placeholder="Enter company address"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information Section */}
            <div>
              <h2 className="section-title mb-6 pb-2 border-b border-slate-100">
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="label-text">
                    Email
                  </label>
                  <input
                    id="sett-email"
                    type="email"
                    name="email"
                    value={details.email || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-phone')}
                    disabled={!isEditMode}
                    className="erp-input"
                    placeholder="company@example.com"
                  />
                </div>
                <div>
                  <label className="label-text">
                    Phone
                  </label>
                  <input
                    id="sett-phone"
                    type="tel"
                    name="phone"
                    value={details.phone || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-website')}
                    className="erp-input"
                    placeholder="+91 9876543210"
                  />
                </div>
                <div>
                  <label className="label-text">
                    Website
                  </label>
                  <input
                    id="sett-website"
                    type="url"
                    name="website"
                    value={details.website || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-gstin')}
                    className="erp-input"
                    placeholder="https://www.company.com"
                  />
                </div>
              </div>
            </div>

            {/* Tax & Legal Information Section */}
            <div>
              <h2 className="section-title mb-6 pb-2 border-b border-slate-100">
                Tax & Legal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label-text">
                    GSTIN
                  </label>
                  <input
                    id="sett-gstin"
                    type="text"
                    name="gstin"
                    value={details.gstin || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-state')}
                    className="erp-input"
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div>
                  <label className="label-text">
                    State
                  </label>
                  <input
                    id="sett-state"
                    type="text"
                    name="state"
                    value={details.state || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-pan')}
                    className="erp-input"
                    placeholder="Enter state"
                    disabled={!isEditMode}
                  />
                </div>
                <div>
                  <label className="label-text">
                    PAN
                  </label>
                  <input
                    id="sett-pan"
                    type="text"
                    name="pan"
                    value={details.pan || ''}
                    onChange={handleChange}
                    onKeyDown={e => handleEnter(e, 'sett-cin')}
                    className="erp-input"
                    placeholder="AAAAA0000A"
                  />
                </div>
                <div>
                  <label className="label-text">
                    CIN
                  </label>
                  <input
                    id="sett-cin"
                    type="text"
                    name="cin"
                    value={details.cin || ''}
                    onChange={handleChange}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    className="erp-input"
                    placeholder="U12345MH2020PLC123456"
                  />
                </div>
              </div>
            </div>


          </div>

          {/* Action Buttons */}
          <div className="mt-10 pt-6 border-t border-slate-100">
            <div className="flex justify-end gap-3">
              {isSaved && (
                <div className="mr-4 flex items-center helper-text text-green-600 font-semibold">
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Settings saved successfully!
                </div>
              )}

              <button
                type="button"
                onClick={handleEdit}
                disabled={isEditMode}
                className="erp-button-secondary"
              >
                Edit Settings
              </button>

              <button
                type="submit"
                onClick={handleSubmit}
                className="erp-button-primary px-8"
              >
                Save
              </button>

              {isEditMode && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="erp-button-secondary"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Tax Settings' && (
        <div className="erp-container p-8 text-center">
          <h2 className="section-title mb-4">Tax Settings</h2>
          <p className="helper-text">Tax configuration options will be available soon.</p>
        </div>
      )}

      {activeTab === 'Regional Settings' && (
        <div className="erp-container p-8 text-center">
          <h2 className="section-title mb-4">Regional Settings</h2>
          <p className="helper-text">Regional and language settings will be available soon.</p>
        </div>
      )}

      {activeTab === 'Subscription' && (
        <div className="space-y-8">
          {/* Current Usage Card */}
          <div className="erp-card p-8">
            <h2 className="section-title mb-6 pb-2 border-b border-gray-200">
              Subscription Status
            </h2>
            {subscriptionUsage ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="p-6 bg-slate-50 rounded-lg">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current Plan</p>
                  <p className="text-2xl font-bold text-indigo-600">{subscriptionUsage.plan}</p>
                  <p className="text-xs text-slate-500 mt-2">Next Renewal: {new Date(new Date(subscriptionUsage.cycle_start).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
                </div>
                <div className="p-6 bg-slate-50 rounded-lg col-span-2">
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Usage Progress</p>
                    <p className="text-sm font-bold text-slate-700">{subscriptionUsage.used} / {subscriptionUsage.limit}</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full ${subscriptionUsage.limit !== 'Unlimited' && subscriptionUsage.used >= (subscriptionUsage.limit as number)
                        ? 'bg-red-500'
                        : 'bg-indigo-600'
                        }`}
                      style={{
                        width: `${subscriptionUsage.limit === 'Unlimited'
                          ? 100
                          : Math.min(100, (subscriptionUsage.used / (subscriptionUsage.limit as number)) * 100)}%`
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">
                    {subscriptionUsage.limit === 'Unlimited'
                      ? "You have unlimited invoice uploads."
                      : `You have ${subscriptionUsage.remaining} uploads remaining this cycle.`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500">Loading usage data...</div>
            )}
          </div>

          {/* Plan Options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Free Plan */}
            <div className={`erp-card p-8 flex flex-col ${subscriptionUsage?.plan === 'FREE' ? 'ring-2 ring-indigo-600' : ''}`}>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Free</h3>
                <p className="text-slate-500 text-sm">For micro businesses</p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">₹0</span>
                <span className="text-slate-500 text-sm">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Up to 5 invoices per month
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Basic AI assistance
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Email support
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Standard templates
                </li>
              </ul>
              <button
                disabled={subscriptionUsage?.plan === 'FREE' || isUpgrading}
                onClick={() => handleUpgrade('FREE')}
                className={`w-full py-3 rounded-[4px] font-bold text-sm transition-all ${subscriptionUsage?.plan === 'FREE'
                  ? 'bg-slate-100 text-slate-400 cursor-default'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
              >
                {subscriptionUsage?.plan === 'FREE' ? 'Current Plan' : 'Downgrade'}
              </button>
            </div>

            {/* Starter Plan */}
            <div className={`erp-card p-8 flex flex-col relative ${subscriptionUsage?.plan === 'STARTER' ? 'ring-2 ring-indigo-600' : ''}`}>
              <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">Popular</div>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Starter</h3>
                <p className="text-slate-500 text-sm">For growing startups</p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">₹1,200</span>
                <span className="text-slate-500 text-sm">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Up to 100 invoices per month
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Advanced AI processing
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Priority email support
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Custom templates
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Basic reporting
                </li>
              </ul>
              <button
                disabled={subscriptionUsage?.plan === 'STARTER' || isUpgrading}
                onClick={() => handleUpgrade('STARTER')}
                className={`w-full py-3 rounded-[4px] font-bold text-sm transition-all ${subscriptionUsage?.plan === 'STARTER'
                  ? 'bg-slate-100 text-slate-400 cursor-default'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }`}
              >
                {subscriptionUsage?.plan === 'STARTER' ? 'Current Plan' : (subscriptionUsage?.plan === 'PRO' ? 'Downgrade' : 'Upgrade')}
              </button>
            </div>

            {/* Pro Plan */}
            <div className={`erp-card p-8 flex flex-col ${subscriptionUsage?.plan === 'PRO' ? 'ring-2 ring-indigo-600' : ''}`}>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Pro</h3>
                <p className="text-slate-500 text-sm">For enterprises</p>
              </div>
              <div className="mb-8">
                <span className="text-4xl font-bold text-slate-900">₹5,000</span>
                <span className="text-slate-500 text-sm">/mo</span>
              </div>
              <ul className="space-y-4 mb-10 flex-1">
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Unlimited invoices
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Premium AI features
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Phone & email support
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Advanced reporting
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  API access
                </li>
                <li className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                  <svg className="w-5 h-5 text-indigo-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Multi-user access
                </li>
              </ul>
              <button
                disabled={subscriptionUsage?.plan === 'PRO' || isUpgrading}
                onClick={() => handleUpgrade('PRO')}
                className={`w-full py-3 rounded-[4px] font-bold text-sm transition-all shadow-none border border-slate-200-none border border-slate-200 ${subscriptionUsage?.plan === 'PRO'
                  ? 'bg-slate-100 text-slate-400 cursor-default'
                  : 'bg-slate-900 text-white hover:bg-black'
                  }`}
              >
                {subscriptionUsage?.plan === 'PRO' ? 'Current Plan' : 'Upgrade to Pro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;


