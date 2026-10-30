@echo off
rem apply-pilot command for the Windows installer: Apply-Pilot.exe runs the CLI as plain Node.js.
rem The data folder is APPLY_PILOT_HOME, else the one saved with "apply-pilot home PATH" or in the panel.
set "ELECTRON_RUN_AS_NODE=1"
"%~dp0Apply-Pilot.exe" "%~dp0resources\app.asar\bin\apply-pilot.mjs" %*
