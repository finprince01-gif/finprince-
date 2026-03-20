@echo off
setlocal enabledelayedexpansion

echo ===========================================
echo FINPIXE AI ACCOUNTING - SETUP SCRIPT
echo ===========================================

cd /d "%~dp0"

:: Check for .env files
if not exist "backend\.env" (
    echo [INFO] Creating backend\.env from template...
    copy "backend\.env.example" "backend\.env"
    echo [IMPORTANT] PLEASE UPDATE backend\.env WITH YOUR REALS KEYS!
)

if not exist "frontend\.env" (
    echo [INFO] Creating frontend\.env from template...
    copy "frontend\.env.example" "frontend\.env"
)

:: Backend setup
echo.
echo [1/4] Setting up Python backend...
cd backend
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

call venv\Scripts\activate
echo Installing dependencies...
pip install -r requirements.txt

echo Applying database migrations...
python manage.py makemigrations
python manage.py migrate

cd ..

:: Frontend setup
echo.
echo [2/4] Setting up frontend...
cd frontend
echo Installing dependencies...
npm install

cd ..

:: Final instructions
echo.
echo ===========================================
echo SETUP COMPLETE!
echo ===========================================
echo.
echo To start the system, run: restart_servers.bat
echo.
pause
