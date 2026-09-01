-- ============================================================
-- Riwayat versi konten — Fase 3
--
-- Tabel kerja (settings, agents, skills) berperan sebagai DRAFT:
-- editor menyuntingnya sebebasnya tanpa memengaruhi situs publik.
-- Setiap "Terbitkan" memotret isinya ke sini sebagai satu versi utuh,
-- dan /api/content menyajikan versi terbit terakhir.
--
-- Riwayat bersifat append-only: mengembalikan versi lama menulis versi
-- BARU berisi salinan payload lama, bukan menghapus versi sesudahnya.
-- Dengan begitu tidak ada langkah yang bisa menghilangkan riwayat.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_versions (
  id           serial PRIMARY KEY,
  payload      jsonb NOT NULL,          -- { settings, agents, skills }
  hash         text  NOT NULL,          -- sidik jari payload, untuk deteksi perubahan
  note         text,                    -- keterangan singkat dari editor
  restored_from int,                    -- diisi bila versi ini hasil "kembalikan"
  published_by text,                    -- email admin yang menerbitkan
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS content_versions_created_idx ON content_versions (id DESC);
