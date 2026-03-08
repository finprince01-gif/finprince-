from django.apps import AppConfig

class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        import sys
        import os
        # Only run this check if we are starting the server 
        # RUN_MAIN check prevents double execution due to the auto-reloader
        if 'runserver' in sys.argv and os.environ.get('RUN_MAIN') == 'true':
            from django.db import connection
            from django.db.utils import OperationalError
            import warnings
            
            # Suppress the "Accessing the database during app initialization is discouraged" warning
            # specifically for this check, as we are doing it intentionally for startup feedback.
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", category=RuntimeWarning, message=".*Accessing the database during app initialization.*")
                try:
                    # Attempt to test the connection
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT 1")
                    print("\033[92m" + "[OK] Database Connection: SUCCESS (" + connection.settings_dict['NAME'] + ")" + "\033[0m")
                except OperationalError:
                    print("\033[91m" + "[ERROR] Database Connection: FAILED TO CONNECT" + "\033[0m")
                    # Remove sys.exit(1) to allow collectstatic/migrations without DB
                except Exception as e:
                    print("\033[91m" + "[ERROR] Database Connection: UNEXPECTED ERROR" + "\033[0m")
                    print("\033[91m" + f"Error: {str(e)}" + "\033[0m")
