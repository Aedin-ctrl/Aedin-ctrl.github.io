#!/usr/bin/env node
// Adds a day of stories to the News tab (docs/news/) and rebuilds its index.
//
//   node scripts/news.mjs add FILE.json [--date YYYY-MM-DD]   check FILE and write docs/news/days/DATE.json
//   node scripts/news.mjs rebuild                             rebuild docs/news/index.json from days/
//   node scripts/news.mjs check                               validate every day file
//
// FILE is either an array of articles or {"articles": [...]}. Each article:
//   headline   string, <= 110 chars
//   summary    string, 1-3 sentences
//   impacts    3-5 strings: how it could affect people / society
//   details    3-8 paragraphs: the in-depth summary
//   category   one of CATEGORIES below
//   tags       3-8 lowercase search words
//   date       YYYY-MM-DD the story was reported
//   unease     1-5
//   sources    1-5 {name, url}
// Order matters: the page shows the first 3 as "Just in" (reported within
// NOW_DAYS of the day), the next 6 as "Must see" (the biggest stories, up to
// MAX_AGE_DAYS old), and the rest as "Top stories". `add` checks the ages and
// wants MIN_NEW stories (12 Top stories); `check` accepts older, shorter days.
// `id` is made from the day + headline when it's missing. The page
// (docs/news/index.html) searches index.json and loads a day file when opened.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEWS = join(ROOT, 'docs/news');
const DAYS = join(NEWS, 'days');
const INDEX = join(NEWS, 'index.json');
const MIN_PER_DAY = 10, MIN_NEW = 21;
const NOW = 3, NOW_DAYS = 3, MAX_AGE_DAYS = 92;
const CATEGORIES = ['Neurotech', 'AI', 'Surveillance', 'Biotech', 'Climate', 'Space', 'Cyber', 'Geopolitics', 'Economy', 'Health', 'Tech'];
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function die(msg){ console.error('error: ' + msg); process.exit(1); }

// Boston time, since "today" means the reader's morning.
function todayET(){
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}

function slug(s){
  return s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 8).join('-');
}

const isStr = (v, max) => typeof v === 'string' && v.trim().length > 0 && (!max || v.length <= max);
const strList = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max && v.every(x => isStr(x));

function problems(a){
  const p = [];
  if(!isStr(a.headline, 110)) p.push('headline (string, <= 110 chars)');
  if(!isStr(a.summary, 600)) p.push('summary');
  if(!strList(a.impacts, 3, 5)) p.push('impacts (3-5 strings)');
  if(!strList(a.details, 3, 8)) p.push('details (3-8 paragraphs)');
  if(!CATEGORIES.includes(a.category)) p.push(`category (one of ${CATEGORIES.join(', ')})`);
  if(!strList(a.tags, 3, 8) || a.tags.some(t => t !== t.toLowerCase())) p.push('tags (3-8 lowercase strings)');
  if(!DAY_RE.test(a.date || '')) p.push('date (YYYY-MM-DD)');
  if(!Number.isInteger(a.unease) || a.unease < 1 || a.unease > 5) p.push('unease (1-5)');
  if(!Array.isArray(a.sources) || !a.sources.length || a.sources.length > 5 ||
     a.sources.some(s => !isStr(s?.name) || !/^https?:\/\//.test(s?.url || ''))) p.push('sources (1-5 {name, url})');
  return p;
}

function tidy(a, day){
  return {
    id: a.id || `${day}-${slug(a.headline)}`,
    headline: a.headline.trim(),
    summary: a.summary.trim(),
    impacts: a.impacts.map(s => s.trim()),
    details: a.details.map(s => s.trim()),
    category: a.category,
    tags: [...new Set(a.tags.map(t => t.trim()))],
    date: a.date,
    unease: a.unease,
    sources: a.sources.map(s => ({ name: s.name.trim(), url: s.url.trim() }))
  };
}

function dayFiles(){
  if(!existsSync(DAYS)) return [];
  return readdirSync(DAYS).filter(f => DAY_RE.test(f.replace(/\.json$/, '')) && f.endsWith('.json')).sort();
}
const readDay = f => JSON.parse(readFileSync(join(DAYS, f), 'utf8'));

function checkDay(day, articles){
  if(articles.length < MIN_PER_DAY) die(`${day}: ${articles.length} articles, need at least ${MIN_PER_DAY}`);
  articles.forEach((a, i) => {
    const p = problems(a);
    if(p.length) die(`${day} article ${i + 1} ("${a.headline || '?'}"): bad ${p.join('; ')}`);
  });
}

function rebuild(){
  const days = [], articles = [];
  for(const f of dayFiles().reverse()){
    const d = readDay(f);
    days.push({ date: d.date, count: d.articles.length });
    for(const a of d.articles){
      articles.push({ id: a.id, day: d.date, headline: a.headline, summary: a.summary, category: a.category, tags: a.tags, unease: a.unease });
    }
  }
  writeFileSync(INDEX, JSON.stringify({ updated: new Date().toISOString(), days, articles }) + '\n');
  console.log(`index: ${days.length} days, ${articles.length} articles`);
}

function add(file, day){
  if(!DAY_RE.test(day)) die('--date must be YYYY-MM-DD');
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.articles;
  if(!Array.isArray(list)) die('file must be an array of articles or {"articles": [...]}');
  checkDay(day, list);
  if(list.length < MIN_NEW) die(`${day}: ${list.length} articles, need at least ${MIN_NEW} (3 Just in, 6 Must see, 12 Top stories)`);
  const articles = list.map(a => tidy(a, day));

  const age = a => Math.round((Date.parse(day) - Date.parse(a.date)) / 864e5);
  const late = articles.filter(a => age(a) < 0);
  if(late.length) die('dated after ' + day + ':\n' + late.map(a => `  "${a.headline}" (${a.date})`).join('\n'));
  const stale = articles.slice(0, NOW).filter(a => age(a) > NOW_DAYS);
  if(stale.length) die(`the first ${NOW} stories ("Just in") must be reported within ${NOW_DAYS} days of ${day}:\n` +
    stale.map(a => `  "${a.headline}" (${a.date})`).join('\n') + '\nmove fresher stories to the top');
  const old = articles.filter(a => age(a) > MAX_AGE_DAYS);
  if(old.length) die(`stories must be at most ${MAX_AGE_DAYS} days old:\n` + old.map(a => `  "${a.headline}" (${a.date})`).join('\n'));

  // Same story twice in one day, or a lead source already used on an earlier day.
  const ids = new Set();
  for(const a of articles){
    if(ids.has(a.id)) die(`duplicate id ${a.id}`);
    ids.add(a.id);
  }
  const seen = new Map();
  for(const f of dayFiles()){
    const d = readDay(f);
    if(d.date === day) continue;
    for(const a of d.articles) for(const s of a.sources) seen.set(s.url, `${d.date} "${a.headline}"`);
  }
  const repeats = articles.filter(a => seen.has(a.sources[0].url));
  if(repeats.length && !process.argv.includes('--allow-repeat')){
    die('already covered (lead source used before):\n' + repeats.map(a => `  "${a.headline}" -> ${seen.get(a.sources[0].url)}`).join('\n') +
        '\nreplace them, or pass --allow-repeat for a genuine follow-up');
  }

  mkdirSync(DAYS, { recursive: true });
  const out = { date: day, generated: new Date().toISOString(), articles };
  writeFileSync(join(DAYS, `${day}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote docs/news/days/${day}.json (${articles.length} articles)`);
  rebuild();
}

const [cmd, arg] = process.argv.slice(2);
const dateFlag = process.argv.indexOf('--date');
if(cmd === 'add'){
  if(!arg) die('usage: node scripts/news.mjs add FILE.json [--date YYYY-MM-DD]');
  add(arg, dateFlag > 0 ? process.argv[dateFlag + 1] : todayET());
} else if(cmd === 'rebuild'){
  rebuild();
} else if(cmd === 'check'){
  for(const f of dayFiles()){ const d = readDay(f); checkDay(d.date, d.articles); }
  console.log(`ok: ${dayFiles().length} days`);
} else {
  die('usage: node scripts/news.mjs add FILE.json [--date YYYY-MM-DD] | rebuild | check');
}
