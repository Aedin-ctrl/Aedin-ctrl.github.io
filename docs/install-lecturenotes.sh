#!/bin/bash
#
# LectureNotes installer — https://www.aedinlai.com
#
# Installs LectureNotes and everything it needs to actually work:
#   1. LectureNotes.app          ->  /Applications
#   2. BlackHole 2ch audio driver (lets the app hear your computer's sound)
#   3. Ollama                     (runs the language models locally)
#   4. The speech + language models themselves (~4 GB)
#
# Safe to re-run: anything already installed is detected and skipped.
#
# Read before running — you should never pipe a script into your shell
# without looking at it first:
#   curl -fsSL https://www.aedinlai.com/install-lecturenotes.sh | less
#
set -euo pipefail

# Where to fetch the app from. Overridable so the installer can be tested
# against a local copy of the site before anything goes live.
BASE_URL="${LECTURENOTES_BASE_URL:-https://www.aedinlai.com}"

APP_URL="$BASE_URL/downloads/LectureNotes.zip"
# Filled in by LectureNotes' scripts/release.sh each time a new build is
# published, so it always matches the zip next to this script.
APP_SHA256="ee145f2d9bc1be4d2ee4127693219b107eaa2f75415569164b2226e56b9e4005"
# The developer team that signs LectureNotes. Anyone who tampers with the
# download can change the zip, but can't produce this signature.
APP_TEAM_ID="N2XQ4P7AN5"
APP_DEST="/Applications/LectureNotes.app"

BLACKHOLE_URL="https://existential.audio/downloads/BlackHole2ch-0.7.1.pkg"
BLACKHOLE_SHA="57b540f27a3e29c37e310e01bee0fdfab76733087e47f997ef9dccf851400dcf"
BLACKHOLE_DRIVER="/Library/Audio/Plug-Ins/HAL/BlackHole2ch.driver"

OLLAMA_INSTALLER="https://ollama.com/install.sh"
# One multimodal model covers both Q&A and the camera feature.
OLLAMA_MODELS=("qwen3.5:4b")

WHISPER_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin"
WHISPER_DIR="$HOME/Library/Application Support/LectureNotes/models"
WHISPER_DEST="$WHISPER_DIR/ggml-large-v3-turbo-q5_0.bin"

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
# Fail here with something readable rather than halfway through a 5 GB
# download with a confusing error.

[ "$(uname -s)" = "Darwin" ] || die "LectureNotes is macOS only."

if [ "$(uname -m)" != "arm64" ]; then
  die "LectureNotes needs an Apple Silicon Mac (M1 or newer).
       This Mac reports '$(uname -m)', which means it's Intel-based."
fi

macos_major="$(sw_vers -productVersion | cut -d. -f1)"
if [ "$macos_major" -lt 14 ]; then
  die "LectureNotes needs macOS 14 (Sonoma) or later.
       This Mac is running $(sw_vers -productVersion)."
fi

echo
echo "${bold}LectureNotes installer${reset}"
echo "${dim}Installs the app, the BlackHole audio driver, Ollama, and ~4 GB"
echo "of speech and language models. Everything runs locally on your Mac.${reset}"
echo

# Ask for the admin password once, up front, and explain why — rather than
# surprising the user with a prompt partway through. Only BlackHole needs it
# (it's a system audio driver); everything else installs as you.
if [ ! -d "$BLACKHOLE_DRIVER" ]; then
  info "Your password is needed once, to install the BlackHole audio driver."
  sudo -v || die "Could not get administrator access."
  # Keep the sudo timestamp alive so the driver install doesn't re-prompt
  # after the long model downloads.
  while true; do sudo -n true; sleep 60; kill -0 "$$" 2>/dev/null || exit; done 2>/dev/null &
  echo
fi

# --- 1. the app ------------------------------------------------------------

step "Installing LectureNotes"
curl -fL --progress-bar "$APP_URL" -o "$TEMP_DIR/LectureNotes.zip" \
  || die "Could not download LectureNotes from $APP_URL"
actual_app_sha="$(shasum -a 256 "$TEMP_DIR/LectureNotes.zip" | cut -d' ' -f1)"
[ "$actual_app_sha" = "$APP_SHA256" ] || die "The LectureNotes download didn't match its expected checksum.
       Not installing it. Please report this at aedinlai.com."
unzip -q "$TEMP_DIR/LectureNotes.zip" -d "$TEMP_DIR/app" \
  || die "The downloaded file was not a valid zip archive."

extracted="$(find "$TEMP_DIR/app" -maxdepth 1 -iname '*.app' -print -quit)"
[ -n "$extracted" ] || die "No .app found inside the downloaded archive."

# Check the signature before trusting it with mic and screen permissions:
# intact, and made by the LectureNotes developer team.
codesign --verify --deep --strict "$extracted" 2>/dev/null \
  || die "The downloaded app's signature is broken. Not installing it."
signed_team="$(codesign -dv "$extracted" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
[ "$signed_team" = "$APP_TEAM_ID" ] || die "The downloaded app isn't signed by the LectureNotes developer.
       Not installing it."

# curl doesn't set com.apple.quarantine the way a browser does, so this is
# belt-and-braces in case the archive arrived some other way.
xattr -cr "$extracted" 2>/dev/null || true

if [ -d "$APP_DEST" ]; then
  # Replacing the bundle out from under a running copy technically works,
  # but leaves an orphaned process running the old code. Ask it to quit.
  if pgrep -f "$APP_DEST/Contents/MacOS/" >/dev/null 2>&1; then
    info "Closing the running copy of LectureNotes"
    osascript -e 'quit app "LectureNotes"' >/dev/null 2>&1 || true
    for _ in $(seq 1 10); do
      pgrep -f "$APP_DEST/Contents/MacOS/" >/dev/null 2>&1 || break
      sleep 1
    done
  fi
  info "Replacing the existing copy in /Applications"
  rm -rf "$APP_DEST" 2>/dev/null || sudo rm -rf "$APP_DEST"
fi
mv "$extracted" "$APP_DEST" 2>/dev/null || sudo mv "$extracted" "$APP_DEST" \
  || die "Could not move LectureNotes into /Applications."
ok "$APP_DEST"

# --- 2. BlackHole ----------------------------------------------------------

step "Audio driver (BlackHole 2ch)"
if [ -d "$BLACKHOLE_DRIVER" ]; then
  ok "already installed"
else
  info "This is what lets LectureNotes hear your computer's own sound,"
  info "so Zoom calls come out as a speaker-tagged transcript."
  curl -fL --progress-bar "$BLACKHOLE_URL" -o "$TEMP_DIR/blackhole.pkg" \
    || die "Could not download BlackHole from $BLACKHOLE_URL"

  # Pin the checksum: this package installs a system driver as root, so
  # verify it's byte-for-byte what we expect before handing it to installer.
  actual="$(shasum -a 256 "$TEMP_DIR/blackhole.pkg" | cut -d' ' -f1)"
  [ "$actual" = "$BLACKHOLE_SHA" ] || die "BlackHole download failed its checksum.
       expected $BLACKHOLE_SHA
       got      $actual
       Not installing. Please report this at aedinlai.com."

  sudo installer -pkg "$TEMP_DIR/blackhole.pkg" -target / >/dev/null \
    || die "BlackHole installation failed."
  ok "installed"
fi

# --- 3. Ollama -------------------------------------------------------------

step "Ollama"
ollama_bin=""
for candidate in /opt/homebrew/bin/ollama /usr/local/bin/ollama; do
  [ -x "$candidate" ] && { ollama_bin="$candidate"; break; }
done

if [ -n "$ollama_bin" ]; then
  ok "already installed ($ollama_bin)"
else
  info "Downloading and installing Ollama (~200 MB)"
  curl -fsSL "$OLLAMA_INSTALLER" | sh || die "Ollama installation failed."
  for candidate in /opt/homebrew/bin/ollama /usr/local/bin/ollama; do
    [ -x "$candidate" ] && { ollama_bin="$candidate"; break; }
  done
  [ -n "$ollama_bin" ] || die "Ollama installed but its command line tool wasn't found."
  ok "installed"
fi

# The app talks to Ollama over http://localhost:11434, so the server has to
# be up — both now, to pull models, and later when the app runs.
if ! curl -fsS --max-time 3 http://localhost:11434/api/tags >/dev/null 2>&1; then
  info "Starting Ollama"
  if [ -d "/Applications/Ollama.app" ]; then
    open -g -a "/Applications/Ollama.app" 2>/dev/null || true
  else
    "$ollama_bin" serve >/dev/null 2>&1 &
  fi
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1 && break
    sleep 1
  done
  curl -fsS --max-time 2 http://localhost:11434/api/tags >/dev/null 2>&1 \
    || die "Ollama was installed but didn't start. Open Ollama from /Applications, then re-run this installer."
fi

# --- 4. models -------------------------------------------------------------

step "Language model (~3.4 GB — this is the slow part)"
for model in "${OLLAMA_MODELS[@]}"; do
  if "$ollama_bin" list 2>/dev/null | awk '{print $1}' | grep -qx "$model"; then
    ok "$model already downloaded"
  else
    info "Pulling $model"
    "$ollama_bin" pull "$model" || die "Could not download $model."
  fi
done

step "Speech model (~550 MB)"
if [ -f "$WHISPER_DEST" ]; then
  ok "already downloaded"
else
  mkdir -p "$WHISPER_DIR"
  # Download beside the real filename, then move into place, so an
  # interrupted download can't leave a truncated file that later looks valid.
  curl -fL --progress-bar "$WHISPER_URL" -o "$WHISPER_DEST.partial" \
    || die "Could not download the speech model."
  mv "$WHISPER_DEST.partial" "$WHISPER_DEST"
  ok "$WHISPER_DEST"
fi

# --- done ------------------------------------------------------------------

echo
echo "${green}${bold}LectureNotes is installed.${reset}"
echo
echo "Opening it now. Two things on first launch:"
echo "  ${dim}1.${reset} It'll ask for microphone access — say yes."
echo "  ${dim}2.${reset} To capture your computer's audio, set your sound output"
echo "     ${dim}to BlackHole 2ch (or a Multi-Output Device) during lectures.${reset}"
echo
open "$APP_DEST"
