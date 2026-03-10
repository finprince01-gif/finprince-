import os
import django
import sys

# Set up Django environment
sys.path.append('c:/108/muthu/AI-accounting-0.03/backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User, AIUsage
from accounting.utils_subscription import get_invoice_usage
from datetime import datetime

user = User.objects.get(username='budstech')
print(f"User: {user.username}")
print(f"Tenant ID: {user.tenant_id}")

now = datetime.now()
print(f"Current Year: {now.year}, Month: {now.month}")

# Test the function directly
usage = get_invoice_usage(user)
print(f"Usage from get_invoice_usage: {usage}")

# Manual query
manual_usage = AIUsage.objects.filter(
    tenant_id=user.tenant_id,
    year=now.year,
    month=now.month
).first()

if manual_usage:
    print(f"Manual Query: Found record with count {manual_usage.used_count}")
else:
    print("Manual Query: No record found")
    # List all records for this tenant
    print("All records for this tenant:")
    for u in AIUsage.objects.filter(tenant_id=user.tenant_id):
        print(f"  Year: {u.year}, Month: {u.month}, Count: {u.used_count}")
