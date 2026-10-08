#!/bin/sh
# Init script for the Web Kiosk provider Docker dev environment.
set -e

echo "==> Setting up Web Kiosk provider..."
# Locate MA providers directory inside the container venv
PROVIDERS_DIR=$(/app/venv/bin/python3 -c \
    "import music_assistant.providers, os; print(os.path.dirname(music_assistant.providers.__file__))")

# Remove any existing provider (image may bundle one), then symlink ours
rm -rf "${PROVIDERS_DIR}/web_kiosk"
ln -s /tmp/provider "${PROVIDERS_DIR}/web_kiosk"
echo "==> Provider linked: ${PROVIDERS_DIR}/web_kiosk"

# pyproject dependencies are empty; the runtime pin lives in manifest.json.
# Install it here so the first enable does not depend on a runtime pip/uv call.
DEPS=$(/app/venv/bin/python3 - <<'PYEOF'
import sys
try:
    import tomllib
except ImportError:
    import tomli as tomllib
deps = ["segno==1.6.6"]
try:
    with open("/tmp/pyproject.toml", "rb") as f:
        data = tomllib.load(f)
    for dep in data.get("project", {}).get("dependencies", []):
        if dep.lower().startswith("music_assistant"):
            continue
        if dep not in deps:
            deps.append(dep)
except Exception:
    pass
print(" ".join(deps))
PYEOF
)
if [ -n "$DEPS" ]; then
    echo "==> Installing provider dependencies: $DEPS"
    # The official ghcr.io/music-assistant/server image ships uv but no pip
    # in the venv, so the bare `pip install` path crashes on
    # `/app/venv/bin/pip: not found`. Prefer uv when available; fall back
    # to pip for any image that still has it.
    if [ -x /app/venv/bin/uv ]; then
        /app/venv/bin/uv pip install --quiet --index-strategy unsafe-best-match --python /app/venv/bin/python $DEPS
    else
        /app/venv/bin/pip install --quiet $DEPS
    fi
fi

echo "==> Starting Music Assistant..."
exec /usr/local/bin/entrypoint.sh --data-dir /data --cache-dir /data/.cache
