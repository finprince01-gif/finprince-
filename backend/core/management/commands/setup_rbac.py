"""
Setup RBAC with Full Permissions
==================================
Management command to initialize RBAC system with full permissions for all users
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db import connection

User = get_user_model()


class Command(BaseCommand):
    help = 'Setup RBAC tables and grant full permissions to all users'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n=== RBAC Setup ===\n'))
        
        # Check if RBAC tables exist
        with connection.cursor() as cursor:
            cursor.execute("""
                SELECT COUNT(*)
                FROM information_schema.tables 
                WHERE table_schema = DATABASE()
                AND table_name IN ('rbac_roles', 'rbac_user_roles')
            """)
            table_count = cursor.fetchone()[0]
            
            if table_count == 0:
                self.stdout.write(self.style.WARNING('RBAC tables do not exist. Creating them...'))
                
                # Create rbac_roles table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS rbac_roles (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        tenant_id VARCHAR(36) NOT NULL,
                        name VARCHAR(100) NOT NULL,
                        description TEXT,
                        permissions JSON NOT NULL,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_role_per_tenant (tenant_id, name),
                        INDEX idx_tenant (tenant_id)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                # Create rbac_user_roles table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS rbac_user_roles (
                        id BIGINT AUTO_INCREMENT PRIMARY KEY,
                        tenant_id VARCHAR(36) NOT NULL,
                        user_id BIGINT NOT NULL,
                        role_id BIGINT NOT NULL,
                        username VARCHAR(150),
                        email VARCHAR(254),
                        phone VARCHAR(15),
                        assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        assigned_by_id BIGINT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        UNIQUE KEY unique_user_role (user_id, role_id, tenant_id),
                        INDEX idx_tenant (tenant_id),
                        INDEX idx_user (user_id),
                        INDEX idx_role (role_id),
                        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                        FOREIGN KEY (role_id) REFERENCES rbac_roles(id) ON DELETE CASCADE
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """)
                
                self.stdout.write(self.style.SUCCESS('✓ RBAC tables created'))
            else:
                self.stdout.write(self.style.SUCCESS('✓ RBAC tables already exist'))
        
        # Define full permissions
        full_permissions = {
            "Dashboard": {"view": True, "tabs": {}},
            "Masters": {"view": True, "tabs": {"Ledgers": True, "Ledger Groups": True, "Chart of Accounts": True}},
            "Inventory": {"view": True, "tabs": {"Master": True, "Operations": True, "Reports": True}},
            "Vouchers": {"view": True, "tabs": {"Sales": True, "Purchase": True, "Payment": True, "Receipt": True, "Contra": True, "Journal": True, "Expenses": True}},
            "Vendor Portal": {"view": True, "tabs": {"Vendors": True, "Purchase Orders": True, "Payments": True}},
            "Customer Portal": {"view": True, "tabs": {"Customers": True, "Sales Orders": True, "Receipts": True}},
            "Payroll": {"view": True, "tabs": {"Employees": True, "Salary": True, "Attendance": True, "Reports": True}},
            "Service": {"view": True, "tabs": {"Services": True, "Bookings": True, "Invoices": True}},
            "GST": {"view": True, "tabs": {"GSTR-1": True, "GSTR-3B": True, "GST Reports": True}},
            "Reports": {"view": True, "tabs": {"Trial Balance": True, "Profit & Loss": True, "Balance Sheet": True, "GST Reports": True, "Ledger Reports": True}},
            "Settings": {"view": True, "tabs": {"Company": True, "Users": True, "Preferences": True, "Integrations": True}},
            "Users & Roles": {"view": True, "tabs": {"Users": True, "Roles": True}}
        }
        
        import json
        permissions_json = json.dumps(full_permissions)
        
        # Get all tenants
        users = User.objects.filter(is_superuser=False).values_list('tenant_id', flat=True).distinct()
        
        self.stdout.write(f'\nFound {len(users)} tenant(s)\n')
        
        for tenant_id in users:
            if not tenant_id:
                continue
                
            self.stdout.write(f'Processing tenant: {tenant_id}')
            
            # Create "Full Access" role for this tenant
            with connection.cursor() as cursor:
                # Check if role exists
                cursor.execute("""
                    SELECT id FROM rbac_roles 
                    WHERE tenant_id = %s AND name = 'Full Access'
                """, [tenant_id])
                
                role_row = cursor.fetchone()
                
                if role_row:
                    role_id = role_row[0]
                    # Update existing role
                    cursor.execute("""
                        UPDATE rbac_roles 
                        SET permissions = %s, is_active = TRUE
                        WHERE id = %s
                    """, [permissions_json, role_id])
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Updated "Full Access" role'))
                else:
                    # Create new role
                    cursor.execute("""
                        INSERT INTO rbac_roles (tenant_id, name, description, permissions, is_active)
                        VALUES (%s, %s, %s, %s, TRUE)
                    """, [tenant_id, 'Full Access', 'Full access to all features', permissions_json])
                    role_id = cursor.lastrowid
                    self.stdout.write(self.style.SUCCESS(f'  ✓ Created "Full Access" role'))
                
                # Assign role to all non-superuser users in this tenant
                tenant_users = User.objects.filter(tenant_id=tenant_id, is_superuser=False)
                
                for user in tenant_users:
                    # Check if user already has this role
                    cursor.execute("""
                        SELECT id FROM rbac_user_roles 
                        WHERE user_id = %s AND role_id = %s AND tenant_id = %s
                    """, [user.id, role_id, tenant_id])
                    
                    if not cursor.fetchone():
                        # Assign role to user
                        cursor.execute("""
                            INSERT INTO rbac_user_roles 
                            (tenant_id, user_id, role_id, username, email, phone)
                            VALUES (%s, %s, %s, %s, %s, %s)
                        """, [tenant_id, user.id, role_id, user.username, user.email, user.phone])
                        self.stdout.write(self.style.SUCCESS(f'  ✓ Assigned role to user: {user.username}'))
                    else:
                        self.stdout.write(f'  - User {user.username} already has role')
        
        self.stdout.write(self.style.SUCCESS(f'\n✓ RBAC setup complete!'))
        self.stdout.write(self.style.WARNING('\nNote: Users need to refresh their browser for changes to take effect.'))
