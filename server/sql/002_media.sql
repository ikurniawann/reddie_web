-- ============================================================
-- Pustaka media — Fase 2
-- Berkas gambar disimpan di volume, metadatanya di sini.
-- path bersifat relatif terhadap akar situs, sama seperti
-- nilai kolom agents.image yang sudah ada ("assets/x.webp").
-- ============================================================

CREATE TABLE IF NOT EXISTS media (
  id          serial PRIMARY KEY,
  path        text UNIQUE NOT NULL,          -- media/2026/09/nama-a1b2c3d4.webp
  filename    text NOT NULL,                 -- nama asli saat diunggah
  mime        text NOT NULL,
  bytes       int  NOT NULL,
  width       int,
  height      int,
  alt         text,                          -- teks alternatif untuk aksesibilitas
  source      text NOT NULL DEFAULT 'upload' -- upload | bundled
              CHECK (source IN ('upload','bundled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_created_idx ON media (created_at DESC);

-- Daftarkan aset bawaan yang sudah ikut repo, supaya muncul di pemilih gambar
-- bersama hasil unggahan. Berkasnya tidak dipindah — hanya dicatat.
INSERT INTO media (path, filename, mime, bytes, alt, source) VALUES
  ('assets/Character-Reddie.webp',        'Character-Reddie.webp',        'image/webp', 0, 'Karakter Reddie',  'bundled'),
  ('assets/Reddie-Home-1.webp',           'Reddie-Home-1.webp',           'image/webp', 0, 'Reddie home 1',    'bundled'),
  ('assets/Reddie-Home-2.webp',           'Reddie-Home-2.webp',           'image/webp', 0, 'Reddie home 2',    'bundled'),
  ('assets/Reddie-Home-3.webp',           'Reddie-Home-3.webp',           'image/webp', 0, 'Reddie home 3',    'bundled'),
  ('assets/Shadow-Koppie.webp',           'Shadow-Koppie.webp',           'image/webp', 0, 'Agent Koppie',     'bundled'),
  ('assets/Shadow-Pinkie.webp',           'Shadow-Pinkie.webp',           'image/webp', 0, 'Agent Pinkie',     'bundled'),
  ('assets/Shadow-Primmie.webp',          'Shadow-Primmie.webp',          'image/webp', 0, 'Agent Primmie',    'bundled'),
  ('assets/favicon-reddie.webp',          'favicon-reddie.webp',          'image/webp', 0, 'Favicon Reddie',   'bundled'),
  ('assets/Reddie Logo_Logogram Red.webp','Reddie Logo_Logogram Red.webp','image/webp', 0, 'Logogram Reddie',  'bundled')
ON CONFLICT (path) DO NOTHING;
