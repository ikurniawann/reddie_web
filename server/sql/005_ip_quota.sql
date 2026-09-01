-- ============================================================
-- Indeks untuk kuota chat per-IP.
--
-- Batas per-sesi saja tidak menahan apa pun: sessionId hidup di
-- sessionStorage browser, jadi tab baru, mode penyamaran, atau sekali
-- klik "clear site data" langsung memberi jatah baru. Kuota per-IP
-- butuh menghitung pesan lintas sesi, dan tanpa indeks ini kueri itu
-- memindai seluruh tabel tiap pesan masuk.
-- ============================================================

CREATE INDEX IF NOT EXISTS chat_sessions_ip_idx ON chat_sessions (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_created_idx ON chat_messages (created_at DESC);
