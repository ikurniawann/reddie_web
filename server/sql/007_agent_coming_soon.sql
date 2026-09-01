-- ============================================================
-- Penanda "segera hadir" untuk agent yang belum siap dipakai.
--
-- Sebelumnya agent yang belum punya video, sapaan, maupun kesiapan lain tetap
-- bisa dipilih dan tampak sama seperti yang sudah jadi — pengunjung baru tahu
-- setelah mengklik dan tidak menemukan apa pun yang berbeda. Menyembunyikannya
-- juga bukan jawaban: daftar yang lebih panjang justru memperlihatkan bahwa
-- lini agentnya masih tumbuh.
--
-- Dipisahkan dari kolom `enabled`: yang ini masih tayang di daftar, hanya
-- tidak bisa diklik. `enabled=false` tetap berarti hilang sama sekali.
-- ============================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS coming_soon boolean NOT NULL DEFAULT false;

UPDATE agents SET coming_soon = true WHERE slug IN ('shadowie', 'baddie', 'verdanie');
