"""Guard: playback started after an await re-checks who owns it (see CLAUDE.local.md)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import music_assistant.providers.web_kiosk as provider_package

PROVIDER_DIR = Path(str(provider_package.__file__)).parent
COMMITS = {"play_media", "play_index", "resume", "_resume_inside_track"}
CHECK = "still_plays"


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
