# Generated manually to break circular dependency
import django.db.models.deletion
from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('accounting', '0001_initial'),
        ('vendors', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='voucherpurchasesupplierdetails',
            name='vendor_basic_detail',
            field=models.ForeignKey(
                db_column='vendor_basic_detail_id',
                on_delete=django.db.models.deletion.RESTRICT,
                related_name='purchase_vouchers',
                to='vendors.vendormasterbasicdetail',
                null=True, # Allow null initially to avoid constraints if table isn't empty
                blank=True
            ),
        ),
        migrations.AddField(
            model_name='amounttransaction',
            name='vendor',
            field=models.ForeignKey(
                db_column='vendor_id',
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.SET_NULL,
                to='vendors.vendormasterbasicdetail'
            ),
        ),
    ]
