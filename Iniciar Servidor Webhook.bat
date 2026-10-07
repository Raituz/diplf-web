@echo off
title DIP LF - Servidor Webhook Pago Movil SMS (Túnel 4G + Local)
color 0A
cls
echo ========================================================
echo   DIP LF - SERVIDOR DE VERIFICACION DE PAGO MOVIL
echo ========================================================
echo.
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
        pause
    )
)

pause
