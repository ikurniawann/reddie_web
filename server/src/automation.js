// ============================================================
// Peta koneksi + eksekusi workflow n8n.
//
// Setiap titik pada peta diuji sungguhan saat panel dibuka. Diagram yang
// titiknya selalu hijau tidak memberi tahu apa pun — dan begitu satu sistem
// mati saat demo, justru diagram itu yang mempermalukan.
//
// Catatan penting soal n8n: API publiknya TIDAK menyediakan "jalankan
// workflow sekarang". Eksekusi sesuai permintaan dilakukan dengan memanggil
// URL webhook milik workflow tersebut. Jadi kita membaca daftar workflow
// lewat API, lalu mendeteksi mana yang punya node pemicu webhook — hanya
// yang itu yang bisa dijalankan dari sini, dan sisanya dinyatakan apa adanya.
// ============================================================

import { q } from './db.js';
import { providerReady } from './providers.js';
import { taskConfig, taskReady } from './tasks.js';

const N8N_BASE = (process.env.N8N_BASE_URL || 'http://n8n:5678').replace(/\/$/, '');
const N8N_KEY = process.env.N8N_API_KEY || '';
const PING_TIMEOUT = 5000;

export class AutomationError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export const n8nReady = () => !!N8N_KEY;

async function ping(url, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(PING_TIMEOUT), ...opts });
    return { up: r.ok || r.status === 401, ms: Date.now() - t0, code: r.status };
  } catch {
    return { up: false, ms: Date.now() - t0, code: null };
  }
}

/**
 * Uji seluruh koneksi secara paralel. Kegagalan satu sistem tidak boleh
 * menunda atau menggagalkan yang lain.
 */
export async function checkConnections({ googleSignedIn = false } = {}) {
  const cfg = await taskConfig();
  const intg = (await q(`SELECT value FROM settings WHERE key='integrations'`)).rows[0]?.value || {};

  const [tugas, n8n, berita, pasar] = await Promise.all([
    taskReady(cfg)
      ? ping(cfg.base + '/me', { headers: { authorization: 'Bearer ' + cfg.token, 'x-on-behalf-of': cfg.phone } })
      : Promise.resolve({ up: false, ms: 0, code: null }),
    ping(N8N_BASE + '/healthz'),
    ping('https://www.antaranews.com/rss/terkini.xml'),
    ping('https://api.coingecko.com/api/v3/ping'),
  ]);

  return [
    {
      id: 'ai', label: 'Mesin AI', detail: 'DeepSeek',
      up: providerReady('deepseek') || providerReady('anthropic') || providerReady('openai'),
      note: 'Menjawab, meringkas, dan memanggil tool',
    },
    {
      id: 'task', label: 'Sistem Task', detail: 'ingat.reddie.id',
      up: taskReady(cfg) && tugas.up, ms: tugas.ms,
      note: taskReady(cfg) ? 'Baca, buat, ubah, dan tutup task' : 'Belum dikonfigurasi',
    },
    {
      id: 'calendar', label: 'Google Calendar', detail: intg.google_client_id ? 'lewat SSO pengunjung' : 'belum dikonfigurasi',
      up: !!intg.google_client_id && googleSignedIn,
      partial: !!intg.google_client_id && !googleSignedIn,
      note: googleSignedIn ? 'Agenda dan pembuatan meeting' : 'Siap — pengunjung tinggal masuk',
    },
    {
      id: 'n8n', label: 'n8n', detail: 'alur.reddie.id',
      up: n8n.up && n8nReady(), partial: n8n.up && !n8nReady(), ms: n8n.ms,
      note: n8nReady() ? 'Menjalankan workflow otomasi' : 'Terjangkau, tapi API key belum diisi',
    },
    { id: 'news',  label: 'Kanal Berita', detail: 'Antara · CNN', up: berita.up, ms: berita.ms, note: 'Baca dan ringkas artikel' },
    { id: 'market',label: 'Data Pasar',   detail: 'CoinGecko',    up: pasar.up,  ms: pasar.ms,  note: 'Harga kripto trending' },
  ];
}

// ── n8n ────────────────────────────────────────────────────
async function n8nCall(path) {
  if (!n8nReady()) throw new AutomationError('API key n8n belum diisi di berkas .env server.', 503);
  const r = await fetch(N8N_BASE + path, {
    headers: { 'X-N8N-API-KEY': N8N_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => { throw new AutomationError('n8n tidak terjangkau.', 504); });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw new AutomationError('API key n8n ditolak. Periksa nilainya.', 502);
  if (!r.ok) throw new AutomationError(d.message || `n8n menolak (HTTP ${r.status}).`, 502);
  return d;
}

// Cari node pemicu webhook; tanpa itu workflow tidak bisa dijalankan dari luar.
function webhookPath(wf) {
  const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
  const hook = nodes.find(n => String(n.type || '').toLowerCase().includes('webhook'));
  if (!hook) return null;
  const p = hook.parameters?.path;
  return p ? String(p) : null;
}

export async function listWorkflows() {
  const d = await n8nCall('/api/v1/workflows?limit=50');
  const items = Array.isArray(d.data) ? d.data : (Array.isArray(d) ? d : []);
  return items.map(w => {
    const path = webhookPath(w);
    return {
      id: w.id,
      name: w.name || '(tanpa nama)',
      active: !!w.active,
      nodes: Array.isArray(w.nodes) ? w.nodes.length : null,
      runnable: !!path,
      // Alasan tidak bisa dijalankan dinyatakan, bukan sekadar tombol mati
      // tanpa keterangan — itu yang membuat orang mengira fiturnya rusak.
      reason: path ? null : 'Tidak punya pemicu webhook, jadi hanya bisa berjalan dari dalam n8n.',
      path,
    };
  });
}

export async function runWorkflow(id, payload = {}) {
  const list = await listWorkflows();
  const wf = list.find(w => String(w.id) === String(id));
  if (!wf) throw new AutomationError('Workflow tidak ditemukan.', 404);
  if (!wf.runnable) throw new AutomationError(wf.reason, 409);
  if (!wf.active) throw new AutomationError(`Workflow "${wf.name}" sedang nonaktif. Aktifkan dulu di n8n.`, 409);

  const t0 = Date.now();
  const r = await fetch(`${N8N_BASE}/webhook/${encodeURIComponent(wf.path)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: 'reddie', at: new Date().toISOString(), ...payload }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => { throw new AutomationError('Workflow tidak merespons dalam 20 detik.', 504); });

  const teks = await r.text();
  if (!r.ok) throw new AutomationError(`Workflow menolak (HTTP ${r.status}).`, 502);
  let hasil; try { hasil = JSON.parse(teks); } catch { hasil = teks.slice(0, 400); }
  return { ok: true, workflow: wf.name, ms: Date.now() - t0, hasil };
}

// ── Tool percakapan ────────────────────────────────────────
export const AUTOMATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_workflows',
      description: 'Melihat daftar workflow otomasi n8n beserta status aktif dan apakah bisa dijalankan dari sini.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_workflow',
      description: 'Menjalankan sebuah workflow otomasi. Sebutkan namanya. Panggil list_workflows dulu supaya namanya persis. Jalankan HANYA bila pengguna memintanya dengan jelas.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Nama workflow yang mau dijalankan.' } },
        required: ['name'],
      },
    },
  },
];

export async function runAutomationTool(name, args = {}) {
  try {
    if (name === 'list_workflows') {
      const w = await listWorkflows();
      return { ok: true, jumlah: w.length, workflow: w.map(x => ({
        nama: x.name, aktif: x.active, bisa_dijalankan: x.runnable, alasan: x.reason,
      })) };
    }
    if (name === 'run_workflow') {
      const list = await listWorkflows();
      const w = String(args.name || '').toLowerCase().trim();
      const hit = list.find(x => x.name.toLowerCase() === w)
               || list.find(x => x.name.toLowerCase().includes(w) || w.includes(x.name.toLowerCase()));
      if (!hit) return { ok: false, error: `Workflow "${args.name}" tidak ada.`,
                         pilihan: list.map(x => x.name).slice(0, 10) };
      const r = await runWorkflow(hit.id);
      return { ok: true, dijalankan: r.workflow, durasi_ms: r.ms, hasil: r.hasil };
    }
    return { ok: false, error: 'Tool tidak dikenal: ' + name };
  } catch (e) {
    return { ok: false, error: e instanceof AutomationError ? e.message : 'Gagal menghubungi n8n.' };
  }
}
