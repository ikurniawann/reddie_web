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

    // ── Ekspor NYATA (menggantikan mock via capture-phase) ───────────
    function transcriptRows() {
        var rows = [];
        document.querySelectorAll('#chatConversation .chat-msg').forEach(function (m) {
            if (m.classList.contains('typing')) return;
            var bubble = m.querySelector('.msg-bubble');
            if (!bubble) return;
            rows.push({
                role: m.classList.contains('agent') ? 'Reddie' : 'User',
                text: (bubble.innerText != null ? bubble.innerText : bubble.textContent).trim(),
            });
        });
        return rows;
    }

    function exportPDF() {
        var rows = transcriptRows();
        if (!rows.length) { if (window.appendMessage) { window.appendMessage('System Socket: Transkrip masih kosong — mulai chat dulu sebelum ekspor PDF.', 'agent'); window.scrollToBottom(); } return; }
        var w = window.open('', '_blank', 'width=760,height=900');
        if (!w) return;
        w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reddie Chat Transcript</title><style>' +
            'body{font-family:system-ui,sans-serif;max-width:640px;margin:2rem auto;color:#111}' +
            'h1{font-size:1.2rem;color:#ff3333} .meta{color:#6b7280;font-size:.8rem;margin-bottom:1.2rem}' +
            '.m{margin:.6rem 0;padding:.6rem .8rem;border-radius:10px;font-size:.86rem;white-space:pre-wrap}' +
            '.u{background:#fee2e2;margin-left:3rem} .a{background:#f3f4f6;margin-right:3rem}' +
            '.r{font-weight:700;font-size:.7rem;text-transform:uppercase;color:#6b7280;margin-bottom:.2rem}' +
            '@media print{body{margin:0.5cm auto}}</style></head><body>' +
            '<h1>REDDIE — Chat Transcript</h1><div class="meta">' + esc(new Date().toLocaleString()) + ' · ' + rows.length + ' pesan · contoh.reddie.id/dev-reddie</div>' +
            rows.map(function (r) {
                return '<div class="m ' + (r.role === 'User' ? 'u' : 'a') + '"><div class="r">' + esc(r.role) + '</div>' + esc(r.text) + '</div>';
            }).join('') + '<script>window.onload=function(){window.print()}<\/script></body></html>');
        w.document.close();
        if (window.appendMessage) { window.appendMessage('System Socket: Transkrip disiapkan — gunakan dialog cetak untuk menyimpan sebagai **PDF**.', 'agent'); window.scrollToBottom(); }
    }

    function exportCSV() {
        var rows = transcriptRows();
        if (!rows.length) { if (window.appendMessage) { window.appendMessage('System Socket: Transkrip masih kosong — mulai chat dulu sebelum ekspor spreadsheet.', 'agent'); window.scrollToBottom(); } return; }
        var csv = '﻿"No","Role","Message"\r\n' + rows.map(function (r, i) {
            return [i + 1, r.role, r.text].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
        }).join('\r\n');
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        a.download = 'reddie_chat_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        if (window.appendMessage) { window.appendMessage('System Socket: Transkrip diekspor — **' + a.download + '** (' + rows.length + ' baris) telah diunduh.', 'agent'); window.scrollToBottom(); }
    }

    // Capture-phase supaya handler mock di script.js tidak ikut jalan
    document.addEventListener('click', function (e) {
        var pdf = e.target.closest('.btn-skill-pdf');
        var xls = e.target.closest('.btn-skill-excel');
        if (!pdf && !xls) return;
        e.stopPropagation(); e.preventDefault();
        var chatWelcome = document.getElementById('chatWelcomeState');
        var conv = document.getElementById('chatConversation');
        if (chatWelcome && conv && chatWelcome.style.display !== 'none' && transcriptRows().length) {
            chatWelcome.style.display = 'none'; conv.style.display = 'flex';
        }
        if (pdf) exportPDF(); else exportCSV();
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
        sc.src = 'style/editor.js?v=20260901-f2';
        document.body.appendChild(sc);
    }

    document.addEventListener('DOMContentLoaded', function () {
        fetch(API + '/content', { signal: AbortSignal.timeout(6000) })
            .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(function (d) {
                state.ready = true;
                window.__reddieContent = d;
                hydrate(d);
                console.log('[reddie-live] CMS aktif — model tersedia:', (d.models || []).length);
                loadEditor();
            })
            .catch(function () {
                console.log('[reddie-live] API tidak terjangkau — mode statis/mock aktif.');
                loadEditor();
            });
    });
})();
