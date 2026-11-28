#!/usr/bin/env node
// Finds the day's best Krillion answers (docs/krillion/) and rebuilds its index.
//
//   node scripts/krillion.mjs today                      print today's 7 prompts as JSON
//   node scripts/krillion.mjs probe FILE.json [--date D]  grade candidates, write days/DATE.json
//   node scripts/krillion.mjs reprobe [DATE]              re-grade today's day file against the grader now
//   node scripts/krillion.mjs try p1 cry umiak ...       what these inputs are worth, printed only
//   node scripts/krillion.mjs sweep p7 krai [--limit N]  walk a seed's near-misses to find new answers
//   node scripts/krillion.mjs across kray kris ...       one word against all 7, with coverage
//   node scripts/krillion.mjs hunt SEED... [--words F] [--budget N]   a word covering several prompts
//   node scripts/krillion.mjs rebuild                     rebuild docs/krillion/index.json from days/
//   node scripts/krillion.mjs check                       validate every day file
//   node scripts/krillion.mjs selfcheck                   run the scoring logic on fixtures, no network
//
// FILE is {"p1": ["durian", "rambutan", ...], "p2": [...], ...} -- one candidate
// list per prompt id, ordered common to obscure. Claude writes it; see
// scripts/krillion-routine.md.
//
// krillion.io grades a single answer at POST /api/submit and hands back a signed
// receipt. It keeps no server-side state about the attempt, so a throwaway
// playerId/runId grades any word without touching a real run -- that is what
// makes this possible at all. Only the receipt the player presents at the end
// counts, and we never present one: nothing here plays the game or submits a
// score, it only reads the grader.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/krillion');
const DAYS = join(OUT, 'days');
const INDEX = join(OUT, 'index.json');
const API = 'https://krillion.io/api';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Their tiers, worst to best. score comes from the API; this is for ordering
// and for the page's labels.
const TIERS = ['plankton', 'schooler', 'rare', 'deepcut', 'krillion'];
const TIER_LABEL = { plankton:'Plankton', schooler:'Schooler', rare:'Rare', deepcut:'Deep Cut', krillion:'One in a Krillion' };

// Be a polite guest: one answer at a time, a gap between them, and back off
// hard the moment they push back. A day is ~7 x 40 answers, so this is a few
// minutes of one-at-a-time traffic, not a flood.
const GAP_MS = 700;
const MAX_RETRIES = 3;

function die(msg){ console.error('error: ' + msg); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// New York time: the dive resets at 05:00Z, which is midnight there.
function todayET(){
  return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
}

async function getToday(){
  const res = await fetch(`${API}/today`, { headers:{ 'Accept':'application/json' } });
  if(!res.ok) die(`GET /today returned ${res.status}`);
  const day = await res.json();
  if(!DAY_RE.test(day.date || '') || !Array.isArray(day.prompts) || !day.prompts.length) die('GET /today gave a shape we do not understand');
  return day;
}

// One graded answer. Returns null when they rate-limit us past our retries, so
// the caller can stop the run rather than write a half-probed day as if it were
// the real best.
//
// previewCorrection is the whole game here. With it ON, a near-miss comes back
// {accepted:false, correction:"Cupuaçu"} -- no score, just the suggestion the
// site would offer you. With it OFF, that same near-miss comes back accepted
// and scored at the corrected answer's full value. So preview=true is for
// asking "what does this correct to?", and preview=false is for scoring, which
// is what probing wants: a typo that scores 85 really is worth 85.
async function grade(date, promptId, answer, preview = false){
  for(let attempt = 0; attempt <= MAX_RETRIES; attempt++){
    let res;
    try {
      res = await fetch(`${API}/submit`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          date, promptId, answer,
          previewCorrection: preview,
          playerId: crypto.randomUUID(),
          runId: crypto.randomUUID(),
        }),
      });
    } catch(e){
      if(attempt === MAX_RETRIES) return null;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if(res.status === 429 || res.status >= 500){
      if(attempt === MAX_RETRIES) return null;
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if(res.status === 400) return { answer, accepted:false, tier:null, score:0, correction:null };
    if(!res.ok) return null;
    const r = await res.json();
    return {
      answer: r.answer || answer,
      accepted: r.accepted === true,
      tier: r.accepted ? (r.tier || null) : null,
      score: Number(r.score) || 0,
      correction: r.correction || null,
    };
  }
  return null;
}

// The pick: highest score among the answers they actually accepted. Ties go to
// the earlier candidate, which is the more ordinary word -- a tie means the
// obscurity bought nothing, so take the one a person would believe.
function best(tried){
  let top = null;
  for(const t of tried){
    if(!t.accepted) continue;
    if(!top || t.score > top.score) top = t;
  }
  return top;
}

function rankOf(tier){ const i = TIERS.indexOf(tier); return i < 0 ? -1 : i; }

// The bar a universal word has to clear: 420 points from the one input. That
// is a usable run -- five Deep Cuts answer for 425 on their own -- and it is
// the number the day is judged against. Coverage and deep cuts are reported
// beside it because they say WHY a word missed, but they do not rank: a word
// is worth what it scores.
const BAR = { total: 420 };
function clearsBar(u){ return u.total >= BAR.total; }

// Higher total wins. A tie goes to the word that leaves fewer prompts blank,
// then to the shorter word -- the one you can actually type in 25 seconds.
function betterUniversal(a, b){
  if(!b) return true;
  if(a.total !== b.total) return a.total > b.total;
  if(a.covered !== b.covered) return a.covered > b.covered;
  if(a.input.length !== b.input.length) return a.input.length < b.input.length;
  return a.input.toLowerCase() < b.input.toLowerCase();
}

// One word to type at all seven prompts. A candidate only counts if it was
// tried on every prompt -- a word tested on six says nothing about the
// seventh.
function bestUniversal(prompts){
  if(!Array.isArray(prompts) || !prompts.length) return null;
  const byInput = new Map();
  for(const p of prompts){
    for(const t of p.tried || []){
      const key = String(t.input ?? '').trim().toLowerCase();
      if(!key) continue;
      if(!byInput.has(key)) byInput.set(key, new Map());
      const per = byInput.get(key);
      // The same input twice on one prompt is a duplicate reading, not two
      // prompts covered; keep the better one and never double-count the id.
      if(!per.has(p.id) || (t.score || 0) > (per.get(p.id).score || 0)) per.set(p.id, t);
    }
  }
  let top = null;
  for(const [key, per] of byInput){
    if(per.size !== prompts.length) continue;
    const rows = prompts.map(p => per.get(p.id));
    const total = rows.reduce((n, t) => n + (t.score || 0), 0);
    if(total <= 0) continue;
    const input = rows.find(t => t.input)?.input ?? key;
    const cand = {
      input,
      total,
      covered: rows.filter(t => t.accepted).length,
      deepcuts: rows.filter(t => t.accepted && rankOf(t.tier) >= rankOf('deepcut')).length,
      prompts: prompts.map((p, i) => ({
        id: p.id,
        answer: rows[i].answer ?? null,
        accepted: rows[i].accepted === true,
        tier: rows[i].tier ?? null,
        score: rows[i].score || 0,
      })),
    };
    cand.clearsBar = clearsBar(cand);
    if(betterUniversal(cand, top)) top = cand;
  }
  return top;
}

async function probe(file, dateArg){
  if(!existsSync(file)) die(`no such file: ${file}`);
  let cands;
  try { cands = JSON.parse(readFileSync(file, 'utf8')); } catch(e){ die(`${file} is not JSON: ${e.message}`); }
  if(!cands || typeof cands !== 'object' || Array.isArray(cands)) die('FILE must be an object of promptId -> [answers]');
  await gradeAll(cands, dateArg);
}

// Re-grade every input a day file already tried, and rewrite it. The grader is
// not a fixed oracle: krillion.io tightened its spelling repair overnight on
// 2026-11-28, and the word published at 00:14 that morning was worth 465 points
// then and 215 by breakfast. Numbers measured hours before anyone plays have to
// be re-measured, not trusted.
async function reprobe(dateArg){
  const date = dateArg || todayET();
  const file = join(DAYS, `${date}.json`);
  if(!existsSync(file)) die(`no day file for ${date}; run a probe first`);
  const old = JSON.parse(readFileSync(file, 'utf8'));

  // Seven requests answer the only question that matters: is the word we
  // published still worth what we said? Re-grading the whole pool to find that
  // out would be 270 requests to someone else's server for a day that is
  // usually fine.
  if(old.universal){
    let total = 0;
    for(const e of old.universal.prompts){
      const r = await grade(date, e.id, old.universal.input);
      if(r === null) die('krillion.io stopped answering; the day file is untouched');
      total += r.score || 0;
      await sleep(GAP_MS);
    }
    if(total === old.universal.total){
      console.log(`${date}: "${old.universal.input}" is still ${total} pts; nothing to re-grade`);
      return;
    }
    console.log(`${date}: "${old.universal.input}" was ${old.universal.total} pts and is now ${total}; re-grading the day`);
  }

  const cands = {};
  for(const p of old.prompts || []){
    cands[p.id] = (p.tried || []).map(t => t.input).filter(a => typeof a === 'string' && a.trim());
  }
  const thin = Object.entries(cands).filter(([, l]) => !l.length).map(([id]) => id);
  if(thin.length) die(`${date} has no recorded inputs for ${thin.join(', ')}; it predates input tracking, so there is nothing to re-grade`);
  const out = await gradeAll(cands, date);
  const was = old.universal, now = out.universal;
  console.log(`was: ${was ? `${was.input} ${was.total}pts ${was.covered}/7` : 'no word'} (${old.probedAt})`);
  console.log(`now: ${now ? `${now.input} ${now.total}pts ${now.covered}/7` : 'no word'}`);
  // Re-grading only re-scores words this day already tried; it cannot find the
  // word the new grader likes. Today's pool fell to 260 while a fresh hunt
  // found 390, so say out loud that a human should go looking.
  if(now && !clearsBar(now)) console.log(`${now.total} is under the ${BAR.total} bar -- the best word in this day's pool no longer clears it; a fresh hunt may beat it`);
}

async function gradeAll(cands, dateArg){
  const day = await getToday();
  const date = dateArg || day.date;
  if(date !== day.date) die(`asked for ${date} but krillion.io is serving ${day.date}; the dive resets at midnight ET`);

  const missing = day.prompts.filter(p => !Array.isArray(cands[p.id]) || !cands[p.id].length);
  if(missing.length) die(`no candidates for ${missing.map(p => p.id).join(', ')}`);

  const prompts = [];
  for(const p of day.prompts){
    // Same word twice is a wasted request; keep the first spelling of each.
    const seen = new Set();
    const list = cands[p.id].filter(a => typeof a === 'string' && a.trim())
      .map(a => a.trim())
      .filter(a => { const k = a.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });
    const tried = [];
    for(const a of list){
      const r = await grade(date, p.id, a);
      if(r === null) die(`krillion.io stopped answering while probing ${p.id} ("${a}"); nothing written`);
      // What you typed, not what the grader repaired it to. The whole
      // one-word method lives in the input: "bonos" repairs to a different
      // real answer on each prompt, and storing only "Mono almond" loses it.
      tried.push({ input: a, ...r });
      process.stderr.write(`${p.id} ${String(r.score).padStart(3)} ${r.accepted ? (r.tier||'?') : 'rejected'}  ${a}\n`);
      await sleep(GAP_MS);
    }
    const top = best(tried);
    if(!top) die(`every candidate for ${p.id} was rejected; the list needs real answers, not spelling variants`);
    tried.sort((a, b) => b.score - a.score);
    prompts.push({ id:p.id, text:p.text, best:top, tried });
  }

  mkdirSync(DAYS, { recursive:true });
  const out = {
    date,
    dayNumber: day.dayNumber ?? null,
    probedAt: new Date().toISOString(),
    total: prompts.reduce((n, p) => n + p.best.score, 0),
    universal: bestUniversal(prompts),
    prompts,
  };
  writeFileSync(join(DAYS, `${date}.json`), JSON.stringify(out, null, 2) + '\n');
  rebuild();
  console.log(`${date}: ${out.total}/700  ` + prompts.map(p => `${p.best.score}`).join(' '));
  return out;
}

function dayFiles(){
  if(!existsSync(DAYS)) return [];
  return readdirSync(DAYS).filter(f => DAY_RE.test(f.replace(/\.json$/, '')) && f.endsWith('.json')).sort().reverse();
}

function rebuild(){
  const days = dayFiles().map(f => {
    const d = JSON.parse(readFileSync(join(DAYS, f), 'utf8'));
    // word/tier are the day's single best answer, for the small box on the home
    // page -- which reads index.json only, so it must not need a day file too.
    const top = best(d.prompts.map(p => p.best));
    return {
      date:d.date, dayNumber:d.dayNumber, total:d.total,
      // The day's word is the one input you type at all seven prompts. Only
      // a day with no universal block falls back to its best single answer,
      // which is what every day before this feature has.
      word: d.universal ? d.universal.input : (top ? top.answer : null),
      tier: d.universal ? null : (top ? top.tier : null),
      universal: d.universal ? { input:d.universal.input, total:d.universal.total, covered:d.universal.covered } : null,
      tiers:d.prompts.map(p => p.best.tier),
    };
  });
  mkdirSync(OUT, { recursive:true });
  writeFileSync(INDEX, JSON.stringify({ updated:new Date().toISOString(), days }, null, 2) + '\n');
  console.log(`index: ${days.length} day(s)`);
}

function check(){
  const files = dayFiles();
  if(!files.length) die('no day files');
  let bad = 0;
  for(const f of files){
    const d = JSON.parse(readFileSync(join(DAYS, f), 'utf8'));
    const p = [];
    if(!DAY_RE.test(d.date || '')) p.push('date');
    if(!Array.isArray(d.prompts) || d.prompts.length !== 7) p.push('prompts (want 7)');
    for(const q of d.prompts || []){
      if(!q.best || !q.best.accepted) p.push(`${q.id}: best is not an accepted answer`);
      else if(rankOf(q.best.tier) < 0) p.push(`${q.id}: unknown tier ${q.best.tier}`);
      if(Array.isArray(q.tried) && q.tried.some(t => t.accepted && t.score > (q.best?.score ?? 0))) p.push(`${q.id}: best is not the top score`);
    }
    if(d.universal){
      const u = d.universal;
      if(!u.input) p.push('universal: no input word');
      if(!Array.isArray(u.prompts) || u.prompts.length !== 7) p.push('universal: wants 7 prompt scores');
      else {
        const sum = u.prompts.reduce((n, t) => n + (t.score || 0), 0);
        if(sum !== u.total) p.push(`universal: total ${u.total} but the parts sum to ${sum}`);
        const cov = u.prompts.filter(t => t.accepted).length;
        const dc = u.prompts.filter(t => t.accepted && rankOf(t.tier) >= rankOf('deepcut')).length;
        if(cov !== u.covered) p.push(`universal: covered ${u.covered} but ${cov} were accepted`);
        if(u.deepcuts !== undefined && dc !== u.deepcuts) p.push(`universal: deepcuts ${u.deepcuts} but ${dc} are deep cuts or better`);
      }
    }
    if(p.length){ bad++; console.error(`${f}: ${p.join('; ')}`); }
  }
  if(bad) die(`${bad} day file(s) failed`);
  console.log(`${files.length} day file(s) ok`);
}

// The only logic here worth a test is the pick, and it needs no network.
function selfcheck(){
  const cases = [
    { name:'takes the top accepted score',
      in:[{answer:'durian',accepted:true,score:10},{answer:'cupuacu',accepted:true,score:85},{answer:'soursop',accepted:true,score:60}],
      want:'cupuacu' },
    { name:'ignores rejected words however they score',
      in:[{answer:'xyzzy',accepted:false,score:0},{answer:'rambutan',accepted:true,score:60}],
      want:'rambutan' },
    { name:'ties go to the earlier, more ordinary word',
      in:[{answer:'soursop',accepted:true,score:60},{answer:'rambutan',accepted:true,score:60}],
      want:'soursop' },
    { name:'all rejected gives nothing to publish',
      in:[{answer:'aaa',accepted:false,score:0}],
      want:null },
  ];
  let bad = 0;
  for(const c of cases){
    const got = best(c.in);
    const name = got ? got.answer : null;
    if(name !== c.want){ bad++; console.error(`FAIL ${c.name}: wanted ${c.want}, got ${name}`); }
  }
  if(rankOf('deepcut') <= rankOf('rare')) { bad++; console.error('FAIL tier order: deepcut should outrank rare'); }
  if(rankOf('nonsense') !== -1) { bad++; console.error('FAIL tier order: unknown tier should be -1'); }
  const e = edits('krai');
  if(!e.includes('kray')) { bad++; console.error('FAIL edits: substitution missing (kray)'); }
  if(!e.includes('kra')) { bad++; console.error('FAIL edits: deletion missing (kra)'); }
  if(!e.includes('krais')) { bad++; console.error('FAIL edits: insertion missing (krais)'); }
  if(!e.includes('kria')) { bad++; console.error('FAIL edits: transposition missing (kria)'); }
  if(e.includes('krai')) { bad++; console.error('FAIL edits: should not include the word itself'); }
  if(e.some(w => w.length <= 2)) { bad++; console.error('FAIL edits: stubs shorter than 3 should be dropped'); }
  if(shuffled([1,2,3,4,5], 7).join() !== shuffled([1,2,3,4,5], 7).join()) { bad++; console.error('FAIL shuffled: not deterministic'); }
  if(shuffled([1,2,3,4,5], 7).slice().sort().join() !== '1,2,3,4,5') { bad++; console.error('FAIL shuffled: lost or duplicated items'); }
  const up = (id, tried) => ({ id, tried });
  const uni = bestUniversal([
    up('p1',[{input:'bonos',answer:'Mono almond',accepted:true,score:85},{input:'durian',answer:'Durian',accepted:true,score:10}]),
    up('p2',[{input:'bonos',answer:'Monos',accepted:true,score:85},{input:'durian',answer:null,accepted:false,score:0}]),
  ]);
  if(!uni || uni.input !== 'bonos'){ bad++; console.error(`FAIL universal: wanted bonos, got ${uni && uni.input}`); }
  if(uni && uni.total !== 170){ bad++; console.error(`FAIL universal: wanted 170, got ${uni.total}`); }
  if(uni && uni.covered !== 2){ bad++; console.error(`FAIL universal: wanted covered 2, got ${uni.covered}`); }
  // A word nobody tried on p2 cannot be the one word for p1 AND p2.
  const partial = bestUniversal([
    up('p1',[{input:'zzz',answer:'Zzz',accepted:true,score:100}]),
    up('p2',[{input:'qqq',answer:'Qqq',accepted:true,score:85}]),
  ]);
  if(partial !== null){ bad++; console.error(`FAIL universal: a word missing from a prompt should not win, got ${partial.input}`); }
  // Ties go to the shorter word -- less to type at a 25-second prompt.
  const tie = bestUniversal([up('p1',[{input:'longer',answer:'A',accepted:true,score:60},{input:'abc',answer:'A',accepted:true,score:60}])]);
  if(!tie || tie.input !== 'abc'){ bad++; console.error(`FAIL universal: tie should take the shorter word, got ${tie && tie.input}`); }
  // Repaired spellings are not inputs: an old day file has nothing to offer.
  const legacy = bestUniversal([up('p1',[{answer:'Cupuacu',accepted:true,score:85}])]);
  if(legacy !== null){ bad++; console.error('FAIL universal: a file with no input words should yield nothing'); }
  // The bar is 420 points from one input, and the pick is the highest total.
  const row = (input, score, tier) => ({ input, answer:input, accepted: score > 0, tier: score > 0 ? tier : null, score });
  const seven = [1,2,3,4,5,6,7].map(n => ({
    id:`p${n}`,
    tried:[
      row('alpha', n <= 5 ? 85 : 30, n <= 5 ? 'deepcut' : 'schooler'),
      row('beta',  n <= 6 ? 85 : 0,  'deepcut'),
    ],
  }));
  const picked = bestUniversal(seven);
  if(!picked || picked.input !== 'beta'){ bad++; console.error(`FAIL pick: wanted beta (510), got ${picked && picked.input}`); }
  if(picked && picked.total !== 510){ bad++; console.error(`FAIL pick: wanted total 510, got ${picked.total}`); }
  if(picked && (picked.covered !== 6 || picked.deepcuts !== 6)){ bad++; console.error(`FAIL pick: wanted 6 covered / 6 deepcuts, got ${picked.covered}/${picked.deepcuts}`); }
  // A tie on points goes to the word that leaves fewer prompts blank.
  const tied = bestUniversal([1,2,3,4,5,6,7].map(n => ({ id:`p${n}`, tried:[
    row('wide', n <= 6 ? 60 : 60, 'rare'),
    row('deep', n <= 4 ? 105 : 0, 'krillion'),
  ]})));
  if(!tied || tied.input !== 'wide'){ bad++; console.error(`FAIL tie: 420 with 7 covered should beat 420 with 4, got ${tied && tied.input}`); }
  if(!clearsBar({total:420})){ bad++; console.error('FAIL bar: exactly 420 should clear'); }
  if(clearsBar({total:419})){ bad++; console.error('FAIL bar: 419 should not clear'); }
  if(!clearsBar({total:455})){ bad++; console.error('FAIL bar: bonos at 455 should clear'); }
  // Rare is not a deep cut. Seven Rare answers answer every prompt and still
  // miss the bar -- without this case, lowering the tier threshold to 'rare'
  // passes the whole suite.
  const rare = bestUniversal([1,2,3,4,5,6,7].map(n => ({ id:`p${n}`, tried:[row('gamma', n <= 5 ? 60 : 30, n <= 5 ? 'rare' : 'schooler')] })));
  if(!rare || rare.deepcuts !== 0){ bad++; console.error(`FAIL tier: five Rare answers are 0 deep cuts, got ${rare && rare.deepcuts}`); }
  if(rare && rare.clearsBar !== false){ bad++; console.error('FAIL bar: 360 points should not clear 420'); }
  // Krillion outranks Deep Cut and must count toward the five.
  const kril = bestUniversal([1,2,3,4,5,6,7].map(n => ({ id:`p${n}`, tried:[row('delta', n <= 5 ? 100 : 30, n <= 5 ? 'krillion' : 'schooler')] })));
  if(!kril || kril.deepcuts !== 5){ bad++; console.error(`FAIL tier: five Krillions are 5 deep-cuts-or-better, got ${kril && kril.deepcuts}`); }
  if(kril && kril.clearsBar !== true){ bad++; console.error('FAIL bar: 560 points should clear 420'); }
  if(bad) die(`${bad} check(s) failed`);
  console.log(`selfcheck: ${cases.length + 29} checks ok`);
}

// What a handful of raw inputs are worth, printed and not written anywhere.
// The grader runs with previewCorrection on, so what it hands back is the
// corrected answer -- which is the point: a short input that corrects onto a
// long one is worth far more at a 25-second prompt than the long one is.
async function tryWords(promptId, words){
  if(!promptId || !words.length) die('try needs a prompt id and at least one word');
  const day = await getToday();
  const p = day.prompts.find(q => q.id === promptId);
  if(!p) die(`${promptId} is not a prompt today (have ${day.prompts.map(q => q.id).join(', ')})`);
  console.log(p.text + '\n');
  for(const w of words){
    const r = await grade(day.date, promptId, w);
    if(r === null) die('krillion.io stopped answering');
    const moved = r.accepted && r.answer.toLowerCase() !== w.toLowerCase();
    // Rejected is the interesting case: ask what the site would have suggested,
    // since a word with no suggestion at all is a different kind of dead end
    // from one that was simply a letter off.
    let note = '';
    if(r.accepted) note = moved ? '-> ' + r.answer : '';
    else {
      await sleep(GAP_MS);
      const sug = await grade(day.date, promptId, w, true);
      note = sug && sug.correction ? 'rejected (suggests ' + sug.correction + ')' : 'rejected';
    }
    console.log(`${String(r.score).padStart(3)}  ${w.padEnd(22)} ${note}`);
    await sleep(GAP_MS);
  }
}

// Every string one edit away from `word`: substitutions, deletions, insertions
// and transpositions. Pure, so selfcheck can hold it to account.
function edits(word){
  const a = 'abcdefghijklmnopqrstuvwxyz';
  const out = new Set();
  for(let i = 0; i < word.length; i++){
    out.add(word.slice(0, i) + word.slice(i + 1));
    for(const c of a) out.add(word.slice(0, i) + c + word.slice(i + 1));
    if(i) out.add(word.slice(0, i - 1) + word[i] + word[i - 1] + word.slice(i + 1));
  }
  for(let i = 0; i <= word.length; i++) for(const c of a) out.add(word.slice(0, i) + c + word.slice(i));
  out.delete(word);
  return [...out].filter(w => w.length > 2);
}

// Deterministic shuffle, so a sweep that gets interrupted and re-run covers the
// same ground in the same order instead of re-rolling a fresh random sample.
function shuffled(list, seed){
  let x = seed >>> 0 || 1;
  const a = list.slice();
  for(let i = a.length - 1; i > 0; i--){
    x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The correction field is an oracle: ask with previewCorrection ON and a
// near-miss tells you the real answer it was near, including answers you would
// never have thought to try (krei -> Kreis). So walk the edit neighbourhood of
// words we already know, collect what comes back, and score whatever is new.
async function sweep(promptId, seeds, limit){
  if(!promptId || !seeds.length) die('sweep needs a prompt id and at least one seed word');
  const day = await getToday();
  const p = day.prompts.find(q => q.id === promptId);
  if(!p) die(`${promptId} is not a prompt today`);
  console.log(p.text);

  const known = new Set(seeds.map(w => w.toLowerCase()));
  const pool = shuffled([...new Set(seeds.flatMap(edits))].filter(w => !known.has(w)), 0x5eed);
  const budget = Math.min(limit, pool.length);
  console.log(`${pool.length} neighbours of ${seeds.length} seed(s); asking about ${budget}\n`);

  const found = new Map();  // corrected answer -> the input that revealed it
  for(let i = 0; i < budget; i++){
    const w = pool[i];
    const r = await grade(day.date, promptId, w, true);
    if(r === null) die(`krillion.io stopped answering after ${i} of ${budget}`);
    const c = r.correction;
    if(c && !known.has(c.toLowerCase()) && !found.has(c)){
      found.set(c, w);
      process.stderr.write(`  ${w} -> ${c}\n`);
    }
    await sleep(GAP_MS);
  }

  if(!found.size){ console.log('no answers found that the seeds did not already name'); return; }
  console.log(`\nscoring ${found.size} new answer(s)`);
  const scored = [];
  for(const [answer, via] of found){
    const r = await grade(day.date, promptId, answer);
    if(r === null) die('krillion.io stopped answering while scoring');
    scored.push({ answer: r.answer, score: r.score, tier: r.tier, via });
    await sleep(GAP_MS);
  }
  scored.sort((a, b) => b.score - a.score);
  console.log('');
  for(const s of scored) console.log(`${String(s.score).padStart(3)}  ${(s.tier||'rejected').padEnd(9)} ${s.answer.padEnd(24)} (via ${s.via})`);
}

// One word against all seven prompts. The grader checks an answer against the
// prompt it was sent to, so the same input can repair to a different real
// answer per prompt -- which is the only way one word could ever cover a whole
// dive. This counts how many it actually covers.
async function across(words){
  if(!words.length) die('across needs at least one word');
  const day = await getToday();
  for(const w of words){
    const row = [];
    let covered = 0, points = 0;
    for(const p of day.prompts){
      const r = await grade(day.date, p.id, w);
      if(r === null) die('krillion.io stopped answering');
      if(r.accepted){
        covered++; points += r.score;
        row.push(`${p.id}:${r.score}${r.answer.toLowerCase() !== w.toLowerCase() ? '(' + r.answer + ')' : ''}`);
      } else {
        await sleep(GAP_MS);
        const sug = await grade(day.date, p.id, w, true);
        row.push(`${p.id}:${sug && sug.correction ? '~' + sug.correction : '-'}`);
      }
      await sleep(GAP_MS);
    }
    console.log(`${w.padEnd(12)} ${covered}/7  ${String(points).padStart(3)}pts  ${row.join('  ')}`);
  }
}

// Hunt for one word that covers several prompts at once.
//
// Blind guessing is hopeless: a word only covers a prompt if it is about a
// letter from one of that prompt's answers, and the hard prompts have small
// answer sets. So the pool is not random -- it is the edit neighbourhood of
// answers we already know, which is exactly the set of strings that stand any
// chance. Then a gate: test the hardest prompts first and abandon a candidate
// the moment it clears none of them, which costs a few requests instead of
// seven. --order puts the tight prompts first; --gate says how many of those
// a candidate gets before it has to show something.
// A word list from a plain file or markdown: one candidate per line. Prose
// lines are skipped by length -- a heading like "names and words to check" is
// five words, a candidate is one or two.
function wordsFromFile(file){
  if(!existsSync(file)) die(`no such file: ${file}`);
  return readFileSync(file, 'utf8').split('\n')
    .map(l => l.replace(/^[-*>#\s]+/, '').trim())
    .filter(l => l && l.split(/\s+/).length <= 2 && !l.endsWith(':'));
}

async function hunt(seeds, budget, order, gateSize, listed){
  if(!seeds.length && !listed.length) die('hunt needs seed answers or a --words file');
  const day = await getToday();
  const ids = order.length ? order : day.prompts.map(q => q.id);
  const unknown = ids.filter(id => !day.prompts.some(q => q.id === id));
  if(unknown.length) die(`not prompts today: ${unknown.join(', ')}`);
  // The words you asked for go first and are never gated away unseen -- a list
  // you wrote is a question you want answered, not a lottery ticket. The
  // scavenged pool is everything one edit from a seed, which is the only part
  // of string space that can cover a tight prompt at all.
  const named = [...new Set([...listed, ...seeds].map(w => w.trim()).filter(Boolean))];
  const scavenged = shuffled([...new Set(seeds.flatMap(edits))].filter(w => !named.includes(w)), 0x51e3);
  const pool = [...named, ...scavenged];
  console.log(`${named.length} word(s) you named + ${scavenged.length} scavenged; order ${ids.join(' ')}; gate ${gateSize}; budget ${budget} requests\n`);

  let spent = 0, best = 0, bestPts = 0;
  for(const w of pool){
    if(spent >= budget) break;
    let cov = 0, pts = 0;
    const hits = [];
    for(let i = 0; i < ids.length; i++){
      if(spent >= budget) break;
      // Cleared nothing in the gate: this one cannot be the word. Words you
      // named are exempt -- they get all seven either way.
      if(i === gateSize && cov === 0 && !named.includes(w)) break;
      const r = await grade(day.date, ids[i], w);
      spent++;
      if(r === null) die(`krillion.io stopped answering after ${spent} requests`);
      if(r.accepted){ cov++; pts += r.score; hits.push(`${ids[i]}:${r.score}(${r.answer})`); }
      await sleep(GAP_MS);
    }
    // Points, not coverage, are what the bar is in -- a 5/7 worth 400 beats a
    // 6/7 worth 325, and reporting on coverage alone hides it.
    if(cov > best || pts > bestPts || named.includes(w)){
      if(cov > best) best = cov;
      if(pts > bestPts) bestPts = pts;
      console.log(`${String(cov)}/7  ${String(pts).padStart(3)}pts  ${w.padEnd(12)} ${hits.join('  ') || '-'}`);
    }
  }
  console.log(`\nspent ${spent} requests; best coverage ${best}/7; best ${bestPts} pts`);
}

const [cmd, ...rest] = process.argv.slice(2);
const dateFlag = (() => { const i = rest.indexOf('--date'); return i < 0 ? null : rest[i + 1]; })();
// Each sweep word is a request to someone else's server; keep the default
// modest and make a big run something you ask for on purpose.
const limitFlag = (() => { const i = rest.indexOf('--limit'); return i < 0 ? 120 : Math.max(1, Number(rest[i + 1]) || 120); })();
const budgetFlag = (() => { const i = rest.indexOf('--budget'); return i < 0 ? 300 : Math.max(1, Number(rest[i + 1]) || 300); })();
const gateFlag = (() => { const i = rest.indexOf('--gate'); return i < 0 ? 3 : Math.max(1, Number(rest[i + 1]) || 3); })();
const orderFlag = (() => { const i = rest.indexOf('--order'); return i < 0 ? [] : String(rest[i + 1] || '').split(',').filter(Boolean); })();
const wordsFlag = (() => { const i = rest.indexOf('--words'); return i < 0 ? null : rest[i + 1]; })();
if(cmd === 'today') console.log(JSON.stringify(await getToday(), null, 2));
else if(cmd === 'probe') await probe(rest[0] || die('probe needs a FILE.json'), dateFlag);
else if(cmd === 'reprobe') await reprobe(dateFlag || (rest[0] && DAY_RE.test(rest[0]) ? rest[0] : null));
else if(cmd === 'try') await tryWords(rest[0], rest.slice(1));
else if(cmd === 'across') await across(rest);
else if(cmd === 'hunt') await hunt(rest.filter(w => !w.startsWith('--') && w !== String(budgetFlag) && w !== orderFlag.join(',') && w !== String(gateFlag) && w !== wordsFlag), budgetFlag, orderFlag, gateFlag, wordsFlag ? wordsFromFile(wordsFlag) : []);
else if(cmd === 'sweep') await sweep(rest[0], rest.slice(1).filter(w => !w.startsWith('--') && w !== String(limitFlag)), limitFlag);
else if(cmd === 'rebuild') rebuild();
else if(cmd === 'check') check();
else if(cmd === 'selfcheck') selfcheck();
else die(`usage: krillion.mjs today | probe FILE.json [--date D] | reprobe [DATE] | try PROMPT WORD... | sweep PROMPT SEED... [--limit N] | rebuild | check | selfcheck  (today ET is ${todayET()})`);
