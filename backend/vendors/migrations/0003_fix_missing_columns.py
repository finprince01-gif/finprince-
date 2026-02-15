
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('vendors', '0002_vendormastertds_cin_number_and_more'),
    ]

    operations = [
        # Add missing columns to VendorMasterBasicDetail
        migrations.RunSQL(
            sql="ALTER TABLE vendor_master_basicdetail ADD COLUMN tcs_applicable TINYINT(1) DEFAULT 0;",
            reverse_sql="ALTER TABLE vendor_master_basicdetail DROP COLUMN tcs_applicable;"
        ),
        # Add missing columns to VendorMasterGSTDetails
        migrations.RunSQL(
            sql="ALTER TABLE vendor_master_gstdetails ADD COLUMN reference_name VARCHAR(200) NULL;",
            reverse_sql="ALTER TABLE vendor_master_gstdetails DROP COLUMN reference_name;"
        ),
        migrations.RunSQL(
            sql="ALTER TABLE vendor_master_gstdetails ADD COLUMN branch_address TEXT NULL;",
            reverse_sql="ALTER TABLE vendor_master_gstdetails DROP COLUMN branch_address;"
        ),
        migrations.RunSQL(
            sql="ALTER TABLE vendor_master_gstdetails ADD COLUMN branch_contact_person VARCHAR(100) NULL;",
            reverse_sql="ALTER TABLE vendor_master_gstdetails DROP COLUMN branch_contact_person;"
        ),
        migrations.RunSQL(
            sql="ALTER TABLE vendor_master_gstdetails ADD COLUMN branch_email VARCHAR(255) NULL;",
            reverse_sql="ALTER TABLE vendor_master_gstdetails DROP COLUMN branch_email;"
        ),
        migrations.RunSQL(
            sql="ALTER TABLE vendor_master_gstdetails ADD COLUMN branch_contact_no VARCHAR(20) NULL;",
            reverse_sql="ALTER TABLE vendor_master_gstdetails DROP COLUMN branch_contact_no;"
        ),
    ]
