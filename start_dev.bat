@echo off
TITLE API Proxy Manager - Launcher
SETLOCAL

echo.
echo  ========================================
echo    API PROXY MANAGER (APM) - DEV MODE
echo  ========================================
echo.

echo [1/2] Lancement du BACKEND (Port 8001)...
start "APM-BACKEND" cmd /k "cd backend && npm run dev"

echo [2/2] Lancement du FRONTEND (Port 8000)...
start "APM-FRONTEND" cmd /k "cd frontend && npm run dev"

echo.
echo  ----------------------------------------
echo   SERVICE STATUS:
echo   - Backend:  http://localhost:8001
echo   - Frontend: http://localhost:8000
echo   - Swagger:  http://localhost:8001/api-docs
echo  ----------------------------------------
echo.
echo Appuyez sur une touche pour quitter ce lanceur (les consoles resteront ouvertes).
pause > nul
