@echo off
cd /d "%~dp0"
set "PYTHON_EXE=python"
where python >nul 2>nul
if errorlevel 1 set "PYTHON_EXE=C:\Users\UMAR MASANAWA\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
"%PYTHON_EXE%" server.py
pause
