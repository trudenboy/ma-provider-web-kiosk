"""Guard against background tasks the provider does not own."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

import music_assistant.providers.web_kiosk.player as player_module
import music_assistant.providers.web_kiosk.provider as provider_module
import music_assistant.providers.web_kiosk.sendspin_bridge as bridge_module

SPAWNERS = {"create_task", "ensure_future"}


def _discarded_spawns(path: Path) -> list[int]:
    """Return line numbers of task spawns whose task is neither kept nor returned."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return [
        node.lineno
        for node in ast.walk(tree)
        if isinstance(node, ast.Expr)
        and isinstance(node.value, ast.Call)
        and isinstance(node.value.func, ast.Attribute)
        and node.value.func.attr in SPAWNERS
    ]


@pytest.mark.parametrize("module", [provider_module, player_module, bridge_module])
def test_background_work_is_owned_by_the_provider(module: object) -> None:
    """Fire-and-forget tasks outlive unload; spawn through the provider so it can cancel them."""
    path = Path(str(getattr(module, "__file__", "")))
    assert _discarded_spawns(path) == []


def test_guard_detects_a_discarded_spawn(tmp_path: Path) -> None:
    """The guard reports a bare create_task call."""
    sample = tmp_path / "sample.py"
    sample.write_text("def f(mass, coro):\n    mass.create_task(coro)\n", encoding="utf-8")
    assert _discarded_spawns(sample) == [2]
