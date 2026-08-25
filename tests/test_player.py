"""Tests for the WebKioskPlayer state machine."""

from __future__ import annotations

import time
from types import SimpleNamespace
from unittest.mock import Mock

from music_assistant_models.enums import PlaybackState

from music_assistant.providers.web_kiosk.player import WebKioskPlayer


def _media(uri: str = "spotify://track/1") -> SimpleNamespace:
    """Return a minimal PlayerMedia stand-in."""
    return SimpleNamespace(
        uri=uri,
        title="Track",
        artist="Artist",
        image_url=None,
        stream_duration=120,
        duration=120,
    )


async def test_play_media_sets_playing_and_media(player: WebKioskPlayer) -> None:
    """play_media stores the media and moves the player to PLAYING."""
    media = _media()
    await player.play_media(media)

    assert player.playback_state == PlaybackState.PLAYING
    assert player.current_media is media
    assert player.current_stream_url == media.uri


async def test_play_media_notifies_kiosk(player: WebKioskPlayer) -> None:
    """play_media pushes a 'play' broadcast through the HTTP server."""
    player.provider.http_server = Mock()
    await player.play_media(_media())

    player.provider.http_server.broadcast_play.assert_called_once()


async def test_pause_snapshots_elapsed_time(player: WebKioskPlayer) -> None:
    """pause() accumulates elapsed time and moves to PAUSED."""
    player._attr_playback_state = PlaybackState.PLAYING
    player._attr_elapsed_time = 10.0
    player._attr_elapsed_time_last_updated = time.time() - 5.0

    await player.pause()

    assert player.playback_state == PlaybackState.PAUSED
    assert player.elapsed_time >= 15.0


async def test_stop_clears_media_and_stream(player: WebKioskPlayer) -> None:
    """stop() returns the player to IDLE and clears current media."""
    await player.play_media(_media())
    await player.stop()

    assert player.playback_state == PlaybackState.IDLE
    assert player.current_media is None
    assert player.current_stream_url is None


async def test_seek_updates_elapsed(player: WebKioskPlayer) -> None:
    """seek() moves elapsed time and notifies the kiosk."""
    player._attr_playback_state = PlaybackState.PLAYING
    player.provider.http_server = Mock()

    await player.seek(30)

    assert player.elapsed_time == 30.0
    player.provider.http_server.broadcast_seek.assert_called_once_with("wk_test", 30)


def test_update_position_ignored_while_paused(player: WebKioskPlayer) -> None:
    """Position reports are dropped unless the player is PLAYING."""
    player._attr_playback_state = PlaybackState.PAUSED
    player._attr_elapsed_time = 5.0

    player.update_position(99.0)

    assert player.elapsed_time == 5.0
