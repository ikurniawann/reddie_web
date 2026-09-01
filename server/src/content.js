// ============================================================
// Draft, terbit, dan riwayat versi.
//
// Model mentalnya sederhana, dan itu disengaja supaya bisa dijelaskan
// ke orang non-teknis dalam satu kalimat:
//
//   Tabel kerja  = yang sedang Anda sunting  (draft, tidak terlihat publik)
//   Versi terbit = yang dilihat pengunjung
//   Terbitkan    = menyalin draft jadi versi terbit baru
//   Kembalikan   = menyalin versi lama kembali ke draft, lalu menerbitkannya
//
// Riwayat append-only: "kembalikan" tidak pernah menghapus versi sesudahnya,
// ia menambah versi baru. Jadi tidak ada tombol di panel yang bisa
// menghilangkan riwayat secara permanen.
// ============================================================

import crypto from 'node:crypto';
import { q } from './db.js';

// Susun potret konten dari tabel kerja. Daftar model SENGAJA tidak ikut:
// kesiapan provider bergantung API key di environment, jadi mengganti key
// tidak boleh menuntut penerbitan ulang.
export async function buildDraft() {
  const [settings, agents, skills] = await Promise.all([
    q('SELECT key, value FROM settings ORDER BY key'),
    q(`SELECT slug, name, image, description, sort, show_in_dropdown, show_in_carousel
       FROM agents WHERE enabled ORDER BY sort, id`),
    q(`SELECT slug, title, subtitle, description, icon, color, button_label
       FROM skills WHERE enabled ORDER BY sort, id`),
  ]);
  return {
    settings: Object.fromEntries(settings.rows.map(r => [r.key, r.value])),
    agents: agents.rows,
    skills: skills.rows,
  };
}

// Sidik jari stabil: kunci objek diurutkan supaya payload yang isinya sama
// selalu menghasilkan hash sama, apa pun urutan baris dari database.
export function hashPayload(payload) {
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      return Object.keys(v).sort().reduce((o, k) => { o[k] = stable(v[k]); return o; }, {});
    }
    return v;
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex');
}

export async function latestVersion() {
  return (await q('SELECT * FROM content_versions ORDER BY id DESC LIMIT 1')).rows[0] || null;
}

// Konten untuk publik. Bila belum pernah ada penerbitan, jatuh ke draft
// supaya situs tidak pernah tampil kosong — misalnya tepat setelah migrasi.
export async function publishedContent() {
  const v = await latestVersion();
  return v ? v.payload : await buildDraft();
}

export async function publish({ note, by, restoredFrom } = {}) {
  const payload = await buildDraft();
  const hash = hashPayload(payload);
  const last = await latestVersion();
  if (last && last.hash === hash && !restoredFrom) {
    return { published: false, reason: 'Tidak ada perubahan untuk diterbitkan.', version: last };
  }
  const row = (await q(
    `INSERT INTO content_versions (payload, hash, note, restored_from, published_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [JSON.stringify(payload), hash, note || null, restoredFrom || null, by || null]
  )).rows[0];
  return { published: true, version: row };
}

// Tulis payload sebuah versi kembali ke tabel kerja. Ini yang membuat
// "kembalikan" terasa benar bagi editor: draft ikut mundur, sehingga
// menerbitkan lagi tidak diam-diam memunculkan konten yang barusan dibuang.
export async function restoreToDraft(payload) {
  for (const [key, value] of Object.entries(payload.settings || {})) {
    await q(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
  }
  for (const a of payload.agents || []) {
    await q(
      `UPDATE agents SET name=$1, image=$2, description=$3, sort=$4,
        show_in_dropdown=$5, show_in_carousel=$6 WHERE slug=$7`,
      [a.name, a.image, a.description, a.sort, a.show_in_dropdown, a.show_in_carousel, a.slug]
    );
  }
  for (const s of payload.skills || []) {
    await q(
      `UPDATE skills SET title=$1, subtitle=$2, description=$3, icon=$4,
        color=$5, button_label=$6 WHERE slug=$7`,
      [s.title, s.subtitle, s.description, s.icon, s.color, s.button_label, s.slug]
    );
  }
}

// Ringkasan untuk bilah status panel admin.
export async function draftStatus() {
  const draft = await buildDraft();
  const last = await latestVersion();
  return {
    hasChanges: !last || hashPayload(draft) !== last.hash,
    neverPublished: !last,
    lastPublishedAt: last ? last.created_at : null,
    lastPublishedBy: last ? last.published_by : null,
    versionId: last ? last.id : null,
  };
}

// Penerbitan pertama otomatis saat boot, supaya situs tetap tampil setelah
// migrasi menambahkan lapisan versi ini.
export async function ensureInitialVersion() {
  if (await latestVersion()) return;
  const r = await publish({ note: 'Penerbitan awal otomatis saat migrasi', by: 'sistem' });
  if (r.published) console.log('[content] versi awal diterbitkan (#' + r.version.id + ')');
}
