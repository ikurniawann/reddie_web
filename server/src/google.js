// ============================================================
// Google Calendar — kerangka integrasi.
//
// Dipisah dari tasks.js karena kredensialnya beda sumber dan beda daur
// hidup: token Google kedaluwarsa tiap jam dan harus disegarkan sendiri,
// sementara token sistem task berumur panjang.
//
// Belum ada kredensial yang dipasang. Seluruh fungsi di sini menurun
// dengan rapi: googleStatus() melaporkan belum tersambung, dan pemanggilnya
// jatuh ke pencatatan internal alih-alih gagal.
// ============================================================

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN || '';
const CALENDAR_ID   = process.env.GOOGLE_CALENDAR_ID || 'primary';
const ACCOUNT       = process.env.GOOGLE_ACCOUNT || '';

export function googleReady() {
  return !!(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

export function googleStatus(clientId) {
  return {
    // Dua jalur yang berdiri sendiri:
    //  - sso    : pengunjung masuk sendiri, acara masuk ke kalendernya sendiri
    //  - server : refresh token milik pemilik situs, semua acara ke satu kalender
    sso: !!clientId,
    clientId: clientId || null,
    scope: SCOPE,
    server: googleReady(),
    account: ACCOUNT || null,
    calendar: CALENDAR_ID,
  };
}

// Hanya izin membuat & mengubah acara. Sengaja bukan scope 'calendar' penuh,
// supaya Reddie tidak pernah bisa menghapus kalender atau mengubah setelannya.
export const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

// Verifikasi token dari browser sebelum dipakai: memastikan ia benar milik
// aplikasi kita dan lingkupnya memang yang diminta. Tanpa ini, token curian
// dari aplikasi lain bisa dipakai lewat endpoint kita.
export async function verifyAccessToken(token, clientId) {
  const res = await fetch(
    'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(token),
    { signal: AbortSignal.timeout(10_000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Sesi Google tidak berlaku. Masuk ulang.');
  if (clientId && d.aud !== clientId) throw new Error('Token Google bukan milik aplikasi ini.');
  if (!String(d.scope || '').includes('calendar.events')) {
    throw new Error('Izin kalender belum diberikan. Masuk ulang dan setujui aksesnya.');
  }
  return { email: d.email || null, expires: Number(d.expires_in || 0) };
}

// Access token berumur ~1 jam. Disimpan di memori dan disegarkan bila
// tinggal kurang dari satu menit, supaya tidak menukar token tiap panggilan.
let cached = { token: null, expires: 0 };

async function accessToken() {
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) {
    throw new Error(d.error_description || d.error || 'Gagal menyegarkan token Google.');
  }
  cached = { token: d.access_token, expires: Date.now() + (d.expires_in || 3600) * 1000 };
  return cached.token;
}

/**
 * Buat acara di Google Calendar.
 * @param {{title, startISO, endISO, guests: string[], description}} m
 */
export async function createCalendarEvent(m, providedToken) {
  // Token dari pengunjung (SSO) dipakai apa adanya; bila tidak ada, jatuh ke
  // refresh token milik server.
  const token = providedToken || await accessToken();
  const calendar = providedToken ? 'primary' : CALENDAR_ID;
  const body = {
    summary: String(m.title || 'Meeting').slice(0, 300),
    description: m.description || 'Dibuat lewat Reddie.',
    start: { dateTime: m.startISO },
    end: { dateTime: m.endISO },
  };
  if (m.guests && m.guests.length) body.attendees = m.guests.map(e => ({ email: e }));

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events?sendUpdates=all`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Google menolak (HTTP ${res.status}).`);
  return { id: d.id, link: d.htmlLink, start: d.start?.dateTime };
}

/**
 * Ambil acara dari kalender pengunjung.
 * Scope calendar.events sudah mencakup baca-tulis acara, jadi tidak perlu
 * meminta izin tambahan hanya untuk menampilkan daftarnya.
 */
export async function listCalendarEvents(token, { from, to, max = 20 } = {}) {
  const params = new URLSearchParams({
    timeMin: (from || new Date()).toISOString(),
    timeMax: (to || new Date(Date.now() + 30 * 86400000)).toISOString(),
    singleEvents: 'true',          // acara berulang dipecah jadi kejadian nyata
    orderBy: 'startTime',
    maxResults: String(Math.min(max, 50)),
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(15_000) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error?.message || `Google menolak (HTTP ${res.status}).`);

  return (d.items || [])
    .filter(e => e.status !== 'cancelled')
    .map(e => ({
      // Acara sehari-penuh memakai 'date', bukan 'dateTime'.
      date: e.start?.dateTime || (e.start?.date ? e.start.date + 'T00:00:00Z' : null),
      allDay: !e.start?.dateTime && !!e.start?.date,
      title: e.summary || '(tanpa judul)',
      kind: 'meeting',
      source: 'google',
      link: e.htmlLink || null,
      guests: (e.attendees || []).length,
    }))
    .filter(e => e.date);
}
