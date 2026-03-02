from django.contrib import admin
from .models import (
    Employee, SalaryComponent, SalaryTemplate, SalaryTemplateComponent,
    PayRun, PayRunDetail, StatutoryConfiguration,
    Attendance, LeaveApplication
)


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['employee_code', 'employee_name', 'department', 'designation', 'status', 'created_at']
    list_filter = ['status', 'employment_type', 'department']
    search_fields = ['employee_code', 'employee_name', 'email']
    ordering = ['-created_at']


@admin.register(SalaryComponent)
class SalaryComponentAdmin(admin.ModelAdmin):
    list_display = ['component_code', 'component_name', 'component_type', 'is_statutory', 'is_active']
    list_filter = ['component_type', 'is_statutory', 'is_active']
    search_fields = ['component_code', 'component_name']


@admin.register(SalaryTemplate)
class SalaryTemplateAdmin(admin.ModelAdmin):
    list_display = ['template_name', 'is_active', 'created_at']
    list_filter = ['is_active']
    search_fields = ['template_name']


@admin.register(PayRun)
class PayRunAdmin(admin.ModelAdmin):
    list_display = ['pay_run_code', 'pay_period', 'total_employees', 'net_pay', 'status', 'created_at']
    list_filter = ['status', 'start_date']
    search_fields = ['pay_run_code', 'pay_period']
    ordering = ['-start_date']


@admin.register(PayRunDetail)
class PayRunDetailAdmin(admin.ModelAdmin):
    list_display = ['pay_run', 'employee', 'gross_salary', 'total_deductions', 'net_salary', 'is_paid']
    list_filter = ['is_paid', 'pay_run']
    search_fields = ['employee__employee_name', 'employee__employee_code']


@admin.register(StatutoryConfiguration)
class StatutoryConfigurationAdmin(admin.ModelAdmin):
    list_display = ['statutory_type', 'employee_contribution_percentage', 'employer_contribution_percentage', 'is_active']
    list_filter = ['statutory_type', 'is_active']


@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ['employee', 'attendance_date', 'status', 'working_hours']
    list_filter = ['status', 'attendance_date']
    search_fields = ['employee__employee_name', 'employee__employee_code']
    ordering = ['-attendance_date']


@admin.register(LeaveApplication)
class LeaveApplicationAdmin(admin.ModelAdmin):
    list_display = ['employee', 'leave_type', 'start_date', 'end_date', 'total_days', 'status']
    list_filter = ['leave_type', 'status', 'start_date']
    search_fields = ['employee__employee_name', 'employee__employee_code']
    ordering = ['-created_at']
