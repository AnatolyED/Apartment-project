Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path ".env")) {
    Copy-Item ".env.docker.example" ".env"
    Write-Host "Файл .env не найден. Создан шаблон из .env.docker.example." -ForegroundColor Yellow
    Write-Host "Заполните TELEGRAM_BOT_TOKEN, ADMIN_PASSWORD и SESSION_SECRET в .env, затем запустите скрипт ещё раз." -ForegroundColor Yellow
    exit 0
}

docker compose up -d --build

Write-Host ""
Write-Host "Docker-стек запущен." -ForegroundColor Green
Write-Host "Панель: http://localhost:3000" -ForegroundColor Green
Write-Host "Статус: .\\Scripts\\status-docker.ps1" -ForegroundColor Green
Write-Host "Логи: .\\Scripts\\logs-docker.ps1" -ForegroundColor Green
