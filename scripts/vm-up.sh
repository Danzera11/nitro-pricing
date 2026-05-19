#!/usr/bin/env sh
set -eu

COMPOSE="docker compose -f docker-compose.vm.yml"

if [ ! -f .env ]; then
  echo "Arquivo .env nao encontrado. Copie .env.vm.example para .env e ajuste as senhas/hosts."
  exit 1
fi

$COMPOSE up -d --build
$COMPOSE exec api npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "Nitro Pricing atualizado. Web: porta ${WEB_PORT:-5173}; API: porta ${API_PORT:-3000}."
