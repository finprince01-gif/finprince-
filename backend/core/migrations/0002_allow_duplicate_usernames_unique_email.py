# Generated migration for allowing duplicate usernames and enforcing unique emails

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        # First, remove the unique_together constraint
        migrations.AlterUniqueTogether(
            name='user',
            unique_together=set(),
        ),
        # Then, make email field unique
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.CharField(max_length=255, unique=True, blank=True, null=True),
        ),
    ]
