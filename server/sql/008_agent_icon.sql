-- ============================================================
-- Ikon kecil per agent (avatar bulat di kanan atas konsol).
--
-- Dipisahkan dari kolom `image`, yang dipakai korsel halaman About: yang itu
-- render karakter utuh setinggi badan, sedangkan yang ini potret kepala rapat
-- yang harus tetap terbaca pada 32 piksel. Memaksa satu berkas melayani
-- keduanya membuat salah satunya selalu terlihat salah — badan penuh menyusut
-- jadi noda di avatar, kepala rapat jadi kebesaran di korsel.
-- ============================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS icon text;

UPDATE agents SET icon = 'assets/favicon-reddie.webp' WHERE slug = 'reddie'  AND icon IS NULL;
UPDATE agents SET icon = 'assets/titanie-icon.webp'   WHERE slug = 'titanie' AND icon IS NULL;
UPDATE agents SET icon = 'assets/sunnie-icon.webp'    WHERE slug = 'sunnie'  AND icon IS NULL;
