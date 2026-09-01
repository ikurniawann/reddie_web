# Deploy Reddie CMS + Chat API

Arsitektur: `nginx demos` (statis, sudah ada) + `reddie-api` (Node) + `reddie-db`
(Postgres) di network `infra-net`. Frontend memanggil API secara **relatif**
(`/dev-reddie/api/...`) sehingga same-origin, tanpa CORS. Bila API mati,
landing page otomatis kembali ke mode statis + mock chat — tidak pernah rusak.

## 1. Salin folder server

```bash
cp -a "/home/wit/Desktop/Reddie Landing Page/server" /home/wit/docker-infra/reddie-api
```

## 2. Buat konfigurasi

```bash
cd /home/wit/docker-infra/reddie-api
cp .env.example .env
# generate rahasia:
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "REDDIE_DB_PASSWORD=$(openssl rand -hex 16)"
nano .env    # isi JWT_SECRET, ADMIN_PASSWORD, dan API key provider yang dipakai
```

- `DATABASE_URL` di `.env` boleh dibiarkan — nilai final disuntik compose.
- Tambahkan `REDDIE_DB_PASSWORD=...` ke `/home/wit/docker-infra/.env`
  (file env milik docker-compose, buat bila belum ada).
- Minimal isi **satu** API key: `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `DEEPSEEK_API_KEY`. Model yang provider-nya tak ber-key otomatis
  disembunyikan dari publik.

## 3. Daftarkan service

- Tempel isi `reddie.compose.snippet.yml` ke `docker-infra/docker-compose.yml`
  (dua service + volume `reddie-db-data`).
- Tempel isi `nginx-demos.snippet.conf` ke `docker-infra/demos.conf`
  (di dalam `server{}`, di atas `location /`).

## 4. Jalankan

```bash
cd /home/wit/docker-infra
docker compose up -d --build reddie-db reddie-api
docker compose restart demos          # muat config nginx baru
docker compose logs -f reddie-api     # harus: [migrate] applied ... [reddie-api] listening
```

## 5. Upload frontend baru

```bash
cp -a "/home/wit/Desktop/Reddie Landing Page/index.html" /home/wit/docker-infra/demos/dev-reddie/
cp -a "/home/wit/Desktop/Reddie Landing Page/style/." /home/wit/docker-infra/demos/dev-reddie/style/
```

Lalu **purge cache Cloudflare** (Caching → Purge Everything) agar
`style.css`/`script.js` baru langsung tersaji.

## 6. Verifikasi

```bash
curl -s https://contoh.reddie.id/dev-reddie/api/health        # {"ok":true}
curl -s https://contoh.reddie.id/dev-reddie/api/content | head -c 300
```

- Buka `https://contoh.reddie.id/dev-reddie/` → chat harus dijawab model AI nyata.
- CMS admin: `https://contoh.reddie.id/dev-reddie/api/admin` (login = ADMIN_EMAIL/PASSWORD).

## Catatan operasional

- Rate limit: 20 pesan/sesi, 60 request/IP/jam (ubah via env `CHAT_MAX_*`).
- Konten CMS di-cache 60 detik (`/api/content`); edit terlihat ≤1 menit.
- Tabel `leads` menampung form kontak, email login, dsb. Lihat tab **Leads** di admin.
- Riwayat chat penuh ada di tab **Riwayat Chat** — berguna untuk QA jawaban model.
- Backup DB: `docker exec reddie-db pg_dump -U reddie reddie > backup.sql`.
- Model provider `echo` hanya untuk uji tanpa API key — biarkan **nonaktif** di produksi.
