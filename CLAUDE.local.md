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
  disconnect cleanup, stream-end and failure handling, Sendspin fallback,
  provider-owned background work.
- `player.py` — `WebKioskPlayer`: a flow-mode player (spec 0009). Playback
  commands, the playback generation, the browser clock, rebuilding the queue's
  flow stream for a page that joins mid-stream. It sends page messages through
  the page server directly.
- `http_server.py` — `WebKioskHTTPServer`: kiosk page, URL builder, stream
  redirect, the push WebSocket and everything sent to pages, including the
  metadata of each new queue item during a flow stream.
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
| `_playback_generation` | the kiosk itself | — (identity of one play) | every browser report must carry it |
| clock: `elapsed_time`, `_track_started_at`, `_accepted_position` | browser position reports (seconds into the served stream; for a flow stream, the whole queue) | the page is not playing HTML5 (Sendspin mode), a report from an older stream | generation check; holds after 10 s without browser evidence and never passes a single stream's audio; the queue maps a flow position to its current item (spec 0008, 0009) |
| `serves_flow` | `streams.resolve_stream_url()` | the next `play_media()` | resolved on every `play_media()` |
| `_playback_speed` | queue item `playback_speed` | the item changes | set on every `play_media()` |
| `current_media`, state and clock taken over from the output (`claim(take_over=True)`) | the Sendspin output's state | the HTML5 stream starts, or the fallback ends without one | replaced by `play_media()` of the fallback's resume; every other exit releases the claim (IDLE) or, after a failed teardown, hands the output back to Sendspin and stops it when a pause or stop arrived meanwhile |
| `sendspin_fallback`, `html5_requested`, active output | MA output selection | a new verified Sendspin connection, a tab change | bridge/output rules; core API tracked in #44 |
| `_media_signatures`, `_group_signatures`, `_player_names`, `_flow_items` | MA player state | any state update | de-duplication caches only, never decisions |

## Core flows are reused, not rebuilt

When the kiosk does a step that Music Assistant normally does, it calls the
public core API for the whole step, never a subset of its parts. A subset
looks equivalent in a test and drops what the core adds later (resume
positions, playback speed, skipping unplayable items, session checks).

| Step | Core API to call |
|------|------------------|
| Decide what plays next | none: the kiosk requires flow mode, plays the stream `streams.resolve_stream_url()` returns unchanged, and the queue controller's flow stream walks the queue (order, repeat, edits, crossfade, overlays) |
| Prepare a queue item for a player | `player_queues.load_next_queue_item()`, then `player_media_from_queue_item()` |
| Resume a queue | `player_queues.resume()`; `play_index()` only to choose the position, as the Sendspin fallback does at the end of a track |
| Move playback between outputs | the bridge and output rules (core API tracked in #44) |

The end of a stream is the end of the queue (or of radio or an announcement):
the kiosk reports IDLE and Music Assistant's end-of-queue handling runs.
`tests/standalone/test_core_flows.py` fails any read of the queue order and any
queue item converted to player media without loading it through the queue.

## Playback started after an await

Kiosk work that awaits and then starts playback (the resume after a Sendspin
fallback, the stream rebuilt for a reconnecting page) competes with the user's
commands. Holding the playback lock does not order them: queue pause takes
no lock, and an announcement must not be blocked.

Such work takes a playback claim before its first await and starts playback
only through it:

```python
claim = player.claim(take_over=True)  # take_over only when moving off an output
try:
    ...  # awaits
    await claim.start(lambda: queues.resume(queue_id))
finally:
    claim.release()
```

`PlaybackClaim` (`player.py`) owns the rules:

- **Commands reach the kiosk during the wait.** `take_over=True` continues the
  output's playback as the kiosk's own before the first await, so a pause or
  stop is handled by the kiosk instead of the output being torn down (a
  Sendspin output has no pause; the core would turn it into a stop).
- **Ownership is re-checked.** `start()` begins only while no stop, newer play
  or new player instance replaced the claimed playback; otherwise it returns
  False without playing or stopping anything.
- **The user's last command is kept.** After the start, a pause, play or stop
  issued since the claim wins; without one, a player paused at the claim is
  paused again. Starting a stream sets PLAYING, so a pause that landed during
  preparation would otherwise be lost.
- **No taken-over state is left behind.** `release()` drops a takeover that
  started no stream (IDLE).

`tests/standalone/test_commit_after_await.py` fails a playback start (`play_media`,
`play_index`, `resume`, `cmd_seek`, ...) awaited directly after an earlier await,
and a `claim()` without a `release()` in a `finally` block.

## Resume positions

A stream the kiosk starts at a position (the reconnect seek, the Sendspin
fallback resuming inside a track) must not start at the very end of the
track. That stream is empty, the queue controller drops its seek offset, and
the page's end report looks premature. Every position passed to `cmd_seek()`,
`seek()` or `play_index()` comes from `resume_position()`, which leaves
`END_MARGIN` seconds to play. `tests/standalone/test_resume_positions.py`
fails any other position.

## Review checklist

Run before opening a PR (and ask `pr-review-toolkit:silent-failure-hunter`
and `pr-review-toolkit:code-reviewer` to check it):

- Cancellation in the middle of every new await.
- Re-entrancy: can the new code tear down its own caller or owner?
- Provider unload or reload while the new code waits.
- Page reload, second tab or reconnect during the operation.
- A slow or dead socket.
- A delayed report from an older playback (generation).
- A page joining mid-stream: a flow URL reopened starts again at its first item.
- An announcement holding the playback lock.
- Failure of every new task: who sees it, and what recovers?
- Lock order and the owner of every new task.
- Does new code start playback after an await? Take a `claim()` before the first await, start through `claim.start()`, release it in `finally` (see *Playback started after an await*).
- Does new code use something it loaded or looked up before an await (a queue item, a player)? Check it again after the await.
- Does new code decide which queue item plays next? Leave it to the flow stream (see *Core flows*).
- Does new code start a stream at a position? Compute it with `resume_position()` and test it at the track boundary.
- Does the new code repeat a step the core does? Call the core API for the whole step (see *Core flows*).

## Gotchas

- Tests in `tests/` are exported upstream; repo-only tests go in
  `tests/standalone/`.
- The mocked `mass.create_task` in `tests/conftest.py` returns the coroutine
  without running it; tests that need the task to run set a side effect.
- `hypothesis` is not an upstream test dependency; do not use it in `tests/`.
