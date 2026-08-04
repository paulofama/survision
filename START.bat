@echo off
setlocal
title Sistema de Gestion Integral - Launcher
:: ============================================================
:: LAUNCHER - Sistema de Gestion Integral (Survision S.A.)
:: Levanta backend (3001) + frontend (3000) y abre el navegador.
:: Doble clic y listo: no hace falta correr "npm run dev" a mano.
:: ============================================================

:: Trabajar siempre desde la carpeta de este .bat (aunque se
:: ejecute desde otro lugar / acceso directo).
cd /d "%~dp0"

echo.
echo ============================================================
echo    SISTEMA DE GESTION INTEGRAL - Iniciando...
echo    Survision S.A. / Instituto Dr. Mercado
echo ============================================================
echo.

:: --- Verificar Node.js ---
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js no esta instalado.
    echo         Instalalo desde https://nodejs.org y volve a intentar.
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js detectado.

:: --- Instalar dependencias solo si faltan ---
if not exist "node_modules" (
    echo [..] Instalando dependencias del frontend ^(primera vez^)...
    call npm install || (echo [ERROR] Fallo npm install frontend & pause & exit /b 1)
)
if not exist "server\node_modules" (
    echo [..] Instalando dependencias del backend ^(primera vez^)...
    pushd server
    call npm install || (echo [ERROR] Fallo npm install backend & popd & pause & exit /b 1)
    popd
)
echo [OK] Dependencias listas.
echo.

:: --- Iniciar backend en su propia ventana ---
echo [1/3] Iniciando backend  (http://localhost:3001)...
start "Backend - Sistema de Gestion Integral" /d "%~dp0server" cmd /k npm start

:: --- Iniciar frontend en su propia ventana ---
echo [2/3] Iniciando frontend (http://localhost:3000)...
start "Frontend - Sistema de Gestion Integral" /d "%~dp0." cmd /k npm run dev

:: --- Esperar a que Vite levante y abrir el navegador ---
echo [3/3] Abriendo el navegador...
timeout /t 6 /nobreak >nul
start "" "http://localhost:3000"

echo.
echo ============================================================
echo   SISTEMA INICIADO
echo.
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:3001
echo   Health:   http://localhost:3001/api/health
echo.
echo   Se abrieron 2 ventanas (backend y frontend).
echo   Para APAGAR el sistema, cerra esas 2 ventanas
echo   (o Ctrl+C en cada una).
echo ============================================================
echo.
echo Esta ventana ya se puede cerrar.
pause >nul
endlocal
