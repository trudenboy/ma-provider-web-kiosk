#!/usr/bin/env bash
# Vendor the @sendspin/sendspin-js browser client into provider/static/web/sendspin-js/.
#
# The upstream dist is TypeScript ESM output with extensionless relative
# imports ("./core/core"), which only load through CDNs that rewrite
# specifiers. Browsers loading from our static server need exact paths, so
# this script appends ".js" to every relative import specifier and warns
# about specifier forms it cannot fix. sendspin-js also imports
# @noble/curves, @noble/hashes, and @noble/ciphers by package name. Browsers
# cannot resolve those, so this script vendors the browser build of each
# package and rewrites those imports to relative paths. The result is guarded
# by test_vendored_sendspin_js_imports_are_browser_loadable.
#
# Usage: scripts/vendor-sendspin-js.sh [version]
set -euo pipefail

VERSION="${1:-5.0.0}"
PKG="@sendspin/sendspin-js"
DEST="$(cd "$(dirname "$0")/.." && pwd)/provider/static/web/sendspin-js"
STAGING="${DEST}.tmp"

echo "Vendoring ${PKG}@${VERSION} -> ${DEST}"
rm -rf "${STAGING}"
mkdir -p "${STAGING}"

files=$(curl -fsSL "https://unpkg.com/${PKG}@${VERSION}/dist/?meta" | python3 -c '
import json, sys

def walk(node):
    for f in node.get("files", []):
        if f.get("type") == "directory":
            walk(f)
        elif f["path"].endswith(".js") and not f["path"].endswith(".js.map"):
            print(f["path"])

walk(json.load(sys.stdin))
')

if [ -z "${files}" ]; then
    echo "ERROR: no dist files found for ${PKG}@${VERSION} — unpkg meta shape changed?" >&2
    rm -rf "${STAGING}"
    exit 1
fi

for path in ${files}; do
    rel="${path#/dist/}"
    mkdir -p "${STAGING}/$(dirname "${rel}")"
    curl -fsSL "https://unpkg.com/${PKG}@${VERSION}${path}" -o "${STAGING}/${rel}"
    echo "  ${rel}"
done

python3 - "${STAGING}" <<'EOF'
import pathlib
import re
import sys

rewrite = re.compile(r"""((?:import|export)[^'"]*?from\s+['"])(\.\.?/[^'"]+?)(['"])""")
# specifier forms the rewriter cannot fix — surface them for manual review
unhandled = re.compile(r"""(?:import\s*\(\s*|import\s+)['"]([^'"]+)['"]""")
for js in pathlib.Path(sys.argv[1]).rglob("*.js"):
    src = js.read_text(encoding="utf-8")
    fixed = rewrite.sub(
        lambda m: m.group(1)
        + (m.group(2) if m.group(2).endswith(".js") else m.group(2) + ".js")
        + m.group(3),
        src,
    )
    # trailing newline keeps the files clean for the end-of-file-fixer hook
    if not fixed.endswith("\n"):
        fixed += "\n"
    if fixed != src:
        js.write_text(fixed, encoding="utf-8")
        print(f"  rewrote imports: {js.name}")
    for spec in unhandled.findall(fixed):
        print(f"  WARNING: unrewritable specifier in {js.name}: {spec}")
EOF

# Versions satisfying sendspin-js 5.0.0: curves ^1.8.1, hashes ^1.7.1, ciphers ^1.2.1.
# curves 1.9.7 depends on hashes 1.8.0.
NOBLE_SRC="$(mktemp -d)"
trap 'rm -rf "${NOBLE_SRC}"' EXIT
fetch_noble() {
    local pkg="$1" version="$2" dest="$3" leaf
    leaf="${pkg##*/}"
    curl -fsSL "https://registry.npmjs.org/${pkg}/-/${leaf}-${version}.tgz" | tar -xz -C "${NOBLE_SRC}"
    rm -rf "${NOBLE_SRC:?}/${dest}"
    mv "${NOBLE_SRC}/package" "${NOBLE_SRC}/${dest}"
}
fetch_noble "@noble/curves" "1.9.7" curves
fetch_noble "@noble/hashes" "1.8.0" hashes
fetch_noble "@noble/ciphers" "1.3.0" ciphers

python3 - "${STAGING}" "${NOBLE_SRC}" <<'EOF'
import os
import pathlib
import re
import sys

staging = pathlib.Path(sys.argv[1])
src_root = pathlib.Path(sys.argv[2])
esm = {
    "curves": src_root / "curves" / "esm",
    "hashes": src_root / "hashes" / "esm",
    "ciphers": src_root / "ciphers" / "esm",
}
vendor = staging / "vendor"
folders = {name: vendor / f"noble-{name}" for name in esm}
seeds = (
    "@noble/curves/ed25519",
    "@noble/hashes/sha2",
    "@noble/hashes/hmac",
    "@noble/ciphers/chacha",
    "@noble/ciphers/aes",
)
statement = re.compile(r"""^(\s*(?:import|export)\b.*?\bfrom\s+['"])([^'"]+)(['"].*)$""")


def noble_file(spec: str) -> pathlib.Path | None:
    match = re.fullmatch(r"@noble/(curves|hashes|ciphers)(?:/(.*))?", spec)
    if match is None:
        return None
    rest = match.group(2) or "index.js"
    if not rest.endswith(".js"):
        rest += ".js"
    return esm[match.group(1)] / rest


def dest_for(src: pathlib.Path) -> pathlib.Path:
    resolved = src.resolve()
    for name, folder in esm.items():
        try:
            rel = resolved.relative_to(folder.resolve())
        except ValueError:
            continue
        return folders[name] / rel
    raise SystemExit(f"noble file is outside its esm build: {src}")


def specs_in(text: str) -> list[str]:
    found = []
    for line in text.splitlines():
        match = statement.match(line)
        if match:
            found.append(match.group(2))
    return found


copied: dict[pathlib.Path, pathlib.Path] = {}


def add(src: pathlib.Path, origin: str) -> None:
    src = src.resolve()
    if any(existing == src for existing in copied.values()):
        return
    if not src.is_file():
        raise SystemExit(f"missing noble module {origin}: {src}")
    copied[dest_for(src)] = src
    for spec in specs_in(src.read_text(encoding="utf-8")):
        if spec.startswith("."):
            add(src.parent / spec, f"{src.name} -> {spec}")
            continue
        dependency = noble_file(spec)
        if dependency is None:
            raise SystemExit(f"unresolved import {spec!r} from {src.name}")
        add(dependency, spec)


for spec in seeds:
    located = noble_file(spec)
    if located is None:
        raise SystemExit(f"bad seed {spec}")
    add(located, spec)

for dest, src in copied.items():
    dest.parent.mkdir(parents=True, exist_ok=True)
    text = src.read_text(encoding="utf-8")
    if not text.endswith("\n"):
        text += "\n"
    dest.write_text(text, encoding="utf-8")

for name in esm:
    license_file = src_root / name / "LICENSE"
    if license_file.is_file():
        target = folders[name] / "LICENSE"
        target.write_text(license_file.read_text(encoding="utf-8"), encoding="utf-8")
        if not target.read_text(encoding="utf-8").endswith("\n"):
            target.write_text(target.read_text(encoding="utf-8") + "\n", encoding="utf-8")

(vendor / "NOBLE.txt").write_text(
    "@noble/curves@1.9.7\n@noble/hashes@1.8.0\n@noble/ciphers@1.3.0\n",
    encoding="utf-8",
)


def vendored_target(spec: str) -> pathlib.Path | None:
    match = re.fullmatch(r"@noble/(curves|hashes|ciphers)(?:/(.*))?", spec)
    if match is None:
        return None
    rest = match.group(2) or "index.js"
    if not rest.endswith(".js"):
        rest += ".js"
    return folders[match.group(1)] / rest


def relative_spec(from_file: pathlib.Path, target: pathlib.Path) -> str:
    rel = os.path.relpath(target, start=from_file.parent).replace(os.sep, "/")
    if not rel.startswith("."):
        rel = "./" + rel
    return rel


for js in staging.rglob("*.js"):
    lines = js.read_text(encoding="utf-8").splitlines()
    rewritten = []
    changed = False
    for line in lines:
        match = statement.match(line)
        if match is None:
            rewritten.append(line)
            continue
        target = vendored_target(match.group(2))
        if target is None:
            rewritten.append(line)
            continue
        if not target.is_file():
            raise SystemExit(f"{js.relative_to(staging)}: {match.group(2)} is not vendored")
        rewritten.append(match.group(1) + relative_spec(js, target) + match.group(3))
        changed = True
    if changed:
        js.write_text("\n".join(rewritten) + "\n", encoding="utf-8")
        print(f"  rewrote noble imports: {js.relative_to(staging)}")

for js in staging.rglob("*.js"):
    for line in js.read_text(encoding="utf-8").splitlines():
        match = statement.match(line)
        if match and not match.group(2).startswith("."):
            raise SystemExit(f"bare import remains in {js.relative_to(staging)}: {match.group(2)}")

print(f"  noble modules: {len(copied)}")
EOF

echo "${PKG}@${VERSION}" > "${STAGING}/VERSION.txt"
count=$(find "${STAGING}" -name '*.js' | wc -l)
if [ "${count}" -eq 0 ]; then
    echo "ERROR: staging is empty, keeping existing ${DEST}" >&2
    rm -rf "${STAGING}"
    exit 1
fi
rm -rf "${DEST}"
mv "${STAGING}" "${DEST}"
echo "Done: ${count} js files"
