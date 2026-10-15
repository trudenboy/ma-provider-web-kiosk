---
title: Configuration
---

## Adding the Provider to Music Assistant

1. Open **Music Assistant → Settings → Providers**
2. Click **Add Provider** and select **Web Kiosk**
3. Keep the default HTTP port or choose another free port, then click **Save**
4. Open `http://<ma-host>:8098/` to build a kiosk URL

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
| `show_group` | off | `show_group=1` shows the current MA group name; hidden for standalone players |
| `remote` | off | `remote=1` enables arrow/Enter/Back navigation for TV remotes |
| `lite` | off | `lite=1` reduces decorative effects and visualizer redraw frequency |
| `wake_lock` | off | `wake_lock=1` requests screen wake lock when the browser supports it |
| `fullscreen` | off | `fullscreen=1` shows an optional enter/exit fullscreen button where supported |
| `#token=<ma-access-token>` | unset | URL fragment carrying the MA access token for controls and queue access |
| `device_id` | stored browser identity | Explicit identity for this browser player |
| `sendspin_url` | same host, port `8927` | Override the Sendspin connection address |

The idle main title and mini-player show the custom player name from MA when set,
otherwise the Player ID. Renaming updates connected pages. The optional
`show_player_id` badge always shows the technical ID. `/web` remains a player URL
alias; the old `kiosk=1` parameter is accepted but is no longer needed.

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
