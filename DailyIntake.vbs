Option Explicit

Dim shell, fileSystem, projectDir, runtimeRoot, pythonPath, nodePath, frontendCli
Dim edgePath, edgeX86, edge64, attempt, ready
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
projectDir = fileSystem.GetParentFolderName(WScript.ScriptFullName)
runtimeRoot = shell.ExpandEnvironmentStrings("%USERPROFILE%") & "\.cache\codex-runtimes\codex-primary-runtime\dependencies"
pythonPath = runtimeRoot & "\python\python.exe"
nodePath = runtimeRoot & "\node\bin\node.exe"
frontendCli = fileSystem.BuildPath(projectDir, "node_modules\vinext\dist\cli.js")

If Not fileSystem.FileExists(pythonPath) Then
    MsgBox "The local data runtime is missing. Open this project in Codex and ask Codex to repair the desktop launcher.", vbCritical, "Daily Intake could not start"
    WScript.Quit 1
End If

If Not fileSystem.FileExists(nodePath) Or Not fileSystem.FileExists(frontendCli) Then
    MsgBox "The interface runtime is missing. Open this project in Codex and ask Codex to rebuild the application.", vbCritical, "Daily Intake could not start"
    WScript.Quit 1
End If

shell.CurrentDirectory = projectDir

If Not IsReady("http://127.0.0.1:3031/health", """ok"": true") Then
    shell.Run Quote(pythonPath) & " local_api.py", 0, False
End If

If Not IsReady("http://localhost:3000/", "") Then
    shell.Run Quote(nodePath) & " " & Quote(frontendCli) & " start --port 3000 --hostname 127.0.0.1", 0, False
End If

ready = False
For attempt = 1 To 40
    If IsReady("http://127.0.0.1:3031/health", """ok"": true") And IsReady("http://localhost:3000/", "") Then
        ready = True
        Exit For
    End If
    WScript.Sleep 500
Next

If Not ready Then
    MsgBox "The local services did not become ready within 20 seconds. Try again, or ask Codex to inspect the launcher.", vbCritical, "Daily Intake could not start"
    WScript.Quit 1
End If

edgeX86 = shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%") & "\Microsoft\Edge\Application\msedge.exe"
edge64 = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\Microsoft\Edge\Application\msedge.exe"
If fileSystem.FileExists(edgeX86) Then
    edgePath = edgeX86
ElseIf fileSystem.FileExists(edge64) Then
    edgePath = edge64
Else
    MsgBox "Microsoft Edge, which provides the desktop window, was not found on this computer.", vbCritical, "Daily Intake could not start"
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
