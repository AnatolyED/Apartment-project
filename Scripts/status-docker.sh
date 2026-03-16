#!/usr/bin/env sh
set -eu

show_endpoint() {
  name="$1"
  url="$2"
  if command -v curl >/dev/null 2>&1; then
    if response="$(curl -fsS "$url" 2>/dev/null)"; then
      printf '[OK] %s: %s\n' "$name" "$response"
    else
      printf '[FAIL] %s: endpoint недоступен\n' "$name"
    fi
  else
    printf '[SKIP] %s: curl не установлен\n' "$name"
  fi
}

cd "$(dirname "$0")/.."

echo ""
echo "Контейнеры"
docker compose ps

echo ""
echo "Проверки бота"
show_endpoint "live" "http://localhost:8080/health/live"
show_endpoint "ready" "http://localhost:8080/health/ready"
show_endpoint "summary" "http://localhost:8080/diagnostics/summary"

echo ""
echo "Проверка панели"
show_endpoint "web-panel" "http://localhost:3000/api/health"
