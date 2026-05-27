from rest_framework import serializers
from .models import MasterUser

class MasterUserSerializer(serializers.ModelSerializer):
    address = serializers.SerializerMethodField()
    pan = serializers.CharField(source='pan_number', read_only=True)

    class Meta:
        model = MasterUser
        fields = [
            'id', 'name', 'pan', 'pan_number', 'gstin', 'cin', 'username', 'email', 'created_at',
            'address', 'address_line1', 'address_line2', 'address_line3', 'city', 
            'district', 'state', 'country', 'pincode', 'phone'
        ]

    def get_address(self, obj):
        parts = [obj.address_line1, obj.address_line2, obj.address_line3]
        return ", ".join([p for p in parts if p]).strip()

class MasterRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = MasterUser
        fields = [
            'name', 'pan_number', 'gstin', 'cin', 'username', 'email', 'password',
            'address_line1', 'address_line2', 'address_line3', 'city', 
            'district', 'state', 'country', 'pincode', 'phone'
        ]
        extra_kwargs = {
            'email': {
                'validators': [],
            }
        }

    def validate(self, attrs):
        pan_number = attrs.get('pan_number')
        email = attrs.get('email')
        phone = attrs.get('phone')

        if pan_number:
            if MasterUser.objects.filter(pan_number__iexact=pan_number).exists():
                raise serializers.ValidationError({"pan_number": ["PAN number is already existing"]})

        if email:
            if MasterUser.objects.filter(email__iexact=email).exists():
                raise serializers.ValidationError({"email": ["Admin Email is already existing"]})

        if phone:
            if len(phone) != 10 or not phone.isdigit():
                raise serializers.ValidationError({"phone": ["Contact Phone must be 10 digits"]})
                
        return attrs

    def create(self, validated_data):
        from django.contrib.auth.hashers import make_password
        validated_data['password'] = make_password(validated_data['password'])
        return super().create(validated_data)

from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.settings import api_settings

class MasterTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        refresh = self.token_class(attrs["refresh"])
        
        # SimpleJWT uses 'user_id' claim by default
        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM)
        
        try:
            master = MasterUser.objects.get(id=user_id)
        except (MasterUser.DoesNotExist, ValueError):
            raise serializers.ValidationError("Master Admin not found or invalid token")
            
        if not master.is_active:
            raise serializers.ValidationError("Master Admin account is disabled")

        data = {"access": str(refresh.access_token)}

        # Update specific claims for Master token identity
        refresh['master_id'] = str(master.id)
        refresh['type'] = 'master'

        if api_settings.ROTATE_REFRESH_TOKENS:
            if api_settings.BLACKLIST_AFTER_ROTATION:
                try:
                    refresh.blacklist()
                except AttributeError:
                    pass

            refresh.set_jti()
            refresh.set_exp()
            refresh.set_iat()
            
            try:
                refresh.outstand()
            except AttributeError:
                pass

            data["refresh"] = str(refresh)

        return data

class MasterLoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
