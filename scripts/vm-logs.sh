#!/usr/bin/env sh
set -eu

docker compose -f docker-compose.vm.yml logs -f --tail=160 api web
