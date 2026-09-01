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
import { googleReady, createCalendarEvent, verifyAccessToken, listCalendarEvents } from './google.js';

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
    eventId: String(v.task_event_id || '').trim(),
    googleClientId: String(v.google_client_id || '').trim(),
    divisionId: String(v.task_division_id || '').trim(),
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
  done: /^(done|cancelled)$/.test(String(t.status ?? t.state ?? '').toLowerCase()),
  priority: t.priority ?? t.prioritas ?? null,
  due: t.dueDate ?? t.due_at ?? t.due ?? null,
  assignee: t.assignee?.name ?? t.assigneeName ?? t.owner?.name ?? null,
});

// Task di sistem ini terikat pada EVENT, dan ?mine=1 hanya mengembalikan
// yang ditugaskan ke pemilik token. Untuk menampilkan "yang sedang berjalan"
// secara utuh, daftar event ditelusuri lalu task tiap event digabung.
export async function listEvents(cfg) {
  const d = await call(cfg, '/events');
  return asList(d).map(e => ({ id: e.id, name: e.name || e.title || '' })).filter(e => e.id);
}

// Daftar resmi dari API. Divalidasi di sini supaya kesalahan tertangkap
// sebelum permintaan dikirim, dengan pesan yang menyebut pilihannya.
export const STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const CLOSED = /^(done|cancelled)$/;

export async function listTasks(cfg, { limit = 5, onlyRunning = true } = {}) {
  // Bila sebuah event dipilih di pengaturan, HANYA event itu yang dibaca —
  // ini yang menjaga proyek lain tidak ikut terlihat di halaman publik.
  const all = await listEvents(cfg);
  const events = cfg.eventId
    ? all.filter(e => e.id === cfg.eventId)
    : all.slice(0, 12);
  const perEvent = await Promise.all(events.map(async (ev) => {
    try {
      const d = await call(cfg, `/tasks?eventId=${encodeURIComponent(ev.id)}`);
      return asList(d).map(t => ({ ...norm(t), eventId: ev.id, eventName: ev.name }));
    } catch {
      return [];   // satu event bermasalah tidak boleh mengosongkan panel
    }
  }));

  const all0 = perEvent.flat();
  const doneCount = all0.filter(t => CLOSED.test(t.status)).length;
  // "Berjalan" = apa pun yang belum ditutup. Menyebut daftar status yang
  // boleh tampil terbukti rapuh: status baru di sisi sana langsung hilang
  // dari panel tanpa ada yang sadar.
  let allT = onlyRunning ? all0.filter(t => !CLOSED.test(t.status)) : all0;

  // Yang paling dekat tenggatnya lebih dulu; tanpa tenggat ditaruh belakangan.
  allT.sort((x, y) => {
    if (!x.due && !y.due) return 0;
    if (!x.due) return 1;
    if (!y.due) return -1;
    return new Date(x.due) - new Date(y.due);
  });
  return {
    tasks: allT.slice(0, limit),
    running: allT.length,
    done: doneCount,
    total: all0.length,
    events,
  };
}

export async function createTask(cfg, { title, priority, due, eventId, divisionId }) {
  const t = String(title || '').trim();
  if (!t) throw new TaskError('Judul task wajib diisi.', 400);
  if (t.length > 200) throw new TaskError('Judul task maksimal 200 karakter.', 400);

  // eventId & divisionId wajib bagi API. Bila tidak dikonfigurasi, event
  // pertama dipakai supaya tombol tetap berfungsi tanpa setup tambahan.
  let ev = eventId || cfg.eventId;
  if (!ev) {
    const events = await listEvents(cfg);
    if (!events.length) throw new TaskError('Belum ada event di sistem task, jadi task baru tidak bisa ditempatkan.', 409);
    ev = events[0].id;
  }
  const body = {
    eventId: ev,
    divisionId: divisionId || cfg.divisionId || 'finance',
    title: t,
  };
  if (priority) body.priority = String(priority).slice(0, 20);
  if (due) body.dueDate = String(due).slice(0, 40);
  const d = await call(cfg, '/tasks', { method: 'POST', body });
  return norm(d.task || d.data || d);
}

export async function updateTask(cfg, id, patch) {
  if (!id) throw new TaskError('ID task tidak dikenali.', 400);
  const body = {};
  if (patch.status) {
    const st = String(patch.status).toLowerCase();
    if (!STATUSES.includes(st)) {
      throw new TaskError(`Status "${patch.status}" tidak dikenal. Pilihannya: ${STATUSES.join(', ')}.`, 400);
    }
    body.status = st;
  }
  if (patch.priority) {
    const pr = String(patch.priority).toLowerCase();
    if (!PRIORITIES.includes(pr)) {
      throw new TaskError(`Prioritas "${patch.priority}" tidak dikenal. Pilihannya: ${PRIORITIES.join(', ')}.`, 400);
    }
    body.priority = pr;
  }
  if (patch.title) body.title = String(patch.title).slice(0, 200);
  if (patch.due !== undefined) body.dueDate = patch.due === null ? null : String(patch.due).slice(0, 40);
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

// ============================================================
// Tool untuk percakapan — supaya pengunjung bisa mengelola task
// dengan mengetik, bukan lewat tombol.
// ============================================================

export const TASK_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Melihat SELURUH task yang sedang berjalan, diurutkan dari tenggat terdekat. Bawaannya mengambil semua, bukan hanya beberapa teratas. Pakai ini sebelum menjawab pertanyaan tentang task, dan sebelum menandai selesai supaya tahu judul persisnya.',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Berapa task yang diambil. Kosongkan untuk mengambil semua (maksimal 50).' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Membuat task baru. Gunakan hanya bila pengguna jelas meminta task dibuat.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Judul task, ringkas dan jelas.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due: { type: 'string', description: 'Tenggat format ISO, misalnya 2026-09-15T09:00:00Z. Kosongkan bila tidak disebut.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Mengubah task yang sudah ada: judul, status, prioritas, atau tenggat. Sebutkan judul task yang mau diubah.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Judul task yang mau diubah, untuk mencarinya.' },
          new_title: { type: 'string', description: 'Judul baru, bila judulnya yang diubah.' },
          status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due: { type: 'string', description: 'Tenggat baru format ISO, misalnya 2026-09-15T09:00:00Z.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_task',
      description: 'Membatalkan sebuah task. Sistem task tidak mendukung penghapusan permanen, jadi task ditandai cancelled dan hilang dari daftar berjalan. Katakan ini ke pengguna bila ia meminta hapus.',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: 'Judul task yang mau dibatalkan.' } },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_meeting',
      description: 'Menjadwalkan meeting. Bila pengguna sudah masuk dengan Google, acaranya dibuat di Google Calendar miliknya. Bila belum, meeting dicatat sebagai jadwal internal dan kamu HARUS mengatakan itu.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Judul meeting.' },
          start: { type: 'string', description: 'Waktu mulai format ISO lengkap dengan zona, misalnya 2026-09-05T10:00:00+07:00. Hitung sendiri dari kata seperti "besok jam 10" memakai waktu sekarang yang diberikan.' },
          duration_min: { type: 'integer', description: 'Durasi dalam menit. Bawaannya 60.' },
          guests: { type: 'string', description: 'Email peserta dipisah koma, bila disebut.' },
        },
        required: ['title', 'start'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_task',
      description: 'Menandai sebuah task selesai. Sebutkan judulnya; sistem akan mencocokkan dengan task yang sedang berjalan.',
      parameters: {
        type: 'object',
        properties: { title: { type: 'string', description: 'Judul task yang mau ditandai selesai.' } },
        required: ['title'],
      },
    },
  },
];

// Cocokkan judul yang diketik pengguna dengan task nyata. Model kerap
// menuliskan judul yang mirip tapi tidak persis, jadi pencocokan bertingkat:
// sama persis -> mengandung -> tumpang tindih kata terbanyak.
function matchTask(tasks, wanted) {
  const w = String(wanted || '').toLowerCase().trim();
  if (!w) return null;
  const exact = tasks.find(t => t.title.toLowerCase() === w);
  if (exact) return exact;
  const part = tasks.find(t => t.title.toLowerCase().includes(w) || w.includes(t.title.toLowerCase()));
  if (part) return part;
  const words = w.split(/\s+/).filter(x => x.length > 2);
  let best = null, bestScore = 0;
  for (const t of tasks) {
    const tl = t.title.toLowerCase();
    const score = words.filter(x => tl.includes(x)).length;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return bestScore >= Math.max(1, Math.ceil(words.length / 2)) ? best : null;
}

/** Jalankan satu panggilan tool dari model. Selalu mengembalikan objek biasa. */
export async function runTaskTool(cfg, name, args, ctx = {}) {
  try {
    if (name === 'list_tasks') {
      // Bawaan sengaja besar: model harus melihat seluruh task berjalan,
      // bukan hanya beberapa teratas seperti panel. Kalau daftarnya
      // terpotong, model menyimpulkan task yang ada sebagai tidak ada.
      const r = await listTasks(cfg, { limit: Math.min(Math.max(Number(args.limit || 50), 1), 50) });
      return {
        ok: true, berjalan: r.running, selesai: r.done, total: r.total,
        tasks: r.tasks.map(t => ({
          judul: t.title, event: t.eventName, status: t.status,
          prioritas: t.priority, tenggat: t.due,
        })),
      };
    }
    if (name === 'create_task') {
      const t = await createTask(cfg, { title: args.title, priority: args.priority, due: args.due });
      return { ok: true, dibuat: t.title || args.title };
    }
    if (name === 'create_meeting') {
      const r = await createMeeting(cfg, {
        title: args.title, start: args.start, guests: args.guests,
        durationMin: Number(args.duration_min) || 60,
        googleToken: ctx.googleToken,
      });
      return r;
    }
    if (name === 'update_task' || name === 'cancel_task') {
      const r = await listTasks(cfg, { limit: 50 });
      const hit = matchTask(r.tasks, args.title);
      if (!hit) {
        return { ok: false,
          error: `Tidak ada task berjalan yang cocok dengan "${args.title}".`,
          pilihan: r.tasks.slice(0, 10).map(t => t.title) };
      }
      if (name === 'cancel_task') {
        await updateTask(cfg, hit.id, { status: 'cancelled' });
        return { ok: true, dibatalkan: hit.title,
          catatan: 'Task ditandai cancelled, bukan dihapus permanen — sistem task tidak menyediakan penghapusan.' };
      }
      await updateTask(cfg, hit.id, {
        title: args.new_title, status: args.status, priority: args.priority,
        ...(args.due !== undefined ? { due: args.due } : {}),
      });
      return { ok: true, diubah: hit.title, menjadi: {
        judul: args.new_title || undefined, status: args.status || undefined,
        prioritas: args.priority || undefined, tenggat: args.due || undefined } };
    }
    if (name === 'complete_task') {
      const r = await listTasks(cfg, { limit: 50 });
      const hit = matchTask(r.tasks, args.title);
      if (!hit) {
        return { ok: false,
          error: `Tidak ada task berjalan yang cocok dengan "${args.title}".`,
          pilihan: r.tasks.slice(0, 8).map(t => t.title) };
      }
      await updateTask(cfg, hit.id, { status: 'done' });
      return { ok: true, selesai: hit.title };
    }
    return { ok: false, error: 'Tool tidak dikenal: ' + name };
  } catch (e) {
    // Kegagalan dikembalikan sebagai data, bukan dilempar — model perlu
    // membacanya supaya bisa menjelaskan ke pengguna alih-alih diam.
    return { ok: false, error: e instanceof TaskError ? e.message : 'Gagal menghubungi sistem task.' };
  }
}

// ── Jadwal & meeting ───────────────────────────────────────

/**
 * Jadwal dari Google Calendar pengunjung.
 *
 * Kalender internal sistem task sengaja TIDAK ikut: yang relevan bagi
 * pengunjung adalah agendanya sendiri, bukan tenggat dan show day proyek
 * orang lain. Tanpa token, daftarnya memang kosong — itu keadaan yang
 * benar, bukan kegagalan.
 */
export async function listSchedule(cfg, googleToken) {
  if (!googleToken) return [];
  try {
    return await listCalendarEvents(googleToken);
  } catch {
    return [];   // sesi Google kedaluwarsa: panel menawarkan masuk ulang
  }
}

/**
 * Buat meeting. Bila Google tersambung, acaranya masuk ke Google Calendar.
 * Bila belum, meeting tetap dicatat sebagai task bertenggat di sistem task —
 * jadi tombolnya tidak pernah menjadi tombol mati.
 */
export async function createMeeting(cfg, { title, start, guests, durationMin = 60, googleToken }) {
  const t = String(title || '').trim();
  if (!t) throw new TaskError('Judul meeting wajib diisi.', 400);

  const startDate = new Date(start);
  if (!start || isNaN(startDate)) {
    throw new TaskError('Waktu meeting tidak terbaca. Contoh yang benar: 2026-09-05T10:00.', 400);
  }
  const endDate = new Date(startDate.getTime() + durationMin * 60000);
  const emails = String(guests || '')
    .split(/[,\s;]+/).map(x => x.trim()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));

  // Token pengunjung (SSO) diutamakan: acaranya masuk ke kalender dia sendiri,
  // bukan ke kalender bersama milik pemilik situs.
  if (googleToken) {
    let who = null;
    try { who = await verifyAccessToken(googleToken, cfg.googleClientId); }
    catch (e) { throw new TaskError(e.message, 401); }
    const ev = await createCalendarEvent({
      title: t, startISO: startDate.toISOString(), endISO: endDate.toISOString(),
      guests: emails, description: 'Dibuat lewat Reddie.',
    }, googleToken);
    return { ok: true, google: true, sso: true, akun: who.email, id: ev.id, link: ev.link,
             mulai: startDate.toISOString(), peserta: emails.length };
  }

  if (googleReady()) {
    const ev = await createCalendarEvent({
      title: t, startISO: startDate.toISOString(), endISO: endDate.toISOString(),
      guests: emails, description: 'Dibuat lewat Reddie.',
    });
    return { ok: true, google: true, sso: false, id: ev.id, link: ev.link,
             mulai: startDate.toISOString(), peserta: emails.length };
  }

  // Tanpa Google: dicatat internal supaya tetap ada jejaknya.
  const task = await createTask(cfg, {
    title: `Meeting: ${t}`,
    priority: 'medium',
    due: startDate.toISOString(),
  });
  return { ok: true, google: false, dicatat_sebagai: task.title || `Meeting: ${t}`,
           mulai: startDate.toISOString(), peserta: emails.length,
           catatan: 'Google Calendar belum tersambung, jadi meeting dicatat sebagai jadwal internal.' };
}
