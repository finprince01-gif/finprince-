import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models import TransactionFile

tf = TransactionFile.objects.filter(ledger_name='cash3').first()
print("tf:", tf)
if tf:
    print("tf.transactions:", tf.transactions)
