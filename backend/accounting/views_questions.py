"""
Dynamic Questions System API Views
===================================

These views implement the API endpoints for the dynamic questions system.
"""

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db import connection
import json
import re


class LedgerQuestionsView(APIView):
    """
    Get questions for a specific hierarchy node.
    
    POST /api/ledgers/questions/
    {
        "category": "Assets",
        "group": "Current Assets",
        "sub_group_1": "Sundry Debtors",
        "sub_group_2": null,
        "sub_group_3": null,
        "ledger_type": null
    }
    
    Returns:
    {
        "success": true,
        "hierarchy_node": {
            "category": "Assets",
            "code": "1010201000000000"
        },
        "questions": [...]
    }
    """
    
    def post(self, request):
        # Extract hierarchy path from request
        category = request.data.get('category')
        group = request.data.get('group')
        sub_group_1 = request.data.get('sub_group_1')
        sub_group_2 = request.data.get('sub_group_2')
        sub_group_3 = request.data.get('sub_group_3')
        ledger_type = request.data.get('ledger_type')
        
        # Get ledger code from master_hierarchy_raw
        hierarchy_node = self.get_hierarchy_node(
            category, group, sub_group_1, sub_group_2, sub_group_3, ledger_type
        )
        
        if not hierarchy_node:
            return Response({
                'success': False,
                'error': 'Invalid hierarchy selection - no matching node found in master_hierarchy_raw'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get questions mapped to this hierarchy node
        questions = self.get_questions_for_hierarchy(
            category, group, sub_group_1, sub_group_2, sub_group_3, ledger_type
        )
        
        return Response({
            'success': True,
            'hierarchy_node': {
                'category': category,
                'group': group,
                'sub_group_1': sub_group_1,
                'sub_group_2': sub_group_2,
                'sub_group_3': sub_group_3,
                'ledger_type': ledger_type,
                'code': hierarchy_node.get('code')
            },
            'questions': questions
        })
    
    def get_hierarchy_node(self, category, group, sub_group_1, sub_group_2, sub_group_3, ledger_type):
        """
        Get hierarchy node from master_hierarchy_raw.
        Returns the code and full hierarchy path.
        """
        with connection.cursor() as cursor:
            # Build dynamic WHERE clause
            where_clauses = []
            params = []
            
            if category:
                where_clauses.append("major_group_1 = %s")
                params.append(category)
            if group:
                where_clauses.append("group_1 = %s")
                params.append(group)
            if sub_group_1:
                where_clauses.append("sub_group_1_1 = %s")
                params.append(sub_group_1)
            if sub_group_2:
                where_clauses.append("sub_group_2_1 = %s")
                params.append(sub_group_2)
            if sub_group_3:
                where_clauses.append("sub_group_3_1 = %s")
                params.append(sub_group_3)
            if ledger_type:
                where_clauses.append("ledger_1 = %s")
                params.append(ledger_type)
            
            if not where_clauses:
                return None
            
            query = f"""
                SELECT code, major_group_1, group_1, sub_group_1_1, 
                       sub_group_2_1, sub_group_3_1, ledger_1
                FROM master_hierarchy_raw
                WHERE {' AND '.join(where_clauses)}
                LIMIT 1
            """
            
            cursor.execute(query, params)
            row = cursor.fetchone()
            
            if row:
                return {
                    'code': row[0],
                    'category': row[1],
                    'group': row[2],
                    'sub_group_1': row[3],
                    'sub_group_2': row[4],
                    'sub_group_3': row[5],
                    'ledger_type': row[6]
                }
        
        return None
    
    def get_questions_for_hierarchy(self, category, group, sub_group_1, sub_group_2, sub_group_3, ledger_type):
        """
        Get all questions mapped to this hierarchy path.
        Matches exact hierarchy including NULL values.
        """
        with connection.cursor() as cursor:
            # Build WHERE clause for exact match (including NULLs)
            where_clauses = []
            params = []
            
            # Helper function to add NULL-safe comparison
            def add_null_safe_clause(field, value):
                if value is None:
                    where_clauses.append(f"{field} IS NULL")
                else:
                    where_clauses.append(f"{field} = %s")
                    params.append(value)
            
            add_null_safe_clause('category', category)
            add_null_safe_clause('`group`', group)
            add_null_safe_clause('sub_group_1', sub_group_1)
            add_null_safe_clause('sub_group_2', sub_group_2)
            add_null_safe_clause('sub_group_3', sub_group_3)
            add_null_safe_clause('ledger_type', ledger_type)
            
            query = f"""
                SELECT 
                    q.question_code,
                    q.question_text,
                    q.question_type,
                    q.is_required,
                    q.validation_rules,
                    q.default_value,
                    q.help_text,
                    q.display_order
                FROM hierarchy_question_mapping hqm
                JOIN master_questions q ON hqm.question_id = q.id
                WHERE {' AND '.join(where_clauses)}
                ORDER BY q.display_order
            """
            
            cursor.execute(query, params)
            rows = cursor.fetchall()
            
            questions = []
            for row in rows:
                questions.append({
                    'question_code': row[0],
                    'question_text': row[1],
                    'question_type': row[2],
                    'is_required': bool(row[3]),
                    'validation_rules': json.loads(row[4]) if row[4] else None,
                    'default_value': row[5],
                    'help_text': row[6],
                    'display_order': row[7]
                })
            
            return questions


class LedgerCreateWithQuestionsView(APIView):
    """
    Create a new ledger with dynamic question answers.
    
    POST /api/ledgers/create-with-questions/
    {
        "name": "ABC Enterprises",
        "category": "Assets",
        "group": "Current Assets",
        "sub_group_1": "Sundry Debtors",
        "answers": {
            "Q_OPENING_BALANCE": "50000.00",
            "Q_GSTIN": "27AABCU9603R1ZM",
            ...
        }
    }
    """
    
    def post(self, request):
        from accounting.models import MasterLedger
        from django.db import transaction
        
        tenant_id = request.user.tenant_id
        
        # Extract ledger data
        name = request.data.get('name')
        category = request.data.get('category')
        group = request.data.get('group')
        sub_group_1 = request.data.get('sub_group_1')
        sub_group_2 = request.data.get('sub_group_2')
        sub_group_3 = request.data.get('sub_group_3')
        ledger_type = request.data.get('ledger_type')
        answers = request.data.get('answers', {})
        
        # Validate required fields
        if not name:
            return Response({
                'success': False,
                'error': 'Ledger name is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not category or not group:
            return Response({
                'success': False,
                'error': 'Category and Group are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get hierarchy node and code
        questions_view = LedgerQuestionsView()
        hierarchy_node = questions_view.get_hierarchy_node(
            category, group, sub_group_1, sub_group_2, sub_group_3, ledger_type
        )
        
        if not hierarchy_node:
            return Response({
                'success': False,
                'error': 'Invalid hierarchy selection'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get questions for validation
        questions = questions_view.get_questions_for_hierarchy(
            category, group, sub_group_1, sub_group_2, sub_group_3, ledger_type
        )
        
        # Validate answers
        validation_errors = self.validate_answers(questions, answers)
        if validation_errors:
            return Response({
                'success': False,
                'errors': validation_errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create ledger
        try:
            with transaction.atomic():
                ledger = MasterLedger.objects.create(
                    tenant_id=tenant_id,
                    name=name,
                    code=hierarchy_node['code'],
                    category=category,
                    group=group,
                    sub_group_1=sub_group_1,
                    sub_group_2=sub_group_2,
                    sub_group_3=sub_group_3,
                    ledger_type=ledger_type,
                    additional_data=answers
                )
                
                return Response({
                    'success': True,
                    'message': 'Ledger created successfully',
                    'ledger': {
                        'id': ledger.id,
                        'tenant_id': str(ledger.tenant_id),
                        'name': ledger.name,
                        'code': ledger.code,
                        'category': ledger.category,
                        'group': ledger.group,
                        'sub_group_1': ledger.sub_group_1,
                        'sub_group_2': ledger.sub_group_2,
                        'sub_group_3': ledger.sub_group_3,
                        'ledger_type': ledger.ledger_type,
                        'additional_data': ledger.additional_data,
                        'created_at': ledger.created_at.isoformat()
                    }
                }, status=status.HTTP_201_CREATED)
        
        except Exception as e:
            return Response({
                'success': False,
                'error': f'Failed to create ledger: {str(e)}'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def validate_answers(self, questions, answers):
        """
        Validate answers against question rules.
        Returns dict of errors or None if valid.
        """
        errors = {}
        
        for question in questions:
            question_code = question['question_code']
            answer = answers.get(question_code)
            
            # Check required fields
            if question['is_required'] and not answer:
                errors[question_code] = "This field is required"
                continue
            
            # Skip validation if answer is empty and not required
            if not answer:
                continue
            
            # Validate based on question type
            question_type = question['question_type']
            validation_rules = question.get('validation_rules', {})
            
            if question_type == 'decimal':
                error = self.validate_decimal(answer, validation_rules)
                if error:
                    errors[question_code] = error
            
            elif question_type == 'number':
                error = self.validate_number(answer, validation_rules)
                if error:
                    errors[question_code] = error
            
            elif question_type == 'gstin':
                error = self.validate_gstin(answer, validation_rules)
                if error:
                    errors[question_code] = error
            
            elif question_type == 'pan':
                error = self.validate_pan(answer, validation_rules)
                if error:
                    errors[question_code] = error
            
            elif question_type == 'email':
                error = self.validate_email(answer, validation_rules)
                if error:
                    errors[question_code] = error
            
            elif question_type == 'phone':
                error = self.validate_phone(answer, validation_rules)
                if error:
                    errors[question_code] = error
            
            elif question_type == 'dropdown':
                error = self.validate_dropdown(answer, validation_rules)
                if error:
                    errors[question_code] = error
        
        return errors if errors else None
    
    def validate_decimal(self, value, rules):
        try:
            decimal_value = float(value)
            if 'min' in rules and decimal_value < rules['min']:
                return f"Value must be at least {rules['min']}"
            if 'max' in rules and decimal_value > rules['max']:
                return f"Value must not exceed {rules['max']}"
            return None
        except ValueError:
            return "Invalid decimal value"
    
    def validate_number(self, value, rules):
        try:
            int_value = int(value)
            if 'min' in rules and int_value < rules['min']:
                return f"Value must be at least {rules['min']}"
            if 'max' in rules and int_value > rules['max']:
                return f"Value must not exceed {rules['max']}"
            return None
        except ValueError:
            return "Invalid number"
    
    def validate_gstin(self, value, rules):
        pattern = rules.get('pattern', r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')
        if not re.match(pattern, value):
            return "Invalid GSTIN format. Expected format: 27AABCU9603R1ZM"
        return None
    
    def validate_pan(self, value, rules):
        pattern = rules.get('pattern', r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$')
        if not re.match(pattern, value):
            return "Invalid PAN format. Expected format: ABCDE1234F"
        return None
    
    def validate_email(self, value, rules):
        pattern = rules.get('pattern', r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
        if not re.match(pattern, value):
            return "Invalid email address"
        return None
    
    def validate_phone(self, value, rules):
        pattern = rules.get('pattern', r'^[6-9][0-9]{9}$')
        if not re.match(pattern, value):
            return "Invalid phone number. Must be 10 digits starting with 6-9"
        return None
    
    def validate_dropdown(self, value, rules):
        options = rules.get('options', [])
        if value not in options:
            return f"Invalid option. Must be one of: {', '.join(options)}"
        return None
