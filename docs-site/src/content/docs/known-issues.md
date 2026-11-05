---
title: Known Issues
---# Known Issues

## OAuth Token Expiry

**Symptoms:** The provider stops working after several days or weeks with no obvious configuration errors.

**Cause:** Web Kiosk OAuth tokens have a limited lifetime. After expiry, the provider loses API access.

**Fix:** Re-authorise in the provider settings: remove the current configuration, add the provider again, and complete the authorisation flow.

---

## API Disconnects During Long Sessions

**Symptoms:** Playback stops or tracks fail to load after several hours of use.

**Cause:** The Web Kiosk API closes long-lived connections. This is upstream service behaviour.

**Fix:** Restart Music Assistant or reconnect the provider. The error resolves itself on the next request.

---

## Geo-Restricted Playlists and Tracks

**Symptoms:** Some playlists or tracks are unavailable even though they open fine in the Web Kiosk app.

**Cause:** Certain content is restricted by geography or subscription tier.

**Fix:** Content blocked by geo-restrictions or subscription limits cannot be played through the provider. This is a Web Kiosk-side limitation.

---

## Multiple Accounts Not Yet Supported

**Symptoms:** Adding a second Web Kiosk account causes the first to stop working.

**Cause:** The provider currently supports only one Web Kiosk account.

**Fix:** Use a single account. Multi-account support is planned for a future release.

## Display mode

### `/view` returns 404

**Symptom:** opening `/view` says display mode is disabled, or an embedded
dashboard shows nothing.

**Cause:** display mode is opt-in (`enable_display_mode`) and iframe embedding is
disabled unless the parent origin is allowlisted.

**Fix:** enable **Enable read-only display screens**; for a Home Assistant
dashboard add the exact HA origin (for example `https://homeassistant.local:8123`)
to `frame_ancestors`, then reload. Only `/view` can be framed; player pages and
the builder stay `DENY`.

### The queue is empty on a player page

**Symptom:** `queue=1` shows nothing on `/kiosk`.

**Cause:** a player page needs an MA token for the queue unless display mode is
enabled; the queue is pushed over the WebSocket after the page connects.

**Fix:** supply a token, or use `/view?player=<id>` with display mode enabled.
Allow a second or two after connecting for the pushed snapshot.


## Integrations

### Party QR shows nothing

**Symptom:** `party=1` opens a kiosk without a QR even though a Party is active.

**Cause:** the QR is opt-in because it carries a guest login.

**Fix:** enable **Show the Party guest QR** in the provider settings, keep guest
access enabled in the Party plugin, and reload the page. The QR appears only
while a Party is active.
