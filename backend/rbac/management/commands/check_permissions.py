"""
Check User Permissions
======================
Management command to check current user's roles and permissions
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from rbac.models import Role, UserRole
import json

User = get_user_model()


class Command(BaseCommand):
    help = 'Check user roles and permissions'

    def add_arguments(self, parser):
        parser.add_argument('username', type=str, help='Username to check')

    def handle(self, *args, **options):
        username = options['username']
        
        try:
            user = User.objects.get(username=username)
            
            self.stdout.write(self.style.SUCCESS(f'\n=== User: {user.username} ==='))
            self.stdout.write(f'Email: {user.email}')
            self.stdout.write(f'Tenant ID: {user.tenant_id}')
            self.stdout.write(f'Is Superuser: {user.is_superuser}')
            self.stdout.write(f'Is Active: {user.is_active}')
            
            # Get user's roles
            user_roles = UserRole.objects.filter(user=user, tenant_id=user.tenant_id)
            
            self.stdout.write(self.style.SUCCESS(f'\n=== Roles ({user_roles.count()}) ==='))
            
            if user_roles.count() == 0:
                self.stdout.write(self.style.WARNING('No roles assigned!'))
            
            for ur in user_roles:
                self.stdout.write(f'\nRole: {ur.role.name}')
                self.stdout.write(f'Description: {ur.role.description}')
                self.stdout.write(f'Is Active: {ur.role.is_active}')
                self.stdout.write(f'Permissions:')
                self.stdout.write(json.dumps(ur.role.permissions, indent=2))
            
            # Show all available roles
            all_roles = Role.objects.filter(tenant_id=user.tenant_id)
            self.stdout.write(self.style.SUCCESS(f'\n=== All Available Roles ({all_roles.count()}) ==='))
            for role in all_roles:
                self.stdout.write(f'\n{role.id}. {role.name} - {role.description}')
                self.stdout.write(f'   Permissions: {json.dumps(role.permissions, indent=2)}')
            
        except User.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'User "{username}" not found'))
