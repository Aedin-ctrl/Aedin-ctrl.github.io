# Daily Krillion routine

Instructions for the agent that finds each day's best answers for the Krillion
tab on aedinlai.com (docs/krillion/). It runs at 12:05 AM Boston time from
Aedin's Mac (scripts/krillion-daily.sh, a launchd job), five minutes after the
dive resets at midnight ET. Edit this file to change what it does.

## What this is

krillion.io gives you 7 prompts a day and scores each answer by how rare it is:
Plankton 10, Schooler 30, Rare 60, Deep Cut 85, One in a Krillion 100. The
grader at `POST /api/submit` scores a single word and keeps no state about the
attempt, so we can ask it what a word is worth without playing a run. We only
read the grader. We never submit a score, never present a receipt, and never
touch a real run.

## 1. Is today already done?

    TODAY=$(TZ=America/New_York date +%F)
    test -f docs/krillion/days/$TODAY.json && echo "already done"

If today's file already exists, stop without changing anything.

## 2. Get today's prompts

    node scripts/krillion.mjs today

Seven prompts, each with an `id` (`p1`..`p7`) and a `text`.

## 3. Write the candidates

Write `krillion-today.json`: one list per prompt id, **ordered common to
obscure**.

    {
      "p1": ["apple", "kiwi", "durian", "rambutan", "soursop", "cupuacu"],
      "p2": [...]
    }

About 40 per prompt. The whole method is in how you order them:

- **Rarity is semantic, not spelling.** `durian` scores 10 — the answer
  everyone blurts out. `rambutan` and `soursop` score 60, `cupuacu` 85. What
  moves you down a tier is a less familiar *thing*, not a weirder spelling of a
  familiar one. Do not pad the list with plurals, misspellings or inflections:
  the grader repairs them back to the same word and you have burned a request.
  `cupuacy` scores exactly what `cupuacu` scores, so testing both tells you
  nothing you did not already know.
- **Start where everyone starts, then keep walking.** The first few entries
  should be the obvious answers, so the day file records what the floor was.
  Then go outward: regional, historical, technical, foreign-language,
  specialist. The last third should be answers you are not sure will be
  accepted at all.
- **Obscure but real.** An answer the grader rejects scores 0, and a list of
  nothing but exotica can come back entirely rejected. Every entry has to be a
  genuine, checkable answer to the prompt.
- **Mind the prompt's own fence.** Several prompts carry a qualifier —
  "live-action", "1,000+ IMDb votes", "released in the 2010s". An answer that
  breaks it is rejected however rare it is.

### What the spelling repair does and does not do

`POST /api/submit` carries a `previewCorrection` flag, and it changes the
meaning of the call:

- **off** (what `probe` and `try` send) — a near-miss is repaired silently and
  scored at the repaired answer's full value. `kray` scores 85 as Krai.
- **on** (what the site's own page sends) — the same near-miss comes back
  `{accepted:false, correction:"Krai"}`: no score, just the suggestion the page
  shows you before you commit.

The repair is fuzzy *spelling* matching against real answers, roughly a letter
out. It is not a dictionary of synonyms and not a way to funnel an easy word
onto a hard one: `kray`, `filke` and `okrugg` repair to Krai, Fylke and Okrug,
while `cry`, `folk` and `oak` repair to nothing at all. Do not write candidate
lists that lean on it.

It is still worth knowing for one reason: `try` reports the suggestion behind
every rejection, and a rejected word that suggests something real has handed you
a new answer to test. `krei` was rejected and suggested Kreis, which scores 85.

## 4. Test the universal tokens

Append the same handful of cross-prompt candidates to **every** list — the
answers people claim work on anything, including the game's own name:

    "Krillion", "Alex", "James"

They cost 7 requests a day and the day file records what they were actually
worth, which settles the trend rather than repeating it. Drop any that come
back rejected for a week straight.

**That first reading was wrong, and the mistake is worth keeping written down.**
The 56-out-of-56 rejection came from asking with `previewCorrection` ON, which
reports a near-miss as a rejection and never scores it. Asked the way scoring
actually works — flag off — the same words are among the strongest in the game.

The repair runs against *each prompt's own answer set*, so one input lands on a
different real answer per prompt. On 2026-11-27 `bonos` covered six of seven:

    p1 85 Mono almond   p2 85 Monos   p3 85 Bongo
    p4 85 Buno          p6 85 Boo!    p7 30 Borough   (p5 missed)

455 points from one word. `ronos` took five including p5 (Rotoscope artist),
`donos` and `banos` five apiece. `Alex` and `James` really do score nothing, so
the nonsense words in that list were carrying it, not the names.

Keep testing the list daily — tomorrow's prompts are different answer sets, so
today's champion means nothing then. `hunt --words <file>` tests a named list in
full and scavenges around known answers for better; `across WORD...` scores one
word against all seven.

## 5. Probe and publish

    node scripts/krillion.mjs probe krillion-today.json

It grades every candidate one at a time with a gap between them, writes
`docs/krillion/days/$TODAY.json` with the winner and the full attempt list per
prompt, and rebuilds `docs/krillion/index.json`. It stops without writing
anything if krillion.io starts refusing requests — that is not a failure to
work around, so do not retry it in a loop or lower the gap.

Then check it:

    node scripts/krillion.mjs check

Do not run git. The runner commits and pushes.

## 6. Report

Finish with the seven winners, their tiers, and the day's total out of 700.
Call out any prompt where the best answer was still Plankton or Schooler —
that is a prompt the candidate list was too timid on, and it is worth saying so.
