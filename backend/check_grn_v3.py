import os
import django
import sys

# Ensure current directory is in sys.path
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from core.models import User
from inventory.models import InventoryMasterGRN


for user in User.objects.all():



for grn in InventoryMasterGRN.objects.all():

