# Manually fixed migration: 0012
# - Removes AddField ops for columns already in session_finalization_states
# - Removes CreateModel for poison_pdfs (table already exists)
# - Only creates export_tasks (genuinely missing)

import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ocr_pipeline', '0011_finalizedsnapshot_s3_key_and_more'),
    ]

    operations = [
        # PoisonPDF table already exists in DB - use SeparateDatabaseAndState to register model
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
        # session_finalization_states columns already exist - register in state only
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
        # export_tasks does NOT exist - create it for real
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
