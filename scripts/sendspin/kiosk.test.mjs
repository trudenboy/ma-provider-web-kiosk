import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = await readFile(new URL('../../provider/static/web/web.js', import.meta.url), 'utf8');
const sdkSource = await readFile(new URL('../../provider/static/web/sendspin-js/index.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../provider/static/web/index.html', import.meta.url), 'utf8');
const elementIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));

async function startKiosk(search, entries = [], randomUUID, partyState = {}, options = {}) {
    const storage = new Map(entries);
    const frames = [];
    let now = 1000;
    const sockets = [];
    const socketInstances = [];
    const apiCalls = [];
    const intervals = [];
    const documentEvents = new Map();
    const windowEvents = new Map();
    const fetchCalls = [];
    const audioInstances = [];
    let sdkLoads = 0;
    const node = () => {
        const classes = new Set();
        return {
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); },
                toggle(name, force) {
                    if (force ?? !classes.has(name)) classes.add(name);
                    else classes.delete(name);
                },
                contains(name) { return classes.has(name); },
            },
            style: { setProperty(name, value) { this[name] = value; } },
            dataset: {}, attributes: new Map(), textContent: '', value: '', children: [],
            appendChild(child) { child.offsetTop = this.children.length * 80; child.offsetHeight = 64; this.children.push(child); return child; },
            clientHeight: 400,
            replaceChildren(...children) { this.children = children; this._markup = ''; this.textContent = ''; },
            removeChild(child) { this.children.splice(this.children.indexOf(child), 1); },
            get firstChild() { return this.children[0] || null; },
            get childElementCount() { return this.children.length; },
            set innerHTML(value) { this._markup = value; this.children = []; },
            get innerHTML() { return this._markup || this.textContent.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
            addEventListener() {}, removeEventListener() {}, focus() {},
            setAttribute(name, value) { this.attributes.set(name, String(value)); },
            removeAttribute(name) { this.attributes.delete(name); if (name === 'src') delete this.src; },
            getAttribute(name) { return this.attributes.get(name) ?? this[name] ?? null; },
            getContext() { return { clearRect() {} }; },
        };
    };
    const elements = new Map();
    const config = options;
    const context = createContext({
        URL, URLSearchParams, Blob, TextEncoder, TextDecoder, atob, btoa, console,
        innerWidth: options.width || 390,
        location: { search, hash: options.hash || '', pathname: '/kiosk', protocol: 'http:', host: '192.0.2.10:8098' },
        history: { replaceState(_state, _title, url) { const target = new URL(url, 'http://192.0.2.10:8098'); context.location.search = target.search; context.location.hash = target.hash; } },
        crypto: options.noCrypto ? undefined : { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), randomUUID },
        localStorage: {
            getItem(key) { return storage.get(key) ?? null; },
            setItem(key, value) { storage.set(key, value); },
        },
        document: {
            documentElement: node(), body: node(),
            head: { appendChild(script) {
                sdkLoads++;
                try { runInContext(options.fakeSdk ? fakeSdk : sdkSource, context); script.onload(); }
                catch (error) { script.onerror(error); }
            } },
            getElementById(id) {
                if (!elementIds.has(id)) return null;
                if (!elements.has(id)) {
                    const element = node();
                    const tag = html.match(new RegExp(`<[^>]*\\bid="${id}"[^>]*>`))?.[0] || '';
                    const classes = tag.match(/\bclass="([^"]*)"/)?.[1] || '';
                    element.classList.add(...classes.split(/\s+/).filter(Boolean));
                    if (options.noReplaceChildren) element.replaceChildren = undefined;
                    elements.set(id, element);
                }
                return elements.get(id);
            },
            createElement: node,
            addEventListener(type, callback) {
                if (!documentEvents.has(type)) documentEvents.set(type, []);
                documentEvents.get(type).push(callback);
            },
            removeEventListener() {},
        },
        confirm: () => false,
        Audio: class {
            constructor() { audioInstances.push(this); }
            paused = true;
            addEventListener() {}
            play() { return Promise.reject(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' })); }
            pause() { this.paused = true; }
            removeAttribute(name) { delete this[name]; }
            getAttribute(name) { return this[name] ?? null; }
        },
        WebSocket: class {
            static OPEN = 1;
            readyState = 1;
            sent = [];
            constructor(url) { sockets.push(url); socketInstances.push(this); }
            send(data) { this.sent.push(JSON.parse(data)); }
        },
        fetch: async (url, options) => {
            fetchCalls.push(url);
            if (url === '/api/party') return { ok: partyState.ok !== false, json: async () => partyState.info || {} };
            if (url === '/api' && options?.body) {
                const request = JSON.parse(options.body);
                apiCalls.push(request);
                if (config.api) return { ok: true, json: async () => config.api(request) };
            }
            return { ok: true, json: async () => ({}) };
        },
        setInterval(callback, delay) { intervals.push({ callback, delay }); }, setTimeout() {}, clearTimeout() {},
        requestAnimationFrame(callback) { frames.push(callback); return frames.length; }, cancelAnimationFrame() {},
        performance: { now: () => now },
    });
    context.window = context;
    context.addEventListener = (type, callback) => {
        if (!windowEvents.has(type)) windowEvents.set(type, []);
        windowEvents.get(type).push(callback);
    };
    const fakeSdk = `
        window.WebKioskSendspin = {
        loadSendspinClientIdentity: function() { return { clientId: 'a'.repeat(43) }; },
        SendspinPlayer: class {
            constructor(config) { this.config = config; this.core = {}; }
            get trackProgress() { return this.core.trackProgress; }
            unlock() { return Promise.resolve(); }
            connect() { return Promise.resolve(); }
        }};
    `;
    let startupError;
    try {
        runInContext(source, context);
    } catch (error) {
        startupError = error;
    }
    await new Promise(resolve => setImmediate(resolve));
    return { sockets, socketInstances, storage, startupError, elements, apiCalls, intervals, documentEvents, fetchCalls, sdkLoads, root: context.document.documentElement, location: context.location, context, frames, audioInstances, advance: ms => { now += ms; }, resize: width => { context.innerWidth = width; (windowEvents.get('resize') || []).forEach(callback => callback()); } };
}

test('HTML5 registers without crypto or loading Sendspin', async () => {
    const result = await startKiosk('?sendspin=0', [], undefined, {}, { fakeSdk: true, noCrypto: true });
    assert.equal(result.startupError, undefined);
    assert.equal(result.sockets.length, 1);
    assert.equal(result.sdkLoads, 0);
    assert.match(result.storage.get('wk_device_id'), /^wk-/);
});

for (const search of ['?kiosk=1', '?kiosk=1&sendspin=1']) {
    test(`fresh kiosk registers over HTTP without crypto.randomUUID (${search})`, async () => {
        const result = await startKiosk(search);
        assert.equal(result.sockets.length, 1, `No registration WebSocket: ${result.startupError}`);
        const url = new URL(result.sockets[0]);
        assert.equal(url.pathname, '/ws');
        assert.equal(url.searchParams.get('device_id'), result.storage.get('wk_device_id'));
        assert.match(url.searchParams.get('device_id'), /^wk-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        assert.match(url.searchParams.get('sendspin_client_id'), /^[A-Za-z0-9_-]{43}$/);
    });
}

test('explicit device id reaches registration on HTTP', async () => {
    const result = await startKiosk('?kiosk=1&device_id=wk-existing');
    assert.equal(result.sockets.length, 1, `No registration WebSocket: ${result.startupError}`);
    assert.equal(new URL(result.sockets[0]).searchParams.get('device_id'), 'wk-existing');
});

test('reload preserves the device id generated on HTTP', async () => {
    const first = await startKiosk('?kiosk=1');
    const reloaded = await startKiosk('?kiosk=1', [...first.storage]);
    assert.equal(new URL(reloaded.sockets[0]).searchParams.get('device_id'), first.storage.get('wk_device_id'));
});

test('native UUID generation remains supported', async () => {
    const uuid = 'a23e4567-e89b-42d3-a456-426614174000';
    let calls = 0;
    const result = await startKiosk('?kiosk=1', [], () => { calls++; return uuid; });
    assert.equal(calls, 1);
    assert.equal(result.storage.get('wk_device_id'), `wk-${uuid}`);
    assert.equal(new URL(result.sockets[0]).searchParams.get('device_id'), `wk-${uuid}`);
});

test('transport icons follow server state and retain their command bindings', async () => {
    const result = await startKiosk('?kiosk=1&token=test-token');
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'test-player' });
    message({ type: 'resume' });
    assert.equal(result.elements.get('k-play-icon').attributes.get('href'), '#k-icon-pause');
    assert.equal(result.elements.get('k-play').attributes.get('aria-label'), 'Pause');
    result.elements.get('k-play').onclick();
    assert.equal(result.apiCalls.at(-1).command, 'players/cmd/pause');
    message({ type: 'pause' });
    assert.equal(result.elements.get('k-play-icon').attributes.get('href'), '#k-icon-play');
    result.elements.get('k-play').onclick();
    assert.equal(result.apiCalls.at(-1).command, 'players/cmd/play');
    result.elements.get('k-next').onclick();
    assert.equal(result.apiCalls.at(-1).command, 'players/cmd/next');
    result.elements.get('k-prev').onclick();
    assert.equal(result.apiCalls.at(-1).command, 'players/cmd/previous');
});

test('server volume updates the slider, percentage and speaker icon together', async () => {
    const result = await startKiosk('?kiosk=1');
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'volume', level: 42 });
    assert.equal(result.elements.get('kiosk-volume').value, '42');
    assert.equal(result.elements.get('k-volume-level').textContent, '42%');
    assert.equal(result.elements.get('k-volume-panel-level').textContent, '42%');
    assert.equal(result.elements.get('k-volume-icon').attributes.get('href'), '#k-icon-volume-1');
    message({ type: 'volume', level: 0 });
    assert.equal(result.elements.get('k-volume-icon').attributes.get('href'), '#k-icon-volume-x');
});

for (const search of ['?kiosk=1', '?kiosk=1&sendspin=1']) {
    test(`registered player identifier is displayed and refreshed (${search})`, async () => {
        const result = await startKiosk(search);
        const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
        message({ type: 'welcome', player_id: 'wk-test-player' });
        assert.equal(result.elements.get('kiosk-player-id')?.textContent, 'Player ID: wk-test-player');
        message({ type: 'welcome', player_id: 'wk-reconnected-player' });
        assert.equal(result.elements.get('kiosk-player-id').textContent, 'Player ID: wk-reconnected-player');
    });
}

for (const [search, type, logo] of [
    ['?kiosk=1&sendspin=0', 'HTML5', '/web/html5.svg'],
    ['?kiosk=1&sendspin=1', 'Sendspin', '/web/sendspin.svg'],
]) {
    test(`idle ${type} player shows its ID, project artwork and the MA version`, async () => {
        const result = await startKiosk(search);
        const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
        message({ type: 'welcome', player_id: 'wk-idle', server_version: '2.17.0.dev42' });
        assert.equal(result.elements.get('kiosk-title').textContent, 'wk-idle');
        assert.equal(result.elements.get('kiosk-artist').textContent, 'Music Assistant 2.17.0.dev42');
        assert.equal(result.elements.get('kiosk-bar-title').textContent, 'wk-idle');
        assert.equal(result.elements.get('kiosk-bar-artist').textContent, 'Music Assistant 2.17.0.dev42');
        assert.equal(result.elements.get('kiosk-art').src, logo);
        message({ type: 'play', path: '/track.wav', title: 'Track', artist: 'Artist', image_url: '/cover.jpg', duration: 180 });
        assert.equal(result.elements.get('kiosk-title').textContent, 'Track');
        assert.equal(result.elements.get('kiosk-artist').textContent, 'Artist');
        message({ type: 'stop' });
        assert.equal(result.elements.get('kiosk-title').textContent, 'wk-idle');
        assert.equal(result.elements.get('kiosk-art').src, logo);
    });
}

for (const [search, logo] of [['?sendspin=0', '/web/html5.svg'], ['', '/web/sendspin.svg']]) {
    test(`bottom-left artwork stays a project emblem without Party (${search})`, async () => {
        const result = await startKiosk(search);
        const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
        message({ type: 'welcome', player_id: 'wk-logo' });
        message({ type: 'play', path: '/track', title: 'Track', image_url: '/album.jpg', duration: 180 });
        assert.equal(result.elements.get('kiosk-bar-art').src, logo);
        assert.equal(result.elements.get('kiosk-party').classList.contains('hidden'), true);
        assert.equal(result.elements.get('kiosk-art').src.includes('album.jpg'), true);
    });
}

test('Party thumbnail falls back to the emblem on a failed QR and recovers on the next poll', async () => {
    const state = { info: { active: true, version: 'one', name: 'Room' } };
    const result = await startKiosk('?sendspin=0&party=1', [], undefined, state);
    const thumbnail = result.elements.get('kiosk-party-thumbnail');
    const party = result.elements.get('kiosk-party');
    assert.equal(thumbnail.src, '/api/party/qr.svg?v=one');
    assert.equal(party.classList.contains('hidden'), false);
    assert.equal(result.elements.get('kiosk-bar-art').src, '/web/html5.svg');
    party.onclick();
    thumbnail.onerror();
    assert.equal(party.classList.contains('hidden'), true);
    assert.equal(party.attributes.get('aria-expanded'), 'false');
    const poll = result.intervals.find(interval => interval.delay === 10000).callback;
    await poll();
    assert.equal(party.classList.contains('hidden'), false);
    state.info = { active: false };
    await poll();
    assert.equal(party.classList.contains('hidden'), true);
    assert.equal(result.elements.get('kiosk-bar-art').src, '/web/html5.svg');
});

test('Party QR toggles the large artwork without losing current track updates', async () => {
    const partyState = { info: { active: true, version: 'one', name: 'Party' } };
    const result = await startKiosk('?kiosk=1&token=test&party=1', [], undefined, partyState);
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'wk-party', server_version: '2.17.0' });
    await new Promise(resolve => setImmediate(resolve));
    const party = result.elements.get('kiosk-party');
    party.onclick();
    assert.equal(party.attributes.get('aria-expanded'), 'true');
    assert.equal(result.elements.get('kiosk-party-art').src, '/api/party/qr.svg?v=one');
    message({ type: 'play', path: '/track.wav', title: 'New track', image_url: '/new-cover.jpg', duration: 180 });
    assert.equal(result.elements.get('kiosk-title').textContent, 'New track');
    assert.equal(party.attributes.get('aria-expanded'), 'true');
    party.onclick();
    assert.equal(party.attributes.get('aria-expanded'), 'false');
    assert.equal(result.elements.get('kiosk-art').src, '/new-cover.jpg');
    party.onclick();
    result.elements.get('kiosk-party-expanded').onclick();
    assert.equal(party.attributes.get('aria-expanded'), 'false');
    party.onclick();
    for (const callback of result.documentEvents.get('keydown')) callback({ key: 'Escape', target: { tagName: 'BUTTON' } });
    assert.equal(party.attributes.get('aria-expanded'), 'false');
});

test('enlarged Party QR follows version changes and closes when Party disappears', async () => {
    const partyState = { info: { active: true, version: 'one' } };
    const result = await startKiosk('?kiosk=1&party=1', [], undefined, partyState);
    const poll = result.intervals.find(item => item.delay === 10000).callback;
    const party = result.elements.get('kiosk-party');
    party.onclick();
    partyState.info = { active: true, version: 'two' };
    await poll();
    assert.equal(result.elements.get('kiosk-party-art').src, '/api/party/qr.svg?v=two');
    assert.equal(party.attributes.get('aria-expanded'), 'true');
    partyState.info = { active: false };
    await poll();
    assert.equal(party.attributes.get('aria-expanded'), 'false');
    assert.equal(result.elements.get('kiosk-party-expanded').classList.contains('hidden'), true);
    partyState.info = { active: true, version: 'three' };
    await poll();
    party.onclick();
    partyState.ok = false;
    await poll();
    assert.equal(party.attributes.get('aria-expanded'), 'false');
});

test('a missing server version never exposes undefined in the idle labels', async () => {
    const result = await startKiosk('?kiosk=1');
    result.socketInstances[0].onmessage({ data: JSON.stringify({ type: 'welcome', player_id: 'wk-old' }) });
    assert.equal(result.elements.get('kiosk-artist').textContent, 'Music Assistant');
});

test('bare kiosk defaults to Sendspin without optional additions', async () => {
    const result = await startKiosk('');
    assert.equal(result.root.classList.contains('sendspin'), true);
    result.socketInstances[0].onmessage({ data: JSON.stringify({ type: 'welcome', player_id: 'wk-default' }) });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(result.elements.get('kiosk-player-id').classList.contains('hidden'), true);
    assert.equal(result.root.classList.contains('controls'), false);
    assert.equal(result.fetchCalls.includes('/api/party'), false);
    assert.equal(result.intervals.some(item => item.delay === 10000 || item.delay === 15000), false);
});

test('idle project artwork supplies the same background image as the album artwork', async () => {
    const result = await startKiosk('?sendspin=0');
    assert.equal(result.elements.get('kiosk-bg-img').src, '/web/html5.svg');
    assert.equal(result.elements.get('kiosk-bg-img').style.opacity, '1');
});

test('URL builder emits a clean kiosk URL and only selected additions', async () => {
    const builder = await readFile(new URL('../../provider/static/web/url-builder.js', import.meta.url), 'utf8');
    const nodes = new Map(['url', 'copy', 'open', 'controls', 'party', 'viz', 'lyrics', 'queue', 'show_player_id', 'ma_url', 'token', 'device_id'].map(id => [id, { value: '', checked: false, dataset: {}, select() {} }]));
    nodes.get('url').dataset.base = 'http://192.168.10.10:8098';
    let mode = 'sendspin';
    const events = new Map();
    runInContext(builder, createContext({
        URL, navigator: {}, window: { open() {} },
        document: {
            getElementById: id => nodes.get(id),
            querySelector: () => ({ value: mode }),
            addEventListener: (name, callback) => events.set(name, callback),
        },
    }));
    assert.equal(nodes.get('url').value, 'http://192.168.10.10:8098/kiosk');
    mode = 'html5';
    nodes.get('show_player_id').checked = true;
    nodes.get('party').checked = true;
    events.get('change')();
    const url = new URL(nodes.get('url').value);
    assert.equal(url.searchParams.get('sendspin'), '0');
    assert.equal(url.searchParams.get('show_player_id'), '1');
    assert.equal(url.searchParams.get('party'), '1');
    assert.equal(url.searchParams.has('controls'), false);
});

test('player ID is visible only when explicitly enabled', async () => {
    const result = await startKiosk('?show_player_id=1');
    result.socketInstances[0].onmessage({ data: JSON.stringify({ type: 'welcome', player_id: 'wk-visible' }) });
    assert.equal(result.elements.get('kiosk-player-id').classList.contains('hidden'), false);
    assert.equal(result.elements.get('kiosk-player-id').textContent, 'Player ID: wk-visible');
});

test('Sendspin navigation retains selected kiosk additions', async () => {
    const result = await startKiosk('?sendspin=0&controls=1&party=1&show_player_id=1&device_id=chosen');
    result.socketInstances[0].onmessage({ data: JSON.stringify({ type: 'sendspin', url: '/kiosk?sendspin=1&sendspin_client_id=server-identity' }) });
    const url = new URL(result.location.href);
    assert.equal(url.pathname, '/kiosk');
    assert.equal(url.searchParams.get('sendspin'), '1');
    assert.equal(url.searchParams.get('sendspin_client_id'), 'server-identity');
    assert.equal(url.searchParams.get('controls'), '1');
    assert.equal(url.searchParams.get('party'), '1');
    assert.equal(url.searchParams.get('show_player_id'), '1');
    assert.equal(url.searchParams.get('device_id'), 'chosen');
});


test('fragment token is stored and removed from the visible player URL', async () => {
    const result = await startKiosk('?sendspin=0&controls=1', [], undefined, {}, { hash: '#token=secret-token' });
    assert.equal(result.storage.get('wk_token'), 'secret-token');
    assert.equal(result.location.hash, '');
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'wk-fragment' });
    result.elements.get('k-next').onclick();
    assert.equal(result.apiCalls.at(-1).command, 'players/cmd/next');
    message({ type: 'sendspin', url: '/kiosk?sendspin=1' });
    assert.equal(new URL(result.location.href).searchParams.has('token'), false);
});


test('builder puts credentials in the fragment instead of the request query', async () => {
    const builder = await readFile(new URL('../../provider/static/web/url-builder.js', import.meta.url), 'utf8');
    const nodes = new Map(['url', 'copy', 'open', 'controls', 'party', 'viz', 'lyrics', 'queue', 'show_player_id', 'ma_url', 'token', 'device_id'].map(id => [id, { value: '', checked: false, dataset: {}, select() {} }]));
    nodes.get('url').dataset.base = 'http://192.0.2.10:8098';
    nodes.get('token').value = 'secret & token';
    runInContext(builder, createContext({
        URL, URLSearchParams, navigator: {}, window: { open() {} },
        document: {
            getElementById: id => nodes.get(id),
            querySelector: () => ({ value: 'sendspin' }),
            addEventListener() {},
        },
    }));
    const url = new URL(nodes.get('url').value);
    assert.equal(url.searchParams.has('token'), false);
    assert.equal(new URLSearchParams(url.hash.slice(1)).get('token'), 'secret & token');
});


test('queue artwork is an inert DOM attribute even with quotes in metadata', async () => {
    const image = '/cover.jpg" onerror="alert(1)';
    const result = await startKiosk('?sendspin=0&queue=1&token=test', [], undefined, {}, {
        api: request => request.command === 'player_queues/get_active_queue'
            ? { queue_id: 'wk-queue', current_index: 0 }
            : [{ media_item: { name: 'Track', image } }],
    });
    result.socketInstances[0].onmessage({ data: JSON.stringify({ type: 'welcome', player_id: 'wk-queue' }) });
    await new Promise(resolve => setImmediate(resolve));
    const queue = result.elements.get('kiosk-queue');
    assert.equal(queue.innerHTML.includes('onerror='), false);
    assert.equal(queue.children[0].children[0].src, image);
    assert.equal(queue.children[0].children[0].attributes.has('onerror'), false);
});


test('long queue keeps the current item visible beyond the first 200 entries', async () => {
    const items = Array.from({ length: 450 }, (_, i) => ({ name: 'Track ' + i }));
    const result = await startKiosk('?sendspin=0&queue=1&token=test', [], undefined, {}, {
        api: request => request.command === 'player_queues/get_active_queue'
            ? { queue_id: 'wk-long', current_index: 350 }
            : items.slice(request.args.offset || 0, (request.args.offset || 0) + request.args.limit),
    });
    result.socketInstances[0].onmessage({ data: JSON.stringify({ type: 'welcome', player_id: 'wk-long' }) });
    await new Promise(resolve => setImmediate(resolve));
    const active = result.elements.get('kiosk-queue').children.find(row => row.classList.contains('active'));
    assert.ok(active, 'Current item is absent from the displayed queue');
    assert.equal(active.children[0].children[0].textContent, 'Track 350');
});


test('wide lyrics show the full song without replaceChildren and follow viewport changes', async () => {
    const result = await startKiosk('?lyrics=1', [], undefined, {}, { fakeSdk: true, width: 1280, noReplaceChildren: true });
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'wk-lyrics' });
    await new Promise(resolve => setImmediate(resolve));
    message({ type: 'play', path: '/track', title: 'Track', duration: 180 });
    const core = result.context.__sendspinPlayer.core;
    core.onStreamStart();
    core.trackProgress = { positionMs: 65000, durationMs: 180000, playbackSpeed: 1 };
    message({ type: 'lyrics', lines: [{ t: 0, text: 'Opening' }, { t: 20, text: 'Verse' }, { t: 60, text: 'Middle' }, { t: 90, text: 'Ending' }, { t: 120, text: '<Outro>' }] });
    const lyrics = result.elements.get('kiosk-lyrics');
    assert.equal(lyrics.dataset.layout, 'wide');
    assert.deepEqual(Array.from(lyrics.children[0].children, line => line.textContent), ['Opening', 'Verse', 'Middle', 'Ending', '<Outro>']);
    assert.equal(lyrics.children[0].children[2].classList.contains('current'), true);
    assert.equal(lyrics.children[0].style.transform, 'translateY(8px)');
    core.trackProgress.positionMs = 95000;
    result.frames.at(-1)();
    assert.equal(lyrics.children[0].children[3].classList.contains('current'), true);
    assert.equal(lyrics.children[0].style.transform, 'translateY(-72px)');
    result.resize(768);
    assert.equal(lyrics.dataset.layout, 'compact');
    assert.match(lyrics.innerHTML, /^<div class="l">Middle<\/div><div class="l current">Ending<\/div><div class="l">&lt;Outro&gt;<\/div>$/);
    result.resize(769);
    assert.equal(lyrics.dataset.layout, 'wide');
    assert.equal(lyrics.children[0].children[3].classList.contains('current'), true);
    message({ type: 'lyrics', lines: [] });
    assert.equal(lyrics.classList.contains('hidden'), true);
    assert.equal(result.root.classList.contains('lyrics-visible'), false);
});

for (const search of ['?lyrics=1', '?lyrics=1&token=test']) {
    test(`Sendspin lyrics follow SDK progress without a visible queue (${search})`, async () => {
        const result = await startKiosk(search, [], undefined, {}, { fakeSdk: true });
        const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
        message({ type: 'welcome', player_id: 'wk-clock' });
        await new Promise(resolve => setImmediate(resolve));
        message({ type: 'play', path: '/track', title: 'Track', duration: 180 });
        const core = result.context.__sendspinPlayer.core;
        core.onStreamStart();
        core.trackProgress = { positionMs: 65000, durationMs: 180000, playbackSpeed: 1 };
        message({ type: 'lyrics', lines: [{ t: 0, text: 'Opening' }, { t: 60, text: 'Middle' }, { t: 90, text: 'Ending' }] });
        result.frames.at(-1)();
        assert.match(result.elements.get('kiosk-lyrics').innerHTML, /class="l current">Middle</);
        core.trackProgress = { positionMs: 95000, durationMs: 180000, playbackSpeed: 1 };
        result.frames.at(-1)();
        assert.match(result.elements.get('kiosk-lyrics').innerHTML, /class="l current">Ending</);
        assert.equal(result.apiCalls.some(call => call.command === 'player_queues/get_active_queue'), false);
    });
}


test('Sendspin clock follows SDK progress again after seeking without a queue', async () => {
    const result = await startKiosk('?controls=1&token=test', [], undefined, {}, { fakeSdk: true });
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'wk-seek' });
    await new Promise(resolve => setImmediate(resolve));
    message({ type: 'play', path: '/track', duration: 180 });
    const core = result.context.__sendspinPlayer.core;
    core.onStreamStart();
    const slider = result.elements.get('kiosk-seek');
    slider.onchange({ target: { value: '500' } });
    assert.equal(result.elements.get('kiosk-time').textContent, '1:30');
    core.trackProgress = { positionMs: 95000, durationMs: 180000, playbackSpeed: 1 };
    result.advance(2500);
    result.intervals.find(interval => interval.delay === 500).callback();
    assert.equal(result.elements.get('kiosk-time').textContent, '1:35');
});


test('server stop is applied even when a confirmation would be dismissed', async () => {
    const result = await startKiosk('?sendspin=0');
    const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'wk-stop' });
    message({ type: 'play', path: '/track', title: 'Playing', duration: 180 });
    await new Promise(resolve => setImmediate(resolve));
    const audio = result.audioInstances[0];
    audio.paused = false;
    message({ type: 'stop', showNotification: true });
    assert.equal(audio.paused, true);
    assert.equal(audio.getAttribute('src'), null);
    assert.equal(result.elements.get('kiosk-title').textContent, 'wk-stop');
    assert.equal(result.elements.get('kiosk-status').textContent, 'Playback stopped');
    assert.equal(result.elements.get('k-play-icon').attributes.get('href'), '#k-icon-play');
});


test('audio completion echoes its play generation once and resets for a new play', async () => {
    const result = await startKiosk('?sendspin=0');
    const socket = result.socketInstances[0];
    const message = data => socket.onmessage({ data: JSON.stringify(data) });
    message({ type: 'welcome', player_id: 'wk-ended' });
    const audio = result.audioInstances[0];
    message({ type: 'play', path: '/old', duration: 5, playback_generation: 'old-generation' });
    audio.ended = true;
    audio.onended();
    audio.onended();
    assert.equal(socket.sent.filter(item => item.type === 'ended').length, 1);
    assert.equal(socket.sent.at(-1).playback_generation, 'old-generation');
    message({ type: 'play', path: '/new', duration: 5, playback_generation: 'new-generation' });
    audio.ended = true;
    audio.onended();
    assert.equal(socket.sent.filter(item => item.type === 'ended').length, 2);
    assert.equal(socket.sent.at(-1).playback_generation, 'new-generation');
});
