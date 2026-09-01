---
name: reddie-control
description: "Mengendalikan tampilan demo Reddie di layar pengunjung (contoh.reddie.id) lewat kode sesi."
version: 1.0.0
author: WIT.ID
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [reddie, demo, kendali, layar, websocket, wit, presentasi]
    related_skills: []
---

# Kendali Tampilan Reddie

Kamu bisa mengoperasikan panel demo Reddie di layar orang lain — berpindah
menu, menjalankan otomasi, mengetik di kolom chat, dan menyorot bagian
antarmuka — sementara mereka menonton.

## Cara memulai

Orang tersebut membuka `contoh.reddie.id/dev-reddie/`, masuk ke menu
**Agentic**, lalu menekan *Izinkan Reddie mengendalikan tampilan*. Muncul
**kode sesi** enam karakter, misalnya `72AB3F`. Mereka menyebutkan kode itu
kepadamu.

Tanpa kode, tidak ada yang bisa kamu kendalikan. Jangan pernah menebak kode.

## Menjalankan perintah

Token ada di berkas `.env` server. Baca saat dibutuhkan, jangan disalin ke
dalam percakapan:

```bash
TOKEN=$(grep '^AGENT_BRIDGE_TOKEN=' /home/wit/docker-infra/reddie-api/.env | cut -d= -f2)
KODE=72AB3F

curl -s -X POST https://contoh.reddie.id/dev-reddie/api/bridge/command \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"kode\":\"$KODE\",\"action\":\"open_menu\",\"arg\":\"automation\"}"
```

Memeriksa sesi yang masih hidup:

```bash
curl -s https://contoh.reddie.id/dev-reddie/api/bridge/sessions \
  -H "authorization: Bearer $TOKEN"
```

## Tindakan yang tersedia

| `action` | `arg` |
|---|---|
| `open_menu` | `chat`, `task`, `schedule`, `investment`, `news`, `automation` |
| `send_chat` | teks bebas, maksimal 500 karakter |
| `run_workflow` | id workflow n8n |
| `highlight` | `sidebar`, `panel`, `chat`, `workflow`, `graph`, `input` |
| `scroll` | sama seperti `highlight` |
| `toast` | teks pendek |
| `ask_permission` | `camera`, `microphone`, `screen`, `clipboard` |
| `capture` | sama, hanya setelah izin diberikan |

Selain daftar ini, server menolak dengan HTTP 400. Jangan mencoba menyiasati
— penolakan itu memang disengaja.

## Cara mendemokan yang enak dilihat

Beri jeda sekitar dua detik antar perintah supaya orang sempat mengikuti.
Urutan yang bagus:

1. `toast` — "Saya ambil alih tampilannya sebentar."
2. `open_menu` → `automation`
3. `highlight` → `graph`
4. `run_workflow` → id laporan berita
5. `open_menu` → `news`
6. `send_chat` → "Ringkaskan berita teratas."

## Batas yang harus kamu sampaikan jujur

Kendalimu berhenti di tepi halaman itu. Kamu **tidak** bisa menyentuh berkas,
aplikasi lain, atau sistem operasi mereka — browser mengurung halaman web,
dan itu tidak bisa dibuka dari sisi server.

Kamera, mikrofon, layar, dan papan klip hanya bisa kamu **minta**. Yang
memberi izin adalah dialog bawaan browser, dan mereka bisa menolak. Bila
`capture` ditolak dengan HTTP 403, artinya izinnya memang belum diberikan —
minta dulu lewat `ask_permission`, jangan diulang paksa.

Kalau ditanya apakah kamu bisa mengendalikan komputer mereka, jawab terus
terang: tidak, hanya halaman demo yang sedang mereka buka.
