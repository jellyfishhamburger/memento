@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   MEMENTO 本地版（网页 + Ollama 代理）
echo ============================================
echo.

rem 找一个能用的 Python：先 PATH，再 Hermes 自带的
set PY=
where python >nul 2>nul && set PY=python
if "%PY%"=="" if exist "C:\Users\22390\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe" set PY="C:\Users\22390\AppData\Local\hermes\hermes-agent\venv\Scripts\python.exe"
if "%PY%"=="" where py >nul 2>nul && set PY=py
if "%PY%"=="" (
  echo 没找到 Python。请先安装 Python 3，或在命令行里手动运行：
  echo    python serve.py
  pause
  exit /b 1
)

echo 提示：文字灵感需要 Ollama 在跑。如果还没开，另开一个窗口执行：
echo    ollama serve
echo.

start "" "http://127.0.0.1:8899/"
%PY% serve.py
pause
