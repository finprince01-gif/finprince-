
import requests

# Mock authentication if needed, but for now let's just see if the endpoint exists and responds
url = 'http://localhost:8000/api/vendors/po-settings/3/'
try:
    response = requests.delete(url)
    print(f"Status: {response.status_code}")
    print(f"Body: {response.text}")
except Exception as e:
    print(f"Error: {e}")
