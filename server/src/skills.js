// ============================================================
// Kartu "AI Skills" yang benar-benar bekerja.
//
// Sebelumnya ketiganya berjalan di browser: PDF dan Excel menyalin teks
// dari DOM, Sync tidak terhubung ke apa pun. Akibatnya hasil ekspor hanya
// memuat apa yang kebetulan terlihat di layar — tanpa waktu tiap pesan,
// tanpa model yang dipakai, dan hilang begitu pengunjung menggulir atau
// mengganti tab. Di sini semuanya dibaca langsung dari database.
// ============================================================

import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { q } from './db.js';
import { complete, providerReady, ProviderError } from './providers.js';

export class SkillError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// pdfkit memakai font standar ber-encoding WinAnsi. Balasan model kerap
// memuat emoji, yang di luar jangkauan itu dan tampil sebagai kotak kosong.
// Dibuang agar dokumen tetap rapi.
const forPdf = (s) => String(s ?? '').replace(/[^\x09\x0a\x0d\x20-\xff]/g, '').trim();

const fmt = (d) => new Date(d).toLocaleString('id-ID', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta',
});

/** Ambil sesi + seluruh pesannya. sessionId berperan sebagai kunci akses. */
export async function transcriptFor(sessionId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(sessionId || ''))) {
    throw new SkillError('Sesi tidak dikenali.', 400);
  }
  const session = (await q(
    `SELECT s.*, a.name AS agent_name FROM chat_sessions s
     LEFT JOIN agents a ON a.slug = s.agent_slug WHERE s.id = $1`, [sessionId])).rows[0];
  if (!session) throw new SkillError('Sesi tidak ditemukan.', 404);

  const messages = (await q(
    `SELECT role, content, created_at FROM chat_messages
     WHERE session_id = $1 AND role IN ('user','assistant') ORDER BY id`, [sessionId])).rows;
  if (!messages.length) {
    throw new SkillError('Percakapan masih kosong — kirim pesan dulu sebelum mengekspor.', 409);
  }
  return { session, messages };
}

// ── PDF ────────────────────────────────────────────────────
export function buildPDF({ session, messages }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 54, info: {
      Title: 'Transkrip Percakapan Reddie', Author: 'Reddie by WIT.ID',
    } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#d92229').fontSize(20).font('Helvetica-Bold')
       .text('REDDIE', { continued: true })
       .fillColor('#666').fontSize(11).font('Helvetica').text('   Transkrip Percakapan');
    doc.moveDown(0.6);

    // Blok metadata — inilah yang tidak pernah bisa dilihat versi lama,
    // karena tidak ada di DOM sama sekali.
    const agent = session.agent_name || session.agent_slug || '—';
    doc.fontSize(8.5).fillColor('#444');
    [
      ['Agent', agent],
      ['Model', session.model_id || '—'],
      ['Dimulai', fmt(session.created_at)],
      ['Jumlah pesan', String(messages.length)],
      ['ID sesi', String(session.id)],
    ].forEach(([k, v]) => {
      doc.font('Helvetica-Bold').text(k.padEnd(14), { continued: true })
         .font('Helvetica').text(': ' + forPdf(v));
    });

    doc.moveDown(0.5);
    doc.moveTo(54, doc.y).lineTo(541, doc.y).strokeColor('#ddd').lineWidth(1).stroke();
    doc.moveDown(0.8);

    for (const m of messages) {
      const mine = m.role === 'user';
      doc.fontSize(7.5).fillColor(mine ? '#8a1f22' : '#555').font('Helvetica-Bold')
         .text((mine ? 'PENGUNJUNG' : agent.toUpperCase()) + '  ·  ' + fmt(m.created_at));
      doc.fontSize(9.5).fillColor('#111').font('Helvetica')
         .text(forPdf(m.content), { align: 'left', lineGap: 1.5, indent: mine ? 14 : 0 });
      doc.moveDown(0.7);
      if (doc.y > 760) doc.addPage();
    }

    doc.fontSize(7.5).fillColor('#999')
       .text('Dibuat otomatis oleh Reddie — WIT.ID, Jakarta · ' + fmt(new Date()),
             54, 790, { width: 487, align: 'center' });
    doc.end();
  });
}

// ── Excel ──────────────────────────────────────────────────
export async function buildXLSX({ session, messages }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Reddie by WIT.ID';
  wb.created = new Date();

  const t = wb.addWorksheet('Transkrip', { views: [{ state: 'frozen', ySplit: 1 }] });
  t.columns = [
    { header: 'No',    key: 'no',   width: 6 },
    { header: 'Waktu', key: 'time', width: 20 },
    { header: 'Peran', key: 'role', width: 14 },
    { header: 'Pesan', key: 'text', width: 90 },
    { header: 'Panjang', key: 'len', width: 10 },
  ];
  t.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  t.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD92229' } };
  const agent = session.agent_name || session.agent_slug || '—';
  messages.forEach((m, i) => {
    const r = t.addRow({
      no: i + 1, time: fmt(m.created_at),
      role: m.role === 'user' ? 'Pengunjung' : agent,
      text: m.content, len: m.content.length,
    });
    r.alignment = { vertical: 'top', wrapText: true };
    if (m.role === 'user') r.getCell('role').font = { bold: true };
  });

  // Lembar kedua: angka ringkas yang biasanya ditanya orang sales.
  const s = wb.addWorksheet('Ringkasan');
  s.columns = [{ header: 'Keterangan', key: 'k', width: 28 }, { header: 'Nilai', key: 'v', width: 46 }];
  s.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  s.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD92229' } };
  const users = messages.filter(m => m.role === 'user');
  const bots = messages.filter(m => m.role === 'assistant');
  const durasi = Math.round(
    (new Date(messages[messages.length - 1].created_at) - new Date(messages[0].created_at)) / 60000);
  [
    ['Agent', agent],
    ['Model AI', session.model_id || '—'],
    ['Sesi dimulai', fmt(session.created_at)],
    ['Durasi percakapan', durasi + ' menit'],
    ['Pesan pengunjung', users.length],
    ['Balasan agent', bots.length],
    ['Rata-rata panjang balasan', bots.length
      ? Math.round(bots.reduce((n, m) => n + m.content.length, 0) / bots.length) + ' karakter' : '—'],
    ['ID sesi', String(session.id)],
  ].forEach(([k, v]) => s.addRow({ k, v }));
  s.getColumn('k').font = { bold: true };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Ekstraksi tiket oleh AI ────────────────────────────────
const EXTRACT_PROMPT = `Kamu menganalisis transkrip percakapan antara pengunjung situs dan agent AI sebuah perusahaan teknologi.
Keluarkan HANYA objek JSON, tanpa penjelasan dan tanpa pagar kode, dengan bentuk persis:
{"ringkasan":"","kebutuhan":"","prioritas":"rendah|sedang|tinggi","kontak":null,"topik":[]}

Aturan:
- "ringkasan": satu kalimat bahasa Indonesia tentang apa yang dicari pengunjung.
- "kebutuhan": kebutuhan teknis atau bisnis yang tersirat, singkat. Kosongkan bila tidak jelas.
- "prioritas": "tinggi" bila terkesan siap membeli atau mendesak, "rendah" bila sekadar melihat-lihat.
- "kontak": email atau nomor telepon bila pengunjung menyebutkannya, selain itu null.
- "topik": maksimal 4 kata kunci singkat.
Jangan mengarang informasi yang tidak ada di transkrip.`;

export async function extractTicket(messages, modelRow) {
  const fallback = {
    ringkasan: 'Percakapan tersimpan tanpa ringkasan otomatis.',
    kebutuhan: '', prioritas: 'rendah', kontak: null, topik: [],
    ai: false,
  };
  if (!modelRow || !providerReady(modelRow.provider)) return fallback;

  const transcript = messages.slice(-20).map(m =>
    (m.role === 'user' ? 'Pengunjung' : 'Agent') + ': ' + m.content).join('\n').slice(0, 6000);

  try {
    const { text } = await complete(modelRow.provider, {
      modelId: modelRow.model_id,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: transcript }],
      maxTokens: 400,
    });
    // Model kadang membungkus JSON dengan pagar kode atau kalimat pembuka.
    const raw = String(text).replace(/^[\s\S]*?\{/, '{').replace(/\}[\s\S]*$/, '}');
    const d = JSON.parse(raw);
    const pri = ['rendah', 'sedang', 'tinggi'].includes(d.prioritas) ? d.prioritas : 'sedang';
    return {
      ringkasan: String(d.ringkasan || fallback.ringkasan).slice(0, 400),
      kebutuhan: String(d.kebutuhan || '').slice(0, 300),
      prioritas: pri,
      kontak: d.kontak ? String(d.kontak).slice(0, 120) : null,
      topik: Array.isArray(d.topik) ? d.topik.slice(0, 4).map(x => String(x).slice(0, 30)) : [],
      ai: true,
    };
  } catch (e) {
    // Ekstraksi gagal tidak boleh membatalkan pembuatan tiket — tiket tetap
    // dibuat dengan ringkasan seadanya, dan alasannya dicatat di log.
    console.error('[skill:sync] ekstraksi gagal:', e instanceof ProviderError ? e.message : e.message);
    return fallback;
  }
}

// ── Webhook otomasi ────────────────────────────────────────
export async function pushWebhook(url, payload) {
  if (!url) return { status: 'tidak dikonfigurasi' };
  if (!/^https?:\/\//i.test(url)) return { status: 'gagal', reason: 'Alamat webhook harus diawali http:// atau https://' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'Reddie-Sync/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    return r.ok ? { status: 'terkirim' } : { status: 'gagal', reason: 'HTTP ' + r.status };
  } catch (e) {
    return { status: 'gagal', reason: e.name === 'TimeoutError' ? 'tidak merespons dalam 8 detik' : e.message };
  }
}
