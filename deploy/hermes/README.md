# Menghubungkan Hermes ke Agentic Control

## Skill Hermes

Folder `wit/` di sini adalah salinan skill yang sudah terpasang di
`~/.hermes/skills/`. Dengan skill itu Hermes tahu sendiri cara memakai
jembatan — cukup diberi kode sesinya, tanpa perlu dijelaskan ulang.

Bila Hermes dipasang ulang atau pindah mesin:

```bash
cp -r deploy/hermes/wit ~/.hermes/skills/
```

**Strukturnya wajib dua tingkat**: `skills/<kategori>/<nama>/SKILL.md`,
dengan `DESCRIPTION.md` di tingkat kategori. Menaruh `SKILL.md` langsung di
bawah `skills/` membuatnya tidak terbaca sama sekali — Hermes diam saja,
tanpa peringatan, dan mengerjakan permintaan dari nol seolah skill itu tidak
ada.


Hermes mengendalikan tampilan pengunjung lewat **HTTP biasa**, bukan
WebSocket. Server Reddie yang memegang koneksi WebSocket ke browser dan
menegakkan daftar tindakan yang diizinkan. Hermes cukup mengirim POST.

## Alurnya

1. Pengunjung membuka menu **Agentic** lalu menekan *Izinkan Reddie
   mengendalikan tampilan*. Muncul **kode sesi** enam karakter.
2. Pengunjung menyebutkan kode itu ke Hermes.
3. Hermes mengirim perintah dengan menyertakan kode tersebut.

Sesi tidak pernah terbentuk tanpa pengunjung menekan tombolnya. Tidak ada
cara Hermes "menemukan" tab orang yang tidak mengundangnya.

## Perintah

```bash
curl -s -X POST https://contoh.reddie.id/dev-reddie/api/bridge/command \
  -H "authorization: Bearer $AGENT_BRIDGE_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"kode":"C0941F","action":"open_menu","arg":"automation"}'
```

Melihat sesi yang sedang aktif:

```bash
curl -s https://contoh.reddie.id/dev-reddie/api/bridge/sessions \
  -H "authorization: Bearer $AGENT_BRIDGE_TOKEN"
```

Daftar tindakan terbaru (tanpa token, aman dibaca siapa saja):

```bash
curl -s https://contoh.reddie.id/dev-reddie/api/bridge/info
```

## Tindakan yang diizinkan

| Tindakan | Argumen | Keterangan |
|---|---|---|
| `open_menu` | `chat`, `task`, `schedule`, `investment`, `news`, `automation` | Berpindah menu |
| `send_chat` | teks, maks 500 karakter | Mengetik dan mengirim pesan |
| `run_workflow` | id workflow n8n | Menjalankan otomasi |
| `highlight` | `sidebar`, `panel`, `chat`, `workflow`, `graph`, `input` | Menyorot bagian antarmuka |
| `scroll` | sama seperti di atas | Menggulir ke bagian itu |
| `toast` | teks | Menampilkan keterangan singkat |
| `ask_permission` | `camera`, `microphone`, `screen`, `clipboard` | Memunculkan dialog izin browser |
| `capture` | sama seperti di atas | Hanya setelah izinnya diberikan |

## Mengapa daftarnya tertutup

Hermes punya akses shell di server ini. Bila jembatan meneruskan perintah
sembarangan, kalimat pengunjung anonim menjadi jalan masuk ke shell
tersebut — prompt injection berhenti menjadi teori. Karena itu:

- Tindakan di luar tabel **ditolak di server**, bukan diabaikan di browser.
- Target sorot dan gulir memakai nama simbolik, bukan selektor CSS bebas.
  Selektor bebas berarti agent bisa menunjuk elemen apa pun, termasuk yang
  memuat data pengunjung.
- `capture` menolak bila izinnya belum diberikan, walau Hermes memintanya.
- Yang memberi izin kamera, mikrofon, layar, dan papan klip tetap dialog
  bawaan browser. Pengunjung bisa menolak, dan penolakan dilaporkan balik.

## Batas yang tidak bisa dilewati

Kendali berhenti di tepi halaman. Berkas, aplikasi lain, dan sistem operasi
pengunjung tidak tersentuh — browser memang mengurung halaman web, dan itu
tidak bisa dibuka dari sisi server. Klaim sebaliknya kepada calon klien akan
gugur saat diperiksa.
