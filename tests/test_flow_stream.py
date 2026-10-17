"""The HTML5 kiosk plays the queue's flow stream (spec 0009)."""

from __future__ import annotations

import json
import time
from unittest.mock import AsyncMock, Mock, PropertyMock, patch

import pytest
from music_assistant_models.enums import MediaType, PlaybackState, PlayerFeature
from music_assistant_models.player import PlayerMedia

from music_assistant.providers.web_kiosk.http_server import WebKioskHTTPServer
from music_assistant.providers.web_kiosk.player import WebKioskPlayer
from music_assistant.providers.web_kiosk.provider import WebKioskProvider

BASE = "http://ma.local:8097"
FLOW_URL = f"{BASE}/flow/session/wk_test/item-1/wk_test.mp3"


def _queue_media(item_id: str = "item-1", **extra: object) -> PlayerMedia:
    """Return queue media as Music Assistant hands it to a flow-mode player."""
    return PlayerMedia(
        uri=item_id,
        duration=180,
        title=item_id.title(),
        source_id="wk_test",
        queue_item_id=item_id,
        queue_session_id="session",
        **extra,  # type: ignore[arg-type]
    )


@pytest.fixture
def flow(mass_mock: Mock) -> None:
    """Make Music Assistant resolve queue media to a flow stream."""
    mass_mock.streams.base_url = BASE
    mass_mock.streams.resolve_stream_url = AsyncMock(return_value=FLOW_URL)


def test_kiosk_requires_flow_mode(player: WebKioskPlayer) -> None:
    """Music Assistant streams the whole queue to the kiosk instead of handing items over."""
    assert PlayerFeature.ENQUEUE not in player.supported_features
    assert player.requires_flow_mode


@pytest.mark.usefixtures("flow")
async def test_flow_route_is_played_as_resolved(provider: WebKioskProvider) -> None:
    """The page receives the flow URL Music Assistant chose, with crossfade and overlays."""
    assert await provider.get_ma_stream_url("wk_test", _queue_media()) == FLOW_URL


@pytest.mark.usefixtures("flow")
async def test_stream_end_reports_idle_without_a_queue_command(
    provider: WebKioskProvider, mass_mock: Mock, player: WebKioskPlayer
) -> None:
    """The end of a flow stream is the end of the queue: IDLE, and MA takes it from there."""
    mass_mock.players.get_player.return_value = player
    await player.play_media(_queue_media())
    player.update_position(30)
    play_media = AsyncMock()
    player.play_media = play_media  # type: ignore[method-assign]

    await provider._finish_playback("wk_test", player.playback_generation)

    assert player.playback_state == PlaybackState.IDLE
    play_media.assert_not_awaited()
    mass_mock.player_queues.play_index.assert_not_awaited()
    mass_mock.player_queues.resume.assert_not_awaited()


@pytest.mark.usefixtures("flow")
async def test_flow_clock_runs_past_the_first_item(player: WebKioskPlayer) -> None:
    """A flow stream is longer than its first item; the clock is not capped at that item."""
    await player.play_media(_queue_media())
    player._track_started_at = time.monotonic() - 400

    player.update_position(390)

    assert player.serves_flow
    assert player.elapsed_time == 390


async def test_single_stream_clock_stays_capped(player: WebKioskPlayer, mass_mock: Mock) -> None:
    """A stream served per item still never runs past its own length."""
    mass_mock.streams.base_url = BASE
    mass_mock.streams.resolve_stream_url = AsyncMock(return_value=f"{BASE}/single/radio")
    await player.play_media(_queue_media())
    player._track_started_at = time.monotonic() - 400

    player.update_position(390)

    assert not player.serves_flow
    assert player.elapsed_time == 180


@pytest.mark.parametrize(("position", "expected"), [(0.4, 0), (75.6, 75), (179.5, 178)])
@pytest.mark.usefixtures("flow")
async def test_reconnect_rebuilds_a_flow_stream_at_the_queue_position(
    player: WebKioskPlayer, mass_mock: Mock, position: float, expected: int
) -> None:
    """Reopening a flow URL restarts it at its first item, so a reconnect seeks the queue."""
    await player.play_media(_queue_media())
    # The queue has moved on to its third item inside this flow stream.
    mass_mock.player_queues.get.return_value = Mock(
        current_item=Mock(queue_item_id="item-3", duration=180),
        corrected_elapsed_time=position,
    )
    mass_mock.players.cmd_seek = AsyncMock()
    mass_mock.players.get_player.return_value = player

    assert player.can_refresh_stream()
    assert await player.refresh_stream()

    mass_mock.players.cmd_seek.assert_awaited_once_with("wk_test", expected)


@pytest.mark.usefixtures("flow")
async def test_flow_track_change_publishes_media_with_its_stream_start(
    provider: WebKioskProvider, mass_mock: Mock, player: WebKioskPlayer
) -> None:
    """Each new queue item reaches the pages once, with where its song starts in the stream."""
    server = WebKioskHTTPServer(provider, 0)
    server._ws_clients[player.player_id] = {Mock(closed=False)}
    server._post = Mock()  # type: ignore[method-assign]
    provider.http_server = server
    provider.spawn_wave = Mock()  # type: ignore[method-assign]
    provider.spawn_lyrics = Mock()  # type: ignore[method-assign]
    mass_mock.players.get_player.return_value = player
    await player.play_media(_queue_media())
    first = _queue_media()
    second = _queue_media("item-2", media_type=MediaType.TRACK)
    state = Mock(
        playback_state=PlaybackState.PLAYING,
        current_media=first,
        active_group=None,
        synced_to=None,
        group_members=[],
    )

    def messages() -> list[dict[str, object]]:
        return [json.loads(call.args[1]) for call in server._post.call_args_list]

    def media_messages() -> list[dict[str, object]]:
        return [message for message in messages() if message["type"] == "media"]

    patcher = patch.object(WebKioskPlayer, "state", new_callable=PropertyMock, return_value=state)
    patcher.start()
    try:
        # The item the play message announced is not announced again.
        server._on_player_state_updated(player, {})
        assert media_messages() == []

        # 200 s into the stream the queue reports item 2 at 12 s of the song.
        player._track_started_at = time.monotonic() - 210
        player.update_position(200)
        player._attr_elapsed_time_last_updated = time.time()
        mass_mock.player_queues.get.return_value = Mock(
            corrected_elapsed_time=12.0, playback_speed=1.0, current_item=Mock()
        )
        state.current_media = second
        server._on_player_state_updated(player, {})
        server._on_player_state_updated(player, {})

        media = media_messages()
        assert len(media) == 1
        assert media[0]["title"] == "Item-2"
        assert media[0]["duration"] == 180
        assert media[0]["start"] == pytest.approx(12 - 200, abs=0.5)
        assert media[0]["playback_speed"] == 1.0
        assert media[0]["wave_seq"] == 2
        provider.spawn_wave.assert_called_with(player.player_id, 2)
    finally:
        patcher.stop()
