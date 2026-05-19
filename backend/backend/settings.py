
import os
from pathlib import Path
from dotenv import load_dotenv  # type: ignore[import]
from datetime import timedelta

load_dotenv(override=True)

BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY: No fallback - fail fast if secret is missing
SECRET_KEY = os.getenv('DJANGO_SECRET')
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET environment variable must be set")

DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'

# Production: Specify exact domains (no wildcards)
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,finpixe.com,www.finpixe.com,api.finpixe.com,.finpixe.com,testserver,16.171.255.74,13.63.35.153,13.235.91.238,13.203.204.171,13.203.204.1').split(',')
if DEBUG:
    ALLOWED_HOSTS = ['*']
else:
    # Ensure localhost/127.0.0.1 are always included in ALLOWED_HOSTS if not explicitly provided
    if 'localhost' not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append('localhost')
    if '127.0.0.1' not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append('127.0.0.1')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'masters', # Masters Module (Voucher configs etc)
    'core',
    'company',  # Parent of one or more Tenants (Branches)
    'transactions', # Vouchers and Entries
    'accounting',
    'inventory',
    'vendors',  # Vendor Portal
    'customerportal',  # Customer Portal
    'payroll',  # Payroll Management
    'services',  # Services Management
    'rbac',  # Role-Based Access Control
    'dashboard', # Dashboard UI
    'users', # User profiles and auth extensions
    'login', # Authentication Logic
    'registration', # Signup Logic
    'rest_framework_simplejwt',
    'reports',
    'drf_spectacular',
    'vouchers',
    'ocr_pipeline',
    'gst_reconciliation',
    'bank_upload',           # Bank Statement Upload & Staging Module
]

MIDDLEWARE = [
    'core.middleware.CorrelationIDMiddleware', # FIRST for tracing
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware', # Add Whitenoise
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'core.csrf_middleware.DisableCSRFForAPIMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'core.middleware.ExceptionLoggingMiddleware', # Catch errors from below
    'core.middleware.TenantMiddleware',
]

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        # For 50K users: Use ProxySQL endpoint instead of direct MySQL for better multiplexing
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '3306'),
        # PRODUCTION: Persistent connections to reduce handshake overhead
        'CONN_MAX_AGE': 0 if DEBUG else int(os.getenv('DB_CONN_MAX_AGE', '1200')), # No persistence in Dev
        'CONN_HEALTH_CHECKS': True,  # Test connections before use to prevent crashes
        'OPTIONS': {
            'init_command': "SET sql_mode='STRICT_TRANS_TABLES', INTERACTIVE_TIMEOUT=1200, WAIT_TIMEOUT=1200",
            'connect_timeout': 10,  # Fail fast if DB is unreachable
            'read_timeout': 30,
            'write_timeout': 30,
            'charset': 'utf8mb4',
        },
        # Atomic requests for data integrity
        'ATOMIC_REQUESTS': False,  # Disabled - was causing registration rollback
        'AUTOCOMMIT': True,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media/'

# Authoritative root for the OCR pipeline storage (Phase 4 Unification)
OCR_STORAGE_ROOT = str(MEDIA_ROOT / 'bulk_pipeline')

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


AUTH_USER_MODEL = 'core.User'

# TEMPORARY: Allow all origins in development to bypass browser cache issues
# TODO: Remove this and use CORS_ALLOWED_ORIGINS in production
CORS_ALLOW_ALL_ORIGINS = DEBUG  # True in development, False in production
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-tenant-id',
]

# Development and Production origins
CORS_ALLOWED_ORIGINS = [
    # Production domains
    "https://finpixe.com",
    "https://www.finpixe.com",
    "https://api.finpixe.com",
    "http://16.171.255.74",
    "https://16.171.255.74",
    "http://13.235.91.238",
    "https://13.235.91.238",
    "http://13.203.204.171",
    "https://13.203.204.171",
    # Development (only if DEBUG=True)
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5176",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5176",
    "http://localhost:3000",
    "http://16.171.255.74",
    "http://13.63.35.153",
    "http://13.235.91.238",
    "http://13.203.204.171",
]

# Filter out localhost in production
if not DEBUG:
    CORS_ALLOWED_ORIGINS = [origin for origin in CORS_ALLOWED_ORIGINS if 'localhost' not in origin and '127.0.0.1' not in origin]

CSRF_TRUSTED_ORIGINS = [
    # Production domains
    'https://finpixe.com',
    'https://www.finpixe.com',
    'https://api.finpixe.com',
    'http://16.171.255.74',
    'https://16.171.255.74',
    'http://13.235.91.238',
    'https://13.235.91.238',
    'http://13.203.204.171',
    'https://13.203.204.171',
    # Development (only if DEBUG=True)
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://16.171.255.74',
    'http://13.63.35.153',
    'http://13.235.91.238',
    'http://13.203.204.171',
]

# Filter out localhost in production
if not DEBUG:
    CSRF_TRUSTED_ORIGINS = [origin for origin in CSRF_TRUSTED_ORIGINS if 'localhost' not in origin and '127.0.0.1' not in origin]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'core.authentication.CustomJWTAuthentication', # Custom auth to read from cookie
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'EXCEPTION_HANDLER': 'core.exception_handler.custom_exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=1),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'SIGNING_KEY': os.getenv('JWT_SECRET'),
    'AUTH_HEADER_TYPES': ('Bearer',),
    
    # Cookie Settings - Secure in production
    'AUTH_COOKIE_SECURE': not DEBUG,  # True in production (HTTPS only)
    'AUTH_COOKIE_HTTPONLY': True,  # Prevent JavaScript access
    'AUTH_COOKIE_SAMESITE': 'Lax',
    'AUTH_COOKIE_DOMAIN': '.finpixe.com' if not DEBUG else None,  # Share across subdomains
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'AI Accounting API',
    'DESCRIPTION': 'Enterprise-grade AI-powered accounting system API.',
    'VERSION': '0.0.3',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_PATCH': True,
    'COMPONENT_SPLIT_REQUEST': True,
    'SECURITY': [
        {'Bearer': []},
    ],
}

# Static Files (Whitenoise)
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Redis decommissioned (Phase 4)

# Cache Configuration - Pure DB/Local Memory (Redis Decommissioned)
CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': REDIS_CACHE_URL,
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            'CONNECTION_POOL_KWARGS': {
                'max_connections': int(os.getenv('REDIS_POOL_SIZE', '100')),
                'retry_on_timeout': True,
                'socket_timeout': 5,
                'socket_connect_timeout': 5,
            },
            'IGNORE_EXCEPTIONS': True, # Fail-open for cache to prevent API downtime
        },
        'KEY_PREFIX': 'finpixe',
    }
}

# Celery Broker (Decommissioned or moved to SQS)
# CELERY_BROKER_URL = os.getenv('SQS_BROKER_URL')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60  # 30 minutes
# Production: Ensure queue durability
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1

# Production: Ensure queue durability
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1


# ============================================================================
# BULK PROCESSING PIPELINE SETTINGS
# ============================================================================
BULK_MAX_ACTIVE_JOBS_PER_TENANT = int(os.getenv('BULK_MAX_ACTIVE_JOBS', '50000'))
BULK_AI_RATE_LIMITER_SLOTS = int(os.getenv('BULK_AI_SLOTS', '100000'))
BULK_AI_CALL_GAP_SECONDS = float(os.getenv('BULK_AI_CALL_GAP', '0.5'))
BULK_MAX_RETRIES = int(os.getenv('BULK_MAX_RETRIES', '3'))
BULK_STUCK_THRESHOLD_MINUTES = int(os.getenv('BULK_STUCK_THRESHOLD', '5'))

# Increase upload limits for large bulk scans (effectively infinite)
DATA_UPLOAD_MAX_MEMORY_SIZE = 1073741824  # 1GB
FILE_UPLOAD_MAX_MEMORY_SIZE = 1073741824  # 1GB

# ============================================================================
# LOGIN SECURITY SETTINGS
# ============================================================================
SECURE_LOGIN_MODE = os.getenv('SECURE_LOGIN_MODE', str(not DEBUG)).lower() == 'true'
LOGIN_MAX_ATTEMPTS = int(os.getenv('LOGIN_MAX_ATTEMPTS', '5'))
LOGIN_LOCKOUT_MINUTES = int(os.getenv('LOGIN_LOCKOUT_MINUTES', '5'))

# Twilio SMS Configuration (Optional - falls back to mock SMS if not configured)
TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID', None)
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN', None)
TWILIO_PHONE_NUMBER = os.getenv('TWILIO_PHONE_NUMBER', None)

# ============================================================================
# PRODUCTION SECURITY SETTINGS
# ============================================================================

# Security Headers (enabled in production)
if not DEBUG:
    # HTTPS/SSL Settings
    #SECURE_SSL_REDIRECT = True  # Redirect all HTTP to HTTPS
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')  # Trust proxy headers
    
    # HSTS (HTTP Strict Transport Security)
    SECURE_HSTS_SECONDS = 31536000  # 1 year
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    
    # Cookie Security
    SESSION_COOKIE_SECURE = True  # HTTPS only
    CSRF_COOKIE_SECURE = True  # HTTPS only
    SESSION_COOKIE_HTTPONLY = True  # Prevent JavaScript access
    CSRF_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    CSRF_COOKIE_SAMESITE = 'Lax'
    
    # Content Security Policy (basic - customize as needed)
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_BROWSER_XSS_FILTER = True
    X_FRAME_OPTIONS = 'DENY'  # Prevent clickjacking
    
    # Additional Security
    SECURE_REFERRER_POLICY = 'same-origin'

# Session Configuration (Database-backed)
SESSION_ENGINE = 'django.contrib.sessions.backends.db'  # Use database for sessions
SESSION_COOKIE_AGE = 86400  # 24 hours
SESSION_SAVE_EVERY_REQUEST = False  # Only save if modified

# Logging Configuration
LOGS_DIR = os.path.join(BASE_DIR, 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file_error': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': os.path.join(LOGS_DIR, 'error.log'),
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
        'file_debug': {
            'level': 'DEBUG',
            'class': 'logging.FileHandler',
            'filename': os.path.join(LOGS_DIR, 'debug.log'),
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
    },
    'root': {
        'handlers': ['console', 'file_error'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file_error'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.request': {
            'handlers': ['file_error'],
            'level': 'ERROR',
            'propagate': False,
        },
        'core': {
            'handlers': ['console', 'file_debug'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'ocr_pipeline': {
            'handlers': ['console', 'file_debug'],
            'level': 'DEBUG',
            'propagate': False,
        },
        'OCRWorker': {
            'handlers': ['console', 'file_debug'],
            'level': 'DEBUG',
            'propagate': False,
        },
    },
}

# Suppress check for unique USERNAME_FIELD (handled by unique_together with tenant_id)
SILENCED_SYSTEM_CHECKS = ['auth.E003']

# ============================================================================
# EMAIL CONFIGURATION (SMTP)
# ============================================================================
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() == "true"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL") or EMAIL_HOST_USER or 'webmaster@localhost'

# Django migrations enabled for project apps.
MIGRATION_MODULES = {}

# BANK RECONCILIATION SETTINGS
# ============================================================================
BANK_MATCH_TOLERANCE = 1

# ============================================================================
# MEDIA FILES (Local storage for dev when S3 is not configured)
# ============================================================================
MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media/'

# ============================================================================
# MEDIA FILES (Local storage for dev when S3 is not configured)
# ============================================================================
MEDIA_ROOT = BASE_DIR / 'media'
MEDIA_URL = '/media/'