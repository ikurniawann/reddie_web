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

export function googleStatus() {
  return { connected: googleReady(), account: ACCOUNT || null, calendar: CALENDAR_ID };
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
export async function createCalendarEvent(m) {
  const token = await accessToken();
  const body = {
    summary: String(m.title || 'Meeting').slice(0, 300),
    description: m.description || 'Dibuat lewat Reddie.',
    start: { dateTime: m.startISO },
    end: { dateTime: m.endISO },
  };
  if (m.guests && m.guests.length) body.attendees = m.guests.map(e => ({ email: e }));

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?sendUpdates=all`,
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
