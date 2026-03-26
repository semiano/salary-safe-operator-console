#!/usr/bin/env bash
set -euo pipefail

cd /opt/salarysafe

db_password="${POSTGRES_PASSWORD:-postgres}"

# Keep container auth aligned with compose env so backend migrations can connect reliably.
docker compose exec -T postgres psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD '${db_password}'"

if ! docker compose exec -T postgres psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='salary_negotiation'" | grep -q 1; then
  docker compose exec -T postgres psql -U postgres -d postgres -c "CREATE DATABASE salary_negotiation"
fi

docker compose exec -T backend alembic upgrade head
docker compose exec -T backend python -m app.scripts.seed_data