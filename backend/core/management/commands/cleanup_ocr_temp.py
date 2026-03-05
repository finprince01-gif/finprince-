"""
Management command: cleanup_ocr_temp
=====================================
Delete expired invoice OCR cache records from invoice_ocr_temp.

Schedule this via cron or any task scheduler to run once per day, e.g.:
    0 2 * * * /path/to/python manage.py cleanup_ocr_temp

Usage:
    python manage.py cleanup_ocr_temp
    python manage.py cleanup_ocr_temp --dry-run
"""

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Delete expired rows from invoice_ocr_temp (records older than 15 days)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many records would be deleted without actually deleting them.",
        )

    def handle(self, *args, **options):
        dry_run = options.get("dry_run", False)

        if dry_run:
            from django.db import connection

            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT COUNT(*) FROM invoice_ocr_temp WHERE expires_at < NOW()"
                )
                count = cursor.fetchone()[0]
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] {count} expired record(s) would be deleted from invoice_ocr_temp."
                )
            )
            return

        from core.ocr_cache import delete_expired_records

        deleted = delete_expired_records()
        self.stdout.write(
            self.style.SUCCESS(
                f"cleanup_ocr_temp: deleted {deleted} expired OCR cache record(s)."
            )
        )
