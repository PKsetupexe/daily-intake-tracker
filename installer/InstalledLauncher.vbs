Option Explicit

Dim shell, fileSystem, installDir, dataDir, pythonPath, nodePath, serverPath, apiPath
Dim edgePath, edgeX86, edge64, attempt, ready, processEnvironment
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
installDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
dataDir = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DailyIntake\data"
pythonPath = fileSystem.BuildPath(installDir, "runtime\python\pythonw.exe")
nodePath = fileSystem.BuildPath(installDir, "runtime\node.exe")
serverPath = fileSystem.BuildPath(installDir, "app\server.js")
apiPath = fileSystem.BuildPath(installDir, "backend\local_api.py")

If Not fileSystem.FolderExists(dataDir) Then
    fileSystem.CreateFolder shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\DailyIntake"
    fileSystem.CreateFolder dataDir
End If

If Not fileSystem.FileExists(pythonPath) Or Not fileSystem.FileExists(nodePath) Then
    MsgBox "The application runtime is incomplete. Please reinstall Daily Intake.", vbCritical, "Daily Intake could not start"
    WScript.Quit 1
End If

Set processEnvironment = shell.Environment("PROCESS")
processEnvironment("DAILY_INTAKE_DATA_DIR") = dataDir
processEnvironment("PORT") = "3000"
processEnvironment("HOST") = "127.0.0.1"
shell.CurrentDirectory = installDir

If Not IsReady("http://127.0.0.1:3031/health", """ok"": true") Then
    shell.Run Quote(pythonPath) & " " & Quote(apiPath), 0, False
End If

If Not IsReady("http://localhost:3000/", "") Then
    shell.Run Quote(nodePath) & " " & Quote(serverPath), 0, False
End If

ready = False
For attempt = 1 To 50
    If IsReady("http://127.0.0.1:3031/health", """ok"": true") And IsReady("http://localhost:3000/", "") Then
        ready = True
        Exit For
    End If
    WScript.Sleep 500
Next

If Not ready Then
    MsgBox "The local services did not become ready. Close Daily Intake, then try opening it again.", vbCritical, "Daily Intake could not start"
    WScript.Quit 1
End If

edgeX86 = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
edge64 = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
If fileSystem.FileExists(edgeX86) Then
    edgePath = edgeX86
ElseIf fileSystem.FileExists(edge64) Then
    edgePath = edge64
Else
    MsgBox "Microsoft Edge, which provides the desktop window, was not found.", vbCritical, "Daily Intake could not start"
    WScript.Quit 1
End If

shell.Run Quote(edgePath) & " --app=http://localhost:3000/ --start-maximized --no-first-run --disable-features=msEdgeSidebarV2", 1, False

Function Quote(value)
    Quote = Chr(34) & value & Chr(34)
End Function

Function IsReady(url, expectedText)
    Dim request
    On Error Resume Next
    Set request = CreateObject("WinHttp.WinHttpRequest.5.1")
    request.SetTimeouts 1000, 1000, 1000, 2000
    request.Open "GET", url, False
    request.Send
    IsReady = (Err.Number = 0 And request.Status = 200 And InStr(1, request.ResponseText, expectedText, vbTextCompare) > 0)
    Err.Clear
    On Error GoTo 0
End Function
