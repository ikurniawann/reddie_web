#!/usr/bin/env bash
# ============================================================
# Terapkan Reddie CMS + Chat API ke docker-infra — idempotent.
# Jalankan sebagai user wit:  bash deploy/apply.sh
# ============================================================
set -euo pipefail
DI=/home/wit/docker-infra
SRC="/home/wit/Desktop/Reddie Landing Page"
TS=$(date +%Y%m%d-%H%M%S)

echo "── [1/6] backup file infra"
cp "$DI/docker-compose.yml" "/home/wit/backups/docker-compose.yml.bak-$TS"
cp "$DI/demos.conf"        "/home/wit/backups/demos.conf.bak-$TS"

echo "── [2/6] patch docker-compose.yml"
if grep -q "reddie-db:" "$DI/docker-compose.yml"; then
  echo "   sudah ada — lewati"
else
  sed -i 's/^volumes:/volumes:\n  reddie-db-data:/' "$DI/docker-compose.yml"
  cat >> "$DI/docker-compose.yml" <<'YAML'

  # === Reddie — CMS & Chat API (dev-reddie) ===
  reddie-db:
    image: postgres:16-alpine
    container_name: reddie-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: reddie
      POSTGRES_DB: reddie
      POSTGRES_PASSWORD: ${REDDIE_DB_PASSWORD:?set REDDIE_DB_PASSWORD di .env}
    volumes:
      - reddie-db-data:/var/lib/postgresql/data
    networks:
      - infra-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U reddie"]
      interval: 10s
      timeout: 5s
      retries: 5

  reddie-api:
    build:
      context: ./reddie-api
    container_name: reddie-api
    restart: unless-stopped
    env_file:
      - ./reddie-api/.env
    environment:
      DATABASE_URL: postgres://reddie:${REDDIE_DB_PASSWORD}@reddie-db:5432/reddie
    expose:
      - "8080"
    depends_on:
      reddie-db:
        condition: service_healthy
    networks:
      - infra-net
YAML
fi

echo "── [3/6] patch demos.conf (proxy /dev-reddie/api/)"
if grep -q "dev-reddie/api" "$DI/demos.conf"; then
  echo "   sudah ada — lewati"
else
  python3 - <<'PY'
import io
N = '/home/wit/docker-infra/demos.conf'
n = io.open(N).read()
old = '    location / {'
new = '''    # API Reddie (CMS + chat) — proxy ke container reddie-api
    location /dev-reddie/api/ {
        proxy_pass http://reddie-api:8080/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
        client_max_body_size 256k;
    }

    location / {'''
assert n.count(old) == 1, 'pola "location / {" tidak unik di demos.conf'
io.open(N, 'w').write(n.replace(old, new))
print('   demos.conf dipatch')
PY
fi

echo "── [4/6] sinkron kode server + validasi lalu build & start"
# salin kode server terbaru (tanpa menimpa .env produksi & node_modules)
rsync -a --exclude node_modules --exclude .env "$SRC/server/" "$DI/reddie-api/"
cd "$DI"
docker compose config --quiet
docker compose up -d --build reddie-db reddie-api
docker compose restart demos

echo "── [5/6] upload frontend terbaru ke docroot"
cp -a "$SRC/index.html" "$DI/demos/dev-reddie/index.html"
cp -a "$SRC/style/."    "$DI/demos/dev-reddie/style/"
cp -a "$SRC/assets/."   "$DI/demos/dev-reddie/assets/"

echo "── [6/6] tunggu API sehat lalu verifikasi"
ok=""
for i in $(seq 1 20); do
  sleep 2
  if docker exec reddie-api wget -qO- http://127.0.0.1:8080/api/health 2>/dev/null | grep -q ok; then
    ok=1; echo "   API SEHAT"; break
  fi
done
if [ -z "$ok" ]; then
  echo "   API belum sehat — cek log: docker compose logs reddie-api"
  exit 1
fi
echo
echo "════ SELESAI ════"
echo "Publik   : https://contoh.reddie.id/dev-reddie/api/health"
echo "Admin CMS: https://contoh.reddie.id/dev-reddie/api/admin"
echo "Berikutnya: purge cache Cloudflare, lalu isi API key provider di"
echo "  $DI/reddie-api/.env  dan jalankan: docker compose restart reddie-api"
