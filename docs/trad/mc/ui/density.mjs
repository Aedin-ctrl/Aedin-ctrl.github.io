/* density.mjs -- make the page a tool rather than an essay.
 *
 * Every explanatory block on the page is real and worth keeping, and none of it
 * should be in the way. This walks the rendered page and folds each `.note`,
 * `.foot` and `.partnote` behind a small info toggle on its own heading, so the
 * prose is one click away instead of occupying a screen.
 *
 * It runs after every render, because the result sections are rebuilt each run.
 * Already-folded blocks are left alone, so re-running is free.
 */

const FOLDABLE = '.note, .foot, .partnote, [data-fold]';

function makeToggle(target, where) {
  const b = document.createElement('button');
  b.className = 'infobtn';
  b.type = 'button';
  b.setAttribute('aria-expanded', 'false');
  b.setAttribute('aria-label', 'show the explanation');
  b.title = 'what this is';
  b.textContent = 'i';
  if (target.dataset.fold) b.title = target.dataset.fold;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = target.hasAttribute('hidden');
    if (open) target.removeAttribute('hidden'); else target.setAttribute('hidden', '');
    b.setAttribute('aria-expanded', String(open));
    /* A part's note sits on the header but LIVES in the group below it. Revealing
       it while the group is shut would show nothing at all, so the group opens. */
    const grp = target.closest('.partbody');
    if (open && grp && grp.hidden) {
      const hdr = grp.previousElementSibling;
      if (hdr && hdr.classList.contains('part')) {
        grp.hidden = false;
        hdr.setAttribute('aria-expanded', 'true');
      }
    }
  });
  if (target.id) b.dataset.for = target.id;
  b.hidden = !target.textContent.trim();
  where.appendChild(b);
  return b;
}

/** Fold one element behind a toggle placed on the nearest sensible heading. */
function fold(el) {
  if (el.dataset.folded === '1') return;
  /* Fold even when EMPTY. Most of these are filled by a later render, and
     skipping them at boot meant they were never folded at all -- the observer
     fires on the children being added, not on the container itself. A button
     over an empty block is hidden by CSS until there is something to show. */
  el.dataset.folded = '1';

  // where the button goes: the section's h3, the part's h2 row, or a stub
  let host = null;
  const sec = el.closest('section');
  if (sec) host = sec.querySelector('h3');
  if (!host) {
    const part = el.previousElementSibling && el.previousElementSibling.classList.contains('part')
      ? el.previousElementSibling : null;
    if (part) host = part;
  }
  if (!host) {
    host = document.createElement('div');
    host.className = 'infostub';
    el.parentNode.insertBefore(host, el);
  }
  el.setAttribute('hidden', '');
  el.classList.add('folded');
  makeToggle(el, host);
}

export function condense(root = document) {
  for (const el of root.querySelectorAll(FOLDABLE)) fold(el);
  collapseParts(root);
  // a toggle for an empty block is noise; hide it until there is content
  for (const b of document.querySelectorAll('.infobtn[data-for]')) {
    const t = document.getElementById(b.dataset.for);
    if (t) b.hidden = !t.textContent.trim();
  }
}

/** Watch for sections rendered later and fold those too. */
export function autoCondense() {
  condense();
  const mo = new MutationObserver((muts) => {
    let touched = false;
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches(FOLDABLE)) { fold(n); touched = true; }
      else if (n.querySelectorAll) { const f = n.querySelectorAll(FOLDABLE); if (f.length) { f.forEach(fold); touched = true; } }
    }
    return touched;
  });
  mo.observe(document.body, { childList: true, subtree: true });
  return mo;
}

/* ---------------------------------------------------------------------------
 * Part 2: the results themselves.
 *
 * Folding the prose was not enough. The full battery is a dozen screens of
 * charts, and arriving at the top of it tells you nothing -- you have to scroll
 * to find out what was even measured. So each numbered part becomes a group you
 * open. The first one is open; the rest are one line each, with a count of what
 * is inside, so the whole run reads as a contents page.
 *
 * Grouping is safe to do once at boot: the `.part` headers and the `<section>`s
 * between them are static markup, and only their contents are rebuilt per run.
 * The charts are viewBox-scaled, so drawing one into a hidden group and opening
 * it later gives the same picture as drawing it on screen.
 * ------------------------------------------------------------------------- */

/* The lab's two result blocks, plus anything that opts in with data-groups
 * (the /trad boards do). */
const GROUPED = '#ideaResults, #results, [data-groups]';

function inventory(body) {
  const c = body.querySelectorAll('svg').length;
  const t = body.querySelectorAll('table').length;
  const m = body.querySelectorAll('.m').length;
  const bits = [];
  if (c) bits.push(c + (c > 1 ? ' charts' : ' chart'));
  if (t) bits.push(t + (t > 1 ? ' tables' : ' table'));
  const g = body.querySelectorAll('.gate').length;
  if (g) bits.push(g + ' gates');
  if (!c && !t && !g && m) bits.push(m + ' figures');
  // a group with nothing to count is still worth labelling, or it reads as broken
  if (!bits.length) {
    const w = body.textContent.trim().split(/\s+/).filter(Boolean).length;
    if (w > 5) bits.push(w + ' words');
  }
  return bits.join(' · ');
}

function setOpen(part, body, open) {
  body.hidden = !open;
  part.setAttribute('aria-expanded', String(open));
  /* Some charts size themselves from their container, and a container inside a
     shut group has no width. Opening one says so, loudly enough for the page
     that drew them to redraw. */
  if (open) part.dispatchEvent(new CustomEvent('partopen', { bubbles: true }));
}

export function collapseParts(root = document) {
  for (const container of root.querySelectorAll(GROUPED)) {
    const parts = [...container.children].filter(el => el.classList.contains('part'));
    parts.forEach((part, i) => {
      let body = part.nextElementSibling;
      if (part.dataset.grouped !== '1') {
        part.dataset.grouped = '1';
        body = document.createElement('div');
        body.className = 'partbody';
        let n = part.nextElementSibling;
        while (n && !n.classList.contains('part')) {
          const next = n.nextElementSibling;
          body.appendChild(n);
          n = next;
        }
        part.parentNode.insertBefore(body, part.nextSibling);

        const count = document.createElement('span');
        count.className = 'pcount';
        const chev = document.createElement('span');
        chev.className = 'chev';
        chev.textContent = '▸';
        part.append(count, chev);
        part.classList.add('fold');
        part.setAttribute('role', 'button');
        part.tabIndex = 0;
        const toggle = () => setOpen(part, body, body.hidden);
        part.addEventListener('click', (e) => {
          // the info button on this same header is not the group toggle
          if (e.target.closest('.infobtn')) return;
          toggle();
        });
        part.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
        setOpen(part, body, i === 0);
      }
      if (body && body.classList.contains('partbody')) {
        part.querySelector('.pcount').textContent = inventory(body);
      }
    });
  }
}
