$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$pythonPath = Join-Path $runtimeRoot "python\python.exe"
$nodePath = Join-Path $runtimeRoot "node\bin\node.exe"
$frontendCli = Join-Path $projectDir "node_modules\vinext\dist\cli.js"
$logDir = Join-Path $projectDir "data\logs"

function Test-LocalEndpoint([string]$url, [string]$expectedText = "") {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -ne 200) { return $false }
        if ($expectedText -and -not $response.Content.Contains($expectedText)) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Show-LaunchError([string]$message) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        $message,
        "每日摄入无法启动",
        [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Error
    ) | Out-Null
}

if (-not (Test-Path -LiteralPath $pythonPath)) {
    Show-LaunchError "缺少本地数据服务运行环境。请在 Codex 中打开项目并让 Codex 修复启动环境。"
    exit 1
}
if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $frontendCli)) {
    Show-LaunchError "缺少应用界面运行环境。请在 Codex 中打开项目并让 Codex重新构建应用。"
    exit 1
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (-not (Test-LocalEndpoint "http://127.0.0.1:3031/health" '"ok": true')) {
    Start-Process -FilePath $pythonPath `
        -ArgumentList "local_api.py" `
        -WorkingDirectory $projectDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "database.log") `
        -RedirectStandardError (Join-Path $logDir "database-error.log")
}

if (-not (Test-LocalEndpoint "http://localhost:3000/" "每日摄入")) {
    Start-Process -FilePath $nodePath `
        -ArgumentList @($frontendCli, "start", "--port", "3000", "--hostname", "127.0.0.1") `
        -WorkingDirectory $projectDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "interface.log") `
        -RedirectStandardError (Join-Path $logDir "interface-error.log")
}

$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if (
        (Test-LocalEndpoint "http://127.0.0.1:3031/health" '"ok": true') -and
        (Test-LocalEndpoint "http://localhost:3000/" "每日摄入")
    ) {
        $ready = $true
        break
    }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Show-LaunchError "本地服务未能在 20 秒内准备完成。请稍后重试；如果仍然失败，可以在 Codex 中让我检查 data\logs 里的启动记录。"
    exit 1
}

$edgeCandidates = @(
    (Join-Path ([Environment]::GetFolderPath("ProgramFilesX86")) "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ([Environment]::GetFolderPath("ProgramFiles")) "Microsoft\Edge\Application\msedge.exe")
)
$edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edgePath) {
    Show-LaunchError "这台电脑上没有找到桌面窗口运行组件 Microsoft Edge。"
    exit 1
}

Start-Process -FilePath $edgePath -ArgumentList @(
    "--app=http://localhost:3000/",
    "--start-maximized",
    "--no-first-run",
    "--disable-features=msEdgeSidebarV2"
)
