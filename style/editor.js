/*
   REDDIE VISUAL EDITOR (Fase A)
   Editor visual di atas halaman asli — diaktifkan via ?edit=1 oleh live.js.
   Klik teks untuk edit di tempat, drag/tombol panah untuk susun ulang,
   klik gambar carousel untuk ganti. Simpan -> API CMS (JWT admin).
   Desain halaman tidak pernah berubah struktur — hanya kontennya.
*/
(function () {
    'use strict';
    var API = 'api';
    var tok = localStorage.getItem('tok') || '';
    var dirty = {};            // kumpulan operasi tertunda, key unik -> op
    var adminData = { agents: [], skills: [] };
    var content = window.__reddieContent || { settings: {} };

    // ── util ─────────────────────────────────────────────────────
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function req(p, opt) {
        opt = opt || {};
        opt.headers = Object.assign({ 'content-type': 'application/json', authorization: 'Bearer ' + tok }, opt.headers || {});
        return fetch(API + p, opt).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) { var e = new Error(d.error || 'HTTP ' + r.status); e.status = r.status; throw e; }
                return d;
            });
        });
    }
    function markDirty(key, op) { dirty[key] = op; renderToolbar(); }
    function dirtyCount() { return Object.keys(dirty).length; }

    // ── gaya editor (disuntik, tidak menyentuh style.css) ────────
    var css = document.createElement('style');
    css.textContent =
        '[data-re]{outline:2px dashed transparent;outline-offset:3px;transition:outline-color .15s;cursor:text}' +
        '[data-re]:hover{outline-color:#ff3333}' +
        '[data-re]:focus{outline-color:#ff3333;outline-style:solid;background:rgba(255,51,51,0.06)}' +
        '.re-toolbar{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:99999;' +
        'background:#111;color:#fff;border-radius:99px;padding:.55rem 1rem;display:flex;gap:.7rem;align-items:center;' +
        'font:600 13px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35)}' +
        '.re-toolbar .re-dot{width:8px;height:8px;border-radius:50%;background:#ff3333;animation:re-pulse 1.5s infinite}' +
        '@keyframes re-pulse{50%{opacity:.3}}' +
        '.re-toolbar button{border:none;border-radius:99px;padding:.35rem .8rem;font:700 12px system-ui;cursor:pointer}' +
        '.re-save{background:#ff3333;color:#fff}.re-save:disabled{background:#555;cursor:default}' +
        '.re-ghost{background:transparent;color:#bbb;border:1px solid #444!important}' +
        '.re-badge{background:#333;border-radius:99px;padding:.15rem .6rem;font-size:11px}' +
        '.re-ctl{position:absolute;top:-11px;right:-8px;z-index:9000;display:flex;gap:2px}' +
        '.re-ctl button{width:20px;height:20px;border-radius:6px;border:none;background:#111;color:#fff;' +
        'font:700 11px/1 system-ui;cursor:pointer;padding:0}' +
        '.re-ctl button:hover{background:#ff3333}' +
        '.re-item{position:relative}' +
        '.re-imgpick{cursor:pointer!important;outline:2px dashed transparent;outline-offset:4px}' +
        '.re-imgpick:hover{outline-color:#ff3333}' +
        '.re-banner{position:fixed;top:0;left:0;right:0;z-index:99999;background:#ff3333;color:#fff;' +
        'text-align:center;padding:.6rem;font:600 13px system-ui}.re-banner a{color:#fff}';
    document.head.appendChild(css);

    // ── toolbar ──────────────────────────────────────────────────
    var bar = document.createElement('div');
    bar.className = 're-toolbar';
    document.body.appendChild(bar);
    function renderToolbar() {
        var n = dirtyCount();
        bar.innerHTML =
            '<span class="re-dot"></span> MODE EDIT' +
            '<span class="re-badge">' + n + ' perubahan</span>' +
            '<button class="re-save" id="reSave"' + (n ? '' : ' disabled') + '>Simpan</button>' +
            '<button class="re-ghost" id="reReset">Batal</button>' +
            '<button class="re-ghost" id="reExit">Keluar</button>';
        bar.querySelector('#reSave').onclick = saveAll;
        bar.querySelector('#reReset').onclick = function () { location.reload(); };
        bar.querySelector('#reExit').onclick = function () {
            if (dirtyCount() && !confirm('Ada ' + dirtyCount() + ' perubahan belum disimpan. Tetap keluar?')) return;
            location.href = location.pathname;
        };
    }

    // ── simpan semua operasi tertunda ────────────────────────────
    function saveAll() {
        var ops = Object.values(dirty);
        if (!ops.length) return;
        bar.querySelector('#reSave').disabled = true;
        bar.querySelector('#reSave').textContent = 'Menyimpan…';
        // gabungkan patch settings per key
        var settingsPatch = {};
        var rest = [];
        ops.forEach(function (op) {
            if (op.type === 'setting') {
                settingsPatch[op.key] = Object.assign({}, content.settings[op.key] || {}, settingsPatch[op.key] || {}, op.patch);
            } else rest.push(op);
        });
        var calls = Object.keys(settingsPatch).map(function (k) {
            return req('/admin/settings/' + k, { method: 'PUT', body: JSON.stringify(settingsPatch[k]) });
        }).concat(rest.map(function (op) {
            return req('/admin/' + op.res + '/' + op.id, { method: 'PUT', body: JSON.stringify(op.patch) });
        }));
        Promise.all(calls).then(function () {
            dirty = {};
            location.reload(); // re-hidrasi bersih dari CMS
        }).catch(function (e) {
            alert('Gagal menyimpan: ' + e.message);
            renderToolbar();
        });
    }

    // ── teks inline: elemen tunggal -> settings ──────────────────
    var TEXT_BINDINGS = [
        { sel: '.brand-title-huge',           key: 'hero',    field: 'title',    strip: '®' },
        { sel: '.brand-subtitle',             key: 'hero',    field: 'subtitle' },
        { sel: '.chat-welcome-title',         key: 'welcome', field: 'title' },
        { sel: '.chat-welcome-subtitle',      key: 'welcome', field: 'subtitle' },
        { sel: '.contact-card .section-title',key: 'contact', field: 'title' },
        { sel: '.contact-subtitle',           key: 'contact', field: 'subtitle' },
    ];
    TEXT_BINDINGS.forEach(function (b) {
        var el = document.querySelector(b.sel);
        if (!el) return;
        el.setAttribute('data-re', '');
        el.setAttribute('contenteditable', 'plaintext-only');
        el.setAttribute('spellcheck', 'false');
        el.addEventListener('input', function () {
            var v = el.textContent;
            if (b.strip) v = v.split(b.strip).join('');
            var patch = {}; patch[b.field] = v.trim();
            markDirty('setting:' + b.key + '.' + b.field, { type: 'setting', key: b.key, patch: patch });
        });
    });

    // ── kontrol item koleksi (naik/turun/hapus) ──────────────────
    function attachCtl(el, opts) {
        el.classList.add('re-item');
        var ctl = document.createElement('span');
        ctl.className = 're-ctl';
        ctl.setAttribute('contenteditable', 'false');
        ctl.innerHTML =
            (opts.up    ? '<button data-a="up" title="Geser naik/kiri">&#9650;</button>' : '') +
            (opts.down  ? '<button data-a="down" title="Geser turun/kanan">&#9660;</button>' : '') +
            (opts.del   ? '<button data-a="del" title="Hapus">&#10005;</button>' : '');
        el.appendChild(ctl);
        ctl.addEventListener('click', function (e) {
            var a = e.target.closest('button'); if (!a) return;
            e.preventDefault(); e.stopPropagation();
            opts.on(a.dataset.a, el);
        });
        // drag & drop bawaan browser
        if (opts.up || opts.down) {
            el.draggable = true;
            el.addEventListener('dragstart', function (e) { el.classList.add('re-drag'); e.dataTransfer.setData('text/plain', ''); });
            el.addEventListener('dragend', function () { el.classList.remove('re-drag'); });
            el.addEventListener('dragover', function (e) { e.preventDefault(); });
            el.addEventListener('drop', function (e) {
                e.preventDefault(); e.stopPropagation();
                var dragged = el.parentElement.querySelector('.re-drag');
                if (dragged && dragged !== el) { el.parentElement.insertBefore(dragged, el); opts.on('reorder', dragged); }
            });
        }
    }
    function moveEl(el, dir) {
        if (dir === 'up' && el.previousElementSibling) el.parentElement.insertBefore(el, el.previousElementSibling);
        if (dir === 'down' && el.nextElementSibling) el.parentElement.insertBefore(el.nextElementSibling, el);
    }

    // ── chips welcome (array di settings.welcome) ────────────────
    function initChips() {
        var box = document.querySelector('#chatWelcomeState .suggestion-chips');
        if (!box) return;
        function commit() {
            var chips = [].map.call(box.querySelectorAll('.chip[data-re]'), function (c) {
                return c.childNodes[0] ? c.childNodes[0].textContent.trim() : c.textContent.trim();
            }).filter(Boolean);
            markDirty('setting:welcome.chips', { type: 'setting', key: 'welcome', patch: { chips: chips } });
        }
        function wireChip(c) {
            c.setAttribute('data-re', '');
            c.setAttribute('contenteditable', 'plaintext-only');
            c.addEventListener('input', commit);
            attachCtl(c, { up: true, down: true, del: true, on: function (a, el) {
                if (a === 'del') el.remove();
                else if (a !== 'reorder') moveEl(el, a);
                commit();
            } });
        }
        [].forEach.call(box.querySelectorAll('.chip'), wireChip);
        var add = document.createElement('button');
        add.className = 'chip'; add.textContent = '+ Chip'; add.style.borderStyle = 'dashed';
        add.setAttribute('contenteditable', 'false');
        add.addEventListener('click', function (e) {
            e.preventDefault(); e.stopPropagation();
            var c = document.createElement('button');
            c.className = 'chip'; c.textContent = 'Chip baru';
            box.insertBefore(c, add); wireChip(c); commit();
        });
        box.appendChild(add);
    }

    // ── kartu skills (tabel skills, cocokkan via slug) ───────────
    function initSkills() {
        var btns = document.querySelectorAll('[class*="btn-skill-"]');
        [].forEach.call(btns, function (btn) {
            var card = btn.closest('div[style*="border-radius: 12px"], div[style*="border-radius:12px"]');
            if (!card) return;
            var slug = (btn.className.match(/btn-skill-([\w-]+)/) || [])[1];
            var row = adminData.skills.find(function (s) { return s.slug === slug; });
            if (!row) return;
            var map = [
                [card.querySelector('h4'),              'title'],
                [card.querySelector('h4 + span, span[style*="0.68rem"]'), 'subtitle'],
                [card.querySelector('p'),               'description'],
            ];
            map.forEach(function (m) {
                var el = m[0]; if (!el) return;
                el.setAttribute('data-re', '');
                el.setAttribute('contenteditable', 'plaintext-only');
                el.addEventListener('input', function () {
                    var patch = {}; patch[m[1]] = el.textContent.trim();
                    var cur = (dirty['skill:' + row.id] || {}).patch || {};
                    markDirty('skill:' + row.id, { type: 'row', res: 'skills', id: row.id, patch: Object.assign(cur, patch) });
                });
            });
            attachCtl(card, { up: true, down: true, on: function (a, el) {
                if (a !== 'reorder') moveEl(el, a);
                // sort ulang seluruh kartu sesuai posisi DOM
                var cards = el.parentElement.querySelectorAll('.re-item');
                [].forEach.call(cards, function (c2, i) {
                    var b2 = c2.querySelector('[class*="btn-skill-"]'); if (!b2) return;
                    var s2 = (b2.className.match(/btn-skill-([\w-]+)/) || [])[1];
                    var r2 = adminData.skills.find(function (s) { return s.slug === s2; });
                    if (!r2) return;
                    var cur = (dirty['skill:' + r2.id] || {}).patch || {};
                    markDirty('skill:' + r2.id, { type: 'row', res: 'skills', id: r2.id, patch: Object.assign(cur, { sort: i + 1 }) });
                });
            } });
        });
    }

    // ── dropdown agents (rename + urutan) ────────────────────────
    function initAgentDropdown() {
        var box = document.querySelector('.db-agent-dropdown-content');
        if (!box) return;
        function commitOrder() {
            [].forEach.call(box.querySelectorAll('.agent-opt'), function (o, i) {
                var row = adminData.agents.find(function (a) { return a.name.toLowerCase() === (o.childNodes[0] ? o.childNodes[0].textContent : o.textContent).trim().toLowerCase() || a.slug === (o.dataset.agent || '').toLowerCase(); });
                if (!row) return;
                var cur = (dirty['agent:' + row.id] || {}).patch || {};
                markDirty('agent:' + row.id, { type: 'row', res: 'agents', id: row.id, patch: Object.assign(cur, { sort: i + 1 }) });
            });
        }
        [].forEach.call(box.querySelectorAll('.agent-opt'), function (o) {
            var slug = (o.dataset.agent || '').toLowerCase();
            var row = adminData.agents.find(function (a) { return a.slug === slug || a.name.toLowerCase() === slug; });
            o.setAttribute('data-re', '');
            o.setAttribute('contenteditable', 'plaintext-only');
            o.addEventListener('input', function () {
                if (!row) return;
                var cur = (dirty['agent:' + row.id] || {}).patch || {};
                markDirty('agent:' + row.id, { type: 'row', res: 'agents', id: row.id, patch: Object.assign(cur, { name: (o.childNodes[0] ? o.childNodes[0].textContent : o.textContent).trim() }) });
            });
            attachCtl(o, { up: true, down: true, on: function (a, el) {
                if (a !== 'reorder') moveEl(el, a);
                commitOrder();
            } });
        });
    }

    // ── carousel About (nama, deskripsi, gambar per agent) ───────
    function initCarousel() {
        var title = document.getElementById('aboutTitleRight');
        var desc = document.getElementById('aboutDescText');
        var img = document.getElementById('aboutMascotImg');
        if (!title || !desc) return;
        function currentRow() {
            var name = title.textContent.trim().toLowerCase();
            return adminData.agents.find(function (a) { return a.name.toLowerCase() === name || a.slug === name; });
        }
        function push(field, value) {
            var row = currentRow(); if (!row) return;
            var cur = (dirty['agent:' + row.id] || {}).patch || {};
            var patch = {}; patch[field] = value;
            markDirty('agent:' + row.id, { type: 'row', res: 'agents', id: row.id, patch: Object.assign(cur, patch) });
        }
        title.setAttribute('data-re', ''); title.setAttribute('contenteditable', 'plaintext-only');
        title.addEventListener('input', function () { push('name', title.textContent.trim()); });
        desc.setAttribute('data-re', ''); desc.setAttribute('contenteditable', 'true');
        desc.addEventListener('input', function () { push('description', desc.innerHTML.trim()); });
        if (img) {
            img.classList.add('re-imgpick');
            img.title = 'Klik untuk ganti gambar (path/URL)';
            img.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                var v = prompt('Path/URL gambar agent ini:', img.getAttribute('src') || '');
                if (v && v.trim()) { img.src = v.trim(); push('image', v.trim()); }
            });
        }
    }

    // ── cegah interaksi demo saat mode edit ──────────────────────
    document.addEventListener('click', function (e) {
        if (e.target.closest('.re-ctl, .re-toolbar')) return;
        // chip & agent-opt & tombol skill: jangan memicu chat/ekspor saat diedit
        if (e.target.closest('#chatWelcomeState .chip, .agent-opt, [class*="btn-skill-"]')) {
            e.stopPropagation();
            if (e.target.closest('[class*="btn-skill-"]')) e.preventDefault();
        }
    }, true);

    // ── boot: verifikasi token lalu aktifkan semua modul ─────────
    function banner(msg) {
        var b = document.createElement('div');
        b.className = 're-banner'; b.innerHTML = msg;
        document.body.appendChild(b);
    }
    if (!tok) {
        banner('Mode edit butuh login admin — <a href="api/admin">masuk di sini</a>, lalu kembali via tombol "Edit Visual".');
        bar.remove();
        return;
    }
    Promise.all([req('/admin/agents'), req('/admin/skills')]).then(function (r) {
        adminData.agents = r[0]; adminData.skills = r[1];
        renderToolbar();
        initChips();
        initSkills();
        initAgentDropdown();
        initCarousel();
        window.__reddieEditorReady = true;
        console.log('[reddie-editor] aktif —', TEXT_BINDINGS.length, 'teks,', adminData.skills.length, 'skill,', adminData.agents.length, 'agent');
    }).catch(function (e) {
        bar.remove();
        if (e.status === 401) banner('Sesi admin kedaluwarsa — <a href="api/admin">login ulang</a> lalu kembali ke mode edit.');
        else banner('Editor gagal memuat data: ' + esc(e.message));
    });
})();
