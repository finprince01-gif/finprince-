@echo off
setlocal enabledelayedexpansion

:: ===========================================
:: RESTART SERVERS (Django + Vite)
:: ===========================================

cd /d "%~dp0"

echo ===========================================
echo KILLING EXISTING PROCESSES...
echo ===========================================
taskkill /F /IM node.exe /T 2>nul
taskkill /F /IM python.exe /T 2>nul
timeout /t 2 /nobreak >nul

echo ===========================================
echo STARTING FINPIXE AI ACCOUNTING SERVERS...
echo ===========================================

:: 1. Start Backend (Django)
echo.
echo [1/2] Starting Backend (Django)...
cd /d backend
if not exist "venv" (
    echo [ERROR] VirtualEnv not found! Please run setup.bat first.
    pause
    exit /b
)
call venv\Scripts\activate
start "Django Backend" python manage.py runserver 8000
cd /d ..

:: 2. Start Frontend (Vite)
echo.
echo [2/2] Starting Frontend (Vite)...
cd /d frontend
if not exist "node_modules" (
    echo [ERROR] node_modules not found! Please run setup.bat first.
    pause
    exit /b
)
start "Vite Frontend" npm run dev -- --port 5173
cd /d ..

echo.
echo ===========================================
echo ALL SERVERS STARTING...
echo ===========================================
echo.
echo Frontend: http://localhost:5173
echo Backend:  http://localhost:8000
echo.
echo ===========================================
pause
