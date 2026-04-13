"""
List All Users
==============
Management command to list all users in the system
"""

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()


class Command(BaseCommand):
    help = 'List all users in the system'

    def handle(self, *args, **options):
        users = User.objects.all().order_by('tenant_id', 'username')
        
        self.stdout.write(self.style.SUCCESS(f'\n=== All Users ({users.count()}) ===\n'))
        
        for user in users:
            self.stdout.write(f'Username: {user.username}')
            self.stdout.write(f'  Email: {user.email}')
            self.stdout.write(f'  Branch ID: {user.branch_id}')
            self.stdout.write(f'  Is Superuser: {user.is_superuser}')
            self.stdout.write(f'  Is Active: {user.is_active}')
            self.stdout.write('')
