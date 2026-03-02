"""
Dynamic Questions System - Excel Import Script
==============================================

This script imports questions and hierarchy mappings from Excel into the database.

Usage:
    python import_questions.py --excel questions_config.xlsx --host localhost --user root --password your_password --database ai_accounting

Excel Structure:
    Sheet 1: "Questions Master" - Contains all questions
    Sheet 2: "Hierarchy Question Mapping" - Maps questions to hierarchy nodes
"""

import pandas as pd
import mysql.connector
import json
import argparse
from datetime import datetime
from typing import Dict, List, Any

class QuestionsImporter:
    def __init__(self, db_config: Dict[str, str]):
        """Initialize database connection"""
        self.conn = mysql.connector.connect(**db_config)
        self.cursor = self.conn.cursor()
        print("✅ Connected to database successfully")
    
    def import_from_excel(self, excel_path: str):
        """Main import function"""
        try:
            print(f"\n📂 Reading Excel file: {excel_path}")
            
            # Read both sheets
            questions_df = pd.read_excel(excel_path, sheet_name='Questions Master')
            mappings_df = pd.read_excel(excel_path, sheet_name='Hierarchy Question Mapping')
            
            print(f"   Found {len(questions_df)} questions")
            print(f"   Found {len(mappings_df)} mappings")
            
            # Import questions first
            print("\n📝 Importing questions...")
            self.import_questions(questions_df)
            
            # Then import mappings
            print("\n🔗 Importing hierarchy mappings...")
            self.import_mappings(mappings_df)
            
            # Commit transaction
            self.conn.commit()
            print("\n✅ Import completed successfully!")
            
            # Show summary
            self.show_summary()
            
        except Exception as e:
            self.conn.rollback()
            print(f"\n❌ Import failed: {str(e)}")
            raise
        finally:
            self.cursor.close()
            self.conn.close()
    
    def import_questions(self, df: pd.DataFrame):
        """Import questions from DataFrame"""
        imported = 0
        updated = 0
        
        for index, row in df.iterrows():
            # Parse validation rules (if it's a string, convert to dict)
            validation_rules = None
            if pd.notna(row.get('validation_rules')):
                if isinstance(row['validation_rules'], str):
                    try:
                        validation_rules = json.loads(row['validation_rules'])
                    except json.JSONDecodeError:
                        print(f"   ⚠️  Invalid JSON in validation_rules for {row['question_code']}")
                else:
                    validation_rules = row['validation_rules']
            
            # Prepare data
            data = {
                'question_code': row['question_code'],
                'question_text': row['question_text'],
                'question_type': row['question_type'],
                'is_required': int(row.get('is_required', 0)),
                'validation_rules': json.dumps(validation_rules) if validation_rules else None,
                'default_value': row.get('default_value') if pd.notna(row.get('default_value')) else None,
                'help_text': row.get('help_text') if pd.notna(row.get('help_text')) else None,
                'display_order': int(row.get('display_order', 0)),
                'created_at': datetime.now(),
                'updated_at': datetime.now()
            }
            
            # Check if question already exists
            self.cursor.execute(
                "SELECT id FROM master_questions WHERE question_code = %s",
                (data['question_code'],)
            )
            existing = self.cursor.fetchone()
            
            if existing:
                # Update existing question
                self.cursor.execute("""
                    UPDATE master_questions 
                    SET question_text = %s,
                        question_type = %s,
                        is_required = %s,
                        validation_rules = %s,
                        default_value = %s,
                        help_text = %s,
                        display_order = %s,
                        updated_at = %s
                    WHERE question_code = %s
                """, (
                    data['question_text'],
                    data['question_type'],
                    data['is_required'],
                    data['validation_rules'],
                    data['default_value'],
                    data['help_text'],
                    data['display_order'],
                    data['updated_at'],
                    data['question_code']
                ))
                updated += 1
                print(f"   ✏️  Updated: {data['question_code']}")
            else:
                # Insert new question
                self.cursor.execute("""
                    INSERT INTO master_questions 
                    (question_code, question_text, question_type, is_required, 
                     validation_rules, default_value, help_text, display_order, 
                     created_at, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    data['question_code'],
                    data['question_text'],
                    data['question_type'],
                    data['is_required'],
                    data['validation_rules'],
                    data['default_value'],
                    data['help_text'],
                    data['display_order'],
                    data['created_at'],
                    data['updated_at']
                ))
                imported += 1
                print(f"   ✅ Imported: {data['question_code']}")
        
        print(f"\n   📊 Questions: {imported} imported, {updated} updated")
    
    def import_mappings(self, df: pd.DataFrame):
        """Import hierarchy question mappings from DataFrame"""
        imported = 0
        skipped = 0
        
        # Clear existing mappings (optional - comment out if you want to preserve)
        # self.cursor.execute("DELETE FROM hierarchy_question_mapping")
        # print("   🗑️  Cleared existing mappings")
        
        for index, row in df.iterrows():
            # Get question_id from question_code
            self.cursor.execute(
                "SELECT id FROM master_questions WHERE question_code = %s",
                (row['question_code'],)
            )
            result = self.cursor.fetchone()
            
            if not result:
                print(f"   ⚠️  Question not found: {row['question_code']}")
                skipped += 1
                continue
            
            question_id = result[0]
            
            # Prepare hierarchy data (convert NaN to None)
            data = {
                'category': row['category'] if pd.notna(row.get('category')) else None,
                'group': row['group'] if pd.notna(row.get('group')) else None,
                'sub_group_1': row['sub_group_1'] if pd.notna(row.get('sub_group_1')) else None,
                'sub_group_2': row['sub_group_2'] if pd.notna(row.get('sub_group_2')) else None,
                'sub_group_3': row['sub_group_3'] if pd.notna(row.get('sub_group_3')) else None,
                'ledger_type': row['ledger_type'] if pd.notna(row.get('ledger_type')) else None,
                'question_id': question_id,
                'created_at': datetime.now(),
                'updated_at': datetime.now()
            }
            
            # Check if mapping already exists
            where_parts = []
            where_values = []
            
            for field in ['category', 'group', 'sub_group_1', 'sub_group_2', 'sub_group_3', 'ledger_type']:
                if data[field] is None:
                    where_parts.append(f"{field} IS NULL")
                else:
                    where_parts.append(f"{field} = %s")
                    where_values.append(data[field])
            
            where_parts.append("question_id = %s")
            where_values.append(question_id)
            
            check_query = f"""
                SELECT id FROM hierarchy_question_mapping 
                WHERE {' AND '.join(where_parts)}
            """
            
            self.cursor.execute(check_query, where_values)
            existing = self.cursor.fetchone()
            
            if existing:
                skipped += 1
                continue
            
            # Insert new mapping
            self.cursor.execute("""
                INSERT INTO hierarchy_question_mapping 
                (category, `group`, sub_group_1, sub_group_2, sub_group_3, 
                 ledger_type, question_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                data['category'],
                data['group'],
                data['sub_group_1'],
                data['sub_group_2'],
                data['sub_group_3'],
                data['ledger_type'],
                data['question_id'],
                data['created_at'],
                data['updated_at']
            ))
            imported += 1
            
            # Show progress every 10 mappings
            if imported % 10 == 0:
                print(f"   📝 Imported {imported} mappings...")
        
        print(f"\n   📊 Mappings: {imported} imported, {skipped} skipped (duplicates)")
    
    def show_summary(self):
        """Show import summary"""
        print("\n" + "="*60)
        print("📊 IMPORT SUMMARY")
        print("="*60)
        
        # Count questions
        self.cursor.execute("SELECT COUNT(*) FROM master_questions")
        question_count = self.cursor.fetchone()[0]
        print(f"Total Questions: {question_count}")
        
        # Count mappings
        self.cursor.execute("SELECT COUNT(*) FROM hierarchy_question_mapping")
        mapping_count = self.cursor.fetchone()[0]
        print(f"Total Mappings: {mapping_count}")
        
        # Show sample questions
        print("\n📝 Sample Questions:")
        self.cursor.execute("""
            SELECT question_code, question_text, question_type 
            FROM master_questions 
            ORDER BY display_order 
            LIMIT 5
        """)
        for row in self.cursor.fetchall():
            print(f"   • {row[0]}: {row[1]} ({row[2]})")
        
        # Show mapping distribution
        print("\n🔗 Mappings by Hierarchy Level:")
        self.cursor.execute("""
            SELECT 
                CASE 
                    WHEN category IS NOT NULL AND `group` IS NOT NULL AND sub_group_1 IS NOT NULL THEN 'Sub-group Level'
                    WHEN category IS NOT NULL AND `group` IS NOT NULL THEN 'Group Level'
                    WHEN category IS NOT NULL THEN 'Category Level'
                    ELSE 'Other'
                END as level,
                COUNT(*) as count
            FROM hierarchy_question_mapping
            GROUP BY level
        """)
        for row in self.cursor.fetchall():
            print(f"   • {row[0]}: {row[1]} mappings")
        
        print("="*60)


def create_sample_excel(output_path: str = 'questions_config_template.xlsx'):
    """Create a sample Excel template for reference"""
    
    # Sample questions
    questions_data = {
        'question_code': [
            'Q_OPENING_BALANCE',
            'Q_CREDIT_LIMIT',
            'Q_GSTIN',
            'Q_STATE',
            'Q_PARTY_TYPE'
        ],
        'question_text': [
            'Opening Balance',
            'Credit Limit',
            'GSTIN',
            'State',
            'Party Type'
        ],
        'question_type': [
            'decimal',
            'decimal',
            'gstin',
            'dropdown',
            'dropdown'
        ],
        'is_required': [1, 0, 0, 0, 0],
        'validation_rules': [
            '{"min": 0, "max": 999999999.99, "decimal_places": 2}',
            '{"min": 0, "max": 999999999.99, "decimal_places": 2}',
            '{"pattern": "^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"}',
            '{"options": ["Maharashtra", "Gujarat", "Karnataka", "Tamil Nadu"]}',
            '{"options": ["Customer", "Vendor", "Both"]}'
        ],
        'default_value': ['0.00', None, None, None, None],
        'help_text': [
            'Enter the opening balance for this ledger',
            'Maximum credit allowed for this party',
            'Enter 15-digit GSTIN',
            'Select the state for GST registration',
            'Is this party a customer, vendor, or both?'
        ],
        'display_order': [1, 2, 3, 4, 5]
    }
    
    # Sample mappings
    mappings_data = {
        'category': ['Assets', 'Assets', 'Assets', 'Liabilities', 'Liabilities'],
        'group': ['Current Assets', 'Current Assets', 'Current Assets', 'Current Liabilities', 'Current Liabilities'],
        'sub_group_1': ['Sundry Debtors', 'Sundry Debtors', 'Sundry Debtors', 'Sundry Creditors', 'Sundry Creditors'],
        'sub_group_2': [None, None, None, None, None],
        'sub_group_3': [None, None, None, None, None],
        'ledger_type': [None, None, None, None, None],
        'question_code': ['Q_OPENING_BALANCE', 'Q_CREDIT_LIMIT', 'Q_GSTIN', 'Q_OPENING_BALANCE', 'Q_PARTY_TYPE']
    }
    
    # Create Excel file
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        pd.DataFrame(questions_data).to_excel(writer, sheet_name='Questions Master', index=False)
        pd.DataFrame(mappings_data).to_excel(writer, sheet_name='Hierarchy Question Mapping', index=False)
    
    print(f"✅ Sample Excel template created: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Import questions from Excel to database')
    parser.add_argument('--excel', required=True, help='Path to Excel file')
    parser.add_argument('--host', default='localhost', help='Database host')
    parser.add_argument('--user', default='root', help='Database user')
    parser.add_argument('--password', required=True, help='Database password')
    parser.add_argument('--database', default='ai_accounting', help='Database name')
    parser.add_argument('--port', type=int, default=3306, help='Database port')
    parser.add_argument('--create-template', action='store_true', help='Create sample Excel template')
    
    args = parser.parse_args()
    
    if args.create_template:
        create_sample_excel()
        return
    
    # Database configuration
    db_config = {
        'host': args.host,
        'user': args.user,
        'password': args.password,
        'database': args.database,
        'port': args.port
    }
    
    # Run import
    importer = QuestionsImporter(db_config)
    importer.import_from_excel(args.excel)


if __name__ == '__main__':
    main()
