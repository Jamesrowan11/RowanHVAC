@echo off
rem Starts Rowan Van with a console window so any error message stays visible.
rem Use this if the desktop icon does nothing.
setlocal
set PY=
for %%P in (C:\Python34 C:\Python35 C:\Python36 C:\Python37 C:\Python38 C:\Python39 C:\Python310 C:\Python311 C:\Python312 C:\Python313) do (
  if not defined PY if exist "%%~P\python.exe" set PY=%%~P\python.exe
)
if not defined PY for /d %%P in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
  if exist "%%~P\python.exe" set PY=%%~P\python.exe
)
if not defined PY (
  echo Python 3 was not found. Install Python 3.4.4 ^(Windows XP^) or newer first.
  pause
  exit /b 1
)
set APP=C:\RowanVan\RowanVan.pyw
if not exist "%APP%" set APP=%~dp0..\RowanVan.pyw
echo Using %PY%
"%PY%" --version
echo Starting %APP% ...
"%PY%" "%APP%"
echo.
echo Rowan Van exited. If there is an error above, take a photo or copy it for the office.
pause
