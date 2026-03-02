import React, { useState, useMemo, useEffect } from 'react';
import { Subscription } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import { Sidebar } from './Sidebar';
import { MenuIcon } from './icons/MenuIcon';
import { PowerIcon } from './icons/PowerIcon';
import { SortIcon } from './icons/SortIcon';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000';

interface SubscriptionsPageProps {
  onLogout: () => void;
  navigateTo: (page: string) => void;
  currentPage: string;
}

const getPlanChipColor = (plan: Subscription['subscriptionPlan']) => {
  switch (plan) {
    case 'Basic':
      return 'bg-blue-100 text-blue-800';
    case 'Pro':
      return 'bg-purple-100 text-purple-800';
    case 'Enterprise':
      return 'bg-green-100 text-green-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const DateTimeCell: React.FC<{ dateString: string | null }> = ({ dateString }) => {
  if (!dateString || dateString === 'Never') {
    return <span className="text-gray-400 text-sm">Never</span>;
  }

  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div>
      <span>{`${year}-${month}-${day}`}</span>
      <span className="block text-xs text-gray-500">{timePart}</span>
    </div>
  );
};

const UploadsCell: React.FC<{ used: number; total: number }> = ({ used, total }) => {
  const remaining = total - used;
  const percentage = (used / total) * 100;

  let progressBarColor = 'bg-green-500';
  if (percentage > 90) {
    progressBarColor = 'bg-red-500';
  } else if (percentage > 70) {
    progressBarColor = 'bg-yellow-500';
  }

  return (
    <div className="flex flex-col">
      <span className="font-medium text-gray-900">{remaining.toLocaleString()} Left</span>
      <div className="w-full bg-gray-200 rounded-full h-2 mt-1.5">
        <div
          className={`h-2 rounded-full ${progressBarColor}`}
          style={{ width: `${100 - percentage}%` }}
        ></div>
      </div>
      <span className="text-xs text-gray-500 mt-1">{used.toLocaleString()} / {total.toLocaleString()} Used</span>
    </div>
  );
};

type SortableSubscriptionKeys = keyof Subscription;

const SubscriptionsPage: React.FC<SubscriptionsPageProps> = ({ onLogout, navigateTo, currentPage }) => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortableSubscriptionKeys; direction: 'ascending' | 'descending' } | null>(null);
  const [planFilter, setPlanFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [dateFilter, setDateFilter] = useState<string>('All Time');

  const getDateFilterRanges = (filter: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today);
    thisWeek.setDate(today.getDate() - today.getDay());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYear = new Date(now.getFullYear(), 0, 1);

    switch (filter) {
      case 'Today':
        return { start: today, end: now };
      case 'This Week':
        return { start: thisWeek, end: now };
      case 'This Month':
        return { start: thisMonth, end: now };
      case 'This Year':
        return { start: thisYear, end: now };
      default:
        return null;
    }
  };

  const fetchSubscriptions = () => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_BASE_URL}/api/admin/subscriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (res.ok) {
            return res.json();
          } else if (res.status === 401) {
            localStorage.removeItem('token');
            onLogout();
            throw new Error('Unauthorized');
          } else {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
          }
        })
        .then(data => {
          if (Array.isArray(data)) {
            setSubscriptions(data);
          } else {
            console.error('Invalid subscriptions data:', data);
            setSubscriptions([]);
          }
        })
        .catch(err => {
          console.error('Failed to fetch subscriptions:', err);
          setSubscriptions([]);
        });
    }
  };

  const refreshSubscriptions = () => {
    fetchSubscriptions();
  };

  const updateLoginStatuses = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/admin/subscriptions`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const updatedData = await response.json();
          if (Array.isArray(updatedData)) {
            // Only update login status fields, keep other data unchanged
            setSubscriptions(prevSubs =>
              prevSubs.map(sub => {
                const updated = updatedData.find(u => u.id === sub.id);
                if (updated) {
                  return { ...sub, lastLogin: updated.lastLogin };
                }
                return sub;
              })
            );
          }
        } else if (response.status === 401) {
          // Token is invalid, clear it and logout to stop the polling loop
          localStorage.removeItem('token');
          onLogout();
        }
      } catch (err) {
        console.warn('Failed to update login statuses:', err);
      }
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    // No need to poll for login status anymore - it's just a timestamp
  }, []);

  const handleToggleActivation = async (id: number) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const current = subscriptions.find(sub => sub.id === id);
    if (!current) return;
    const newActive = !current.isActive;
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/user-subscription`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, isActive: newActive })
      });
      if (response.ok) {
        setSubscriptions(prevSubs => prevSubs.map(sub => sub.id === id ? { ...sub, isActive: newActive } : sub));
      } else {
        console.error('Failed to update user status');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredSubscriptions = useMemo(() => {
    const result = subscriptions.filter(sub => {
      // Plan filter
      if (planFilter !== 'All' && sub.subscriptionPlan !== planFilter) {
        return false;
      }

      // Status filter - Exact match required
      const subStatus = sub.isActive ? 'Active' : 'Deactivate';
      if (statusFilter !== 'All' && subStatus !== statusFilter) {
        return false;
      }

      // Date filter
      if (dateFilter !== 'All Time') {
        const dateRange = getDateFilterRanges(dateFilter);
        if (dateRange) {
          const registrationDate = new Date(sub.registrationDate);
          if (registrationDate < dateRange.start || registrationDate > dateRange.end) {
            return false;
          }
        }
      }

      // Search query filter
      const query = searchQuery.toLowerCase();
      if (!query) {
        return true;
      }

      const status = sub.isActive ? 'active' : 'inactive';
      return sub.username.toLowerCase().includes(query) ||
        sub.companyName.toLowerCase().includes(query) ||
        sub.subscriptionPlan.toLowerCase().includes(query) ||
        status.includes(query);
    });

    // Status display is now constant - only changes when manually clicked

    return result;
  }, [subscriptions, searchQuery, planFilter, statusFilter, dateFilter]);


  const sortedSubscriptions = useMemo(() => {
    let sortableItems = [...filteredSubscriptions];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        let comparison = 0;
        if (sortConfig.key === 'uploadsUsed') {
          const remainingA = a.totalUploads - a.uploadsUsed;
          const remainingB = b.totalUploads - b.uploadsUsed;
          if (remainingA < remainingB) comparison = -1;
          if (remainingA > remainingB) comparison = 1;
        } else {
          if (aValue < bValue) comparison = -1;
          if (aValue > bValue) comparison = 1;
        }

        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    return sortableItems;
  }, [filteredSubscriptions, sortConfig]);

  const requestSort = (key: SortableSubscriptionKeys) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const getSortDirection = (key: SortableSubscriptionKeys) => {
    if (!sortConfig || sortConfig.key !== key) {
      return null;
    }
    return sortConfig.direction;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} navigateTo={navigateTo} currentPage={currentPage} />
      <div className="lg:pl-64">
        <header className="flex justify-between items-center p-4 sm:p-6 lg:p-8 bg-white border-b border-gray-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-900"
              aria-label="Open sidebar"
            >
              <MenuIcon className="h-6 w-6" />
            </button>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onLogout}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors duration-200"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div className="relative w-full sm:max-w-xs">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchIcon className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full bg-white border border-gray-300 rounded-lg py-2.5 pl-10 pr-4 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                aria-label="Search admin data"
              />
            </div>
            <div className="flex items-center gap-4">
              <div>
                <label htmlFor="planFilter" className="sr-only">Filter by Plan</label>
                <select
                  id="planFilter"
                  value={planFilter}
                  onChange={(e) => setPlanFilter(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
                >
                  <option value="All">All Plans</option>
                  <option value="Basic">Basic</option>
                  <option value="Pro">Pro</option>
                  <option value="Enterprise">Enterprise</option>
                </select>
              </div>
              <div>
                <label htmlFor="statusFilter" className="sr-only">Filter by Status</label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
                >
                  <option value="All">All Statuses</option>
                  <option value="Active">Active</option>
                  <option value="Deactivate">Deactivate</option>
                </select>
              </div>
              <div>
                <label htmlFor="dateFilter" className="sr-only">Filter by Registration</label>
                <select
                  id="dateFilter"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg py-2.5 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors text-sm"
                >
                  <option value="All Time">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                  <option value="This Year">This Year</option>
                </select>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-sm text-left text-gray-600">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('username')} className="flex items-center gap-1.5 group">
                        Username
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('username')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('companyName')} className="flex items-center gap-1.5 group">
                        Company Name
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('companyName')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('registrationDate')} className="flex items-center gap-1.5 group">
                        Registration Date
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('registrationDate')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('subscriptionPlan')} className="flex items-center gap-1.5 group">
                        Subscription Plan
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('subscriptionPlan')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('isActive')} className="flex items-center gap-1.5 group">
                        Status
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('isActive')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Login Activity
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('subscriptionStartDate')} className="flex items-center gap-1.5 group">
                        Start Date
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('subscriptionStartDate')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('subscriptionEndDate')} className="flex items-center gap-1.5 group">
                        End Date
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('subscriptionEndDate')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      <button onClick={() => requestSort('uploadsUsed')} className="flex items-center gap-1.5 group">
                        Uploads Left
                        <SortIcon className="h-3 w-3 text-gray-400 group-hover:text-gray-600" direction={getSortDirection('uploadsUsed')} />
                      </button>
                    </th>
                    <th scope="col" className="px-6 py-4">
                      Tenant ID
                    </th>
                    <th scope="col" className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSubscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{sub.username}</td>
                      <td className="px-6 py-4">{sub.companyName}</td>
                      <td className="px-6 py-4">
                        <DateTimeCell dateString={sub.registrationDate} />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getPlanChipColor(sub.subscriptionPlan)}`}>
                          {sub.subscriptionPlan}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 text-xs font-semibold rounded-full ${sub.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                          {sub.isActive ? 'Active' : 'Deactivate'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <DateTimeCell dateString={sub.lastLogin === 'Never' ? null : sub.lastLogin} />
                      </td>
                      <td className="px-6 py-4">
                        <DateTimeCell dateString={sub.subscriptionStartDate} />
                      </td>
                      <td className="px-6 py-4">
                        <DateTimeCell dateString={sub.subscriptionEndDate} />
                      </td>
                      <td className="px-6 py-4 min-w-[200px]">
                        <UploadsCell used={sub.uploadsUsed} total={sub.totalUploads} />
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-gray-600">{sub.tenantId}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end">
                          <button
                            onClick={() => handleToggleActivation(sub.id)}
                            className={`p-2 rounded-full transition-colors duration-200 ${sub.isActive ? 'text-green-500 hover:text-green-600' : 'text-gray-400 hover:text-gray-600'
                              }`}
                            aria-label={sub.isActive ? 'Deactivate user' : 'Activate user'}
                            title={sub.isActive ? 'Deactivate user' : 'Activate user'}
                          >
                            <PowerIcon className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default SubscriptionsPage;
