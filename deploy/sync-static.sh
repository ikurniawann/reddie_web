#!/usr/bin/env bash
# ============================================================
# Menyalin berkas statis ke SEMUA lokasi tayang sekaligus.
#
# Sejak reddie.id dijadikan domain utama, halaman yang sama disajikan dari dua
# tempat: container `landing` (akar reddie.id) dan `demos` (contoh.reddie.id/
# dev-reddie/). Menyalin ke salah satu saja membuat dua domain menampilkan
# versi berbeda — dan yang tertinggal biasanya justru yang dilihat orang.
#
# Pakai: deploy/sync-static.sh
# ============================================================
set -euo pipefail

ASAL="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TUJUAN=(
  /home/wit/docker-infra/landing
  /home/wit/docker-infra/demos/dev-reddie
)

for t in "${TUJUAN[@]}"; do
  [ -d "$t" ] || { echo "LEWAT (tidak ada): $t"; continue; }
  rsync -a --delete \
    --exclude '.git' --exclude 'server' --exclude 'deploy' --exclude 'docs' \
    --exclude 'media' \
    "$ASAL"/ "$t"/
  echo "tersalin -> $t"
done

# Versi aset di index.html adalah satu-satunya pemutus cache; kalau lupa
# dinaikkan, Cloudflare menyajikan berkas lama sampai empat jam.
echo -n "versi aset saat ini: "
grep -o 'live\.js?v=[a-z0-9-]*' "$ASAL/index.html" | head -1
