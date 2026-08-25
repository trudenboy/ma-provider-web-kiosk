"""Tests for the Sendspin bridge policy and client-id derivation."""

from __future__ import annotations

from music_assistant.providers.web_kiosk.player import WebKioskPlayer
from music_assistant.providers.web_kiosk.provider import WebKioskProvider
from music_assistant.providers.web_kiosk.sendspin_bridge import (
    WebKioskSendspinBridgeManager,
    bridge_client_id_for,
)


def test_bridge_client_id_uses_web_kiosk_prefix() -> None:
    """The Sendspin client id strips the wk_ player prefix."""
    assert bridge_client_id_for("wk_abc123") == "spb_wk_abc123"


def test_bridge_client_id_rejects_non_kiosk_player(provider: WebKioskProvider) -> None:
    """A non-kiosk player has no bridge client id."""
    manager = WebKioskSendspinBridgeManager(provider)

    assert manager._bridge_client_id(object()) is None  # type: ignore[arg-type]


def test_should_have_bridge_only_for_enabled_kiosk(player: WebKioskPlayer) -> None:
    """The bridge applies only when enabled and the player is a kiosk."""
    manager = WebKioskSendspinBridgeManager(player.provider)
    player.provider.sendspin_bridge_enabled = True

    assert manager._should_have_bridge(player) is True

    player.provider.sendspin_bridge_enabled = False
    assert manager._should_have_bridge(player) is False
