# Manually fixed migration: 0012
# - Conditionally creates poison_pdfs table and session_finalization_states columns if missing
# - Conditionally adds missing columns to invoice_ocr_temp
# - Only creates export_tasks (genuinely missing)

import uuid
from django.db import migrations, models

def create_poison_pdfs_if_missing(apps, schema_editor):
    db_table = 'poison_pdfs'
    connection = schema_editor.connection
    table_names = connection.introspection.table_names()
    if db_table not in table_names:
        PoisonPDF = apps.get_model('ocr_pipeline', 'PoisonPDF')
        schema_editor.create_model(PoisonPDF)

def add_columns_if_missing(apps, schema_editor):
    db_table = 'session_finalization_states'
    connection = schema_editor.connection
    table_names = connection.introspection.table_names()
    if db_table in table_names:
        columns = [f.name for f in connection.introspection.get_table_description(connection.cursor(), db_table)]
        SessionFinalizationState = apps.get_model('ocr_pipeline', 'SessionFinalizationState')
        
        fields_to_add = ['ai_completed_pages', 'completed_pages', 'expected_pages', 'failed_pages']
        for field_name in fields_to_add:
            if field_name not in columns:
                field_obj = SessionFinalizationState._meta.get_field(field_name)
                schema_editor.add_field(SessionFinalizationState, field_obj)

def add_missing_columns_to_invoice_ocr_temp(apps, schema_editor):
    db_table = 'invoice_ocr_temp'
    connection = schema_editor.connection
    table_names = connection.introspection.table_names()
    if db_table in table_names:
        columns = [f.name for f in connection.introspection.get_table_description(connection.cursor(), db_table)]
        
        fields_to_add = {
            'upload_type': "VARCHAR(50) DEFAULT 'UNKNOWN' NOT NULL",
            'workflow_version': "BIGINT DEFAULT 0 NOT NULL",
            'irn': "VARCHAR(255) NULL",
            'ack_no': "VARCHAR(255) NULL",
            'ack_date': "VARCHAR(255) NULL",
        }
        
        with connection.cursor() as cursor:
            for field_name, sql_def in fields_to_add.items():
                if field_name not in columns:
                    cursor.execute(f"ALTER TABLE invoice_ocr_temp ADD COLUMN {field_name} {sql_def}")

class Migration(migrations.Migration):
    atomic = False

    dependencies = [
        ('ocr_pipeline', '0011_finalizedsnapshot_s3_key_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.CreateModel(
                    name='PoisonPDF',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('item_id', models.BigIntegerField(db_index=True)),
                        ('job_id', models.CharField(blank=True, max_length=255, null=True)),
                        ('tenant_id', models.CharField(db_index=True, max_length=255)),
                        ('file_path', models.CharField(max_length=512)),
                        ('error_message', models.TextField()),
                        ('retry_count', models.IntegerField(default=0)),
                        ('task_payload', models.JSONField()),
                        ('created_at', models.DateTimeField(auto_now_add=True)),
                    ],
                    options={
                        'db_table': 'poison_pdfs',
                    },
                ),
            ]
        ),
        migrations.RunPython(create_poison_pdfs_if_missing, reverse_code=migrations.RunPython.noop),
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddField(
                    model_name='sessionfinalizationstate',
                    name='ai_completed_pages',
                    field=models.IntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='sessionfinalizationstate',
                    name='completed_pages',
                    field=models.IntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='sessionfinalizationstate',
                    name='expected_pages',
                    field=models.IntegerField(default=0),
                ),
                migrations.AddField(
                    model_name='sessionfinalizationstate',
                    name='failed_pages',
                    field=models.IntegerField(default=0),
                ),
            ]
        ),
        migrations.RunPython(add_columns_if_missing, reverse_code=migrations.RunPython.noop),
        migrations.RunPython(add_missing_columns_to_invoice_ocr_temp, reverse_code=migrations.RunPython.noop),
        migrations.CreateModel(
            name='ExportTask',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('session_id', models.CharField(db_index=True, max_length=255)),
                ('tenant_id', models.CharField(db_index=True, max_length=255)),
                ('status', models.CharField(db_index=True, default='PENDING', max_length=50)),
                ('file_url', models.CharField(blank=True, max_length=512, null=True)),
                ('export_type', models.CharField(default='ZOHO', max_length=50)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'db_table': 'export_tasks',
                'indexes': [models.Index(fields=['session_id', 'tenant_id'], name='export_task_session_ab5078_idx')],
            },
        ),
    ]
