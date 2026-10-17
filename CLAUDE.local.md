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
   path to IDLE wait for it. Queue pause does not take it, so holding it does
   not order a pause after kiosk work (see *Playback started after an await*).
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
| `current_media`, state and clock taken over from the output (`take_over_output()`) | the Sendspin output's state | the HTML5 stream starts, or the fallback ends without one | replaced by `play_media()` of the fallback's resume; every other exit calls `abandon_takeover()` (IDLE) or, after a failed teardown, hands the output back to Sendspin and stops it when a pause or stop arrived meanwhile |
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
| Choose the stream route | `streams.resolve_stream_url()`; the kiosk still replaces `/flow/` with `/single/` because the page plays one stream per item (known deviation, #81) |

`tests/standalone/test_core_flows.py` checks the first row: a function that
converts a queue item to player media must load it through the queue first.

## Playback started after an await

Kiosk work that awaits and then starts playback (the next queue item after a
track end, the resume after a Sendspin fallback) competes with the user's
commands. Holding the playback lock does not order them: queue pause takes
no lock, and an announcement must not be blocked. So:

- **Commands reach the kiosk during the wait.** A flow that moves playback to
  the kiosk calls `take_over_output()` before its first await. From then on a
  pause or stop is handled by the kiosk itself, not by the output being torn
  down. On a Sendspin output, which has no pause, the core would turn a pause
  into a stop.
- **Re-check after the await.** Capture `playback_generation` before the
  await and start playback only if `still_plays(generation)` is true. A stop
  or a newer play changes the generation; an unregistered or replaced player
  is no longer the registered instance. If the check fails, return without
  playing or stopping anything: someone else owns the player now.
- **Keep the last pause.** If the player is PAUSED after the await, start the
  playback and pause it, so the page holds the new stream and a later play
  resumes it. When starting awaits too (the fallback's resume), pause only if
  `command_count` is unchanged since the pause was read: a later play or stop
  wins.
- **Never leave taken-over state behind.** Every exit after
  `take_over_output()` that does not start a stream undoes it.

`tests/standalone/test_commit_after_await.py` checks the re-check: in an async
function, a playback start after an await must follow a `still_plays()` call
that comes after that await.

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
- Does new code start playback after an await? Capture the generation, re-check `still_plays()`, keep a pause (see *Playback started after an await*).
- Does the new code repeat a step the core does? Call the core API for the whole step (see *Core flows*).

## Gotchas

- Tests in `tests/` are exported upstream; repo-only tests go in
  `tests/standalone/`.
- The mocked `mass.create_task` in `tests/conftest.py` returns the coroutine
  without running it; tests that need the task to run set a side effect.
- `hypothesis` is not an upstream test dependency; do not use it in `tests/`.
