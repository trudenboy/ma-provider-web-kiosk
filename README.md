# Web Kiosk for Music Assistant


<!-- >>> ma-provider-tools sync (readme header) — DO NOT EDIT >>> -->
[![CI](https://github.com/trudenboy/ma-provider-web-kiosk/actions/workflows/test.yml/badge.svg)](https://github.com/trudenboy/ma-provider-web-kiosk/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/trudenboy/ma-provider-web-kiosk?display_name=tag)](https://github.com/trudenboy/ma-provider-web-kiosk/releases/latest)
[![License](https://img.shields.io/github/license/trudenboy/ma-provider-web-kiosk)](LICENSE)
[![Music Assistant](https://img.shields.io/badge/Music%20Assistant-9070B8?logo=python&logoColor=white)](https://www.music-assistant.io/)[![stable](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrudenboy.github.io%2Fma-provider-tools%2Fbadges%2Fweb_kiosk-stable.json)](https://github.com/music-assistant/server/releases/latest)[![beta](https://img.shields.io/endpoint?url=https%3A%2F%2Ftrudenboy.github.io%2Fma-provider-tools%2Fbadges%2Fweb_kiosk-beta.json)](https://github.com/music-assistant/server/releases?q=prerelease)
[![Stars](https://img.shields.io/github/stars/trudenboy/ma-provider-web-kiosk?style=flat&logo=github)](https://github.com/trudenboy/ma-provider-web-kiosk/stargazers)

**📖 [Documentation](https://trudenboy.github.io/ma-provider-web-kiosk/)** · **🔄 [Changelog](CHANGELOG.md)** · **🐛 [Issues](https://github.com/trudenboy/ma-provider-web-kiosk/issues)** · **💬 [Discussions](https://github.com/trudenboy/ma-provider-web-kiosk/discussions)**

**Related providers:** [MSX Bridge](https://github.com/trudenboy/ma-provider-msx-bridge)
<!-- <<< ma-provider-tools sync (readme header) <<< -->

Turn any web browser into a fullscreen Music Assistant kiosk player with
Sendspin multiroom sync.

A spare tablet, a Raspberry Pi display, or a TV's browser can become a
dedicated, always-on Music Assistant player. The provider runs a tiny embedded
HTTP server that serves the kiosk app and registers the browser as a player.
Choose music in Music Assistant. The screen follows that player without an
API token: cover, title, energy bars, lyric lines, and the party code.
Playback buttons on the page need a token.

## Features

- Fullscreen Sendspin player at `/kiosk`, with optional controls and additions (`/web` remains an alias)
- HTML5 playback served by the Music Assistant streamserver
- Kiosk overlays: energy-track visualizer, three lyric lines, party QR code, queue display
- Bidirectional WebSocket push (play / stop / pause / resume / seek / position)
- Kiosk URL builder on the dashboard plus a copyable `kiosk_url` config entry
- Sendspin multiroom sync for Music Assistant 2.11 (sendspin-js 5.0.0) with automatic HTTP fallback

## Kiosk URL builder

Open `http://<kiosk-host>:8098/` for an interactive URL builder that composes
the kiosk URL with your choice of HTML5 or Sendspin mode and the
controls / party / visualizer / lyrics / queue / player ID display toggles, then copy it. The same
base URL is also shown as the read-only `kiosk_url` field in the provider's
configuration so you can copy it from Music Assistant.

The clean URL opens Sendspin without optional additions. Use `sendspin=0`
for HTML5. Display additions are opt-in URL parameters (`=1` enables):

- `controls` — playback controls
- `party` — Party QR (click it to enlarge)
- `viz` — visualizer
- `lyrics` — lyric lines
- `queue` — queue display (requires an MA API token)
- `show_player_id` — extra selectable player identifier label

Without a track, the main title always shows the server-derived Player ID,
with Music Assistant and its version below it.

Enable **Require MA sign-in for URL builder** in provider settings to protect
the constructor and player list. Sign in with your MA username/password or an
MA access token. The player URLs remain public; this setting protects the builder.

## Quick start

1. Install the provider and enable it in Music Assistant.
2. Open `http://<kiosk-host>:8098/kiosk`.
   This starts a minimal Sendspin player. Add `?controls=1&token=<token>` when the page itself should change volume, seek, or skip.
3. The browser registers as a Music Assistant player. Start playback from
   Music Assistant. The screen follows that player. The first tap or key press
   on the page allows sound; later tracks start on their own while that page
   stays open. Closing the page removes the player. Reloading the page keeps it.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `http_port` | `8098` | Port for the embedded kiosk HTTP server |
| `player_idle_timeout` | `30` | Unregister idle kiosk players after this many minutes |
| `show_stop_notification` | `false` | Ask for confirmation before closing playback |
| `enable_sendspin_bridge` | `true` | Register kiosks as Sendspin clients for multiroom sync |
| `url_builder_require_auth` | `false` | Require MA sign-in for the URL builder and player list |
| `kiosk_url` | *(read-only)* | Copyable base kiosk URL composed from the MA webserver URL |

## Development

See `AGENTS.md` for the project structure and the Music Assistant provider
development loop (feature specs, TDD, verification, changelog discipline).

The Sendspin SDK is built from locked npm dependencies. See
[browser asset build instructions](scripts/sendspin/README.md) for rebuilding
and checking the committed bundle; Node is only needed during development.

```bash
uv run pytest          # run tests
uv run ruff check provider/
uv run mypy provider/
pre-commit run --all-files
```
