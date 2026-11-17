@echo off
rem Abre el programa de plantillas: arranca el servidor local y abre la pantalla en el navegador.
cd /d "%~dp0"
start "" "http://localhost:8765/"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
