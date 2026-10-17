"""Guard: every resume position the kiosk sends leaves the end of the track to play."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import music_assistant.providers.web_kiosk as provider_package

PROVIDER_DIR = Path(str(provider_package.__file__)).parent
# Commands that start a stream at a position, and the index of that position argument.
POSITIONED = {"cmd_seek": 1, "seek": 1, "play_index": 2}
CLAMP = "resume_position"


def _called_name(node: ast.expr) -> str | None:
    """Return the function or attribute name a call node calls, if any."""
    if not isinstance(node, ast.Call):
        return None
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    if isinstance(node.func, ast.Name):
        return node.func.id
    return None


def _unclamped_positions(path: Path) -> list[tuple[int, str]]:
    """Return (line, command) for every stream position not computed by the clamp."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        index = POSITIONED.get(node.func.attr)
        if index is None or not isinstance(node.func.value, ast.Attribute):
            continue
        position = node.args[index] if len(node.args) > index else None
        position = next(
            (kw.value for kw in node.keywords if kw.arg in ("position", "seek_position")),
            position,
        )
        if position is not None and _called_name(position) != CLAMP:
            found.append((node.lineno, node.func.attr))
    return sorted(found)


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_resume_positions_leave_the_end_of_the_track(path: Path) -> None:
    """A stream started at the very end of a track is empty and loses its seek offset."""
    assert _unclamped_positions(path) == []


def test_guard_detects_an_unclamped_position(tmp_path: Path) -> None:
    """The guard reports a raw position and accepts a clamped one or none at all."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "async def raw(self, position):\n"
        "    await self.mass.players.cmd_seek(self.player_id, int(position))\n\n"
        "async def keyword(self, item):\n"
        "    await self.mass.player_queues.play_index('q', item, position=3)\n\n"
        "async def clamped(self, duration, position):\n"
        "    await self.mass.players.cmd_seek(self.player_id, resume_position(duration, position))\n\n"
        "async def start(self, item):\n"
        "    await self.mass.player_queues.play_index('q', item)\n",
        encoding="utf-8",
    )
    assert _unclamped_positions(sample) == [(2, "cmd_seek"), (5, "play_index")]
