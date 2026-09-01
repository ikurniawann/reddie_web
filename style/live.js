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
        gToken: null,      // token Google pengunjung, sengaja hanya di memori
        gEmail: null,
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
            var h = { 'content-type': 'application/json' };
            // Token Google ikut dikirim supaya meeting yang dijadwalkan lewat
            // percakapan mendarat di kalender pengunjung, bukan jadwal internal.
            if (state.gToken) h['x-google-token'] = state.gToken;
            return fetch(API + '/chat', {
                method: 'POST',
                headers: h,
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
                    // Task diubah lewat percakapan -> panel ikut menyegar,
                    // supaya angka dan daftarnya tidak bertentangan dengan
                    // apa yang barusan dikatakan agent di chat.
                    if (d.tasksChanged) refreshTaskPanel();
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

    // ── Panel Task Focus ─────────────────────────────────────────────
    // Semua panggilan lewat server kita sendiri; token sistem task tidak
    // pernah sampai ke browser.

    // Status sistem task dipetakan ke tiga keadaan yang dipahami orang awam,
    // masing-masing dengan warna dan ikonnya sendiri.
    function taskState(t) {
        var st = String(t.status || '').toLowerCase();
        var M = {
            done:        { label: 'Selesai',     color: '#16a34a', icon: 'fa-circle-check' },
            cancelled:   { label: 'Dibatalkan',  color: '#9ca3af', icon: 'fa-ban' },
            in_progress: { label: 'Active',      color: '#16a34a', icon: 'fa-circle-check' },
            in_review:   { label: 'In Review',   color: '#7c3aed', icon: 'fa-eye' },
            blocked:     { label: 'Blocked',     color: '#dc2626', icon: 'fa-circle-exclamation' },
            todo:        { label: 'Queued',      color: '#6b7280', icon: 'fa-clock' },
            backlog:     { label: 'Backlog',     color: '#6b7280', icon: 'fa-layer-group' },
        };
        // Status tak dikenal ditampilkan apa adanya, bukan disembunyikan —
        // supaya status baru di sisi sistem task tetap terlihat.
        return M[st] || { label: st || 'Pending', color: '#ca8a04', icon: 'fa-circle-notch' };
    }

    // "Besok, 14.00" lebih mudah dibaca daripada tanggal penuh, dan itu yang
    // sebenarnya ingin diketahui orang saat melihat daftar task.
    function whenLabel(t) {
        if (!t.due) return 'Tanpa tenggat';
        var d = new Date(t.due);
        if (isNaN(d)) return String(t.due).slice(0, 40);
        var now = new Date();
        var hari = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        var ini = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        var beda = Math.round((hari - ini) / 86400000);
        var jam = d.getHours() || d.getMinutes()
            ? ', ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';
        if (beda === 0) return 'Hari ini' + jam;
        if (beda === 1) return 'Besok' + jam;
        if (beda === -1) return 'Kemarin' + jam;
        if (beda > 1 && beda < 7) return d.toLocaleDateString('id-ID', { weekday: 'long' }) + jam;
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + jam;
    }

    function taskRow(t) {
        var s = taskState(t);
        return '<div style="background:rgba(0,0,0,.045);border:1px solid rgba(0,0,0,.05);border-radius:11px;' +
               'padding:.7rem .8rem;margin-bottom:.6rem;">' +
               '<div style="font-size:.8rem;color:#6b7280;line-height:1.3;">' + esc(t.title) + '</div>' +
               (t.eventName ? '<div style="font-size:.66rem;color:#9ca3af;line-height:1.3;">' +
                              esc(t.eventName) + '</div>' : '') +
               '<div style="font-size:.98rem;color:#111827;font-weight:700;line-height:1.35;margin-top:.1rem;' +
               (t.done ? 'text-decoration:line-through;opacity:.5;' : '') + '">' + esc(whenLabel(t)) + '</div>' +
               '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:.3rem;">' +
                 '<span style="font-size:.8rem;font-weight:700;color:' + s.color + ';display:flex;align-items:center;gap:.3rem;">' +
                   '<i class="fa-solid ' + s.icon + '"></i>' + s.label + '</span>' +
                 (t.done ? '' :
                   '<button data-done="' + esc(t.id) + '" style="background:none;border:1px solid rgba(0,0,0,.12);' +
                   'border-radius:99px;padding:.12rem .55rem;font:600 .66rem system-ui;color:#374151;cursor:pointer;">' +
                   'Tandai selesai</button>') +
               '</div></div>';
    }

    function renderTasks(box, d) {
        if (!d.configured) {
            box.innerHTML = '<p style="font-size:.78rem;color:#6b7280;margin:0;line-height:1.5;">' +
                'Panel task belum tersambung. Isi alamat API dan nomor akun demo di panel admin, ' +
                'bagian <b>Integrasi &amp; otomasi</b>.</p>';
            return;
        }
        var S = (state.settings.console || {});
        var tasks = d.tasks || [];
        // Panel hanya menampilkan beberapa teratas, tapi progres dihitung dari
        // SELURUH task di sistem supaya angkanya tidak menyesatkan.
        var running = (typeof d.running === 'number') ? d.running : tasks.length;
        var done = (typeof d.done === 'number') ? d.done : 0;
        var total = (typeof d.total === 'number') ? d.total : (running + done);
        var pct = total ? Math.round(done / total * 100) : 0;
        var lbl = function (k, f) { return esc(S[k] || f); };

        box.innerHTML =
            '<div style="font-size:.7rem;font-weight:800;letter-spacing:.09em;color:#6b7280;margin-bottom:.55rem;">' +
              lbl('task_section', 'UPCOMING TASKS') + '</div>' +
            (tasks.length
              ? tasks.slice(0, 6).map(taskRow).join('')
              : '<p style="font-size:.78rem;color:#6b7280;margin:0 0 .6rem;">Belum ada task. Buat yang pertama di bawah.</p>') +

            '<div style="font-size:.7rem;font-weight:800;letter-spacing:.09em;color:#6b7280;margin:1.1rem 0 .55rem;">' +
              lbl('task_progress', 'WEEKLY TASK COMPLETION') + '</div>' +
            '<div style="background:rgba(255,255,255,.75);border:1px solid rgba(0,0,0,.05);border-radius:11px;padding:.8rem .85rem;">' +
              '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:.5rem;">' +
                '<span style="font-size:.88rem;font-weight:700;color:#111827;">Progress Score</span>' +
                '<span style="font-size:.95rem;font-weight:800;color:#111827;">' + pct + '%</span></div>' +
              '<div style="height:9px;background:#d6d3d1;border-radius:99px;overflow:hidden;">' +
                '<div style="height:100%;width:' + pct + '%;background:#a855f7;border-radius:99px;transition:width .4s;"></div>' +
              '</div>' +
              '<div style="font-size:.68rem;color:#6b7280;margin-top:.45rem;">' + done + ' dari ' + total +
              ' task selesai · ' + running + ' sedang berjalan</div>' +
            '</div>' +

            '<p data-taskmsg style="font-size:.7rem;color:#6b7280;margin:.7rem 0 0;text-align:center;"></p>';
    }

    function loadTasks() {
        var box = document.querySelector('[data-taskpanel]');
        if (!box) return Promise.resolve();
        return fetch(API + '/tasks', { signal: AbortSignal.timeout(15000) })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (d) { renderTasks(box, d); })
            .catch(function () {
                box.innerHTML = '<p style="font-size:.75rem;color:#b91c1c;margin:0;">' +
                    'Sistem task tidak terjangkau saat ini.</p>';
            });
    }
    window.REDDIE_TASKS = loadTasks;

    // Dipanggil setelah percakapan mengubah task. Kedipan singkat memberi
    // tahu bahwa panel benar-benar dimuat ulang — tanpa itu, perubahan pada
    // daftar yang panjang mudah terlewat.
    function refreshTaskPanel() {
        var box = document.querySelector('[data-taskpanel]');
        if (!box) return;                       // menu Task Focus sedang tidak dibuka
        box.style.transition = 'opacity .15s';
        box.style.opacity = '0.35';
        // Opasitas dipulihkan setelah data benar-benar sampai, bukan setelah
        // jeda tetap — kalau jaringan lambat, panel jangan terang lebih dulu
        // sementara isinya masih yang lama.
        loadTasks().then(function () { box.style.opacity = '1'; });
    }
    window.REDDIE_TASKS_REFRESH = refreshTaskPanel;

    function taskMsg(t, bad) {
        var el = document.querySelector('[data-taskmsg]');
        if (el) { el.textContent = t || ''; el.style.color = bad ? '#b91c1c' : '#6b7280'; }
    }

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-done]');
        if (!btn || btn.disabled) return;
        e.preventDefault();
        btn.disabled = true; btn.textContent = 'Menyimpan…';
        taskMsg('');
        fetch(API + '/tasks/' + encodeURIComponent(btn.dataset.done), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ status: 'done' }),
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error(d.error || 'Gagal (HTTP ' + r.status + ')');
            });
        }).then(function () { loadTasks(); })
          .catch(function (err) {
              btn.disabled = false; btn.textContent = 'Tandai selesai';
              taskMsg(err.message, true);
          });
    });

    // ── Masuk Google (SSO) ───────────────────────────────────────────
    // Token akses disimpan di MEMORI saja, tidak di localStorage: ia berlaku
    // satu jam dan tidak perlu bertahan melewati muat ulang halaman. Menaruh
    // token orang lain di penyimpanan browser hanya menambah permukaan risiko
    // tanpa manfaat.
    var gisLoading = null;

    function loadGis() {
        if (window.google && window.google.accounts && window.google.accounts.oauth2) {
            return Promise.resolve();
        }
        if (gisLoading) return gisLoading;
        gisLoading = new Promise(function (resolve, reject) {
            var sc = document.createElement('script');
            sc.src = 'https://accounts.google.com/gsi/client';
            sc.async = true;
            sc.onload = resolve;
            sc.onerror = function () { reject(new Error('Skrip Google gagal dimuat.')); };
            document.head.appendChild(sc);
        });
        return gisLoading;
    }

    function googleSignIn(clientId, scope, onDone) {
        loadGis().then(function () {
            var client = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: scope || 'https://www.googleapis.com/auth/calendar.events',
                callback: function (resp) {
                    if (resp && resp.access_token) {
                        state.gToken = resp.access_token;
                        onDone(null);
                    } else {
                        onDone(new Error(resp && resp.error_description
                            ? resp.error_description : 'Akses Google tidak diberikan.'));
                    }
                },
                error_callback: function (err) {
                    onDone(new Error(err && err.type === 'popup_closed'
                        ? 'Jendela masuk ditutup sebelum selesai.'
                        : 'Masuk Google gagal.'));
                },
            });
            client.requestAccessToken();
        }).catch(onDone);
    }

    // ── Modul Schedule ───────────────────────────────────────────────
    var schedTab = 'list';

    function schedRow(e) {
        var d = new Date(e.date);
        var when = isNaN(d) ? String(e.date || '') : whenLabel({ due: e.date });
        var kind = String(e.kind || '').toLowerCase();
        var col = kind === 'meeting' ? '#7c3aed' : kind === 'show' ? '#dc2626' : '#6b7280';
        return '<div style="background:rgba(0,0,0,.045);border:1px solid rgba(0,0,0,.05);border-radius:11px;' +
               'padding:.7rem .8rem;margin-bottom:.6rem;">' +
               '<div style="font-size:.8rem;color:#6b7280;line-height:1.3;">' + esc(e.title || '(tanpa judul)') + '</div>' +
               (e.eventName ? '<div style="font-size:.66rem;color:#9ca3af;">' + esc(e.eventName) + '</div>' : '') +
               '<div style="font-size:.98rem;color:#111827;font-weight:700;margin-top:.1rem;">' + esc(when) + '</div>' +
               (kind ? '<span style="display:inline-block;margin-top:.25rem;font-size:.6rem;font-weight:700;' +
                       'text-transform:uppercase;color:' + col + ';border:1px solid ' + col + '33;border-radius:99px;' +
                       'padding:.1rem .45rem;">' + esc(kind) + '</span>' : '') +
               '</div>';
    }

    function renderSchedList(box, d) {
        if (!d.configured) {
            box.innerHTML = '<p style="font-size:.78rem;color:#6b7280;margin:0;line-height:1.5;">' +
                'Modul jadwal belum tersambung. Isi pengaturan di panel admin, ' +
                'bagian <b>Integrasi &amp; otomasi</b>.</p>';
            return;
        }
        var items = d.entries || [];
        box.innerHTML =
            '<div style="font-size:.7rem;font-weight:800;letter-spacing:.09em;color:#6b7280;margin-bottom:.55rem;">' +
              'JADWAL TERDEKAT</div>' +
            (items.length ? items.slice(0, 6).map(schedRow).join('')
                          : '<p style="font-size:.78rem;color:#6b7280;margin:0;">Belum ada jadwal dalam 30 hari ke depan.</p>');
    }

    function renderMeeting(box, d) {
        var g = d.google || {};
        var masuk = !!state.gToken;
        box.innerHTML =
            '<div style="font-size:.7rem;font-weight:800;letter-spacing:.09em;color:#6b7280;margin-bottom:.55rem;">' +
              'MEETING BARU</div>' +
            (masuk
              ? '<p style="font-size:.75rem;color:#16a34a;margin:0 0 .7rem;">' +
                '<i class="fa-solid fa-circle-check"></i> Masuk sebagai ' +
                esc(state.gEmail || 'akun Google Anda') + ' — meeting masuk ke kalender Anda sendiri.</p>'
              : g.sso
                ? '<button data-gsignin style="width:100%;margin-bottom:.8rem;background:#fff;color:#3c4043;' +
                  'border:1px solid #dadce0;border-radius:8px;padding:.6rem;font:600 .8rem system-ui;' +
                  'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:.5rem;">' +
                  '<i class="fa-brands fa-google" style="color:#4285f4;"></i> Masuk dengan Google</button>'
                : '<div style="background:rgba(202,138,4,.08);border:1px solid rgba(202,138,4,.25);' +
                  'border-radius:9px;padding:.6rem .7rem;margin:0 0 .8rem;">' +
                  '<p style="font-size:.74rem;color:#92400e;margin:0;line-height:1.5;">' +
                  '<i class="fa-solid fa-circle-exclamation"></i> <b>Tombol masuk Google belum aktif.</b><br>' +
                  'Isi <b>Google OAuth Client ID</b> di panel admin &rarr; Konten situs &rarr; ' +
                  'Integrasi &amp; otomasi. Sementara ini meeting dicatat sebagai jadwal internal.</p></div>') +
            '<div style="display:flex;flex-direction:column;gap:.5rem;">' +
              '<input data-mtitle placeholder="Judul meeting" style="font:inherit;font-size:.78rem;padding:.5rem .6rem;' +
                'border:1px solid rgba(0,0,0,.15);border-radius:8px;">' +
              '<input data-mwhen type="datetime-local" style="font:inherit;font-size:.78rem;padding:.5rem .6rem;' +
                'border:1px solid rgba(0,0,0,.15);border-radius:8px;">' +
              '<input data-mguests placeholder="Email peserta, pisahkan koma (opsional)" style="font:inherit;font-size:.78rem;' +
                'padding:.5rem .6rem;border:1px solid rgba(0,0,0,.15);border-radius:8px;">' +
            '</div>' +
            '<button data-mcreate style="width:100%;margin-top:.8rem;background:#16192a;color:#fff;border:none;' +
              'border-radius:11px;padding:.7rem;font:800 .85rem system-ui;cursor:pointer;">Add New Meeting</button>' +
            '<button data-mchat style="width:100%;margin-top:.5rem;background:none;color:#374151;' +
              'border:1px solid rgba(0,0,0,.15);border-radius:11px;padding:.6rem;font:700 .78rem system-ui;cursor:pointer;">' +
              '<i class="fa-solid fa-comment-dots"></i> Atur lewat chat</button>' +
            '<p data-mmsg style="font-size:.7rem;color:#6b7280;margin:.6rem 0 0;text-align:center;"></p>';
    }

    function loadSchedule() {
        var box = document.querySelector('[data-schedpanel]');
        if (!box) return Promise.resolve();
        return fetch(API + '/schedule', { signal: AbortSignal.timeout(15000) })
            .then(function (r) { return r.json().catch(function () { return {}; }); })
            .then(function (d) {
                window.__reddieSchedule = d;
                if (schedTab === 'meeting') renderMeeting(box, d); else renderSchedList(box, d);
            })
            .catch(function () {
                box.innerHTML = '<p style="font-size:.78rem;color:#b91c1c;margin:0;">Jadwal tidak terjangkau saat ini.</p>';
            });
    }
    window.REDDIE_SCHEDULE = function () { schedTab = 'list'; return loadSchedule(); };

    document.addEventListener('click', function (e) {
        var tab = e.target.closest('[data-schedtab]');
        if (tab) {
            e.preventDefault();
            schedTab = tab.dataset.schedtab;
            [].forEach.call(document.querySelectorAll('[data-schedtab]'), function (t) {
                t.classList.toggle('active', t === tab);
            });
            loadSchedule();
            return;
        }
        if (e.target.closest('[data-mchat]')) {
            e.preventDefault();
            // Arahkan ke chat dengan kalimat contoh yang tinggal disunting —
            // lebih cepat daripada mengisi tiga kolom terpisah.
            var input = document.getElementById('chatInput');
            if (input) {
                input.value = 'Jadwalkan meeting besok jam 10 pagi, judulnya ';
                input.focus();
                input.setSelectionRange(input.value.length, input.value.length);
            }
            return;
        }
        if (e.target.closest('[data-gsignin]')) {
            e.preventDefault();
            var btn = e.target.closest('[data-gsignin]');
            btn.disabled = true; btn.textContent = 'Membuka Google…';
            var g = (window.__reddieSchedule || {}).google || {};
            googleSignIn(g.clientId, g.scope, function (err) {
                if (err) { btn.disabled = false; btn.innerHTML = '<i class="fa-brands fa-google"></i> Masuk dengan Google'; meetMsg(err.message, true); return; }
                loadSchedule();
            });
            return;
        }
        if (e.target.closest('[data-mcreate]')) { e.preventDefault(); createMeeting(); }
    });

    function meetMsg(t, bad) {
        var el = document.querySelector('[data-mmsg]');
        if (el) { el.textContent = t || ''; el.style.color = bad ? '#b91c1c' : '#6b7280'; }
    }

    function createMeeting() {
        var title = (document.querySelector('[data-mtitle]') || {}).value || '';
        var when = (document.querySelector('[data-mwhen]') || {}).value || '';
        var guests = (document.querySelector('[data-mguests]') || {}).value || '';
        if (!title.trim()) { meetMsg('Judul meeting wajib diisi.', true); return; }
        if (!when) { meetMsg('Waktu meeting wajib diisi.', true); return; }
        meetMsg('Membuat meeting…');
        fetch(API + '/meetings', {
            method: 'POST',
            headers: (function () {
                var h = { 'content-type': 'application/json' };
                if (state.gToken) h['x-google-token'] = state.gToken;
                return h;
            })(),
            body: JSON.stringify({ title: title.trim(), start: when, guests: guests.trim() }),
        }).then(function (r) {
            return r.json().catch(function () { return {}; }).then(function (d) {
                if (!r.ok) throw new Error(d.error || 'Gagal (HTTP ' + r.status + ')');
                return d;
            });
        }).then(function (d) {
            if (d.akun) state.gEmail = d.akun;
            meetMsg(d.google
                ? 'Meeting dibuat di Google Calendar' + (d.akun ? ' (' + d.akun + ').' : '.')
                : 'Meeting dicatat sebagai jadwal internal.');
            var t = document.querySelector('[data-mtitle]'); if (t) t.value = '';
        }).catch(function (err) { meetMsg(err.message, true); });
    }

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
                if (!r.ok) {
                    // 413 tanpa badan JSON berarti proxy yang menolak, bukan aplikasi.
                    if (r.status === 413 && !d.error) {
                        throw new Error('berkas terlalu besar untuk dikirim (batas 12 MB). ' +
                                        'Perkecil dulu, atau kirim per bagian.');
                    }
                    throw new Error(d.error || 'Gagal (HTTP ' + r.status + ')');
                }
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
        sc.src = 'style/editor.js?v=20260901-g6';
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
