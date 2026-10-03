#!/bin/bash
#
# Copy one of the 8-bit games into docs/ for publishing.
#
#   scripts/deploy-game.sh ~/Desktop/Lockout lockout
#
# This exists because the ad-hoc version of it deleted the whole site. It built its destination
# from a shell variable that came out empty — zsh does not word-split an unquoted variable the way
# sh does, so `set -- $pair` left both halves in one word — and `rm -rf "$DOCS/$dst"` therefore
# resolved to docs/ itself. The homepage was gone for forty minutes.
#
# Every guard below is aimed at exactly that failure: refuse to act on an empty or surprising path,
# and never remove anything that is not a directory holding a game we just checked.

set -euo pipefail

SRC=${1:?usage: deploy-game.sh <source-dir> <slug>}
SLUG=${2:?usage: deploy-game.sh <source-dir> <slug>}

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DOCS="$HERE/docs"

# the slug is a single path segment and nothing else: no slashes, no dots, no empty string
if [[ ! $SLUG =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "refusing: '$SLUG' is not a plain slug" >&2; exit 1
fi

DEST="$DOCS/$SLUG"
# and the destination must sit directly under docs/, whatever the slug managed to be
if [[ $(dirname "$DEST") != "$DOCS" ]]; then
  echo "refusing: '$DEST' is not directly under $DOCS" >&2; exit 1
fi

[[ -f "$SRC/index.html" && -d "$SRC/src" ]] || { echo "refusing: $SRC is not a game" >&2; exit 1; }

# Replace the contents, never the directory. rsync --delete removes the files inside a path it has
# been given; it cannot turn into a removal of the parent the way a bare `rm -rf` can.
mkdir -p "$DEST/src"
rsync -a --delete "$SRC/src/" "$DEST/src/"
cp "$SRC/index.html" "$DEST/index.html"

echo "$SLUG: $(find "$DEST" -type f | wc -l | tr -d ' ') files"

# the homepage is the thing that went missing last time, so say so out loud every run
[[ -f "$DOCS/index.html" ]] || { echo "ALARM: docs/index.html is missing" >&2; exit 1; }
