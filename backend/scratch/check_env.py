import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()
print(f"SQS_URL: {os.getenv('SQS_PROCESSING_QUEUE_URL')}")
print(f"AWS_REGION: {os.getenv('AWS_REGION')}")
print(f"AWS_ACCESS_KEY_ID: {os.getenv('AWS_ACCESS_KEY_ID')[:5]}...")
