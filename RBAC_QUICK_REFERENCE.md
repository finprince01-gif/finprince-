# Quick Reference: RBAC Module

## What Changed?

The Users & Roles functionality has been restructured to follow the same pattern as Payroll and Reports modules.

### Before
```
core/rbac_models.py       → Mixed with core
core/rbac_serializers.py  → Mixed with core  
core/rbac_views.py        → Mixed with core
core/urls.py              → RBAC routes mixed in
```

### After
```
rbac/models.py            → Dedicated app
rbac/serializers.py       → Dedicated app
rbac/views.py             → Dedicated app
rbac/urls.py              → Dedicated app
rbac/admin.py             → Dedicated app
```

## File Locations

### Backend Files
- **Models**: `backend/rbac/models.py`
- **Serializers**: `backend/rbac/serializers.py`
- **Views**: `backend/rbac/views.py`
- **URLs**: `backend/rbac/urls.py`
- **Admin**: `backend/rbac/admin.py`

### Frontend Files
- **Page**: `frontend/src/pages/UsersAndRoles/UsersAndRoles.tsx`
- **API Service**: `frontend/src/services/api.ts` (lines 694-838)

## API Endpoints

All RBAC endpoints are now under `/api/rbac/`:

```
# Roles
GET    /api/rbac/roles/
POST   /api/rbac/roles/
GET    /api/rbac/roles/{id}/
PUT    /api/rbac/roles/{id}/
DELETE /api/rbac/roles/{id}/
GET    /api/rbac/roles/permissions_structure/

# Users
GET    /api/rbac/users/
POST   /api/rbac/users/
GET    /api/rbac/users/{id}/
PUT    /api/rbac/users/{id}/
DELETE /api/rbac/users/{id}/
GET    /api/rbac/users/me/permissions/
POST   /api/rbac/users/{id}/assign_roles/
POST   /api/rbac/users/{id}/remove_role/

# User-Roles
GET    /api/rbac/user-roles/
POST   /api/rbac/user-roles/
DELETE /api/rbac/user-roles/{id}/
```

## How to Add a New Feature to RBAC

1. **Add Model** in `rbac/models.py`
2. **Add Serializer** in `rbac/serializers.py`
3. **Add ViewSet** in `rbac/views.py`
4. **Register Route** in `rbac/urls.py`
5. **Update Frontend** in `frontend/src/services/api.ts`

## Comparison with Other Modules

### Payroll Module
```
backend/payroll/
├── models.py       → Employee, Salary, PayRun
├── serializers.py  → EmployeeSerializer, etc.
├── views.py        → EmployeeViewSet, etc.
└── urls.py         → /api/payroll/
```

### Reports Module
```
backend/reports/
├── api.py          → Report views
├── flow.py         → Business logic
├── database.py     → Database queries
└── urls.py         → /api/reports/
```

### RBAC Module (NEW)
```
backend/rbac/
├── models.py       → Role, UserRole
├── serializers.py  → RoleSerializer, etc.
├── views.py        → RoleViewSet, etc.
└── urls.py         → /api/rbac/
```

## Testing the Changes

1. **Check Django configuration**:
   ```bash
   cd backend
   python manage.py check
   ```

2. **Test RBAC endpoints**:
   ```bash
   # Get roles
   curl http://localhost:8000/api/rbac/roles/
   
   # Get users
   curl http://localhost:8000/api/rbac/users/
   
   # Get permissions structure
   curl http://localhost:8000/api/rbac/roles/permissions_structure/
   ```

3. **Test frontend**:
   - Navigate to Users & Roles page
   - Create a new role
   - Create a new user
   - Assign roles to user

## Next Steps (Optional Cleanup)

After verifying everything works:

1. **Remove old RBAC files from core**:
   - `backend/core/rbac_models.py`
   - `backend/core/rbac_serializers.py`
   - `backend/core/rbac_views.py`

2. **Update imports** if any other files import from old locations

## Common Issues

### Import Errors
If you see `ModuleNotFoundError: No module named 'rbac'`:
- Make sure `'rbac'` is in `INSTALLED_APPS` in `settings.py`
- Restart the Django server

### 404 Errors on API
If `/api/rbac/` returns 404:
- Check that `path('api/rbac/', include('rbac.urls'))` is in `backend/urls.py`
- Restart the Django server

### Database Errors
The models use the same table names, so no migrations are needed:
- `rbac_roles` table (already exists)
- `rbac_user_roles` table (already exists)

## Summary

✅ RBAC is now a dedicated app like Payroll and Reports
✅ All endpoints are under `/api/rbac/`
✅ Frontend code requires no changes
✅ Database structure unchanged
✅ Consistent pattern across all modules
