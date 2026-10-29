@echo off
rem apply-pilot command for the Windows installer: runs the CLI with the bundled Node.js.
setlocal
if not defined APPLY_PILOT_HOME set "APPLY_PILOT_HOME=%USERPROFILE%\Documents\Apply-Pilot"
"%~dp0node.exe" "%~dp0app\bin\apply-pilot.mjs" %*
