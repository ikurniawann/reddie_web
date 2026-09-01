// ============================================================
// Integrasi manajemen task (rvc-backstage di ingat.reddie.id).
//
// Seluruh panggilan diperantarai server. Token API TIDAK PERNAH dikirim ke
// browser — kalau ia diletakkan di sisi klien, siapa pun yang membuka
// halaman demo bisa membacanya dari devtools dan memakainya langsung ke
// sistem internal.
//
// Identitas juga dikunci server: nomor "atas nama siapa" diambil dari
// pengaturan, bukan dari permintaan klien. Jadi pengunjung tidak bisa
// menyamar sebagai pengguna lain dengan mengganti satu header.
// ============================================================

import { q } from './db.js';

export class TaskError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

const TIMEOUT = 12_000;

/** Baca konfigurasi: token dari env (rahasia), sisanya dari pengaturan. */
export async function taskConfig() {
  const row = (await q(`SELECT value FROM settings WHERE key='integrations'`)).rows[0];
  const v = row?.value || {};
  return {
    base: String(v.task_base || '').replace(/\/$/, ''),
    phone: String(v.task_phone || '').trim(),
    token: process.env.TASK_API_TOKEN || '',
  };
}

export function taskReady(cfg) {
  return !!(cfg.base && cfg.phone && cfg.token);
}

async function call(cfg, path, { method = 'GET', body } = {}) {
  const res = await fetch(cfg.base + path, {
    method,
    headers: {
      authorization: 'Bearer ' + cfg.token,
      'x-on-behalf-of': cfg.phone,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
  }).catch(e => {
    throw new TaskError(e.name === 'TimeoutError'
      ? 'Sistem task tidak merespons dalam 12 detik.'
      : 'Sistem task tidak terjangkau.', 504);
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const msg = data.error || `Sistem task menolak permintaan (HTTP ${res.status}).`;
    // 401/403 dari sisi sana adalah salah konfigurasi kita, bukan salah
    // pengunjung — dibedakan agar pesan yang tampil tetap masuk akal.
    throw new TaskError(
      res.status === 401 || res.status === 403
        ? 'Kredensial sistem task tidak berlaku. Periksa token dan nomor akun di panel admin.'
        : msg,
      res.status === 401 || res.status === 403 ? 502 : (res.status || 502));
  }
  return data;
}

// Bentuk balasan API bisa berupa {tasks:[...]}, {data:[...]}, atau larik
// langsung. Dinormalkan di satu tempat supaya sisa kode tidak perlu tahu.
function asList(d) {
  if (Array.isArray(d)) return d;
  for (const k of ['tasks', 'data', 'items', 'results']) {
    if (Array.isArray(d?.[k])) return d[k];
  }
  if (Array.isArray(d?.data?.tasks)) return d.data.tasks;
  return [];
}

const norm = (t) => ({
  id: t.id ?? t.taskId ?? null,
  title: String(t.title ?? t.name ?? t.summary ?? '(tanpa judul)').slice(0, 200),
  status: String(t.status ?? t.state ?? '').toLowerCase(),
  done: /done|complete|selesai|closed/.test(String(t.status ?? t.state ?? '').toLowerCase()),
  priority: t.priority ?? t.prioritas ?? null,
  due: t.dueDate ?? t.due_at ?? t.due ?? null,
  assignee: t.assignee?.name ?? t.assigneeName ?? t.owner?.name ?? null,
});

export async function listTasks(cfg) {
  const d = await call(cfg, '/tasks');
  return asList(d).map(norm);
}

export async function createTask(cfg, { title, priority, due }) {
  const t = String(title || '').trim();
  if (!t) throw new TaskError('Judul task wajib diisi.', 400);
  if (t.length > 200) throw new TaskError('Judul task maksimal 200 karakter.', 400);
  const body = { title: t };
  if (priority) body.priority = String(priority).slice(0, 20);
  if (due) body.dueDate = String(due).slice(0, 40);
  const d = await call(cfg, '/tasks', { method: 'POST', body });
  return norm(d.task || d.data || d);
}

export async function updateTask(cfg, id, patch) {
  if (!id) throw new TaskError('ID task tidak dikenali.', 400);
  const body = {};
  if (patch.status) body.status = String(patch.status).slice(0, 30);
  if (patch.title) body.title = String(patch.title).slice(0, 200);
  if (!Object.keys(body).length) throw new TaskError('Tidak ada perubahan yang dikirim.', 400);
  const d = await call(cfg, `/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body });
  return norm(d.task || d.data || d);
}

/** Identitas yang sedang diwakili — dipakai untuk uji koneksi di panel admin. */
export async function whoAmI(cfg) {
  const d = await call(cfg, '/me');
  const u = d.user || d.data || d;
  return { name: u.name ?? null, email: u.email ?? null, role: u.role ?? null };
}
