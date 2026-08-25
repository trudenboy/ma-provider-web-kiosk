# Web Kiosk for Music Assistant

Turn any web browser into a fullscreen Music Assistant kiosk player with
Sendspin multiroom sync.

A spare tablet, a Raspberry Pi display, or a TV's browser can become a
dedicated, always-on Music Assistant player. The provider runs a tiny embedded
HTTP server that serves the kiosk app and registers the browser as a player;
everything else — library browsing, search, queue management, playback control,
lyrics, and party mode — goes through Music Assistant's own JSON-RPC and
WebSocket APIs.

## Features

- Fullscreen kiosk mode (`/web?kiosk=1`) with auto-hiding controls
- Library browsing (with drill-down) and search via Music Assistant's native API
- HTML5 playback served by the Music Assistant streamserver
- Kiosk overlays: visualizer, synced lyrics, party QR code, queue display
- Bidirectional WebSocket push (play / stop / pause / resume / seek / position)
- Kiosk URL builder on the dashboard plus a copyable `kiosk_url` config entry
- Sendspin multiroom sync with automatic HTTP fallback

## Kiosk URL builder

Open `http://<kiosk-host>:8098/` for an interactive URL builder that composes
the kiosk URL with your choice of HTML5 or Sendspin mode and the
controls / party / visualizer / lyrics display toggles, then copy it. The same
base URL is also shown as the read-only `kiosk_url` field in the provider's
configuration so you can copy it from Music Assistant.

Display toggles are URL parameters (`=0` disables):

- `controls` — playback controls overlay (default on)
- `party` — party QR overlay (default on)
- `viz` — visualizer (default on)
- `lyrics` — synced lyrics panel (default on)

## Quick start

1. Install the provider and enable it in Music Assistant.
2. Open the kiosk app and pass the Music Assistant server URL and an auth token:
   `http://<kiosk-host>:8098/web?kiosk=1&ma_url=http://<ma-host>:8095&token=<token>`
3. The browser registers as a Music Assistant player and is controllable from
   anywhere in Music Assistant.

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `http_port` | `8098` | Port for the embedded kiosk HTTP server |
| `output_format` | `mp3` | Preferred HTML5 audio format (`mp3` / `aac` / `flac`) |
| `player_idle_timeout` | `30` | Unregister idle kiosk players after this many minutes |
| `show_stop_notification` | `false` | Ask for confirmation before closing playback |
| `enable_sendspin_bridge` | `true` | Register kiosks as Sendspin clients for multiroom sync |
| `kiosk_url` | *(read-only)* | Copyable base kiosk URL composed from the MA webserver URL |

## Development

See `AGENTS.md` for the project structure and the Music Assistant provider
development loop (feature specs, TDD, verification, changelog discipline).

```bash
uv run pytest          # run tests
uv run ruff check provider/
uv run mypy provider/
pre-commit run --all-files
```
