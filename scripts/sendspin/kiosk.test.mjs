import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, runInContext, SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../../provider/static/web/web.js', import.meta.url), 'utf8');
const sdkSource = await readFile(new URL('../../provider/static/web/sendspin-js/index.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../provider/static/web/index.html', import.meta.url), 'utf8');
const elementIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));

async function startKiosk(search, entries = [], randomUUID, partyState = {}) {
    const storage = new Map(entries);
    const sockets = [];
    const socketInstances = [];
    const apiCalls = [];
    const intervals = [];
    const documentEvents = new Map();
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
            dataset: {}, attributes: new Map(), textContent: '', innerHTML: '', value: '',
            addEventListener() {}, removeEventListener() {}, focus() {},
            setAttribute(name, value) { this.attributes.set(name, String(value)); },
            removeAttribute(name) { this.attributes.delete(name); if (name === 'src') delete this.src; },
            getAttribute(name) { return this.attributes.get(name) ?? this[name] ?? null; },
            getContext() { return { clearRect() {} }; },
        };
    };
    const elements = new Map();
    const context = createContext({
        URL, URLSearchParams, Blob, TextEncoder, TextDecoder, atob, btoa, console,
        location: { search, protocol: 'http:', host: '192.0.2.10:8098' },
        crypto: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), randomUUID },
        localStorage: {
            getItem(key) { return storage.get(key) ?? null; },
            setItem(key, value) { storage.set(key, value); },
        },
        document: {
            documentElement: node(), body: node(),
            getElementById(id) {
                if (!elementIds.has(id)) return null;
                if (!elements.has(id)) elements.set(id, node());
                return elements.get(id);
            },
            createElement: node,
            addEventListener(type, callback) {
                if (!documentEvents.has(type)) documentEvents.set(type, []);
                documentEvents.get(type).push(callback);
            },
            removeEventListener() {},
        },
        Audio: class {
            paused = true;
            addEventListener() {}
            play() { return Promise.reject(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' })); }
            pause() { this.paused = true; }
            removeAttribute() {}
            getAttribute(name) { return this[name] ?? null; }
        },
        WebSocket: class {
            constructor(url) { sockets.push(url); socketInstances.push(this); }
        },
        fetch: async (url, options) => {
            if (url === '/api/party') return { ok: partyState.ok !== false, json: async () => partyState.info || {} };
            if (url === '/api' && options?.body) apiCalls.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({}) };
        },
        setInterval(callback, delay) { intervals.push({ callback, delay }); }, setTimeout() {}, clearTimeout() {},
        requestAnimationFrame() {}, cancelAnimationFrame() {},
        performance: { now: () => 0 },
    });
    context.window = context;
    context.addEventListener = () => {};
    const sdk = new SourceTextModule(sdkSource, { context });
    await sdk.link(specifier => { throw new Error(`Unexpected SDK import: ${specifier}`); });
    await sdk.evaluate();
    let startupError;
    try {
        runInContext(source, context, {
            importModuleDynamically: async () => sdk,
        });
    } catch (error) {
        startupError = error;
    }
    await new Promise(resolve => setImmediate(resolve));
    return { sockets, socketInstances, storage, startupError, elements, apiCalls, intervals, documentEvents };
}

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
    ['?kiosk=1', 'HTML5', '/web/music-assistant.svg'],
    ['?kiosk=1&sendspin=1', 'Sendspin', '/web/sendspin.svg'],
]) {
    test(`idle ${type} player shows project artwork and the MA version`, async () => {
        const result = await startKiosk(search);
        const message = data => result.socketInstances[0].onmessage({ data: JSON.stringify(data) });
        message({ type: 'welcome', player_id: 'wk-idle', server_version: '2.17.0.dev42' });
        assert.equal(result.elements.get('kiosk-title').textContent, type);
        assert.equal(result.elements.get('kiosk-artist').textContent, 'Music Assistant 2.17.0.dev42');
        assert.equal(result.elements.get('kiosk-bar-title').textContent, type);
        assert.equal(result.elements.get('kiosk-bar-artist').textContent, 'Music Assistant 2.17.0.dev42');
        assert.equal(result.elements.get('kiosk-art').src, logo);
        message({ type: 'play', path: '/track.wav', title: 'Track', artist: 'Artist', image_url: '/cover.jpg', duration: 180 });
        assert.equal(result.elements.get('kiosk-title').textContent, 'Track');
        assert.equal(result.elements.get('kiosk-artist').textContent, 'Artist');
        message({ type: 'stop' });
        assert.equal(result.elements.get('kiosk-title').textContent, type);
        assert.equal(result.elements.get('kiosk-art').src, logo);
    });
}

test('Party QR toggles the large artwork without losing current track updates', async () => {
    const partyState = { info: { active: true, version: 'one', name: 'Party' } };
    const result = await startKiosk('?kiosk=1&token=test', [], undefined, partyState);
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
    const result = await startKiosk('?kiosk=1', [], undefined, partyState);
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
