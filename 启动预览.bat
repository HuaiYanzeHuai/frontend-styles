@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] 未检测到 Node.js，无法启动自动扫描预览服务。
  echo.
  echo 你仍然可以直接双击“预览.html”查看内置清单。
  echo 或者安装 Node.js 后重新运行本文件。
  echo.
  pause
  exit /b 1
)

node server.js --open
if errorlevel 1 pause
endlocal
