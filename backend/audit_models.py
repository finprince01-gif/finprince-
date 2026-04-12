import os
import django
from django.conf import settings
from django.apps import apps
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def get_model_schema():
    schema = {}
    for app_config in apps.get_app_configs():
        if app_config.models_module:
            app_label = app_config.label
            schema[app_label] = {}
            for model in app_config.get_models():
                model_name = model.__name__
                db_table = model._meta.db_table
                managed = model._meta.managed
                
                fields = []
                for field in model._meta.get_fields():
                    if field.is_relation and not (field.many_to_one or field.one_to_one):
                        # Skip reverse relations and many-to-many as they don't have columns in this table
                        continue
                    
                    if not hasattr(field, 'get_internal_type'):
                        continue # Skip fields that aren't concrete/real
                        
                    field_info = {
                        "name": field.name,
                        "column": field.column if hasattr(field, 'column') else None,
                        "type": field.get_internal_type(),
                        "null": getattr(field, 'null', None),
                        "blank": getattr(field, 'blank', None),
                        "is_relation": field.is_relation,
                    }
                    if field.is_relation and field.related_model:
                        field_info["related_model"] = field.related_model._meta.db_table
                    fields.append(field_info)
                
                schema[app_label][model_name] = {
                    "db_table": db_table,
                    "managed": managed,
                    "fields": fields
                }
    return schema

if __name__ == "__main__":
    schema = get_model_schema()
    with open("model_audit.json", "w") as f:
        json.dump(schema, f, indent=4)
    print("Model audit saved to model_audit.json")
