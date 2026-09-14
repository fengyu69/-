@echo off
chcp 65001 >nul
cd /d "%~dp0"
set HOST=0.0.0.0
set PORT=8787
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22.13 或更新版本，然后重新运行。
  pause
  exit /b 1
)
echo 服务已启动。电脑本机访问 http://127.0.0.1:8787
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address" /c:"IPv4 地址"') do echo 手机可尝试访问 http://%%a:8787
node --env-file-if-exists=.env server.mjs
pause
