
import os
from pathlib import Path
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# SECURITY: No fallback - fail fast if secret is missing
SECRET_KEY = os.getenv('DJANGO_SECRET')
if not SECRET_KEY:
    raise ValueError("DJANGO_SECRET environment variable must be set")

DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'

# Production: Specify exact domains (no wildcards)
ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,finpixe.com,www.finpixe.com,api.finpixe.com,testserver,16.171.255.74').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'core',
    'accounting',
    'inventory',
    'vendors',  # Vendor Portal
    'customerportal',  # Customer Portal
    'payroll',  # Payroll Management
    'services',  # Services Management
    'rbac',  # Role-Based Access Control
    'rest_framework_simplejwt',
    'reports',
]

MIDDLEWARE = [
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
        'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '1200')),  # 20 minutes
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
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

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
    # Development (only if DEBUG=True)
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5176",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5176",
    "http://localhost:3000",
    "http://16.171.255.74",
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
    # Development (only if DEBUG=True)
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://localhost:3000',
    'http://16.171.255.74',
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

# Static Files (Whitenoise)
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# In-Memory Cache Configuration (No Redis)
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'unique-snowflake',
    }
}




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
    SECURE_SSL_REDIRECT = True  # Redirect all HTTP to HTTPS
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
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '{message}',
            'style': '{',
        },
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
        },
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': os.path.join(BASE_DIR, 'debug.log'),
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console', 'file'],
        'level': 'INFO',
    },
    'loggers': {
        'django.server': {
            'handlers': ['console'],
            'level': 'ERROR', # Suppress "INFO basehttp" logs
            'propagate': False,
        },
        'core.auth_views': {
            'handlers': ['console'],
            'level': 'INFO',
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'login': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
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
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True") == "True"
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL") or EMAIL_HOST_USER or 'webmaster@localhost'

# ============================================================================
# DISABLE MIGRATIONS
# ============================================================================
MIGRATION_MODULES = {
    'core': None,
    # 'accounting': None,
    'inventory': None,
    'customerportal': None,
    'payroll': None,
    'services': None,
    'rbac': None,
    'reports': None,
    'registration': None,
    'login': None,
    'masters': None,
    'settings': None,
    'vouchers': None,
    'dashboard': None,
}
