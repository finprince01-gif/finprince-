
import requests
import json
import re

BASE_URL = "http://localhost:8000/api"

def login():
    url = f"{BASE_URL}/auth/login/"

    payload = {
        "username": "admin",
        "password": "admin123"
    }
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        tokens = response.json()
        print(f"Login successful. Tokens keys: {tokens.keys()}")
        return tokens.get('access')
    except Exception as e:
        print(f"Login failed: {e}")
        if hasattr(e, 'response') and e.response:
            print(f"Response: {e.response.text}")
        return None

def create_customer(token):
    url = f"{BASE_URL}/customerportal/customer-master/"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    # Minimal payload based on investigation
    payload = {
        "customer_name": "Test API Customer",
        "customer_code": "CUST-API-001",
        "customer_category": None,
        "gst_details": {"gstins": [], "branches": []},
        "products_services": {"items": []},
        "banking_info": {"accounts": []},
        "terms_conditions": {}
    }
    
    print(f"\nSending POST to {url}...")
    try:
        response = requests.post(url, headers=headers, json=payload)
        
        print(f"Status Code: {response.status_code}")
        

        if response.status_code == 500:
            print("Server Error (500). Writing traceback to traceback.log...")
            with open('traceback.log', 'w', encoding='utf-8') as f:
                f.write(response.text)
        else:
            print(f"Response: {response.text}")
            
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    token = login()
    if token:
        create_customer(token)
