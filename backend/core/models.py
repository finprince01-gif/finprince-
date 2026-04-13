from django.db import models  # type: ignore
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin  # type: ignore
from django.utils import timezone  # type: ignore
import uuid

class CustomUserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError('The Username field must be set')
        
        # Ensure tenant creation logic
        tenant_id = extra_fields.get('tenant_id')
        if not tenant_id:
            company_name = extra_fields.get('company_name')
            if not company_name:
                raise ValueError('Company Name is required for new user registration')
            
            # Generate new Branch
            tenant_id = str(uuid.uuid4())
            
            # Create Branch record
            # Import here to avoid circular dependency issues if any, though runtime resolution works
            from .models import Tenant
            try:
                Tenant.objects.get_or_create(id=tenant_id, defaults={'name': company_name})
            except Exception as e:
                Tenant.objects.create(id=tenant_id, name=company_name)
            
            extra_fields['tenant_id'] = tenant_id

        # Set default flags
        extra_fields.setdefault('is_active', True)
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        return self.create_user(username, password, **extra_fields)

class MasterUser(AbstractBaseUser):
    id = models.CharField(max_length=36, primary_key=True, default=uuid.uuid4)
    name = models.CharField(max_length=200, null=True, blank=True)
    pan_number = models.CharField(max_length=10, null=True, blank=True)
    gstin = models.CharField(max_length=15, null=True, blank=True)
    cin = models.CharField(max_length=21, null=True, blank=True)
    
    # Address & Contact
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    address_line3 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    country = models.CharField(max_length=100, blank=True, null=True, default='India')
    pincode = models.CharField(max_length=10, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True, null=True)

    email = models.EmailField(unique=True)
    username = models.CharField(max_length=150, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    USERNAME_FIELD = 'username'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = ['email']

    class Meta:
        db_table = 'master_users'

    @property
    def is_superuser(self):
        """Compatibility property: Master admins are platform-level superusers"""
        return True

    @property
    def is_staff(self):
        """Compatibility property: Master admins have staff-level access"""
        return True

    @property
    def tenant_id(self):
        """Compatibility property: Master admins have no tenant context"""
        return None

    def __str__(self):
        return self.username



class Tenant(models.Model):
    id = models.CharField(max_length=36, primary_key=True)
    name = models.CharField(max_length=200, unique=True)
    branch_name = models.CharField(max_length=200, null=True, blank=True)
    business_type = models.CharField(max_length=200, null=True, blank=True)
    
    gstin = models.CharField(max_length=15, null=True, blank=True, unique=True)
    pan_number = models.CharField(max_length=10, null=True, blank=True, db_index=True)
    cin = models.CharField(max_length=21, blank=True, null=True)
    tan = models.CharField(max_length=10, blank=True, null=True)
    
    # Address & Contact
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    address_line3 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    district = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    country = models.CharField(max_length=100, blank=True, null=True, default='India')
    pincode = models.CharField(max_length=10, blank=True, null=True)


    email = models.CharField(max_length=255, blank=True, null=True)
    phone = models.CharField(max_length=15, blank=True, null=True)
    website = models.CharField(max_length=255, blank=True, null=True)

    # Branding & Banking
    logo_path = models.CharField(max_length=500, blank=True, null=True)
    bank_name = models.CharField(max_length=255, blank=True, null=True)
    bank_account_no = models.CharField(max_length=20, blank=True, null=True)
    bank_ifsc = models.CharField(max_length=11, blank=True, null=True)

    master = models.ForeignKey(MasterUser, on_delete=models.CASCADE, null=True, related_name='branches')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'tenants'

    def __str__(self):
        return self.name

# Alias for code usage
Branch = Tenant

class User(AbstractBaseUser):
    # Map to 'users' table strictly
    id = models.BigAutoField(primary_key=True) # Matches BIGINT in DB
    # Username can be duplicated - no uniqueness constraint
    username = models.CharField(max_length=100)
    full_name = models.CharField(max_length=200, null=True, blank=True)
    company_name = models.CharField(max_length=255, null=True, blank=True)
    # Email must be unique globally across all tenants
    email = models.CharField(max_length=255, unique=True, blank=True, null=True)
    
    state = models.CharField(max_length=100, null=True, blank=True)
    selected_plan = models.CharField(max_length=50, null=True, blank=True)
    logo_path = models.CharField(max_length=500, blank=True, null=True)
    tenant_id = models.CharField(max_length=36, null=True, blank=True)
    
    # OTP verification fields
    phone = models.CharField(max_length=15, blank=True, null=True)
    phone_verified = models.BooleanField(default=False)
    
    is_active = models.BooleanField(default=True)
    
    # NEW: Formal RBAC Roles
    ROLE_CHOICES = [
        ('BRANCH_USER', 'Branch User'),
        ('COMPANY_ADMIN', 'Company Admin'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='BRANCH_USER')
    
    is_superuser = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    # last_login provided by AbstractBaseUser
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    subscription_start_date = models.DateField(default=timezone.now)
    access_expiry = models.DateTimeField(null=True, blank=True)


    objects = CustomUserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['company_name']

    class Meta:

        db_table = 'users'
        # Removed unique_together constraint - usernames can be duplicated
        # Email uniqueness is enforced at the field level
    
    def __str__(self):
        return self.username

    @property
    def branch_id(self):
        return self.tenant_id

    @branch_id.setter
    def branch_id(self, value):
        self.tenant_id = value

class BaseModel(models.Model):
    # Schema tables usually have tenant_id.
    # We will use this mixin for convenience but specify db_table in children.
    tenant_id = models.CharField(max_length=36, db_index=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:

        abstract = True
    
    def save(self, *args, **kwargs):
        """Ensure created_at and updated_at are timezone-aware"""
        from django.utils.timezone import is_aware, make_aware  # type: ignore
        
        # Fix created_at if it's naive
        if self.created_at and not is_aware(self.created_at):
            self.created_at = make_aware(self.created_at)
        
        # Fix updated_at if it's naive
        if self.updated_at and not is_aware(self.updated_at):
            self.updated_at = make_aware(self.updated_at)
        
        super().save(*args, **kwargs)


# CompanyFullInfo removed - consolidated into Company model

class PasswordResetOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_otps')
    otp_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:

        db_table = 'password_reset_otps'

class AIUsage(models.Model):
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, db_column='tenant_id', null=True)
    year = models.IntegerField()
    month = models.IntegerField()
    used_count = models.IntegerField(default=0)

    class Meta:

        db_table = 'ai_usage'
        unique_together = ('tenant', 'year', 'month')

    def __str__(self):
        return f"{self.tenant.id if self.tenant else 'No Tenant'} - {self.year}/{self.month}: {self.used_count}"

class ExtractionPerformance(models.Model):
    file_count = models.IntegerField(default=1)
    processing_time_seconds = models.FloatField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:

        db_table = 'extraction_performance'


# Alias for architecture transition
Branch = Tenant
