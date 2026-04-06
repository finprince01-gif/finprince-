# Migration 0006: Create advance_allocations table for advance consumption tracking
# This is purely additive — no existing tables are modified.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0005_merge_20260405_1742'),
    ]

    operations = [
        migrations.CreateModel(
            name='AdvanceAllocationMap',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('tenant_id', models.CharField(blank=True, db_index=True, max_length=36, null=True)),
                # Source (the advance itself)
                ('advance_source_id', models.BigIntegerField(
                    help_text='PK of PaymentVoucherItem or ReceiptVoucherItem'
                )),
                ('advance_source_type', models.CharField(
                    choices=[('payment', 'Payment Voucher Item'), ('receipt', 'Receipt Voucher Item')],
                    default='payment',
                    max_length=20,
                )),
                ('advance_ref_no', models.CharField(
                    blank=True,
                    help_text='Human-readable reference number (display only)',
                    max_length=150,
                    null=True,
                )),
                # Target (the invoice that used this advance)
                ('voucher_id', models.BigIntegerField(
                    help_text='ID from the global vouchers table'
                )),
                ('voucher_type', models.CharField(
                    choices=[('sales', 'Sales Invoice'), ('purchase', 'Purchase Invoice')],
                    max_length=20,
                )),
                ('ledger_id', models.BigIntegerField(
                    blank=True,
                    help_text='MasterLedger ID of the party (for filtering)',
                    null=True,
                )),
                # Amount consumed
                ('amount', models.DecimalField(
                    decimal_places=2,
                    default=0,
                    help_text='Amount of the advance consumed by this voucher',
                    max_digits=15,
                )),
            ],
            options={
                'verbose_name': 'Advance Allocation',
                'verbose_name_plural': 'Advance Allocations',
                'db_table': 'advance_allocations',
            },
        ),
        migrations.AddIndex(
            model_name='advanceallocationmap',
            index=models.Index(
                fields=['tenant_id', 'advance_source_id', 'advance_source_type'],
                name='adv_alloc_source_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='advanceallocationmap',
            index=models.Index(
                fields=['tenant_id', 'advance_ref_no'],
                name='adv_alloc_refno_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='advanceallocationmap',
            index=models.Index(
                fields=['tenant_id', 'voucher_id', 'voucher_type'],
                name='adv_alloc_voucher_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='advanceallocationmap',
            index=models.Index(
                fields=['tenant_id', 'ledger_id'],
                name='adv_alloc_ledger_idx',
            ),
        ),
    ]
