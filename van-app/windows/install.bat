@echo off
rem Rowan HVAC van terminal - Windows installer (works on Windows XP and newer).
rem Run it again later to update; the van's saved data is kept.
setlocal
set DEST=C:\RowanVan

set PYW=
for %%P in (C:\Python34 C:\Python35 C:\Python36 C:\Python37 C:\Python38 C:\Python39 C:\Python310 C:\Python311 C:\Python312 C:\Python313 "%ProgramFiles%\Python34") do (
  if not defined PYW if exist "%%~P\pythonw.exe" set PYW=%%~P\pythonw.exe
)
if not defined PYW for /d %%P in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
  if exist "%%~P\pythonw.exe" set PYW=%%~P\pythonw.exe
)
if not defined PYW (
  echo.
  echo Python was not found. Install Python 3.4.4 first ^(the last version that
  echo supports Windows XP^): python-3.4.4.msi from python.org/downloads/release/python-344/
  echo Keep the default folder C:\Python34 and the "Tcl/Tk" feature turned on.
  echo.
  pause
  exit /b 1
)
echo Using %PYW%

echo Copying the app to %DEST% ...
xcopy "%~dp0..\rowanvan" "%DEST%\rowanvan\" /E /I /Y /Q >nul
xcopy "%~dp0..\certs" "%DEST%\certs\" /E /I /Y /Q >nul
xcopy "%~dp0..\vendor" "%DEST%\vendor\" /E /I /Y /Q >nul
copy /Y "%~dp0..\RowanVan.pyw" "%DEST%\RowanVan.pyw" >nul
copy /Y "%~dp0RowanVan-debug.bat" "%DEST%\RowanVan-debug.bat" >nul

rem Shortcuts (VBScript works on every Windows version back to XP)
set VBS=%TEMP%\rowanvan_shortcut.vbs
> "%VBS%" echo Set sh = CreateObject("WScript.Shell")
>>"%VBS%" echo For Each folder In Array(sh.SpecialFolders("AllUsersDesktop"), sh.SpecialFolders("AllUsersStartup"))
>>"%VBS%" echo   Set lnk = sh.CreateShortcut(folder ^& "\Rowan Van.lnk")
>>"%VBS%" echo   lnk.TargetPath = "%PYW%"
>>"%VBS%" echo   lnk.Arguments = """%DEST%\RowanVan.pyw"""
>>"%VBS%" echo   lnk.WorkingDirectory = "%DEST%"
>>"%VBS%" echo   lnk.Description = "Rowan HVAC van terminal"
>>"%VBS%" echo   lnk.Save
>>"%VBS%" echo Next
cscript //nologo "%VBS%"
del "%VBS%"

echo.
echo Done. "Rowan Van" is on the desktop and starts automatically when Windows starts.
echo (To stop it auto-starting, delete "Rowan Van" from Start ^> Programs ^> Startup.)
pause
