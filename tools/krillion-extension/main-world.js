// Runs in the page's own world at document_start, so the page's fetch is ours
// before its bundle ever calls it. Two jobs, both on krillion.io's API:
//
//   /api/submit  previewCorrection -> false. With the flag ON (what the site
//                sends) a near-miss comes back {accepted:false, correction:...}
//                -- it offers you the fix and charges you the seconds to take
//                it. With it OFF the same near-miss is accepted and scored at
//                the corrected answer's full value. Typing "kray" scores Krai's
//                85 either way; this is about the 25-second clock, not points.
//
//   /api/today   copied out and handed to the overlay, which needs the prompt
//                ids and the date and would otherwise have to ask for them
//                again.
//
// Everything is wrapped: if any of it throws, the original fetch still runs and
// the page behaves exactly as it would without the extension installed.
(() => {
  const EVENT = 'krillion-deck:today';
  const original = window.fetch;
  if (!original || original.__krillionDeck) return;

  const urlOf = (input) => {
    try {
      if (typeof input === 'string') return input;
      if (input instanceof URL) return input.href;
      return (input && input.url) || '';
    } catch { return ''; }
  };

  const patched = async function (input, init) {
    let args = [input, init];

    try {
      const url = urlOf(input);

      if (url.includes('/api/submit')) {
        // Only a plain string body is safe to rewrite. A Request object or a
        // stream body is left alone rather than guessed at.
        const body = init && typeof init.body === 'string' ? init.body : null;
        if (body) {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed === 'object' && 'previewCorrection' in parsed) {
            parsed.previewCorrection = false;
            args = [input, { ...init, body: JSON.stringify(parsed) }];
          }
        }
      }
    } catch {
      args = [input, init];
    }

    const res = await original.apply(this, args);

    try {
      if (urlOf(input).includes('/api/today') && res.ok) {
        // clone(), or the page gets a body that has already been read.
        res.clone().json().then((data) => {
          window.dispatchEvent(new CustomEvent(EVENT, { detail: data }));
        }).catch(() => {});
      }
    } catch {}

    return res;
  };

  patched.__krillionDeck = true;
  window.fetch = patched;
})();
