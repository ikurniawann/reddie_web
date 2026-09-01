// ============================================================
// Pemrosesan unggahan gambar.
//
// Setiap berkas masuk selalu melewati tiga hal:
//   1. Validasi dari ISI berkas (magic bytes), bukan dari nama atau
//      content-type — keduanya dikendalikan klien dan mudah dipalsukan.
//   2. Normalisasi ke WebP dengan batas dimensi. Editor non-teknis biasa
//      mengunggah foto ponsel 4 MB; tanpa ini situs jadi lambat.
//   3. Pembuangan metadata. Foto ponsel membawa EXIF berisi koordinat GPS —
//      sharp membuangnya secara bawaan saat menulis ulang berkas.
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

export const MEDIA_DIR   = process.env.MEDIA_DIR || '/app/media';
export const MAX_UPLOAD  = 8 * 1024 * 1024;   // 8 MB sebelum diproses
export const MAX_EDGE    = 1600;              // sisi terpanjang setelah diproses
const WEBP_QUALITY       = 82;

export class MediaError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Tanda tangan berkas gambar yang diterima.
const SIGNATURES = [
  { mime: 'image/png',  test: b => b.length > 8  && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: b => b.length > 3  && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif',  test: b => b.length > 6  && b.subarray(0, 6).toString('latin1').startsWith('GIF8') },
  { mime: 'image/webp', test: b => b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF'
                                                 && b.subarray(8, 12).toString('latin1') === 'WEBP' },
  { mime: 'image/avif', test: b => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp'
                                                 && b.subarray(8, 12).toString('latin1').startsWith('avif') },
];

export function sniffMime(buf) {
  for (const s of SIGNATURES) if (s.test(buf)) return s.mime;
  return null;
}

// "Foto Profil Saya.PNG" -> "foto-profil-saya"
function slugify(name) {
  return path.basename(String(name || 'gambar'), path.extname(String(name || '')))
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'gambar';
}

/**
 * Proses buffer mentah jadi berkas WebP di disk.
 * Mengembalikan metadata siap simpan ke tabel media.
 */
export async function processUpload(buf, originalName) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new MediaError('Berkas kosong.');
  if (buf.length > MAX_UPLOAD) {
    throw new MediaError(`Ukuran berkas ${(buf.length / 1048576).toFixed(1)} MB melebihi batas 8 MB. Perkecil dulu gambarnya.`, 413);
  }

  const sniffed = sniffMime(buf);
  if (!sniffed) {
    throw new MediaError('Berkas ini bukan gambar yang dikenali. Format yang didukung: PNG, JPG, WebP, GIF, AVIF.');
  }

  let img, meta;
  try {
    img = sharp(buf, { failOn: 'error' });
    meta = await img.metadata();
  } catch {
    throw new MediaError('Gambar tidak bisa dibaca — berkasnya mungkin rusak.');
  }
  if (!meta.width || !meta.height) throw new MediaError('Ukuran gambar tidak terbaca.');

  // Perkecil hanya bila melebihi batas; gambar kecil tidak diperbesar.
  const out = await img
    .rotate()                                   // hormati orientasi EXIF sebelum dibuang
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });

  const hash = crypto.createHash('sha256').update(out.data).digest('hex').slice(0, 8);
  const now = new Date();
  const dir = path.join(String(now.getUTCFullYear()), String(now.getUTCMonth() + 1).padStart(2, '0'));
  const rel = path.join('media', dir, `${slugify(originalName)}-${hash}.webp`);
  const abs = path.join(MEDIA_DIR, dir, path.basename(rel));

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, out.data);

  return {
    path: rel.split(path.sep).join('/'),
    filename: String(originalName || 'gambar').slice(0, 200),
    mime: 'image/webp',
    bytes: out.data.length,
    width: out.info.width,
    height: out.info.height,
    original: { mime: sniffed, bytes: buf.length, width: meta.width, height: meta.height },
  };
}

// Hapus berkas fisik. Aset bawaan (di assets/) tidak pernah disentuh.
export async function removeFile(relPath) {
  if (!relPath || !relPath.startsWith('media/')) return false;
  const abs = path.join(MEDIA_DIR, relPath.slice('media/'.length));
  // Jaga-jaga terhadap path traversal walau path berasal dari database
  if (!path.resolve(abs).startsWith(path.resolve(MEDIA_DIR))) return false;
  try { await fs.unlink(abs); return true; } catch { return false; }
}
