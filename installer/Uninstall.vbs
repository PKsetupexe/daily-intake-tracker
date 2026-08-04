Option Explicit

Dim shell, fileSystem, installDir, desktopShortcut, startMenuShortcut, answer
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
installDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)

answer = MsgBox("Remove the Daily Intake application? Your personal database and API settings will be kept on this computer.", vbYesNo + vbQuestion, "Uninstall Daily Intake")
If answer <> vbYes Then WScript.Quit 0

desktopShortcut = fileSystem.BuildPath(shell.SpecialFolders("Desktop"), "Daily Intake.lnk")
startMenuShortcut = fileSystem.BuildPath(shell.SpecialFolders("Programs"), "Daily Intake.lnk")
If fileSystem.FileExists(desktopShortcut) Then fileSystem.DeleteFile desktopShortcut, True
If fileSystem.FileExists(startMenuShortcut) Then fileSystem.DeleteFile startMenuShortcut, True
On Error Resume Next
shell.RegDelete "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\"
On Error GoTo 0

shell.Run "cmd.exe /d /c ping 127.0.0.1 -n 3 >nul & rmdir /s /q " & Chr(34) & installDir & Chr(34), 0, False
MsgBox "Daily Intake was removed. Your personal data remains in Local AppData\DailyIntake\data.", vbInformation, "Uninstall Daily Intake"
