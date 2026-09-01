// ============================================================
// Jembatan kendali agent (Hermes) ke tampilan pengunjung.
//
// PRINSIP KEAMANAN — dibaca dulu sebelum menambah apa pun di sini:
//
// 1. DAFTAR TERTUTUP. Hanya tindakan yang terdaftar di ACTIONS yang
//    diteruskan. Apa pun di luar itu ditolak DI SERVER, bukan diabaikan
//    di browser. Hermes punya akses shell di mesin ini; kalau jembatan
//    meneruskan perintah sembarangan, kalimat pengunjung anonim jadi
//    jalan masuk ke shell tersebut.
//
// 2. PENGUNJUNG YANG MEMULAI. Sesi hanya terbentuk bila pengunjung
//    menekan tombol izin, dan kodenya dibuat di sisi mereka. Tidak ada
//    cara agent "menemukan" tab orang yang tidak mengundangnya.
//
// 3. KEMAMPUAN SENSITIF TETAP DI BALIK IZIN BROWSER. Kamera, mikrofon,
//    layar, dan papan klip hanya bisa DIMINTA; yang memberi izin tetap
//    dialog bawaan browser, dan pengunjung bisa menolak.
//
// 4. BISA DIHENTIKAN SEPIHAK. Pengunjung menutup sesi kapan saja, dan
//    sesi mati sendiri setelah tidak dipakai.
// ============================================================

import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const OPERATOR_TOKEN = process.env.AGENT_BRIDGE_TOKEN || '';
const SESSION_TTL = 30 * 60 * 1000;      // 30 menit
const MAX_SESSIONS = 200;

/** Daftar tindakan yang boleh diminta agent. Tidak ada jalan lain. */
export const ACTIONS = {
  open_menu:    { arg: 'menu',   desc: 'Membuka salah satu menu di kolom kiri.' },
  send_chat:    { arg: 'text',   desc: 'Mengetik dan mengirim satu pesan di kolom chat.' },
  run_workflow: { arg: 'id',     desc: 'Menjalankan workflow otomasi yang aktif.' },
  highlight:    { arg: 'target', desc: 'Menyorot satu bagian antarmuka agar mudah diikuti.' },
  scroll:       { arg: 'target', desc: 'Menggulir panel ke bagian tertentu.' },
  toast:        { arg: 'text',   desc: 'Menampilkan keterangan singkat di layar.' },
  ask_permission: { arg: 'kind', desc: 'Meminta izin browser: camera, microphone, screen, atau clipboard.' },
  capture:      { arg: 'kind',   desc: 'Mengambil satu cuplikan setelah izinnya diberikan.' },
};

// Target sorot/gulir dibatasi nama simbolik, bukan selektor CSS bebas.
// Selektor bebas berarti agent bisa menunjuk elemen apa pun di halaman,
// termasuk yang memuat data pengunjung.
export const TARGETS = ['sidebar', 'panel', 'chat', 'workflow', 'graph', 'input'];
export const PERMISSIONS = ['camera', 'microphone', 'screen', 'clipboard'];
const MENUS = ['chat', 'task', 'schedule', 'investment', 'news', 'automation'];

export class BridgeError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const sessions = new Map();   // kode -> { ws, dibuat, terakhir, izin:Set, log:[] }

const bersihkan = () => {
  const now = Date.now();
  for (const [kode, s] of sessions) {
    if (now - s.terakhir > SESSION_TTL) { try { s.ws.close(); } catch {} sessions.delete(kode); }
  }
};
setInterval(bersihkan, 60_000).unref?.();

/** Validasi satu perintah. Melempar bila tidak sah — tidak pernah "diperbaiki". */
export function validasi(action, arg) {
  const spec = ACTIONS[action];
  if (!spec) throw new BridgeError(`Tindakan "${action}" tidak diizinkan. Yang tersedia: ${Object.keys(ACTIONS).join(', ')}.`);
  const nilai = String(arg ?? '').trim();

  if (action === 'open_menu' && !MENUS.includes(nilai)) {
    throw new BridgeError(`Menu "${nilai}" tidak dikenal. Pilihannya: ${MENUS.join(', ')}.`);
  }
  if ((action === 'highlight' || action === 'scroll') && !TARGETS.includes(nilai)) {
    throw new BridgeError(`Target "${nilai}" tidak dikenal. Pilihannya: ${TARGETS.join(', ')}.`);
  }
  if ((action === 'ask_permission' || action === 'capture') && !PERMISSIONS.includes(nilai)) {
    throw new BridgeError(`Izin "${nilai}" tidak dikenal. Pilihannya: ${PERMISSIONS.join(', ')}.`);
  }
  if ((action === 'send_chat' || action === 'toast')) {
    if (!nilai) throw new BridgeError('Teksnya kosong.');
    if (nilai.length > 500) throw new BridgeError('Teks maksimal 500 karakter.');
  }
  return { action, arg: nilai };
}

export function operatorSiap() { return !!OPERATOR_TOKEN; }

export function cekOperator(header) {
  if (!OPERATOR_TOKEN) throw new BridgeError('Jembatan agent belum dikonfigurasi di server.', 503);
  const t = String(header || '').replace(/^Bearer\s+/i, '');
  // Perbandingan waktu-tetap: token dibandingkan lewat jaringan publik.
  const a = Buffer.from(t.padEnd(64).slice(0, 64));
  const b = Buffer.from(OPERATOR_TOKEN.padEnd(64).slice(0, 64));
  if (!crypto.timingSafeEqual(a, b)) throw new BridgeError('Token operator tidak berlaku.', 401);
}

export function daftarSesi() {
  bersihkan();
  return [...sessions.entries()].map(([kode, s]) => ({
    kode,
    umur_detik: Math.round((Date.now() - s.dibuat) / 1000),
    izin: [...s.izin],
    tindakan: s.log.length,
  }));
}

export function kirimKeSesi(kode, action, arg) {
  bersihkan();
  const s = sessions.get(String(kode || ''));
  if (!s) throw new BridgeError('Sesi tidak ditemukan atau sudah berakhir.', 404);
  const cmd = validasi(action, arg);

  if (cmd.action === 'capture' && !s.izin.has(cmd.arg)) {
    throw new BridgeError(`Izin "${cmd.arg}" belum diberikan pengunjung. Panggil ask_permission dulu.`, 403);
  }

  s.terakhir = Date.now();
  s.log.push({ at: Date.now(), ...cmd });
  if (s.log.length > 100) s.log.shift();
  s.ws.send(JSON.stringify({ type: 'command', ...cmd }));
  return { ok: true, dikirim: cmd };
}

/** Pasang server WebSocket ke server HTTP yang sudah berjalan. */
export function attachBridge(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith('/api/bridge')) return;   // jalur lain dibiarkan
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    // Kode dibuat SERVER, bukan diminta klien: kode tebakan tidak boleh
    // membuat orang lain menempel ke sesi yang bukan miliknya.
    const kode = crypto.randomBytes(3).toString('hex').toUpperCase();
    const s = { ws, dibuat: Date.now(), terakhir: Date.now(), izin: new Set(), log: [] };

    if (sessions.size >= MAX_SESSIONS) bersihkan();
    if (sessions.size >= MAX_SESSIONS) { ws.close(1013, 'Terlalu banyak sesi'); return; }
    sessions.set(kode, s);

    ws.send(JSON.stringify({
      type: 'ready', kode,
      actions: Object.entries(ACTIONS).map(([k, v]) => ({ nama: k, arg: v.arg, keterangan: v.desc })),
    }));

    ws.on('message', (raw) => {
      s.terakhir = Date.now();
      let m; try { m = JSON.parse(String(raw)); } catch { return; }
      // Browser hanya boleh MELAPOR, tidak memerintah apa pun.
      if (m.type === 'permission' && PERMISSIONS.includes(m.kind)) {
        if (m.granted) s.izin.add(m.kind); else s.izin.delete(m.kind);
      }
    });

    ws.on('close', () => sessions.delete(kode));
    ws.on('error', () => sessions.delete(kode));
  });

  return wss;
}
