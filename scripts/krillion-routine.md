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

## 3. The one word

**The day's answer is one input word, not seven.** The grader repairs a
near-miss silently and scores it at the repaired answer's full value, and the
repair runs against *each prompt's own answer set* -- so a single nonsense
string lands on a different real answer in all seven. On 2026-11-27 `bonos`
covered six of seven for 455 points. That is the game.

So the candidate lists are built the other way round from how it looks. Write
`krillion-today.json` as one list per prompt id, and **put every universal
candidate into all seven lists, spelled identically**:

    {
      "p1": ["bonos", "ronos", "donos", "banos", ..., "durian", "rambutan"],
      "p2": ["bonos", "ronos", "donos", "banos", ..., "Arrival", "Moonlight"],
      ...
    }

A universal candidate that is missing from even one list is thrown away:
`krillion.mjs` only ranks a word that was graded on all seven prompts, because
a word tested on six says nothing about the seventh. Spell it the same way in
every list -- `bonos` and `Bonos` are one word to the grader but two to the
ranker, and the split halves both their totals.

### Where universal candidates come from

They are not random strings. A word only lands on a prompt if it is about one
letter from an answer in that prompt's set, so the pool is the edit
neighbourhood of answers you already know:

- **Yesterday's file.** `docs/krillion/days/` records the `input` for every
  attempt. Start from the inputs that covered the most prompts, and from the
  vowel-swapped family around them (`bonos` -> `ronos`, `donos`, `banos`,
  `benos`, `bonus`, `bonas`).
- **Short, vowel-heavy, 4-6 letters.** Those sit one edit from the most real
  words. A long exact answer is one edit from almost nothing.
- **`node scripts/krillion.mjs hunt <seed answers> --budget 150`** scavenges
  the edit neighbourhood of seeds for you and gates out dead candidates after
  three misses. Use it to discover, then put what it finds into all seven
  lists so the probe records it.

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
out. It is not a dictionary of synonyms and not a way to funnel an easy word
onto a hard one: `kray`, `filke` and `okrugg` repair to Krai, Fylke and Okrug,
while `cry`, `folk` and `oak` repair to nothing at all. Do not write candidate
lists that lean on it.

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
to type, its total out of 700, how many of the seven it covered, and what it
repaired to on each prompt. Then the per-prompt winners as the fallback.

Say plainly if the best universal word covered fewer than five prompts, or if
it lost to the per-prompt floor. That means the candidate family was built
around the wrong seeds, and tomorrow should start from different ones --
tomorrow's prompts are different answer sets, so today's champion means
nothing then.
