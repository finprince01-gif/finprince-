import httpx
import asyncio
import os

URL = "http://localhost:8000/api/ocr/upload/"

async def inject_poison():
    async with httpx.AsyncClient() as client:
        # Login
        resp = await client.post("http://localhost:8000/api/users/login/", json={"email": "stress_branch@finpixe.com", "username": "stress_test_0@finpixe.com", "password": "Password123"})
        token = resp.json()["access"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 1. Corrupt PDF (Wrong Header)
        with open("poison_corrupt.pdf", "wb") as f:
            f.write(b"NOT_A_PDF_STORM_PROTECTION_TEST")
        
        with open("poison_corrupt.pdf", "rb") as f:
            files = {"file": ("poison_corrupt.pdf", f, "application/pdf")}
            resp = await client.post(URL, files=files, headers=headers)
            print(f"[POISON_INJECTED] Corrupt PDF: {resp.status_code}")

        # 2. Huge PDF (1000 pages simulated metadata)
        # (This will test if our fanout/assembly handles 'unexpected_pages' well)
        
    os.remove("poison_corrupt.pdf")

if __name__ == "__main__":
    asyncio.run(inject_poison())
