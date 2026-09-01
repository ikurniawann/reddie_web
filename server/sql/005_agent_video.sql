-- ============================================================
-- Video karakter per agent.
--
-- Layar sambutan konsol memutar satu video karakter. Sebelumnya video itu
-- ditulis langsung di index.html, jadi memilih agent lain di dropdown tetap
-- menampilkan wajah Reddie — pilihan yang tidak terasa berpengaruh apa pun.
--
-- Kolomnya boleh kosong: agent tanpa video sendiri akan memakai video bawaan
-- yang tetap ada di halaman. Itu penting karena tidak semua agent punya
-- rekamannya, dan panel kosong lebih buruk daripada video bawaan.
-- ============================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS video text;

UPDATE agents SET video = 'assets/titanie.mp4' WHERE slug = 'titanie' AND video IS NULL;
UPDATE agents SET video = 'assets/sunnie.mp4'  WHERE slug = 'sunnie'  AND video IS NULL;
UPDATE agents SET video = 'assets/Reddie-Head-Video.mp4' WHERE slug = 'reddie' AND video IS NULL;
