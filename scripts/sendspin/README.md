# Sendspin browser assets

Node 22 or newer is required only for development and CI. Music Assistant
serves the committed assets and does not install npm dependencies at runtime.

Run `scripts/vendor-sendspin-js.sh` from the repository root to install the
locked dependencies and rebuild the SDK. Run `npm run check` in this directory
to verify that every committed asset matches the build, including embedded licenses.
CI also runs `npm test` to check module loading, identity persistence and PCM
decoding using the generated entry.

To update dependencies, edit the exact versions in `package.json`, regenerate
`package-lock.json` with npm, rebuild and review the generated diff. The Noble
overrides keep the crypto versions unchanged from the previous vendored client.

The ESM entry exports only `SendspinPlayer` and `loadSendspinClientIdentity`.
esbuild bundles their SDK and crypto dependencies without property mangling.
The entry URL stays `/web/sendspin-js/index.js`; browser storage, player identity
and the existing Sendspin connection behavior remain the same.

Software Opus decoding remains unsupported. The two optional opus-encdec imports
are replaced by modules that reject with an explicit error if reached. Opus uses
WebCodecs; browsers without WebCodecs are still offered FLAC/PCM by the kiosk.
No CDN, unresolved package imports or Node builtins are needed by the browser.

`BUILD.json` records the bundled package versions, esbuild version and JS SHA256.
Full upstream licenses and package attribution are embedded in the JS header.
No separate license files are shipped. Generated assets are tracked
so provider releases and the standard upstream sync need no build-system changes
in Music Assistant.
