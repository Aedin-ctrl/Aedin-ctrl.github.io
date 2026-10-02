# tools

Checks for the site. Nothing here is published — GitHub Pages serves `docs/` only.

```sh
cd tools && npm install          # once
node tools/design-check.mjs      # check docs/, served locally
node tools/design-check.mjs --live
node tools/design-check.mjs --page gatecraft
```

`design-check.mjs` runs axe-core (WCAG 2.0/2.1 A and AA) over every page and exits non-zero if
anything fails, so it can gate a deploy. For contrast failures it prints the offending colour pair
and a suggested replacement in the same hue, aimed at the ratio that pair actually needs — 3:1 for
large text, 4.5:1 for small.

Two things it handles that caught me out:

- **Redirect stubs are skipped.** Twelve directories under `docs/` are leftover redirects to the
  casino site. Auditing them locally silently followed the redirect onto the network and reported
  another site's problems as if they were this repo's.
- **CSP is bypassed for the audit.** `hand-playground` and `meme-match` send a Content-Security-Policy
  that blocks injected scripts, which is correct for the real site and only an obstacle for axe.

Found 26 failures on 2026-10-02, all from three causes: two CSS custom properties with too little
contrast, and one `maximum-scale=1` blocking pinch-zoom. Contrast bugs cluster in a token, so the
fix is usually one line.

Also installed here, all offline and keyless: `colorjs.io` (WCAG + APCA contrast, OKLCH palette
ramps), `@iconify-json/lucide` + `@iconify/utils` (1,929 icons, no network), `svgo`, `sharp`.
