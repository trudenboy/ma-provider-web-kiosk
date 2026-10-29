---
title: Known Issues
---

# Known Issues

Limitations that are known today. They are grouped by the part of the kiosk they
affect; a fixed item is removed rather than kept here as history.

## Availability

### Not part of a Music Assistant release yet

**Symptom:** **Add Provider** does not offer Web Kiosk.

**Cause:** the provider is still being reviewed upstream
([music-assistant/server#6948](https://github.com/music-assistant/server/pull/6948)).

**Workaround:** run the integration build from
[trudenboy/ma-server](https://github.com/trudenboy/ma-server) on the
`integration/dev` branch. See [Configuration](configuration/).

### The kiosk port is unauthenticated

**Symptom:** anyone who can reach port 8098 can open a player page.

**Cause:** by design the kiosk page has no login; it is meant for a trusted local
network. Playback and queue commands still require an MA token that the page is
given in its URL. The Party QR is a guest login, so it is opt-in and off by
default.

**Fix:** keep the port on the LAN, do not publish it to the internet, and enable
`enable_party_qr` only on a trusted network.

## Playback

### Sendspin client compliance warnings

**Symptom:** Music Assistant logs "non-compliant client" messages when a Sendspin
kiosk connects, and the kiosk's Sendspin protocol player reports `volume_muted`
as unknown.

**Cause:** the bundled `@sendspin/sendspin-js` 5.0.0 is the latest release and
still uses parts of the superseded wire format. Music Assistant accepts it
through its compatibility layer while `allow_noncompliant_clients` is enabled.

**Fix:** none yet; tracked in provider issue #68. If Music Assistant stops
accepting non-compliant clients, Sendspin kiosks fall back to HTML5. No local
patch of the vendored bundle is applied: it is built from the locked npm release.

### Synchronised playback needs Sendspin

**Symptom:** several kiosks play the same queue but are not sample-synchronised.

**Cause:** HTML5 plays each browser's own stream. Only the Sendspin output is
synchronised, and a kiosk falls back to HTML5 when Sendspin cannot connect or is
disabled with `sendspin=0`.

**Fix:** keep `enable_sendspin_bridge` on and let the page use Sendspin.

### Audio needs a tap after a reload

**Symptom:** a reloaded or reopened page stays silent until it is touched.

**Cause:** browsers withhold audio until the document receives a user gesture.
That gesture covers later tracks, but not a new document.

**Fix:** tap the page or press a key after a reload. `wake_lock=1` keeps the
screen awake but does not bypass the audio gesture requirement.

### Only the last opened stream is followed

**Symptom:** with two tabs open, the queue position follows only one of them.

**Cause:** each tab plays its own copy of the flow stream, and Music Assistant
tracks the stream that was opened last.

**Fix:** use one page per player. Closing the followed tab makes the remaining
page rebuild its stream.

## Browsers and devices

### TV support is a code target, not a certification

**Symptom:** an old TV browser shows a partial layout, ignores remote keys, or
does not play Sendspin.

**Cause:** the page and the Sendspin bundle target Chromium 67, Safari 15 and
Firefox 68 capabilities; older engines get the HTML5 fallback at best. A TV shell
can also intercept remote-control keys before the page sees them.

**Fix:** try `sendspin=0` and `lite=1`, and use the TV's own screen and sleep
settings when the wake lock API is unavailable. See the
[browser compatibility audit](https://github.com/trudenboy/ma-provider-web-kiosk/blob/dev/BROWSER_COMPATIBILITY_AUDIT.md)
for the engine table.

### Hardware codecs are not verified

**Symptom:** an MP3 stream plays but FLAC or Opus does not.

**Cause:** codec support is probed at runtime (WebCodecs for Opus, a decoded FLAC
sample, PCM baseline), but decoding on a specific TV or WebView is not tested by
the project.

**Fix:** keep the player's output codec on **MP3**, the compatibility default.

## Integrations

### Party QR shows nothing

**Symptom:** `party=1` opens a kiosk without a QR even though a Party is active.

**Cause:** the QR is opt-in because it carries a guest login.

**Fix:** enable **Show the Party guest QR** in the provider settings, keep guest
access enabled in the Party plugin, and reload the page. The QR appears only
while a Party is active.
