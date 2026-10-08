# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
