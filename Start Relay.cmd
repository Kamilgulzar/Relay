@echo off
cd /d "%~dp0"
echo Relay will be available at http://127.0.0.1:5173
echo Open that address after the server says it is ready.
echo Keep this window open while using Relay. Press Ctrl+C to stop.
call npm run build
if errorlevel 1 (
  echo Relay could not build. See the error above.
  pause
  exit /b 1
)
call npm start -- --port 5173
pause
