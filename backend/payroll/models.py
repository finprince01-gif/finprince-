from django.db import models
from django.core.validators import MinValueValidator
from decimal import Decimal


class EmployeeBasicDetails(models.Model):
    """Employee Basic Details - Core personal information"""
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Inactive', 'Inactive'),
    ]
    
    # Basic Details
    tenant_id = models.CharField(max_length=36, db_index=True)
    employee_code = models.CharField(max_length=50, unique=True)
    employee_name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    # Status
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_employee_basic_details'
        unique_together = [['tenant_id', 'employee_code']]
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['employee_code']),
        ]
    
    def __str__(self):
        return f"{self.employee_code} - {self.employee_name}"


class EmployeeEmployment(models.Model):
    """Employee Employment Details"""
    EMPLOYMENT_TYPE_CHOICES = [
        ('Full-Time', 'Full-Time'),
        ('Part-Time', 'Part-Time'),
        ('Contract', 'Contract'),
        ('Intern', 'Intern'),
    ]
    
    employee_basic = models.OneToOneField(EmployeeBasicDetails, on_delete=models.CASCADE, related_name='employment')
    tenant_id = models.CharField(max_length=36, db_index=True, blank=True, null=True)
    department = models.CharField(max_length=100, blank=True, null=True)
    designation = models.CharField(max_length=100, blank=True, null=True)
    date_of_joining = models.DateField(blank=True, null=True)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='Full-Time')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_employee_employment'
    
    def __str__(self):
        return f"{self.employee_basic.employee_name} - Employment"


class EmployeeSalary(models.Model):
    """Employee Salary Details"""
    employee_basic = models.OneToOneField(EmployeeBasicDetails, on_delete=models.CASCADE, related_name='salary')
    tenant_id = models.CharField(max_length=36, db_index=True, blank=True, null=True)
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    hra = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_employee_salary'
    
    def __str__(self):
        return f"{self.employee_basic.employee_name} - Salary"


class EmployeeStatutory(models.Model):
    """Employee Statutory Compliance Details"""
    employee_basic = models.OneToOneField(EmployeeBasicDetails, on_delete=models.CASCADE, related_name='statutory')
    tenant_id = models.CharField(max_length=36, db_index=True, blank=True, null=True)
    pan_number = models.CharField(max_length=10, blank=True, null=True)
    uan_number = models.CharField(max_length=12, blank=True, null=True)  # EPF UAN
    esi_number = models.CharField(max_length=17, blank=True, null=True)
    aadhar_number = models.CharField(max_length=12, blank=True, null=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_employee_statutory'
    
    def __str__(self):
        return f"{self.employee_basic.employee_name} - Statutory"


class EmployeeBankDetails(models.Model):
    """Employee Bank Details"""
    employee_basic = models.ForeignKey(EmployeeBasicDetails, on_delete=models.CASCADE, related_name='bank_details')
    tenant_id = models.CharField(max_length=36, db_index=True, blank=True, null=True)
    account_number = models.CharField(max_length=20, blank=True, null=True)
    ifsc_code = models.CharField(max_length=11, blank=True, null=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    branch_name = models.CharField(max_length=100, blank=True, null=True)
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_employee_bank_details'
    
    def __str__(self):
        return f"{self.employee_basic.employee_name} - Bank Details"


# Legacy Employee model kept for backward compatibility with existing records
# Will be deprecated after data migration
class Employee(models.Model):
    """Employee Master - Core employee information (DEPRECATED - Use EmployeeBasicDetails instead)"""
    EMPLOYMENT_TYPE_CHOICES = [
        ('Full-Time', 'Full-Time'),
        ('Part-Time', 'Part-Time'),
        ('Contract', 'Contract'),
        ('Intern', 'Intern'),
    ]
    
    GENDER_CHOICES = [
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Inactive', 'Inactive'),
    ]
    
    # Basic Details
    tenant_id = models.CharField(max_length=36, db_index=True)
    employee_code = models.CharField(max_length=50, unique=True)
    employee_name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True, null=True)
    date_of_birth = models.DateField(blank=True, null=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True, null=True)
    address = models.TextField(blank=True, null=True)
    
    # Employment Details
    department = models.CharField(max_length=100, blank=True, null=True)
    designation = models.CharField(max_length=100, blank=True, null=True)
    date_of_joining = models.DateField(blank=True, null=True)
    employment_type = models.CharField(max_length=20, choices=EMPLOYMENT_TYPE_CHOICES, default='Full-Time')
    
    # Salary Details
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    hra = models.DecimalField(max_digits=12, decimal_places=2, default=0, validators=[MinValueValidator(Decimal('0'))])
    
    # Statutory Details
    pan_number = models.CharField(max_length=10, blank=True, null=True)
    uan_number = models.CharField(max_length=12, blank=True, null=True)  # EPF UAN
    esi_number = models.CharField(max_length=17, blank=True, null=True)
    aadhar_number = models.CharField(max_length=12, blank=True, null=True)
    
    # Bank Details
    account_number = models.CharField(max_length=20, blank=True, null=True)
    ifsc_code = models.CharField(max_length=11, blank=True, null=True)
    bank_name = models.CharField(max_length=100, blank=True, null=True)
    branch_name = models.CharField(max_length=100, blank=True, null=True)
    
    # Status
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='Active')
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_employee'
        unique_together = [['tenant_id', 'employee_code']]
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['employee_code']),
        ]
    
    def __str__(self):
        return f"{self.employee_code} - {self.employee_name}"



class SalaryComponent(models.Model):
    """Salary Components - Earnings and Deductions"""
    COMPONENT_TYPE_CHOICES = [
        ('Earning', 'Earning'),
        ('Deduction', 'Deduction'),
    ]
    
    CALCULATION_TYPE_CHOICES = [
        ('Fixed', 'Fixed Amount'),
        ('Percentage', 'Percentage of Basic'),
    ]
    
    tenant_id = models.CharField(max_length=36, db_index=True)
    component_code = models.CharField(max_length=50)
    component_name = models.CharField(max_length=100)
    component_type = models.CharField(max_length=10, choices=COMPONENT_TYPE_CHOICES)
    calculation_type = models.CharField(max_length=20, choices=CALCULATION_TYPE_CHOICES, default='Fixed')
    default_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    is_statutory = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_salary_component'
        unique_together = [['tenant_id', 'component_code']]
    
    def __str__(self):
        return f"{self.component_name} ({self.component_type})"


class SalaryTemplate(models.Model):
    """Salary Templates - Pre-defined salary structures"""
    tenant_id = models.CharField(max_length=36, db_index=True)
    template_name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_salary_template'
        unique_together = [['tenant_id', 'template_name']]
    
    def __str__(self):
        return self.template_name


class SalaryTemplateComponent(models.Model):
    """Components in a Salary Template"""
    template = models.ForeignKey(SalaryTemplate, on_delete=models.CASCADE, related_name='components')
    component = models.ForeignKey(SalaryComponent, on_delete=models.CASCADE)
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    class Meta:
        managed = False
        db_table = 'payroll_salary_template_component'
        unique_together = [['template', 'component']]
    
    def __str__(self):
        return f"{self.template.template_name} - {self.component.component_name}"





class PayRun(models.Model):
    """Pay Run - Monthly/Periodic salary processing"""
    STATUS_CHOICES = [
        ('Draft', 'Draft'),
        ('Processed', 'Processed'),
        ('Approved', 'Approved'),
        ('Paid', 'Paid'),
    ]
    
    tenant_id = models.CharField(max_length=36, db_index=True, blank=True, null=True)
    pay_run_code = models.CharField(max_length=50, unique=True, blank=True, null=True)
    pay_period = models.CharField(max_length=50, blank=True, null=True)  # e.g., "January 2026"
    start_date = models.DateField(blank=True, null=True)
    end_date = models.DateField(blank=True, null=True)
    payment_date = models.DateField(blank=True, null=True)
    
    total_employees = models.IntegerField(default=0)
    gross_pay = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    net_pay = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Draft', blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    processed_by = models.CharField(max_length=100, blank=True, null=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_pay_run'
        unique_together = [['tenant_id', 'pay_run_code']]
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['start_date', 'end_date']),
        ]
    
    def __str__(self):
        return f"{self.pay_period} - {self.status}"


class PayRunDetail(models.Model):
    """Individual employee payroll details for a pay run"""
    pay_run = models.ForeignKey(PayRun, on_delete=models.CASCADE, related_name='details')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE)
    
    # Earnings
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    hra = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_allowances = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    gross_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Deductions
    epf_employee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    esi_employee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    professional_tax = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tds = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Net Pay
    net_salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Attendance
    days_present = models.IntegerField(default=0)
    days_absent = models.IntegerField(default=0)
    paid_leaves = models.IntegerField(default=0)
    
    # Payment Status
    is_paid = models.BooleanField(default=False)
    payment_date = models.DateField(blank=True, null=True)
    payment_reference = models.CharField(max_length=100, blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_pay_run_detail'
        unique_together = [['pay_run', 'employee']]
    
    def __str__(self):
        return f"{self.pay_run.pay_period} - {self.employee.employee_name}"


class StatutoryConfiguration(models.Model):
    """Statutory compliance configuration (EPF, ESI, PT, etc.)"""
    STATUTORY_TYPE_CHOICES = [
        ('EPF', 'Employee Provident Fund'),
        ('ESI', 'Employee State Insurance'),
        ('PT', 'Professional Tax'),
        ('LWF', 'Labour Welfare Fund'),
    ]
    
    tenant_id = models.CharField(max_length=36, db_index=True)
    statutory_type = models.CharField(max_length=10, choices=STATUTORY_TYPE_CHOICES)
    
    # EPF/ESI Configuration
    employee_contribution_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    employer_contribution_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    # Threshold limits
    salary_threshold = models.DecimalField(max_digits=12, decimal_places=2, default=0, blank=True, null=True)
    
    # PT Configuration
    state = models.CharField(max_length=50, blank=True, null=True)
    pt_slab_data = models.JSONField(blank=True, null=True)  # Store PT slabs as JSON
    
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_statutory_configuration'
        unique_together = [['tenant_id', 'statutory_type']]
    
    def __str__(self):
        return f"{self.statutory_type} Configuration"


class Attendance(models.Model):
    """Employee Attendance Records"""
    tenant_id = models.CharField(max_length=36, db_index=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='attendance')
    attendance_date = models.DateField()
    
    STATUS_CHOICES = [
        ('Present', 'Present'),
        ('Absent', 'Absent'),
        ('Half-Day', 'Half-Day'),
        ('Leave', 'Leave'),
        ('Holiday', 'Holiday'),
    ]
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Present')
    check_in_time = models.TimeField(blank=True, null=True)
    check_out_time = models.TimeField(blank=True, null=True)
    working_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    overtime_hours = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    
    remarks = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_attendance'
        unique_together = [['employee', 'attendance_date']]
        indexes = [
            models.Index(fields=['tenant_id', 'attendance_date']),
        ]
    
    def __str__(self):
        return f"{self.employee.employee_name} - {self.attendance_date} - {self.status}"


class LeaveApplication(models.Model):
    """Employee Leave Management"""
    LEAVE_TYPE_CHOICES = [
        ('Casual', 'Casual Leave'),
        ('Sick', 'Sick Leave'),
        ('Earned', 'Earned Leave'),
        ('Unpaid', 'Unpaid Leave'),
        ('Maternity', 'Maternity Leave'),
        ('Paternity', 'Paternity Leave'),
    ]
    
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
    ]
    
    tenant_id = models.CharField(max_length=36, db_index=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leaves')
    leave_type = models.CharField(max_length=20, choices=LEAVE_TYPE_CHOICES)
    
    start_date = models.DateField()
    end_date = models.DateField()
    total_days = models.IntegerField(default=1)
    
    reason = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Pending')
    
    approved_by = models.CharField(max_length=100, blank=True, null=True)
    approved_date = models.DateTimeField(blank=True, null=True)
    rejection_reason = models.TextField(blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        managed = False
        db_table = 'payroll_leave_application'
        indexes = [
            models.Index(fields=['tenant_id', 'status']),
            models.Index(fields=['employee', 'start_date']),
        ]
    
    def __str__(self):
        return f"{self.employee.employee_name} - {self.leave_type} ({self.start_date} to {self.end_date})"

# trigger reload

