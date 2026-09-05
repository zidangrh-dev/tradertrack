#!/usr/bin/env bash
# ZProject — update & deploy di VPS.
# Jalankan dari mana saja:  zproject-update   (atau:  bash /opt/zproject/update.sh)
# Berhenti otomatis jika ada langkah yang gagal.
set -euo pipefail

PROJECT_DIR="/opt/zproject"
WEB_ROOT="/var/www/zproject"

echo "==> [1/6] Menarik kode terbaru dari GitHub..."
cd "$PROJECT_DIR"
git pull origin main

echo "==> [2/6] Rebuild & restart backend (Docker, project: zproject)..."
docker compose -p zproject up -d --build api

echo "==> [3/6] Install dependency frontend..."
cd "$PROJECT_DIR/frontend"
npm install

echo "==> [4/6] Build web (expo export)..."
npx expo export -p web --output-dir dist

echo "==> [5/6] Pasang web ke Nginx root..."
mkdir -p "$WEB_ROOT"
rm -rf "${WEB_ROOT:?}"/*          # bersihkan file lama (aman: WEB_ROOT wajib terisi)
cp -r "$PROJECT_DIR/frontend/dist/"* "$WEB_ROOT"/

echo "==> [6/6] Verifikasi layanan..."
sleep 2
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4002/api/health)
if [ "$HTTP" = "200" ]; then
  echo "    API lokal: 200 OK"
else
  echo "    ⚠️  API lokal: HTTP $HTTP (cek: docker logs zproject-api-1)"
fi
HTTPW=$(curl -s -o /dev/null -w "%{http_code}" https://pasukanzaydan.net || true)
echo "    Web https://pasukanzaydan.net : HTTP $HTTPW"

echo "==> ✅ Selesai! ZProject sudah terupdate."
