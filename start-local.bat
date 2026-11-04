@echo off
setlocal
cd /d "%~dp0"

title MEMENTO local
echo ============================================
echo   MEMENTO  local  (web + Ollama proxy)
echo ============================================
echo.

set "PY="
if exist "C:\Users\22390\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe" set "PY=C:\Users\22390\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
if not defined PY (
  where python >nul 2>nul
  if not errorlevel 1 set "PY=python"
)
if not defined PY (
  where py >nul 2>nul
  if not errorlevel 1 set "PY=py"
)
if not defined PY (
  echo [!] Python not found.
  echo     Install Python 3 from python.org, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Python : %PY%
echo Web    : a free port 8901-8919 (shown below); the browser opens by itself
echo Ollama : needs "ollama serve" running in another window
echo.
echo Keep this window open. Press Ctrl+C to stop.
echo.

"%PY%" serve.py

echo.
echo Server stopped.
pause
