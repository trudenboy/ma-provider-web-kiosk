"""Tests for the Web Kiosk HTTP server routes."""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any

from music_assistant.providers.web_kiosk.player import WebKioskPlayer
from music_assistant.providers.web_kiosk.provider import WebKioskProvider

if TYPE_CHECKING:
    from aiohttp.test_utils import TestClient


async def test_health_returns_ok(http_client: TestClient[Any, Any]) -> None:
    """GET /health reports the provider and player count."""
    resp = await http_client.get("/health")

    assert resp.status == 200
    body = await resp.json()
    assert body["status"] == "ok"
    assert body["provider"] == "web_kiosk"


async def test_root_serves_dashboard(http_client: TestClient[Any, Any]) -> None:
    """GET / serves a status dashboard."""
    resp = await http_client.get("/")

    assert resp.status == 200
    assert "Web Kiosk" in await resp.text()


async def test_web_serves_spa(http_client: TestClient[Any, Any]) -> None:
    """GET /web serves the kiosk SPA HTML."""
    resp = await http_client.get("/web")

    assert resp.status == 200
    assert "<html" in (await resp.text()).lower()


async def test_stream_requires_token(
    http_client: TestClient[Any, Any], provider: WebKioskProvider
) -> None:
    """GET /stream/{player_id} rejects a request without a valid token."""
    registered = WebKioskPlayer(provider, "wk_test", name="Test Kiosk")
    provider.mass.players.get_player.return_value = registered

    resp = await http_client.get("/stream/wk_test?token=wrong")

    assert resp.status == 403


async def test_stream_redirects_to_ma_url(
    http_client: TestClient[Any, Any], provider: WebKioskProvider
) -> None:
    """GET /stream/{player_id} redirects to the MA streamserver URL."""
    media = SimpleNamespace(uri="spotify://track/1")
    registered = WebKioskPlayer(provider, "wk_test", name="Test Kiosk")
    registered._attr_current_media = media
    provider.mass.players.get_player.return_value = registered
    token = provider.get_stream_token("wk_test")

    resp = await http_client.get(f"/stream/wk_test?token={token}", allow_redirects=False)

    assert resp.status == 302
    assert "/stream/1" in resp.headers["Location"]


async def test_ws_welcome_carries_player_id(http_client: TestClient[Any, Any]) -> None:
    """The WS handshake reports the server-derived player id."""
    ws = await http_client.ws_connect("/ws?device_id=test-device")

    msg = await ws.receive()
    payload = json.loads(msg.data)

    assert payload["type"] == "welcome"
    assert payload["player_id"].startswith("wk_")
    await ws.close()


async def test_party_status_inactive_without_party_provider(
    http_client: TestClient[Any, Any],
) -> None:
    """GET /api/party reports inactive when the Party plugin is absent."""
    resp = await http_client.get("/api/party")

    assert resp.status == 200
    assert (await resp.json()) == {"active": False}


async def test_lyrics_empty_for_unknown_player(http_client: TestClient[Any, Any]) -> None:
    """GET /api/lyrics/{player_id} returns empty lyrics for an unknown player."""
    resp = await http_client.get("/api/lyrics/wk_unknown")

    assert resp.status == 200
    body = await resp.json()
    assert body["lyrics"] is None
    assert body["lrc_lyrics"] is None
