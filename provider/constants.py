"""Constants for the Web Kiosk Provider."""

from __future__ import annotations

import re

CONF_HTTP_PORT = "http_port"
CONF_KIOSK_URL = "kiosk_url"
CONF_PLAYER_IDLE_TIMEOUT = "player_idle_timeout"
CONF_SHOW_STOP_NOTIFICATION = "show_stop_notification"
CONF_ENABLE_SENDSPIN_BRIDGE = "enable_sendspin_bridge"

DEFAULT_HTTP_PORT = 8098
DEFAULT_PLAYER_IDLE_TIMEOUT = 30  # minutes
DEFAULT_SHOW_STOP_NOTIFICATION = False
DEFAULT_ENABLE_SENDSPIN_BRIDGE = True

# Player ID prefix for dynamically registered kiosk players
WEB_KIOSK_PLAYER_ID_PREFIX = "wk_"

# Sanitize device_id or IP for use in player_id (alphanumeric + underscore only)
PLAYER_ID_SANITIZE_RE = re.compile(r"[^a-zA-Z0-9_]+")

# Sendspin bridge: client id prefix follows the Sendspin ecosystem "spb_" convention
SENDSPIN_BRIDGE_CLIENT_PREFIX = "spb_wk_"
# Seconds the bridge waits for the kiosk's JS client to connect after a stream
# start before transferring playback back to the regular HTTP player.
SENDSPIN_CONNECT_TIMEOUT = 15.0
