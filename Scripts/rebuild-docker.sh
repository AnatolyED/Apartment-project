#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

if [ ! -f ".env" ]; then
  cp ".env.docker.example" ".env"
  echo "Файл .env не найден. Создан шаблон из .env.docker.example."
  echo "Заполните TELEGRAM_BOT_TOKEN, ADMIN_PASSWORD и SESSION_SECRET в .env, затем запустите скрипт ещё раз."
  exit 0
fi

docker compose down
docker compose up -d --build
echo ""
echo "Docker-стек пересобран и запущен."
echo "Панель: http://localhost:3000"
echo "Статус: ./Scripts/status-docker.sh"
echo "Логи: ./Scripts/logs-docker.sh"
