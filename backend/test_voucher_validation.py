
import os
import django
import sys

# Add the backend directory to sys.path
sys.path.append(r'd:\finpixe\Ai_Accounting_v1-10\AI-accounting-0.03\backend')

# Set up Django settings
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.serializers_voucher_purchase import VoucherPurchaseSupplyINRDetailsSerializer
from rest_framework import serializers

def test_negative_validation():
    data = {
        'purchase_order_no': 'PO-001',
        'purchase_ledger': 'Purchases',
        'items': [
            {
                'itemCode': 'ITEM1',
                'itemName': 'Item 1',
                'qty': -10,
                'rate': 100,
                'taxableValue': -1000,
                'cgst': 0,
                'sgst': 0,
                'cess': 0,
                'invoiceValue': -1000
            }
        ]
    }
    
    serializer = VoucherPurchaseSupplyINRDetailsSerializer(data=data)
    try:
        serializer.is_valid(raise_exception=True)
        print("Test Failed: Negative qty was accepted.")
    except serializers.ValidationError as e:
        print(f"Test Passed: Negative qty was rejected. Error: {e}")

    data['items'][0]['qty'] = 10
    data['items'][0]['rate'] = -100
    serializer = VoucherPurchaseSupplyINRDetailsSerializer(data=data)
    try:
        serializer.is_valid(raise_exception=True)
        print("Test Failed: Negative rate was accepted.")
    except serializers.ValidationError as e:
        print(f"Test Passed: Negative rate was rejected. Error: {e}")

    data['items'][0]['rate'] = 100
    data['items'][0]['cgst'] = -5
    serializer = VoucherPurchaseSupplyINRDetailsSerializer(data=data)
    try:
        serializer.is_valid(raise_exception=True)
        print("Test Failed: Negative cgst was accepted.")
    except serializers.ValidationError as e:
        print(f"Test Passed: Negative cgst was rejected. Error: {e}")

    # Test valid data
    data['items'][0]['cgst'] = 5
    serializer = VoucherPurchaseSupplyINRDetailsSerializer(data=data)
    if serializer.is_valid():
        print("Test Passed: Valid data was accepted.")
    else:
        print(f"Test Failed: Valid data was rejected. Error: {serializer.errors}")

if __name__ == "__main__":
    test_negative_validation()
