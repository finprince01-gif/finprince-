import httpx
import asyncio
import time
import os

URL = "http://localhost:8000/api/ocr/upload/"

async def test_saturation():
    # Set MOCK_EXTRACTION_MODE to false in environment or via direct call
    # For this test, we assume workers are restarted with MOCK_EXTRACTION_MODE=false
    
    async with httpx.AsyncClient(timeout=None) as client:
        # Login
        resp = await client.post("http://localhost:8000/api/users/login/", json={"email": "stress_branch@finpixe.com", "username": "stress_test_0@finpixe.com", "password": "Password123"})
        token = resp.json()["access"]
        headers = {"Authorization": f"Bearer {token}"}
        
        print("=== STEP 5: REAL AI SATURATION TEST ===")
        # Upload 20 invoices simultaneously (Real AI)
        tasks = []
        for i in range(20):
            # Create a 1-page PDF
            with open(f"real_ai_{i}.pdf", "wb") as f:
                f.write(b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")
            
            with open(f"real_ai_{i}.pdf", "rb") as f:
                files = {"file": (f"real_ai_{i}.pdf", f, "application/pdf")}
                tasks.append(client.post(URL, files=files, headers=headers))

        responses = await asyncio.gather(*tasks)
        for i, r in enumerate(responses):
            print(f"Upload {i}: {r.status_code}")
            if r.status_code == 202:
                print(f"  Job ID: {r.json().get('job_id')}")

        # Clean up
        for i in range(20):
            os.remove(f"real_ai_{i}.pdf")

if __name__ == "__main__":
    asyncio.run(test_saturation())
