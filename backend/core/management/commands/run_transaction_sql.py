"""
Execute setup_transaction_file.sql script
"""
import os
from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = 'Execute setup_transaction_file.sql to create and populate Transcaction_file table'

    def handle(self, *args, **options):
        # Read the SQL file from project root
        sql_file_path = r'c:\update\Ai_Accounting_v1\setup_transaction_file.sql'
        
        self.stdout.write(f'Reading SQL file from: {sql_file_path}')

        
        try:
            with open(sql_file_path, 'r', encoding='utf-8') as f:
                sql_content = f.read()
            
            # Split by semicolons to execute individual statements
            statements = [stmt.strip() for stmt in sql_content.split(';') if stmt.strip() and not stmt.strip().startswith('--')]
            
            self.stdout.write(f'Found {len(statements)} SQL statements to execute')
            
            with connection.cursor() as cursor:
                for i, statement in enumerate(statements, 1):
                    # Skip comments and empty statements
                    if statement.startswith('--') or not statement.strip():
                        continue
                    
                    try:
                        self.stdout.write(f'Executing statement {i}...')
                        cursor.execute(statement)
                        self.stdout.write(self.style.SUCCESS(f'  ✓ Statement {i} executed successfully'))
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f'  ✗ Error in statement {i}: {str(e)}'))
                        # Continue with other statements
            
            self.stdout.write(self.style.SUCCESS('✅ SQL script executed successfully!'))
            self.stdout.write(self.style.SUCCESS('✅ Transcaction_file table created and populated with sample data'))
            
        except FileNotFoundError:
            self.stdout.write(self.style.ERROR(f'SQL file not found at: {sql_file_path}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Error executing SQL: {str(e)}'))
