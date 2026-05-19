#!/usr/bin/env sh
set -eu

COMPOSE="docker compose -f docker-compose.vm.yml"
BACKUP_DIR="${BACKUP_DIR:-./backups/db}"
STAMP="$(date +%Y-%m-%d_%H-%M-%S)"
FILE="$BACKUP_DIR/nitro-pricing-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
$COMPOSE exec -T postgres pg_dump -U "${POSTGRES_USER:-powerquote}" "${POSTGRES_DB:-powerquote}" | gzip > "$FILE"

echo "Backup criado em $FILE"
