# Web Kiosk for Music Assistant

Turn any web browser into a fullscreen Music Assistant kiosk player with
Sendspin multiroom sync.

A spare tablet, a Raspberry Pi display, or a TV's browser can become a
dedicated, always-on Music Assistant player. The provider runs a tiny embedded
HTTP server that serves the kiosk app and registers the browser as a player.
Choose music in Music Assistant. The screen follows that player without an
API token: cover, title, energy bars, lyric lines, and the party code.
Playback buttons on the page need a token.

## Features

- Fullscreen player at `/web` and `/web?kiosk=1`, with auto-hiding controls and a volume slider
- HTML5 playback served by the Music Assistant streamserver
- Kiosk overlays: energy-track visualizer, three lyric lines, party QR code, queue display
- Bidirectional WebSocket push (play / stop / pause / resume / seek / position)
- Kiosk URL builder on the dashboard plus a copyable `kiosk_url` config entry
- Sendspin multiroom sync for Music Assistant 2.11 (sendspin-js 5.0.0) with automatic HTTP fallback

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
- `lyrics` — three lyric lines under the artist (default on)

## Quick start

1. Install the provider and enable it in Music Assistant.
2. Open the player. `/web` and `/web?kiosk=1` both open it:
   `http://<kiosk-host>:8098/web?kiosk=1`
   Add `&token=<token>` when the page itself should change volume, seek, or skip.
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
