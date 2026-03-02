from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Re-create inventory_locations table with new address schema'

    def handle(self, *args, **options):
        with connection.cursor() as cursor:
            # Drop constraint from items table first if it exists
            self.stdout.write('Checking constraints...')
            try:
                cursor.execute("ALTER TABLE inventory_items DROP FOREIGN KEY inventory_items_location_fk")
            except:
                pass

            # Drop old table
            self.stdout.write('Dropping old table...')
            cursor.execute("DROP TABLE IF EXISTS `inventory_locations`")
            
            # Create the table
            self.stdout.write('Creating inventory_locations table with new schema...')
            cursor.execute("""
                CREATE TABLE `inventory_locations` (
                    `id` bigint AUTO_INCREMENT NOT NULL PRIMARY KEY,
                    `tenant_id` varchar(36) NOT NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    `name` varchar(255) NOT NULL,
                    `location_type` varchar(50) NOT NULL,
                    
                    `address_line1` varchar(255) NOT NULL,
                    `address_line2` varchar(255) NULL,
                    `address_line3` varchar(255) NULL,
                    `city` varchar(100) NOT NULL,
                    `state` varchar(100) NOT NULL,
                    `country` varchar(100) NOT NULL DEFAULT 'India',
                    `pincode` varchar(20) NOT NULL,
                    
                    `gstin` varchar(15) NULL,
                    `is_active` tinyint(1) NOT NULL DEFAULT 1,
                    `is_default` tinyint(1) NOT NULL DEFAULT 0,
                    UNIQUE KEY `inventory_locations_tenant_name` (`tenant_id`, `name`),
                    KEY `inventory_locations_tenant_active` (`tenant_id`, `is_active`),
                    KEY `inventory_locations_type` (`location_type`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            
            # Re-add constraint to items table
            self.stdout.write('Restoring constraints...')
            try:
                cursor.execute("""
                    ALTER TABLE `inventory_items` 
                    ADD CONSTRAINT `inventory_items_location_fk` 
                    FOREIGN KEY (`location_id`) REFERENCES `inventory_locations` (`id`)
                """)
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'Could not restore FK constraint: {e}'))

            self.stdout.write(self.style.SUCCESS('✅ Table updated successfully!'))
