@echo off
:: ============================================
:: SCRIPT DE INICIO - SISTEMA DE COSTOS
:: Instituto Dr. Mercado
:: ============================================

echo.
echo ============================================
echo    SISTEMA DE COSTOS - INICIANDO...
echo    Instituto Dr. Mercado
echo ============================================
echo.

:: Verificar si Node.js está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ❌ ERROR: Node.js no está instalado.
    echo    Por favor instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)

echo ✓ Node.js detectado
echo.

:: ============================================
:: PASO 1: Instalar dependencias del backend
:: ============================================
echo [1/4] Instalando dependencias del backend...
cd server
if not exist "node_modules" (
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ ERROR instalando dependencias del backend
        pause
        exit /b 1
    )
)
cd ..
echo ✓ Backend listo
echo.

:: ============================================
:: PASO 2: Instalar dependencias del frontend
:: ============================================
echo [2/4] Verificando dependencias del frontend...
if not exist "node_modules" (
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ❌ ERROR instalando dependencias del frontend
        pause
        exit /b 1
    )
)
echo ✓ Frontend listo
echo.

:: ============================================
:: PASO 3: Iniciar backend (nueva ventana)
:: ============================================
echo [3/4] Iniciando servidor backend (puerto 3001)...
start "API Backend - Sistema Costos" cmd /k "cd server && npm start"
echo ✓ Backend iniciando...
echo.

:: Esperar 3 segundos para que el backend arranque
timeout /t 3 /nobreak >nul

:: ============================================
:: PASO 4: Iniciar frontend
:: ============================================
echo [4/4] Iniciando aplicación frontend (puerto 3000)...
echo.
echo ============================================
echo   🚀 SISTEMA INICIADO
echo   
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:3001
echo   Health:   http://localhost:3001/api/health
echo   
echo   Servidor SQL: 192.168.1.73 (GECLISA)
echo ============================================
echo.

call npm run dev
