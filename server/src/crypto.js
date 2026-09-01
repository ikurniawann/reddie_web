// ============================================================
// Harga kripto trending dari CoinGecko.
//
// Tanpa API key. Konsekuensinya kuota bebasnya ketat (sekitar 10-30
// panggilan per menit untuk seluruh server, bukan per pengunjung), jadi
// cache di sini bukan sekadar pengoptimalan — tanpa itu panel akan kena
// 429 begitu beberapa orang membukanya bersamaan.
// ============================================================

const URL_TRENDING = 'https://api.coingecko.com/api/v3/search/trending';
const TTL = 3 * 60 * 1000;          // 3 menit; harga kripto bergerak, tapi tidak sedetik sekali

let cache = null;                   // { at, coins }

export class CryptoError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

// "$311,104,223" -> 311104223. CoinGecko mengirimnya sudah terformat,
// sementara kita perlu angkanya untuk memformat ulang sesuai selera sendiri.
function angka(teks) {
  if (typeof teks === 'number') return teks;
  const n = Number(String(teks || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normalise(c) {
  const it = c.item || c;
  const d = it.data || {};
  const ch = d.price_change_percentage_24h || {};
  return {
    id: it.id,
    name: it.name,
    symbol: String(it.symbol || '').toUpperCase(),
    rank: it.market_cap_rank ?? null,
    logo: it.small || it.thumb || it.large || null,
    price: typeof d.price === 'number' ? d.price : angka(d.price),
    change24h: typeof ch.usd === 'number' ? ch.usd : null,
    marketCap: angka(d.market_cap),
    volume: angka(d.total_volume),
    sparkline: d.sparkline || null,
  };
}

export async function fetchTrending({ limit = 8 } = {}) {
  if (cache && Date.now() - cache.at < TTL) {
    return { coins: cache.coins.slice(0, limit), cached: true, at: cache.at };
  }

  let data;
  try {
    const res = await fetch(URL_TRENDING, {
      headers: { accept: 'application/json', 'user-agent': 'Reddie/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (res.status === 429) throw new CryptoError('Kuota CoinGecko sedang penuh. Coba lagi sebentar.', 429);
    if (!res.ok) throw new CryptoError(`CoinGecko menolak (HTTP ${res.status}).`);
    data = await res.json();
  } catch (e) {
    // Harga lama lebih berguna daripada panel kosong, selama umurnya
    // dinyatakan supaya tidak ada yang mengira itu harga sekarang.
    if (cache) return { coins: cache.coins.slice(0, limit), cached: true, stale: true, at: cache.at };
    throw e instanceof CryptoError ? e
      : new CryptoError(e.name === 'TimeoutError'
          ? 'CoinGecko tidak merespons.' : 'CoinGecko tidak terjangkau.', 504);
  }

  const coins = (data.coins || []).map(normalise).filter(c => c.symbol && c.price != null);
  if (!coins.length) throw new CryptoError('Tidak ada data koin yang terbaca.', 502);
  cache = { at: Date.now(), coins };
  return { coins: coins.slice(0, limit), cached: false, at: cache.at };
}

// ── Tool percakapan ────────────────────────────────────────
export const CRYPTO_TOOL = {
  type: 'function',
  function: {
    name: 'get_trending_crypto',
    description: 'Mengambil daftar kripto yang sedang trending beserta harga dan perubahan 24 jam. Pakai ini bila ditanya soal kripto, harga koin, atau pasar. Laporkan angkanya apa adanya dan sebutkan bahwa ini bukan saran investasi.',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Berapa koin diambil, maksimal 15.' } },
    },
  },
};

export async function runCryptoTool(args = {}) {
  try {
    const r = await fetchTrending({ limit: Math.min(Math.max(Number(args.limit) || 8, 1), 15) });
    return {
      ok: true,
      diperbarui: new Date(r.at).toISOString(),
      basi: !!r.stale,
      koin: r.coins.map(c => ({
        nama: c.name, simbol: c.symbol, peringkat: c.rank,
        harga_usd: c.price, perubahan_24j_persen: c.change24h,
        kapitalisasi_usd: c.marketCap, volume_usd: c.volume,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof CryptoError ? e.message : 'Gagal memuat data kripto.' };
  }
}
