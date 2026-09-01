import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { q } from './db.js';
import { complete, providerReady, ProviderError } from './providers.js';
import { fieldSchema, TABLES, ICONS, stripPrivate } from './fields.js';
import { processUpload, removeFile, MediaError, MAX_UPLOAD } from './media.js';
import { publishedContent, buildDraft, publish, latestVersion, restoreToDraft, draftStatus } from './content.js';
import { transcriptFor, buildPDF, buildXLSX, extractTicket, pushWebhook, SkillError } from './skills.js';
import { extractText, ExtractError, MAX_ATTACH_BYTES, MAX_PER_SESSION } from './extract.js';
import { taskConfig, taskReady, listTasks, createTask, updateTask, whoAmI, TaskError } from './tasks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAT_MAX_PER_SESSION = Number(process.env.CHAT_MAX_PER_SESSION || 20);
const CHAT_MAX_PER_IP_HOUR = Number(process.env.CHAT_MAX_PER_IP_HOUR || 60);
const CHAT_MAX_TOKENS      = Number(process.env.CHAT_MAX_TOKENS || 1024);
const JWT_SECRET = process.env.JWT_SECRET;

export function buildApp() {
  if (!JWT_SECRET) throw new Error('JWT_SECRET wajib diisi');
  const app = express();
  app.set('trust proxy', true); // di belakang nginx + Cloudflare
  app.use(express.json({ limit: '64kb' }));

  const clientIp = (req) => req.headers['cf-connecting-ip'] || req.ip;

  // ── Rate limit per-IP sederhana (in-memory, jendela per jam) ──
  const ipHits = new Map();
  function rateLimited(ip) {
    const now = Date.now();
    let e = ipHits.get(ip);
    if (!e || now - e.start > 3600_000) { e = { start: now, n: 0 }; ipHits.set(ip, e); }
    e.n += 1;
    if (ipHits.size > 10_000) { // jaga memori
      for (const [k, v] of ipHits) if (now - v.start > 3600_000) ipHits.delete(k);
    }
    return e.n > CHAT_MAX_PER_IP_HOUR;
  }

  // ── Auth middleware admin ──
  function requireAdmin(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { req.admin = jwt.verify(token, JWT_SECRET); next(); }
    catch { return res.status(401).json({ error: 'Token tidak valid/kedaluwarsa' }); }
  }

  // ═══════════════ PUBLIK ═══════════════

  app.get('/api/health', async (_req, res) => {
    await q('SELECT 1');
    res.json({ ok: true });
  });

  // Seluruh konten CMS untuk hidrasi landing page.
  // Bawaan: versi TERBIT terakhir. Dengan ?draft=1 + token admin: isi tabel
  // kerja apa adanya, dipakai pratinjau sebelum diterbitkan.
  app.get('/api/content', async (req, res) => {
    const wantDraft = req.query.draft === '1';
    let draftOk = false;
    if (wantDraft) {
      const h = req.headers.authorization || '';
      const t = h.startsWith('Bearer ') ? h.slice(7) : null;
      try { if (t) { jwt.verify(t, JWT_SECRET); draftOk = true; } } catch { /* diabaikan */ }
    }

    const raw = draftOk ? await buildDraft() : await publishedContent();
    // Admin yang sudah login boleh melihat field rahasia (ia yang mengisinya);
    // pengunjung tidak pernah.
    const content = draftOk ? raw : { ...raw, settings: stripPrivate(raw.settings) };
    // Model dihitung langsung, tidak ikut dipotret: kesiapan provider
    // bergantung API key di environment, bukan pada isi konten.
    const models = (await q(
      'SELECT provider, model_id, label, is_default FROM ai_models WHERE enabled ORDER BY sort, id'
    )).rows.filter(m => providerReady(m.provider));

    res.set('cache-control', draftOk ? 'no-store' : 'public, max-age=60');
    res.json({ ...content, models, draft: draftOk });
  });

  // Chat multi-provider. Riwayat disimpan & dimuat dari DB (klien tidak dipercaya).
  app.post('/api/chat', async (req, res) => {
    const ip = String(clientIp(req));
    if (rateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });

    const { sessionId, agent, model, message } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'message wajib diisi' });
    if (message.length > 2000) return res.status(400).json({ error: 'Pesan terlalu panjang (maks 2000 karakter)' });

    // Model: pilihan klien harus terdaftar & aktif; selain itu pakai default
    const mRow = (await q(
      `SELECT provider, model_id FROM ai_models WHERE enabled AND ($1::text IS NULL OR model_id=$1)
       ORDER BY (model_id=$1) DESC, is_default DESC, sort LIMIT 1`, [model || null])).rows[0];
    if (!mRow) return res.status(503).json({ error: 'Tidak ada model AI yang aktif' });
    if (!providerReady(mRow.provider)) return res.status(503).json({ error: `Provider ${mRow.provider} belum dikonfigurasi` });

    const aRow = (await q(
      `SELECT slug, system_prompt FROM agents WHERE enabled AND slug = coalesce($1, 'reddie') LIMIT 1`,
      [agent ? String(agent).toLowerCase() : null])).rows[0]
      || (await q(`SELECT slug, system_prompt FROM agents WHERE enabled ORDER BY sort LIMIT 1`)).rows[0];
    if (!aRow) return res.status(503).json({ error: 'Tidak ada agent yang aktif' });

    // Sesi: buat baru atau lanjutkan
    let sid = null;
    if (sessionId && /^[0-9a-f-]{36}$/i.test(String(sessionId))) {
      const s = await q('SELECT id FROM chat_sessions WHERE id=$1', [sessionId]);
      if (s.rowCount) sid = sessionId;
    }
    if (!sid) {
      sid = (await q(
        `INSERT INTO chat_sessions (agent_slug, model_id, ip, user_agent) VALUES ($1,$2,$3,$4) RETURNING id`,
        [aRow.slug, mRow.model_id, ip, String(req.headers['user-agent'] || '').slice(0, 300)])).rows[0].id;
    }

    const { rows: [{ n }] } = await q(
      `SELECT count(*)::int AS n FROM chat_messages WHERE session_id=$1 AND role='user'`, [sid]);
    if (n >= CHAT_MAX_PER_SESSION) {
      return res.status(429).json({ error: `Batas demo ${CHAT_MAX_PER_SESSION} pesan per sesi tercapai.`, sessionId: sid });
    }

    await q(`INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user',$2)`, [sid, message]);
    const history = (await q(
      `SELECT role, content FROM chat_messages WHERE session_id=$1 AND role IN ('user','assistant')
       ORDER BY id DESC LIMIT 12`, [sid])).rows.reverse();

    // Sisipkan isi lampiran ke instruksi sistem. Dibatasi agar dokumen
    // panjang tidak menghabiskan jatah token — sisanya dipotong, dan
    // pemotongan itu dinyatakan supaya model tidak menyimpulkan dari
    // dokumen yang ia kira utuh padahal tidak.
    const atts = (await q(
      `SELECT filename, method, pages, chars, content FROM attachments
       WHERE session_id=$1 ORDER BY id`, [sid])).rows;
    let system = aRow.system_prompt;
    if (atts.length) {
      const BUDGET = 12000;
      const per = Math.floor(BUDGET / atts.length);
      const blocks = atts.map(a => {
        const body = a.content.slice(0, per);
        const cut = a.content.length > body.length;
        return `--- BERKAS: ${a.filename} (${a.method}${a.pages ? ', ' + a.pages + ' halaman' : ''}, ` +
               `${a.chars} karakter)${cut ? ' — DIPOTONG, hanya bagian awal yang ditampilkan' : ''} ---\n${body}`;
      });
      system += `\n\nPengunjung melampirkan ${atts.length} berkas. Isinya di bawah ini. ` +
        `Jawab berdasarkan isi berkas bila pertanyaannya menyangkut berkas tersebut. ` +
        `Jangan mengarang isi yang tidak ada di sana; bila ditanya bagian yang terpotong, katakan terus terang.\n\n` +
        blocks.join('\n\n');
    }

    try {
      const { text } = await complete(mRow.provider, {
        modelId: mRow.model_id,
        system: system,
        messages: history.map(m => ({ role: m.role, content: m.content })),
        maxTokens: CHAT_MAX_TOKENS,
      });
      const reply = text || '(jawaban kosong)';
      await q(`INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'assistant',$2)`, [sid, reply]);
      res.json({ sessionId: sid, reply, model: mRow.model_id, agent: aRow.slug });
    } catch (e) {
      const status = e instanceof ProviderError ? e.status : 502;
      console.error('[chat]', e.message);
      res.status(status).json({ error: 'Layanan AI sedang tidak tersedia. Coba lagi sebentar.', sessionId: sid });
    }
  });

  // ═══════════════ TASK FOCUS ═══════════════
  // Perantara ke sistem task. Token dan identitas ditentukan server, jadi
  // pengunjung tidak bisa mengarahkan panggilan ini ke akun lain.

  const taskGuard = (fn) => async (req, res) => {
    const ip = String(clientIp(req));
    if (rateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    try {
      const cfg = await taskConfig();
      if (!taskReady(cfg)) {
        return res.status(503).json({ error: 'Panel task belum dikonfigurasi.', configured: false });
      }
      await fn(cfg, req, res);
    } catch (e) {
      if (e instanceof TaskError) return res.status(e.status).json({ error: e.message });
      console.error('[task]', e);
      res.status(500).json({ error: 'Gagal menghubungi sistem task.' });
    }
  };

  app.get('/api/tasks', taskGuard(async (cfg, _req, res) => {
    const tasks = await listTasks(cfg);
    res.set('cache-control', 'no-store');
    res.json({ configured: true, tasks });
  }));

  app.post('/api/tasks', taskGuard(async (cfg, req, res) => {
    const t = await createTask(cfg, {
      title: req.body?.title,
      priority: req.body?.priority,
      due: req.body?.due,
    });
    res.status(201).json({ task: t });
  }));

  app.patch('/api/tasks/:id', taskGuard(async (cfg, req, res) => {
    const t = await updateTask(cfg, req.params.id, { status: req.body?.status, title: req.body?.title });
    res.json({ task: t });
  }));

  // ═══════════════ LAMPIRAN ═══════════════
  // Teks hasil ekstraksi disimpan; berkas aslinya TIDAK. Unggahan dari
  // pengunjung anonim akan menumpuk tanpa batas, dan menyajikannya kembali
  // dari domain sendiri membuka jalur phishing yang tidak perlu ada.

  app.post('/api/attachments',
    express.raw({ type: () => true, limit: MAX_ATTACH_BYTES }),
    async (req, res) => {
      const ip = String(clientIp(req));
      if (rateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
      try {
        // Melampirkan berkas sebelum mengetik apa pun adalah urutan yang wajar,
        // jadi sesi dibuat di sini bila belum ada — bukan menolak pengunjung.
        let sessionId = String(req.headers['x-session'] || '');
        if (/^[0-9a-f-]{36}$/i.test(sessionId)) {
          const sess = await q('SELECT id FROM chat_sessions WHERE id=$1', [sessionId]);
          if (!sess.rowCount) sessionId = '';
        } else sessionId = '';

        if (!sessionId) {
          const a = (await q(`SELECT slug FROM agents WHERE enabled ORDER BY sort LIMIT 1`)).rows[0];
          const m = (await q(`SELECT model_id FROM ai_models WHERE enabled ORDER BY is_default DESC, sort LIMIT 1`)).rows[0];
          sessionId = (await q(
            `INSERT INTO chat_sessions (agent_slug, model_id, ip, user_agent) VALUES ($1,$2,$3,$4) RETURNING id`,
            [a?.slug || null, m?.model_id || null, ip,
             String(req.headers['user-agent'] || '').slice(0, 300)])).rows[0].id;
        }

        const { rows: [{ n }] } = await q(
          'SELECT count(*)::int AS n FROM attachments WHERE session_id=$1', [sessionId]);
        if (n >= MAX_PER_SESSION) {
          return res.status(429).json({ error: `Maksimal ${MAX_PER_SESSION} lampiran per percakapan.` });
        }

        const name = decodeURIComponent(String(req.headers['x-filename'] || 'berkas')).slice(0, 200);
        const r = await extractText(req.body, name);
        const row = (await q(
          `INSERT INTO attachments (session_id, filename, mime, bytes, method, pages, chars, content)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, filename, method, pages, chars, bytes`,
          [sessionId, name, String(req.headers['content-type'] || 'application/octet-stream').slice(0, 100),
           req.body.length, r.method, r.pages, r.chars, r.text])).rows[0];

        res.status(201).json({ ...row, sessionId, truncated: r.truncated,
          preview: r.text.slice(0, 220).replace(/\s+/g, ' ') });
      } catch (e) {
        if (e instanceof ExtractError) return res.status(e.status).json({ error: e.message });
        console.error('[attachment]', e);
        res.status(500).json({ error: 'Berkas gagal diproses. Coba format lain.' });
      }
    });

  app.get('/api/attachments', async (req, res) => {
    const sessionId = String(req.query.sessionId || '');
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return res.json([]);
    res.json((await q(
      `SELECT id, filename, method, pages, chars, bytes, created_at
       FROM attachments WHERE session_id=$1 ORDER BY id`, [sessionId])).rows);
  });

  // ═══════════════ AI SKILLS ═══════════════
  // Publik: pemanggilnya adalah pengunjung yang memegang sessionId percakapan
  // miliknya sendiri. UUID itu yang berperan sebagai kunci akses.

  const skillGuard = (fn) => async (req, res) => {
    const ip = String(clientIp(req));
    if (rateLimited(ip)) return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    try { await fn(req, res); }
    catch (e) {
      if (e instanceof SkillError) return res.status(e.status).json({ error: e.message });
      console.error('[skill]', e);
      res.status(500).json({ error: 'Gagal memproses. Coba lagi sebentar.' });
    }
  };

  app.post('/api/skills/pdf', skillGuard(async (req, res) => {
    const t = await transcriptFor(req.body?.sessionId);
    const buf = await buildPDF(t);
    res.set({
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="reddie-transkrip-${String(t.session.id).slice(0, 8)}.pdf"`,
      'content-length': buf.length,
    }).send(buf);
  }));

  app.post('/api/skills/xlsx', skillGuard(async (req, res) => {
    const t = await transcriptFor(req.body?.sessionId);
    const buf = await buildXLSX(t);
    res.set({
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="reddie-transkrip-${String(t.session.id).slice(0, 8)}.xlsx"`,
      'content-length': buf.length,
    }).send(buf);
  }));

  // Sync: AI membaca percakapan, hasilnya jadi tiket di tabel leads, lalu
  // dikirim ke webhook otomasi bila alamatnya sudah diisi lewat CMS.
  app.post('/api/skills/sync', skillGuard(async (req, res) => {
    const { session, messages } = await transcriptFor(req.body?.sessionId);

    const modelRow = (await q(
      `SELECT provider, model_id FROM ai_models WHERE enabled
       ORDER BY (model_id = $1) DESC, is_default DESC, sort LIMIT 1`, [session.model_id])).rows[0];
    const info = await extractTicket(messages, modelRow);

    const lead = (await q(
      `INSERT INTO leads (name, email, message, source, meta)
       VALUES ($1,$2,$3,'chat',$4) RETURNING id, created_at`,
      [null, info.kontak, info.ringkasan, JSON.stringify({
        session_id: session.id, agent: session.agent_slug, model: session.model_id,
        kebutuhan: info.kebutuhan, prioritas: info.prioritas, topik: info.topik,
        pesan: messages.length, ai: info.ai,
      })])).rows[0];

    const cfg = (await q(`SELECT value FROM settings WHERE key='integrations'`)).rows[0];
    const hook = await pushWebhook((cfg?.value || {}).webhook_url, {
      event: 'reddie.chat.synced',
      ticket: lead.id,
      created_at: lead.created_at,
      session: { id: session.id, agent: session.agent_slug, model: session.model_id, messages: messages.length },
      ...info,
    });

    res.json({ ticket: lead.id, ...info, webhook: hook.status, webhook_reason: hook.reason || null });
  }));

  // Lead capture: form contact, login modal, dsb.
  app.post('/api/leads', async (req, res) => {
    const { name, email, message, source } = req.body || {};
    if (!email && !message) return res.status(400).json({ error: 'email atau message wajib diisi' });
    const src = ['contact', 'login', 'chat'].includes(source) ? source : 'contact';
    await q(`INSERT INTO leads (name, email, message, source, meta) VALUES ($1,$2,$3,$4,$5)`, [
      String(name || '').slice(0, 200) || null,
      String(email || '').slice(0, 200) || null,
      String(message || '').slice(0, 5000) || null,
      src,
      JSON.stringify({ ip: String(clientIp(req)), ua: String(req.headers['user-agent'] || '').slice(0, 300) }),
    ]);
    res.status(201).json({ ok: true });
  });

  // ═══════════════ AUTH ═══════════════

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    const u = (await q('SELECT id, email, password_hash FROM admin_users WHERE email=$1', [String(email || '')])).rows[0];
    const ok = u && await bcrypt.compare(String(password || ''), u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Email atau password salah' });
    const token = jwt.sign({ sub: u.id, email: u.email }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token });
  });

  // ═══════════════ ADMIN ═══════════════

  app.get('/api/admin', (_req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'index.html')));

  const admin = express.Router();
  admin.use(requireAdmin);

  // Skema field: label manusiawi, jenis input, teks bantuan.
  // Dipakai panel admin & editor visual untuk membangun form yang ramah.
  admin.get('/fields', (_req, res) => res.json({ ...fieldSchema(), tables: TABLES, icons: ICONS }));

  admin.get('/settings', async (_req, res) => {
    const r = await q('SELECT key, value FROM settings ORDER BY key');
    res.json(Object.fromEntries(r.rows.map(x => [x.key, x.value])));
  });
  admin.put('/settings/:key', async (req, res) => {
    await q(`INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now())
             ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=now()`,
      [req.params.key, JSON.stringify(req.body)]);
    res.json({ ok: true });
  });

  // CRUD generik untuk tabel konten
  const tables = {
    agents: ['slug','name','image','description','system_prompt','sort','show_in_dropdown','show_in_carousel','enabled'],
    skills: ['slug','title','subtitle','description','icon','color','button_label','sort','enabled'],
    models: null, // ditangani khusus (nama tabel beda)
  };
  for (const [name, cols] of Object.entries(tables)) {
    if (!cols) continue;
    admin.get(`/${name}`, async (_req, res) => {
      res.json((await q(`SELECT * FROM ${name} ORDER BY sort, id`)).rows);
    });
    admin.post(`/${name}`, async (req, res) => {
      const vals = cols.map(c => req.body[c] ?? null);
      const r = await q(
        `INSERT INTO ${name} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals);
      res.status(201).json(r.rows[0]);
    });
    admin.put(`/${name}/:id`, async (req, res) => {
      // Hanya kolom yang benar-benar dikirim yang diubah. Ini yang membuat
      // pengosongan field mungkin: dulu coalesce() membaca null sebagai
      // "biarkan apa adanya", sehingga editor tidak pernah bisa menghapus
      // isi sebuah field — nilai lama selalu kembali setelah disimpan.
      const body = req.body || {};
      const present = cols.filter(c => Object.prototype.hasOwnProperty.call(body, c));
      if (!present.length) return res.status(400).json({ error: 'Tidak ada kolom yang dikirim.' });
      const sets = present.map((c, i) => `${c}=$${i + 1}`).join(',');
      const vals = present.map(c => body[c]);
      const r = await q(`UPDATE ${name} SET ${sets} WHERE id=$${present.length + 1} RETURNING *`, [...vals, req.params.id]);
      if (!r.rowCount) return res.status(404).json({ error: 'not found' });
      res.json(r.rows[0]);
    });
    admin.delete(`/${name}/:id`, async (req, res) => {
      await q(`DELETE FROM ${name} WHERE id=$1`, [req.params.id]);
      res.json({ ok: true });
    });
  }

  admin.get('/models', async (_req, res) => {
    const rows = (await q('SELECT * FROM ai_models ORDER BY sort, id')).rows;
    res.json(rows.map(r => ({ ...r, provider_ready: providerReady(r.provider) })));
  });
  admin.post('/models', async (req, res) => {
    const { provider, model_id, label, enabled = true, is_default = false, sort = 0 } = req.body || {};
    if (!provider || !model_id || !label) return res.status(400).json({ error: 'provider, model_id, label wajib' });
    const r = await q(
      `INSERT INTO ai_models (provider, model_id, label, enabled, is_default, sort)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [provider, model_id, label, enabled, is_default, sort]);
    res.status(201).json(r.rows[0]);
  });
  admin.put('/models/:id', async (req, res) => {
    const { provider, model_id, label, enabled, is_default, sort } = req.body || {};
    if (is_default === true) await q('UPDATE ai_models SET is_default=false');
    const r = await q(
      `UPDATE ai_models SET provider=coalesce($1,provider), model_id=coalesce($2,model_id),
        label=coalesce($3,label), enabled=coalesce($4,enabled), is_default=coalesce($5,is_default),
        sort=coalesce($6,sort) WHERE id=$7 RETURNING *`,
      [provider ?? null, model_id ?? null, label ?? null, enabled ?? null, is_default ?? null, sort ?? null, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  });
  admin.delete('/models/:id', async (req, res) => {
    await q('DELETE FROM ai_models WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  });

  // ═══════════ TERBIT & RIWAYAT ═══════════

  // Uji koneksi dari panel admin — menampilkan identitas yang diwakili,
  // supaya salah nomor ketahuan sebelum tayang ke pengunjung.
  admin.get('/tasks/check', async (_req, res) => {
    const cfg = await taskConfig();
    const missing = [];
    if (!cfg.token) missing.push('TASK_API_TOKEN di berkas .env server');
    if (!cfg.base) missing.push('Alamat API task');
    if (!cfg.phone) missing.push('Nomor akun demo');
    if (missing.length) return res.json({ ok: false, error: 'Belum lengkap: ' + missing.join(', ') + '.' });
    try {
      const who = await whoAmI(cfg);
      const tasks = await listTasks(cfg);
      res.json({ ok: true, who, count: tasks.length });
    } catch (e) {
      res.json({ ok: false, error: e instanceof TaskError ? e.message : 'Gagal menghubungi sistem task.' });
    }
  });

  admin.get('/status', async (_req, res) => res.json(await draftStatus()));

  admin.post('/publish', async (req, res) => {
    const r = await publish({ note: String(req.body?.note || '').slice(0, 200) || null, by: req.admin?.email });
    if (!r.published) return res.status(409).json({ error: r.reason });
    res.status(201).json({ ok: true, version: { id: r.version.id, created_at: r.version.created_at } });
  });

  admin.get('/versions', async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    res.json((await q(
      `SELECT id, hash, note, restored_from, published_by, created_at,
              jsonb_array_length(coalesce(payload->'agents','[]'::jsonb)) AS agents,
              jsonb_array_length(coalesce(payload->'skills','[]'::jsonb)) AS skills
       FROM content_versions ORDER BY id DESC LIMIT $1`, [limit])).rows);
  });

  // Kembalikan: salin payload versi lama ke tabel kerja, lalu terbitkan
  // sebagai versi BARU. Riwayat tidak pernah dipangkas.
  admin.post('/versions/:id/restore', async (req, res) => {
    const v = (await q('SELECT * FROM content_versions WHERE id=$1', [req.params.id])).rows[0];
    if (!v) return res.status(404).json({ error: 'Versi tidak ditemukan.' });
    const cur = await latestVersion();
    if (cur && cur.id === v.id) return res.status(409).json({ error: 'Versi ini sudah menjadi yang tayang sekarang.' });
    await restoreToDraft(v.payload);
    const r = await publish({
      note: `Dikembalikan ke versi #${v.id}`,
      by: req.admin?.email,
      restoredFrom: v.id,
    });
    res.status(201).json({ ok: true, version: { id: r.version.id }, restored_from: v.id });
  });

  // ═══════════ PUSTAKA MEDIA ═══════════

  admin.get('/media', async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200), 500);
    res.json((await q(
      `SELECT id, path, filename, mime, bytes, width, height, alt, source, created_at
       FROM media ORDER BY source, created_at DESC LIMIT $1`, [limit])).rows);
  });

  // Unggah: badan permintaan adalah berkas mentah, nama asli lewat header.
  // Tanpa multipart, jadi tanpa dependensi parser tambahan.
  admin.post('/media',
    express.raw({ type: ['image/*', 'application/octet-stream'], limit: MAX_UPLOAD }),
    async (req, res) => {
      try {
        const name = decodeURIComponent(String(req.headers['x-filename'] || 'gambar'));
        const info = await processUpload(req.body, name);
        const row = (await q(
          `INSERT INTO media (path, filename, mime, bytes, width, height, alt, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'upload')
           ON CONFLICT (path) DO UPDATE SET filename = EXCLUDED.filename
           RETURNING *`,
          [info.path, info.filename, info.mime, info.bytes, info.width, info.height,
           String(req.headers['x-alt'] ? decodeURIComponent(req.headers['x-alt']) : '') || null]
        )).rows[0];
        res.status(201).json({ ...row, original: info.original });
      } catch (e) {
        if (e instanceof MediaError) return res.status(e.status).json({ error: e.message });
        console.error('[media]', e);
        res.status(500).json({ error: 'Gambar gagal diproses.' });
      }
    });

  admin.put('/media/:id', async (req, res) => {
    const r = await q('UPDATE media SET alt=$1 WHERE id=$2 RETURNING *',
      [String(req.body?.alt || '').slice(0, 300) || null, req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: 'not found' });
    res.json(r.rows[0]);
  });

  // Hapus hanya bila tidak sedang dipakai. Editor non-teknis tidak akan tahu
  // gambar mana yang terpasang di mana, jadi penjagaan ini ada di server.
  admin.delete('/media/:id', async (req, res) => {
    const row = (await q('SELECT * FROM media WHERE id=$1', [req.params.id])).rows[0];
    if (!row) return res.status(404).json({ error: 'not found' });

    const inAgents = (await q('SELECT name FROM agents WHERE image = $1', [row.path])).rows;
    const inSettings = (await q(
      `SELECT key FROM settings WHERE value::text LIKE '%' || $1 || '%'`, [row.path])).rows;
    if (inAgents.length || inSettings.length) {
      const where = [...inAgents.map(a => `agent ${a.name}`), ...inSettings.map(s => `bagian ${s.key}`)];
      return res.status(409).json({
        error: `Gambar ini masih dipakai di ${where.join(', ')}. Ganti dulu di sana sebelum menghapus.`,
      });
    }
    if (row.source === 'bundled') {
      return res.status(409).json({ error: 'Gambar bawaan tidak bisa dihapus dari sini — hapus berkasnya lewat repo.' });
    }
    await removeFile(row.path);
    await q('DELETE FROM media WHERE id=$1', [row.id]);
    res.json({ ok: true });
  });

  admin.get('/leads', async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    res.json((await q('SELECT * FROM leads ORDER BY id DESC LIMIT $1', [limit])).rows);
  });
  admin.get('/chats', async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    res.json((await q(
      `SELECT s.*, count(m.id)::int AS messages,
              max(m.created_at) AS last_message_at
       FROM chat_sessions s LEFT JOIN chat_messages m ON m.session_id = s.id
       GROUP BY s.id ORDER BY max(m.created_at) DESC NULLS LAST LIMIT $1`, [limit])).rows);
  });
  admin.get('/chats/:id', async (req, res) => {
    const s = (await q('SELECT * FROM chat_sessions WHERE id=$1', [req.params.id])).rows[0];
    if (!s) return res.status(404).json({ error: 'not found' });
    const messages = (await q('SELECT role, content, created_at FROM chat_messages WHERE session_id=$1 ORDER BY id', [req.params.id])).rows;
    res.json({ ...s, messages });
  });

  app.use('/api/admin', admin);

  // Error handler terakhir
  app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
