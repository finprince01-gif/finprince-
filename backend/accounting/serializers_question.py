from rest_framework import serializers
from .models_question import Question


class QuestionSerializer(serializers.ModelSerializer):
    """Serializer for Question model"""
    
    field_type = serializers.SerializerMethodField()
    required = serializers.SerializerMethodField()
    options = serializers.SerializerMethodField()
    validation = serializers.SerializerMethodField()
    placeholder = serializers.SerializerMethodField()
    help_text_parsed = serializers.SerializerMethodField()
    
    class Meta:
        model = Question
        fields = [
            'id',
            'sub_group_1_1',
            'sub_group_1_2',
            'question',
            'condition_rule',
            'field_type',
            'required',
            'options',
            'validation',
            'placeholder',
            'help_text_parsed',
            'created_at'
        ]
    
    def get_field_type(self, obj):
        return obj.parse_condition_rule()['field_type']
    
    def get_required(self, obj):
        return obj.parse_condition_rule()['required']
    
    def get_options(self, obj):
        return obj.parse_condition_rule()['options']
    
    def get_validation(self, obj):
        return obj.parse_condition_rule()['validation']
    
    def get_placeholder(self, obj):
        return obj.parse_condition_rule()['placeholder']
    
    def get_help_text_parsed(self, obj):
        return obj.parse_condition_rule()['help_text']
