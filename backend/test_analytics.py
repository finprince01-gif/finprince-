import requests
import json

def test_analytics():
    # Login or use token from env if available
    # For now, I'll just check if it returns 401 or 500
    url = "http://localhost:8000/api/dashboard/analytics/"
    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        if response.status_code == 500:
             print("Dashboard Analytics FAILED with 500")
             print(response.text[:500])
        else:
             print("Dashboard Analytics responded (expected 401 if not logged in, but not 500)")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_analytics()
