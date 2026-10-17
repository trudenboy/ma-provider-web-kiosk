---
title: End-to-end test report — flow mode
description: Real-browser validation of the HTML5 flow stream, the playback claim and page seeks on Music Assistant nightly.
---

Real-browser validation of Web Kiosk `dev` at `310186f` on 2026-10-17. This
build includes HTML5 flow-stream playback (spec 0009), the playback claim, direct
page messages and the end margin for page seeks.

## Environment

| Item | Value |
|------|-------|
| Music Assistant | `ghcr.io/music-assistant/server:nightly`, 2.11.0.dev2026101703, isolated container and data directory |
| Provider | Web Kiosk `dev` at `310186f`, linked into `music_assistant/providers/web_kiosk` |
| Browser | Google Chrome 154, headless, driven by Playwright 1.61 |
| Media | Local files provider: one album with four 25-second tracks, a second album with two |
| Audio tooling | FFmpeg 9.0.1 in the container |

Commands were sent through the Music Assistant JSON-RPC API. Queue and player
state were sampled every second. The kiosk page was instrumented to record every
WebSocket message and media element.

## Results

| # | Scenario | Observed | Result |
|---|----------|----------|--------|
| F1 | Album on an HTML5 kiosk | One `/stream` request, redirected to `/flow/`; queue index 0 → 3; one `media` message per new track (start −25, −50, −75 s on the stream clock); page title within 1 s of the queue; queue and player `idle` at the end | Pass |
| F2 | Crossfade, tracks from two albums | Flow stream with standard crossfade (8 s); 79 s for four 25 s tracks; `media` start −18, −36, −54 s; the page follows the queue | Pass |
| F3 | Pause, repeated pause, resume, API seek | Position held at 4.6 s through two pauses; resume continued; seek to 15 s matched on page and queue | Pass |
| F4 | Progress slider to 100% | Page sent a seek to 23 s (25 − 2 s end margin); the track finished and the next one played | Pass |
| F5 | Volume, next, previous | Volume 35 reached the page slider; next and previous followed the queue | Pass |
| F6 | Page reload mid-track | Stream rebuilt at the queue position (8.7 s → 11.6 s); one `play` message; title and clock restored | Pass |
| F7 | Announcement mid-track | Track resumed at its position after the clip; 6.8 s total for a 4 s clip | Pass |
| F8 | Two tabs, first tab closed | The remaining tab got a rebuilt stream; the queue position kept following it and the next track | Pass |
| F9 | Next item deleted while playing | The flow stream skipped it; the page showed the following track | Pass |
| F10 | Repeat One, Repeat All | Repeat One replayed the track; Repeat All wrapped from the last item to the first | Pass |
| F11 | Stop, play after stop | Player `idle`, page clock `0:00`; play resumed the queue | Pass after fix (see below) |
| F12 | Sendspin kiosk, then fallback to HTML5 | Sendspin played the queue; the fallback resumed natively at the queue position (7.9 s → 10.4 s) on the flow stream | Pass |
| F13 | Sendspin page reloaded as HTML5 | Output moved to native with one `play` message and one new flow stream; the queue followed | Pass |
| F14 | Stream token, cross-site WebSocket, framing | Stream with the page token: 302; without or with a wrong token: 403; cross-site WebSocket: 403; `X-Frame-Options: DENY`, `frame-ancestors 'none'` | Pass |
| F15 | Browser cannot load its stream | `playback_error` with the playback generation (`MediaError4`); kiosk `idle` | Pass |
| F16 | Provider reload; disable and enable a connected kiosk | The page reconnected and played after the reload; the kiosk left and rejoined the registry and played | Pass |

## Issue found and fixed during the run

**The clock of a stopped page showed where the stream ended (F11).** With one
stream for the whole queue, the audio element's last position can be far past the
song: after the queue ended the page showed `1:40 / 0:00`. A stopped page now
shows `0:00`.

## Notes

- With crossfade, Music Assistant switches the queue to the next track when the
  previous one has fully faded out, and reports the new track's elapsed time
  including the overlap. The page follows the queue, so its title changes at the
  same moment as in other Music Assistant clients.
- Music Assistant does not crossfade between tracks of the same album unless that
  option is enabled.
- While the verified Sendspin page of a device is connected, an unverified HTML5
  tab with the same device ID cannot move the device's output (a device ID is not
  a credential). Once the Sendspin page has gone, an HTML5 page takes over.
- A pause on a Sendspin output is a stop in Music Assistant (Sendspin has no
  pause), so a fallback after it leaves the queue stopped.
