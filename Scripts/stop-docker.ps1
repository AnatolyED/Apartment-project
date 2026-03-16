Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

docker compose down
