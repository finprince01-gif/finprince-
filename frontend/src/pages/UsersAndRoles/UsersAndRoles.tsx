/**
 * ============================================================================
 * USERS & ROLES PAGE (UsersAndRoles.tsx)
 * ============================================================================
 * Comprehensive RBAC management interface with:
 * - User management (create, edit, delete, assign roles)
 * - Role management (create, edit, delete, configure permissions)
 * - Permission tree view for granular page and tab-level access control
 * 
 * TABS:
 * 1. Users - Manage users and their role assignments
 * 2. Roles & Permissions - Create/edit roles with hierarchical permissions
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
        try {
            const data = await apiService.getPermissionsStructure();
            setPermissionsStructure(data);
        } catch (error) {
            console.error('Failed to load permissions structure:', error);
        }
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
            password: '', // Don't pre-fill password
            phone: user.phone || '',
            role_ids: user.roles.map((r: any) => r.id)
        });
        setShowUserModal(true);
    };

    // Helper to format error messages
    const formatErrorMessage = (error: any): string => {
        if (typeof error === 'string') return error;

        // Handle error objects
        if (typeof error === 'object' && error !== null) {
            // Check for 'detail' field first (common in DRF)
            if (error.detail) {
                if (typeof error.detail === 'string') return error.detail;
                if (typeof error.detail === 'object') {
                    return formatErrorMessage(error.detail);
                }
            }

            // Check for 'message' field
            if (error.message && typeof error.message === 'string') {
                return error.message;
            }

            // Handle DRF field errors (e.g. { username: ["Already exists"], email: ["Invalid"] })
            const messages: string[] = [];
            Object.keys(error).forEach(key => {
                const value = error[key];
                if (Array.isArray(value)) {
                    // Capitalize field name for better UX
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
                // Update existing user
                await apiService.updateUser(editingUser.id, {
                    username: userForm.username,
                    email: userForm.email,
                    phone: userForm.phone
                });
                // Update roles separately
                await apiService.assignRolesToUser(editingUser.id, userForm.role_ids);
            } else {
                // Create new user
                await apiService.createUserWithRoles(userForm);
            }
            setShowUserModal(false);
            loadUsers();
        } catch (error: any) {
            const errorMessage = formatErrorMessage(error);
            console.error('Failed to save user:', errorMessage);
            alert(errorMessage);
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (!confirm('Are you sure you want to permanently delete this user? This action cannot be undone.')) return;

        try {
            await apiService.deleteUser(userId);
            loadUsers();
        } catch (error: any) {
            console.error('Failed to delete user:', error);
            alert(formatErrorMessage(error));
        }
    };

    // ============================================================================
    // ROLE MANAGEMENT
    // ============================================================================

    const handleCreateRole = () => {
        setEditingRole(null);
        // Initialize permissions with all pages set to false
        const initialPermissions: any = {};
        Object.keys(permissionsStructure).forEach(pageName => {
            const tabs: any = {};
            permissionsStructure[pageName].tabs.forEach((tabName: string) => {
                tabs[tabName] = false;
            });
            initialPermissions[pageName] = {
                view: false,
                tabs
            };
        });

        setRoleForm({
            name: '',
            description: '',
            permissions: initialPermissions
        });
        setShowRoleModal(true);
    };

    const handleEditRole = (role: any) => {
        setEditingRole(role);
        setRoleForm({
            name: role.name,
            description: role.description || '',
            permissions: role.permissions
        });
        setShowRoleModal(true);
    };

    const handleSaveRole = async () => {
        try {
            if (editingRole) {
                // Update existing role
                await apiService.updateRole(editingRole.id, roleForm);
            } else {
                // Create new role
                await apiService.createRole(roleForm);
            }
            setShowRoleModal(false);
            loadRoles();
        } catch (error: any) {
            console.error('Failed to save role:', error);
            alert(formatErrorMessage(error));
        }
    };

    const handleDeleteRole = async (roleId: number) => {
        if (!confirm('Are you sure you want to delete this role?')) return;

        try {
            await apiService.deleteRole(roleId);
            loadRoles();
        } catch (error: any) {
            console.error('Failed to delete role:', error);
            alert(formatErrorMessage(error));
        }
    };

    // Toggle page-level permission
    const togglePagePermission = (pageName: string) => {
        const newPermissions = { ...roleForm.permissions };
        const currentView = newPermissions[pageName]?.view || false;

        // Toggle page view
        newPermissions[pageName] = {
            ...newPermissions[pageName],
            view: !currentView
        };

        // If enabling page, enable all tabs. If disabling, disable all tabs.
        if (!currentView) {
            // Enabling - set all tabs to true
            const tabs: any = {};
            permissionsStructure[pageName]?.tabs.forEach((tabName: string) => {
                tabs[tabName] = true;
            });
            newPermissions[pageName].tabs = tabs;
        } else {
            // Disabling - set all tabs to false
            const tabs: any = {};
            permissionsStructure[pageName]?.tabs.forEach((tabName: string) => {
                tabs[tabName] = false;
            });
            newPermissions[pageName].tabs = tabs;
        }

        setRoleForm({ ...roleForm, permissions: newPermissions });
    };

    // Toggle tab-level permission
    const toggleTabPermission = (pageName: string, tabName: string) => {
        const newPermissions = { ...roleForm.permissions };

        if (!newPermissions[pageName]) {
            newPermissions[pageName] = { view: false, tabs: {} };
        }

        if (!newPermissions[pageName].tabs) {
            newPermissions[pageName].tabs = {};
        }

        // Toggle tab
        newPermissions[pageName].tabs[tabName] = !newPermissions[pageName].tabs[tabName];

        // If any tab is enabled, enable page view
        const anyTabEnabled = Object.values(newPermissions[pageName].tabs).some(v => v === true);
        if (anyTabEnabled) {
            newPermissions[pageName].view = true;
        }

        setRoleForm({ ...roleForm, permissions: newPermissions });
    };

    // ============================================================================
    // RENDER
    // ============================================================================

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4">
                <h1 className="text-2xl font-bold text-gray-900">Users & Roles</h1>
                <p className="text-sm text-gray-600 mt-1">
                    Manage users and configure role-based access control
                </p>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-gray-200 px-6">
                <div className="flex space-x-8">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'users'
                            ? 'border-orange-500 text-orange-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <Icon name="users" className="inline-block w-5 h-5 mr-2" />
                        USERS
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'roles'
                            ? 'border-orange-500 text-orange-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        <Icon name="settings" className="inline-block w-5 h-5 mr-2" />
                        ROLES & PERMISSIONS
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'users' ? (
                    <UsersTab
                        users={users}
                        roles={roles}
                        loading={loadingUsers}
                        onCreateUser={handleCreateUser}
                        onEditUser={handleEditUser}
                        onDeleteUser={handleDeleteUser}
                    />
                ) : (
                    <RolesTab
                        roles={roles}
                        loading={loadingRoles}
                        onCreateRole={handleCreateRole}
                        onEditRole={handleEditRole}
                        onDeleteRole={handleDeleteRole}
                    />
                )}
            </div>

            {/* User Modal */}
            {showUserModal && (
                <UserModal
                    user={editingUser}
                    form={userForm}
                    roles={roles}
                    onFormChange={setUserForm}
                    onSave={handleSaveUser}
                    onClose={() => setShowUserModal(false)}
                />
            )}

            {/* Role Modal */}
            {showRoleModal && (
                <RoleModal
                    role={editingRole}
                    form={roleForm}
                    permissionsStructure={permissionsStructure}
                    onFormChange={setRoleForm}
                    onTogglePage={togglePagePermission}
                    onToggleTab={toggleTabPermission}
                    onSave={handleSaveRole}
                    onClose={() => setShowRoleModal(false)}
                />
            )}
        </div>
    );
};

// ============================================================================
// USERS TAB COMPONENT
// ============================================================================

interface UsersTabProps {
    users: any[];
    roles: any[];
    loading: boolean;
    onCreateUser: () => void;
    onEditUser: (user: any) => void;
    onDeleteUser: (userId: number) => void;
}

const UsersTab: React.FC<UsersTabProps> = ({
    users,
    roles,
    loading,
    onCreateUser,
    onEditUser,
    onDeleteUser
}) => {
    return (
        <div className="bg-white rounded-lg shadow">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Users</h2>
                <button
                    onClick={onCreateUser}
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center"
                >
                    <Icon name="add" className="w-5 h-5 mr-2" />
                    Add User
                </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Username
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Phone
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Roles
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                                    No users found. Click "Add User" to create one.
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr key={user.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {user.username}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.email || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.phone || '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {user.roles.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {user.roles.map((role: any) => (
                                                    <span
                                                        key={role.id}
                                                        className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800"
                                                    >
                                                        {role.name}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-gray-400">No roles assigned</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span
                                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.is_active
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-red-100 text-red-800'
                                                }`}
                                        >
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => onEditUser(user)}
                                            className="text-orange-600 hover:text-orange-900 mr-4"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => onDeleteUser(user.id)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ============================================================================
// ROLES TAB COMPONENT
// ============================================================================

interface RolesTabProps {
    roles: any[];
    loading: boolean;
    onCreateRole: () => void;
    onEditRole: (role: any) => void;
    onDeleteRole: (roleId: number) => void;
}

const RolesTab: React.FC<RolesTabProps> = ({
    roles,
    loading,
    onCreateRole,
    onEditRole,
    onDeleteRole
}) => {
    return (
        <div className="bg-white rounded-lg shadow">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">Roles</h2>
                <button
                    onClick={onCreateRole}
                    className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors flex items-center"
                >
                    <Icon name="add" className="w-5 h-5 mr-2" />
                    Create Role
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                {loading ? (
                    <div className="col-span-full text-center text-gray-500 py-8">
                        Loading roles...
                    </div>
                ) : roles.length === 0 ? (
                    <div className="col-span-full text-center text-gray-500 py-8">
                        No roles found. Click "Create Role" to create one.
                    </div>
                ) : (
                    roles.map((role) => (
                        <div
                            key={role.id}
                            className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">{role.name}</h3>
                                    <p className="text-sm text-gray-500 mt-1">{role.description || 'No description'}</p>
                                </div>
                                <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${role.is_active
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                        }`}
                                >
                                    {role.is_active ? 'Active' : 'Inactive'}
                                </span>
                            </div>

                            <div className="mb-4">
                                <p className="text-xs text-gray-500 mb-2">Permissions:</p>
                                <div className="flex flex-wrap gap-1">
                                    {Object.keys(role.permissions || {}).filter(
                                        (page) => role.permissions[page]?.view
                                    ).length > 0 ? (
                                        Object.keys(role.permissions || {})
                                            .filter((page) => role.permissions[page]?.view)
                                            .slice(0, 3)
                                            .map((page) => (
                                                <span
                                                    key={page}
                                                    className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800"
                                                >
                                                    {page}
                                                </span>
                                            ))
                                    ) : (
                                        <span className="text-xs text-gray-400">No permissions</span>
                                    )}
                                    {Object.keys(role.permissions || {}).filter(
                                        (page) => role.permissions[page]?.view
                                    ).length > 3 && (
                                            <span className="text-xs text-gray-500">
                                                +{Object.keys(role.permissions || {}).filter(
                                                    (page) => role.permissions[page]?.view
                                                ).length - 3} more
                                            </span>
                                        )}
                                </div>
                            </div>

                            <div className="flex justify-end space-x-2">
                                <button
                                    onClick={() => onEditRole(role)}
                                    className="px-3 py-1 text-sm text-orange-600 hover:text-orange-900 font-medium"
                                >
                                    Edit
                                </button>
                                <button
                                    onClick={() => onDeleteRole(role.id)}
                                    className="px-3 py-1 text-sm text-red-600 hover:text-red-900 font-medium"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// ============================================================================
// USER MODAL COMPONENT
// ============================================================================

interface UserModalProps {
    user: any;
    form: any;
    roles: any[];
    onFormChange: (form: any) => void;
    onSave: () => void;
    onClose: () => void;
}

const UserModal: React.FC<UserModalProps> = ({
    user,
    form,
    roles,
    onFormChange,
    onSave,
    onClose
}) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {user ? 'Edit User' : 'Create New User'}
                    </h2>
                </div>

                <div className="px-6 py-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Username *
                        </label>
                        <input
                            type="text"
                            value={form.username}
                            onChange={(e) => onFormChange({ ...form, username: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Enter username"
                            disabled={!!user} // Can't change username for existing users
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => onFormChange({ ...form, email: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Enter email"
                        />
                    </div>

                    {!user && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Password *
                            </label>
                            <input
                                type="password"
                                value={form.password}
                                onChange={(e) => onFormChange({ ...form, password: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                                placeholder="Enter password"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={form.phone}
                            onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Enter phone number"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Assign Roles
                        </label>
                        <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                            {roles.map((role) => (
                                <label key={role.id} className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={form.role_ids.includes(role.id)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                onFormChange({ ...form, role_ids: [...form.role_ids, role.id] });
                                            } else {
                                                onFormChange({
                                                    ...form,
                                                    role_ids: form.role_ids.filter((id: number) => id !== role.id)
                                                });
                                            }
                                        }}
                                        className="mr-2"
                                    />
                                    <span className="text-sm text-gray-700">{role.name}</span>
                                    {role.description && (
                                        <span className="text-xs text-gray-500 ml-2">({role.description})</span>
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                    >
                        {user ? 'Update User' : 'Create User'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// ROLE MODAL COMPONENT
// ============================================================================

interface RoleModalProps {
    role: any;
    form: any;
    permissionsStructure: any;
    onFormChange: (form: any) => void;
    onTogglePage: (pageName: string) => void;
    onToggleTab: (pageName: string, tabName: string) => void;
    onSave: () => void;
    onClose: () => void;
}

const RoleModal: React.FC<RoleModalProps> = ({
    role,
    form,
    permissionsStructure,
    onFormChange,
    onTogglePage,
    onToggleTab,
    onSave,
    onClose
}) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">
                        {role ? 'Edit Role' : 'Create New Role'}
                    </h2>
                </div>

                <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Role Name *
                        </label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={(e) => onFormChange({ ...form, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Enter role name (e.g., Accountant, Sales Manager)"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Description
                        </label>
                        <textarea
                            value={form.description}
                            onChange={(e) => onFormChange({ ...form, description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                            placeholder="Enter role description"
                            rows={2}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Permissions *
                        </label>
                        <p className="text-xs text-gray-500 mb-3">
                            Select which pages and tabs this role can access. Checking a page enables all its tabs.
                        </p>

                        <div className="border border-gray-200 rounded-md p-4 space-y-3 bg-gray-50 max-h-96 overflow-y-auto">
                            {Object.keys(permissionsStructure).map((pageName) => {
                                const pagePerms = form.permissions[pageName] || { view: false, tabs: {} };
                                const tabs = permissionsStructure[pageName].tabs || [];

                                return (
                                    <div key={pageName} className="bg-white rounded-md p-3 border border-gray-200">
                                        {/* Page-level checkbox */}
                                        <label className="flex items-center font-medium text-gray-900 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={pagePerms.view || false}
                                                onChange={() => onTogglePage(pageName)}
                                                className="mr-3 h-4 w-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                                            />
                                            <Icon name="folder" className="w-5 h-5 mr-2 text-orange-600" />
                                            {pageName}
                                        </label>

                                        {/* Tab-level checkboxes */}
                                        {tabs.length > 0 && (
                                            <div className="ml-10 mt-2 space-y-1">
                                                {tabs.map((tabName: string) => (
                                                    <label
                                                        key={tabName}
                                                        className="flex items-center text-sm text-gray-700 cursor-pointer"
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={pagePerms.tabs?.[tabName] || false}
                                                            onChange={() => onToggleTab(pageName, tabName)}
                                                            className="mr-2 h-3 w-3 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                                                        />
                                                        {tabName}
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onSave}
                        className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
                    >
                        {role ? 'Update Role' : 'Create Role'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default UsersAndRolesPage;
