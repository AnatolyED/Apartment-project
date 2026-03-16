Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Show-Section {
    param([string]$Title)

    Write-Host ""
    Write-Host $Title -ForegroundColor Cyan
}

function Show-Endpoint {
    param(
        [string]$Name,
        [string]$Url
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -TimeoutSec 5
        Write-Host ("[OK] {0}: {1}" -f $Name, $response.Content) -ForegroundColor Green
    }
    catch {
        Write-Host ("[FAIL] {0}: {1}" -f $Name, $_.Exception.Message) -ForegroundColor Yellow
    }
}

Show-Section "Контейнеры"
docker compose ps

Show-Section "Проверки бота"
Show-Endpoint -Name "live" -Url "http://localhost:8080/health/live"
Show-Endpoint -Name "ready" -Url "http://localhost:8080/health/ready"
Show-Endpoint -Name "summary" -Url "http://localhost:8080/diagnostics/summary"

Show-Section "Проверка панели"
Show-Endpoint -Name "web-panel" -Url "http://localhost:3000/api/health"
