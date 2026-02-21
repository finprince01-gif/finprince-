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
                    connection.ensure_connection()
                    print("\033[92m" + "✔ Database Connection: SUCCESS (" + connection.settings_dict['NAME'] + ")" + "\033[0m")
                except OperationalError as e:
                    print("\033[91m" + "✘ Database Connection: FAILED" + "\033[0m")
                    print("\033[91m" + f"Error: {str(e)}" + "\033[0m")
                except Exception as e:
                    print("\033[91m" + "✘ Database Connection: UNEXPECTED ERROR" + "\033[0m")
                    print("\033[91m" + f"Error: {str(e)}" + "\033[0m")


