"""Guard: playback started after an await goes through a playback claim (see CLAUDE.local.md)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import music_assistant.providers.web_kiosk as provider_package

PROVIDER_DIR = Path(str(provider_package.__file__)).parent
# Calls that start playback, replacing whatever the player plays or pauses.
STARTS = {"play_media", "play_index", "resume", "_resume_inside_track", "cmd_seek"}
CLAIM = "claim"
RELEASE = "release"


def _called(node: ast.AST) -> str | None:
    """Return the attribute name a call node calls, if any."""
    if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
        return node.func.attr
    return None


def _direct_starts_after_an_await(path: Path) -> list[tuple[int, str]]:
    """Return (line, function) for every playback start awaited after an earlier await."""
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
        found.extend((line, function.name) for line in starts if any(wait < line for wait in waits))
    return sorted(found)


def _claims_not_released(path: Path) -> list[tuple[int, str]]:
    """Return (line, function) for every claim taken in a function without a finally release."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []
    for function in ast.walk(tree):
        if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        claims = [
            node.lineno
            for node in ast.walk(function)
            if isinstance(node, ast.Call) and _called(node) == CLAIM
        ]
        if not claims:
            continue
        released = any(
            _called(node) == RELEASE
            for block in ast.walk(function)
            if isinstance(block, ast.Try)
            for statement in block.finalbody
            for node in ast.walk(statement)
        )
        if not released:
            found.extend((line, function.name) for line in claims)
    return sorted(found)


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_playback_started_after_an_await_goes_through_a_claim(path: Path) -> None:
    """A stop, a newer play or a pause during the await must win over the start."""
    assert _direct_starts_after_an_await(path) == []


def test_guard_detects_a_direct_start_after_an_await(tmp_path: Path) -> None:
    """The guard reports a start awaited after an await and accepts one through a claim."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "async def bare(player, load):\n"
        "    media = await load()\n"
        "    await player.play_media(media)\n\n"
        "async def claimed(player, load):\n"
        "    claim = player.claim()\n"
        "    try:\n"
        "        media = await load()\n"
        "        await claim.start(lambda: player.play_media(media))\n"
        "    finally:\n"
        "        claim.release()\n\n"
        "async def direct(player, media):\n"
        "    await player.play_media(media)\n",
        encoding="utf-8",
    )
    assert _direct_starts_after_an_await(sample) == [(3, "bare")]


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_every_claim_is_released(path: Path) -> None:
    """A claim that took over an output must not leave that playback behind on any exit."""
    assert _claims_not_released(path) == []


def test_guard_detects_a_claim_without_a_release(tmp_path: Path) -> None:
    """The guard reports a claim without a finally release and accepts one with it."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "async def leaked(player, begin):\n"
        "    claim = player.claim(take_over=True)\n"
        "    await claim.start(begin)\n\n"
        "async def released(player, begin):\n"
        "    claim = player.claim(take_over=True)\n"
        "    try:\n"
        "        await claim.start(begin)\n"
        "    finally:\n"
        "        claim.release()\n",
        encoding="utf-8",
    )
    assert _claims_not_released(sample) == [(2, "leaked")]
