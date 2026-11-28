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

If today's file already exists, stop without changing anything. The runner
handles that case itself without you: a later slot re-grades the published word
(`krillion.mjs reprobe`) and republishes only if it moved.

**The grader is not a fixed oracle.** On 2026-11-28 krillion.io tightened its
spelling repair some time between 00:14 and 05:32 ET. The word published that
morning was worth 465 points when it was measured and 215 by breakfast; the
player who typed it got 305. Everything below was re-measured after that change.
A number measured hours before anyone plays has to be re-measured, not trusted.

## 2. Get today's prompts

    node scripts/krillion.mjs today

Seven prompts, each with an `id` (`p1`..`p7`) and a `text`.

## 3. The one word

**The day's answer is one input word, not seven.** The grader repairs a
near-miss silently and scores it at the repaired answer's full value, and the
repair runs against *each prompt's own answer set* -- so a single string lands
on a different real answer in all seven. That is the game.

**It has to be a real or near-real word now.** Nonsense stems are finished.
`bonos`, `ronos`, `monos`, `menos` and nine of their cousins covered six of
seven on 2026-11-27 and scored **0/7 each** on 2026-11-28 after the repair
tightened. What works is five letters of ordinary English ending in -es or -os,
or one edit from one: 2026-11-28's best was `toses` (390, all seven), found by
scavenging the edit neighbourhood of `roses`.

**The target: 420 points from the one input.** That is what `clearsBar` in the
day file means. It was set under the old, looser repair and **has not been
cleared since**: the best word found on 2026-11-28, after ~1,300 requests of
hunting, was 390 with all seven covered -- seven Rare answers. Under this
grader a Deep Cut repair is scarce and 60 is the common hit, so 420 is seven
Rare answers plus one upgrade. Treat it as a target, not a floor you failed.

Coverage and deep cuts are recorded beside the total because they tell you
*why* a word missed, but they do not decide the pick: a word is worth what it
scores.

So the candidate lists are built the other way round from how it looks. Write
`krillion-today.json` as one list per prompt id, and **put every universal
candidate into all seven lists, spelled identically**:

    {
      "p1": ["toses", "ioses", "panes", "holes", ..., "durian", "rambutan"],
      "p2": ["toses", "ioses", "panes", "holes", ..., "Arrival", "Moonlight"],
      ...
    }

A universal candidate that is missing from even one list is thrown away:
`krillion.mjs` only ranks a word that was graded on all seven prompts, because
a word tested on six says nothing about the seventh. Spell it the same way in
every list -- `toses` and `Toses` are one word to the grader but two to the
ranker, and the split halves both their totals.

### Where universal candidates come from

They are not random strings. A word only lands on a prompt if it is about one
letter from an answer in that prompt's set, so the pool is the edit
neighbourhood of answers you already know:

- **Yesterday's file.** `docs/krillion/days/` records the `input` for every
  attempt. Start from the inputs that covered the most prompts, and from the
  one-letter family around them (`roses` -> `toses`, `ioses`, `moses`,
  `noses`). Vowel-swapping a nonsense stem no longer works.
- **Short, vowel-heavy, 4-6 letters.** Those sit one edit from the most real
  words. A long exact answer is one edit from almost nothing.
- **`node scripts/krillion.mjs hunt --words scripts/krillion-seeds.txt
  --budget 300`** runs the standing seed family first -- the shapes that have
  scored before. Start every day here; it is the cheapest 420 you will find.
- **`node scripts/krillion.mjs hunt <seeds> --budget 150 --order <hard
  prompts first> --gate 2`** scavenges the edit neighbourhood of seeds and
  abandons a candidate that clears none of the gated prompts, which costs two
  requests instead of seven. Use it to discover, then put what it finds into
  all seven lists so the probe records it.

**Some prompts are closed, and you must stop paying for them.** A prompt whose
answers are a tight vocabulary cluster -- jobs, brands, a named category -- is
reachable only from its own words, and those words repair onto nothing in the
other six sets. Measured on 2026-11-27: p5 ("a job involving drawing") was hit
only by literal drawing nouns -- etcher 85, tracer 85, limner 85, engraver 60 --
each of which scored 0 to 230 across all seven. Two 700-request hunts over
~1,200 scavenged candidates from two different neighbourhoods produced **zero**
new words that reached it.

The rule: run the gated hunt on the missing prompt, and if ~100 gated requests
turn up no new word that reaches it, declare the prompt closed, stop, and bank
the best word you have for the other six. 485 from six prompts is a good day;
spending the rest of the budget on a closed prompt turns it into a bad one.

**Hunt the prompt you are missing, not the word you like.** Once a candidate
covers five or six, the only thing that matters is the blank one. Put the
missed prompt first in `--order` with `--gate 1`, and seed from the answers
that prompt has already accepted -- its own neighbourhood is the only place a
word that covers it can come from. A family that cannot reach it is finished;
switch seeds rather than testing more of its cousins.

Aim for **about 12 universal candidates**. At seven requests each that is
~84 of the day's budget -- the smaller share on purpose. The one word is the
headline, but it cannot be bought with the total out of 700, so the per-prompt
floor in step 4 keeps the larger half.

### What the spelling repair does and does not do

`POST /api/submit` carries a `previewCorrection` flag, and it changes the
meaning of the call:

- **off** (what `probe` and `try` send) — a near-miss is repaired silently and
  scored at the repaired answer's full value. `kray` scores 85 as Krai.
- **on** (what the site's own page sends) — the same near-miss comes back
  `{accepted:false, correction:"Krai"}`: no score, just the suggestion the page
  shows you before you commit.

The repair is fuzzy *spelling* matching against real answers, roughly a letter
out, and since 2026-11-28 it is strict about that letter. It is not a dictionary
of synonyms and not a way to funnel an easy word onto a hard one: `kray`,
`filke` and `okrugg` repair to Krai, Fylke and Okrug, while `cry`, `folk` and
`oak` repair to nothing at all. A word with no match comes back
`{accepted:false, checkSpelling:true}` -- no suggestion at all -- which is the
dead end you want to recognise early.

It is still worth knowing for one reason: `try` reports the suggestion behind
every rejection, and a rejected word that suggests something real has handed you
a new answer to test. `krei` was rejected and suggested Kreis, which scores 85.

## 4. Fill the rest with per-prompt answers

The universal word can miss, and a prompt where every universal candidate was
rejected still needs something. After the universal block, append **about 25
real answers per prompt**, ordered common to obscure. This is what defends the
day's score:

- **Rarity is semantic, not spelling.** `durian` scores 10 -- the answer
  everyone blurts out. `rambutan` and `soursop` score 60, `cupuacu` 85. What
  moves you down a tier is a less familiar *thing*, not a weirder spelling of
  a familiar one. Do not pad with plurals or misspellings: the grader repairs
  them back to the same word and you have burned a request.
- **Obscure but real.** An answer the grader rejects scores 0, and a list of
  nothing but exotica can come back entirely rejected.
- **Mind the prompt's own fence.** Several prompts carry a qualifier --
  "live-action", "1,000+ IMDb votes", "released in the 2010s". An answer that
  breaks it is rejected however rare it is.

Together that is ~84 + ~175 = ~259 requests. If you have to cut, cut the
universal family first: a thin floor costs real points on every prompt, while a
thin universal family only costs you the chance of beating today's champion.

## 5. Probe and publish

    node scripts/krillion.mjs probe krillion-today.json

It grades every candidate one at a time with a gap between them, records the
`input` alongside the repaired answer, picks the day's best universal word,
writes `docs/krillion/days/$TODAY.json` and rebuilds `docs/krillion/index.json`.
It stops without writing anything if krillion.io starts refusing requests --
that is not a failure to work around, so do not retry it in a loop or lower
the gap.

Then check it:

    node scripts/krillion.mjs check

Do not run git. The runner commits and pushes.

## 6. Report

Lead with **the one word**: the `universal` block in the day file -- the input
to type, `covered` out of seven, `deepcuts`, the total, and what it repaired to
on each prompt. Then the per-prompt winners as the fallback.

Say what the word is worth **as measured in that run**, and nothing about what
it was worth yesterday: yesterday's grader may not be today's.

**Say in the first line whether `clearsBar` is true** -- that is, whether the
one word made 420. If it is false, say which prompt went blank and which
answers came back under Deep Cut; that is what the next day has to fix. Name the seeds you tried for the missing prompt so tomorrow does not
repeat them; tomorrow's prompts are different answer sets, so today's champion
means nothing then, but a seed family that could not reach a drawing-jobs
prompt probably cannot reach the next one either.
