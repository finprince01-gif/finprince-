import React, { useState, useEffect, useMemo } from 'react';
import Icon from '../../components/Icon';
import { httpClient } from '../../services/httpClient';
import { usePermissions } from '../../hooks/usePermissions';

type PayrollTab = 'EMPLOYEES' | 'PAY RUNS' | 'SALARY TEMPLATES' | 'STATUTORY' | 'REPORTS';

interface Employee {
    id: number;
    employee_code: string;
    employee_name: string;
    email: string;
    phone: string;
    department: string;
    designation: string;
    date_of_joining: string;
    employment_type: string;
    basic_salary: number;
    status: 'Active' | 'Inactive';
    pan_number?: string;
    uan_number?: string;
    esi_number?: string;
}

interface PayRun {
    id: number;
    pay_run_code: string;
    pay_period: string;
    tenant_id?: string;
    start_date: string;
    end_date: string;
    total_employees: number;
    gross_pay: number;
    total_deductions: number;
    net_pay: number;
    status: 'Draft' | 'Processed' | 'Approved' | 'Paid';
    created_at: string;
}

const PayrollPage: React.FC = () => {
    const { hasTabAccess, isSuperuser } = usePermissions();

    const allTabs: PayrollTab[] = ['EMPLOYEES', 'PAY RUNS', 'SALARY TEMPLATES', 'STATUTORY', 'REPORTS'];
    const tabs = useMemo(() => {
        return isSuperuser ? allTabs : allTabs.filter(tab => hasTabAccess('Payroll', tab));
    }, [hasTabAccess, isSuperuser]);

    const [activeTab, setActiveTab] = useState<PayrollTab>(tabs.length > 0 ? tabs[0] : 'EMPLOYEES');
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [payRuns, setPayRuns] = useState<PayRun[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showProcessPayRunModal, setShowProcessPayRunModal] = useState(false);

    useEffect(() => {
        if (tabs.length > 0 && !tabs.includes(activeTab)) {
            setActiveTab(tabs[0]);
        }
    }, [tabs, activeTab]);

    useEffect(() => {
        if (tabs.includes(activeTab)) {
            fetchData();
        }
    }, [activeTab]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            if (activeTab === 'EMPLOYEES') {
                const response = await httpClient.get<Employee[]>('/api/payroll/employees/');
                setEmployees(response);
            } else if (activeTab === 'PAY RUNS') {
                const response = await httpClient.get<PayRun[]>('/api/payroll/pay-runs/');
                setPayRuns(response);
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex-1 bg-sky-50 min-h-screen">
            {/* Header */}
            <div className="px-8 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Payroll Management</h1>
                        <p className="text-sm text-gray-600 mt-1">Manage employees, process pay runs, and handle statutory compliance.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowProcessPayRunModal(true)}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                        >
                            <Icon name="plus" className="w-4 h-4" />
                            Process Pay Run
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="px-8">
                <div className="flex gap-8 border-b border-gray-200 pb-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-2 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
                                ? 'border-teal-600 text-teal-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="px-8 py-6">
                {activeTab === 'EMPLOYEES' && <EmployeesContent employees={employees} onRefresh={fetchData} />}
                {activeTab === 'PAY RUNS' && <PayRunsContent payRuns={payRuns} onRefresh={fetchData} />}
                {activeTab === 'SALARY TEMPLATES' && <SalaryTemplatesContent />}
                {activeTab === 'STATUTORY' && <StatutoryContent />}
                {activeTab === 'REPORTS' && <ReportsContent />}
            </div>

            {/* Process Pay Run Modal */}
            {showProcessPayRunModal && (
                <ProcessPayRunModal
                    onClose={() => setShowProcessPayRunModal(false)}
                    onSuccess={() => {
                        setShowProcessPayRunModal(false);
                        if (activeTab === 'PAY RUNS') fetchData();
                    }}
                />
            )}
        </div>
    );
};

// Dashboard Content
const DashboardContent: React.FC = () => {
    const [stats, setStats] = useState({
        totalEmployees: 0,
        monthlyPayroll: 0,
        pendingPayRuns: 0,
        complianceStatus: 'Up to Date'
    });

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const empStats = await httpClient.get<any>('/api/payroll/employees/statistics/');
            const payRuns = await httpClient.get<PayRun[]>('/api/payroll/pay-runs/');

            const pendingCount = payRuns.filter(pr => pr.status === 'Draft' || pr.status === 'Processed').length;
            const currentMonthPayroll = payRuns
                .filter(pr => pr.status === 'Paid' && new Date(pr.created_at).getMonth() === new Date().getMonth())
                .reduce((sum, pr) => sum + Number(pr.net_pay), 0);

            setStats({
                totalEmployees: empStats.total_employees || 0,
                monthlyPayroll: currentMonthPayroll,
                pendingPayRuns: pendingCount,
                complianceStatus: 'Up to Date'
            });
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    return (
        <div className="space-y-6">
            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-2 font-medium">Total Employees</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.totalEmployees}</p>
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center">
                            <Icon name="users" className="w-6 h-6 text-teal-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-2 font-medium">Monthly Payroll</p>
                            <p className="text-2xl font-bold text-gray-900">₹{stats.monthlyPayroll.toLocaleString()}</p>
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center">
                            <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-2 font-medium">Pending Pay Runs</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.pendingPayRuns}</p>
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-50 to-yellow-100 flex items-center justify-center">
                            <Icon name="clock" className="w-6 h-6 text-yellow-600" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-5 border border-gray-100 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                        <div>
                            <p className="text-xs text-gray-600 mb-2 font-medium">Compliance Status</p>
                            <p className="text-sm font-semibold text-teal-600 mt-2">{stats.complianceStatus}</p>
                        </div>
                        <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center">
                            <Icon name="check-circle" className="w-6 h-6 text-teal-600" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Payroll Activity</h2>
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                        <Icon name="inbox" className="w-10 h-10 text-gray-300" />
                    </div>
                    <p className="text-gray-400 text-sm">No payroll activity yet.</p>
                </div>
            </div>
        </div>
    );
};

// Employees Content
const EmployeesContent: React.FC<{ employees: Employee[]; onRefresh: () => void }> = ({ employees, onRefresh }) => {
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredEmployees = employees.filter(emp =>
        emp.employee_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Employee List</h2>
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <Icon name="search" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search employees..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <button
                                onClick={() => setShowAddModal(true)}
                                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium flex items-center gap-2"
                            >
                                <Icon name="plus" className="w-4 h-4" />
                                Add Employee
                            </button>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Department</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Designation</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Basic Salary</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredEmployees.length > 0 ? (
                                filteredEmployees.map((emp) => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{emp.employee_name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{emp.employee_code}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{emp.department || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{emp.designation || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₹{emp.basic_salary.toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${emp.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {emp.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                            <button className="text-teal-600 hover:text-indigo-900">View</button>
                                            <button className="text-teal-600 hover:text-teal-900">Edit</button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                                                <Icon name="users" className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-400 text-sm">No employees found.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showAddModal && <AddEmployeeModal onClose={() => setShowAddModal(false)} onSuccess={onRefresh} />}
        </>
    );
};

// Add Employee Modal Component
const AddEmployeeModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
    const [activeTab, setActiveTab] = useState<'basic' | 'employment' | 'salary' | 'statutory' | 'bank'>('basic');
    const [formData, setFormData] = useState({
        tenant_id: '',
        employee_name: '',
        employee_code: `EMP-${Date.now().toString().slice(-6)}`,
        email: '',
        phone: '',
        date_of_birth: '',
        gender: '',
        address: '',
        department: '',
        designation: '',
        date_of_joining: '',
        employment_type: 'Full-Time',
        basic_salary: '',
        hra: '',
        pan_number: '',
        uan_number: '',
        esi_number: '',
        account_number: '',
        ifsc_code: '',
        bank_name: ''
    });

    // Effect to auto-populate tenant_id from localStorage
    useEffect(() => {
        const storedTenantId = localStorage.getItem('tenantId');
        if (storedTenantId) {
            setFormData(prev => ({ ...prev, tenant_id: storedTenantId }));
        }
    }, []);

    const handleSubmit = async () => {
        try {
            // Validate required fields
            if (!formData.employee_name || !formData.email) {
                alert('Please fill in all required fields (Employee Name and Email)');
                return;
            }

            // Format the data properly for backend
            const payload = {
                tenant_id: formData.tenant_id || localStorage.getItem('tenantId'),
                employee_name: formData.employee_name,
                employee_code: formData.employee_code,
                email: formData.email,
                phone: formData.phone || '',
                date_of_birth: formData.date_of_birth || null,
                gender: formData.gender || '',
                address: formData.address || '',
                department: formData.department || '',
                designation: formData.designation || '',
                date_of_joining: formData.date_of_joining || null,
                employment_type: formData.employment_type,
                basic_salary: formData.basic_salary ? parseFloat(formData.basic_salary) : 0,
                hra: formData.hra ? parseFloat(formData.hra) : 0,
                pan_number: formData.pan_number || '',
                uan_number: formData.uan_number || '',
                esi_number: formData.esi_number || '',
                account_number: formData.account_number || '',
                ifsc_code: formData.ifsc_code || '',
                bank_name: formData.bank_name || ''
            };

            await httpClient.post('/api/payroll/employees/', payload);
            alert('Employee added successfully!');
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error adding employee:', error);
            alert('Failed to add employee. Please check the form data.');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Add New Employee</h2>
                        <p className="text-sm text-gray-500 mt-1">Complete employee information</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <Icon name="x" className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="border-b border-gray-200 px-6">
                    <div className="flex gap-6">
                        {[
                            { key: 'basic', label: 'Basic Details' },
                            { key: 'employment', label: 'Employment' },
                            { key: 'salary', label: 'Salary' },
                            { key: 'statutory', label: 'Statutory' },
                            { key: 'bank', label: 'Bank Details' }
                        ].map((tab) => (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key as any)}
                                className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.key
                                    ? 'border-teal-600 text-teal-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-6 py-6">
                    {activeTab === 'basic' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Employee Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.employee_name}
                                    onChange={(e) => setFormData({ ...formData, employee_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Employee Code</label>
                                <input
                                    type="text"
                                    value={formData.employee_code}
                                    onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Email <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
                                <input
                                    type="date"
                                    value={formData.date_of_birth}
                                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                                <select
                                    value={formData.gender}
                                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                >
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'employment' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                                <input
                                    type="text"
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                                <input
                                    type="text"
                                    value={formData.designation}
                                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
                                <input
                                    type="date"
                                    value={formData.date_of_joining}
                                    onChange={(e) => setFormData({ ...formData, date_of_joining: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
                                <select
                                    value={formData.employment_type}
                                    onChange={(e) => setFormData({ ...formData, employment_type: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                >
                                    <option value="Full-Time">Full-Time</option>
                                    <option value="Part-Time">Part-Time</option>
                                    <option value="Contract">Contract</option>
                                    <option value="Intern">Intern</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {activeTab === 'salary' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Basic Salary</label>
                                <input
                                    type="number"
                                    value={formData.basic_salary}
                                    onChange={(e) => setFormData({ ...formData, basic_salary: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">HRA</label>
                                <input
                                    type="number"
                                    value={formData.hra}
                                    onChange={(e) => setFormData({ ...formData, hra: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'statutory' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                                <input
                                    type="text"
                                    value={formData.pan_number}
                                    onChange={(e) => setFormData({ ...formData, pan_number: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">UAN Number</label>
                                <input
                                    type="text"
                                    value={formData.uan_number}
                                    onChange={(e) => setFormData({ ...formData, uan_number: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">ESI Number</label>
                                <input
                                    type="text"
                                    value={formData.esi_number}
                                    onChange={(e) => setFormData({ ...formData, esi_number: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'bank' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                                <input
                                    type="text"
                                    value={formData.account_number}
                                    onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                                <input
                                    type="text"
                                    value={formData.ifsc_code}
                                    onChange={(e) => setFormData({ ...formData, ifsc_code: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                                <input
                                    type="text"
                                    value={formData.bank_name}
                                    onChange={(e) => setFormData({ ...formData, bank_name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between sticky bottom-0 bg-white">
                    <div>
                        {activeTab !== 'basic' && (
                            <button
                                onClick={() => {
                                    const tabs: Array<'basic' | 'employment' | 'salary' | 'statutory' | 'bank'> = ['basic', 'employment', 'salary', 'statutory', 'bank'];
                                    const currentIndex = tabs.indexOf(activeTab);
                                    if (currentIndex > 0) {
                                        setActiveTab(tabs[currentIndex - 1]);
                                    }
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md"
                            >
                                BACK
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                            CANCEL
                        </button>
                        {activeTab === 'bank' ? (
                            <button
                                onClick={handleSubmit}
                                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium"
                            >
                                ADD EMPLOYEE
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    const tabs: Array<'basic' | 'employment' | 'salary' | 'statutory' | 'bank'> = ['basic', 'employment', 'salary', 'statutory', 'bank'];
                                    const currentIndex = tabs.indexOf(activeTab);
                                    if (currentIndex < tabs.length - 1) {
                                        setActiveTab(tabs[currentIndex + 1]);
                                    }
                                }}
                                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium"
                            >
                                NEXT
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Process Pay Run Modal
const ProcessPayRunModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        pay_period: '',
        start_date: '',
        end_date: '',
        tenant_id: localStorage.getItem('tenantId') || '',
    });
    const [isProcessing, setIsProcessing] = useState(false);

    const handleCreateAndProcess = async () => {
        if (!formData.pay_period || !formData.start_date || !formData.end_date) {
            alert('Please fill all required fields');
            return;
        }

        setIsProcessing(true);
        try {
            // Create pay run
            const payRun = await httpClient.post<PayRun>('/api/payroll/pay-runs/', formData);

            // Process it immediately
            const tenantId = payRun.tenant_id || localStorage.getItem('tenantId');
            await httpClient.post(`/api/payroll/pay-runs/${payRun.id}/process/?tenant_id=${tenantId}`);

            alert('Pay run created and processed successfully!');
            onSuccess();
        } catch (error) {
            console.error('Error processing pay run:', error);
            alert('Failed to process pay run');
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Process Pay Run</h2>
                        <p className="text-sm text-gray-500 mt-1">Create and process payroll for the selected period</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <Icon name="x" className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Pay Period <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., January 2026"
                                value={formData.pay_period}
                                onChange={(e) => setFormData({ ...formData, pay_period: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Start Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    End Date <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                            </div>
                        </div>

                        <div className="bg-teal-50 border border-teal-200 rounded-md p-4 mt-4">
                            <p className="text-sm text-teal-800">
                                <strong>Note:</strong> This will automatically calculate salaries for all active employees based on their salary structure and attendance.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                        CANCEL
                    </button>
                    <button
                        onClick={handleCreateAndProcess}
                        disabled={isProcessing}
                        className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium disabled:opacity-50"
                    >
                        {isProcessing ? 'PROCESSING...' : 'CREATE & PROCESS'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Pay Runs Content
const PayRunsContent: React.FC<{ payRuns: PayRun[]; onRefresh: () => void }> = ({ payRuns, onRefresh }) => {
    const [showCreateModal, setShowCreateModal] = useState(false);

    const handleProcess = async (payRunId: number) => {
        try {
            await httpClient.post(`/api/payroll/pay-runs/${payRunId}/process/`);
            alert('Pay run processed successfully!');
            onRefresh();
        } catch (error) {
            console.error('Error processing pay run:', error);
            alert('Failed to process pay run');
        }
    };

    const handleApprove = async (payRunId: number) => {
        try {
            await httpClient.post(`/api/payroll/pay-runs/${payRunId}/approve/`);
            alert('Pay run approved successfully!');
            onRefresh();
        } catch (error) {
            console.error('Error approving pay run:', error);
            alert('Failed to approve pay run');
        }
    };

    return (
        <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Pay Run History</h2>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium flex items-center gap-2"
                        >
                            <Icon name="plus" className="w-4 h-4" />
                            Create Pay Run
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Pay Period</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employees</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gross Pay</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deductions</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Net Pay</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {payRuns.length > 0 ? (
                                payRuns.map((run) => (
                                    <tr key={run.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{run.pay_period}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{run.total_employees}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₹{Number(run.gross_pay).toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₹{Number(run.total_deductions).toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">₹{Number(run.net_pay).toLocaleString()}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${run.status === 'Paid' ? 'bg-green-100 text-green-800' :
                                                run.status === 'Approved' ? 'bg-teal-100 text-teal-800' :
                                                    run.status === 'Processed' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-gray-100 text-gray-800'
                                                }`}>
                                                {run.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                            <button className="text-teal-600 hover:text-indigo-900">View</button>
                                            {run.status === 'Draft' && (
                                                <button
                                                    onClick={() => handleProcess(run.id)}
                                                    className="text-teal-600 hover:text-green-900"
                                                >
                                                    Process
                                                </button>
                                            )}
                                            {run.status === 'Processed' && (
                                                <button
                                                    onClick={() => handleApprove(run.id)}
                                                    className="text-teal-600 hover:text-teal-900"
                                                >
                                                    Approve
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-16 text-center">
                                        <p className="text-gray-400 text-sm">No pay runs found.</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showCreateModal && (
                <ProcessPayRunModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        setShowCreateModal(false);
                        onRefresh();
                    }}
                />
            )}
        </>
    );
};

// Salary Templates Content
const SalaryTemplatesContent: React.FC = () => {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [templates, setTemplates] = useState<any[]>([]);

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const tenantId = localStorage.getItem('tenantId');
            const response = await httpClient.get(`/api/payroll/salary-templates/?tenant_id=${tenantId}`);
            setTemplates(response);
        } catch (error) {
            console.error('Error fetching templates:', error);
        }
    };

    return (
        <>
            <div className="bg-white rounded-lg shadow-sm border border-gray-100">
                <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-bold text-gray-900">Salary Templates</h2>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium flex items-center gap-2"
                        >
                            <Icon name="plus" className="w-4 h-4" />
                            Create Template
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    {templates.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {templates.map((template) => (
                                <div key={template.id} className="border border-gray-200 rounded-lg p-4 hover:border-teal-500 transition-colors">
                                    <h3 className="font-semibold text-gray-900 mb-2">{template.template_name}</h3>
                                    <p className="text-sm text-gray-500">{template.description || 'No description'}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20">
                            <p className="text-gray-400 text-sm">No salary templates created yet.</p>
                        </div>
                    )}
                </div>
            </div>

            {showCreateModal && (
                <CreateTemplateModal
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={() => {
                        setShowCreateModal(false);
                        fetchTemplates();
                    }}
                />
            )}
        </>
    );
};

// Create Template Modal
const CreateTemplateModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
    const [formData, setFormData] = useState({
        template_name: '',
        description: '',
        tenant_id: localStorage.getItem('tenantId') || ''
    });

    const handleSubmit = async () => {
        if (!formData.template_name) {
            alert('Please enter template name');
            return;
        }

        try {
            await httpClient.post('/api/payroll/salary-templates/', formData);
            alert('Template created successfully!');
            onSuccess();
        } catch (error) {
            console.error('Error creating template:', error);
            alert('Failed to create template');
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Create Salary Template</h2>
                        <p className="text-sm text-gray-500 mt-1">Define a new salary structure template</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <Icon name="x" className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6">
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Template Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g., Senior Developer Package"
                                value={formData.template_name}
                                onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <textarea
                                placeholder="Describe this salary template..."
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                        CANCEL
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-sm font-medium"
                    >
                        CREATE TEMPLATE
                    </button>
                </div>
            </div>
        </div>
    );
};

// Statutory Content
const StatutoryContent: React.FC = () => {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* EPF */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Employee Provident Fund (EPF)</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Employee Contribution</span>
                            <span className="text-sm font-medium">12%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Employer Contribution</span>
                            <span className="text-sm font-medium">12%</span>
                        </div>
                        <button className="w-full mt-4 px-4 py-2 bg-green-50 text-teal-700 rounded-md text-sm font-medium hover:bg-green-100">
                            Configure EPF
                        </button>
                    </div>
                </div>

                {/* ESI */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Employee State Insurance (ESI)</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Employee Contribution</span>
                            <span className="text-sm font-medium">0.75%</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Employer Contribution</span>
                            <span className="text-sm font-medium">3.25%</span>
                        </div>
                        <button className="w-full mt-4 px-4 py-2 bg-green-50 text-teal-700 rounded-md text-sm font-medium hover:bg-green-100">
                            Configure ESI
                        </button>
                    </div>
                </div>

                {/* Professional Tax */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Professional Tax (PT)</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">State</span>
                            <span className="text-sm font-medium">Not Configured</span>
                        </div>
                        <button className="w-full mt-4 px-4 py-2 bg-green-50 text-teal-700 rounded-md text-sm font-medium hover:bg-green-100">
                            Configure PT
                        </button>
                    </div>
                </div>

                {/* LWF */}
                <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Labour Welfare Fund (LWF)</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Status</span>
                            <span className="text-sm font-medium">Not Configured</span>
                        </div>
                        <button className="w-full mt-4 px-4 py-2 bg-green-50 text-teal-700 rounded-md text-sm font-medium hover:bg-green-100">
                            Configure LWF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Reports Content
const ReportsContent: React.FC = () => {
    return (
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Payroll Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button className="p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-green-50 transition-colors text-left">
                    <h3 className="font-semibold text-gray-900 mb-1">Payroll Summary</h3>
                    <p className="text-xs text-gray-500">Monthly payroll overview</p>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-green-50 transition-colors text-left">
                    <h3 className="font-semibold text-gray-900 mb-1">Tax Summary</h3>
                    <p className="text-xs text-gray-500">EPF, ESI, PT deductions</p>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-green-50 transition-colors text-left">
                    <h3 className="font-semibold text-gray-900 mb-1">Employee Wise Report</h3>
                    <p className="text-xs text-gray-500">Individual salary details</p>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-green-50 transition-colors text-left">
                    <h3 className="font-semibold text-gray-900 mb-1">Payslips</h3>
                    <p className="text-xs text-gray-500">Generate and download payslips</p>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-green-50 transition-colors text-left">
                    <h3 className="font-semibold text-gray-900 mb-1">Bank Transfer Report</h3>
                    <p className="text-xs text-gray-500">Salary transfer file</p>
                </button>
                <button className="p-4 border border-gray-200 rounded-lg hover:border-teal-500 hover:bg-green-50 transition-colors text-left">
                    <h3 className="font-semibold text-gray-900 mb-1">Form 16</h3>
                    <p className="text-xs text-gray-500">Annual tax certificate</p>
                </button>
            </div>
        </div>
    );
};

export default PayrollPage;

