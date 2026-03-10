import os
import django
import sys

# Set up Django environment
sys.path.append('c:/108/muthu/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User

print("Users in DB (first 20):")
for u in User.objects.all()[:20]:
    print(f"|{u.username}|, ID: {u.id}, Email: {u.email}")
