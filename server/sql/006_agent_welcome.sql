-- ============================================================
-- Sapaan pembuka per agent.
--
-- Layar sambutan konsol memakai satu judul dan subjudul global, lalu
-- ditimpa teks Inggris yang ditulis langsung di script.js — memakai SLUG
-- sebagai nama, sehingga memilih Titanie memunculkan "Welcome, titanie!".
-- Salah dua kali: hurufnya kecil, dan kalimatnya menyapa pengunjung
-- seolah-olah DIA yang bernama Titanie, bukan agent yang memperkenalkan diri.
--
-- Kolomnya boleh kosong. Agent tanpa sapaan sendiri memakai judul dan
-- subjudul global dari CMS, jadi menambah agent baru tidak menuntut siapa pun
-- menulis sapaan lebih dulu.
-- ============================================================

ALTER TABLE agents ADD COLUMN IF NOT EXISTS welcome_title    text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS welcome_subtitle text;

UPDATE agents SET
  welcome_title    = coalesce(welcome_title, v.judul),
  welcome_subtitle = coalesce(welcome_subtitle, v.sub)
FROM (VALUES
  ('sunnie',   'Hi, I''m Sunnie!',   'Customer support is my thing. Ada keluhan pelanggan yang perlu dibantu?'),
  ('titanie',  'Hi, I''m Titanie!',  'Infrastructure and DevOps. Server, deployment, atau pipeline — mau mulai dari mana?'),
  ('shadowie', 'Hi, I''m Shadowie!', 'Cybersecurity awareness. Ada yang mencurigakan dan ingin Anda periksa?'),
  ('baddie',   'Hi, I''m Baddie!',   'QA and testing. Fitur mana yang perlu saya cari celahnya?'),
  ('verdanie', 'Hi, I''m Verdanie!', 'Data analytics. Angka apa yang perlu dibaca hari ini?')
) AS v(slug, judul, sub)
WHERE agents.slug = v.slug;
