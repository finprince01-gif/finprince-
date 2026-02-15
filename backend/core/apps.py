from django.apps import AppConfig

class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        import os
        # Only run this once, not for the auto-reloader process
        if os.environ.get('RUN_MAIN') == 'true':
            from django.db import connection
            from django.db.utils import OperationalError
            try:
                connection.ensure_connection()
                print("\033[92m" + "✔ Database connected successfully!" + "\033[0m")
            except OperationalError as e:
                print("\033[91m" + f"✘ Database connection failed: {e}" + "\033[0m")
