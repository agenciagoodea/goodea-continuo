@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js 24 LTS em https://nodejs.org/.
  pause
  exit /b 1
)
node scripts\check-node.mjs
if errorlevel 1 goto :erro
if not exist "node_modules\next\package.json" (
  echo Execute instalar.cmd primeiro.
  pause
  exit /b 1
)
call npm run setup
if errorlevel 1 goto :erro
if not exist ".next\BUILD_ID" (
  call npm run build
  if errorlevel 1 goto :erro
)
echo.
echo Abra http://127.0.0.1:3000 no navegador.
echo Mantenha esta janela aberta enquanto usar o sistema. Ctrl+C encerra.
echo.
call npm start
if errorlevel 1 goto :erro
exit /b 0
:erro
echo.
echo Nao foi possivel iniciar. Confira a mensagem acima.
pause
exit /b 1
