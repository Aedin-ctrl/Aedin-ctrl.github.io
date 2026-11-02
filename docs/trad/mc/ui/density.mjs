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
