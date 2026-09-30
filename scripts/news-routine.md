# Daily News routine

Instructions for the cloud agent that writes each day's stories for the News
tab on aedinlai.com (docs/news/). It runs every morning at 6 AM Boston time
from Aedin's Mac (scripts/news-daily.sh, a launchd job), which asks Claude to
follow this file. Edit this file to change what it does.

## 1. Is today already done?

    TODAY=$(TZ=America/New_York date +%F)
    test -f docs/news/days/$TODAY.json && echo "already done"

If today's file already exists, stop without changing anything.

## 2. See what's been covered

Read `docs/news/index.json`: its `articles` list has every headline so far
(newest first). Skip any story that's already been covered in the last
30 days, unless there has been a big new development. In that case, write
it as a follow-up and lead with the new reporting.

## 3. Research 10-12 stories

The reader is an engineering student who wants **interesting but kind of
scary** things going on in the world: the "wait, that's real?" stories. For
example:

- Meta using fMRI brain recordings to build a model that predicts how content
  hits the brain (and could be used to make feeds more addictive).
- Companies building "biological data centers" out of living human neurons.

Good areas include neurotech and brain data, biocomputing, AI behaving in
unsettling ways, surveillance and privacy, cyberattacks on infrastructure,
biotech, pandemics, climate tipping points, space risks, and geopolitics or
the economy when the story has a strange or ominous angle. Mix it up: no
more than 3 stories from any one category, and at least 5 different
categories.

**Recency:** the day has three tiers (see step 4). At least 3 stories must
be reported in the last 3 days. The rest can be up to about 3 months old
(92 days at most) if they're big and haven't been covered yet, but prefer
the last few weeks.

**Accuracy is the whole point:**

- Use WebSearch and WebFetch. Every fact must come from a page you actually
  opened.
- Only put URLs in `sources` that you actually opened. Never guess a URL.
- Use 2-4 reputable sources per story when you can, such as wire services,
  major papers, science journals, official reports, and established tech or
  science press.
- Be plain and honest. Don't use hype words ("shocking", "terrifying"). Say
  what is proven, what is claimed, and what is speculation. If the scary
  reading is overblown, say that in the details.

## 4. Write the day file

Write a JSON array to `news-today.json` in the repo root (it's gitignored),
one object per story:

```json
{
  "headline": "Accurate, punchy headline, sentence case, <= 90 chars",
  "summary": "1-2 sentences, <= 45 words: what happened, plainly. This is all the card shows.",
  "impacts": ["3-4 bullets, each <= 140 chars: how this could affect people, society or the reader"],
  "details": ["4-6 paragraphs, ~350-500 words total: background, what exactly happened, who's involved, key numbers, what experts say, what's uncertain or overhyped, what to watch next"],
  "category": "Neurotech | AI | Surveillance | Biotech | Climate | Space | Cyber | Geopolitics | Economy | Health | Tech",
  "tags": ["4-7 lowercase search words, e.g. meta, fmri, brain, addiction"],
  "date": "YYYY-MM-DD the key report came out",
  "unease": 3,
  "sources": [{"name": "Publication", "url": "https://..."}]
}
```

- `unease` is 1-5: how unsettling the story is.
- **Order matters.** The page splits the list into three sections, and every
  card shows its category and date:
  1. **Just in** (stories 1-3): things that happened very recently, reported
     within 3 days of today. The script rejects the day if any of these is
     older.
  2. **Must see** (stories 4-9): the 6 coolest, biggest or most unsettling
     stories from roughly the last few months (at most 92 days old). These
     are the "wait, that's real?" ones.
  3. **Top stories** (10 and up): everything else worth knowing.
- Reuse existing tags where they fit, so search works across days. Look at the
  tags in index.json first.

## 5. Add it and publish

    node scripts/news.mjs add news-today.json --date $TODAY

If it reports a problem, fix the JSON and run it again. The script needs at
least 10 stories, requires every field, checks the story ages above, and
refuses a lead source that an earlier day already used.

When the Mac runner started you, stop here: it checks the result, commits and
pushes by itself. Otherwise publish:

    git add docs/news
    git commit -m "News: $TODAY ($(node -e "console.log(require('./docs/news/days/$TODAY.json').articles.length)") stories)"
    git push origin HEAD:main

Only change files in `docs/news/`. Don't edit anything else in the repo.
