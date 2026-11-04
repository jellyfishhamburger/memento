@echo off
cd /d "%~dp0"
set "VENV=C:\Users\22390\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
set "CMD=python"
if exist "%VENV%" set "CMD=%VENV%"
start "" http://127.0.0.1:8931/index.html
echo MEMENTO - http://127.0.0.1:8931/index.html
echo Close this window to stop the server.
%CMD% -m http.server 8931 --bind 127.0.0.1
