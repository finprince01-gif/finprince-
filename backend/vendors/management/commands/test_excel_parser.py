import os
import django
from django.core.management.base import BaseCommand
from vendors.excel_api import VENDOR_COLUMNS
from core.utils import match_headers

class Command(BaseCommand):
    def handle(self, *args, **options):
        excel_headers = ['PAN Number', 'Contact Person', 'Email Address', 'Contact Number', 'Billing Currency', 'Registration Type', 'GSTIN', 'Branch Name', 'Address Line 1', 'Address Line 2', 'Address Line 3', 'City', 'State', 'Pincode', 'Country']
        header_index = match_headers(excel_headers, VENDOR_COLUMNS)
        print('header_index:', header_index)

        row2 = [None, None, 'asperengg@gmail.com', '99659 51818', None, 'Regular', '33BCNPG4544H1ZN', 'principle', 'No.14', 'ideal', 'Coimbatore', 'Coimbatore', 'Tamilnadu', 641049, 'india']
        row3 = [None, None, None, None, None, 'Regular', '33BCNPG4544H17N', 'example', 'No.23', 'Rakkammal thottam', 'Udayam Palayam', 'Coimbatore', 'Tamilnadu', 641049, 'india']

        for row in [row2, row3]:
            row_data = {}
            for lbl, idx in header_index.items():
                if idx - 1 < len(row):
                    row_data[lbl] = row[idx-1]
            print('row_data GSTIN:', row_data.get('GSTIN'))
            print('row_data Pincode:', row_data.get('Pincode'))
