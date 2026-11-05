"""Guard against partial copies of core queue flows (see CLAUDE.local.md)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import music_assistant.providers.web_kiosk as provider_package

PROVIDER_DIR = Path(str(provider_package.__file__)).parent
CONVERT = "player_media_from_queue_item"
LOAD = "load_next_queue_item"


def _converts_without_loading(path: Path) -> list[tuple[int, str]]:
    """Return (line, function) for every queue item conversion not preceded by a load."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []
    for function in ast.walk(tree):
        if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        called = {
            node.func.attr: node.lineno
            for node in ast.walk(function)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        }
        if CONVERT in called and called.get(LOAD, called[CONVERT] + 1) > called[CONVERT]:
            found.append((called[CONVERT], function.name))
    return found


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_queue_items_are_loaded_before_they_are_played(path: Path) -> None:
    """The queue's loader applies resume position and speed; converting a bare item skips them."""
    assert _converts_without_loading(path) == []


def test_guard_detects_a_conversion_without_loading(tmp_path: Path) -> None:
    """The guard reports a bare conversion and accepts one after a load."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "async def bare(queues, item):\n"
        "    return await queues.player_media_from_queue_item(item)\n\n"
        "async def loaded(queues, queue_id, item_id):\n"
        "    item = await queues.load_next_queue_item(queue_id, item_id)\n"
        "    return await queues.player_media_from_queue_item(item)\n",
        encoding="utf-8",
    )
    assert _converts_without_loading(sample) == [(2, "bare")]


ORDER_READ = "items"
# The read-only display copies the queue for rendering. It never chooses or
# starts an item, so it is the one place allowed to read the order; the test
# below also asserts that it contains no playback command.
DISPLAY_ORDER_READERS = frozenset({"_display_only_queue_snapshot"})


def _order_reads(path: Path) -> list[tuple[int, str]]:
    """Return (line, function) for every read of the queue order."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []
    for function in ast.walk(tree):
        if not isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if function.name in DISPLAY_ORDER_READERS:
            continue
        for node in ast.walk(function):
            if (
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr == ORDER_READ
                and isinstance(node.func.value, ast.Attribute)
                and node.func.value.attr == "player_queues"
            ):
                found.append((node.lineno, function.name))
    return sorted(found)


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_queue_order_is_left_to_the_queue_controller(path: Path) -> None:
    """The flow stream decides what plays next; the kiosk never walks the queue itself."""
    assert _order_reads(path) == []


def test_display_queue_reader_never_starts_playback() -> None:
    """The display snapshot may copy the order, but only for rendering."""
    path = PROVIDER_DIR / "http_server.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    readers = [
        function
        for function in ast.walk(tree)
        if isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef))
        and function.name in DISPLAY_ORDER_READERS
    ]
    assert readers, "display queue reader is missing"
    playback = {"play_media", "play_index", "resume", "cmd_play", "cmd_seek", "play"}
    for function in readers:
        calls = {
            node.func.attr
            for node in ast.walk(function)
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
        }
        assert calls.isdisjoint(playback)


def test_guard_detects_an_order_read(tmp_path: Path) -> None:
    """The guard reports a read of the queue order and ignores other queue calls."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "def walk(self, queue_id):\n"
        "    return self.mass.player_queues.items(queue_id)\n\n"
        "def current(self, queue_id):\n"
        "    return self.mass.player_queues.get(queue_id)\n",
        encoding="utf-8",
    )
    assert _order_reads(sample) == [(2, "walk")]
