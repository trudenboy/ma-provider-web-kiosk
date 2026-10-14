# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.13] - 2026-10-14

### Added

- Optional TV remote navigation, lightweight visuals and supported browser screen wake lock in the URL builder.

### Changed

- Wide screens display lyrics beside the artwork with the active line centred; narrow screens retain the three-line view below the artwork.
- The bottom-left mini-player artwork shows Party QR, or the Sendspin/HTML5 emblem when Party is disabled, unavailable, or its QR cannot load.
- HTML5 starts independently of the optional Sendspin SDK; legacy browser scripts and layout have compatibility fallbacks.
- Sendspin advertises verified Opus/FLAC capabilities with PCM as the baseline and shared identity storage when persistent storage is denied.

### Removed

- The ineffective player idle timeout setting; normal browser disconnection retains the five-second grace period.

### Fixed

- A shared browser Sendspin identity has one kiosk owner; changing device IDs transfers ownership without letting the old kiosk delete the new bridge.
- Closing a page or expiring an idle kiosk preserves its Sendspin settings; explicit player deletion still removes them.
- Connections and suspended audio are rechecked when the page or network resumes; stale WebSocket callbacks cannot replace a new connection.
- Sendspin volume controls affect the active SDK player; HTML5 devices with hardware-only volume show the device-control limitation.
- Unsupported Sendspin browsers and insecure endpoints on HTTPS pages select HTML5; initial streams with no decoded audio also fall back.

## [1.0.12] - 2026-10-14

### Changed

- Party QR data is obtained through Music Assistant's registered API commands instead of calling another provider directly.
- Provider and Sendspin setting descriptions no longer advertise an outdated MA release.

### Fixed

- Sendspin bridge registration accepts only canonical 43-character browser public-key identities.
- Bridge shutdown waits for cancelled fallback transfers, including watchdogs replaced by a new stream, before removing the client.
- Player teardown reports unexpected errors instead of silently swallowing them.
- Removed unused per-client URL-prefix storage that accumulated after browser disconnections.

## [1.0.11] - 2026-10-14

### Changed

- Stop notifications are informational and cannot cancel a stop already completed in Music Assistant.

### Fixed

- Browser completion messages identify their playback instance, so late or repeated messages cannot skip replacement tracks, including short tracks and playback after a seek.

## [1.0.10] - 2026-10-14

### Fixed

- Browser requests from other origins on the same site are rejected before opening a player WebSocket.
- HTML5 always receives a per-track MA stream, even when crossfade, audio overlays, or plugins require queue flow mode.

## [1.0.9] - 2026-10-14

### Changed

- The URL builder places MA access tokens in the URL fragment; the kiosk stores and clears them from the visible address. Legacy query tokens remain supported.
- The queue display follows a window around the current track, including queues longer than 200 items.
- Expected Music Assistant failures remain recoverable while programming errors are reported.

### Fixed

- Simultaneous browser connections reuse a single player registration.
- Open kiosk pages remain registered during idle periods, and provider reloads remove disabled players and await pending removals.
- Queue artwork and text are rendered without inserting media metadata into HTML.
- Sendspin progress, visualizer, and lyrics follow the SDK playback clock without requiring a token or visible queue.

## [1.0.8] - 2026-10-14

### Added

- Click the Party QR to show it in the large artwork area; click again or press Escape to close it.
- Idle players show their Player ID and the running Music Assistant version.
- Provider settings can require Music Assistant sign-in for the kiosk URL builder.

### Changed

- Official HTML5 and Sendspin artwork replaces the ASCII project marks.
- The canonical `/kiosk` URL opens Sendspin with additions disabled; the URL builder enables each addition, including Player ID, explicitly.
- Project artwork also supplies the background when there is no track.

## [1.0.7] - 2026-10-13

### Changed

- The Party join QR code appears on the right side of the player controls, which stay visible while a party is active.

## [1.0.6] - 2026-10-13

### Added

- The registered player ID is visible in the kiosk interface.

### Changed

- Kiosk playback controls follow the Music Assistant player bar design, with track details, matching icons, responsive layout and a volume panel.
- Narrow screens use a floating mobile player card with Play/Pause, inline volume and a seek bar; short screens place artwork beside track details.

## [1.0.5] - 2026-10-13

### Fixed

- Browsers opened over plain HTTP can register a new kiosk player without a previously saved device ID.

## [1.0.4] - 2026-10-13

### Changed

- Third-party license notices are included in the Sendspin browser bundle instead of separate files.

## [1.0.3] - 2026-10-13

### Changed

- The Sendspin client now ships as one compact browser bundle built from locked dependencies, with the original licenses included.

## [1.0.2] - 2026-10-13

### Fixed

- Compatibility with import-path rewriting during upstream synchronization.

## [1.0.1] - 2026-10-13

### Fixed

- Compatibility with the current Music Assistant development branch.

## [1.0.0] - 2026-10-09

### Added

- The kiosk shows a Sendspin pairing code when the server asks the browser to pair.

### Changed

- The page is the kiosk player. `/web` and `/web?kiosk=1` both open it. Choose music in Music Assistant. Library browsing and search are no longer part of this page.
- The kiosk has a volume slider. It shows the full length of the current item and restores the playback position when the page reconnects, including while paused.
- When the current item has no cover, the art slot shows an ASCII emblem: Music Assistant during normal playback, and Sendspin when `sendspin=1`. A cover replaces the emblem.
- Closing the kiosk page removes its player from Music Assistant. Reloading the page keeps the player. An idle player still leaves after `player_idle_timeout`.
- Sendspin sync now targets Music Assistant 2.11. The kiosk vendors sendspin-js 5.0.0 and registers its bridge under the browser's own Sendspin identity, so a synchronized group can hand playback to that browser. The previous `spb_wk_` client id is no longer used.
- Browsers without WebCodecs stay on FLAC/PCM. Opus through the unpackaged `opus-encdec` fallback is not shipped with the kiosk.
- The visualizer draws the track's stored energy curve as 48 bars around the playhead. A track without analysis, or `viz=0`, leaves the canvas empty.
- Lyrics are three centered lines under the artist. Timed lines follow the playback clock. Lines without timestamps move across the song. `lyrics=0` hides them.
- Playback controls sit below the seek bar.

### Fixed

- Sendspin mode loads in the browser. The crypto libraries sendspin-js imports (`@noble/curves`, `@noble/hashes`, and `@noble/ciphers`) are vendored beside the client, with paths a browser can open.
- A kiosk opened with `sendspin=1` plays the Web Kiosk stream. It was ignoring that stream, so playback started in Music Assistant produced silence unless a separate Sendspin stream was already running.
- The first tap or key press on the page allows audio. Later tracks start on their own while that page stays open. The prompt stays up until playback actually starts.
- The page shows the cover, title, energy bars, lyrics, and party code without a Music Assistant token.
- When a track ends, the next queue item starts. The last item stops playback instead of leaving the player in the playing state.
- The party code is shown while guest access is on.

## [0.1.1] - 2026-08-28

### Fixed

- Localized the kiosk URL configuration description through the provider strings catalog.
- Hardened local development setup when the expected Music Assistant checkout path is occupied.

## [0.1.0] - 2026-08-25

### Added

- Standalone Web Kiosk player provider: turn any browser into a fullscreen Music Assistant kiosk player.
- HTML5 playback through the Music Assistant streamserver with WebSocket push control.
- Library browsing, search, and playback control through Music Assistant's native JSON-RPC and WebSocket APIs.
- Fullscreen kiosk overlays: visualizer, synced lyrics, party QR code, and queue display.
- Kiosk URL builder on the status dashboard and a copyable kiosk URL config entry.
- Sendspin multiroom sync via a web-kiosk bridge role with automatic HTTP fallback.
