// ============================================================
// SKEMA FIELD — sumber tunggal untuk seluruh konten teks situs.
//
// Satu deklarasi dipakai tiga tempat:
//   1. live.js      → menghidrasi halaman lewat atribut data-cms
//   2. editor.js    → editor visual tahu jenis input tiap field
//   3. admin panel  → membangun form berlabel manusiawi, bukan JSON mentah
//
// Kunci berbentuk "grup.field" dan memetakan langsung ke tabel settings:
// settings['hero'].title  <->  data-cms="hero.title"
//
// Field:
//   label  - nama yang dilihat editor non-teknis (WAJIB, bahasa Indonesia)
//   type   - text | textarea | html | url | list | placeholder
//   help   - kalimat penjelas: di mana ini muncul / kapan dipakai
//   max    - batas panjang yang disarankan (dipakai validasi & hitung karakter)
//   value  - nilai awal, disalin apa adanya dari index.html
// ============================================================

export const GROUPS = {
  site:    'Umum & SEO',
  nav:     'Menu navigasi',
  brand:   'Merek',
  hero:    'Halaman depan',
  console: 'Konsol demo',
  welcome: 'Sambutan chat',
  about:   'Halaman about',
  socials: 'Tautan sosial',
  contact: 'Formulir kontak',
  login:   'Jendela masuk',
};

export const FIELDS = {
  // ── Umum ────────────────────────────────────────────────
  'site.title': {
    label: 'Judul halaman (tab browser)', type: 'text', max: 70,
    help: 'Muncul di tab browser dan sebagai judul di hasil pencarian Google.',
    value: 'REDDIE - The AI Agent by WIT',
  },

  // ── Navigasi (dipakai header atas DAN menu bawah versi ponsel) ──
  'nav.home':    { label: 'Menu "Home"',    type: 'text', max: 14, help: 'Dipakai di header atas dan menu bawah pada ponsel.', value: 'HOME' },
  'nav.try':     { label: 'Menu "Try"',     type: 'text', max: 14, help: 'Dipakai di header atas dan menu bawah pada ponsel.', value: 'TRY' },
  'nav.about':   { label: 'Menu "About"',   type: 'text', max: 14, help: 'Dipakai di header atas dan menu bawah pada ponsel.', value: 'ABOUT' },
  'nav.contact': { label: 'Menu "Contact"', type: 'text', max: 14, help: 'Dipakai di header atas dan menu bawah pada ponsel.', value: 'CONTACT' },

  // ── Merek ───────────────────────────────────────────────
  'brand.prefix': { label: 'Teks sebelum nama merek', type: 'text', max: 30, help: 'Di tengah header atas, sebelum kata bercetak merah.', value: 'The AI Agent by ' },
  'brand.name':   { label: 'Nama merek',              type: 'text', max: 16, help: 'Kata bercetak merah di tengah header atas.',        value: 'WIT' },

  // ── Halaman depan ───────────────────────────────────────
  'hero.title':    { label: 'Judul raksasa',   type: 'text', max: 12, help: 'Tulisan besar di latar halaman pembuka. Pendek saja — makin panjang makin kecil tampilannya.', value: 'REDDIE' },
  'hero.subtitle': { label: 'Kalimat pengiring', type: 'text', max: 48, help: 'Satu baris di bawah karakter Reddie.', value: 'The Agent Make IT Work' },

  // ── Konsol demo ─────────────────────────────────────────
  'console.tab_prompt':        { label: 'Tab kiri atas',            type: 'text', max: 16, help: 'Tab pertama di pojok kiri atas konsol.', value: 'Prompt' },
  'console.tab_agent':         { label: 'Tab kanan atas',           type: 'text', max: 16, help: 'Tab kedua, yang aktif secara bawaan.',    value: 'Agent' },
  'console.search_placeholder':{ label: 'Teks bayangan kolom cari', type: 'text', max: 60, help: 'Tulisan abu-abu di kolom pencarian selama masih kosong.', value: 'Search conversations, customers, or tickets...' },
  'console.profile_name':      { label: 'Nama pengguna tamu',       type: 'text', max: 24, help: 'Di kotak profil pojok kiri bawah, sebelum pengunjung masuk.', value: 'Guest User' },
  'console.profile_status':    { label: 'Ajakan masuk',             type: 'text', max: 28, help: 'Baris kecil di bawah nama pengguna tamu.', value: 'Click to Sign In' },
  'console.sidebar_footer':    { label: 'Nomor versi',              type: 'text', max: 20, help: 'Tulisan kecil paling bawah di kolom kiri.', value: 'Built v0.12' },
  'console.skills_tab':        { label: 'Judul tab kolom tengah',   type: 'text', max: 28, help: 'Tab di atas daftar kartu kemampuan.', value: 'AI Skills Sockets' },
  'console.skills_title':      { label: 'Judul kartu kemampuan',    type: 'text', max: 28, help: 'Judul di dalam kotak putih kolom tengah.', value: 'Active Sockets' },
  'console.skills_intro':      { label: 'Penjelasan kartu kemampuan', type: 'textarea', max: 180, help: 'Paragraf pengantar di atas daftar kartu.', value: 'Select an active socket below to execute custom data transformations directly on the active discussion.' },
  'console.opt_attach':        { label: 'Tombol "Attach"',  type: 'text', max: 16, help: 'Baris tombol kecil tepat di atas kolom ketik.', value: 'Attach' },
  'console.opt_options':       { label: 'Tombol "Options"', type: 'text', max: 16, help: 'Baris tombol kecil tepat di atas kolom ketik.', value: 'Options' },
  'console.opt_model':         { label: 'Tombol "Model"',   type: 'text', max: 16, help: 'Membuka daftar pilihan model AI.', value: 'Model' },
  'console.input_placeholder': { label: 'Teks bayangan kolom ketik', type: 'text', max: 70, help: 'Tulisan abu-abu di kolom ketik chat selama masih kosong.', value: 'Ask AI to draft a reply or summarize the issue...' },

  // Menu kolom kiri. Label bebas diubah — perilakunya dikunci atribut
  // data-key di HTML, jadi mengganti tulisan tidak merusak fungsinya.
  'console.menu_chat':         { label: 'Menu 1', type: 'text', max: 26, help: 'Menu kolom kiri. Mengubah tulisannya aman — fungsinya tidak ikut berubah.', value: 'Chat & Discussion' },
  'console.menu_realtime':     { label: 'Menu 2', type: 'text', max: 26, help: 'Menu kolom kiri.', value: 'Real-Time Discussion' },
  'console.menu_task':         { label: 'Menu 3', type: 'text', max: 26, help: 'Menu kolom kiri.', value: 'Task & Scheduling' },
  'console.menu_analyze':      { label: 'Menu 4', type: 'text', max: 26, help: 'Menu kolom kiri.', value: 'Analyze' },
  'console.menu_research':     { label: 'Menu 5', type: 'text', max: 26, help: 'Menu kolom kiri.', value: 'Research' },
  'console.menu_automation':   { label: 'Menu 6', type: 'text', max: 26, help: 'Menu kolom kiri.', value: 'Automation' },
  'console.menu_connectivity': { label: 'Menu 7', type: 'text', max: 26, help: 'Menu kolom kiri.', value: 'Connectivity' },
  'console.menu_more':         { label: 'Menu 8', type: 'text', max: 26, help: 'Menu terakhir, ditampilkan miring.', value: 'And many more..' },

  // ── Sambutan chat ───────────────────────────────────────
  'welcome.badge':    { label: 'Lencana keamanan', type: 'text', max: 28, help: 'Pil kecil di atas judul sambutan.', value: 'Chat is Protected' },
  'welcome.title':    { label: 'Judul sambutan',   type: 'text', max: 40, help: 'Tulisan besar di tengah panel chat sebelum percakapan dimulai.', value: 'Welcome, Mr. Stark!' },
  'welcome.subtitle': { label: 'Kalimat sambutan', type: 'text', max: 60, help: 'Satu baris di bawah judul sambutan.', value: 'How can I help you today?' },
  'welcome.chips':    {
    label: 'Saran pertanyaan', type: 'list', max: 34,
    help: 'Tombol saran di bawah panel chat. Teksnya langsung dikirim ke AI saat diklik, jadi tulis seperti pertanyaan sungguhan.',
    value: ['Suggest reply', 'Summarize', 'Extract key details', 'Detect sentiment', 'Search knowledge base', 'Rephrase professionally'],
  },

  // ── Halaman about ───────────────────────────────────────
  'about.label':       { label: 'Label kecil',        type: 'text', max: 16, help: 'Tulisan kecil di atas paragraf deskripsi.', value: 'ABOUT' },
  'about.title_left':  { label: 'Judul sisi gelap',   type: 'text', max: 18, help: 'Judul besar di kolom kiri yang gelap.', value: 'AI AGENT' },
  'about.cta_small':   { label: 'Label ajakan',       type: 'text', max: 16, help: 'Tulisan kecil di atas tautan workspace.', value: 'CLICK AND' },
  'about.footer_left': { label: 'Tautan workspace',   type: 'text', max: 30, help: 'Tautan yang membawa pengunjung ke konsol demo.', value: 'EXPLORE WORKSPACE ↗' },
  'about.meta_1':      { label: 'Keterangan bawah 1', type: 'text', max: 30, help: 'Baris keterangan di pojok kanan bawah.', value: 'DEVELOPED BY WIT.ID' },
  'about.meta_2':      { label: 'Keterangan bawah 2', type: 'text', max: 30, help: 'Baris keterangan di pojok kanan bawah.', value: 'JAKARTA, INDONESIA' },

  // ── Tautan sosial ───────────────────────────────────────
  'socials.instagram_label': { label: 'Tulisan tautan Instagram', type: 'text', max: 20, help: 'Teks yang terlihat pengunjung.', value: '• INSTAGRAM' },
  'socials.instagram':       { label: 'Alamat Instagram',         type: 'url',  max: 200, help: 'Alamat lengkap termasuk https://', value: 'https://instagram.com' },
  'socials.telegram_label':  { label: 'Tulisan tautan Telegram',  type: 'text', max: 20, help: 'Teks yang terlihat pengunjung.', value: '• TELEGRAM' },
  'socials.telegram':        { label: 'Alamat Telegram',          type: 'url',  max: 200, help: 'Alamat lengkap termasuk https://', value: 'https://telegram.org' },

  // ── Formulir kontak ─────────────────────────────────────
  'contact.title':         { label: 'Judul',              type: 'text', max: 30, help: 'Judul besar di kartu kontak.', value: 'GET IN TOUCH' },
  'contact.subtitle':      { label: 'Kalimat pengantar',  type: 'text', max: 80, help: 'Satu baris di bawah judul.', value: "Let's build the future of AI automation together." },
  'contact.label_name':    { label: 'Label kolom nama',   type: 'text', max: 20, value: 'Name' },
  'contact.ph_name':       { label: 'Contoh isian nama',  type: 'text', max: 40, help: 'Tulisan abu-abu di dalam kolom selama masih kosong.', value: 'Enter your name' },
  'contact.label_email':   { label: 'Label kolom email',  type: 'text', max: 20, value: 'Email' },
  'contact.ph_email':      { label: 'Contoh isian email', type: 'text', max: 40, help: 'Tulisan abu-abu di dalam kolom selama masih kosong.', value: 'Enter your email address' },
  'contact.label_message': { label: 'Label kolom pesan',  type: 'text', max: 20, value: 'Message' },
  'contact.ph_message':    { label: 'Contoh isian pesan', type: 'text', max: 60, help: 'Tulisan abu-abu di dalam kolom selama masih kosong.', value: 'Tell us about your project or inquiry' },
  'contact.submit':        { label: 'Tombol kirim',       type: 'text', max: 24, value: 'SEND MESSAGE' },
  'contact.success_title': { label: 'Judul setelah terkirim', type: 'text', max: 40, help: 'Muncul menggantikan formulir setelah pesan berhasil dikirim.', value: 'Message Sent Successfully!' },
  'contact.success_body':  { label: 'Pesan setelah terkirim', type: 'textarea', max: 160, help: 'Kalimat penenang di bawah judul konfirmasi.', value: 'Thank you for reaching out. The Reddie team will get back to you shortly.' },

  // ── Jendela masuk ───────────────────────────────────────
  'login.title':          { label: 'Judul',                 type: 'text', max: 30, value: 'Welcome back' },
  'login.subtitle':       { label: 'Kalimat pengantar',     type: 'text', max: 60, value: 'Log in to your Reddie workspace account' },
  'login.label_email':    { label: 'Label kolom email',     type: 'text', max: 20, value: 'Email' },
  'login.ph_email':       { label: 'Contoh isian email',    type: 'text', max: 40, value: 'Enter your email' },
  'login.label_password': { label: 'Label kolom sandi',     type: 'text', max: 20, value: 'Password' },
  'login.ph_password':    { label: 'Contoh isian sandi',    type: 'text', max: 40, value: 'Enter your password' },
  'login.remember':       { label: 'Pilihan ingat saya',    type: 'text', max: 24, value: 'Remember me' },
  'login.forgot':         { label: 'Tautan lupa sandi',     type: 'text', max: 24, value: 'Forgot password?' },
  'login.submit':         { label: 'Tombol masuk',          type: 'text', max: 20, value: 'Log In' },
  'login.footer_text':    { label: 'Ajakan daftar',         type: 'text', max: 40, help: 'Kalimat di bagian paling bawah jendela masuk.', value: "Don't have an account?" },
  'login.signup':         { label: 'Tautan daftar',         type: 'text', max: 20, value: 'Sign up' },
};

// Susun nilai awal jadi bentuk tabel settings: { hero: {title, subtitle}, ... }
export function defaultSettings() {
  const out = {};
  for (const [key, def] of Object.entries(FIELDS)) {
    const [group, field] = key.split('.');
    (out[group] ||= {})[field] = def.value;
  }
  return out;
}

// Metadata tanpa nilai — dikirim ke admin & editor untuk membangun form.
export function fieldSchema() {
  const out = {};
  for (const [key, def] of Object.entries(FIELDS)) {
    out[key] = { label: def.label, type: def.type, help: def.help || null, max: def.max || null };
  }
  return { groups: GROUPS, fields: out };
}

// ============================================================
// Kolom tabel (agents & skills) — label manusiawi untuk panel admin.
// Tanpa ini editor melihat "slug", "sort", "show_in_dropdown",
// "system_prompt" tanpa penjelasan apa pun.
// ============================================================

export const TABLES = {
  agents: {
    label: 'Agent AI',
    help: 'Karakter AI yang bisa dipilih pengunjung. Slug mengunci identitasnya; nama boleh diganti kapan saja.',
    columns: [
      { name: 'name',             label: 'Nama tampilan',   type: 'text',   max: 30, help: 'Yang dilihat pengunjung di daftar pilihan agent.' },
      { name: 'slug',             label: 'Kode identitas',  type: 'slug',   max: 30, help: 'Kunci teknis, huruf kecil tanpa spasi. JANGAN diubah setelah dipakai — percakapan lama akan kehilangan rujukannya.' },
      { name: 'image',            label: 'Gambar agent',    type: 'image',           help: 'Muncul di korsel halaman About. Disarankan latar transparan.' },
      { name: 'description',      label: 'Deskripsi',       type: 'html',   max: 400, help: 'Paragraf di halaman About. Boleh memakai <strong> untuk menebalkan.' },
      { name: 'system_prompt',    label: 'Kepribadian',     type: 'prompt', max: 2000, help: 'Instruksi cara agent ini menjawab. Tulis seperti memberi arahan ke staf baru: siapa dia, apa keahliannya, gaya bicaranya, dan batasannya.' },
      { name: 'show_in_dropdown', label: 'Tampil di daftar pilihan', type: 'bool', help: 'Muncul di dropdown pojok kanan atas konsol.' },
      { name: 'show_in_carousel', label: 'Tampil di korsel About',   type: 'bool', help: 'Muncul di korsel halaman About.' },
      { name: 'enabled',          label: 'Aktif',           type: 'bool',   help: 'Nonaktifkan untuk menyembunyikan tanpa menghapus.' },
      { name: 'sort',             label: 'Urutan',          type: 'int',    help: 'Angka kecil tampil lebih dulu.' },
    ],
  },
  skills: {
    label: 'Kartu kemampuan',
    help: 'Kartu di kolom tengah konsol. Tombolnya menjalankan fungsi nyata untuk PDF dan Excel.',
    columns: [
      { name: 'title',        label: 'Judul kartu',      type: 'text',  max: 30, help: 'Judul tebal di dalam kartu.' },
      { name: 'slug',         label: 'Kode identitas',   type: 'slug',  max: 20, help: 'Menentukan fungsi tombolnya: pdf dan excel sudah bekerja. JANGAN diubah.' },
      { name: 'subtitle',     label: 'Baris kecil',      type: 'text',  max: 40, help: 'Keterangan abu-abu di bawah judul.' },
      { name: 'description',  label: 'Penjelasan',       type: 'textarea', max: 200, help: 'Paragraf isi kartu.' },
      { name: 'button_label', label: 'Tulisan tombol',   type: 'text',  max: 30 },
      { name: 'icon',         label: 'Ikon',             type: 'icon',  help: 'Ikon di pojok kiri atas kartu.' },
      { name: 'color',        label: 'Warna aksen',      type: 'color', help: 'Warna tombol dan latar ikon.' },
      { name: 'enabled',      label: 'Aktif',            type: 'bool',  help: 'Nonaktifkan untuk menyembunyikan tanpa menghapus.' },
      { name: 'sort',         label: 'Urutan',           type: 'int',   help: 'Angka kecil tampil lebih dulu.' },
    ],
  },
};

// Pilihan ikon untuk pemilih visual — editor tidak perlu tahu nama kelas
// Font Awesome, cukup melihat gambarnya.
export const ICONS = [
  'fa-file-pdf', 'fa-file-excel', 'fa-file-word', 'fa-file-lines', 'fa-database',
  'fa-arrows-rotate', 'fa-cloud-arrow-up', 'fa-server', 'fa-network-wired', 'fa-plug',
  'fa-bolt', 'fa-wand-magic-sparkles', 'fa-robot', 'fa-brain', 'fa-microchip',
  'fa-comments', 'fa-envelope', 'fa-bell', 'fa-calendar-check', 'fa-clock',
  'fa-chart-line', 'fa-chart-pie', 'fa-magnifying-glass-chart', 'fa-table-list', 'fa-list-check',
  'fa-shield-halved', 'fa-lock', 'fa-key', 'fa-user-shield', 'fa-fingerprint',
  'fa-code', 'fa-terminal', 'fa-bug', 'fa-gears', 'fa-screwdriver-wrench',
  'fa-book-open', 'fa-graduation-cap', 'fa-lightbulb', 'fa-rocket', 'fa-star',
];
