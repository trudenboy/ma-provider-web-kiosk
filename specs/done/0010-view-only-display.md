---
id: "0010"
title: "View-only display screens, pushed queue and embeddable kiosk"
size: L
status: done
priority: P1
effort_minutes: 720
feature_id:
---

## Problem Statement

A household, venue or Home Assistant dashboard often needs a screen that only
shows a player: artwork, title, progress, lyrics, upcoming queue and the Party
QR. Today every `/kiosk` page registers a new Music Assistant player, the queue
needs a user access token in the URL, and the kiosk port refuses to be framed,
so the page cannot be embedded in a Lovelace dashboard. On a TV the token is a
credential that guests can extract, and every display becomes an audio output
even when playback happens on a speaker.

In addition, the page keeps polling the queue over the Music Assistant API and
has no read-only way to receive it, repeated fullscreen requests are lost after
a reload, and there is no installable/manifest-based kiosk entry point.

## Solution Summary

Add an opt-in display mode (`/view`) that subscribes to any Music Assistant
player over the existing push WebSocket without registering a player and
without a Music Assistant token. The server pushes compact state, queue and
lyric messages. When the mode is enabled, the normal player page can receive
the same compact queue push instead of polling the API with a token.

Add an exact-origin `frame_ancestors` allowlist that applies only to display
pages; all other pages keep `X-Frame-Options: DENY` and
`frame-ancestors 'none'`. Add `profile` presets (`player`, `tv`, `wall`,
`guest`), a `lock` fullscreen mode and a web app manifest so a kiosk can be
provisioned from one URL. Display mode stays off by default.

## Acceptance Criteria

1. `/view?player=<id>` shows any registered Music Assistant player's current
   item, progress, lyrics and queue without creating a `WebKioskPlayer` and
   without an MA token; closing the page does not affect that player.
2. `/view?party=1` resolves the Party plugin's player and shows the same
   read-only view, including the Party QR when the provider setting enables it.
3. With display mode enabled, queue additions, removals, moves and current-item
   changes reach connected display pages within two seconds through a compact
   `queue` message, and the display page makes no `player_queues/*` API calls.
4. With display mode disabled (default), `/view` and the display WebSocket are
   rejected and the existing player page behaviour is unchanged.
5. `frame_ancestors` accepts exact `http(s)://host[:port]` origins, rejects
   wildcards/paths/other schemes, and sets `frame-ancestors` only on `/view`
   (and `/kiosk?display=1`); the builder, login and player pages stay `DENY`.
6. `profile=tv|wall|guest` expands to the documented flags without overriding
   explicit URL parameters; `lock=1` hides the exit control and requests
   fullscreen on the first user gesture; `/web/manifest.webmanifest` and its
   icon are served with `display: fullscreen`.
7. All new code passes `ruff`, `mypy`, `pytest` and `pre-commit run --all-files`.

## Test Plan

- `tests/test_display_mode.py`: `/view` route, disabled-mode rejection, player
  resolution (explicit and Party), display WebSocket registration side effects
  (no player registration, no idle-timeout/close), snapshot/queue/lyrics
  messages, generic player state, and disconnect cleanup.
- `tests/test_http_server.py`: default framing headers, allowlist headers on
  display pages only, invalid origin rejection, manifest/static routes, and
  existing player page behaviour.
- `tests/test_display_mode.py` queue cases: compact snapshot shape, party
  badges, player-page queue push and updates on queue events.
- `tests/standalone/js/kiosk.test.mjs`: URL builder display/profile/lock,
  profile expansion and the fullscreen lock gesture; `compatibility.test.mjs`
  parses `display.js` and `view.html` for classic ES2015 syntax.
- Manual: one speaker plus two TVs on `/view?party=1`; a Lovelace webpage card
  with the HA origin allowlisted; a TV browser with `profile=tv&lock=1`; verify
  no new player appears and the queue follows edits.

## Sequence Diagram

```mermaid
sequenceDiagram
    participant D as Display page (/view)
    participant H as WebKioskHTTPServer
    participant M as Music Assistant
    D->>H: GET /view?player=wk_tv
    H-->>D: view.html
    D->>H: WS /ws?display=1&player=wk_tv
    H->>M: players.get_player(wk_tv)
    M-->>H: player state
    H-->>D: welcome + display_state + queue + lyrics
    M-->>H: player state update
    H-->>D: display_state
    M-->>H: QUEUE_ITEMS_UPDATED
    H->>M: player_queues.items(queue_id, ...)
    H-->>D: queue (compact items)
    D->>H: close
    Note over H: forget display socket; player untouched
```

## Data Model

New provider config entries:

- `enable_display_mode: bool` — default `false`; gates `/view` and the display
  WebSocket. A trusted-LAN trade-off, documented.
- `frame_ancestors: string` — default `""`; comma-separated exact origins that
  may frame display pages. Empty keeps `frame-ancestors 'none'`.

New WebSocket messages (display clients only):

- `display_state`: `player_id`, `custom_name`, `group_name`, `playback_state`,
  `elapsed`, `duration`, `playback_speed`, `volume_level`, `volume_muted`,
  `media` (`title`, `artist`, `image_url`, `duration`, `media_type`,
  `queue_item_id` or `null`).
- `queue`: `queue_id`, `current_index`, `items[]` with `queue_item_id`,
  `title`, `artist`, `duration`, `image_url`, `is_current`, `party_guest`,
  `party_boosted`.
- `lyrics`: `lines[]` with `t` and `text` (existing shape).

Player-page additions: `queue` messages replace token polling when display mode
is enabled; `welcome` may include `display: false`.

Display page assets: `view.html`, `display.js`, `manifest.webmanifest`,
`icon.svg`.
