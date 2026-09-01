// ============================================================
// Ekstraksi teks dari lampiran, supaya AI bisa membacanya.
//
// Jalur per jenis berkas:
//   PDF berteks   -> pdfjs-dist membaca lapisan teksnya langsung
//   PDF pindaian  -> pdftoppm merender jadi gambar, lalu Tesseract OCR
//   DOCX          -> mammoth
//   XLSX / CSV    -> exceljs, dibaca sebagai tabel
//   Gambar        -> Tesseract OCR
//   Teks polos    -> apa adanya
//
// Catatan penting: model teks tidak bisa MELIHAT gambar. OCR membaca
// TULISAN di dalam gambar — jadi foto invoice bisa dianalisis, tapi
// pertanyaan "gambar ini apa?" tetap di luar jangkauan.
// ============================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';

const run = promisify(execFile);

export const MAX_ATTACH_BYTES  = 12 * 1024 * 1024;  // 12 MB per berkas
export const MAX_STORED_CHARS  = 200_000;           // batas teks yang disimpan
export const MAX_OCR_PAGES     = 8;                 // OCR mahal; halaman awal saja
export const MAX_PER_SESSION   = 5;

export class ExtractError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Deteksi dari ISI berkas. Ekstensi dan content-type dikirim klien, jadi
// keduanya tidak dipercaya untuk memutuskan cara pemrosesan.
export function sniff(buf, filename = '') {
  const b = buf;
  const ext = path.extname(String(filename)).toLowerCase();
  if (b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b) {            // ZIP: docx / xlsx
    if (ext === '.docx') return 'docx';
    if (ext === '.xlsx' || ext === '.xlsm') return 'xlsx';
    return 'zip';
  }
  if (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'image';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image';
  if (b.length > 12 && b.subarray(0, 4).toString('latin1') === 'RIFF'
      && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'image';
  if (b.length > 6 && b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image';
  if (b.length > 8 && b.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1') return 'oldoffice';
  // Sisanya: anggap teks bila mayoritas byte-nya bisa dicetak.
  const sample = b.subarray(0, 2000);
  const printable = sample.filter(c => c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127)).length;
  if (sample.length && printable / sample.length > 0.85) {
    return (ext === '.csv' || ext === '.tsv') ? 'csv' : 'text';
  }
  return null;
}

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'reddie-'));
  try { return await fn(dir); }
  finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}

// ── OCR ────────────────────────────────────────────────────
async function ocrFile(imgPath) {
  // -l ind+eng: dokumen bisnis Indonesia kerap bercampur istilah Inggris.
  const { stdout } = await run('tesseract', [imgPath, 'stdout', '-l', 'ind+eng'],
    { maxBuffer: 20 * 1024 * 1024, timeout: 90_000 });
  return stdout.trim();
}

async function ocrImage(buf) {
  return withTempDir(async (dir) => {
    const f = path.join(dir, 'in');
    await fs.writeFile(f, buf);
    const text = await ocrFile(f);
    if (!text) throw new ExtractError('Tidak ada tulisan yang terbaca di gambar ini. OCR membaca teks, bukan memahami isi gambar.', 422);
    return { text, method: 'ocr', pages: 1 };
  });
}

// ── PDF ────────────────────────────────────────────────────
async function pdfText(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    isEvalSupported: false,
    useWorkerFetch: false,
    disableFontFace: true,
  }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    const line = c.items.map(it => it.str).join(' ').replace(/\s+/g, ' ').trim();
    if (line) out += (out ? '\n\n' : '') + `[halaman ${i}] ` + line;
    if (out.length > MAX_STORED_CHARS) break;
  }
  return { text: out.trim(), pages: doc.numPages };
}

async function pdfOcr(buf, pages) {
  return withTempDir(async (dir) => {
    const src = path.join(dir, 'in.pdf');
    await fs.writeFile(src, buf);
    const last = Math.min(pages || MAX_OCR_PAGES, MAX_OCR_PAGES);
    await run('pdftoppm', ['-r', '200', '-png', '-f', '1', '-l', String(last), src, path.join(dir, 'p')],
      { timeout: 120_000 });
    const files = (await fs.readdir(dir)).filter(f => f.endsWith('.png')).sort();
    let out = '';
    for (let i = 0; i < files.length; i++) {
      const t = await ocrFile(path.join(dir, files[i]));
      if (t) out += (out ? '\n\n' : '') + `[halaman ${i + 1}] ` + t;
      if (out.length > MAX_STORED_CHARS) break;
    }
    return out.trim();
  });
}

// ── Spreadsheet ────────────────────────────────────────────
async function sheetText(buf, kind) {
  const wb = new ExcelJS.Workbook();
  if (kind === 'csv') {
    const txt = buf.toString('utf8');
    return { text: txt.slice(0, MAX_STORED_CHARS), method: 'sheet', pages: 1 };
  }
  await wb.xlsx.load(buf);
  let out = '';
  wb.eachSheet((ws) => {
    out += (out ? '\n\n' : '') + `[lembar: ${ws.name}]\n`;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cells = row.values.slice(1).map(v => {
        if (v == null) return '';
        if (typeof v === 'object') return String(v.text ?? v.result ?? v.formula ?? '');
        return String(v);
      });
      if (cells.some(c => c !== '')) out += cells.join(' | ') + '\n';
    });
  });
  return { text: out.trim().slice(0, MAX_STORED_CHARS), method: 'sheet', pages: wb.worksheets.length };
}

/**
 * Ekstrak teks dari satu berkas lampiran.
 * @returns {{text, method, pages, chars, truncated}}
 */
export async function extractText(buf, filename) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw new ExtractError('Berkas kosong.');
  if (buf.length > MAX_ATTACH_BYTES) {
    throw new ExtractError(`Ukuran ${(buf.length / 1048576).toFixed(1)} MB melebihi batas 12 MB.`, 413);
  }

  const kind = sniff(buf, filename);
  let text = '', method = '', pages = null;

  switch (kind) {
    case 'pdf': {
      const r = await pdfText(buf);
      pages = r.pages;
      // Sedikit sekali teks berarti PDF hasil pindai: isinya gambar, bukan huruf.
      if (r.text.replace(/\[halaman \d+\]/g, '').trim().length < 40) {
        text = await pdfOcr(buf, r.pages);
        method = 'pdf-ocr';
        if (!text) throw new ExtractError('PDF ini tidak memuat teks yang bisa dibaca, dan hasil pindaiannya terlalu kabur untuk OCR.', 422);
      } else { text = r.text; method = 'pdf'; }
      break;
    }
    case 'docx': {
      const r = await mammoth.extractRawText({ buffer: buf });
      text = String(r.value || '').trim(); method = 'docx';
      if (!text) throw new ExtractError('Dokumen Word ini tidak memuat teks.', 422);
      break;
    }
    case 'xlsx': case 'csv': {
      const r = await sheetText(buf, kind);
      text = r.text; method = r.method; pages = r.pages;
      if (!text) throw new ExtractError('Spreadsheet ini kosong.', 422);
      break;
    }
    case 'image': {
      const r = await ocrImage(buf);
      text = r.text; method = r.method; pages = 1;
      break;
    }
    case 'text':
      text = buf.toString('utf8').trim(); method = 'text';
      if (!text) throw new ExtractError('Berkas teks ini kosong.', 422);
      break;
    case 'oldoffice':
      throw new ExtractError('Format Office lama (.doc/.xls) belum didukung. Simpan ulang sebagai .docx atau .xlsx.', 415);
    case 'zip':
      throw new ExtractError('Berkas ZIP tidak didukung. Unggah dokumennya langsung.', 415);
    default:
      throw new ExtractError('Jenis berkas ini belum didukung. Yang bisa dibaca: PDF, Word, Excel, CSV, teks, dan gambar.', 415);
  }

  const truncated = text.length > MAX_STORED_CHARS;
  return {
    text: text.slice(0, MAX_STORED_CHARS),
    method, pages,
    chars: Math.min(text.length, MAX_STORED_CHARS),
    truncated,
  };
}
