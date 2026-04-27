/**
 * ============================================================================
 * USERS & ROLES PAGE (UsersAndRoles.tsx)
 * ============================================================================
 * Comprehensive RBAC management interface with:
 * - User management (create, edit, delete, assign roles)
 * - Role management (create, edit, delete, configure permissions)
 * - Permission tree view for granular page and tab-level access control
 */

import React, { useState, useEffect } from 'react';
import { apiService } from '../../services';
import Icon from '../../components/Icon';
import { showError, showSuccess, confirm } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';



interface UsersAndRolesPageProps {
    onNavigate: (page: string) => void;
}

const UsersAndRolesPage: React.FC<UsersAndRolesPageProps> = ({ onNavigate }) => {
    // Tab state
    const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');

    // Users state
    const [users, setUsers] = useState<any[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Roles state
    const [roles, setRoles] = useState<any[]>([]);
    const [loadingRoles, setLoadingRoles] = useState(false);

    // Permissions structure (pages and tabs)
    const [permissionsStructure, setPermissionsStructure] = useState<any>({});

    // Modal states
    const [showUserModal, setShowUserModal] = useState(false);
    const [showRoleModal, setShowRoleModal] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [editingRole, setEditingRole] = useState<any>(null);

    // Form states
    const [userForm, setUserForm] = useState({
        username: '',
        email: '',
        password: '',
        phone: '',
        is_active: true,
        access_expiry: '',
        role_ids: [] as number[]
    });

    const [roleForm, setRoleForm] = useState({
        name: '',
        description: '',
        permissions: {} as any
    });

    // Load data on mount
    useEffect(() => {
        loadUsers();
        loadRoles();
        loadPermissionsStructure();
    }, []);

    // ============================================================================
    // DATA LOADING
    // ============================================================================

    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const data = await apiService.getUsersWithRoles();
            setUsers(data);
        } catch (error) {
            console.error('Failed to load users:');
        } finally {
            setLoadingUsers(false);
        }
    };

    const loadRoles = async () => {
        setLoadingRoles(true);
        try {
            const data = await apiService.getRoles();
            setRoles(data);
        } catch (error) {
            console.error('Failed to load roles:');
        } finally {
            setLoadingRoles(false);
        }
    };

    const loadPermissionsStructure = async () => {
        const frontendStructure: any = {
            'Dashboard': {
                tabs: []
            },
            'Masters': {
                tabs: [
                    { name: 'Ledgers', subs: ['Ledgers', 'Ledger Groups'] },
                    { name: 'Vouchers', subs: ['Sales', 'Purchase', 'Payment', 'Receipt', 'Contra', 'Journal', 'Expenses', 'Credit Note', 'Debit Note'] }
                ]
            },
            'Inventory': {
                tabs: [
                    { name: 'Master', subs: ['Category', 'Location', 'Inventory Items', 'GRN & Issue Slip'] },
                    { name: 'Operations', subs: ['Stock Movement', 'Issue Slip Creation', 'GRN Creation'] }
                ]
            },
            'Vouchers': {
                tabs: ['Sales', 'Purchase', 'Payment', 'Receipt', 'Contra', 'Journal', 'Expenses', 'Credit Note', 'Debit Note']
            },
            'Reports': {
                tabs: ['DayBook', 'LedgerReport', 'TrialBalance', 'BalanceSheet', 'StockSummary', 'GSTReports', 'AIReport']
            },
            'Vendor Portal': {
                tabs: [
                    { name: 'Master', subs: ['Category', 'PO Settings', 'Vendor Creation'] },
                    { name: 'Transaction', subs: ['Purchase Orders', 'Procurement', 'Payment'] }
                ]
            },
            'Customer Portal': {
                tabs: [
                    { name: 'Master', subs: ['Category', 'Customer', 'Sales Quotation & Order', 'Long-term Contracts'] },
                    { name: 'Transaction', subs: ['Sales Quotation', 'Sales Order', 'Sales', 'Receipt'] }
                ]
            },
            'Payroll': {
                tabs: ['EMPLOYEES', 'PAY RUNS', 'SALARY TEMPLATES', 'STATUTORY', 'REPORTS']
            },
            'Service': {
                tabs: ['Service Group', 'Service List']
            },
            'GST': {
                tabs: ['GSTR1', 'GSTR2', 'GSTR3B']
            }
        };
        setPermissionsStructure(frontendStructure);
    };

    const getAllTabKeys = (tabs: any[]): string[] => {
        let keys: string[] = [];
        tabs.forEach(tab => {
            if (typeof tab === 'string') {
                keys.push(tab);
            } else if (typeof tab === 'object' && tab.subs) {
                keys.push(...tab.subs);
            }
        });
        return keys;
    };

    // ============================================================================
    // USER MANAGEMENT
    // ============================================================================


    const toggleUserStatus = async (user: any) => {
        try {
            const newStatus = !user.is_active;
            await apiService.updateUser(user.id, {
                username: user.username,
                is_active: newStatus
            });
            loadUsers();
        } catch (error) {
            console.error('Failed to toggle status:', error);
        }
    };

    const handleCreateUser = () => {
        setEditingUser(null);
        setUserForm({
            username: '',
            email: '',
            password: '',
            phone: '',
            is_active: true,
            access_expiry: '',
            role_ids: []
        });
        setShowUserModal(true);
    };

    const handleEditUser = (user: any) => {
        setEditingUser(user);
        setUserForm({
            username: user.username,
            email: user.email || '',
            password: '',
            phone: user.phone || '',
            is_active: user.is_active,
            access_expiry: user.access_expiry ? new Date(user.access_expiry).toISOString().split('T')[0] : '',
            role_ids: user.roles.map((r: any) => r.id)
        });
        setShowUserModal(true);
    };



    const handleSaveUser = async () => {
        try {
            if (editingUser) {
                await apiService.updateUser(editingUser.id, {
                    username: userForm.username,
                    email: userForm.email || '',
                    phone: userForm.phone,
                    is_active: userForm.is_active,
                    access_expiry: userForm.access_expiry || null
                });
                await apiService.assignRolesToUser(editingUser.id, userForm.role_ids);
            } else {
                const payload = {
                    ...userForm,
                    access_expiry: userForm.access_expiry || null
                };
                await apiService.createUserWithRoles(payload);
            }
            loadUsers();
            showSuccess(editingUser ? 'User updated successfully' : 'User created successfully');
            setShowUserModal(false);
        } catch (error: any) {
            handleApiError(error, editingUser ? 'Update User' : 'Create User');
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!await confirm('Are you sure you want to permanently delete this user?')) return;
        try {
            await apiService.deleteUser(userId);
            loadUsers();
            showSuccess('User deleted successfully');
        } catch (error: any) {
            handleApiError(error, 'Delete User');
        }
    };


    // ============================================================================
    // ROLE MANAGEMENT
    // ============================================================================

    const handleCreateRole = () => {
        setEditingRole(null);
        const initialPermissions: any = {};
        Object.keys(permissionsStructure).forEach(pageName => {
            const tabs: any = {};
            const allTabs = getAllTabKeys(permissionsStructure[pageName].tabs || []);
            allTabs.forEach((tabName: string) => { tabs[tabName] = false; });
            initialPermissions[pageName] = { view: false, tabs };
        });
        setRoleForm({ name: '', description: '', permissions: initialPermissions });
        setShowRoleModal(true);
    };

    const handleEditRole = (role: any) => {
        setEditingRole(role);
        setRoleForm({
            name: role.name,
            description: role.description || '',
            permissions: role.permissions || {}
        });
        setShowRoleModal(true);
    };

    const handleSaveRole = async () => {
        try {
            if (editingRole) {
                await apiService.updateRole(editingRole.id, roleForm);
            } else {
                await apiService.createRole(roleForm);
            }
            setShowRoleModal(false);
            loadRoles();
            showSuccess(editingRole ? 'Role updated successfully' : 'Role created successfully');
        } catch (error: any) {
            handleApiError(error, editingRole ? 'Update Role' : 'Create Role');
        }
    };

    const handleDeleteRole = async (roleId: number) => {
        if (!await confirm('Are you sure?')) return;
        try {
            await apiService.deleteRole(roleId);
            loadRoles();
            showSuccess('Role deleted successfully');
        } catch (error: any) {
            handleApiError(error, 'Delete Role');
        }
    };


    const togglePagePermission = (pageName: string) => {
        const newPermissions = { ...roleForm.permissions };
        const currentView = newPermissions[pageName]?.view || false;
        newPermissions[pageName] = { ...newPermissions[pageName], view: !currentView };
        const allTabs = getAllTabKeys(permissionsStructure[pageName]?.tabs || []);
        const tabs: any = {};
        allTabs.forEach((tabName: string) => { tabs[tabName] = !currentView; });
        newPermissions[pageName].tabs = tabs;
        setRoleForm({ ...roleForm, permissions: newPermissions });
    };

    const toggleTabPermission = (pageName: string, tabName: string) => {
        const newPermissions = { ...roleForm.permissions };
        if (!newPermissions[pageName]) newPermissions[pageName] = { view: false, tabs: {} };
        if (!newPermissions[pageName].tabs) newPermissions[pageName].tabs = {};
        newPermissions[pageName].tabs[tabName] = !newPermissions[pageName].tabs[tabName];
        const anyTabEnabled = Object.values(newPermissions[pageName].tabs).some(v => v === true);
        newPermissions[pageName].view = anyTabEnabled;
        setRoleForm({ ...roleForm, permissions: newPermissions });
    };

    const toggleSubmodulePermission = (pageName: string, subTabs: string[]) => {
        const newPermissions = { ...roleForm.permissions };
        if (!newPermissions[pageName]) newPermissions[pageName] = { view: false, tabs: {} };
        if (!newPermissions[pageName].tabs) newPermissions[pageName].tabs = {};
        const allEnabled = subTabs.every(t => newPermissions[pageName].tabs[t]);
        const targetState = !allEnabled;
        subTabs.forEach(t => { newPermissions[pageName].tabs[t] = targetState; });
        if (targetState) newPermissions[pageName].view = true;
        setRoleForm({ ...roleForm, permissions: newPermissions });
    };

    return (
        <div className="space-y-8">
            <div className="erp-section-title">
                <div>
                    <h1 className="page-title">Users &amp; Roles</h1>
                    <p className="helper-text">Access control and permission management</p>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="erp-tab-container">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`erp-tab ${activeTab === 'users' ? 'active' : ''}`}
                >
                    User Management
                </button>
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`erp-tab ${activeTab === 'roles' ? 'active' : ''}`}
                >
                    Roles &amp; Permissions
                </button>
            </div>

            <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                {activeTab === 'users' ? (
                    <UsersTab 
                        users={users} 
                        roles={roles} 
                        loading={loadingUsers} 
                        onCreateUser={handleCreateUser} 
                        onEditUser={handleEditUser} 
                        onDeleteUser={handleDeleteUser}
                        onToggleStatus={toggleUserStatus}
                    />
                ) : (
                    <RolesTab roles={roles} loading={loadingRoles} onCreateRole={handleCreateRole} onEditRole={handleEditRole} onDeleteRole={handleDeleteRole} />
                )}
            </div>
            {showUserModal && <UserModal user={editingUser} form={userForm} roles={roles} onFormChange={setUserForm} onSave={handleSaveUser} onClose={() => setShowUserModal(false)} />}
            {showRoleModal && <RoleModal role={editingRole} form={roleForm} permissionsStructure={permissionsStructure} onFormChange={setRoleForm} onTogglePage={togglePagePermission} onToggleTab={toggleTabPermission} onToggleSubmodule={toggleSubmodulePermission} onSave={handleSaveRole} onClose={() => setShowRoleModal(false)} />}
        </div>
    );
};

interface UsersTabProps {
    users: any[]; roles: any[]; loading: boolean;
    onCreateUser: () => void; onEditUser: (user: any) => void; onDeleteUser: (userId: number) => void;
    onToggleStatus: (user: any) => void;
}

const UsersTab: React.FC<UsersTabProps> = ({ users, roles, loading, onCreateUser, onEditUser, onDeleteUser, onToggleStatus }) => (
    <div className="erp-card">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Users</h2>
            <button onClick={onCreateUser} className="px-4 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700">+ Add User</button>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 uppercase text-xs font-medium text-gray-500">
                    <tr>
                        <th className="px-6 py-3 text-left">User Details</th>
                        <th className="px-6 py-3 text-left">Roles</th>
                        <th className="px-6 py-3 text-left">Status</th>
                        <th className="px-6 py-3 text-left">Access Ends</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {users.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4">
                                <div className="font-bold text-slate-900">{user.username}</div>
                                {user.email && (
                                    <div className="text-xs text-slate-500 mt-1">{user.email}</div>
                                )}
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                    {user.roles.length > 0 ? (
                                        user.roles.map((r: any) => (
                                            <span key={r.id} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-indigo-100">
                                                {r.name}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-slate-400 italic text-xs">No roles assigned</span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                {user.is_active ? (
                                    <button 
                                        onClick={() => onToggleStatus(user)} 
                                        className="px-3 py-1 text-[10px] font-black uppercase tracking-tighter bg-red-50 text-red-600 border border-red-100 rounded-md hover:bg-red-600 hover:text-white transition-all shadow-sm"
                                        title="Disable Account"
                                    >
                                        Deactivate
                                    </button>
                                ) : (
                                    <button 
                                        onClick={() => onToggleStatus(user)} 
                                        className="px-3 py-1 text-[10px] font-black uppercase tracking-tighter bg-green-50 text-green-600 border border-green-100 rounded-md hover:bg-green-600 hover:text-white transition-all shadow-sm"
                                        title="Enable Account"
                                    >
                                        Activate
                                    </button>
                                )}
                            </td>
                            <td className="px-6 py-4 text-xs">
                                {user.access_expiry ? (
                                    <span className={`font-semibold ${new Date(user.access_expiry) < new Date() ? 'text-red-500' : 'text-slate-600'}`}>
                                        {new Date(user.access_expiry).toLocaleDateString()}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 italic">No limit</span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right space-x-3">
                                <button onClick={() => onEditUser(user)} className="text-indigo-600 hover:text-indigo-900 font-semibold transition-colors">Manage</button>
                                <button onClick={() => onDeleteUser(user.id)} className="text-red-600 hover:text-red-800 transition-colors">Remove</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
);

interface RolesTabProps {
    roles: any[]; loading: boolean;
    onCreateRole: () => void; onEditRole: (role: any) => void; onDeleteRole: (roleId: number) => void;
}

const RolesTab: React.FC<RolesTabProps> = ({ roles, loading, onCreateRole, onEditRole, onDeleteRole }) => (
    <div className="erp-card p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="col-span-full flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Roles</h2>
            <button onClick={onCreateRole} className="px-4 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700">+ Create Role</button>
        </div>
        {roles.map(role => (
            <div key={role.id} className="border border-gray-200 rounded-[4px] p-4">
                <h3 className="font-bold">{role.name}</h3>
                <p className="text-gray-500 text-xs mb-4">{role.description}</p>
                <div className="flex justify-end space-x-2">
                    <button onClick={() => onEditRole(role)} className="hover:underline text-indigo-600">Edit</button>
                    <button onClick={() => onDeleteRole(role.id)} className="hover:underline text-red-600">Delete</button>
                </div>
            </div>
        ))}
    </div>
);

interface UserModalProps { user: any; form: any; roles: any[]; onFormChange: (form: any) => void; onSave: () => void; onClose: () => void; }
const UserModal: React.FC<UserModalProps> = ({ user, form, roles, onFormChange, onSave, onClose }) => (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-100">
                <h2 className="text-2xl font-bold text-slate-800">{user ? 'Modify Seat Access' : 'Onboard New Employee'}</h2>
                <p className="text-sm text-slate-500 mt-1">Configure identity and access period</p>
            </div>
            
            <div className="p-8 space-y-6">
                <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Username</label>
                        <input className="erp-input w-full" placeholder="john_doe" value={form.username} onChange={e => onFormChange({ ...form, username: e.target.value })} disabled={!!user} />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Email Address</label>
                        <input className="erp-input w-full" placeholder="john@example.com" type="email" value={form.email || ''} onChange={e => onFormChange({ ...form, email: e.target.value })} />
                    </div>
                </div>

                {!user && (
                    <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Password</label>
                        <input className="erp-input w-full" placeholder="••••••••" type="password" value={form.password} onChange={e => onFormChange({ ...form, password: e.target.value })} />
                    </div>
                )}

                <div className="erp-form-section">
                    <label className="erp-label">Assign Roles</label>
                    <div className="grid grid-cols-1 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                        {roles.map(role => (
                            <label key={role.id} className="flex items-center gap-3 p-1 hover:bg-white rounded transition-colors cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={form.role_ids.includes(role.id)}
                                    onChange={(e) => {
                                        const newRoles = e.target.checked
                                            ? [...form.role_ids, role.id]
                                            : form.role_ids.filter((id: number) => id !== role.id);
                                        onFormChange({ ...form, role_ids: newRoles });
                                    }}
                                    className="w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
                                />
                                <span className="text-sm font-bold text-slate-700 uppercase tracking-tight group-hover:text-slate-900">{role.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-slate-50 px-8 py-5 flex justify-end gap-3 border-t border-slate-100">
                <button onClick={onClose} className="px-6 py-2.5 font-bold text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                <button onClick={onSave} className="erp-button-primary px-10 shadow-lg shadow-indigo-200">
                    {user ? 'Update Access' : 'Activate Seat'}
                </button>
            </div>
        </div>
    </div>
);

interface RoleModalProps { role: any; form: any; permissionsStructure: any; onFormChange: (f: any) => void; onTogglePage: (p: string) => void; onToggleTab: (p: string, t: string) => void; onToggleSubmodule: (p: string, st: string[]) => void; onSave: () => void; onClose: () => void; }
const RoleModal: React.FC<RoleModalProps> = ({ role, form, permissionsStructure, onFormChange, onTogglePage, onToggleTab, onToggleSubmodule, onSave, onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-[4px] w-full max-w-4xl max-h-[90vh] flex flex-col p-6">
            <h2 className="text-xl font-bold mb-4">{role ? 'Edit Role' : 'Create Role'}</h2>
            <div className="flex-1 overflow-auto space-y-4">
                <input className="w-full border p-2 rounded" placeholder="Role Name" value={form.name} onChange={e => onFormChange({ ...form, name: e.target.value })} />
                <div className="border rounded p-4 bg-gray-50 flex-1">
                    <p className="font-bold text-sm mb-3">Module Permissions</p>
                    <div className="space-y-3">
                        {Object.keys(permissionsStructure).map(pageName => {
                            const pagePerms = form.permissions[pageName] || { view: false, tabs: {} };
                            const tabs = permissionsStructure[pageName].tabs || [];
                            return (
                                <div key={pageName} className="bg-white border rounded p-3">
                                    <label className="flex items-center font-black text-sm uppercase tracking-widest text-slate-800">
                                        <input type="checkbox" className="mr-3 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={pagePerms.view} onChange={() => onTogglePage(pageName)} />
                                        {pageName}
                                    </label>
                                    <div className="ml-6 mt-2 grid grid-cols-2 lg:grid-cols-4 gap-2">
                                        {tabs.map((tab: any) => (
                                            typeof tab === 'string' ? (
                                                <label key={tab} className="flex items-center text-xs">
                                                    <input type="checkbox" className="mr-1" checked={pagePerms.tabs[tab]} onChange={() => onToggleTab(pageName, tab)} />
                                                    {tab}
                                                </label>
                                            ) : (
                                                <div key={tab.name} className="col-span-full border-t pt-2 mt-2">
                                                    <label className="flex items-center font-bold text-[10px] uppercase text-gray-500">
                                                        <input type="checkbox" className="mr-1" checked={tab.subs.every((s: string) => pagePerms.tabs[s])} onChange={() => onToggleSubmodule(pageName, tab.subs)} />
                                                        {tab.name}
                                                    </label>
                                                    <div className="ml-4 grid grid-cols-3 gap-2 mt-1">
                                                        {tab.subs.map((s: string) => (
                                                            <label key={s} className="flex items-center text-xs">
                                                                <input type="checkbox" className="mr-1" checked={pagePerms.tabs[s]} onChange={() => onToggleTab(pageName, s)} />
                                                                {s}
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
                <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={onSave} className="px-4 py-2 bg-indigo-600 text-white rounded">Save</button>
            </div>
        </div>
    </div>
);

export default UsersAndRolesPage;


