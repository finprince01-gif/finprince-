"""
Migration: Add PendingTransaction and AllocationLink models for
Debit Note Bill Allocation Lifecycle (Step 7 of spec).

Tables created
--------------
- pending_transactions
- allocation_links
"""

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounting", "0006_advanceallocationmap"),
        ("core", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="PendingTransaction",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant_id", models.CharField(db_index=True, max_length=36)),
                ("reference_number", models.CharField(db_index=True, max_length=150)),
                ("reference_type", models.CharField(
                    choices=[
                        ("PURCHASE", "Purchase Invoice"),
                        ("DEBIT_NOTE", "Debit Note"),
                        ("PAYMENT", "Payment Voucher"),
                        ("RECEIPT", "Receipt Voucher"),
                        ("REVERSAL", "Reversal Entry"),
                    ],
                    max_length=20,
                )),
                ("reference_date", models.DateField(blank=True, null=True)),
                ("vendor_id", models.IntegerField(blank=True, db_index=True, null=True)),
                ("customer_id", models.IntegerField(blank=True, db_index=True, null=True)),
                ("purchase_voucher_id", models.BigIntegerField(blank=True, null=True)),
                ("original_amount", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("pending_balance", models.DecimalField(decimal_places=2, default=0, max_digits=15)),
                ("status", models.CharField(
                    choices=[
                        ("Unpaid", "Unpaid"),
                        ("Partially Paid", "Partially Paid"),
                        ("Paid", "Paid"),
                        ("Open", "Open"),
                        ("Utilized", "Utilized"),
                        ("Unutilized", "Unutilized"),
                        ("Partially Utilized", "Partially Utilized"),
                        ("Fully Utilized", "Fully Utilized"),
                    ],
                    default="Open",
                    max_length=30,
                )),
            ],
            options={
                "db_table": "pending_transactions",
                "unique_together": {("tenant_id", "reference_number", "reference_type")},
            },
        ),
        migrations.AddIndex(
            model_name="pendingtransaction",
            index=models.Index(
                fields=["tenant_id", "vendor_id"],
                name="pending_tx_vendor_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="pendingtransaction",
            index=models.Index(
                fields=["tenant_id", "customer_id"],
                name="pending_tx_customer_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="pendingtransaction",
            index=models.Index(
                fields=["tenant_id", "reference_type", "status"],
                name="pending_tx_type_status_idx",
            ),
        ),
        migrations.CreateModel(
            name="AllocationLink",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("tenant_id", models.CharField(db_index=True, max_length=36)),
                ("source_reference_number", models.CharField(max_length=150)),
                ("source_reference_type", models.CharField(
                    choices=[
                        ("PURCHASE", "Purchase Invoice"),
                        ("DEBIT_NOTE", "Debit Note"),
                        ("PAYMENT", "Payment Voucher"),
                        ("RECEIPT", "Receipt Voucher"),
                        ("REVERSAL", "Reversal Entry"),
                    ],
                    max_length=20,
                )),
                ("source_reference_date", models.DateField(blank=True, null=True)),
                ("target_reference_number", models.CharField(max_length=150)),
                ("target_reference_type", models.CharField(
                    choices=[
                        ("PURCHASE", "Purchase Invoice"),
                        ("DEBIT_NOTE", "Debit Note"),
                        ("PAYMENT", "Payment Voucher"),
                        ("RECEIPT", "Receipt Voucher"),
                        ("REVERSAL", "Reversal Entry"),
                    ],
                    max_length=20,
                )),
                ("amount_applied", models.DecimalField(decimal_places=2, max_digits=15)),
            ],
            options={
                "db_table": "allocation_links",
            },
        ),
        migrations.AddIndex(
            model_name="allocationlink",
            index=models.Index(
                fields=["tenant_id", "source_reference_number", "source_reference_type"],
                name="alloc_link_source_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="allocationlink",
            index=models.Index(
                fields=["tenant_id", "target_reference_number", "target_reference_type"],
                name="alloc_link_target_idx",
            ),
        ),
    ]
