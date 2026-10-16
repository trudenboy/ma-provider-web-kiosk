# CLAUDE.local.md

Provider-specific guidance for **Web Kiosk**. The shared rules live in
[`CLAUDE.md`](./CLAUDE.md); this file covers the architecture and the
invariants the tests enforce.

## Architecture

```
Browser (/kiosk page) --WebSocket + HTTP--> WebKioskHTTPServer (port 8098)
                                              |
                                   WebKioskProvider / WebKioskPlayer --internal API--> MA core
Browser (sendspin-js) --Sendspin--> Sendspin provider <-- WebKioskSendspinBridge
```

- `provider.py` — `WebKioskProvider`: player registration on demand, idle and
  disconnect cleanup, track-end and failure handling, Sendspin fallback,
  provider-owned background work.
- `player.py` — `WebKioskPlayer`: playback commands, the playback generation,
  the browser clock, the queue item MA handed over in advance (`ENQUEUE`).
- `http_server.py` — `WebKioskHTTPServer`: kiosk page, URL builder, stream
  redirect, the push WebSocket and everything sent to pages.
- `sendspin_bridge.py` — bridges a verified browser Sendspin identity to the
  kiosk player; the connect watchdog that triggers HTML5 fallback.
- `ownership.py` — Sendspin identity proof (challenge/response).
- `party.py`, `lyrics.py` — Party QR and lyrics through MA's API.
- `static/web/` — the kiosk page (`web.js`), URL builder, bundled sendspin-js.

## Async work has exactly one owner

Every task belongs to one of these owners. Nothing else may call
`create_task`/`ensure_future`; `tests/standalone/test_task_ownership.py`
enforces the list.

| Owner | How | Ends when |
|-------|-----|-----------|
| Provider | `_spawn()` (fire and forget) or `run_owned()` (awaited; the caller may go away), both through `_own()` | `unload()` cancels and awaits it |
| Socket | `_post()` (a message to one page) and `_start_page_preparation()`, both registered by `_own_socket_task()` | the socket is forgotten (`_forget_socket`) |
| Named singleton | a field that holds the task: idle loop (`_timeout_task`), pending close (`_disconnect_tasks`), connect watchdog (`_connect_watchdog`) | its owner cancels and awaits it |

Rules:

- Work that changes playback or the queue, or outlives a request, is provider
  work. A component that is torn down by that work (a bridge removed by its
  own fallback) must hand it to the provider instead of running it. A page's
  preparation awaits such work through `run_owned()`, so closing the page
  never leaves a seek without its re-pause or a fallback without its resume.
- Messages for other pages go through their own sockets (`_post`), so one
  page closing never drops another page's messages.
- Teardown never cancels or awaits the task it runs in.
- A task nobody awaits must report its own failure (log and act, such as
  closing the socket). The autouse fixture `task_errors_are_retrieved`
  fails any test that leaves a task failure nobody retrieved.

## Lock hierarchy

Take locks only in this order. A task holding a later lock never acquires
an earlier one. The autouse fixture `lock_order` (`tests/conftest.py`) checks every
test, including MA's own playback lock when a test runs the real player
controller; `tests/test_invariants.py` proves the check is active.

1. **MA playback lock** — `playback_lock(mass, player_id)`
   (`players.get_group_and_player_lock(strict=True)`). Serializes playback
   commands for the player and its group. MA's own commands take it too, so
   calling an MA playback command counts as taking it. The announcement
   controller holds it until the player reports IDLE: never make the page's
   path to IDLE wait for it.
2. **Provider player lock** — `WebKioskProvider._player_lock`. Registration,
   identity ownership, bridge lifecycle, unload.
3. **Outbound channel** — `WebKioskHTTPServer._outbound_lock(player_id)`.
   Orders every message to one player's pages. Leaf: hold it only to read
   state and send; no other lock and no MA command inside it.

## Shadow state

The kiosk keeps copies of state that Music Assistant owns. Each copy names
its source of truth and where it is validated. Prefer asking MA at the point
of use over keeping a copy.

| Copy | Source of truth | Goes stale when | Validated |
|------|-----------------|-----------------|-----------|
| `_enqueued_media` | queue controller's next item | an item is deleted, the queue cleared, repeat or shuffle changes without a new next item | at use: `get_next_item()` from the finished item; a stale or missing copy is replaced by the item `load_next_queue_item()` prepares |
| `_playback_generation` | the kiosk itself | — (identity of one play) | every browser report must carry it |
| clock: `elapsed_time`, `_track_started_at`, `_accepted_position` | browser position reports | the page is not playing HTML5 (Sendspin mode), a report from an older stream | generation check; holds after 10 s without browser evidence and never passes the served audio; a fallback resumes inside the track (spec 0008) |
| `_playback_speed` | queue item `playback_speed` | the item changes | set on every `play_media()` |
| `sendspin_fallback`, `html5_requested`, active output | MA output selection | a new verified Sendspin connection, a tab change | bridge/output rules; core API tracked in #44 |
| `_media_signatures`, `_group_signatures`, `_player_names` | MA player state | any state update | de-duplication caches only, never decisions |

## Core flows are reused, not rebuilt

When the kiosk does a step that Music Assistant normally does, it calls the
public core API for the whole step, never a subset of its parts. A subset
looks equivalent in a test and drops what the core adds later (resume
positions, playback speed, skipping unplayable items, session checks).

| Step | Core API to call |
|------|------------------|
| Prepare the next queue item for this player | `player_queues.load_next_queue_item()`, then `player_media_from_queue_item()` |
| Resume a queue | `player_queues.resume()`; `play_index()` only to choose the position, as the Sendspin fallback does at the end of a track |
| Move playback between outputs | the bridge and output rules (core API tracked in #44) |

`tests/standalone/test_core_flows.py` checks the first row: a function that
converts a queue item to player media must load it through the queue first.

## Review checklist

Run before opening a PR (and ask `pr-review-toolkit:silent-failure-hunter`
and `pr-review-toolkit:code-reviewer` to check it):

- Cancellation in the middle of every new await.
- Re-entrancy: can the new code tear down its own caller or owner?
- Provider unload or reload while the new code waits.
- Page reload, second tab or reconnect during the operation.
- A slow or dead socket.
- A delayed report from an older playback (generation).
- Queue edits after a handover: delete, clear, repeat, shuffle.
- An announcement holding the playback lock.
- Failure of every new task: who sees it, and what recovers?
- Lock order and the owner of every new task.
- Does the new code repeat a step the core does? Call the core API for the whole step (see *Core flows*).

## Gotchas

- Tests in `tests/` are exported upstream; repo-only tests go in
  `tests/standalone/`.
- The mocked `mass.create_task` in `tests/conftest.py` returns the coroutine
  without running it; tests that need the task to run set a side effect.
- `hypothesis` is not an upstream test dependency; do not use it in `tests/`.
