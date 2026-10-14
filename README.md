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

Turn a browser into a fullscreen Music Assistant player on a tablet, computer,
Raspberry Pi display, or compatible TV browser. Choose music in Music Assistant;
the kiosk shows the current track and plays its audio.

## Quick start

1. In Music Assistant, open **Settings → Player Providers**, add **Web Kiosk**,
   and save its settings.
2. On the playback device, open `http://<ma-host>:8098/kiosk`.
   For example: `http://192.168.10.10:8098/kiosk`.
3. Tap or press a key on the page to allow audio. Select the registered browser
   player in Music Assistant and start playback there.

The clean URL selects **Sendspin**, with all optional additions off. To use
ordinary HTML5 streaming, open `http://<ma-host>:8098/kiosk?sendspin=0`.
Keep the page open and the device awake during playback. A reload needs another
user gesture to allow sound. The browser keeps its identity in local storage;
closing its last connection removes the player after a five-second grace period.

## Features

- Fullscreen artwork, track metadata, and a blurred artwork background.
- Without a track: HTML5 or Sendspin artwork, the Player ID as the main title,
  and the Music Assistant server version underneath.
- Optional playback controls styled after the MA mini-player, with a layout
  for narrow screens.
- Optional visualizer from stored audio analysis, lyrics, Party QR,
  queue display, and an extra selectable Player ID badge.
- Click the Party QR to show it in place of the large artwork; click again or
  press Escape to restore the artwork.
- On wide screens, lyrics appear to the right of the artwork and follow the
  current line. Narrow screens keep three lyric lines below the artwork.
- The bottom-left thumbnail shows the Party QR when available, otherwise the
  Sendspin or HTML5 emblem.
- Experimental Sendspin grouping, with HTML5 fallback when Sendspin cannot connect.
- An interactive URL builder and a copyable base URL in provider settings.

Track metadata and the visualizer, lyrics, and Party QR do not need an MA API
token. On-page playback controls and the queue display require one. Music
selection and library browsing remain in the Music Assistant interface.

## URL builder and parameters

Open `http://<ma-host>:8098/` to choose the player mode, optional additions,
and connection details, then copy the generated `/kiosk` URL. The provider's
read-only **Kiosk URL** setting also contains the base player URL.

| Parameter | Default | Effect |
|-----------|---------|--------|
| `sendspin` | enabled | Set `sendspin=0` for HTML5 playback |
| `controls` | off | `controls=1` enables playback controls |
| `party` | off | `party=1` shows the QR while a Party is active |
| `viz` | off | `viz=1` enables the audio-analysis visualizer |
| `lyrics` | off | `lyrics=1` enables lyric lines when available |
| `queue` | off | `queue=1` enables the queue display; requires a token |
| `show_player_id` | off | `show_player_id=1` adds a selectable ID badge |
| `remote` | off | `remote=1` enables arrow/Enter/Back navigation for TV remotes |
| `lite` | off | `lite=1` reduces decorative effects and visualizer redraw frequency |
| `wake_lock` | off | `wake_lock=1` requests screen wake lock when the browser supports it |
| `fullscreen` | off | `fullscreen=1` shows an optional enter/exit fullscreen button where supported |
| `#token=<ma-access-token>` | unset | URL fragment carrying the MA access token for controls and queue access |
| `device_id` | stored browser identity | Explicit identity for this browser player |
| `sendspin_url` | same host, port `8927` | Override the Sendspin connection address |

The Player ID in the idle main title is always shown, independently of
`show_player_id`. `/web` remains a player URL alias; the old `kiosk=1` parameter
is accepted but is no longer needed.

Examples (replace the host and token):

```text
http://192.168.10.10:8098/kiosk
http://192.168.10.10:8098/kiosk?sendspin=0
http://192.168.10.10:8098/kiosk?controls=1&queue=1#token=<ma-access-token>
http://192.168.10.10:8098/kiosk?party=1&viz=1&lyrics=1&show_player_id=1
```

Use a different `device_id` for each simultaneous player. Clearing browser
storage or changing the browser profile creates a new identity. The builder puts tokens
in URL fragments so they are not sent in HTTP requests. The page stores the token
and removes it from the visible address; treat copied URLs as credentials. Legacy
query-string tokens are still accepted and cleared when the page loads.

### Protect the builder

Enable **Require MA sign-in for URL builder** in provider settings to protect
the root dashboard, URL builder, and player list. Sign in with your MA username
and password, or use an MA access token. An MA access token can also be used when
access to the main MA interface is through Home Assistant authentication.

This setting does not protect `/kiosk` or `/web`. Signing in to the builder does
not grant the player page access to playback controls: supply its token separately.

## Provider settings

| Key | Default | Description |
|-----|---------|-------------|
| `http_port` | `8098` | Port for the embedded kiosk HTTP server |
| `show_stop_notification` | `false` | Show an informational notice after playback stops |
| `enable_sendspin_bridge` | `true` | Enable experimental Sendspin integration |
| `url_builder_require_auth` | `false` | Require MA sign-in for the builder and player list |
| `kiosk_url` | read-only | Copyable canonical `/kiosk` URL |

In individual player settings, the HTML5 output codec defaults to **MP3**.
Choose another codec only if the browser supports it.

## Browser requirements and troubleshooting

Open Kiosk and the URL builder as standalone pages. Their security headers block
iframe embedding, including embedding in Home Assistant dashboards.

- Use a browser with JavaScript, WebSocket, local storage, and audio playback
  support. Compatibility varies across TV browsers. Keep the device awake and
  avoid background-tab suspension.
- Ensure the browser can reach the MA host on port **8098**, the configured MA
  streaming address, and, for Sendspin, port **8927** (or your override).
  A custom HTTP port must also be reachable through your addon/container setup.
- If no player appears, check that Web Kiosk is enabled, the kiosk page connects
  successfully, and the browser console/MA logs show no connection errors.
  Loading the MA frontend alone does not open this kiosk player.
- Reload open kiosk pages after updating the provider so they use the current
  playback protocol and browser assets.
- If the player appears but is silent, tap the page to unlock audio and start
  playback again. A reload requires audio to be unlocked again.
- Sendspin integration is experimental. Complete any pairing prompt shown by
  the page. HTML5 fallback does not provide synchronised playback.
- The bundled Sendspin client advertises **44.1/48 kHz, 16-bit stereo**. Codec
  availability is probed: Opus requires a supported WebCodecs configuration,
  FLAC requires decoding a small sample, and PCM remains the baseline. A separate
  software Opus decoder is not bundled.
- HTML5 plays individual tracks with flow mode disabled; crossfade is not
  supported in that mode. MP3 is the compatibility default.
- Lyrics and the visualizer depend on available lyrics and stored audio analysis.
  Party QR is shown only while a Party is active.

## Browser compatibility

HTML5 playback starts independently of Sendspin. Its required scripts are
checked against classic ES2015 syntax, with Chromium 53 as the initial
compatibility target; layout fallbacks cover missing Grid and newer CSS. This
is a code target, not a certification of every TV browser. Legacy layouts keep
compact lyrics, while modern wide screens show lyrics beside the artwork.

Sendspin loads only when requested and the required Web Audio, crypto and
64-bit JavaScript capabilities exist. The SDK bundle targets Chromium 67,
Safari 15 and Firefox 68 capabilities. Unsupported browsers select HTML5.
On LAN HTTP, WebCodecs is unavailable; verified FLAC or PCM can still be used.
A HTTPS player page needs an explicit HTTPS/WSS `sendspin_url` served by a
working secure proxy; otherwise it selects HTML5 rather than mixed content.

Use `remote=1&controls=1` for a TV remote. Arrows move focus, Enter selects,
and Back closes QR/volume panels when those events reach the web page. The
browser or TV shell can intercept keys; privileged native TV application APIs
are not used. Transport and volume commands still require a MA token.

For slower panels, add `lite=1`. Optional `wake_lock=1` can keep the screen awake
on supported secure origins; denial does not prevent playback. Configure the
native kiosk application's screen/sleep settings when this API is unavailable.
HTML5 on devices with hardware-only media volume shows **Device** instead of a
software volume percentage, and MA hides unsupported volume controls. Active
Sendspin playback retains software volume control. Connections and audio contexts are rechecked when
the page/network returns; an additional tap may still be required by the browser.

Actual TV codecs, remote events, screen sleep and long-running playback need
device validation. See [the compatibility audit](BROWSER_COMPATIBILITY_AUDIT.md)
for the original findings and implementation status.

## Development

The browser functionality previously lived in MSX Bridge. It is now a separate
provider; [server PR #5868](https://github.com/music-assistant/server/pull/5868)
removed that functionality from the TV-focused MSX provider.

See [CLAUDE.md](CLAUDE.md) for the provider development workflow. The Sendspin SDK is built
from locked npm dependencies; see the [browser asset build instructions](scripts/sendspin/README.md).
Node is needed only to rebuild assets, not to run the provider.

```bash
uv run pytest
uv run ruff check provider/
uv run mypy provider/
pre-commit run --all-files
```
