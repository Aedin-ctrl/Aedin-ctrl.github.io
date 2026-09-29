# Daily News routine

Instructions for the cloud agent that writes each day's stories for the News
tab on aedinlai.com (docs/news/). It runs every morning at 6 AM Boston time.
Edit this file to change what it does; the routine just says "follow
scripts/news-routine.md".

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

**Recency:** prefer stories reported in the last 7 days. Stories up to about
30 days old are fine if they're still unfolding or weren't covered yet.

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

Write a JSON array to `/tmp/news-today.json`, one object per story:

```json
{
  "headline": "Accurate, punchy headline, sentence case, <= 90 chars",
  "summary": "2 sentences: what happened, plainly.",
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
- Order the stories most compelling first.
- Reuse existing tags where they fit, so search works across days. Look at the
  tags in index.json first.

## 5. Add it and publish

    node scripts/news.mjs add /tmp/news-today.json --date $TODAY

If it reports a problem, fix the JSON and run it again. The script needs at
least 10 stories, requires every field, and refuses a lead source that an
earlier day already used. Then:

    git add docs/news
    git commit -m "News: $TODAY ($(node -e "console.log(require('./docs/news/days/$TODAY.json').articles.length)") stories)"
    git push origin HEAD:main

Only change files in `docs/news/`. Don't edit anything else in the repo.
