#!/bin/bash
#
# SceneTyper installer — https://www.aedinlai.com
#
# Installs SceneTyper.app into /Applications. That's all: no drivers, no
# models, nothing else touched.
#
# Safe to re-run: it replaces an older copy with the current one.
#
# Read before running — you should never pipe a script into your shell
# without looking at it first:
#   curl -fsSL https://www.aedinlai.com/install-scenetyper.sh | less
#
set -euo pipefail

# Where to fetch the app from. Overridable so the installer can be tested
# against a local copy of the site before anything goes live.
BASE_URL="${SCENETYPER_BASE_URL:-https://www.aedinlai.com}"

APP_URL="$BASE_URL/downloads/SceneTyper.zip"
# Filled in by SceneTyper's scripts/release.sh each time a new build is
# published, so it always matches the zip next to this script.
APP_SHA256="0000000000000000000000000000000000000000000000000000000000000000"
# The developer team that signs SceneTyper. Anyone who tampers with the
# download can change the zip, but can't produce this signature.
APP_TEAM_ID="N2XQ4P7AN5"
APP_DEST="/Applications/SceneTyper.app"

if [ -t 1 ]; then
  bold=$(tput bold); dim=$(tput dim); red=$(tput setaf 1)
  green=$(tput setaf 2); reset=$(tput sgr0)
else
  bold=""; dim=""; red=""; green=""; reset=""
fi

step()  { echo "${bold}==>${reset} ${bold}$*${reset}"; }
info()  { echo "    ${dim}$*${reset}"; }
ok()    { echo "    ${green}done${reset} ${dim}$*${reset}"; }
die()   { echo "${red}error:${reset} $*" >&2; exit 1; }

TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

# --- preflight -------------------------------------------------------------

[ "$(uname -s)" = "Darwin" ] || die "SceneTyper is macOS only."

macos_major="$(sw_vers -productVersion | cut -d. -f1)"
if [ "$macos_major" -lt 13 ]; then
  die "SceneTyper needs macOS 13 (Ventura) or later.
       This Mac is running $(sw_vers -productVersion)."
fi

echo
echo "${bold}SceneTyper installer${reset}"
echo "${dim}Installs the app into /Applications (about 1 MB). Works on Apple Silicon and Intel Macs.${reset}"
echo

# --- the app ---------------------------------------------------------------

step "Installing SceneTyper"
curl -fL --progress-bar "$APP_URL" -o "$TEMP_DIR/SceneTyper.zip" \
  || die "Could not download SceneTyper from $APP_URL"
actual_sha="$(shasum -a 256 "$TEMP_DIR/SceneTyper.zip" | cut -d' ' -f1)"
[ "$actual_sha" = "$APP_SHA256" ] || die "The SceneTyper download didn't match its expected checksum.
       Not installing it. Please report this at aedinlai.com."
unzip -q "$TEMP_DIR/SceneTyper.zip" -d "$TEMP_DIR/app" \
  || die "The downloaded file was not a valid zip archive."

extracted="$(find "$TEMP_DIR/app" -maxdepth 1 -iname '*.app' -print -quit)"
[ -n "$extracted" ] || die "No .app found inside the downloaded archive."

# It's about to be given control of the keyboard, so check the signature:
# intact, and made by the SceneTyper developer team.
codesign --verify --deep --strict "$extracted" 2>/dev/null \
  || die "The downloaded app's signature is broken. Not installing it."
signed_team="$(codesign -dv "$extracted" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
[ "$signed_team" = "$APP_TEAM_ID" ] || die "The downloaded app isn't signed by the SceneTyper developer.
       Not installing it."

# curl doesn't set com.apple.quarantine the way a browser does, so this is
# belt-and-braces in case the archive arrived some other way.
xattr -cr "$extracted" 2>/dev/null || true

if [ -d "$APP_DEST" ]; then
  if pgrep -f "$APP_DEST/Contents/MacOS/" >/dev/null 2>&1; then
    info "Closing the running copy of SceneTyper"
    osascript -e 'quit app "SceneTyper"' >/dev/null 2>&1 || true
    for _ in $(seq 1 10); do
      pgrep -f "$APP_DEST/Contents/MacOS/" >/dev/null 2>&1 || break
      sleep 1
    done
    pkill -f "$APP_DEST/Contents/MacOS/" 2>/dev/null || true
  fi
  info "Replacing the existing copy in /Applications"
  rm -rf "$APP_DEST" 2>/dev/null || sudo rm -rf "$APP_DEST"
fi
mv "$extracted" "$APP_DEST" 2>/dev/null || sudo mv "$extracted" "$APP_DEST" \
  || die "Could not move SceneTyper into /Applications."
ok "$APP_DEST"

# --- Claude (optional) -----------------------------------------------------

step "Rough-draft wording"
claude_bin=""
for candidate in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude "$HOME/.npm-global/bin/claude"; do
  [ -x "$candidate" ] && { claude_bin="$candidate"; break; }
done
if [ -n "$claude_bin" ]; then
  ok "Claude Code found; SceneTyper will use it to write the draft wording"
else
  info "Claude Code isn't installed, which is fine. SceneTyper uses its built-in"
  info "word list instead, or the wording from a .scenetyper file you've been sent."
fi

# --- done ------------------------------------------------------------------

echo
echo "${green}${bold}SceneTyper is installed.${reset}"
echo
echo "Opening it now. On first launch:"
echo "  ${dim}1.${reset} Click ${bold}Allow in System Settings…${reset} and switch SceneTyper on under"
echo "     ${dim}Accessibility. That's what lets it type into your document.${reset}"
echo "  ${dim}2.${reset} Paste the script (or drop in a PDF / Word doc), or double-click"
echo "     ${dim}the .scenetyper file you were sent.${reset}"
echo "  ${dim}3.${reset} Click into an empty document and press ${bold}⌃⌥⌘P${reset} to start a take."
echo
open "$APP_DEST"
