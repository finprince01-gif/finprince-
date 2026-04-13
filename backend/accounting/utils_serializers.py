from django.core.exceptions import FieldDoesNotExist
from rest_framework import serializers

class SafeModelSerializerMixin:
    """
    Prevents passing non-concrete DB fields (like properties or methods) 
    directly to the ORM create/update methods.
    """
    def _get_concrete_fields(self):
        model = self.Meta.model
        concrete_fields = set()
        for field in model._meta.get_fields():
            if not field.is_relation or field.many_to_one or field.one_to_one:
                concrete_fields.add(field.name)
                # Also add the _id suffix for ForeignKeys
                if field.is_relation:
                    concrete_fields.add(f"{field.name}_id")
        return concrete_fields

    def _clean_validated_data(self, validated_data):
        concrete_fields = self._get_concrete_fields()
        cleaned_data = {}
        for key, value in validated_data.items():
            if key in concrete_fields:
                cleaned_data[key] = value
        return cleaned_data

    def create(self, validated_data):
        cleaned_data = self._clean_validated_data(validated_data)
        return super().create(cleaned_data)

    def update(self, instance, validated_data):
        cleaned_data = self._clean_validated_data(validated_data)
        return super().update(instance, cleaned_data)
