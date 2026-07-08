import os
import uuid
from django.utils import timezone
import requests

class SandboxGSTService:
    """
    Service for integrating with the Sandbox API (developer.sandbox.co.in).
    """
    
    def __init__(self, api_key=None, api_secret=None):
        self.api_key = api_key or os.environ.get('SANDBOX_API_KEY')
        self.api_secret = api_secret or os.environ.get('SANDBOX_API_SECRET')
        self.base_url = "https://api.sandbox.co.in"
        self.mock_mode = True 
        
        self.headers = {
            'accept': 'application/json',
            'x-api-key': self.api_key or '',
            'x-api-version': '1.0',
            'Content-Type': 'application/json'
        }
        
    def authenticate(self):
        """Perform 2-step authentication handshake to get a Bearer Access Token"""
        if self.mock_mode:
            return {"success": True, "access_token": "sandbox_auth_not_required_for_basic_tests"}

        url = f"{self.base_url}/authenticate"
        auth_headers = {
            'accept': 'application/json',
            'x-api-key': self.api_key or '',
            'x-api-secret': self.api_secret or '',
            'x-api-version': '1.0'
        }
        try:
            res = requests.post(url, headers=auth_headers)
            if res.status_code == 200:
                token = res.json().get('access_token')
                return {"success": True, "access_token": token}
            return {"success": False, "error": f"Auth Failed: {res.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _get_auth_headers(self):
        auth_res = self.authenticate()
        headers = self.headers.copy()
        if auth_res.get('success') and auth_res.get('access_token'):
            headers['Authorization'] = auth_res['access_token'] # Sometimes Sandbox doesn't use Bearer, just the token
        
        # In Sandbox APIs, passing x-api-secret directly is also often supported if authenticate isn't used
        headers['x-api-secret'] = self.api_secret or ''
        return headers

    def verify_gstin(self, gstin):
        """Mock GSTIN verification"""
        if self.mock_mode:
            return {"success": True, "data": {"gstin": gstin}}
            
        url = f"{self.base_url}/gst/compliance/public/gstin/search"
        try:
            res = requests.get(url, headers=self._get_auth_headers(), params={"gstin": gstin})
            return {"success": res.status_code == 200, "data": res.json() if res.status_code == 200 else res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def request_otp(self, gstin):
        """Simulates requesting an OTP from Sandbox API"""
        if self.mock_mode:
            return {"success": True, "message": f"OTP successfully sent to registered mobile for {gstin}"}
            
        url = f"{self.base_url}/authenticate/request-otp"
        try:
            res = requests.post(url, headers=self._get_auth_headers(), json={"gstin": gstin})
            if res.status_code == 200:
                return {"success": True, "message": "OTP sent successfully", "data": res.json()}
            else:
                return {"success": False, "error": f"Failed to request OTP: {res.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def verify_otp(self, gstin, otp):
        """Simulates verifying an OTP with Sandbox API"""
        if self.mock_mode:
            if otp == "123456": # Standard mock OTP
                return {"success": True, "auth_token": f"mock_token_{uuid.uuid4().hex}"}
            else:
                return {"success": False, "error": "Invalid OTP. Please enter 123456"}
                
        url = f"{self.base_url}/authenticate/verify-otp"
        try:
            res = requests.post(url, headers=self._get_auth_headers(), json={"gstin": gstin, "otp": otp})
            if res.status_code == 200:
                return {"success": True, "auth_token": res.json().get("auth_token", f"mock_token_{uuid.uuid4().hex}")}
            else:
                return {"success": False, "error": f"Failed to verify OTP: {res.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def file_gstr1(self, month, year, data_payload, auth_token=None):
        """Filing GSTR1 to the Sandbox API"""
        if self.mock_mode:
            return {
                "success": True,
                "reference_id": f"REF-GSTR1-{uuid.uuid4().hex[:8]}",
                "message": f"Successfully filed GSTR-1 for {month}/{year} (MOCK)",
                "timestamp": timezone.now().isoformat()
            }
            
        url = f"{self.base_url}/gst/compliance/tax-payer/gstrs/gstr-1/{year}/{month}/file"
        try:
            headers = self._get_auth_headers()
            if auth_token:
                headers['Authorization'] = auth_token
            response = requests.post(url, headers=headers, json=data_payload)
            if response.status_code in [200, 201, 202]:
                return {
                    "success": True,
                    "reference_id": response.json().get("reference_id", f"REF-{uuid.uuid4().hex[:6]}"),
                    "message": "Successfully submitted to Sandbox API",
                    "sandbox_response": response.json()
                }
            else:
                return {
                    "success": False,
                    "error": f"Sandbox API Rejected: {response.text}"
                }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def fetch_gstr2b(self, gstin, month, year):
        """Fetching GSTR-2B data automatically from government"""
        if self.mock_mode:
            return {"success": True, "data": {"b2b": []}}
            
        url = f"{self.base_url}/gst/compliance/tax-payer/gstrs/gstr-2b/{year}/{month}/details"
        try:
            response = requests.get(url, headers=self._get_auth_headers())
            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            else:
                return {"success": False, "error": f"Sandbox API Error: {response.text}"}
        except Exception as e:
            return {"success": False, "error": str(e)}
