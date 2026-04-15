import os
import sys

# Ensure the project root is in the python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))


def main():
    """Run administrative tasks."""
    # Force UTF-8 for console output to handle emojis on Windows
    if sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
        except AttributeError:
            pass # Fallback for older python
            
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')      
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()
