import os
from dotenv import load_dotenv
load_dotenv(override=True)
print("GEMINI_API_KEY present:", bool(os.getenv("GEMINI_API_KEY")))
print("GEMINI_MODEL:", os.getenv("GEMINI_MODEL"))
