/*
   REDDIE LIVE LAYER
   Integrasi landing page dengan reddie-api (CMS + chat multi-provider + leads + ekspor).
   Prinsip: PROGRESSIVE ENHANCEMENT — bila API tidak terjangkau, seluruh halaman
   tetap berjalan dengan konten hardcoded & mock chat bawaan script.js.
*/
(function () {
    'use strict';

    // API relatif terhadap halaman: /dev-reddie/ -> /dev-reddie/api/...
    var API = 'api';
    var state = {
        ready: false,          // true bila /api/content berhasil dimuat
        models: [],
        settings: {},
        skills: [],
        sessionId: sessionStorage.getItem('reddieSession') || null,
    };

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ── Klien API publik (dipakai script.js) ─────────────────────────
    window.REDDIE_API = {
        get ready() { return state.ready; },
        chat: function (message) {
            return fetch(API + '/chat', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    sessionId: state.sessionId,
                    agent: (window.__reddieAgent || 'reddie'),
                    model: (window.__reddieModelId || null),
                    message: message,
                }),
            }).then(function (r) {
                return r.json().then(function (d) {
                    if (d.sessionId) {
                        state.sessionId = d.sessionId;
                        sessionStorage.setItem('reddieSession', d.sessionId);
                    }
                    if (!r.ok) { var e = new Error(d.error || 'HTTP ' + r.status); e.status = r.status; e.userMessage = d.error; throw e; }
                    return d;
                });
            });
        },
        lead: function (data) {
            // fire-and-forget; kegagalan tidak boleh mengganggu UX
            return fetch(API + '/leads', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(data),
            }).catch(function () {});
        },
    };

    // ── Hidrasi konten dari CMS ──────────────────────────────────────
    // Kontrak: HTML menyatakan kunci kontennya sendiri lewat data-cms,
    // jadi tidak ada lagi selektor CSS rapuh di berkas ini.
    //
    //   data-cms="grup.field"          -> isi teks elemen
    //   data-cms-attr="placeholder"    -> isi atribut itu, bukan teksnya
    //   data-cms-href="grup.field"     -> isi href (boleh bareng data-cms)
    //
    // Teks bawaan di HTML selalu jadi cadangan: bila kunci tidak ada di CMS
    // atau nilainya kosong, elemen dibiarkan apa adanya.

    function lookup(key) {
        var i = String(key).indexOf('.');
        if (i < 0) return undefined;
        var grp = (state.settings || {})[key.slice(0, i)];
        return grp ? grp[key.slice(i + 1)] : undefined;
    }

    function hydrateText(root) {
        var scope = root || document;
        var n = 0;
        [].forEach.call(scope.querySelectorAll('[data-cms]'), function (el) {
            var v = lookup(el.getAttribute('data-cms'));
            if (v == null || v === '') return;
            var attr = el.getAttribute('data-cms-attr');
            if (attr) el.setAttribute(attr, v);
            else el.textContent = v;
            n++;
        });
        [].forEach.call(scope.querySelectorAll('[data-cms-href]'), function (el) {
            var v = lookup(el.getAttribute('data-cms-href'));
            if (v) el.setAttribute('href', v);
        });
        return n;
    }

    // Daftar & blok yang dirender ulang (bukan sekadar diisi teksnya)
    function hydrateLists(root) {
        var scope = root || document;

        // Chip saran di panel chat
        var chips = (state.settings.welcome || {}).chips;
        var chipsBox = scope.querySelector('#chatWelcomeState .suggestion-chips');
        if (chipsBox && Array.isArray(chips) && chips.length) {
            chipsBox.innerHTML = chips.map(function (c) {
                return '<button class="chip">' + esc(c) + '</button>';
            }).join('');
            if (window.bindChipClickListeners) window.bindChipClickListeners();
        }

        // Kartu AI Skills — ditemukan lewat penanda, bukan tebakan gaya inline
        var skillsWrap = scope.querySelector('[data-cms-skills]');
        if (skillsWrap && (state.skills || []).length) {
            skillsWrap.innerHTML = state.skills.map(function (k) {
                var color = k.color || '#ef4444';
                var icon = esc(k.icon || 'fa-bolt');
                return '<div style="background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.05); border-radius: 12px; padding: 0.9rem; display: flex; flex-direction: column; gap: 0.6rem;">' +
                    '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<span style="width:32px;height:32px;border-radius:8px;background:' + esc(color) + '1a;display:flex;align-items:center;justify-content:center;color:' + esc(color) + ';"><i class="fa-solid ' + icon + '" style="font-size:1.1rem;"></i></span>' +
                    '<div><h4 style="margin:0;font-size:0.85rem;color:#111827;font-weight:700;">' + esc(k.title) + '</h4>' +
                    '<span style="font-size:0.68rem;color:#6b7280;font-weight:500;">' + esc(k.subtitle || '') + '</span></div></div>' +
                    '<p style="margin:0;font-size:0.75rem;color:#4b5563;line-height:1.4;">' + esc(k.description || '') + '</p>' +
                    '<button class="btn-escalate btn-skill-' + esc(k.slug) + '" style="background:' + esc(color) + ';color:white;border:none;font-weight:700;width:100%;padding:0.55rem;border-radius:6px;cursor:pointer;transition:all 0.2s;font-size:0.78rem;">' +
                    '<i class="fa-solid ' + icon + '"></i> ' + esc(k.button_label || k.title) + '</button></div>';
            }).join('');
        }
    }

    // Dipanggil ulang oleh script.js setiap kali sebagian DOM diganti,
    // supaya konten CMS tidak tertimpa markup bawaan.
    function rehydrate(root) {
        if (!state.ready) return 0;
        var n = hydrateText(root);
        hydrateLists(root);
        return n;
    }
    window.REDDIE_HYDRATE = rehydrate;

    function hydrate(d) {
        state.settings = d.settings || {};
        state.skills = d.skills || [];

        hydrateText(document);
        hydrateLists(document);

        // Dropdown agent. data-agent memakai SLUG, bukan nama tampilan —
        // supaya mengganti nama agent di CMS tidak memutus rutenya ke server.
        var dd = document.querySelector('.db-agent-dropdown-content');
        var dropdownAgents = (d.agents || []).filter(function (a) { return a.show_in_dropdown; });
        if (dd && dropdownAgents.length) {
            dd.innerHTML = dropdownAgents.map(function (a, i) {
                return '<div class="agent-opt' + (i === 0 ? ' active' : '') + '" data-agent="' + esc(a.slug) + '">' + esc(a.name) + '</div>';
            }).join('');
            var btn = document.getElementById('activeAgentBtn');
            if (btn) {
                var dot = btn.querySelector('.status-dot');
                btn.innerHTML = (dot ? dot.outerHTML : '') + ' ' + esc(dropdownAgents[0].name) +
                    ' <i class="fa-solid fa-chevron-down"></i>';
            }
        }

        // Carousel About (dibaca script.js lewat override)
        var carousel = (d.agents || []).filter(function (a) { return a.show_in_carousel; });
        if (carousel.length) {
            window.__aboutAgentsOverride = carousel.map(function (a) {
                return { name: String(a.name).toUpperCase(), image: a.image, desc: a.description || '' };
            });
        }

        // Panel Model (toolbar chat) dari registry API
        if ((d.models || []).length) {
            state.models = d.models;
            var def = d.models.filter(function (m) { return m.is_default; })[0] || d.models[0];
            window.__reddieModelId = def.model_id;
            var panel = document.getElementById('modelPanel');
            if (panel) {
                var colors = { anthropic: '#ff3333', openai: '#10a37f', deepseek: '#4d6bfe', custom: '#7c3aed', echo: '#6b7280' };
                panel.innerHTML =
                    '<div class="toolbar-panel-header">Select Model <span class="panel-close-btn" data-panel="modelPanel">&#x2715;</span></div>' +
                    d.models.map(function (m) {
                        var col = colors[m.provider] || '#ff3333';
                        return '<div class="model-option' + (m.model_id === def.model_id ? ' selected' : '') + '" data-model="' + esc(m.label) + '" data-model-id="' + esc(m.model_id) + '" data-color="' + col + '">' +
                            '<div class="model-icon" style="background:' + col + '1f;color:' + col + ';">&#x25C6;</div>' +
                            '<div class="model-info"><div class="model-name">' + esc(m.label) +
                            (m.is_default ? ' <span class="model-badge badge-active">Default</span>' : '') +
                            '</div><div class="model-desc">' + esc(m.provider) + ' · ' + esc(m.model_id) + '</div></div>' +
                            '<i class="fa-solid fa-circle-check model-check"></i></div>';
                    }).join('');
            }
        }
    }

    // ── AI Skills: dikerjakan server, bukan disalin dari DOM ─────────
    // Versi lama menyalin teks dari layar, jadi hasilnya kehilangan waktu
    // tiap pesan, model yang dipakai, dan ID sesi — semuanya tidak ada di
    // DOM. Sekarang server membacanya langsung dari database.

    function say(msg) {
        if (window.appendMessage) { window.appendMessage(msg, 'agent'); }
        if (window.scrollToBottom) window.scrollToBottom();
    }

    function openConversation() {
        var w = document.getElementById('chatWelcomeState');
        var c = document.getElementById('chatConversation');
        if (w && c && w.style.display !== 'none') { w.style.display = 'none'; c.style.display = 'flex'; }
    }

    function needSession() {
        if (state.sessionId) return true;
        openConversation();
        say('Belum ada percakapan untuk diproses — kirim satu pesan dulu.');
        return false;
    }

    // Unduh berkas biner dari endpoint POST.
    function downloadSkill(kind, label) {
        if (!needSession()) return;
        openConversation();
        say('Menyiapkan ' + label + ' dari catatan server…');
        fetch(API + '/skills/' + kind, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: state.sessionId }),
        }).then(function (r) {
            if (!r.ok) {
                return r.json().catch(function () { return {}; }).then(function (d) {
                    throw new Error(d.error || 'Gagal (HTTP ' + r.status + ')');
                });
            }
            var name = 'reddie-transkrip.' + (kind === 'pdf' ? 'pdf' : 'xlsx');
            var cd = r.headers.get('content-disposition') || '';
            var m = cd.match(/filename="([^"]+)"/);
            if (m) name = m[1];
            return r.blob().then(function (blob) {
                var a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name;
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
                say('**' + name + '** telah diunduh (' + Math.max(1, Math.round(blob.size / 1024)) + ' KB).');
            });
        }).catch(function (e) {
            say('Gagal menyiapkan ' + label + ': ' + e.message);
        });
    }

    // Sync: AI membaca percakapan, hasilnya jadi tiket + kiriman webhook.
    function runSync() {
        if (!needSession()) return;
        openConversation();
        say('Menganalisis percakapan…');
        fetch(API + '/skills/sync', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: state.sessionId }),
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error(d.error || 'Gagal (HTTP ' + r.status + ')');
                return d;
            });
        }).then(function (d) {
            var title = ((state.settings.integrations || {}).sync_label) || 'Tiket dibuat';
            var lines = ['**' + title + ' #' + d.ticket + '**', '', 'Ringkasan: ' + d.ringkasan];
            if (d.kebutuhan) lines.push('Kebutuhan: ' + d.kebutuhan);
            lines.push('Prioritas: ' + d.prioritas);
            lines.push('Kontak: ' + (d.kontak || 'belum diberikan'));
            if (d.topik && d.topik.length) lines.push('Topik: ' + d.topik.join(', '));
            if (d.webhook === 'terkirim') lines.push('', 'Terkirim ke sistem otomasi.');
            else if (d.webhook === 'gagal') lines.push('', 'Webhook otomasi gagal: ' + (d.webhook_reason || '-'));
            say(lines.join('\n'));
        }).catch(function (e) {
            say('Sync gagal: ' + e.message);
        });
    }

    // Capture-phase supaya handler mock di script.js tidak ikut berjalan.
    document.addEventListener('click', function (e) {
        if (!state.ready) return;                       // API mati -> biarkan mock lama
        var pdf  = e.target.closest('.btn-skill-pdf');
        var xls  = e.target.closest('.btn-skill-excel');
        var sync = e.target.closest('.btn-skill-sync');
        if (!pdf && !xls && !sync) return;
        e.stopPropagation(); e.preventDefault();
        if (pdf) downloadSkill('pdf', 'PDF');
        else if (xls) downloadSkill('xlsx', 'spreadsheet');
        else runSync();
    }, true);

    // ── Lampiran: berkas dibaca server, teksnya masuk ke percakapan ──
    var ACCEPT = '.pdf,.docx,.xlsx,.xlsm,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.gif,' +
                 'application/pdf,image/*';

    function uploadAttachment(file) {
        say('Membaca **' + file.name + '**…');
        return file.arrayBuffer().then(function (buf) {
            var h = {
                'content-type': file.type || 'application/octet-stream',
                'x-filename': encodeURIComponent(file.name),
            };
            if (state.sessionId) h['x-session'] = state.sessionId;
            return fetch(API + '/attachments', { method: 'POST', headers: h, body: buf });
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error(d.error || 'Gagal (HTTP ' + r.status + ')');
                return d;
            });
        }).then(function (d) {
            if (d.sessionId) {
                state.sessionId = d.sessionId;
                try { sessionStorage.setItem('reddieSession', d.sessionId); } catch (e) {}
            }
            var how = {
                'pdf': 'PDF', 'pdf-ocr': 'PDF hasil pindai, dibaca OCR', 'docx': 'Word',
                'sheet': 'spreadsheet', 'ocr': 'gambar, dibaca OCR', 'text': 'teks',
            }[d.method] || d.method;
            var bits = [how];
            if (d.pages) bits.push(d.pages + ' halaman');
            bits.push(d.chars.toLocaleString('id-ID') + ' karakter');
            say('**' + d.filename + '** terbaca (' + bits.join(', ') + ')' +
                (d.truncated ? ' — dokumen panjang, hanya bagian awal yang dipakai' : '') +
                '.\n\nSilakan tanyakan apa saja tentang isinya.');
        }).catch(function (e) {
            say('Gagal membaca **' + file.name + '**: ' + e.message);
        });
    }

    var attachInput = null;
    function pickAttachment() {
        if (!attachInput) {
            attachInput = document.createElement('input');
            attachInput.type = 'file';
            attachInput.accept = ACCEPT;
            attachInput.multiple = true;
            attachInput.style.display = 'none';
            document.body.appendChild(attachInput);
            attachInput.addEventListener('change', function () {
                var files = [].slice.call(attachInput.files);
                attachInput.value = '';
                if (!files.length) return;
                openConversation();
                files.reduce(function (chain, f) {
                    return chain.then(function () { return uploadAttachment(f); });
                }, Promise.resolve());
            });
        }
        attachInput.click();
    }

    document.addEventListener('click', function (e) {
        if (!state.ready) return;                 // API mati -> biarkan perilaku lama
        if (!e.target.closest('#optAttach')) return;
        e.stopPropagation(); e.preventDefault();
        pickAttachment();
    }, true);

    // ── Lacak pilihan agent & model dari UI yang sudah ada ───────────
    document.addEventListener('click', function (e) {
        var opt = e.target.closest('.agent-opt');
        if (opt && opt.dataset.agent) window.__reddieAgent = opt.dataset.agent.toLowerCase();
        var mo = e.target.closest('.model-option');
        if (mo && mo.dataset.modelId) window.__reddieModelId = mo.dataset.modelId;
    });

    // ── Boot: coba muat konten CMS ───────────────────────────────────
    // Mode edit visual (?edit=1): muat editor SETELAH hidrasi selesai,
    // supaya binding menempel pada DOM final.
    function loadEditor() {
        if (!/[?&]edit=1/.test(location.search)) return;
        var sc = document.createElement('script');
        sc.src = 'style/editor.js?v=20260901-f5';
        document.body.appendChild(sc);
    }

    // Mode pratinjau: ?edit=1 atau ?preview=1 memuat DRAFT (isi tabel kerja)
    // alih-alih versi terbit, sehingga admin melihat hasil suntingannya
    // sebelum pengunjung melihatnya. Butuh token admin; tanpa token, server
    // mengabaikan permintaan draft dan tetap mengirim versi terbit.
    function contentRequest() {
        var preview = /[?&](edit|preview)=1/.test(location.search);
        var tok = null;
        try { tok = localStorage.getItem('tok'); } catch (e) { /* penyimpanan diblokir */ }
        if (!preview || !tok) return fetch(API + '/content', { signal: AbortSignal.timeout(6000) });
        return fetch(API + '/content?draft=1', {
            headers: { authorization: 'Bearer ' + tok },
            signal: AbortSignal.timeout(6000),
        });
    }

    function draftBanner() {
        var b = document.createElement('div');
        b.textContent = 'PRATINJAU DRAFT — belum terlihat pengunjung';
        b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99998;background:#b45309;' +
            'color:#fff;text-align:center;padding:.4rem;font:700 12px system-ui,sans-serif;' +
            'letter-spacing:.04em';
        document.body.appendChild(b);
    }

    document.addEventListener('DOMContentLoaded', function () {
        contentRequest()
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                state.ready = true;
                window.__reddieContent = d;
                hydrate(d);
                if (d.draft) draftBanner();
                console.log('[reddie-live] CMS aktif —', d.draft ? 'PRATINJAU DRAFT' : 'versi terbit',
                            '· model tersedia:', (d.models || []).length);
                loadEditor();
            })
            .catch(function () {
                console.log('[reddie-live] API tidak terjangkau — mode statis/mock aktif.');
                loadEditor();
            });
    });
})();
