import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createContext, SourceTextModule } from 'node:vm';

const source = await readFile(new URL('../../provider/static/web/sendspin-js/index.js', import.meta.url), 'utf8');

async function loadBundle(storage) {
    const context = createContext({
        crypto: webcrypto, localStorage: storage, console, atob, btoa,
        TextEncoder, TextDecoder, setTimeout, clearTimeout, setInterval, clearInterval,
    });
    const module = new SourceTextModule(source, {
        context,
        importModuleDynamically(specifier) { throw new Error(`Unexpected import: ${specifier}`); },
    });
    await module.link(specifier => { throw new Error(`Unexpected import: ${specifier}`); });
    await module.evaluate();
    return module.namespace;
}

function memoryStorage(entries = []) {
    const values = new Map(entries);
    return {
        getItem(key) { return values.get(key) ?? null; },
        setItem(key, value) { values.set(key, value); },
    };
}

test('bundle loads without DOM or external imports and preserves an existing identity', async () => {
    const secret = Buffer.alloc(32, 7).toString('base64url');
    const pairingPsk = Buffer.alloc(32, 9).toString('base64url');
    const storage = memoryStorage([['sendspin-identity-sk', secret], ['sendspin-pairing-psk', pairingPsk]]);
    const sdk = await loadBundle(storage);
    assert.deepEqual(Object.keys(sdk).sort(), ['SendspinPlayer', 'loadSendspinClientIdentity']);
    const identity = sdk.loadSendspinClientIdentity();
    const reloaded = (await loadBundle(storage)).loadSendspinClientIdentity();
    assert.equal(identity.clientId, reloaded.clientId);
    assert.equal(identity.pairingPsk, pairingPsk);
    assert.equal(identity.pairingToken, reloaded.pairingToken);
    assert.match(identity.clientId, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(storage.getItem('sendspin-identity-sk'), secret);
    const player = new sdk.SendspinPlayer({ baseUrl: 'http://localhost:8927', codecs: ['flac', 'pcm'] });
    assert.equal(player.clientId, identity.clientId);
    assert.equal(player.pairingPsk, pairingPsk);
});

test('bundle generates and persists a new identity', async () => {
    const storage = memoryStorage();
    const sdk = await loadBundle(storage);
    const identity = sdk.loadSendspinClientIdentity();
    assert.ok(storage.getItem('sendspin-identity-sk'));
    assert.ok(storage.getItem('sendspin-pairing-psk'));
    assert.equal((await loadBundle(storage)).loadSendspinClientIdentity().clientId, identity.clientId);
});

test('bundled decoder handles PCM and preserves the callbacks used by Kiosk', async () => {
    const sdk = await loadBundle(memoryStorage());
    const player = new sdk.SendspinPlayer({ baseUrl: 'http://localhost:8927', codecs: ['flac', 'pcm'] });
    assert.equal(typeof player.core._onStreamStart, 'function');
    assert.equal(typeof player.core._onStreamClear, 'function');
    assert.equal(typeof player.core._onStreamEnd, 'function');
    const pcm = new ArrayBuffer(4);
    const view = new DataView(pcm);
    view.setInt16(0, 16384, true);
    view.setInt16(2, -16384, true);
    const decoded = await player.core.decoder.decode(pcm,
        { codec: 'pcm', bit_depth: 16, sample_rate: 48000, channels: 1 });
    assert.equal(decoded.sampleRate, 48000);
    assert.deepEqual(Array.from(decoded.samples[0]), [0.5, -0.5]);
    await assert.rejects(player.core.decoder.initOpusEncdecDecoder(
        { codec: 'opus', sample_rate: 48000, channels: 1 }), /requires WebCodecs/);
});
