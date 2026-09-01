-- ============================================================
-- Lampiran percakapan — analisis dokumen oleh AI
--
-- Yang disimpan HANYA teks hasil ekstraksi, bukan berkas aslinya.
-- Dua alasan: berkas dari pengunjung anonim akan menumpuk tanpa batas,
-- dan menyajikan kembali berkas unggahan orang lain dari domain sendiri
-- adalah jalur phishing/XSS yang tidak perlu dibuka.
-- ============================================================

CREATE TABLE IF NOT EXISTS attachments (
  id         serial PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  filename   text NOT NULL,
  mime       text NOT NULL,
  bytes      int  NOT NULL,
  method     text NOT NULL,        -- pdf | pdf-ocr | docx | sheet | text | ocr
  pages      int,
  chars      int  NOT NULL DEFAULT 0,
  content    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_session_idx ON attachments (session_id, id);
