"""
Seeded lifecycle model for the kiosk provider (issue #77, Release B).

The model drives the real provider, player and HTTP/WebSocket server through
random but reproducible sequences of page and playback events. It asserts the
invariants that the single-scenario tests check one at a time: every play
message carries the current playback generation, the clock stays inside the
media, and unload leaves no task, pending close or registered player behind.

A failing sequence reports its seed and action log, so it becomes a regression
test by adding the seed to ``SEEDS``.
"""

from __future__ import annotations

import asyncio
import json
import random
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, Mock

import pytest
from aiohttp import WSMsgType
from aiohttp.test_utils import TestClient, TestServer
from music_assistant_models.player import PlayerMedia

from music_assistant.providers.web_kiosk.http_server import WebKioskHTTPServer
from music_assistant.providers.web_kiosk.player import WebKioskPlayer
from music_assistant.providers.web_kiosk.provider import WebKioskProvider

SEEDS = [0, 1, 2, 3, 4, 5]
STEPS = 20
DEVICES = ["dev-a", "dev-b"]
DURATION = 30
CONNECTED_ACTIONS = [
    "disconnect",
    "play",
    "pause",
    "stop",
    "seek",
    "report",
    "ended",
    "error",
    "rename",
    "unload",
]


class PlayerRegistry:
    """Player registry the provider can register into and look players up from."""

    def __init__(self, mass: Mock) -> None:
        """Wire the mocked player controller to an in-memory registry."""
        self.players: dict[str, WebKioskPlayer] = {}
        mass.players.get_player.side_effect = self.get_player
        mass.players.register = AsyncMock(side_effect=self.register)
        mass.players.unregister = AsyncMock(side_effect=self.unregister)
        mass.players.iter_players = Mock(side_effect=lambda **_: list(self.players.values()))
        mass.players.all_players = Mock(side_effect=lambda: list(self.players.values()))

    def get_player(self, player_id: str, **_kwargs: object) -> WebKioskPlayer | None:
        """Return a registered kiosk player."""
        return self.players.get(player_id)

    async def register(self, player: WebKioskPlayer) -> None:
        """Keep a registered player."""
        self.players[player.player_id] = player

    async def unregister(self, player_id: str, **_kwargs: object) -> None:
        """Drop a player from the registry."""
        self.players.pop(player_id, None)


async def _drain(ws: Any) -> list[dict[str, Any]]:
    """Return every frame the page received since the last drain."""
    frames: list[dict[str, Any]] = []
    while True:
        try:
            message = await ws.receive(timeout=0.05)
        except TimeoutError:
            return frames
        if message.type is WSMsgType.TEXT:
            frames.append(json.loads(message.data))
        elif message.type in (WSMsgType.CLOSE, WSMsgType.CLOSED, WSMsgType.ERROR):
            return frames


def _assert_clock(player: WebKioskPlayer, log: list[str]) -> None:
    """Assert the clock is unset or inside the media that was started."""
    if player.elapsed_time is not None:
        assert 0 <= player.elapsed_time <= DURATION, log


@dataclass
class Lifecycle:
    """One seeded page/playback sequence over the real provider objects."""

    rng: random.Random
    provider: WebKioskProvider
    client: TestClient[Any, Any]
    registry: PlayerRegistry
    sockets: dict[str, Any] = field(default_factory=dict)
    players: dict[str, WebKioskPlayer] = field(default_factory=dict)
    log: list[str] = field(default_factory=list)
    finished: bool = False

    async def run(self) -> None:
        """Run the seeded steps, then tear the sequence down."""
        for _step in range(STEPS):
            await self.step()
            if self.finished:
                return
        for ws in self.sockets.values():
            await ws.close()
        await self._teardown()

    async def step(self) -> None:
        """Apply one random action to a connected or disconnected device."""
        device = self.rng.choice(DEVICES)
        actions = CONNECTED_ACTIONS if device in self.sockets else ["connect"]
        action = self.rng.choice(actions)
        self.log.append(f"{action}:{device}")
        await getattr(self, f"_{action}")(device)

    async def _connect(self, device: str) -> None:
        ws = await self.client.ws_connect(f"/ws?device_id={device}")
        welcome = await ws.receive_json()
        assert welcome["type"] == "welcome"
        self.sockets[device] = ws
        self.players[device] = self.registry.players[welcome["player_id"]]
        await _drain(ws)

    async def _disconnect(self, device: str) -> None:
        await self.sockets.pop(device).close()
        await asyncio.sleep(0)

    async def _play(self, device: str) -> None:
        player = self.players[device]
        generation = player.playback_generation
        await player.play_media(
            PlayerMedia(
                uri=f"file://{device}",
                duration=DURATION,
                source_id="wk_test",
                queue_item_id=f"q-{self.rng.randrange(3)}",
            )
        )
        frames = await _drain(self.sockets[device])
        plays = [frame for frame in frames if frame["type"] == "play"]
        assert plays, self.log
        assert plays[-1]["playback_generation"] == player.playback_generation
        assert player.playback_generation != generation
        _assert_clock(player, self.log)

    async def _pause(self, device: str) -> None:
        await self.players[device].pause()
        await _drain(self.sockets[device])

    async def _stop(self, device: str) -> None:
        await self.players[device].stop()
        await _drain(self.sockets[device])

    async def _seek(self, device: str) -> None:
        await self._report(device)

    async def _report(self, device: str) -> None:
        player = self.players[device]
        await self.sockets[device].send_json(
            {
                "type": "position",
                "position": self.rng.uniform(0, DURATION),
                "playback_generation": player.playback_generation,
            }
        )
        await asyncio.sleep(0)
        _assert_clock(player, self.log)

    async def _ended(self, device: str) -> None:
        player = self.players[device]
        await self.sockets[device].send_json(
            {"type": "ended", "playback_generation": player.playback_generation}
        )
        await asyncio.sleep(0)

    async def _error(self, device: str) -> None:
        player = self.players[device]
        await self.sockets[device].send_json(
            {
                "type": "playback_error",
                "reason": "MediaError4",
                "playback_generation": player.playback_generation,
            }
        )
        await asyncio.sleep(0)

    async def _rename(self, device: str) -> None:
        player = self.players[device]
        player.config.name = f"Kiosk {self.rng.randrange(3)}"
        await player.on_config_updated()
        await _drain(self.sockets[device])

    async def _unload(self, _device: str) -> None:
        await self._teardown()
        self.finished = True

    async def _teardown(self) -> None:
        await self.provider.unload()
        assert self.provider._background_tasks == set(), self.log
        assert self.provider._disconnect_tasks == {}, self.log
        assert self.provider._timeout_task is None or self.provider._timeout_task.done(), self.log
        assert self.registry.players == {}, self.log


@pytest.mark.parametrize("seed", SEEDS)
async def test_seeded_lifecycle_keeps_the_provider_invariants(
    seed: int,
    provider: WebKioskProvider,
    mass_mock: Mock,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A random page/playback sequence never breaks generation, clock or teardown."""
    monkeypatch.setattr(WebKioskPlayer, "update_state", Mock())
    # The model checks ownership and teardown, not the waveform/lyrics work.
    monkeypatch.setattr(WebKioskProvider, "_spawn", lambda _self, coro: coro.close())
    # The default mock returns the coroutine without running it, so page messages
    # (sent through mass.create_task) would never reach the socket.
    mass_mock.create_task = Mock(
        side_effect=lambda coro, *_args, **_kwargs: asyncio.create_task(coro)
    )
    mass_mock.player_queues.get_item = Mock(return_value=None)
    mass_mock.player_queues.get = Mock(return_value=None)
    mass_mock.player_queues.get_active_queue = Mock(return_value=None)

    server = WebKioskHTTPServer(provider, 0)
    provider.http_server = server
    client: TestClient[Any, Any] = TestClient(TestServer(server.app))
    await client.start_server()
    try:
        # Deterministic model input; no security decision depends on it.
        rng = random.Random(seed)  # noqa: S311
        await Lifecycle(rng, provider, client, PlayerRegistry(mass_mock)).run()
    finally:
        await client.close()
