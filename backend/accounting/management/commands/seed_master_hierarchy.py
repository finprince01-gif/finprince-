import csv
import os
from django.core.management.base import BaseCommand
from accounting.models import MasterHierarchyRaw

class Command(BaseCommand):
    help = 'Seeds MasterHierarchyRaw from a CSV file'

    def add_arguments(self, parser):
        parser.add_argument('csv_path', type=str, help='Path to the CSV file')

    def handle(self, *args, **kwargs):
        csv_path = kwargs['csv_path']
        if not os.path.exists(csv_path):
            self.stdout.write(self.style.ERROR(f'File not found: {csv_path}'))
            return

        self.stdout.write('Clearing existing MasterHierarchyRaw data...')
        MasterHierarchyRaw.objects.all().delete()

        self.stdout.write('Importing new data from CSV...')
        with open(csv_path, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                # The headers might have extra spaces, so strip them
                cleaned_row = {k.strip(): str(v).strip() if v else '' for k, v in row.items()}
                
                # Check if it's a valid row (at least Type of Business must be present)
                if not cleaned_row.get('Type of Business'):
                    continue

                MasterHierarchyRaw.objects.create(
                    type_of_business_1=cleaned_row.get('Type of Business'),
                    financial_reporting_1=cleaned_row.get('Financial Reporting'),
                    major_group_1=cleaned_row.get('Major Group'),
                    group_1=cleaned_row.get('Group'),
                    sub_group_1_1=cleaned_row.get('Sub-group 1'),
                    sub_group_2_1=cleaned_row.get('Sub-group 2'),
                    sub_group_3_1=cleaned_row.get('Sub-group 3'),
                    ledger_1=cleaned_row.get('Ledgers'),
                    code=cleaned_row.get('Code')
                )
                count += 1

        self.stdout.write(self.style.SUCCESS(f'Successfully imported {count} rows into MasterHierarchyRaw!'))
