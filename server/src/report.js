// ============================================================
// Laporan PDF dari berita terkini.
//
// PDF dan gambar sampulnya ditulis ke volume media yang sudah dilayani
// nginx, jadi keduanya bisa dibuka langsung tanpa endpoint pengunduh
// tersendiri. Sampul dirender dengan pdftoppm — paket yang sudah ada
// di image untuk keperluan OCR lampiran.
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import PDFDocument from 'pdfkit';
import { fetchNews } from './news.js';
import { MEDIA_DIR } from './media.js';

const run = promisify(execFile);
const DIR = 'reports';
const SIMPAN_MAKS = 20;           // laporan lama dipangkas; ini demo, bukan arsip

export class ReportError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// Font standar pdfkit ber-encoding WinAnsi; judul berita kerap memuat tanda
// kutip melengkung dan emoji yang di luar jangkauannya.
const rapi = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[–—]/g, '-')
  .replace(/[^\x09\x0a\x0d\x20-\xff]/g, '')
  .trim();

const waktuID = (d) => new Date(d).toLocaleString('id-ID', {
  dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta',
});

function buatPDF(items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: {
      Title: 'Ringkasan Berita Reddie', Author: 'Reddie by WIT.ID',
    } });
    const buf = [];
    doc.on('data', c => buf.push(c));
    doc.on('end', () => resolve(Buffer.concat(buf)));
    doc.on('error', reject);

    doc.fillColor('#d92229').font('Helvetica-Bold').fontSize(22).text('REDDIE');
    doc.fillColor('#111').font('Helvetica-Bold').fontSize(15).text('Ringkasan Berita Terkini');
    doc.moveDown(0.2);
    doc.fillColor('#666').font('Helvetica').fontSize(9)
       .text('Disusun otomatis pada ' + waktuID(new Date()) + ' WIB · ' + items.length + ' berita');
    doc.moveDown(0.6);
    doc.moveTo(56, doc.y).lineTo(539, doc.y).strokeColor('#e0e0e0').lineWidth(1).stroke();
    doc.moveDown(0.9);

    items.forEach((n, i) => {
      if (doc.y > 690) doc.addPage();
      doc.fillColor('#d92229').font('Helvetica-Bold').fontSize(9).text(String(i + 1).padStart(2, '0'));
      doc.moveUp();
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(12)
         .text(rapi(n.title), 80, doc.y, { width: 459, lineGap: 1 });
      doc.moveDown(0.25);
      doc.fillColor('#777').font('Helvetica').fontSize(8)
         .text(rapi(n.source || '') + (n.published ? '  ·  ' + waktuID(n.published) + ' WIB' : ''),
               80, doc.y, { width: 459 });
      if (n.summary) {
        doc.moveDown(0.3);
        doc.fillColor('#333').font('Helvetica').fontSize(9.5)
           .text(rapi(n.summary), 80, doc.y, { width: 459, lineGap: 1.5 });
      }
      doc.moveDown(0.25);
      doc.fillColor('#9a9a9a').font('Helvetica').fontSize(7.5)
         .text(rapi(n.link || ''), 80, doc.y, { width: 459 });
      doc.moveDown(1);
      doc.x = 56;
    });

    doc.fillColor('#999').fontSize(7.5)
       .text('Dibuat otomatis oleh Reddie - WIT.ID, Jakarta', 56, 790, { width: 483, align: 'center' });
    doc.end();
  });
}

// Simpan hanya laporan terbaru; sisanya dibuang agar volume tidak tumbuh
// tanpa batas oleh demo yang dijalankan berulang kali.
async function pangkasLama(dir) {
  try {
    const berkas = (await fs.readdir(dir)).filter(f => f.endsWith('.pdf')).sort();
    for (const f of berkas.slice(0, Math.max(0, berkas.length - SIMPAN_MAKS))) {
      await fs.rm(path.join(dir, f), { force: true }).catch(() => {});
      await fs.rm(path.join(dir, f.replace(/\.pdf$/, '.png')), { force: true }).catch(() => {});
    }
  } catch { /* direktori belum ada */ }
}

/** Ambil berita, susun PDF, render sampulnya. */
export async function buatLaporanBerita({ limit = 5, feeds, query, lang, country } = {}) {
  const r = await fetchNews({ feeds, query, lang, country, limit });
  const items = r.items || [];
  if (!items.length) throw new ReportError('Tidak ada berita untuk dijadikan laporan.', 502);

  const pdf = await buatPDF(items);
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const hash = crypto.createHash('sha256').update(pdf).digest('hex').slice(0, 6);
  const nama = `berita-${stamp}-${hash}`;
  const dir = path.join(MEDIA_DIR, DIR);

  await fs.mkdir(dir, { recursive: true });
  const absPdf = path.join(dir, nama + '.pdf');
  await fs.writeFile(absPdf, pdf);

  // Sampul: halaman pertama jadi PNG. Gagal merender tidak boleh
  // menggagalkan laporannya — PDF-nya tetap berguna tanpa gambar sampul.
  let thumb = null;
  try {
    await run('pdftoppm', ['-r', '90', '-png', '-f', '1', '-l', '1', absPdf, path.join(dir, nama)],
      { timeout: 20_000 });
    const dibuat = (await fs.readdir(dir)).find(f => f.startsWith(nama) && f.endsWith('.png'));
    if (dibuat) {
      await fs.rename(path.join(dir, dibuat), path.join(dir, nama + '.png')).catch(() => {});
      thumb = `media/${DIR}/${nama}.png`;
    }
  } catch { /* sampul opsional */ }

  await pangkasLama(dir);

  return {
    ok: true,
    judul: 'Ringkasan Berita Terkini',
    jumlah: items.length,
    dibuat: new Date().toISOString(),
    pdf: `media/${DIR}/${nama}.pdf`,
    thumb,
    bytes: pdf.length,
    berita: items.map(n => ({ judul: n.title, sumber: n.source })),
  };
}
