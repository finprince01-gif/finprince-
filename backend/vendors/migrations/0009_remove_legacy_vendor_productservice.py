from django.db import migrations


def drop_legacy_vendor_productservice(apps, schema_editor):
    connection = schema_editor.connection

    with connection.cursor() as cursor:
        if connection.vendor == "mysql":
            cursor.execute(
                """
                SELECT CONSTRAINT_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = DATABASE()
                  AND TABLE_NAME = 'vendor_master_vendorcreation_productservices_items'
                  AND COLUMN_NAME = 'product_service_id'
                  AND REFERENCED_TABLE_NAME IS NOT NULL
                """
            )
            for (constraint_name,) in cursor.fetchall():
                cursor.execute(
                    "ALTER TABLE vendor_master_vendorcreation_productservices_items "
                    f"DROP FOREIGN KEY `{constraint_name}`"
                )

        try:
            cursor.execute(
                "ALTER TABLE vendor_master_vendorcreation_productservices_items "
                "DROP COLUMN product_service_id"
            )
        except Exception:
            pass

        cursor.execute("DROP TABLE IF EXISTS vendors_vendormasterproductservice")


class Migration(migrations.Migration):

    dependencies = [
        ("vendors", "0008_alter_vendormastertds_tcs_section_applicable_and_more"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunPython(
                    drop_legacy_vendor_productservice,
                    reverse_code=migrations.RunPython.noop,
                )
            ],
            state_operations=[
                migrations.RemoveField(
                    model_name="vendorproductserviceitem",
                    name="product_service",
                ),
                migrations.DeleteModel(
                    name="VendorMasterProductService",
                ),
            ],
        ),
    ]
