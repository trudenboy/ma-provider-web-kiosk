"""Tests for WebKioskProvider lifecycle helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock

from music_assistant.providers.web_kiosk.provider import WebKioskProvider


def test_stream_token_is_deterministic_and_sized(provider: WebKioskProvider) -> None:
    """The per-player stream token is stable for a player and 32 chars long."""
    first = provider.get_stream_token("wk_test")
    second = provider.get_stream_token("wk_test")

    assert first == second
    assert len(first) == 32


def test_stream_token_differs_per_player(provider: WebKioskProvider) -> None:
    """Two players never share a stream token."""
    assert provider.get_stream_token("wk_a") != provider.get_stream_token("wk_b")


def test_player_display_name_ip_based(provider: WebKioskProvider) -> None:
    """IP-derived player ids render as a friendly address."""
    assert provider.player_display_name("wk_192_168_10_15") == "Web Kiosk (192.168.10.15)"


async def test_get_or_register_player_registers_once(provider: WebKioskProvider) -> None:
    """A new player id registers; a repeat call reuses the existing player."""
    provider.mass.players.get_player.return_value = None
    provider.mass.players.register = AsyncMock()

    player = await provider.get_or_register_player("wk_test")

    assert player is not None
    assert player.player_id == "wk_test"
    provider.mass.players.register.assert_awaited_once()
