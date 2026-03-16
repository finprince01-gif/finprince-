import traceback, urllib.request, json
data = json.dumps({'email': 'test@gmail.com', 'username': 'tester', 'password': 'test1234'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/api/auth/login/', data=data, headers={'Content-Type': 'application/json'})
try:
    resp = urllib.request.urlopen(req)
    # Get access token from JSON response
    resp_data = json.loads(resp.read().decode())
    token = resp_data.get('access')
    print('Login successful, token retrieved')
    
    # Now POST to master-voucher-grn
    post_data = json.dumps({
        "name": "testing",
        "grn_type": "Purchase",
        "prefix": "test",
        "suffix": "asd",
        "required_digits": 9,
        "preview": "test000000001asd"
    }).encode('utf-8')
    
    req2 = urllib.request.Request(
        'http://127.0.0.1:8000/api/inventory/master-voucher-grn/', 
        data=post_data, 
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}
    )
    resp2 = urllib.request.urlopen(req2)
    print('POST 200:', resp2.read().decode())
    
except urllib.error.HTTPError as e:
    print('HTTPError:', e.code)
    html_content = e.read().decode()
    with open("error.html", "w", encoding="utf-8") as f:
        f.write(html_content)
    print("Error saved to error.html")
except Exception as e:
    traceback.print_exc()
