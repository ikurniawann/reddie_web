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

// Umpan bawaan: media Indonesia yang memberi TAUTAN LANGSUNG ke artikelnya.
// Google News sengaja tidak dipakai lagi sebagai bawaan — tautannya berupa
// pengalih berbasis JavaScript, sehingga server hanya menerima halaman kosong
// dan isi artikel tidak bisa dibaca untuk diringkas.
export const DEFAULT_FEEDS = [
  'https://www.antaranews.com/rss/terkini.xml',
  'https://www.cnnindonesia.com/teknologi/rss',
];

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

// "https://www.cnnindonesia.com/..." -> "cnnindonesia.com"
function namaDomain(link) {
  try { return new URL(link).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

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
    const link = pick(b, /<link>([\s\S]*?)<\/link>/);
    // Ringkasan dari RSS: cukup untuk digest, dan jauh lebih cepat daripada
    // mengambil setiap artikel satu per satu.
    const desc = pick(b, /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/) || '';
    return {
      title,
      link,
      summary: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300),
      // Hanya Google News yang menyediakan tag <source>. Untuk umpan media
      // langsung, nama medianya diturunkan dari domainnya sendiri.
      source: source || namaDomain(link),
      published: d && !isNaN(d) ? d.toISOString() : null,
    };
  }).filter(x => x.title && x.link);
}

async function ambilSatu(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; Reddie/1.0)' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new NewsError(`Sumber berita menolak (HTTP ${res.status}).`);
  return parseRss(await res.text());
}

export async function fetchNews({ query, lang, country, feeds, limit = 8 } = {}) {
  // Daftar umpan langsung diutamakan. Google News hanya dipakai bila
  // pengguna sengaja mengosongkan daftar umpan dan mengisi kata kunci —
  // dengan konsekuensi isi artikelnya tidak bisa dibaca untuk diringkas.
  const daftar = (Array.isArray(feeds) ? feeds : String(feeds || '').split(/[\n,]+/))
    .map(x => String(x).trim()).filter(x => /^https?:\/\//i.test(x));
  const sumber = daftar.length ? daftar : (query ? [buildUrl({ query, lang, country })] : DEFAULT_FEEDS);
  const kunci = sumber.join('|');

  const hit = cache.get(kunci);
  if (hit && Date.now() - hit.at < TTL) return { items: hit.items.slice(0, limit), cached: true };

  const hasil = await Promise.all(sumber.map(u => ambilSatu(u).catch(() => [])));
  let items = hasil.flat();

  if (!items.length) {
    // Bila pernah berhasil, sajikan yang lama daripada mengosongkan panel —
    // berita basi sepuluh menit jauh lebih berguna daripada layar kosong.
    if (hit) return { items: hit.items.slice(0, limit), cached: true, stale: true };
    throw new NewsError('Tidak ada berita yang terbaca dari sumber.', 502);
  }

  // Beberapa umpan memuat berita yang sama; disaring lalu diurutkan terbaru.
  const seen = new Set();
  items = items.filter(n => (seen.has(n.link) ? false : (seen.add(n.link), true)))
               .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  cache.set(kunci, { at: Date.now(), items });
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
      feeds: defaults.feeds,
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

// ── Baca isi artikel ───────────────────────────────────────
// Hanya tautan yang memang berasal dari umpan kita yang boleh diambil.
// Tanpa pembatasan itu, endpoint ini jadi perantara yang bisa disuruh
// mengambil alamat apa pun, termasuk alamat internal jaringan server.
function linkDikenal(link) {
  for (const entry of cache.values()) {
    if (entry.items.some(n => n.link === link)) return true;
  }
  return false;
}

function ambilParagraf(html) {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  const ps = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => unescape(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
    // Paragraf pendek hampir selalu menu, label, atau keterangan foto.
    .filter(t => t.length > 50);
  return [...new Set(ps)].join('\n\n');
}

export async function readArticle(link) {
  if (!/^https?:\/\//i.test(link || '')) throw new NewsError('Tautan berita tidak dikenali.', 400);
  if (!linkDikenal(link)) throw new NewsError('Tautan itu bukan berasal dari daftar berita.', 400);
  const res = await fetch(link, {
    redirect: 'follow',
    headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => { throw new NewsError('Artikel tidak bisa diambil.', 504); });
  if (!res.ok) throw new NewsError(`Situs berita menolak (HTTP ${res.status}).`, 502);
  const teks = ambilParagraf(await res.text());
  if (teks.length < 200) throw new NewsError('Isi artikel tidak terbaca — kemungkinan butuh JavaScript atau berbayar.', 422);
  return teks.slice(0, 8000);
}

export const ARTICLE_TOOL = {
  type: 'function',
  function: {
    name: 'read_news_article',
    description: 'Membaca isi lengkap sebuah berita dari daftar trending, untuk diringkas. Sebutkan judulnya; sistem mencocokkan dengan daftar. Pakai ini SEBELUM meringkas — jangan meringkas hanya dari judul.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string', description: 'Judul berita yang mau dibaca.' } },
      required: ['title'],
    },
  },
};

export async function runArticleTool(args, defaults = {}) {
  try {
    const r = await fetchNews({ feeds: defaults.feeds, query: defaults.query,
                                lang: defaults.lang, country: defaults.country, limit: 20 });
    const w = String(args.title || '').toLowerCase().trim();
    let hit = r.items.find(n => n.title.toLowerCase() === w)
           || r.items.find(n => n.title.toLowerCase().includes(w) || w.includes(n.title.toLowerCase()));
    if (!hit) {
      const kata = w.split(/\s+/).filter(x => x.length > 3);
      let best = null, skor = 0;
      for (const n of r.items) {
        const c = kata.filter(k => n.title.toLowerCase().includes(k)).length;
        if (c > skor) { best = n; skor = c; }
      }
      if (skor >= Math.max(1, Math.ceil(kata.length / 2))) hit = best;
    }
    if (!hit) return { ok: false, error: `Berita "${args.title}" tidak ada di daftar.`,
                       pilihan: r.items.slice(0, 8).map(n => n.title) };
    const isi = await readArticle(hit.link);
    return { ok: true, judul: hit.title, sumber: hit.source, waktu: hit.published,
             tautan: hit.link, isi };
  } catch (e) {
    return { ok: false, error: e instanceof NewsError ? e.message : 'Gagal membaca artikel.' };
  }
}
