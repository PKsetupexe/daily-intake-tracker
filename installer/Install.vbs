Option Explicit

Dim shell, fileSystem, shellApp, sourceDir, payloadPath, installDir, dataRoot
Dim desktopPath, startMenuPath, shortcut, waitCount, markerPath
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
Set shellApp = CreateObject("Shell.Application")

sourceDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
payloadPath = fileSystem.BuildPath(sourceDir, "payload.zip")
installDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs\DailyIntake"
dataRoot = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DailyIntake\data"

If Not fileSystem.FileExists(payloadPath) Then
    MsgBox "The installer payload is missing.", vbCritical, "Daily Intake Setup"
    WScript.Quit 1
End If

If Not fileSystem.FolderExists(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs") Then
    fileSystem.CreateFolder shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Programs"
End If
If Not fileSystem.FolderExists(installDir) Then fileSystem.CreateFolder installDir
If Not fileSystem.FolderExists(shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DailyIntake") Then
    fileSystem.CreateFolder shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DailyIntake"
End If
If Not fileSystem.FolderExists(dataRoot) Then fileSystem.CreateFolder dataRoot

shellApp.NameSpace(installDir).CopyHere shellApp.NameSpace(payloadPath).Items, 1044
markerPath = fileSystem.BuildPath(installDir, "DailyIntake.vbs")
For waitCount = 1 To 240
    If fileSystem.FileExists(markerPath) And fileSystem.FileExists(fileSystem.BuildPath(installDir, "app\server.js")) Then Exit For
    WScript.Sleep 500
Next

If Not fileSystem.FileExists(markerPath) Then
    MsgBox "Installation did not complete. Please run the installer again.", vbCritical, "Daily Intake Setup"
    WScript.Quit 1
End If

desktopPath = shell.SpecialFolders("Desktop")
startMenuPath = shell.SpecialFolders("Programs")
CreateAppShortcut fileSystem.BuildPath(desktopPath, "Daily Intake.lnk"), installDir
CreateAppShortcut fileSystem.BuildPath(startMenuPath, "Daily Intake.lnk"), installDir

shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\DisplayName", "Daily Intake", "REG_SZ"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\DisplayVersion", "1.0.0", "REG_SZ"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\Publisher", "Local application", "REG_SZ"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\InstallLocation", installDir, "REG_SZ"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\DisplayIcon", fileSystem.BuildPath(installDir, "nan-kcal.ico"), "REG_SZ"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\UninstallString", "wscript.exe " & Chr(34) & fileSystem.BuildPath(installDir, "Uninstall.vbs") & Chr(34), "REG_SZ"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\NoModify", 1, "REG_DWORD"
shell.RegWrite "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\DailyIntake\NoRepair", 1, "REG_DWORD"

MsgBox "Daily Intake has been installed. Personal data and API settings were not included in this installer.", vbInformation, "Daily Intake Setup"
shell.Run "wscript.exe " & Chr(34) & markerPath & Chr(34), 1, False

Sub CreateAppShortcut(shortcutPath, appDir)
    Dim appShortcut
    Set appShortcut = shell.CreateShortcut(shortcutPath)
    appShortcut.TargetPath = shell.ExpandEnvironmentStrings("%WINDIR%") & "\System32\wscript.exe"
    appShortcut.Arguments = Chr(34) & fileSystem.BuildPath(appDir, "DailyIntake.vbs") & Chr(34)
    appShortcut.WorkingDirectory = appDir
    appShortcut.IconLocation = fileSystem.BuildPath(appDir, "nan-kcal.ico") & ",0"
    appShortcut.Description = "Daily food, nutrition, exercise and weight tracker"
    appShortcut.Save
End Sub
