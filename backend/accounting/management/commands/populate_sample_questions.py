"""
Django management command to populate sample questions for the dynamic questions system.

Usage:
    python manage.py populate_sample_questions
"""

from django.core.management.base import BaseCommand
from accounting.models_questions import MasterQuestion, HierarchyQuestionMapping


class Command(BaseCommand):
    help = 'Populate sample questions and mappings for testing the dynamic questions system'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n🚀 Starting sample questions population...\n'))
        
        # Clear existing data (optional - comment out if you want to preserve existing data)
        # MasterQuestion.objects.all().delete()
        # HierarchyQuestionMapping.objects.all().delete()
        
        # Create questions
        questions = self.create_questions()
        
        # Create mappings
        self.create_mappings(questions)
        
        self.stdout.write(self.style.SUCCESS('\n✅ Sample questions populated successfully!\n'))
        self.show_summary()
    
    def create_questions(self):
        """Create sample questions"""
        self.stdout.write('📝 Creating questions...')
        
        questions = {}
        
        # Financial Questions
        questions['Q_OPENING_BALANCE'] = MasterQuestion.objects.get_or_create(
            question_code='Q_OPENING_BALANCE',
            defaults={
                'question_text': 'Opening Balance',
                'question_type': 'decimal',
                'is_required': True,
                'validation_rules': {'min': 0, 'max': 999999999.99, 'decimal_places': 2},
                'default_value': '0.00',
                'help_text': 'Enter the opening balance for this ledger',
                'display_order': 1
            }
        )[0]
        
        questions['Q_CREDIT_LIMIT'] = MasterQuestion.objects.get_or_create(
            question_code='Q_CREDIT_LIMIT',
            defaults={
                'question_text': 'Credit Limit',
                'question_type': 'decimal',
                'is_required': False,
                'validation_rules': {'min': 0, 'max': 999999999.99, 'decimal_places': 2},
                'help_text': 'Maximum credit allowed for this party',
                'display_order': 2
            }
        )[0]
        
        questions['Q_CREDIT_DAYS'] = MasterQuestion.objects.get_or_create(
            question_code='Q_CREDIT_DAYS',
            defaults={
                'question_text': 'Credit Period (Days)',
                'question_type': 'number',
                'is_required': False,
                'validation_rules': {'min': 0, 'max': 365},
                'default_value': '0',
                'help_text': 'Number of days credit allowed',
                'display_order': 3
            }
        )[0]
        
        # GST Related Questions
        questions['Q_GSTIN'] = MasterQuestion.objects.get_or_create(
            question_code='Q_GSTIN',
            defaults={
                'question_text': 'GSTIN',
                'question_type': 'gstin',
                'is_required': False,
                'validation_rules': {'pattern': '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'},
                'help_text': 'Enter 15-digit GSTIN (e.g., 27AABCU9603R1ZM)',
                'display_order': 4
            }
        )[0]
        
        questions['Q_STATE'] = MasterQuestion.objects.get_or_create(
            question_code='Q_STATE',
            defaults={
                'question_text': 'State',
                'question_type': 'dropdown',
                'is_required': False,
                'validation_rules': {
                    'options': [
                        'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
                        'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
                        'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
                        'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
                        'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
                        'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
                    ]
                },
                'help_text': 'Select the state for GST registration',
                'display_order': 5
            }
        )[0]
        
        questions['Q_REGISTRATION_TYPE'] = MasterQuestion.objects.get_or_create(
            question_code='Q_REGISTRATION_TYPE',
            defaults={
                'question_text': 'GST Registration Type',
                'question_type': 'dropdown',
                'is_required': False,
                'validation_rules': {'options': ['Regular', 'Composition', 'Unregistered']},
                'default_value': 'Regular',
                'help_text': 'Type of GST registration',
                'display_order': 6
            }
        )[0]
        
        # Party Related Questions
        questions['Q_PARTY_TYPE'] = MasterQuestion.objects.get_or_create(
            question_code='Q_PARTY_TYPE',
            defaults={
                'question_text': 'Party Type',
                'question_type': 'dropdown',
                'is_required': False,
                'validation_rules': {'options': ['Customer', 'Vendor', 'Both']},
                'help_text': 'Is this party a customer, vendor, or both?',
                'display_order': 7
            }
        )[0]
        
        questions['Q_PAN'] = MasterQuestion.objects.get_or_create(
            question_code='Q_PAN',
            defaults={
                'question_text': 'PAN',
                'question_type': 'pan',
                'is_required': False,
                'validation_rules': {'pattern': '^[A-Z]{5}[0-9]{4}[A-Z]{1}$'},
                'help_text': 'Enter 10-character PAN (e.g., ABCDE1234F)',
                'display_order': 8
            }
        )[0]
        
        questions['Q_EMAIL'] = MasterQuestion.objects.get_or_create(
            question_code='Q_EMAIL',
            defaults={
                'question_text': 'Email Address',
                'question_type': 'email',
                'is_required': False,
                'validation_rules': {'pattern': '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'},
                'help_text': 'Email address for communication',
                'display_order': 9
            }
        )[0]
        
        questions['Q_PHONE'] = MasterQuestion.objects.get_or_create(
            question_code='Q_PHONE',
            defaults={
                'question_text': 'Phone Number',
                'question_type': 'phone',
                'is_required': False,
                'validation_rules': {'pattern': '^[6-9][0-9]{9}$'},
                'help_text': 'Enter 10-digit mobile number',
                'display_order': 10
            }
        )[0]
        
        questions['Q_ADDRESS'] = MasterQuestion.objects.get_or_create(
            question_code='Q_ADDRESS',
            defaults={
                'question_text': 'Address',
                'question_type': 'text',
                'is_required': False,
                'validation_rules': {'max_length': 500},
                'help_text': 'Full address of the party',
                'display_order': 11
            }
        )[0]
        
        # Bank Related Questions
        questions['Q_BANK_NAME'] = MasterQuestion.objects.get_or_create(
            question_code='Q_BANK_NAME',
            defaults={
                'question_text': 'Bank Name',
                'question_type': 'text',
                'is_required': False,
                'validation_rules': {'max_length': 255},
                'help_text': 'Name of the bank',
                'display_order': 12
            }
        )[0]
        
        questions['Q_ACCOUNT_NUMBER'] = MasterQuestion.objects.get_or_create(
            question_code='Q_ACCOUNT_NUMBER',
            defaults={
                'question_text': 'Account Number',
                'question_type': 'text',
                'is_required': False,
                'validation_rules': {'max_length': 20},
                'help_text': 'Bank account number',
                'display_order': 13
            }
        )[0]
        
        questions['Q_IFSC_CODE'] = MasterQuestion.objects.get_or_create(
            question_code='Q_IFSC_CODE',
            defaults={
                'question_text': 'IFSC Code',
                'question_type': 'text',
                'is_required': False,
                'validation_rules': {'pattern': '^[A-Z]{4}0[A-Z0-9]{6}$'},
                'help_text': 'Bank IFSC code (e.g., SBIN0001234)',
                'display_order': 14
            }
        )[0]
        
        self.stdout.write(self.style.SUCCESS(f'   ✅ Created {len(questions)} questions'))
        return questions
    
    def create_mappings(self, questions):
        """Create sample hierarchy-question mappings"""
        self.stdout.write('🔗 Creating hierarchy mappings...')
        
        mappings_created = 0
        
        # Sundry Debtors (Customers)
        debtors_questions = [
            'Q_OPENING_BALANCE', 'Q_CREDIT_LIMIT', 'Q_CREDIT_DAYS',
            'Q_GSTIN', 'Q_STATE', 'Q_PAN', 'Q_EMAIL', 'Q_PHONE', 'Q_ADDRESS'
        ]
        for q_code in debtors_questions:
            HierarchyQuestionMapping.objects.get_or_create(
                category='Assets',
                group='Current Assets',
                sub_group_1='Sundry Debtors',
                sub_group_2=None,
                sub_group_3=None,
                ledger_type=None,
                question=questions[q_code]
            )
            mappings_created += 1
        
        # Sundry Creditors (Vendors)
        creditors_questions = [
            'Q_OPENING_BALANCE', 'Q_CREDIT_LIMIT', 'Q_CREDIT_DAYS',
            'Q_GSTIN', 'Q_STATE', 'Q_PAN', 'Q_EMAIL', 'Q_PHONE', 'Q_ADDRESS'
        ]
        for q_code in creditors_questions:
            HierarchyQuestionMapping.objects.get_or_create(
                category='Liabilities',
                group='Current Liabilities',
                sub_group_1='Sundry Creditors',
                sub_group_2=None,
                sub_group_3=None,
                ledger_type=None,
                question=questions[q_code]
            )
            mappings_created += 1
        
        # Bank Accounts
        bank_questions = [
            'Q_OPENING_BALANCE', 'Q_BANK_NAME', 'Q_ACCOUNT_NUMBER', 'Q_IFSC_CODE'
        ]
        for q_code in bank_questions:
            HierarchyQuestionMapping.objects.get_or_create(
                category='Assets',
                group='Current Assets',
                sub_group_1='Bank Accounts',
                sub_group_2=None,
                sub_group_3=None,
                ledger_type=None,
                question=questions[q_code]
            )
            mappings_created += 1
        
        # Cash in Hand
        HierarchyQuestionMapping.objects.get_or_create(
            category='Assets',
            group='Current Assets',
            sub_group_1='Cash in Hand',
            sub_group_2=None,
            sub_group_3=None,
            ledger_type=None,
            question=questions['Q_OPENING_BALANCE']
        )
        mappings_created += 1
        
        self.stdout.write(self.style.SUCCESS(f'   ✅ Created {mappings_created} mappings'))
    
    def show_summary(self):
        """Show summary of created data"""
        total_questions = MasterQuestion.objects.count()
        total_mappings = HierarchyQuestionMapping.objects.count()
        
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('📊 SUMMARY'))
        self.stdout.write('='*60)
        self.stdout.write(f'Total Questions: {total_questions}')
        self.stdout.write(f'Total Mappings: {total_mappings}')
        
        self.stdout.write('\n📝 Sample Questions:')
        for q in MasterQuestion.objects.all().order_by('display_order')[:5]:
            self.stdout.write(f'   • {q.question_code}: {q.question_text} ({q.question_type})')
        
        self.stdout.write('\n🔗 Sample Mappings:')
        self.stdout.write('   • Sundry Debtors: 9 questions')
        self.stdout.write('   • Sundry Creditors: 9 questions')
        self.stdout.write('   • Bank Accounts: 4 questions')
        self.stdout.write('   • Cash in Hand: 1 question')
        
        self.stdout.write('\n' + '='*60)
        self.stdout.write(self.style.SUCCESS('\n🎉 Ready to test! Try the API endpoints now.\n'))
