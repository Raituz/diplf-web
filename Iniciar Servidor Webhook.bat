@echo off
title DIP LF - Servidor Webhook Pago Movil SMS (Tunel 4G + Local)
color 0A
cls
echo ========================================================
echo   DIP LF - SERVIDOR DE VERIFICACION DE PAGO MOVIL
echo ========================================================
echo.
echo Comprobando y liberando puerto 3000...

:: Cerrar procesos previos si habian quedado colgados en el puerto 3000
for /f "tokens=5" %%p in ('netstat -aon 2^>nul ^| findstr ":3000 "') do (
    if not "%%p"=="" if not "%%p"=="0" (
        taskkill /f /pid %%p >nul 2>nul
    )
)

echo Iniciando servidor y generando enlace publico para 4G...
echo.

set AGY_NODE="C:\Users\charq\AppData\Roaming\Antigravity\bin\agy-node.cmd"

if exist %AGY_NODE% (
    %AGY_NODE% "%~dp0webhook-server\start-with-tunnel.js"
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        node "%~dp0webhook-server\start-with-tunnel.js"
    ) else (
        echo ERROR: No se encontro el ejecutable de Node.js o agy-node.
    )
)

echo.
echo ========================================================
echo   El servidor se ha detenido.
echo ========================================================
pause
