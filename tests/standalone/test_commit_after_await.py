"""Guard: playback started after an await re-checks owner and intent (see CLAUDE.local.md)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import music_assistant.providers.web_kiosk as provider_package

PROVIDER_DIR = Path(str(provider_package.__file__)).parent
COMMITS = {"play_media", "play_index", "resume", "_resume_inside_track"}
CHECK = "still_plays"
# Starts that also replace a paused stream with a playing one.
STARTS = COMMITS | {"cmd_seek"}
INTENT = "wants_pause"


def _called(node: ast.AST) -> str | None:
    """Return the attribute name a call node calls, if any."""
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr
    return None


def _unchecked_commits(path: Path) -> list[tuple[int, str]]:
    """Return (line, function) for every playback start after an await without a re-check."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []
    for function in ast.walk(tree):
        if not isinstance(function, ast.AsyncFunctionDef):
            continue
        nodes = list(ast.walk(function))
        commits = [
            node.lineno
            for node in nodes
            if isinstance(node, ast.Await) and _called(node.value) in COMMITS
        ]
        waits: list[int] = []
        for node in nodes:
            if isinstance(node, (ast.AsyncWith, ast.AsyncFor)) or (
                isinstance(node, ast.Await) and _called(node.value) not in COMMITS
            ):
                waits.append(node.lineno)
        checks = [
            node.lineno for node in nodes if isinstance(node, ast.Call) and _called(node) == CHECK
        ]
        for line in commits:
            earlier = [wait for wait in waits if wait < line]
            if earlier and not any(max(earlier) < check < line for check in checks):
                found.append((line, function.name))
    return sorted(found)


def _starts_ignoring_intent(path: Path) -> list[tuple[int, str]]:
    """Return (line, function) for every start after an await not followed by an intent check."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []
    for function in ast.walk(tree):
        if not isinstance(function, ast.AsyncFunctionDef):
            continue
        nodes = list(ast.walk(function))
        starts = [
            node.lineno
            for node in nodes
            if isinstance(node, ast.Await) and _called(node.value) in STARTS
        ]
        waits: list[int] = []
        for node in nodes:
            if isinstance(node, (ast.AsyncWith, ast.AsyncFor)) or (
                isinstance(node, ast.Await) and _called(node.value) not in STARTS
            ):
                waits.append(node.lineno)
        intents = [
            node.lineno for node in nodes if isinstance(node, ast.Call) and _called(node) == INTENT
        ]
        for line in starts:
            if any(wait < line for wait in waits) and not any(check > line for check in intents):
                found.append((line, function.name))
    return sorted(found)


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_playback_started_after_an_await_keeps_the_last_command(path: Path) -> None:
    """A pause that lands while playback is prepared must not be overwritten by the start."""
    assert _starts_ignoring_intent(path) == []


def test_guard_detects_a_start_that_ignores_a_pause(tmp_path: Path) -> None:
    """The guard reports a start after an await and accepts one followed by an intent check."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "async def bare(player, load):\n"
        "    media = await load()\n"
        "    await player.play_media(media)\n\n"
        "async def kept(player, load):\n"
        "    mark = player.transport_mark()\n"
        "    media = await load()\n"
        "    await player.play_media(media)\n"
        "    if player.wants_pause(mark):\n"
        "        await player.pause()\n\n"
        "async def direct(player, media):\n"
        "    await player.play_media(media)\n",
        encoding="utf-8",
    )
    assert _starts_ignoring_intent(sample) == [(3, "bare")]


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_playback_started_after_an_await_is_rechecked(path: Path) -> None:
    """A stop, a newer play or a replaced player during the await must win over the start."""
    assert _unchecked_commits(path) == []


def test_guard_detects_a_start_without_a_recheck(tmp_path: Path) -> None:
    """The guard reports a start after an await and accepts one after a re-check."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "async def bare(player, load):\n"
        "    media = await load()\n"
        "    await player.play_media(media)\n\n"
        "async def checked(player, load):\n"
        "    generation = player.playback_generation\n"
        "    media = await load()\n"
        "    if player.still_plays(generation):\n"
        "        await player.play_media(media)\n\n"
        "async def direct(player, media):\n"
        "    await player.play_media(media)\n",
        encoding="utf-8",
    )
    assert _unchecked_commits(sample) == [(3, "bare")]
