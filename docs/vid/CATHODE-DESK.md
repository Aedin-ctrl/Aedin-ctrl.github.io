# CATHODE DESK — house style v2.1

**Locked 2026-11-08. This file is the authority. If a build disagrees with this file, the build is wrong.**

> **v2.1 (2026-11-08)** — the pointer holds still instead of drifting, breathes
> while it waits, parks out of the way, and clicks once per typing session
> rather than once per line. See rules 17–20.
>
> **v2.0 (2026-11-08)** — the pointer is a generated track of moves and
> clicks rather than a hand-written keyframe list, and it clicks into a line
> before typing it. See rules 13–16.
>
> **v1.9 (2026-11-08)** — the text rasteriser no longer hides an over-wide
> string, clearance from the box border is enforced, and a scene must clear
> its own props. See rules 9–11.
>
> **v1.8 (2026-11-08)** — generation rules for voxel charts and for the
> pointer, both written as rules rather than as fixes, plus the opening and
> closing click. See *Generation rules*.
>
> **v1.7 (2026-11-08)** — layout is planned against the group box rather than
> nudged against the panel, and a sweep now polices the box border. Speed-ups
> are done with `atempo`, not by re-reading the script.
>
> **v1.6 (2026-11-08)** — the legibility floor is now enforced by a sweep
> instead of being a line in this file that the build quietly ignored, and
> the overlap sweep checks text against graphics, not only against text.
>
> **v1.5 (2026-11-08)** — sampler rebuilt from scratch on the kept layer
> library. Breaks are now uniform by construction, on-screen words appear as
> they are spoken, and "nothing off screen / nothing overlapping" is checked
> by a sweep rather than by eye. See *Pacing*, *Layout* and *Research*.
>
> **v1.4 (2026-11-08)** — the timeline table is now GENERATED from the
> measured narration rather than hand-written, after a trimming filter was
> found to be silently eating the voice's own pauses. See *Pacing*.
>
> **v1.3 (2026-11-08)** — the picture is now hung off measured sentence
> anchors in the narration, and one timeline table feeds the picture, the
> effects and the voice. See *Pacing*.
>
> **v1.2 (2026-11-08)** — motion is no longer ticked at all, and the running
> time follows the script instead of the script being squeezed into a running
> time. See *Motion* and *Pacing*.
>
> **v1.1 (2026-11-08)** — split the single 12fps tick in two, and built the sound.
>
> Nothing else has moved. The palette, the layer order, the type floors and the
> determinism rule are unchanged from v1.0.

One medium, derived from four references (16-Bit Pixel Odyssey, Voxel Diorama,
Win95 Desktop, Phosphor Terminal). It is **not** four styles switched between.
It is one machine:

> A 16-bit program, running in a Win95 window, drawing voxel diagrams,
> photographed off a green-tinted CRT.

Every frame passes through all four layers, in this order, every time. Skipping
a layer to save effort is what makes it stop reading as a real medium.

---

## The four layers (fixed order)

| # | Layer | From | What it owns |
|---|-------|------|--------------|
| 1 | **Chrome** | Win95 | The frame. 2px bevels, navy title bar, group boxes, status bar, dotted arrows, the cursor. |
| 2 | **Screen** | 16-Bit Pixel | What's *inside* the client area. Banded dithered sky, hand-placed pixels, sprites, Press Start 2P lettering. |
| 3 | **Objects** | Voxel | Anything 3D or quantitative. Charts, props, physical things — isometric cube stacks, three-tone faces, AO in the creases. |
| 4 | **Glass** | Phosphor | The finishing pass over the whole composite. Scanlines, bloom, vignette, grain, slight green lift. |

**Buffer:** draw everything at **640×360**, scale ×2 nearest-neighbour to 1280×720.
`imageSmoothingEnabled = false` on every blit. Voxel objects draw into the same
640×360 buffer so they share the pixel grid — never at full res.

---

## Palette (32 colours, closed set)

Do not introduce colours. Mix between these only.

```
CHROME   face #c0c0c0   hi #ffffff   lt #dfdfdf   sh #808080
         dk   #000000   navy #000080  teal #008080

SKY      #140c34 #1e1146 #2c1658 #43206a #632a78
         #8c357c #b8457a #e05c72 #f6806a #ffaa6e #ffd28a

VOXEL    paper #fff4e2  bone #e3d6c0  earth #74432d
         orange #ff8a3d  grass #9fcb55  ice #7fc8e8

PHOSPHOR cyan #7ff9ff   green #6aff8a   red #ff5a4f   gold #ffd27a

INK      #0a0618
```

Voxel faces use exactly three tones: **top ×1.00, front ×0.80, side ×0.64**,
with the reference's tints (`[1.0,0.98,0.93]`, `[0.97,0.95,1.0]`, `[0.92,0.92,1.04]`).

---

## Type

| Face | Use | Minimum |
|------|-----|---------|
| **Press Start 2P** | Pixel headlines, in-screen labels | 8px in buffer (=16px out) |
| **Silkscreen** | Numbers, block tags, counters | 8px / 54px for hero numbers |
| **VT323** | Status line, terminal/log text | 26px |
| **Inter** | Win95 chrome only, hard-thresholded at alpha 120 | 9px |

**Legibility floor (video is watched on a phone).** At 1280×720 out:
headlines ≥ 44px, any label the story depends on ≥ 28px, key numbers ≥ 64px.
In the 640×360 buffer that means ≥22, ≥14, ≥32.

---

## Dither

Bayer 4×4, exactly the reference's matrix. One helper, used for every blend:

```js
const BAYER = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v+0.5)/16);
const bay = (x,y) => BAYER[(y&3)*4 + (x&3)];
const dput = (x,y,c1,c2,a) => put(x, y, a > bay(x,y) ? c2 : c1);
```

Gradients are **always** banded + dithered. Never a smooth `createLinearGradient`
inside the screen area. Chrome bevels are hard 2px, never soft.

---

## Motion

**Two ticks, and they are not interchangeable.**

- **12 fps content tick** — `T = Math.floor(t*12)/12`. Everything *drawn*:
  sprites, dither, typed text, the blink, the status line, and every beat
  boundary. This is what makes it read as a drawn medium.
- **Continuous motion** — `M = t`, not ticked. Everything that *moves
  continuously*: the cursor, voxel drop-in, arrow draw-on, counters settling,
  outline zooms, mosaic block size.

  v1.1 ticked this at 24fps and the voxel drops still visibly stepped. **A cube
  that steps reads as a dropped frame, not as a style.** The pixel grid is
  preserved by the ×2 nearest-neighbour blit, not by quantising time, so there
  is nothing to defend here — let motion run at the display's rate.
- The glass layer may run at full rate (scanline roll, grain).

Drawn content on 2s, movement free — the oldest split in hand-drawn animation,
taken to its end. v1.0 ran everything at 12 and read as a slideshow.
**Do not raise the content tick to fix smoothness** — that is what makes it stop
looking drawn. Loosen the motion instead.

- Positions snap to whole buffer pixels. No sub-pixel drift.
- Voxels **drop in** from above over 0.32s, `H.ease.out`, landing ~0.22s in.
- Chrome opens with **outline-zoom rectangles** (3 trailing wireframes, 0.12 apart).
- Counters tick at most 12×/second and slow as they settle.

## Transitions (the medium's own)

Use these four only, matched to what the story is doing:

| Transition | When |
|---|---|
| **Outline zoom** | Opening a window / entering a new frame |
| **Mosaic** | Changing the scene inside the screen (blocks grow to 16px, then shrink) |
| **V-hold roll** | Jumping to a different screen entirely (+ blanking bar + hum) |
| **Tab click** | Moving between beats of the same topic |

A new beat does **not** automatically mean a new scene. When the next idea
builds on the last, keep it continuous — the label becomes the next heading,
the counter grows into the chart.

**A transition peaks on the frame the content swaps.** Blocks grow on the old
scene and shrink on the new one. Peaking anywhere else turns the second half of
the transition into a hold on content the viewer has already finished with.

---

## Structure of an explainer

1. **Hook ≤ 2s.** A Win95 dialog types the question, then outline-zooms into the title bar. The question lives on in the status line.
2. **Beats every 1–2s.** Something changes. Arrows draw on. Labels land on what they label.
3. **Emphasis on the key moment.** Phosphor flash (boost 1.3–1.45 for ~0.15s) + inverse video + the biggest sound.
4. **Takeaway held ~1s.** A classic message box.

## Changing the speed

To make a finished piece faster or slower, **time-stretch the rendered audio**
(`atempo=1.25`) and scale every time in the timeline by the inverse. That keeps
the performance that was approved and only changes the rate. Re-synthesising at
`--rate=+25%` is a different read, and the uniform breaks stop being uniform.

Scale the **motion durations** too — a bar that took 1.25s to drop should take
1.00s at 1.25×, or it starts overrunning the sentence that triggered it.

## Pacing — write the script first, then the timeline

**`DURATION` is an output, not an input.** Write the narration, synthesise it,
measure each line, choose the gaps, and let the total fall out. Deciding the
running time first and then cramming the script into it produces exactly the
two complaints it earns: the content is too fast and the voice cadence is wrong.

- **Never speed a line up to fit its slot.** Move the slot. A `--rate=+9%` line
  is audibly hurried and it is the first thing anyone notices.
- **Silence is content.** Budget **≥0.6s between lines** and a real hold at the
  end of every beat. The sampler is 45.5s for 29.5s of speech — **35% silence**,
  and it needs all of it.
- Trim the voice where it reads the screen aloud. If the message box already
  says "Low water. Acid. Peroxide.", the voice says something else.
- Place a line so the thing it names is **already on screen or arriving**, never
  several seconds after.

### Anchor the picture to the voice, not to arithmetic

Placing lines by hand arithmetic is how "zero point six" ended up being spoken
**4.3 seconds after** that number finished counting on screen. Do this instead:

1. **One audio file per SENTENCE.** Then the gap between sentences is yours and
   is identical everywhere — uniform by construction rather than whatever the
   synth felt like. (Per-beat renders gave uneven 0.27–0.41s pauses.) Use one
   constant within a beat and a larger one between beats, and assert at build
   time that every measured gap equals one of the two.
2. **Write every sentence to END on the word that triggers its visual** —
   "Honey sits at zero point six.", "Plain water is seven.", "…a trace of
   peroxide." Then the anchor is the end of the sentence.
3. **Get word onsets by transcribing your own audio back.** edge-tts no longer
   emits `WordBoundary` for any voice (checked across four), only
   `SentenceBoundary`. So run the rendered wav through `whisper-cli --max-len 1
   --split-on-word` and read the onsets off that. Match its tokens to your words
   greedily on normalised text and interpolate across runs that don't match —
   it writes "0.6" where the script says "zero point six", so a plain
   token-count comparison fails on every sentence with a number in it.
   **Report the match rate**; this build is 90%.
4. **Measure the real speech end off the waveform.** A boundary's `duration`
   runs to the start of the *next* sentence, so it includes the pause after the
   last word; landing a counter on it is late by the length of that pause. Take
   the last 10ms window above threshold inside the span instead.
5. Feed those anchors into **one timeline table** that the picture, the effects
   and the narration placement all read. Three separate lists of numbers is how
   they drift apart. **Generate that table from the measurements**; the moment
   it is hand-maintained it starts disagreeing with the audio.

**Never let a filter touch the voice's internal pauses.** `silenceremove` with
`stop_periods=-1` means "remove every period of silence *anywhere*", not "trim
the tail". It squeezed each ~0.41s inter-sentence pause down to 0.25s, so by the
end of a 16s beat the audio ran **1.17s ahead** of the sentence offsets the TTS
had reported — and those offsets were what the picture was hung off. Every
sentence after the first drifted, progressively.

To trim lead and tail only, reverse the audio and trim the start twice:

```
silenceremove=start_periods=1:start_silence=0:start_threshold=-50dB,
areverse,
silenceremove=start_periods=1:start_silence=0:start_threshold=-50dB,
areverse
```

**The check that catches it:** a sentence's measured length must be plausible
for its word count. "That is far too dry to live in." measured 0.68s — seven
words at ten words a second. Any sentence under ~2.5 words/second of audio is
a measurement bug, not a fast reader.

**Fill the gaps with picture.** A box that sits still while the voice talks is
dead screen. Each spoken sentence should change something: a plinth lands, a
label arrives, a number starts counting, a line prints.

---

## Performance (it is part of the look)

Draw cost is a style constraint, not an optimisation afterthought: a beat that
costs 40ms a frame stutters, and stutter reads as cheap no matter how good the
pixels are. Budget **≤4ms per frame** for the whole composite.

- Anything that is a pure function of its rectangle — banded skies, dithered
  grounds, glyphs — is **baked once** and blitted, never drawn per pixel per
  frame. v1.0's dusk plate was ~190,000 `fillRect(1,1)` calls a frame; it
  measured 42.8ms and ran at 23fps while the rest of the piece ran at 400+.
- Blit into a `willReadFrequently` buffer with **`putImageData`**, not
  `drawImage` of a cached canvas — the latter stayed at 40ms.
- Measure per beat, not per piece. An average hides the one scene that hitches.

## Determinism (non-negotiable)

Every frame is a pure function of `t`. All randomness from `H.rng(seed)` /
`H.makeNoise(seed)` **inside** the draw. Never `Math.random`. The same `t` must
always give the same pixels — the video renderer depends on it.

Expose `window.seek(t)`, `window.DURATION`, `window.scoreSound`.

---

## Sound

**Built, in the sampler.** Everything except the voice is synthesised in the
browser from a score that is a pure function of `t`, so it seeks instantly and
an offline render mixes from the same data: `window.scoreSound(a, b)` returns
the events in a window.

The voice is a single pre-rendered track the length of `DURATION`, with one
line placed on each beat, played from an offset so scrubbing stays in sync.
Lines are written to the beat's actual length — measure the synthesised audio
and cut words until it fits; never let a line run into the next beat.

Browsers refuse to start audio without a gesture, so a sampler page plays
**silent until a button is pressed**, and says so on the button.

Full SOUND kit, unchanged. Medium-true palette only:
- **Chrome** → real mouse-button snaps, soft UI clicks
- **Screen** → chip blips (square/triangle), text print blips
- **Objects** → hollow plastic block knocks, stacks thunking
- **Glass** → mains hum bed, phosphor zap on the emphasis, V-hold hum sag

Hierarchy: effects in front, bed clearly under, **≤3 sounds at once**, and small
silences so the big hits read. A sound starts on the exact frame its event appears.

Mix, as built: voice 1.00 · effects 0.40 · music 0.085 · hum 0.030. The music is
a hint — felt, never followed. If you can name the tune, it is too loud.

---

## Research

Check the mechanism before writing the script, not after drawing it. Three
claims in the honey sampler survived four versions before being checked:

- **"Bees add peroxide" was wrong for a sealed jar.** Glucose oxidase is
  *inactive* in ripened, undiluted honey and only regains activity on dilution.
  Peroxide explains honey on a wound, not honey in a jar.
- **"Nothing can grow in it" was too strong.** Osmotolerant yeasts grow down to
  aw ≈ 0.61; honey at 0.60 is barely under.
- **"It never spoils" was the headline, not the fact.** Honey ferments above
  ~19% moisture, and it is hygroscopic — left open it pulls water out of the air
  until it gets there. The seal is doing as much work as the sugar.

The corrected version is a better story than the one it replaced, which is
usually how this goes. **A surprising-but-wrong beat is worth less than the
true mechanism underneath it.**

## Generation rules

These are not style preferences. Each one is a defect that shipped, written as
the rule that prevents it recurring. **Follow them when generating, not after.**

### Voxel charts

1. **Offset a second stack along the x−y diagonal, never along x alone.**
   `voxBar(Pr, 7, -7, …)` beside `voxBar(Pr, 0, 0, …)`. Offsetting in x alone
   also moves the stack *down* the isometric grid, so two bars end up at
   different heights and the lower one collides with the upper one's label.
2. **Separation ≥ 2× the footprint width.** A footprint of 3 is `6·CW = 42px`
   wide, so centres must be ≥ 84px apart. `(7,−7)` gives 98px. The first cut
   used 49px, which is narrower than the bars themselves.
3. **A tag belongs under its own stack, computed — never typed in.**
   The stack's lowest drawn corner is `(bx+f, by+f)`, i.e.
   `y = oy + (bx + by + 2f)·CH`. Place the tag **24px below that**. Anchoring to
   `(bx+by+f)` is 10px too high and lands the plate on the cubes.
4. **Keep one baseline across beats.** Every chart in the piece shares an `OY`,
   so bars in different beats are comparable and tags always clear the box.
5. **Check plate-against-stack, not just label-against-stack.** A tag plate is
   opaque: the text on it stays perfectly readable while the plate hides the
   thing it is labelling. Text-vs-graphics checking cannot see this.

### The pointer

6. **The tip is the hotspot.** `cursor(x,y)` draws its point at exactly `(x,y)`.
   To click a button, the keyframe must be the button's **centre**, computed from
   the button rect — not a nearby round number.
7. **The pointer becomes a caret while text prints**, sitting at the insertion
   point of the line being typed, and returns to the arrow when the line is done.
   The mouse should look like the thing operating the machine.
8. **Open on a click, close on a click.** The piece starts with the pointer
   pressing OK on a dialog and ends with it pressing OK on the message box; the
   window then shuts to an **end card**. A piece that just stops feels unfinished.

### Text and scene hygiene

9. **Never let the rasteriser cut a string.** It used to clamp at 420px and then
   report a 420px width, so an over-wide line lost its tail *and* passed the
   bounds sweep — "AND IT SPOILS." rendered as "AND IT SPO". The buffer is 720
   wide now, and `checkTruncation()` reports any string wider than the screen.
10. **Print the CAPTION, not the raw spoken words.** Word-gating a fixed caption
    (`after(18,5) -> 'AND IT SPOILS.'`) is not the same as printing
    `said(18, 5)`, which is the literal narration — "of those and it spoils.",
    509px against a 412px box. Sync the caption to a word; do not retype the
    sentence as the caption.
11. **A scene clears its own props before the next idea starts.** The six-cube
    "one sixth water" row stayed up until the next *sentence*, so it sat behind
    the comparison that followed. Gate a prop on the word that replaces it, not
    on the sentence after it.
12. **Clearance, not just containment.** Inside a group box, keep ≥6px from the
    border. The tags were technically inside with 1px of air and read as crammed
    against it.

### The pointer, in detail

13. **Click into a line before typing it.** On a real machine you click to place
    the caret and then type. Every typed line gets a click **0.30s before its
    first word**, at the line's insertion point; the caret takes over from there.
    A line that just starts typing with the arrow parked elsewhere looks like
    text appearing by itself.
14. **The caret is sized to its line and drawn in its line's colour.** A fixed
    15px caret sits visibly high against 18px text, and a white caret is
    invisible on the light grey of a message box. Pass the size and the colour.
15. **Arrive, settle, then click.** Put a track point **0.14s before** every
    click at the same position. Clicking on the frame the pointer is still
    moving reads as a twitch, not a press.
16. **Generate the track; never hand-keyframe it.** Build one `PTRACK` from the
    typed-line table plus the button centres, and let **both** the picture and
    the score read it. Hand-written cursor keyframes drift away from the clicks
    in the sound the moment any timing changes.

17. **Hold, then move.** Interpolating across the whole gap between keyframes
    leaves the pointer permanently in slow transit across the middle of the
    diagram, which is what makes it feel like it is in the way. Sit still, then
    make one decisive move in the last **0.55s** before it is needed.
    Target: **moving on under 10% of frames.** This build is 5%.
18. **A resting hand is not a frozen bitmap.** While holding, drift ±1px on two
    slow out-of-phase sines. It reads as alive without drawing the eye.
19. **Park out of the way between sessions** — bottom-right of the panel, clear
    of the content — but **only when there is time**. If the next event is under
    3s away, parking means travelling away and straight back, which is more
    movement, not less.
20. **One click per typing SESSION, not per line.** Back-to-back lines are one
    session: you click once to put the caret in and keep typing, and the caret
    moving to the next line is the visual cue. A session continues only if the
    next line is **both** within 2s **and** within 80px of the last insertion
    point. Time alone merged a caption with a message box in a different window
    at the other end of the screen, and the box got typed with no click at all.

**Every line that appears word by word goes through `typeLine()`** and appears
in the pointer table. A line drawn with a bare `px()` gets no caret and no
click, and is instantly obvious as the one that was forgotten.

### Enforcement

Every rule above is checked by a sweep, and all of them must return **0**:

| sweep | catches |
|---|---|
| `checkLegibility()` | type under the floor |
| `checkBounds()` | anything leaving the window's client area |
| `checkStraddle()` | a label lying across the group box border |
| `checkOverlap()` | label on label, label on graphics, **plate on stack** |
| `checkTruncation()` | a string cut by the rasteriser or running off the screen |
| `checkClearance()` | anything inside the box with under 6px of air around it |

**Prove a new sweep fires before trusting it.** Put the defect back, confirm the
sweep names it, then restore. A checker that has only ever returned 0 has not
been tested — it has been assumed.

## Layout

**Measure the glyph before placing it.** Press Start 2P is about **0.98 × size**
per character, so a 16-character label at 14px is 220px wide — two thirds of the
usable panel. A label placed by eye ran straight through the ✗ it was pointing at
and into the word beyond it, in a build that had already been reviewed.

When a label does not fit beside a thing, **give it its own row**. Shrinking it is
not available: the legibility floor is a floor.

**Check it, don't eyeball it.** Record every text extent drawn and sweep the whole
piece:

- `checkBounds()` — anything leaving the window's client area. Chrome (title bar,
  status bar, dialogs over the desktop) is judged against the full buffer instead.
- `checkOverlap()` — any two labels on top of each other, **and** any label
  sitting on a sprite, a voxel stack or a tag plate. Skip identical strings
  within 1px of themselves (that is `pxShadow`), and skip a tag's own label,
  which is drawn on its plate by design.
- `checkLegibility()` — anything under the floor below. Win95 furniture (window
  titles, button labels, group-box labels, the status bar) is exempt and is
  flagged as chrome at draw time.

- `checkStraddle()` — any label lying **across** the group box's border, half on
  the diagram and half off it. The panel check cannot see this, because such a
  label is still inside the panel. v1.6 shipped with WATER FROM / THE AIR
  straddling it.

All four must return **0** before a build ships.

**Lay out against the box, not the panel.** Take the group box rect, inset it
(14px is right at this scale), and place into *that*. A caption that will not fit
inside goes in the free strip **below** the box — never across its edge. Measure
the line before placing it: 18 characters of Press Start 2P at 16px is 283px,
which is half the usable width.

**The floor is not advisory.** v1.5 shipped with 21 texts under it, including the
opening question at 9px — 18px on output, against a 28px floor. Writing the rule
down had not made it true; sweeping for it did. Note that *large* is not a
violation: a headline is one set at >=22, and an 18px label already clears the
14px label floor, so only claim 'headline' at the size that earns it. Screenshots catch the frame you
happen to look at; the sweep catches the one you don't.

## Accuracy

Draw the subject correctly. Check the science before it goes in the visuals.
If a number is an assumption, it gets listed under the storyboard — never
presented on screen as fact.

Check comparisons as hard as numbers. "pH 3.9 — as acidic as a tomato" shipped in
v1.0 and v1.1; a tomato is pH 4.3–4.9, so honey is the *more* acidic of the two.
It is orange juice (3.3–4.2) that actually matches.

---

## Workflow

**Storyboard first.** One HTML page, a grid of 6–10 panels, each a canvas
showing that beat's key frame drawn in this style with the real drawing code.
Under each: beat number, start/end time, exact on-screen text, how it gets
there from the previous panel, key sounds. Then wait for approval.

Build the full animation from the storyboard's own drawing code.

---

*Sampler: aedinlai.com/vid*
