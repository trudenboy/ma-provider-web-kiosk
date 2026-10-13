#!/usr/bin/env bash
# Rebuild the browser SDK from the reviewed npm lockfile.
set -euo pipefail

if [ "$#" -ne 0 ]; then
    echo "Update scripts/sendspin/package.json and its lockfile to change SDK versions." >&2
    exit 1
fi

BUILD_DIR="$(cd "$(dirname "$0")/sendspin" && pwd)"
npm ci --prefix "${BUILD_DIR}" --ignore-scripts --no-audit --no-fund
npm run --prefix "${BUILD_DIR}" build
