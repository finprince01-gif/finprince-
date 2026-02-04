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
            console.error('Failed to load users:', error);
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
            console.error('Failed to load roles:', error);
        } finally {
            setLoadingRoles(false);
        }
    };

    const loadPermissionsStructure = async () => {
        const frontendStructure = {
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
            'Vouchers': { tabs: ['Sales', 'Purchase', 'Payment', 'Receipt', 'Contra', 'Journal', 'Expenses', 'Credit Note', 'Debit Note'] },
            'Reports': { tabs: ['DayBook', 'LedgerReport', 'TrialBalance', 'BalanceSheet', 'StockSummary', 'GSTReports', 'AIReport'] },
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
            'Payroll': { tabs: ['EMPLOYEES', 'PAY RUNS', 'SALARY TEMPLATES', 'STATUTORY', 'REPORTS'] },
            'Service': { tabs: ['Service Group', 'Service List'] },
            'GST': { tabs: ['GSTR1', 'GSTR2', 'GSTR3B'] },
            'Settings': { tabs: ['Company Profile', 'Tax Settings', 'Regional Settings'] },
            'Users & Roles': { tabs: ['User Management', 'Role Management'] }
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

    const handleCreateUser = () => {
        setEditingUser(null);
        setUserForm({
            username: '',
            email: '',
            password: '',
            phone: '',
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
            role_ids: user.roles.map((r: any) => r.id)
        });
        setShowUserModal(true);
    };

    const formatErrorMessage = (error: any): string => {
        if (typeof error === 'string') return error;
        if (typeof error === 'object' && error !== null) {
            if (error.detail) {
                if (typeof error.detail === 'string') return error.detail;
                if (typeof error.detail === 'object') return formatErrorMessage(error.detail);
            }
            if (error.message && typeof error.message === 'string') return error.message;
            const messages: string[] = [];
            Object.keys(error).forEach(key => {
                const value = error[key];
                if (Array.isArray(value)) {
                    const fieldName = key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ');
                    messages.push(`${fieldName}: ${value.join(', ')}`);
                } else if (typeof value === 'string') {
                    const fieldName = key.charAt(0).toUpperCase() + key.slice(1).replace('_', ' ');
                    messages.push(`${fieldName}: ${value}`);
                }
            });
            if (messages.length > 0) return messages.join('\n');
        }
        return 'An unexpected error occurred';
    };

    const handleSaveUser = async () => {
        try {
            if (editingUser) {
                await apiService.updateUser(editingUser.id, {
                    username: userForm.username,
                    email: userForm.email,
                    phone: userForm.phone
                });
                await apiService.assignRolesToUser(editingUser.id, userForm.role_ids);
            } else {
                await apiService.createUserWithRoles(userForm);
            }
            setShowUserModal(false);
            loadUsers();
        } catch (error: any) {
            alert(formatErrorMessage(error));
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to permanently delete this user?')) return;
        try {
            await apiService.deleteUser(userId);
            loadUsers();
        } catch (error: any) {
            alert(formatErrorMessage(error));
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
        } catch (error: any) {
            alert(formatErrorMessage(error));
        }
    };

    const handleDeleteRole = async (roleId: number) => {
        if (!confirm('Are you sure?')) return;
        try {
            await apiService.deleteRole(roleId);
            loadRoles();
        } catch (error: any) {
            alert(formatErrorMessage(error));
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
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <h1 className="text-2xl font-bold text-gray-900">Users & Roles</h1>
            </div>
            <div className="bg-white border-b border-gray-200 px-6 flex space-x-8">
                <button
                    onClick={() => setActiveTab('users')}
                    className={`py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'users' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
                >
                    USERS
                </button>
                <button
                    onClick={() => setActiveTab('roles')}
                    className={`py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'roles' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}
                >
                    ROLES & PERMISSIONS
                </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'users' ? (
                    <UsersTab users={users} roles={roles} loading={loadingUsers} onCreateUser={handleCreateUser} onEditUser={handleEditUser} onDeleteUser={handleDeleteUser} />
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
}

const UsersTab: React.FC<UsersTabProps> = ({ users, roles, loading, onCreateUser, onEditUser, onDeleteUser }) => (
    <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Users</h2>
            <button onClick={onCreateUser} className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700">+ Add User</button>
        </div>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 uppercase text-xs font-medium text-gray-500">
                    <tr>
                        <th className="px-6 py-3 text-left">Username</th>
                        <th className="px-6 py-3 text-left">Email</th>
                        <th className="px-6 py-3 text-left">Roles</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                    {users.map(user => (
                        <tr key={user.id}>
                            <td className="px-6 py-4 font-medium">{user.username}</td>
                            <td className="px-6 py-4">{user.email || '-'}</td>
                            <td className="px-6 py-4">
                                {user.roles.map((r: any) => <span key={r.id} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded mr-1 text-xs">{r.name}</span>)}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                                <button onClick={() => onEditUser(user)} className="text-orange-600 hover:underline">Edit</button>
                                <button onClick={() => onDeleteUser(user.id)} className="text-red-600 hover:underline">Delete</button>
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
    <div className="bg-white rounded-lg shadow p-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="col-span-full flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Roles</h2>
            <button onClick={onCreateRole} className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700">+ Create Role</button>
        </div>
        {roles.map(role => (
            <div key={role.id} className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-bold">{role.name}</h3>
                <p className="text-gray-500 text-xs mb-4">{role.description}</p>
                <div className="flex justify-end space-x-2">
                    <button onClick={() => onEditRole(role)} className="hover:underline text-orange-600">Edit</button>
                    <button onClick={() => onDeleteRole(role.id)} className="hover:underline text-red-600">Delete</button>
                </div>
            </div>
        ))}
    </div>
);

interface UserModalProps { user: any; form: any; roles: any[]; onFormChange: (form: any) => void; onSave: () => void; onClose: () => void; }
const UserModal: React.FC<UserModalProps> = ({ user, form, roles, onFormChange, onSave, onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{user ? 'Edit User' : 'Create User'}</h2>
            <div className="space-y-4">
                <input className="w-full border p-2 rounded" placeholder="Username" value={form.username} onChange={e => onFormChange({ ...form, username: e.target.value })} disabled={!!user} />
                <input className="w-full border p-2 rounded" placeholder="Email" value={form.email} onChange={e => onFormChange({ ...form, email: e.target.value })} />
                <input className="w-full border p-2 rounded" placeholder="Password" type="password" value={form.password} onChange={e => onFormChange({ ...form, password: e.target.value })} />
                <div className="border rounded p-3 h-32 overflow-auto">
                    <p className="text-xs font-bold mb-2">Assign Roles</p>
                    {roles.map(r => (
                        <label key={r.id} className="flex items-center text-sm mb-1">
                            <input type="checkbox" className="mr-2" checked={form.role_ids.includes(r.id)} onChange={e => onFormChange({ ...form, role_ids: e.target.checked ? [...form.role_ids, r.id] : form.role_ids.filter((id: any) => id !== r.id) })} />
                            {r.name}
                        </label>
                    ))}
                </div>
            </div>
            <div className="mt-6 flex justify-end space-x-2">
                <button onClick={onClose} className="px-4 py-2 border rounded">Cancel</button>
                <button onClick={onSave} className="px-4 py-2 bg-orange-600 text-white rounded">Save</button>
            </div>
        </div>
    </div>
);

interface RoleModalProps { role: any; form: any; permissionsStructure: any; onFormChange: (f: any) => void; onTogglePage: (p: string) => void; onToggleTab: (p: string, t: string) => void; onToggleSubmodule: (p: string, st: string[]) => void; onSave: () => void; onClose: () => void; }
const RoleModal: React.FC<RoleModalProps> = ({ role, form, permissionsStructure, onFormChange, onTogglePage, onToggleTab, onToggleSubmodule, onSave, onClose }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col p-6">
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
                                    <label className="flex items-center font-bold text-sm">
                                        <input type="checkbox" className="mr-2" checked={pagePerms.view} onChange={() => onTogglePage(pageName)} />
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
                <button onClick={onSave} className="px-4 py-2 bg-orange-600 text-white rounded">Save</button>
            </div>
        </div>
    </div>
);

export default UsersAndRolesPage;
