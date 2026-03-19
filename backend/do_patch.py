with open(r'd:\vendor0.12\AI-accounting-0.03\backend\vendors\vendorpo_api.py', 'r') as f:
    cont = f.read()

new_cont = cont.replace("traceback.print_exc()", "traceback.print_exc()\n            with open('err.txt', 'w') as f2: f2.write(str(e) + '\\n' + traceback.format_exc())")

if "with open('err.txt'" not in cont:
    with open(r'd:\vendor0.12\AI-accounting-0.03\backend\vendors\vendorpo_api.py', 'w') as f:
        f.write(new_cont)
    print("Patched.")
