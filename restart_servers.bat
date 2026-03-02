@echo off
echo ========================================
echo CORS FIX - FORCE BROWSER RELOAD
echo ========================================
echo.
echo The code has been fixed but your browser
echo is using cached JavaScript.
echo.
echo SOLUTION: Kill and restart both servers
echo ========================================
echo.

echo Step 1: Killing all Node and Python processes...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM python.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Step 2: Starting backend server...
cd "c:\108\django v3\backend"
start cmd /k "python manage.py runserver"
timeout /t 3 /nobreak >nul

echo.
echo Step 3: Starting frontend server...
cd "c:\108\django v3\frontend"
start cmd /k "npm run dev"

echo.
echo ========================================
echo DONE! Servers restarted.
echo ========================================
echo.
echo Now:
echo 1. Wait 10 seconds for servers to start
echo 2. Open NEW incognito window (Ctrl+Shift+N)
echo 3. Go to http://localhost:5173
echo 4. Try registration
echo.
echo Press any key to close this window...
pause >nul
