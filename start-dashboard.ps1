param([switch]$OpenBrowser, [switch]$Refresh)
$ErrorActionPreference = 'Stop'
$dashboardRoot = $PSScriptRoot
$dashboardNode = (Get-Command node.exe -ErrorAction Stop).Source
$dashboardLogs = Join-Path $dashboardRoot 'logs'
New-Item -ItemType Directory -Path $dashboardLogs -Force | Out-Null
$dashboardUp = $false
try {
    $dashboardCheck = Invoke-RestMethod -Uri 'http://127.0.0.1:8765/api/data' -TimeoutSec 3
    $dashboardUp = ($dashboardCheck.catalog.id -contains 'jkm_futures') -and ($null -ne $dashboardCheck.db.series)
} catch {}
if (-not $dashboardUp) {
    Start-Process -FilePath $dashboardNode -ArgumentList @('server.mjs') -WorkingDirectory $dashboardRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dashboardLogs 'server.log') -RedirectStandardError (Join-Path $dashboardLogs 'server-error.log')
}
if ($Refresh) {
    & $dashboardNode (Join-Path $dashboardRoot 'collector.mjs') | Out-File -LiteralPath (Join-Path $dashboardLogs 'last-refresh.log') -Encoding utf8
    & $dashboardNode (Join-Path $dashboardRoot 'refresh-analysis.mjs') 2>&1 | Out-File -LiteralPath (Join-Path $dashboardLogs 'last-analysis-refresh.log') -Encoding utf8
}
if ($OpenBrowser) { Start-Process 'http://127.0.0.1:8765' }
# 로컬 전용 원천(BigFinance·Investing)을 GitHub에 반영: 원격이 설정된 경우에만 실행
if ($Refresh -and (Test-Path (Join-Path $dashboardRoot '.git'))) {
    Push-Location $dashboardRoot
    try {
        $remote = git remote get-url origin 2>$null
        if ($remote) {
            git add data 2>$null
            git diff --cached --quiet; if (-not $?) { git commit -q -m ("data: local sources " + (Get-Date -Format 'yyyy-MM-dd HH:mm')) }
            git pull -q --rebase origin main; git push -q origin main
        }
    } catch { Write-Warning "GitHub 반영 실패: $_" } finally { Pop-Location }
}
