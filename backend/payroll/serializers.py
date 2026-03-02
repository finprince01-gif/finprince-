from rest_framework import serializers
from .models import (
    Employee, EmployeeBasicDetails, EmployeeEmployment, EmployeeSalary,
    EmployeeStatutory, EmployeeBankDetails, SalaryComponent, SalaryTemplate,
    SalaryTemplateComponent, PayRun, PayRunDetail, StatutoryConfiguration,
    Attendance, LeaveApplication
)


class EmployeeBasicDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeBasicDetails
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class EmployeeEmploymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeEmployment
        fields = '__all__'
        read_only_fields = ['employee_basic', 'created_at', 'updated_at']


class EmployeeSalarySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeSalary
        fields = '__all__'
        read_only_fields = ['employee_basic', 'created_at', 'updated_at']


class EmployeeStatutorySerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeStatutory
        fields = '__all__'
        read_only_fields = ['employee_basic', 'created_at', 'updated_at']


class EmployeeBankDetailsSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeBankDetails
        fields = '__all__'
        read_only_fields = ['employee_basic', 'created_at', 'updated_at']


class EmployeeCompleteSerializer(serializers.ModelSerializer):
    """Complete employee data combining all 5 tables"""
    employment = EmployeeEmploymentSerializer(required=False)
    salary = EmployeeSalarySerializer(required=False)
    statutory = EmployeeStatutorySerializer(required=False)
    bank_details = EmployeeBankDetailsSerializer(required=False)
    
    # Explicitly define flat writable fields for input (Frontend sends flat JSON)
    department = serializers.CharField(required=False, write_only=True, allow_blank=True)
    designation = serializers.CharField(required=False, write_only=True, allow_blank=True)
    date_of_joining = serializers.DateField(required=False, write_only=True, allow_null=True)
    employment_type = serializers.CharField(required=False, write_only=True, default='Full-Time')
    
    basic_salary = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, write_only=True, default=0)
    hra = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, write_only=True, default=0)
    
    pan_number = serializers.CharField(required=False, write_only=True, allow_blank=True)
    uan_number = serializers.CharField(required=False, write_only=True, allow_blank=True)
    esi_number = serializers.CharField(required=False, write_only=True, allow_blank=True)
    aadhar_number = serializers.CharField(required=False, write_only=True, allow_blank=True)
    
    account_number = serializers.CharField(required=False, write_only=True, allow_blank=True)
    ifsc_code = serializers.CharField(required=False, write_only=True, allow_blank=True)
    bank_name = serializers.CharField(required=False, write_only=True, allow_blank=True)
    branch_name = serializers.CharField(required=False, write_only=True, allow_blank=True)
    
    # Explicitly define tenant_id to make it optional in validation
    tenant_id = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    
    class Meta:
        model = EmployeeBasicDetails
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
        extra_kwargs = {
            'tenant_id': {'required': False}
        }
    
    def to_representation(self, instance):
        """Manually construct nested data into flat response for frontend compatibility"""
        ret = super().to_representation(instance)
        
        # Employment
        if hasattr(instance, 'employment'):
            ret['department'] = instance.employment.department
            ret['designation'] = instance.employment.designation
            ret['date_of_joining'] = instance.employment.date_of_joining
            ret['employment_type'] = instance.employment.employment_type
        
        # Salary
        if hasattr(instance, 'salary'):
            ret['basic_salary'] = instance.salary.basic_salary
            ret['hra'] = instance.salary.hra
        
        # Statutory
        if hasattr(instance, 'statutory'):
            ret['pan_number'] = instance.statutory.pan_number
            ret['uan_number'] = instance.statutory.uan_number
            ret['esi_number'] = instance.statutory.esi_number
            ret['aadhar_number'] = instance.statutory.aadhar_number
        
        # Bank Details
        if hasattr(instance, 'bank_details') and instance.bank_details.exists():
            bank_detail = instance.bank_details.first()
            ret['account_number'] = bank_detail.account_number
            ret['ifsc_code'] = bank_detail.ifsc_code
            ret['bank_name'] = bank_detail.bank_name
            ret['branch_name'] = bank_detail.branch_name
            
        return ret
    
    def create(self, validated_data):
        # Extract fields for each table from the flat validated_data
        # These fields will be removed from validated_data as we extract them
        
        # Extract employment fields
        employment_data = {
            'department': validated_data.pop('department', ''),
            'designation': validated_data.pop('designation', ''),
            'date_of_joining': validated_data.pop('date_of_joining', None),
            'employment_type': validated_data.pop('employment_type', 'Full-Time'),
        }
        
        # Extract salary fields
        salary_data = {
            'basic_salary': validated_data.pop('basic_salary', 0),
            'hra': validated_data.pop('hra', 0),
        }
        
        # Extract statutory fields
        statutory_data = {
            'pan_number': validated_data.pop('pan_number', ''),
            'uan_number': validated_data.pop('uan_number', ''),
            'esi_number': validated_data.pop('esi_number', ''),
            'aadhar_number': validated_data.pop('aadhar_number', ''),
        }
        
        # Extract bank details fields
        bank_details_data = {
            'account_number': validated_data.pop('account_number', ''),
            'ifsc_code': validated_data.pop('ifsc_code', ''),
            'bank_name': validated_data.pop('bank_name', ''),
            'branch_name': validated_data.pop('branch_name', ''),
        }
        
        # Remove nested serializer fields if they exist
        validated_data.pop('employment', None)
        validated_data.pop('salary', None)
        validated_data.pop('statutory', None)
        validated_data.pop('bank_details', None)
        
        # Ensure tenant_id is set (it will be provided by perform_create in the view or fallback)
        if 'tenant_id' not in validated_data or not validated_data.get('tenant_id'):
            validated_data['tenant_id'] = 'default-tenant'
            
        tenant_id = validated_data['tenant_id']
        
        # Add tenant_id to related data
        employment_data['tenant_id'] = tenant_id
        salary_data['tenant_id'] = tenant_id
        statutory_data['tenant_id'] = tenant_id
        bank_details_data['tenant_id'] = tenant_id
        
        # Create basic details (remaining fields in validated_data)
        employee_basic = EmployeeBasicDetails.objects.create(**validated_data)
        
        # Create related records with tenant_id
        EmployeeEmployment.objects.create(employee_basic=employee_basic, **employment_data)
        EmployeeSalary.objects.create(employee_basic=employee_basic, **salary_data)
        EmployeeStatutory.objects.create(employee_basic=employee_basic, **statutory_data)
        EmployeeBankDetails.objects.create(employee_basic=employee_basic, **bank_details_data)
        
        return employee_basic
    
    def update(self, instance, validated_data):
        # Extract nested data
        employment_data = validated_data.pop('employment', None)
        salary_data = validated_data.pop('salary', None)
        statutory_data = validated_data.pop('statutory', None)
        bank_details_data = validated_data.pop('bank_details', None)
        
        # Update basic details
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update related records
        if employment_data is not None:
            for attr, value in employment_data.items():
                setattr(instance.employment, attr, value)
            instance.employment.save()
        
        if salary_data is not None:
            for attr, value in salary_data.items():
                setattr(instance.salary, attr, value)
            instance.salary.save()
        
        if statutory_data is not None:
            for attr, value in statutory_data.items():
                setattr(instance.statutory, attr, value)
            instance.statutory.save()
        
        if bank_details_data is not None:
            # Check if exists (it's a reverse FK now, so it returns a manager)
            bank_detail_obj = instance.bank_details.first()
            if bank_detail_obj:
                for attr, value in bank_details_data.items():
                    setattr(bank_detail_obj, attr, value)
                bank_detail_obj.save()
            else:
                # Create if not exists
                from .models import EmployeeBankDetails
                bank_details_data['employee_basic'] = instance
                bank_details_data['tenant_id'] = instance.tenant_id
                EmployeeBankDetails.objects.create(**bank_details_data)
        
        return instance


class EmployeeSerializer(serializers.ModelSerializer):

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class SalaryComponentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryComponent
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class SalaryTemplateComponentSerializer(serializers.ModelSerializer):
    component_name = serializers.CharField(source='component.component_name', read_only=True)
    component_type = serializers.CharField(source='component.component_type', read_only=True)
    
    class Meta:
        model = SalaryTemplateComponent
        fields = ['id', 'component', 'component_name', 'component_type', 'value']


class SalaryTemplateSerializer(serializers.ModelSerializer):
    components = SalaryTemplateComponentSerializer(many=True, read_only=True)
    
    class Meta:
        model = SalaryTemplate
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
        extra_kwargs = {
            'tenant_id': {'required': False}
        }





class PayRunDetailSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_code', read_only=True)
    
    class Meta:
        model = PayRunDetail
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class PayRunSerializer(serializers.ModelSerializer):
    details = PayRunDetailSerializer(many=True, read_only=True)
    
    class Meta:
        model = PayRun
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at', 'pay_run_code']
        extra_kwargs = {
            'tenant_id': {'required': False}
        }


class StatutoryConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = StatutoryConfiguration
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)
    
    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']


class LeaveApplicationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.employee_name', read_only=True)
    
    class Meta:
        model = LeaveApplication
        fields = '__all__'
        read_only_fields = ['created_at', 'updated_at']
