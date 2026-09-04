#!/usr/bin/env bash
set -euo pipefail

# Builds a site and serves it under the local CloudCannon.
#
# `cloudcannon dev` only serves an output directory — it never runs the SSG
# build or .cloudcannon/postbuild. Skipping those is the most common way to
# spend a session inspecting a build from before the change under test.
#
# Usage: bash cc-serve.sh [project-dir] [--port 10101] [--output DIR]
#                         [--no-build] [--no-postbuild]
#   project-dir defaults to the current directory.
#   --output is required for any SSG whose output directory is not detected
#   below (Hugo's public/, for one). See setup.md.

PROJECT_DIR="."
PORT="10101"
OUTPUT_OVERRIDE=""
RUN_BUILD=1
RUN_POSTBUILD=1

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --output) OUTPUT_OVERRIDE="$2"; shift 2 ;;
    --no-build) RUN_BUILD=0; shift ;;
    --no-postbuild) RUN_POSTBUILD=0; shift ;;
    -h|--help) sed -n '3,14p' "$0"; exit 0 ;;
    *) PROJECT_DIR="$1"; shift ;;
  esac
done

cd "$PROJECT_DIR"
ROOT="$(pwd)"

# --- Locate the output directory ---
# Prefer the CloudCannon config, then fall back to conventional names.
OUTPUT="$OUTPUT_OVERRIDE"
if [ -z "$OUTPUT" ] && [ -f cloudcannon.config.yml ]; then
  OUTPUT="$(grep -E '^\s*paths:' -A10 cloudcannon.config.yml 2>/dev/null \
    | grep -E '^\s*output:' | head -1 | sed 's/.*output:[[:space:]]*//' | tr -d '"'"'"' ' || true)"
fi

if [ -z "$OUTPUT" ]; then
  for candidate in _site dist public build; do
    if [ -d "$candidate" ] || grep -qE "\"(build|eleventy:build)\"" package.json 2>/dev/null; then
      case "$candidate" in
        _site) [ -f .eleventy.js ] || [ -f eleventy.config.js ] && OUTPUT="_site" ;;
        dist)  [ -f astro.config.mjs ] || [ -f astro.config.ts ] && OUTPUT="dist" ;;
      esac
      [ -n "$OUTPUT" ] && break
    fi
  done
fi
[ -z "$OUTPUT" ] && [ -d _site ] && OUTPUT="_site"
[ -z "$OUTPUT" ] && [ -d dist ] && OUTPUT="dist"

if [ -z "$OUTPUT" ]; then
  echo "error: could not determine the output directory. Pass it via --output or build first." >&2
  exit 1
fi

echo "project: $ROOT"
echo "output:  $OUTPUT"

# --- Build ---
if [ "$RUN_BUILD" -eq 1 ]; then
  echo "--- building ---"
  npm run build
fi

# --- Postbuild ---
# Run in a subshell: CloudCannon SOURCES this file in production, so any shell
# options it sets would otherwise leak into the caller and kill the run.
if [ "$RUN_POSTBUILD" -eq 1 ] && [ -f .cloudcannon/postbuild ]; then
  echo "--- postbuild ---"
  ( bash .cloudcannon/postbuild )
fi

# --- Serve ---
if curl -s -o /dev/null "http://localhost:$PORT/__api/details"; then
  echo "note: something is already serving on port $PORT — not starting a second server."
  exit 0
fi

echo "--- serving ---"
echo "cloudcannon dev $OUTPUT --port $PORT"
exec cloudcannon dev "$OUTPUT" --port "$PORT"
