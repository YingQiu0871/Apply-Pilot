@echo off
rem apply-pilot command for the Windows installer: runs the CLI with the bundled Node.js.
rem The data folder is APPLY_PILOT_HOME, else the one saved with "apply-pilot home PATH" or in the panel.
"%~dp0node.exe" "%~dp0app\bin\apply-pilot.mjs" %*
