/* Web Kiosk frontend — drives Music Assistant through its native JSON-RPC + WS API. */
(function () {
    'use strict';

    var params = new URLSearchParams(location.search);
    var KIOSK = params.get('kiosk') === '1';
    var SENDSPIN = KIOSK && params.get('sendspin') === '1';
    var FLAG = function (name) { return params.get(name) !== '0'; };
    var SHOW = { controls: FLAG('controls'), party: FLAG('party'), viz: FLAG('viz'), lyrics: FLAG('lyrics') };

    var LS = {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* noop */ } }
    };
    var deviceId = params.get('device_id') || LS.get('wk_device_id');
    if (!deviceId) { deviceId = 'wk-' + crypto.randomUUID(); LS.set('wk_device_id', deviceId); }
    var MA_URL = (params.get('ma_url') || LS.get('wk_ma_url') || '').replace(/\/$/, '');
    var TOKEN = params.get('token') || LS.get('wk_token') || '';
    if (MA_URL) LS.set('wk_ma_url', MA_URL);
    if (TOKEN) LS.set('wk_token', TOKEN);

    var playerId = '';
    var ws = null;
    var msgSeq = 0;
    var playing = false;
    var current = { title: '—', artist: '—', image: '', duration: 0, uri: '', itemId: '' };
    var queue = [];
    var queueIndex = -1;
    var lyricsLines = [];
    var lyricsIdx = -1;
    var navStack = [];

    var audio = new Audio();
    audio.volume = 1;

    // --- JSON-RPC client ---
    async function rpc(command, args) {
        if (!MA_URL || !TOKEN) throw new Error('Configure ma_url + token');
        var res = await fetch(MA_URL + '/api', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
            body: JSON.stringify({ command: command, args: args || {}, message_id: String(++msgSeq) })
        });
        if (!res.ok) throw new Error(await res.text());
        return res.json();
    }

    function setStatus(t) { document.getElementById('status').textContent = t || ''; }
    function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
    function fmt(sec) {
        sec = Math.max(0, Math.floor(sec || 0));
        var m = Math.floor(sec / 60), s = sec % 60;
        return m + ':' + (s < 10 ? '0' : '') + s;
    }
    function imageUrl(item) {
        var img = item && (item.image || item.image_path || item.thumb);
        if (typeof img !== 'string' || !img) return '';
        if (img.indexOf('http') === 0) return img;
        if (img.indexOf('/') === 0) return MA_URL + img;
        return MA_URL + '/imageproxy/' + img;
    }
    function artistStr(item) {
        if (!item) return '';
        if (item.artist_str) return item.artist_str;
        if (Array.isArray(item.artists) && item.artists.length) {
            return item.artists.map(function (a) { return a && a.name ? a.name : ''; }).filter(Boolean).join(', ');
        }
        if (item.artist && typeof item.artist === 'string') return item.artist;
        return '';
    }
    function itemType(item) {
        return item && (item.media_type || item.type || '');
    }

    // --- Web Kiosk WebSocket (registration + push + position) ---
    function connectWS() {
        var proto = location.protocol === 'https:' ? 'wss' : 'ws';
        ws = new WebSocket(proto + '://' + location.host + '/ws?device_id=' + encodeURIComponent(deviceId));
        ws.onmessage = function (ev) { handleWS(JSON.parse(ev.data)); };
        ws.onclose = function () { ws = null; setTimeout(connectWS, 2000); };
        ws.onerror = function () { try { ws.close(); } catch (e) { /* noop */ } };
    }
    function sendWS(obj) { if (ws && ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(obj)); } catch (e) { /* noop */ } } }

    function handleWS(msg) {
        switch (msg.type) {
            case 'welcome':
                playerId = msg.player_id;
                setStatus('');
                break;
            case 'play':
                if (msg.path) {
                    setCurrent({ title: msg.title || '', artist: msg.artist || '', image: msg.image_url || '', duration: msg.duration || 0 });
                    audio.src = msg.path;
                    audio.play().catch(function () { /* autoplay blocked until interaction */ });
                    playing = true; sync();
                }
                break;
            case 'stop':
                audio.pause(); audio.removeAttribute('src');
                setCurrent({ title: '—', artist: '—', image: '', duration: 0 });
                playing = false; sync();
                break;
            case 'pause':
                audio.pause(); playing = false; sync();
                break;
            case 'resume':
                audio.play().catch(function () { /* noop */ }); playing = true; sync();
                break;
            case 'seek':
                if (typeof msg.position === 'number') { audio.currentTime = msg.position; }
                break;
            case 'sendspin':
                if (msg.url) location.href = msg.url;
                break;
        }
    }

    setInterval(function () {
        if (playing && ws && ws.readyState === WebSocket.OPEN) {
            sendWS({ type: 'position', position: audio.currentTime });
        }
    }, 5000);

    // --- Browsing ---
    var SECTIONS = [
        { key: 'recent', label: 'Recently played', run: function () { return rpc('music/recently_played_items', { limit: 60 }).then(function (d) { return d || []; }); } },
        { key: 'albums', label: 'Albums', run: function () { return rpc('music/albums/library_items', { limit: 60, offset: 0 }).then(list); } },
        { key: 'artists', label: 'Artists', run: function () { return rpc('music/artists/library_items', { limit: 60, offset: 0 }).then(list); } },
        { key: 'playlists', label: 'Playlists', run: function () { return rpc('music/playlists/library_items', { limit: 60, offset: 0 }).then(list); } },
        { key: 'tracks', label: 'Tracks', run: function () { return rpc('music/tracks/library_items', { limit: 200, offset: 0 }).then(list); } }
    ];
    function list(d) { return (d && d.items) ? d.items : []; }

    function buildMenu() {
        var nav = document.getElementById('menu');
        nav.innerHTML = '';
        SECTIONS.forEach(function (s, i) {
            var b = document.createElement('button');
            b.textContent = s.label;
            b.onclick = function () { loadSection(i); };
            nav.appendChild(b);
        });
    }

    function loadSection(idx) {
        document.querySelectorAll('#menu button').forEach(function (b, i) { b.classList.toggle('active', i === idx); });
        navStack = [];
        renderCrumbs();
        setStatus('Loading…');
        SECTIONS[idx].run().then(function (items) { renderGrid(items); setStatus(''); })
            .catch(function (e) { setStatus(e.message); });
    }

    function renderCrumbs() {
        var el = document.getElementById('crumbs');
        el.innerHTML = '';
        el.style.display = navStack.length ? 'block' : 'none';
        navStack.forEach(function (n, i) {
            var b = document.createElement('button');
            b.textContent = n.label + (i < navStack.length - 1 ? ' ›' : '');
            b.onclick = function () {
                navStack = navStack.slice(0, i + 1);
                renderCrumbs();
                if (n.tracks) renderTrackList(n.tracks, n.trackKind);
                else renderGrid(n.items);
            };
            el.appendChild(b);
        });
    }

    function renderGrid(items) {
        var el = document.getElementById('content');
        el.className = 'grid';
        el.innerHTML = '';
        if (!items || !items.length) { el.innerHTML = '<div class="empty">Nothing here yet</div>'; return; }
        items.forEach(function (item) {
            var card = document.createElement('div');
            card.className = 'card';
            var img = document.createElement('img');
            img.src = imageUrl(item); img.alt = '';
            var meta = document.createElement('div'); meta.className = 'meta';
            var t = document.createElement('div'); t.className = 'title'; t.textContent = item.name || '';
            var s = document.createElement('div'); s.className = 'sub'; s.textContent = artistStr(item) || '';
            meta.appendChild(t); meta.appendChild(s);
            card.appendChild(img); card.appendChild(meta);
            card.onclick = function () { openItem(item); };
            el.appendChild(card);
        });
    }

    function renderTrackList(items, kind) {
        var el = document.getElementById('content');
        el.className = 'list';
        el.innerHTML = '';
        if (!items || !items.length) { el.innerHTML = '<div class="empty">No tracks</div>'; return; }
        items.forEach(function (item) {
            var row = document.createElement('div'); row.className = 'row';
            var img = document.createElement('img'); img.src = imageUrl(item); img.alt = '';
            var meta = document.createElement('div'); meta.className = 'meta';
            var t = document.createElement('div'); t.className = 'title'; t.textContent = item.name || '';
            var s = document.createElement('div'); s.className = 'sub'; s.textContent = artistStr(item) || '';
            meta.appendChild(t); meta.appendChild(s);
            var dur = document.createElement('div'); dur.className = 'dur'; dur.textContent = item.duration ? fmt(item.duration) : '';
            row.appendChild(img); row.appendChild(meta); row.appendChild(dur);
            row.onclick = function () { playUri(item.uri || item.item_id, kind === 'album' || kind === 'playlist' || kind === 'artist'); };
            el.appendChild(row);
        });
    }

    function openItem(item) {
        var t = itemType(item);
        var provider = 'library';
        if (t === 'album') {
            setStatus('Loading…');
            rpc('music/albums/album_tracks', { item_id: item.item_id, provider_instance_id_or_domain: provider })
                .then(function (tracks) {
                    navStack.push({ label: item.name, tracks: tracks, trackKind: 'album', items: null });
                    renderCrumbs(); renderTrackList(tracks, 'album'); setStatus('');
                }).catch(function (e) { setStatus(e.message); });
        } else if (t === 'artist') {
            setStatus('Loading…');
            rpc('music/artists/artist_albums', { item_id: item.item_id, provider_instance_id_or_domain: provider })
                .then(function (albums) {
                    navStack.push({ label: item.name, tracks: null, items: albums });
                    renderCrumbs(); renderGrid(albums); setStatus('');
                }).catch(function (e) { setStatus(e.message); });
        } else if (t === 'playlist') {
            setStatus('Loading…');
            rpc('music/playlists/playlist_tracks', { item_id: item.item_id, provider_instance_id_or_domain: provider })
                .then(function (tracks) {
                    navStack.push({ label: item.name, tracks: tracks, trackKind: 'playlist', items: null });
                    renderCrumbs(); renderTrackList(tracks, 'playlist'); setStatus('');
                }).catch(function (e) { setStatus(e.message); });
        } else {
            playUri(item.uri || item.item_id, false);
        }
    }

    // --- Playback ---
    function playUri(uri, isContainer) {
        if (!playerId) { setStatus('Not connected yet'); return; }
        setStatus('Playing…');
        rpc('player_queues/play_media', { queue_id: playerId, media: uri })
            .then(function () { setStatus(''); if (isContainer) setTimeout(fetchQueue, 800); })
            .catch(function (e) { setStatus(e.message); });
    }
    function cmd(name, args) {
        if (!playerId) return;
        rpc(name, Object.assign({ player_id: playerId }, args || {})).catch(function (e) { setStatus(e.message); });
    }

    // --- Now playing ---
    function setCurrent(c) { current = c; renderNow(); }
    function renderNow() {
        document.getElementById('art').src = current.image ? imageUrl({ image: current.image }) : '';
        document.getElementById('now').querySelector('.t').textContent = current.title;
        document.getElementById('now').querySelector('.a').textContent = current.artist;
        document.getElementById('kiosk-art').src = current.image ? imageUrl({ image: current.image }) : '';
        document.getElementById('kiosk-title').textContent = current.title;
        document.getElementById('kiosk-artist').textContent = current.artist;
        document.getElementById('kiosk-dur').textContent = current.duration ? fmt(current.duration) : '0:00';
        var bg = document.getElementById('kiosk-bg-img');
        bg.src = current.image ? imageUrl({ image: current.image }) : '';
        bg.style.opacity = current.image ? '1' : '0';
    }
    function sync() {
        document.getElementById('play').textContent = playing ? '⏸' : '▶';
        document.getElementById('k-play').textContent = playing ? '⏸' : '▶';
        if (playing) startViz(); else stopViz();
    }

    // --- Visualizer (decorative canvas) ---
    var vizTimer = null;
    function startViz() {
        if (!SHOW.viz || vizTimer) return;
        var cv = document.getElementById('kiosk-viz');
        var ctx = cv.getContext('2d');
        function size() { cv.width = innerWidth; cv.height = innerHeight; }
        size(); window.addEventListener('resize', size);
        var bars = 48;
        vizTimer = setInterval(function () {
            ctx.clearRect(0, 0, cv.width, cv.height);
            var t = Date.now() / 1000;
            for (var i = 0; i < bars; i++) {
                var h = (0.3 + 0.7 * Math.abs(Math.sin(t * 1.4 + i * 0.4))) * cv.height * 0.35;
                var w = cv.width / bars;
                ctx.fillStyle = 'rgba(79,140,255,' + (0.25 + 0.5 * Math.abs(Math.sin(t + i * 0.2))) + ')';
                ctx.fillRect(i * w, cv.height - h, w - 2, h);
            }
        }, 60);
    }
    function stopViz() {
        if (vizTimer) { clearInterval(vizTimer); vizTimer = null; }
        var cv = document.getElementById('kiosk-viz');
        cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    }

    // --- Lyrics ---
    function fetchLyrics() {
        if (!SHOW.lyrics || !playerId) { document.getElementById('kiosk-lyrics').classList.add('hidden'); return; }
        fetch('/api/lyrics/' + encodeURIComponent(playerId)).then(function (r) { return r.json(); }).then(function (d) {
            var el = document.getElementById('kiosk-lyrics');
            var lines = parseLyrics(d);
            lyricsLines = lines;
            if (!lines.length) { el.classList.add('hidden'); return; }
            el.classList.remove('hidden');
            el.innerHTML = lines.map(function (l) { return '<div class="l">' + esc(l.text) + '</div>'; }).join('');
        }).catch(function () { /* noop */ });
    }
    function parseLyrics(d) {
        if (!d) return [];
        if (d.lrc_lyrics) {
            return d.lrc_lyrics.split('\n').map(function (l) {
                var m = l.match(/\[(\d+):(\d+)(?:\.(\d+))?\]\s*(.*)/);
                if (!m) return null;
                return { t: (+m[1] * 60) + (+m[2]) + (+(m[3] || 0) / 100), text: m[4] };
            }).filter(Boolean).sort(function (a, b) { return a.t - b.t; });
        }
        if (d.lyrics) return d.lyrics.split('\n').filter(Boolean).map(function (l) { return { t: 0, text: l }; });
        return [];
    }
    function highlightLyrics() {
        var t = audio.currentTime;
        var idx = -1;
        for (var i = 0; i < lyricsLines.length; i++) { if (lyricsLines[i].t <= t) idx = i; else break; }
        if (idx === lyricsIdx) return;
        lyricsIdx = idx;
        var nodes = document.querySelectorAll('#kiosk-lyrics .l');
        nodes.forEach(function (n, i) { n.classList.toggle('active', i === idx); });
    }

    // --- Party ---
    function fetchParty() {
        if (!SHOW.party) { document.getElementById('kiosk-party').classList.add('hidden'); return; }
        fetch('/api/party').then(function (r) { return r.json(); }).then(function (d) {
            var el = document.getElementById('kiosk-party');
            if (!d || !d.active) { el.classList.add('hidden'); return; }
            el.classList.remove('hidden');
            el.innerHTML = '<img src="/api/party/qr.svg?v=' + encodeURIComponent(d.qr_version || '') + '" alt="Join">' +
                (d.name ? '<div class="name">' + esc(d.name) + '</div>' : '') +
                (d.qr_text ? '<div class="qr">' + esc(d.qr_text) + '</div>' : '');
        }).catch(function () { /* noop */ });
    }

    // --- Queue ---
    function fetchQueue() {
        if (!playerId) return;
        rpc('player_queues/get_active_queue', { player_id: playerId }).then(function (q) {
            if (!q || !q.queue_id) return;
            return rpc('player_queues/items', { queue_id: q.queue_id, limit: 200 }).then(function (items) {
                queue = items || [];
                queueIndex = q.current_index != null ? q.current_index : -1;
                renderQueue();
            });
        }).catch(function () { /* noop */ });
    }
    function renderQueue() {
        if (!KIOSK) return;
        var el = document.getElementById('kiosk-queue');
        if (!queue.length) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        el.innerHTML = queue.map(function (qi, i) {
            var mi = qi.media_item || {};
            return '<div class="qrow' + (i === queueIndex ? ' active' : '') + '">' +
                (imageUrl(mi) ? '<img src="' + imageUrl(mi) + '" alt="">' : '') +
                '<div class="qt">' + esc(mi.name || qi.name || '') + '</div>' +
                '<div class="qa">' + esc(artistStr(mi) || '') + '</div></div>';
        }).join('');
    }

    // --- Controls ---
    function bindControls() {
        document.getElementById('play').onclick = function () { cmd(playing ? 'players/cmd/pause' : 'players/cmd/play'); };
        document.getElementById('next').onclick = function () { cmd('players/cmd/next'); };
        document.getElementById('prev').onclick = function () { cmd('players/cmd/previous'); };
        document.getElementById('k-play').onclick = function () { cmd(playing ? 'players/cmd/pause' : 'players/cmd/play'); };
        document.getElementById('k-next').onclick = function () { cmd('players/cmd/next'); };
        document.getElementById('k-prev').onclick = function () { cmd('players/cmd/previous'); };
        document.getElementById('volume').oninput = function (e) { cmd('players/cmd/volume_set', { volume_level: Number(e.target.value) }); };
        var seek = document.getElementById('seek');
        seek.oninput = function (e) { var t = (Number(e.target.value) / 1000) * (current.duration || 0); audio.currentTime = t; cmd('players/cmd/seek', { position: Math.round(t) }); };
        var kseek = document.getElementById('kiosk-seek');
        kseek.oninput = function (e) { var t = (Number(e.target.value) / 1000) * (current.duration || 0); audio.currentTime = t; cmd('players/cmd/seek', { position: Math.round(t) }); };
        audio.ontimeupdate = function () {
            var p = current.duration ? Math.round((audio.currentTime / current.duration) * 1000) : 0;
            seek.value = p; kseek.value = p;
            document.getElementById('kiosk-time').textContent = fmt(audio.currentTime);
            if (SHOW.lyrics) highlightLyrics();
        };
        audio.onended = function () { cmd('players/cmd/next'); };
    }

    // --- Kiosk controls auto-hide ---
    var hideTimer = null;
    function showKioskControls() {
        if (!KIOSK || !SHOW.controls) return;
        var el = document.getElementById('kiosk-controls');
        el.classList.add('visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { el.classList.remove('visible'); }, 3500);
    }

    // --- Search ---
    var searchTimer = null;
    document.getElementById('search').oninput = function (e) {
        clearTimeout(searchTimer);
        var q = e.target.value.trim();
        if (!q) return;
        searchTimer = setTimeout(function () {
            setStatus('Searching…');
            rpc('music/search', { query: q, limit: 40 }).then(function (d) {
                renderGrid([].concat(d.tracks || [], d.albums || [], d.playlists || []));
                setStatus('');
            }).catch(function (err) { setStatus(err.message); });
        }, 350);
    };

    // --- Keyboard ---
    document.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'INPUT') return;
        switch (e.key) {
            case ' ': e.preventDefault(); cmd(playing ? 'players/cmd/pause' : 'players/cmd/play'); break;
            case 'ArrowRight': cmd('players/cmd/seek', { position: Math.min(current.duration || 0, Math.round(audio.currentTime + 10)) }); break;
            case 'ArrowLeft': cmd('players/cmd/seek', { position: Math.max(0, Math.round(audio.currentTime - 10)) }); break;
            case 'ArrowUp': e.preventDefault(); audio.volume = Math.min(1, audio.volume + 0.05); break;
            case 'ArrowDown': e.preventDefault(); audio.volume = Math.max(0, audio.volume - 0.05); break;
            case 'n': case 'N': cmd('players/cmd/next'); break;
            case 'p': case 'P': cmd('players/cmd/previous'); break;
        }
    });

    // --- Sendspin ---
    async function initSendspin() {
        if (!SENDSPIN) return;
        setStatus('Connecting Sendspin…');
        try {
            var module = await import('./sendspin-js/index.js');
            var SendspinPlayer = module.SendspinPlayer;
            var bridgeClientId = params.get('sendspin_client_id');
            var sendspinUrl = params.get('sendspin_url') || '';
            var cfg = {
                playerId: bridgeClientId || ('web-kiosk-' + deviceId.substring(0, 8)),
                baseUrl: sendspinUrl,
                clientName: bridgeClientId ? 'Web Kiosk (Sendspin)' : 'Web Kiosk Player',
                correctionMode: 'sync',
                onStateChange: function () { setSync('synced'); }
            };
            if (typeof AudioDecoder === 'undefined') cfg.codecs = ['flac', 'pcm'];
            window.__sendspinPlayer = new SendspinPlayer(cfg);
            await window.__sendspinPlayer.connect();
            setSync('synced');
        } catch (e) { setSync('error'); setStatus('Sendspin error: ' + e.message); }
    }
    function setSync(state) {
        var el = document.getElementById('kiosk-sync');
        el.className = state;
        el.textContent = state === 'synced' ? 'SYNC' : state === 'error' ? 'ERROR' : 'SYNCING…';
    }

    // --- Boot ---
    function boot() {
        if (KIOSK) document.body.classList.add('kiosk');
        buildMenu();
        bindControls();
        renderNow();
        sync();
        connectWS();
        if (MA_URL && TOKEN) { loadSection(0); setInterval(fetchQueue, 15000); setInterval(fetchParty, 10000); }
        initSendspin();
        if (KIOSK && SHOW.controls) {
            document.addEventListener('mousemove', showKioskControls);
            document.addEventListener('touchstart', showKioskControls);
            showKioskControls();
        }
    }
    boot();
})();
