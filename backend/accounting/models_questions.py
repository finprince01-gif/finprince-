"""
Dynamic Questions System Models
================================

These models implement the data-driven questions system for ledger creation.
Questions are configured globally and mapped to specific hierarchy nodes.
"""

from django.db import models


class MasterQuestion(models.Model):
    """
    Global questions library - stores all possible questions that can be asked
    during ledger creation. This table is populated from Excel and is shared
    across all tenants (no tenant_id).
    """
    question_code = models.CharField(
        max_length=50,
        unique=True,
        help_text="Unique code for the question (e.g., Q_OPENING_BALANCE, Q_GSTIN)"
    )
    question_text = models.CharField(
        max_length=500,
        help_text="The actual question to display in UI"
    )
    question_type = models.CharField(
        max_length=50,
        help_text="text, number, decimal, date, dropdown, checkbox, radio, email, phone, gstin, pan, state"
    )
    is_required = models.BooleanField(
        default=False,
        help_text="Whether this question must be answered"
    )
    validation_rules = models.JSONField(
        null=True,
        blank=True,
        help_text="JSON object with validation rules: {min, max, pattern, options, etc}"
    )
    default_value = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Default value if any"
    )
    help_text = models.TextField(
        null=True,
        blank=True,
        help_text="Help text to show below the question"
    )
    display_order = models.IntegerField(
        default=0,
        help_text="Order in which questions should appear"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'master_questions'
        ordering = ['display_order', 'question_code']
        indexes = [
            models.Index(fields=['question_type']),
            models.Index(fields=['display_order']),
        ]
    
    def __str__(self):
        return f"{self.question_code}: {self.question_text}"


class HierarchyQuestionMapping(models.Model):
    """
    Maps questions to specific hierarchy nodes. This table defines WHICH questions
    should be asked for WHICH hierarchy selection. Populated from Excel based on
    business rules.
    """
    # Hierarchy Node Identification (matches master_hierarchy_raw structure)
    category = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Maps to major_group_1 in master_hierarchy_raw"
    )
    group = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        db_column='group',
        help_text="Maps to group_1 in master_hierarchy_raw"
    )
    sub_group_1 = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Maps to sub_group_1_1 in master_hierarchy_raw"
    )
    sub_group_2 = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Maps to sub_group_2_1 in master_hierarchy_raw"
    )
    sub_group_3 = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Maps to sub_group_3_1 in master_hierarchy_raw"
    )
    ledger_type = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Maps to ledger_1 in master_hierarchy_raw"
    )
    
    # Question Reference
    question = models.ForeignKey(
        MasterQuestion,
        on_delete=models.CASCADE,
        help_text="Foreign key to master_questions"
    )
    
    # Conditional Logic (Advanced Feature - for future use)
    condition_rules = models.JSONField(
        null=True,
        blank=True,
        help_text="Optional: Show this question only if certain conditions are met"
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:

        db_table = 'hierarchy_question_mapping'
        indexes = [
            models.Index(fields=['question']),
            models.Index(fields=['category']),
            models.Index(fields=['group']),
            models.Index(fields=['ledger_type']),
            models.Index(fields=['category', 'group', 'sub_group_1', 'sub_group_2', 'sub_group_3', 'ledger_type']),
        ]
    
    def __str__(self):
        hierarchy_path = ' > '.join(filter(None, [
            self.category,
            self.group,
            self.sub_group_1,
            self.sub_group_2,
            self.sub_group_3,
            self.ledger_type
        ]))
        return f"{hierarchy_path} → {self.question.question_code}"
