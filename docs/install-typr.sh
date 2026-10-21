#!/bin/bash
#
# typr installer — https://www.aedinlai.com
#
# Installs typr.app into /Applications. That's all: no drivers, no
# models, nothing else touched.
#
# Safe to re-run: it replaces an older copy with the current one.
#
# Read before running — you should never pipe a script into your shell
# without looking at it first:
#   curl -fsSL https://www.aedinlai.com/install-typr.sh | less
#
set -euo pipefail

# Where to fetch the app from. Overridable so the installer can be tested
# against a local copy of the site before anything goes live.
BASE_URL="${TYPR_BASE_URL:-https://www.aedinlai.com}"

APP_URL="$BASE_URL/downloads/typr.zip"
# Filled in by typr's scripts/release.sh each time a new build is
# published, so it always matches the zip next to this script.
APP_SHA256="dc082b455e4c8f48310e097612c4de08b14632dca3d088b0149e215308daab96"
# The developer team that signs typr. Anyone who tampers with the
# download can change the zip, but can't produce this signature.
APP_TEAM_ID="N2XQ4P7AN5"
APP_DEST="/Applications/typr.app"

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

[ "$(uname -s)" = "Darwin" ] || die "typr is macOS only."

macos_major="$(sw_vers -productVersion | cut -d. -f1)"
if [ "$macos_major" -lt 13 ]; then
  die "typr needs macOS 13 (Ventura) or later.
       This Mac is running $(sw_vers -productVersion)."
fi

echo
echo "${bold}typr installer${reset}"
echo "${dim}Installs the app into /Applications (about 1 MB). Works on Apple Silicon and Intel Macs.${reset}"
echo

# --- the app ---------------------------------------------------------------

step "Installing typr"
curl -fL --progress-bar "$APP_URL" -o "$TEMP_DIR/typr.zip" \
  || die "Could not download typr from $APP_URL"
actual_sha="$(shasum -a 256 "$TEMP_DIR/typr.zip" | cut -d' ' -f1)"
[ "$actual_sha" = "$APP_SHA256" ] || die "The typr download didn't match its expected checksum.
       Not installing it. Please report this at aedinlai.com."
unzip -q "$TEMP_DIR/typr.zip" -d "$TEMP_DIR/app" \
  || die "The downloaded file was not a valid zip archive."

extracted="$(find "$TEMP_DIR/app" -maxdepth 1 -iname '*.app' -print -quit)"
[ -n "$extracted" ] || die "No .app found inside the downloaded archive."

# It's about to be given control of the keyboard, so check the signature:
# intact, and made by the typr developer team.
codesign --verify --deep --strict "$extracted" 2>/dev/null \
  || die "The downloaded app's signature is broken. Not installing it."
signed_team="$(codesign -dv "$extracted" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
[ "$signed_team" = "$APP_TEAM_ID" ] || die "The downloaded app isn't signed by the typr developer.
       Not installing it."

# curl doesn't set com.apple.quarantine the way a browser does, so this is
# belt-and-braces in case the archive arrived some other way.
xattr -cr "$extracted" 2>/dev/null || true

if [ -d "$APP_DEST" ]; then
  if pgrep -f "$APP_DEST/Contents/MacOS/" >/dev/null 2>&1; then
    info "Closing the running copy of typr"
    osascript -e 'quit app "typr"' >/dev/null 2>&1 || true
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
  || die "Could not move typr into /Applications."
ok "$APP_DEST"

# --- Claude (optional) -----------------------------------------------------

step "Rough-draft wording"
claude_bin=""
for candidate in "$HOME/.local/bin/claude" "$HOME/.claude/local/claude" /opt/homebrew/bin/claude /usr/local/bin/claude "$HOME/.npm-global/bin/claude"; do
  [ -x "$candidate" ] && { claude_bin="$candidate"; break; }
done
if [ -n "$claude_bin" ]; then
  ok "Claude Code found; typr will use it to write the draft wording"
else
  info "Claude Code isn't installed, which is fine. typr uses its built-in"
  info "word list instead, or the wording from a .typr file you've been sent."
fi

# --- done ------------------------------------------------------------------

echo
echo "${green}${bold}typr is installed.${reset}"
echo
echo "Opening it now. It starts on a short setup page: allow keyboard access,"
echo "test that it types, then click ${bold}Start using typr${reset}."
echo
open "$APP_DEST"
