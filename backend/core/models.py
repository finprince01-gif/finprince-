from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone

class CustomUserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError('The Username field must be set')
        
        # Registered users (owners) are superusers by default
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_staff', True)
        
        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_staff', True)
        return self.create_user(username, password, **extra_fields)

class Tenant(models.Model):
    id = models.CharField(max_length=36, primary_key=True)
    name = models.CharField(max_length=200, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'tenants'

    def __str__(self):
        return self.name

class User(AbstractBaseUser):
    # Map to 'users' table strictly
    id = models.BigAutoField(primary_key=True) # Matches BIGINT in DB
    # Username can be duplicated - no uniqueness constraint
    username = models.CharField(max_length=100)
    company_name = models.CharField(max_length=255, unique=True, null=True, blank=True)
    # Email must be unique globally across all tenants
    email = models.CharField(max_length=255, unique=True, blank=True, null=True)
    
    selected_plan = models.CharField(max_length=50, null=True, blank=True)
    logo_path = models.CharField(max_length=500, blank=True, null=True)
    tenant_id = models.CharField(max_length=36, null=True, blank=True)
    
    # OTP verification fields
    phone = models.CharField(max_length=15, blank=True, null=True)
    phone_verified = models.BooleanField(default=False)
    
    is_active = models.BooleanField(default=True)
    is_superuser = models.BooleanField(default=False)
    is_staff = models.BooleanField(default=False)
    # last_login provided by AbstractBaseUser
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    subscription_start_date = models.DateField(default=timezone.now)

    objects = CustomUserManager()

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['company_name']

    class Meta:
        db_table = 'users'
        # Removed unique_together constraint - usernames can be duplicated
        # Email uniqueness is enforced at the field level
    
    def __str__(self):
        return self.username

class BaseModel(models.Model):
    # Schema tables usually have tenant_id.
    # We will use this mixin for convenience but specify db_table in children.
    tenant_id = models.CharField(max_length=36, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True, null=True, blank=True)

    class Meta:
        abstract = True


class CompanyFullInfo(BaseModel):
    # This is likely what CompanySettingsViewSet interacts with.
    company_name = models.CharField(max_length=255)
    address_line1 = models.CharField(max_length=255, blank=True, null=True)
    address_line2 = models.CharField(max_length=255, blank=True, null=True)
    city = models.CharField(max_length=100, blank=True, null=True)
    state = models.CharField(max_length=100, blank=True, null=True)
    pincode = models.CharField(max_length=10, blank=True, null=True)
    country = models.CharField(max_length=100, default='India')
    phone = models.CharField(max_length=15, blank=True, null=True)
    mobile = models.CharField(max_length=15, blank=True, null=True)
    email = models.CharField(max_length=255, blank=True, null=True)
    website = models.CharField(max_length=255, blank=True, null=True)
    gstin = models.CharField(max_length=15, blank=True, null=True)
    pan = models.CharField(max_length=10, blank=True, null=True)
    cin = models.CharField(max_length=21, blank=True, null=True)
    tan = models.CharField(max_length=10, blank=True, null=True)
    business_type = models.CharField(max_length=50, blank=True, null=True)
    industry_type = models.CharField(max_length=100, blank=True, null=True)
    financial_year_start = models.DateField(null=True, blank=True)
    financial_year_end = models.DateField(null=True, blank=True)
    logo_path = models.CharField(max_length=500, blank=True, null=True)
    signature_path = models.CharField(max_length=500, blank=True, null=True)
    bank_name = models.CharField(max_length=255, blank=True, null=True)
    bank_account_no = models.CharField(max_length=20, blank=True, null=True)
    bank_ifsc = models.CharField(max_length=11, blank=True, null=True)
    bank_branch = models.CharField(max_length=255, blank=True, null=True)
    voucher_numbering = models.JSONField(null=True, blank=True)
    

class PasswordResetOTP(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_otps')
    otp_hash = models.CharField(max_length=255)
    expires_at = models.DateTimeField()
    attempts = models.IntegerField(default=0)
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'password_reset_otps'
