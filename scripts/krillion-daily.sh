#!/bin/bash
# Finds and publishes today's best Krillion answers. Runs at 12:05 AM Boston
# time -- five minutes after the dive resets at midnight ET -- with retries
# later in the day, and exits right away once today is done:
#   Mac:  launchd job ~/Library/LaunchAgents/com.aedinlai.krillion-daily.plist
#         This is the one that actually runs. A laptop is not awake at 00:05
#         every night, so the 9 AM and 6 PM entries matter: launchd also fires
#         a missed calendar job once on wake, and each run exits at once if the
#         day is already published. The dive stays up all day, so a late run
#         still publishes the right thing.
#   Pi:   alai@aedin-ctrl (reach it by Tailscale IP; MagicDNS is not resolving).
#         Installed at ~/krillion-daily.sh, cron 5 0,9,18, system clock is EST.
#         It pushes with ~/.ssh/news_deploy, the same deploy key the news job
#         uses, and ~/krillion-daily must exist before the first run or cron's
#         own >> redirect fails before the script can create it.
#         This is the better home: the Pi is awake at midnight, the Mac is not.
#
#         It needs `claude` logged in. As of 2026-11-27 the Pi's CLI is NOT:
#         "OAuth session expired and could not be refreshed", which is also why
#         news stopped publishing that day. Both jobs stay broken until someone
#         runs `claude` on the Pi and signs in again.
#
# Works in its own clone (krillion-daily/site in the folder below) so it never
# touches a working copy. Claude writes the candidate lists and runs
# scripts/krillion.mjs probe (see scripts/krillion-routine.md); this script
# checks the result, commits docs/krillion/ and pushes to main.
#
#   scripts/krillion-daily.sh      run now (skips if today is already published)
#   tail -f ~/Library/Logs/krillion-daily.log   (Pi: ~/krillion-daily/log)
set -uo pipefail

NVM_NODE=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | tail -1)
export PATH="$HOME/.local/bin:${NVM_NODE:+$NVM_NODE:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
REMOTE="${KRILLION_REMOTE:-https://github.com/Aedin-ctrl/Aedin-ctrl.github.io.git}"
if [ "$(uname)" = Darwin ]; then BASE="$HOME/Library/Application Support/krillion-daily"; else BASE="$HOME/krillion-daily"; fi
SITE="$BASE/site"
LOCK="$BASE/lock"
MODEL="claude-sonnet-5-5"
MAX_SECONDS=3600

log(){ echo "$(date '+%F %T') $*"; }
mkdir -p "$BASE"

# One run at a time; a lock older than 2 hours is from a run that died.
if ! mkdir "$LOCK" 2>/dev/null; then
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then rm -rf "$LOCK"; mkdir "$LOCK"; else log "another run is going; skipping"; exit 0; fi
fi
trap 'rm -rf "$LOCK"' EXIT

if [ ! -d "$SITE/.git" ]; then
  log "cloning $REMOTE"
  # Shallow and single-branch: this runner only ever writes docs/krillion and
  # pushes main. A full clone drags the whole site's history onto the Pi's SD
  # card, which is the mistake the news runner already paid for.
  git clone -q --depth 1 --single-branch --branch main "$REMOTE" "$SITE" || { log "clone failed"; exit 1; }
fi
cd "$SITE" || exit 1
git fetch -q --depth 1 origin main || { log "fetch failed (offline?)"; exit 1; }
# A failed reset is not a hiccup to log and walk past: it means the object store
# is damaged, and the working tree is then some arbitrary half-state. Carrying on
# would stage and push that state -- on 2026-11-27 a reboot mid-write left this
# clone with empty object files, and the run that followed was one step from
# pushing a commit that deleted .gitignore and reverted two pages. The clone is
# disposable, so throw it away and let the next run build a fresh one.
git reset -q --hard origin/main || {
  log "reset failed; clone is corrupt, discarding $SITE so the next run re-clones"
  rm -rf "$SITE"
  exit 1
}
git clean -qfd || { log "clean failed in $SITE"; exit 1; }

TODAY=$(TZ=America/New_York date +%F)
# Already published is not "done". krillion.io tightened its spelling repair
# overnight on 2026-11-28 and the word published at 00:14 that morning was worth
# 465 points then and 215 by breakfast -- the player got 305. The later slots
# re-grade what we published and republish it if it moved; that costs seven
# requests on a day nothing changed.
MODE=probe
if [ -f "docs/krillion/days/$TODAY.json" ]; then MODE=recheck; fi

# The dive resets at 05:00Z. Running before that gets yesterday's prompts, and
# probe refuses the mismatch -- so just wait for the switch rather than fail.
SERVED=$(curl -fsS --max-time 20 https://krillion.io/api/today | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).date||"")}catch(e){console.log("")}})')
if [ "$SERVED" != "$TODAY" ]; then log "krillion.io is still serving '$SERVED', want $TODAY; will retry at the next run"; exit 1; fi

if [ "$MODE" = recheck ]; then
  log "$TODAY is published; re-grading it against the grader now"
  node scripts/krillion.mjs reprobe "$TODAY" || { log "reprobe failed; leaving $TODAY as it was"; exit 1; }
  if [ -z "$(git status --porcelain -- docs/krillion)" ]; then log "$TODAY is unchanged"; exit 0; fi
fi

if [ "$MODE" = probe ]; then
log "probing $TODAY with $MODEL"
PROMPT="You find the day's best Krillion answers for aedinlai.com, started by the Mac runner. Today is $TODAY (America/New_York). Read scripts/krillion-routine.md and follow it through step 5 (running node scripts/krillion.mjs probe krillion-today.json until it succeeds). Do not run git; the runner commits and pushes. Finish with the seven winning answers, their tiers, and the day's total."
perl -e 'alarm shift; exec @ARGV' "$MAX_SECONDS" \
  claude -p "$PROMPT" --model "$MODEL" \
    --allowedTools "Read" "Write" "Edit" "Glob" "Grep" \
      "Bash(node scripts/krillion.mjs:*)" "Bash(node -e:*)" "Bash(TZ=America/New_York date:*)" "Bash(date:*)" "Bash(ls:*)" "Bash(test:*)" "Bash(cat:*)" "Bash(head:*)" "Bash(wc:*)"
log "claude exited with $?"
fi

if [ ! -f "docs/krillion/days/$TODAY.json" ]; then log "no day file was written; will retry at the next run"; exit 1; fi
node scripts/krillion.mjs check || { log "day file failed the check; not publishing"; exit 1; }
if [ -n "$(git status --porcelain -- . ':!docs/krillion' ':!krillion-today.json')" ]; then
  log "files outside docs/krillion changed; publishing only docs/krillion"
fi

TOTAL=$(node -e "console.log(require('./docs/krillion/days/$TODAY.json').total)")
WORD=$(node -e "const u=require('./docs/krillion/days/$TODAY.json').universal; console.log(u ? u.input + ' ' + u.total : '')")
git add docs/krillion
if [ "$MODE" = recheck ]; then
  git commit -q -m "Krillion: $TODAY re-graded ($WORD)" || { log "nothing to commit"; exit 0; }
else
  git commit -q -m "Krillion: $TODAY ($TOTAL/700)" || { log "nothing to commit"; exit 1; }
fi
for try in 1 2 3; do
  if git push -q origin HEAD:main; then log "published $TODAY ($TOTAL/700)"; exit 0; fi
  log "push failed (try $try); rebasing onto origin/main"
  git pull -q --rebase origin main || true
  sleep 20
done
log "push failed; the commit is waiting in $SITE"
exit 1
