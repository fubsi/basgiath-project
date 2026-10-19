#!/bin/sh
set -e

# If /app/public/data is empty (e.g. because a new volume was mounted on the host by Portainer/Docker),
# populate it with the default build data so layers and manifest are never missing!
if [ ! -f "/app/public/data/manifest.json" ]; then
  echo "[BWC] /app/public/data/manifest.json missing. Seeding data from /app/dist/data..."
  mkdir -p /app/public/data
  cp -rn /app/dist/data/* /app/public/data/ 2>/dev/null || cp -r /app/dist/data/* /app/public/data/
  echo "[BWC] Data seeded successfully."
fi

exec "$@"
