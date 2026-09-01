# Workflow n8n untuk demo Reddie

Dua workflow contoh dipakai panel **Automation**:

| Berkas | Yang dilakukan |
|---|---|
| `reddie-demo-otomasi.json` | Menulis ke dasbor, menarik data pasar, membalas ringkasan |
| `reddie-laporan-berita-pdf.json` | Mengambil 5 berita lalu menyusunnya jadi PDF beserta sampulnya |

`reddie-demo-otomasi.json` impor lewat n8n → Workflows → Import from File,
atau kirim ke `POST /api/v1/workflows` dengan header `X-N8N-API-KEY`.

## Yang dilakukannya

1. **Dipicu Reddie** — node Webhook di `/webhook/reddie-demo`.
2. **Catat ke Dasbor** — menulis satu baris ke `/api/leads` Reddie, sehingga
   muncul di tab *Pesan masuk* panel admin.
3. **Ambil Data Pasar** — memanggil `/api/crypto` Reddie, yang meneruskan ke
   CoinGecko. Membuktikan otomasi bisa menarik data dari luar.
4. **Susun Ringkasan** — menyusun kalimat berbahasa Indonesia, bukan JSON
   mentah, supaya hasilnya bisa dibaca orang non-teknis.
5. **Balas ke Reddie** — mengembalikan ringkasan itu untuk ditampilkan.

## Dua hal yang perlu diketahui bila memodifikasi

**Alurnya berurutan, bukan paralel.** Percobaan pertama menyambungkan
"Catat ke Dasbor" dan "Ambil Data Pasar" langsung ke node ringkasan secara
paralel. n8n tidak menggabungkan dua cabang pada satu input tanpa node Merge,
sehingga node ringkasan hanya menerima salah satunya dan data pasar hilang.

**Harus punya node Webhook.** API publik n8n tidak menyediakan "jalankan
workflow sekarang"; eksekusi dari luar hanya lewat URL webhook. Workflow
tanpa node Webhook akan terbaca Reddie tapi tidak bisa dijalankan dari sana.
