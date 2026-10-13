import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, runInContext, SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../../provider/static/web/web.js', import.meta.url), 'utf8');
const sdkSource = await readFile(new URL('../../provider/static/web/sendspin-js/index.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../provider/static/web/index.html', import.meta.url), 'utf8');
const elementIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));

async function startKiosk(search, entries = [], randomUUID) {
    const storage = new Map(entries);
    const sockets = [];
    const socketInstances = [];
    const apiCalls = [];
    const node = () => ({
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        style: { setProperty(name, value) { this[name] = value; } },
        dataset: {}, attributes: new Map(), textContent: '', innerHTML: '', value: '',
        addEventListener() {}, removeEventListener() {}, focus() {},
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        removeAttribute(name) { this.attributes.delete(name); },
        getContext() { return { clearRect() {} }; },
    });
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
            createElement: node, addEventListener() {}, removeEventListener() {},
        },
        Audio: class {
            paused = true;
            addEventListener() {}
            play() { return Promise.reject(Object.assign(new Error('Gesture required'), { name: 'NotAllowedError' })); }
            pause() { this.paused = true; }
            removeAttribute() {}
        },
        WebSocket: class {
            constructor(url) { sockets.push(url); socketInstances.push(this); }
        },
        fetch: async (url, options) => {
            if (url === '/api' && options?.body) apiCalls.push(JSON.parse(options.body));
            return { ok: true, json: async () => ({}) };
        },
        setInterval() {}, setTimeout() {}, clearTimeout() {},
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
    return { sockets, socketInstances, storage, startupError, elements, apiCalls };
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
