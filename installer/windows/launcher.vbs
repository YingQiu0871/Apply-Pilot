' Apply-Pilot launcher for the Windows installer. Starts the control panel
' with the bundled Node.js and no console window. The data folder comes from
' APPLY_PILOT_HOME or the folder chosen in the panel; on first run the panel
' asks for one.
Option Explicit
Dim sh, fso, appDir, home

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)

Function Q(s)
  Q = """" & s & """"
End Function

' A user variable set after Explorer started is not in this process yet.
home = sh.Environment("User")("APPLY_PILOT_HOME")
If home <> "" Then sh.Environment("Process")("APPLY_PILOT_HOME") = sh.ExpandEnvironmentStrings(home)

sh.CurrentDirectory = sh.ExpandEnvironmentStrings("%USERPROFILE%")
sh.Run Q(appDir & "\node.exe") & " " & Q(appDir & "\app\bin\apply-pilot.mjs") & " ui --open", 0, False
