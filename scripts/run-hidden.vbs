' Runs the dashboard server with no visible console window.
' Used by the scheduled task created by install-windows-autostart.ps1 —
' you shouldn't need to run this file directly.
Dim objFSO, objShell, scriptDir, projectRoot
Set objFSO = CreateObject("Scripting.FileSystemObject")
Set objShell = CreateObject("WScript.Shell")
scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
projectRoot = objFSO.GetParentFolderName(scriptDir)
objShell.CurrentDirectory = projectRoot
objShell.Run "node.exe server.js", 0, False
