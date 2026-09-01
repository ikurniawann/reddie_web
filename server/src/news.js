// ============================================================
// Berita trending dari Google News RSS.
//
// Dipilih karena tidak butuh API key maupun pendaftaran, mendukung bahasa
// Indonesia, dan kuotanya tidak membatasi pemakaian sewajarnya.
//
// Balasannya di-cache di memori: panel ini dibuka berulang kali oleh
// pengunjung yang sama, dan berita trending tidak berubah tiap detik.
// Tanpa cache, setiap klik menu jadi satu permintaan keluar.
// ============================================================

const TTL = 10 * 60 * 1000;          // 10 menit
const cache = new Map();             // kunci -> { at, items }

export class NewsError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function buildUrl({ query, lang, country }) {
  const l = (lang || 'id').slice(0, 5);
  const c = (country || 'ID').slice(0, 5);
  const loc = `hl=${encodeURIComponent(l)}&gl=${encodeURIComponent(c)}&ceid=${encodeURIComponent(c)}:${encodeURIComponent(l)}`;
  const q = String(query || '').trim();
  return q
    ? `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${loc}`
    : `https://news.google.com/rss?${loc}`;   // tanpa kata kunci: berita utama
}

// Entitas HTML yang benar-benar muncul di judul RSS. Tidak perlu pustaka
// penuh untuk lima kasus ini.
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
const unescape = (s) => String(s || '')
  .replace(/&(amp|lt|gt|quot|#39|apos);/g, m => ENT[m] || m)
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .trim();

const pick = (block, re) => {
  const m = block.match(re);
  return m ? unescape(m[1]) : null;
};

function parseRss(xml) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return blocks.map(b => {
    let title = pick(b, /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || '';
    const source = pick(b, /<source[^>]*>([\s\S]*?)<\/source>/);
    // Google menempelkan " - Nama Media" di akhir judul. Sumbernya sudah
    // ditampilkan terpisah, jadi pengulangan itu dibuang.
    if (source && title.endsWith(' - ' + source)) {
      title = title.slice(0, -(source.length + 3)).trim();
    }
    const dateStr = pick(b, /<pubDate>([\s\S]*?)<\/pubDate>/);
    const d = dateStr ? new Date(dateStr) : null;
    return {
      title,
      link: pick(b, /<link>([\s\S]*?)<\/link>/),
      source: source || null,
      published: d && !isNaN(d) ? d.toISOString() : null,
    };
  }).filter(x => x.title && x.link);
}

export async function fetchNews({ query, lang, country, limit = 8 } = {}) {
  const url = buildUrl({ query, lang, country });
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return { items: hit.items.slice(0, limit), cached: true };

  let xml;
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; Reddie/1.0)' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new NewsError(`Google News menolak (HTTP ${res.status}).`);
    xml = await res.text();
  } catch (e) {
    // Bila pernah berhasil, sajikan yang lama daripada mengosongkan panel —
    // berita basah sepuluh menit jauh lebih berguna daripada layar kosong.
    if (hit) return { items: hit.items.slice(0, limit), cached: true, stale: true };
    throw e instanceof NewsError ? e
      : new NewsError(e.name === 'TimeoutError'
          ? 'Sumber berita tidak merespons.' : 'Sumber berita tidak terjangkau.', 504);
  }

  const items = parseRss(xml);
  if (!items.length) throw new NewsError('Tidak ada berita yang terbaca dari sumber.', 502);
  cache.set(url, { at: Date.now(), items });
  if (cache.size > 20) cache.delete(cache.keys().next().value);   // jaga memori
  return { items: items.slice(0, limit), cached: false };
}

// ── Tool percakapan ────────────────────────────────────────
export const NEWS_TOOL = {
  type: 'function',
  function: {
    name: 'get_trending_news',
    description: 'Mengambil berita terbaru. Pakai ini bila pengguna bertanya tentang berita, tren, atau apa yang sedang ramai. Selalu sebutkan sumber dan waktunya saat melaporkan, dan JANGAN mengarang judul yang tidak ada di hasil.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kata kunci topik. Kosongkan untuk memakai topik bawaan situs.' },
        limit: { type: 'integer', description: 'Berapa judul diambil, maksimal 20.' },
      },
    },
  },
};

export async function runNewsTool(args, defaults = {}) {
  try {
    const r = await fetchNews({
      query: args.query || defaults.query,
      lang: defaults.lang,
      country: defaults.country,
      limit: Math.min(Math.max(Number(args.limit) || 8, 1), 20),
    });
    return {
      ok: true,
      topik: args.query || defaults.query || 'berita utama',
      berita: r.items.map(n => ({
        judul: n.title, sumber: n.source, waktu: n.published, tautan: n.link,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof NewsError ? e.message : 'Gagal memuat berita.' };
  }
}
