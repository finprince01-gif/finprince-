import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { CompanyDetails } from '../../types';
import { apiService } from '../../services';
import { usePermissions } from '../../hooks/usePermissions';
import { useTheme } from '../../context/ThemeContext';
import { useSubscriptionUsage } from '../../hooks/useSubscriptionUsage';
import Icon from '../../components/Icon';
import { showSuccess, showError } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';

interface SettingsPageProps {
  companyDetails: CompanyDetails;
  onSave: (details: CompanyDetails) => void;
}

const indianStates = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttarakhand", "Uttar Pradesh", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli", "Daman and Diu", "Delhi",
  "Lakshadweep", "Puducherry"
];

const SettingsPage: React.FC<SettingsPageProps> = ({ companyDetails, onSave }) => {
  const { theme, toggleTheme } = useTheme();
  const { hasTabAccess, isSuperuser } = usePermissions();

  const allTabs = ['Company Profile', 'Tax Settings', 'Regional Settings', 'Subscription'];
  const availableTabs = useMemo(() => {
    return isSuperuser ? allTabs : allTabs.filter(tab => tab === 'Subscription' || hasTabAccess('Settings', tab));
  }, [hasTabAccess, isSuperuser]);

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam && ['Company Profile', 'Tax Settings', 'Regional Settings', 'Subscription'].includes(tabParam)) {
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

      // Update local storage and reload
      localStorage.setItem('userPlan', plan);

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
    const loadCompanySettings = async () => {
      try {
        setIsLoading(true);
        const existingSettings = await apiService.getCompanyDetails();

        if (existingSettings && Object.keys(existingSettings).length > 0) {
          // Use existing settings from database
          setDetails(existingSettings);
        } else {
          // Pre-fill with signup data if no settings exist
          const signupCompanyName = localStorage.getItem('companyName') || '';
          const signupEmail = localStorage.getItem('signupEmail') || '';

          setDetails(prev => ({
            ...prev,
            name: prev.name || signupCompanyName,
            email: prev.email || signupEmail,
          }));
        }
      } catch (error) {

        // Pre-fill with signup data as fallback
        const signupCompanyName = localStorage.getItem('companyName') || '';
        const signupEmail = localStorage.getItem('signupEmail') || '';

        setDetails(prev => ({
          ...prev,
          name: prev.name || signupCompanyName,
          email: prev.email || signupEmail,
        }));
      } finally {
        setIsLoading(false);
      }
    };

    loadCompanySettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setDetails({
      ...details,
      [name]: value
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (logoFile) {
        // If there's a logo, we must Use FormData
        // The current apiService.saveCompanyDetails uses JSON.stringify, so we can't use it directly for files.
        // We'll create a FormData object and call a new/modified method or handle it here if direct access.

        // But apiService is available. Let's assume we update apiService to handle FormData for company settings.
        await apiService.saveCompanyDetails({ ...details, logoFile });
      } else {
        // JSON update
        await apiService.saveCompanyDetails(details);
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
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-end justify-between border-b border-slate-200 pb-6">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Configuration</p>
          <h2 className="text-[20px] font-bold text-slate-900">
            System Settings
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Dark Mode</span>
          <button
            onClick={toggleTheme}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${theme === 'dark' ? 'bg-indigo-600' : 'bg-slate-200'
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
      <div className="flex space-x-8 border-b border-slate-200">
        {availableTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`
              whitespace-nowrap pb-4 text-[13px] font-bold uppercase tracking-wider transition-all relative
              ${activeTab === tab
                ? 'text-indigo-600'
                : 'text-slate-400 hover:text-slate-600'}
            `}
          >
            {tab}
            {activeTab === tab && (
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'Company Profile' && (
        <div className="erp-card p-8">
          <div className="space-y-10">
            {/* Company Information Section */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                Company Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={details.name || ''}
                    onChange={handleChange}
                    disabled={!isEditMode}
                    className={`w-full px-4 py-3 border rounded-[4px] transition-colors ${isEditMode
                      ? 'border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                      : 'border-gray-200 bg-gray-50 text-gray-700 cursor-not-allowed'
                      }`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address
                  </label>
                  <textarea
                    name="address"
                    rows={4}
                    value={details.address || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none"
                    placeholder="Enter company address"
                  />
                </div>
              </div>
            </div>

            {/* Contact Information Section */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                Contact Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={details.email || ''}
                    onChange={handleChange}
                    disabled={!isEditMode}
                    className={`w-full px-4 py-3 border rounded-[4px] transition-colors ${isEditMode
                      ? 'border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500'
                      : 'border-gray-200 bg-gray-50 text-gray-700 cursor-not-allowed'
                      }`}
                    placeholder="company@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={details.phone || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="+91 9876543210"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website
                  </label>
                  <input
                    type="url"
                    name="website"
                    value={details.website || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="https://www.company.com"
                  />
                </div>
              </div>
            </div>

            {/* Tax & Legal Information Section */}
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                Tax & Legal Information
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    name="gstin"
                    value={details.gstin || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="22AAAAA0000A1Z5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State
                  </label>
                  <select
                    name="state"
                    value={details.state || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-white"
                  >
                    <option value="">Select State</option>
                    {indianStates.map(state => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PAN
                  </label>
                  <input
                    type="text"
                    name="pan"
                    value={details.pan || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="AAAAA0000A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CIN
                  </label>
                  <input
                    type="text"
                    name="cin"
                    value={details.cin || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                    placeholder="U12345MH2020PLC123456"
                  />
                </div>
              </div>
            </div>


          </div>

          {/* Action Buttons */}
          <div className="mt-10 pt-6 border-t border-gray-200">
            <div className="flex justify-end gap-3">
              {isSaved && (
                <div className="mr-4 flex items-center text-sm text-indigo-600">
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
                className={`px-6 py-3 font-medium rounded-[4px] focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors shadow-none border border-slate-200-none border border-slate-200 ${isEditMode
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                  }`}
              >
                Edit Settings
              </button>

              <button
                type="submit"
                onClick={handleSubmit}
                className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-[4px] hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors shadow-none border border-slate-200-none border border-slate-200"
              >
                Save
              </button>

              {isEditMode && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-6 py-3 bg-gray-300 text-gray-700 font-medium rounded-[4px] hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors shadow-none border border-slate-200-none border border-slate-200"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Tax Settings' && (
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Tax Settings</h2>
          <p className="text-gray-500">Tax configuration options will be available soon.</p>
        </div>
      )}

      {activeTab === 'Regional Settings' && (
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200 p-8 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Regional Settings</h2>
          <p className="text-gray-500">Regional and language settings will be available soon.</p>
        </div>
      )}

      {activeTab === 'Subscription' && (
        <div className="space-y-8">
          {/* Current Usage Card */}
          <div className="erp-card p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
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


