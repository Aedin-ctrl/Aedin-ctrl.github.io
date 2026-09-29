#!/bin/bash
# Writes and publishes today's News stories. Runs on a schedule, at 6 AM with
# a few retries during the day, and exits right away once today is done:
#   Mac:  launchd job ~/Library/LaunchAgents/com.aedinlai.news-daily.plist
#   Pi:   cron, 0 6,9,13,19 * * * ~/news-daily/news-daily.sh >> ~/news-daily/log 2>&1
#
# Works in its own clone (news-daily/site in the folder below) so it never
# touches a working copy. Claude does the research and
# runs scripts/news.mjs add (see scripts/news-routine.md); this script checks
# the result, commits docs/news/ and pushes to main with the Mac's git login.
#
#   scripts/news-daily.sh          run now (skips if today is already published)
#   tail -f ~/Library/Logs/news-daily.log   (Pi: ~/news-daily/log)
set -uo pipefail

NVM_NODE=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1)
export PATH="$HOME/.local/bin:${NVM_NODE:+$NVM_NODE:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REMOTE="https://github.com/Aedin-ctrl/Aedin-ctrl.github.io.git"
if [ "$(uname)" = Darwin ]; then BASE="$HOME/Library/Application Support/news-daily"; else BASE="$HOME/news-daily"; fi
SITE="$BASE/site"
LOCK="$BASE/lock"
MODEL="claude-sonnet-5-5"
MAX_SECONDS=5400

log(){ echo "$(date '+%F %T') $*"; }
mkdir -p "$BASE"

# One run at a time; a lock older than 3 hours is from a run that died.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +180 2>/dev/null)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"; else log "another run is going; skipping"; exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

if [ ! -d "$SITE/.git" ]; then
  log "cloning $REMOTE"
  git clone -q "$REMOTE" "$SITE" || { log "clone failed"; exit 1; }
fi
cd "$SITE" || exit 1
git fetch -q origin main || { log "fetch failed (offline?)"; exit 1; }
git reset -q --hard origin/main
git clean -qfd

TODAY=$(TZ=America/New_York date +%F)
if [ -f "docs/news/days/$TODAY.json" ]; then log "$TODAY already published"; exit 0; fi

log "writing $TODAY with $MODEL"
PROMPT="You are the daily editor for the News tab on aedinlai.com, started by the Mac runner. Today is $TODAY (America/New_York). Read scripts/news-routine.md and follow it through step 5 (running node scripts/news.mjs add news-today.json --date $TODAY until it succeeds). Do not run git; the runner commits and pushes. Every fact and every source URL must come from pages you actually opened; never invent anything. Finish with the list of headlines you added."
perl -e 'alarm shift; exec @ARGV' "$MAX_SECONDS" \
  claude -p "$PROMPT" --model "$MODEL" \
    --allowedTools "WebSearch" "WebFetch" "Read" "Write" "Edit" "Glob" "Grep" \
      "Bash(node scripts/news.mjs:*)" "Bash(node -e:*)" "Bash(TZ=America/New_York date:*)" "Bash(date:*)" "Bash(ls:*)" "Bash(test:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(wc:*)"
log "claude exited with $?"

if [ ! -f "docs/news/days/$TODAY.json" ]; then log "no day file was written; will retry at the next run"; exit 1; fi
node scripts/news.mjs check || { log "day file failed the check; not publishing"; exit 1; }
if [ -n "$(git status --porcelain -- . ':!docs/news' ':!news-today.json')" ]; then
  log "files outside docs/news changed; publishing only docs/news"
fi

COUNT=$(node -e "console.log(require('./docs/news/days/$TODAY.json').articles.length)")
git add docs/news
git commit -q -m "News: $TODAY ($COUNT stories)" || { log "nothing to commit"; exit 1; }
for try in 1 2 3; do
  if git push -q origin HEAD:main; then log "published $TODAY ($COUNT stories)"; exit 0; fi
  log "push failed (try $try); rebasing onto origin/main"
  git pull -q --rebase origin main || true
  sleep 20
done
log "push failed; the commit is waiting in $SITE"
exit 1
