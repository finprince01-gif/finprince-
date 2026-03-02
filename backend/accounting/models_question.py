from django.db import models

class Question(models.Model):
    """
    Questions for dynamic ledger creation forms.
    Imported from CSV file.
    """
    sub_group_1_1 = models.CharField(
        max_length=255, 
        null=True, 
        blank=True,
        db_column='sub_group_1_1',
        help_text='Sub-group 1 level 1 from hierarchy'
    )
    sub_group_1_2 = models.CharField(
        max_length=50, 
        null=True, 
        blank=True,
        db_column='sub_group_1_2',
        help_text='Sub-group 1 level 2 (question code)'
    )
    question = models.TextField(
        null=True, 
        blank=True,
        help_text='The question text'
    )
    condition_rule = models.CharField(
        max_length=255, 
        null=True, 
        blank=True,
        help_text='Condition rules for displaying the question'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'questions'
        managed = False  # Table already exists, don't let Django manage it

    def __str__(self):
        return f"{self.sub_group_1_1} - {self.question[:50]}"

    def parse_condition_rule(self):
        """
        Parse the condition_rule string and return structured data.
        
        Example condition_rule format:
        "Face value / share / Amount /Numeric / Yes /- / - / - /-"
        
        Returns dict with:
        - field_type: text, numeric, dropdown, radio, checkbox, etc.
        - options: list of options if applicable
        - validation: validation rules
        """
        if not self.condition_rule:
            return {
                'field_type': 'text',
                'required': False,
                'options': [],
                'validation': {},
                'placeholder': '',
                'help_text': ''
            }
        
        parts = [p.strip() for p in self.condition_rule.split('/')]
        
        result = {
            'field_type': 'text',
            'required': False,
            'options': [],
            'validation': {},
            'placeholder': '',
            'help_text': ''
        }
        
        # Parse based on common patterns
        condition_lower = self.condition_rule.lower()
        
        # Determine field type
        if 'numeric' in condition_lower or 'number' in condition_lower:
            result['field_type'] = 'number'
        elif 'yes' in condition_lower and 'no' in condition_lower:
            result['field_type'] = 'radio'
            result['options'] = ['Yes', 'No']
        elif 'dropdown' in condition_lower or 'select' in condition_lower:
            result['field_type'] = 'dropdown'
        elif 'checkbox' in condition_lower:
            result['field_type'] = 'checkbox'
        elif 'date' in condition_lower:
            result['field_type'] = 'date'
        elif 'email' in condition_lower:
            result['field_type'] = 'email'
        elif 'phone' in condition_lower:
            result['field_type'] = 'tel'
        elif 'text' in condition_lower or 'alpha' in condition_lower:
            result['field_type'] = 'text'
        
        # Check for required field
        if 'required' in condition_lower or 'mandatory' in condition_lower:
            result['required'] = True
        
        # Extract placeholder or help text from parts
        if len(parts) > 0 and parts[0] and parts[0] != '-':
            result['placeholder'] = parts[0]
        
        return result

    def to_dict(self):
        """Convert question to dictionary format for API response"""
        parsed_condition = self.parse_condition_rule()
        
        return {
            'id': self.id,
            'sub_group_1_1': self.sub_group_1_1,
            'sub_group_1_2': self.sub_group_1_2,
            'question': self.question,
            'condition_rule': self.condition_rule,
            'field_type': parsed_condition['field_type'],
            'required': parsed_condition['required'],
            'options': parsed_condition['options'],
            'validation': parsed_condition['validation'],
            'placeholder': parsed_condition['placeholder'],
            'help_text': parsed_condition['help_text']
        }

class Answer(models.Model):
    """
    Stores answers to dynamic questions.
    Simplified structure with only essential columns.
    """
    id = models.AutoField(primary_key=True)
    ledger_code = models.CharField(max_length=255, null=True, blank=True)
    sub_group_1_1 = models.CharField(max_length=255, null=True, blank=True)
    sub_group_1_2 = models.CharField(max_length=255, null=True, blank=True)
    question = models.TextField(null=True, blank=True)
    answer = models.TextField(null=True, blank=True)
    tenant_id = models.CharField(max_length=36, db_index=True)

    class Meta:
        db_table = 'answers'
        managed = False  # Let us manage the schema manually

    def __str__(self):
        return f"{self.ledger_code} - {self.sub_group_1_2}: {self.answer}"
