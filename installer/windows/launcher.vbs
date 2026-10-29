' Apply-Pilot launcher for the Windows installer. Starts the control panel
' with the bundled Node.js and no console window. On first run it creates the
' data folder (APPLY_PILOT_HOME, default Documents\Apply-Pilot).
Option Explicit
Dim sh, fso, appDir, node, cli, home

Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
node = appDir & "\node.exe"
cli = appDir & "\app\bin\apply-pilot.mjs"

Function Q(s)
  Q = """" & s & """"
End Function

' Read the user variable from the registry, so a value the installer has just
' set is found even though Explorer's environment is older.
home = sh.ExpandEnvironmentStrings(sh.Environment("User")("APPLY_PILOT_HOME"))
If home = "" Then home = sh.ExpandEnvironmentStrings(sh.Environment("Process")("APPLY_PILOT_HOME"))
If home = "" Then home = sh.SpecialFolders("MyDocuments") & "\Apply-Pilot"
sh.Environment("Process")("APPLY_PILOT_HOME") = home

If Not fso.FileExists(home & "\profile.json") Then
  sh.Run Q(node) & " " & Q(cli) & " init", 0, True
End If
sh.Run Q(node) & " " & Q(cli) & " ui --open", 0, False
