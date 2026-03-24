import requests

url = "http://localhost:8000/api/bulk-upload/"
# For simple testing, we need to bypass auth or use a token.
# But I can just check if the endpoint exists and doesn't 404.
try:
    # Mimic the frontend request closely
    response = requests.post(url, files={'files': ('test.pdf', b'fake-pdf-content')}, data={'voucher_type': 'Purchase'})
    print(f"Status: {response.status_code}")
    print(f"Content: {response.text}")
except Exception as e:
    print(f"Error: {e}")
