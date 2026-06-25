import os
import requests

print("PYTHON SEES VALIDATION_PASS:", repr(os.environ.get("VALIDATION_PASS")))
print("PYTHON SEES VALIDATION_USER:", repr(os.environ.get("VALIDATION_USER")))
print("PYTHON SEES VALIDATION_EMAIL:", repr(os.environ.get("VALIDATION_EMAIL")))

# Try HTTP login with env values
user = os.environ.get("VALIDATION_USER", "admin")
email = os.environ.get("VALIDATION_EMAIL", "admin@budstech.com")
passwd = os.environ.get("VALIDATION_PASS", "Sprint3Val@2026")

login_url = "http://localhost:8000/api/auth/login/"
payload = {"username": user, "email": email, "password": passwd}
print("PAYLOAD:", payload)
resp = requests.post(login_url, json=payload)
print(f"HTTP Status: {resp.status_code}")
print(f"HTTP Response: {resp.text}")
