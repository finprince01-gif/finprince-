# Users & Roles Module Structure

## Directory Structure

### Backend
```
backend/
├── rbac/                           # NEW: Dedicated RBAC App
│   ├── __init__.py
│   ├── apps.py                     # App configuration
│   ├── models.py                   # Role, UserRole models
│   ├── serializers.py              # API serializers
│   ├── views.py                    # RoleViewSet, UserManagementViewSet
│   ├── urls.py                     # URL routing
│   └── admin.py                    # Django admin
│
├── payroll/                        # Similar structure
│   ├── models.py
│   ├── serializers.py
│   ├── views.py
│   └── urls.py
│
├── reports/                        # Similar structure
│   ├── api.py
│   ├── flow.py
│   ├── database.py
│   └── urls.py
│
└── core/                           # Core functionality only
    ├── models.py                   # User, BaseModel
    ├── auth_views.py               # Login, Logout
    ├── urls.py                     # Core routes (NO RBAC)
    └── ...
```

### Frontend
```
frontend/src/
├── pages/
│   ├── UsersAndRoles/              # Users & Roles Page
│   │   ├── UsersAndRoles.tsx       # Main component
│   │   └── index.ts
│   │
│   ├── Payroll/                    # Similar structure
│   │   ├── Payroll.tsx
│   │   └── index.ts
│   │
│   └── Reports/                    # Similar structure
│       ├── Reports.tsx
│       └── index.ts
│
└── services/
    └── api.ts                      # API service (already using /api/rbac/)
```

## API Endpoints

### RBAC Module
```
Base URL: /api/rbac/

Roles:
  GET    /roles/                    - List all roles
  POST   /roles/                    - Create role
  GET    /roles/{id}/               - Get role details
  PUT    /roles/{id}/               - Update role
  DELETE /roles/{id}/               - Delete role
  GET    /roles/permissions_structure/ - Get pages/tabs structure

Users:
  GET    /users/                    - List all users with roles
  POST   /users/                    - Create user with roles
  GET    /users/{id}/               - Get user details
  PUT    /users/{id}/               - Update user
  DELETE /users/{id}/               - Deactivate user
  GET    /users/me/permissions/     - Get current user permissions
  POST   /users/{id}/assign_roles/  - Assign roles to user
  POST   /users/{id}/remove_role/   - Remove role from user

User-Roles:
  GET    /user-roles/               - List all user-role assignments
  POST   /user-roles/               - Create assignment
  DELETE /user-roles/{id}/          - Remove assignment
```

### Payroll Module (for comparison)
```
Base URL: /api/payroll/

GET    /employees/
POST   /employees/
GET    /salary-templates/
POST   /pay-runs/
...
```

### Reports Module (for comparison)
```
Base URL: /api/reports/

GET    /placeholder/
GET    /daybook/excel/
GET    /trialbalance/excel/
...
```

## Data Models

### Role Model
```python
class Role(BaseModel):
    name = CharField(max_length=100)
    description = TextField(blank=True, null=True)
    permissions = JSONField(default=dict)
    is_active = BooleanField(default=True)
    
    # Inherited from BaseModel:
    # - tenant_id
    # - created_at
    # - updated_at
```

### UserRole Model
```python
class UserRole(BaseModel):
    user = ForeignKey(User)
    role = ForeignKey(Role)
    username = CharField(max_length=150)
    email = CharField(max_length=254)
    phone = CharField(max_length=15)
    assigned_at = DateTimeField(auto_now_add=True)
    assigned_by = ForeignKey(User)
    
    # Inherited from BaseModel:
    # - tenant_id
    # - created_at
    # - updated_at
```

## Permissions Structure

Permissions are stored as JSON in the Role model:

```json
{
  "Dashboard": {
    "view": true,
    "tabs": {}
  },
  "Inventory": {
    "view": true,
    "tabs": {
      "Master": true,
      "Operations": false,
      "Reports": true
    }
  },
  "Vouchers": {
    "view": true,
    "tabs": {
      "Sales": true,
      "Purchase": true,
      "Payment": false,
      "Receipt": false
    }
  },
  "Users & Roles": {
    "view": true,
    "tabs": {
      "Users": true,
      "Roles": true
    }
  }
}
```

## Frontend Component Structure

### UsersAndRoles.tsx
```typescript
UsersAndRolesPage
├── Header
├── Tabs (Users | Roles & Permissions)
├── Content
│   ├── UsersTab
│   │   ├── User Table
│   │   └── Actions (Create, Edit, Delete)
│   └── RolesTab
│       ├── Role Cards
│       └── Actions (Create, Edit, Delete)
├── Modals
│   ├── UserModal (Create/Edit User)
│   └── RoleModal (Create/Edit Role with Permissions)
```

## Consistency Across Modules

All modules now follow the same pattern:

| Module        | Backend App | Frontend Page    | API Base URL      |
|---------------|-------------|------------------|-------------------|
| Users & Roles | `rbac/`     | `UsersAndRoles/` | `/api/rbac/`      |
| Payroll       | `payroll/`  | `Payroll/`       | `/api/payroll/`   |
| Reports       | `reports/`  | `Reports/`       | `/api/reports/`   |
| Inventory     | `inventory/`| `Inventory/`     | `/api/inventory/` |
| Vendors       | `vendors/`  | `VendorPortal/`  | `/api/vendors/`   |

## Benefits

1. **Modular**: Each feature is self-contained
2. **Scalable**: Easy to add new modules
3. **Maintainable**: Clear separation of concerns
4. **Consistent**: Same pattern across all modules
5. **Clean**: No mixing of concerns in core app
