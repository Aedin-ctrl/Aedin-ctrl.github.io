# Krillion Deck

A personal, unpacked Chrome extension for krillion.io. Not published anywhere,
and not part of the site — `tools/` is not served.

It does two things, and they are independent:

**1. Near-miss spellings stop costing you the clock.** `POST /api/submit` takes
a `previewCorrection` flag. The site sends it ON, so a near-miss comes back
`{accepted:false, correction:"Krai"}` — it offers the fix and charges you the
seconds to accept it. The extension flips it OFF, where the same near-miss is
accepted and scored at the corrected answer's full value. `kray` scores Krai's
85 either way; what you save is the round trip, which at 25 seconds a prompt is
the part that actually hurts.

The repair is fuzzy *spelling* matching against real answers, about a letter
out. It is not a synonym table. `kray`, `filke` and `okrugg` repair to Krai,
Fylke and Okrug; `cry`, `folk` and `oak` repair to nothing at all. No single
word answers more than one prompt — that was tested 56 ways and failed 56 times
(see `scripts/krillion-routine.md`).

**2. The day's best answer, next to the prompt it belongs to.** A small box
bottom-left shows the winning answer for whichever prompt is on screen, with its
tier and points. **alt+k** types it into the box; you still press enter.

## Where the answers come from

`https://aedinlai.com/krillion/days/<date>.json`, published by the nightly run
(`scripts/krillion-daily.sh` → `scripts/krillion.mjs probe`). The extension
reads nothing else and sends nothing anywhere.

So the answers only appear once that day's run has published **and** the site has
deployed. Before then the box says so, and the spelling repair still works. To
point it at a local copy instead, change `SOURCE` at the top of `overlay.js`.

## Install

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this folder
3. Open krillion.io. The box appears once the first prompt is up.

Chrome drops unpacked extensions on restart; load it again when that happens.

## How it is put together

| File | World | Why there |
|---|---|---|
| `main-world.js` | MAIN, `document_start` | Has to own `window.fetch` before the site's bundle calls it. The page's fetch only exists in the page's world. |
| `overlay.js` | isolated, `document_idle` | Fetches aedinlai.com, which works here on `host_permissions` and would need CORS in the page's world. |

They talk over a `CustomEvent` on `window`. Every patch is wrapped: if anything
in it throws, the original `fetch` still runs and the page behaves exactly as it
would with the extension uninstalled.

## Known limits

- **Prompt matching is by text.** `/api/today` gives the exact wording and one
  prompt is on screen at a time, so the box finds its answer by looking for that
  wording on the page. A redesign that reworded prompts on screen would break
  the match — the box would go blank rather than show the wrong answer.
- **`fill()` knows about React.** It writes through the prototype's value setter
  and dispatches `input`, because assigning `.value` is reverted on the next
  render. A framework change could break this; the box still shows the answer to
  type by hand.
- **Only the daily dive.** Archive, themed packs and unlimited mode get a
  published day file only for the current daily, so the box stays empty there.

## One thing worth being clear about

The site page is a record of what the grader said. This types answers into a
live scored run, which is a different thing, and other players would call it
cheating. It is unpacked and unlisted for that reason.
