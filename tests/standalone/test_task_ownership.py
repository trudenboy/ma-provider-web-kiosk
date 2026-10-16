"""Guard against background tasks without an owner (see CLAUDE.local.md)."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

PROVIDER_DIR = Path(__file__).resolve().parents[2] / "provider"
SPAWNERS = {"create_task", "ensure_future"}
# The only functions allowed to start a task. Each one hands the task to its
# owner: the provider (unload cancels it), a socket (closing cancels it) or a
# field that holds a named singleton.
OWNERS = {
    "provider.py": {
        "_own",  # provider-owned work (_spawn, run_owned)
        "loaded_in_mass",  # idle loop held in _timeout_task
        "schedule_player_close",  # pending close held in _disconnect_tasks
    },
    "http_server.py": {
        "_post",  # message to a page, owned by its socket
        "_start_page_preparation",  # page preparation, owned by its socket
    },
    "sendspin_bridge.py": {
        "_on_stream_start",  # connect watchdog held in _connect_watchdog
    },
}


def _spawns_outside_owners(path: Path, owners: set[str]) -> list[tuple[int, str]]:
    """Return (line, enclosing function) for every task spawn outside the owners."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found: list[tuple[int, str]] = []

    def visit(node: ast.AST, function: str) -> None:
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                visit(child, child.name)
                continue
            if (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Attribute)
                and child.func.attr in SPAWNERS
                and function not in owners
            ):
                found.append((child.lineno, function))
            visit(child, function)

    visit(tree, "<module>")
    return found


@pytest.mark.parametrize("path", sorted(PROVIDER_DIR.glob("*.py")), ids=lambda path: path.name)
def test_every_task_is_started_by_its_owner(path: Path) -> None:
    """Tasks started elsewhere outlive unload or their socket; use an owner instead."""
    assert _spawns_outside_owners(path, OWNERS.get(path.name, set())) == []


def test_every_owner_still_starts_a_task() -> None:
    """A renamed owner must be updated here instead of silently widening the list."""
    for name, owners in OWNERS.items():
        tree = ast.parse((PROVIDER_DIR / name).read_text(encoding="utf-8"))
        spawning = {
            node.name
            for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and any(
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and call.func.attr in SPAWNERS
                for call in ast.walk(node)
            )
        }
        assert owners <= spawning, f"{name}: {sorted(owners - spawning)}"


def test_guard_detects_a_spawn_outside_an_owner(tmp_path: Path) -> None:
    """The guard reports a task started by an arbitrary function."""
    sample = tmp_path / "sample.py"
    sample.write_text(
        "def _spawn(mass, coro):\n    return mass.create_task(coro)\n\n"
        "def other(mass, coro):\n    task = mass.create_task(coro)\n    return task\n",
        encoding="utf-8",
    )
    assert _spawns_outside_owners(sample, {"_spawn"}) == [(5, "other")]
