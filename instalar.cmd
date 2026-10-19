@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 LTS em https://nodejs.org/ e abra este arquivo novamente.
  pause
  exit /b 1
)
node scripts\check-node.mjs
if errorlevel 1 goto :erro
call npm ci
if errorlevel 1 goto :erro
call npm run setup
if errorlevel 1 goto :erro
call npm run build
if errorlevel 1 goto :erro
echo.
echo Instalacao concluida. Abra iniciar.cmd para usar o sistema.
pause
exit /b 0
:erro
echo.
echo A instalacao nao terminou. Confira a mensagem acima.
pause
exit /b 1
