// Isolated world. Fetches the day's answers from aedinlai.com -- which needs
// host_permissions, not CORS, which is why this half does not run in the page's
// world -- and shows the one that matches whichever prompt is on screen.
//
// Matching is by prompt text, not by round number: the page does not say which
// round it is on anywhere we can trust, but /api/today gives the exact wording
// of all seven, and exactly one of them is on screen at a time.
(() => {
  // www, not the apex: aedinlai.com 301s to www.aedinlai.com, and a redirect
  // across origins fails unless the extension is permitted for the one it
  // lands on. Both are in host_permissions; this just skips the hop.
  const SOURCE = 'https://www.aedinlai.com/krillion';
  const EVENT = 'krillion-deck:today';
  const HOTKEY = 'k';           // with Alt
  const TIER = { plankton:'Plankton', schooler:'Schooler', rare:'Rare', deepcut:'Deep Cut', krillion:'One in a Krillion' };

  let answers = null;           // promptId -> {answer, tier, score}
  let prompts = [];             // [{id, text}]
  let current = null;           // the answer for the prompt on screen

  // Curly apostrophes and collapsed whitespace, so the text from the API and the
  // text rendered on the page compare equal.
  const norm = (s) => String(s).replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

  const el = document.createElement('div');
  el.hidden = true;
  Object.assign(el.style, {
    position: 'fixed', bottom: '14px', left: '14px', zIndex: '2147483647',
    maxWidth: '280px', padding: '9px 12px', borderRadius: '9px',
    background: 'rgba(10,22,40,0.92)', color: '#eaf1fb',
    font: '13px/1.45 ui-sans-serif, system-ui, sans-serif',
    border: '1px solid rgba(190,215,255,0.28)', pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
  });

  function paint(text) {
    el.textContent = text;
    el.hidden = !text;
  }

  function show() {
    if (!current) return paint('');
    paint(`${current.answer}\n${TIER[current.tier] || current.tier} · ${current.score} pts · alt+${HOTKEY} to fill`);
  }

  // Which prompt is on screen. Reads the page text once per call; callers
  // throttle it behind a MutationObserver rather than polling on a timer.
  function sync() {
    if (!answers || !prompts.length) return;
    const page = norm(document.body.innerText || '');
    const hit = prompts.find((p) => p.text && page.includes(norm(p.text)));
    const next = hit ? answers[hit.id] : null;
    if (next === current) return;
    current = next;
    show();
  }

  // React keeps its own copy of an input's value, so assigning .value directly
  // is reverted on the next render. Go through the prototype setter and tell
  // React about it the way a keystroke would.
  function fill(text) {
    const input = document.querySelector('input[placeholder*="answer" i]')
      || document.querySelector('form input[type="text"]')
      || document.querySelector('input[type="text"]');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, text); else input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    return true;
  }

  window.addEventListener(EVENT, async (e) => {
    const day = e.detail;
    if (!day || !Array.isArray(day.prompts)) return;
    prompts = day.prompts;
    try {
      const res = await fetch(`${SOURCE}/days/${day.date}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(String(res.status));
      const published = await res.json();
      // A day file for a different date is worse than none: it would show
      // yesterday's answers against today's prompts.
      if (published.date !== day.date) throw new Error('stale');
      answers = Object.fromEntries(published.prompts.map((p) => [p.id, p.best]));
    } catch {
      answers = null;
      paint('Krillion Deck: no answers published for today.\nTypo repair is still on.');
      setTimeout(() => paint(''), 6000);
      return;
    }
    sync();
  });

  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.key.toLowerCase() !== HOTKEY || !current) return;
    e.preventDefault();
    if (fill(current.answer)) {
      paint(`${current.answer}\nfilled — press enter`);
    }
  });

  const start = () => {
    document.body.appendChild(el);
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; sync(); });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    sync();
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
