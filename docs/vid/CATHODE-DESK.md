# CATHODE DESK — house style v3.1

**Locked 2026-11-08. This file is the authority. If a build disagrees with this file, the build is wrong.**

> **v3.1 (2026-11-09)** — **there is no question in the intro.** It is a title
> card: a vibrant sky, one solid drawn object, and the narration itself as the
> headline. Then the blackboard. v2.9 put a written question over the voice and
> v3.0 put the question into the voice; both were more intro than the intro is
> worth. See *Vibrant at the edges*.
>
> **v2.9 (2026-11-09)** — the vibrant beat is a typed question card, fixed
> captions **type** instead of appearing, and the Win95 icon is drawn from its
> own centre.
>
> **v2.8 (2026-11-09)** — **the palette rotates**, tags come from a **closed
> vocabulary**, and the overview panel always lands on a **wiped stage**. A
> tenth sweep, `checkPiece()`. See *One format, many pieces*.
>
> **v2.7 (2026-11-09)** — the style is now a **shared runtime**, not a shape to
> copy. Three files: `cathode-lib.js` → `piece.js` → `cathode-run.js`. Plus the
> **library** at `/vid`, the **number and tags** every piece carries, and
> **vibrant at the edges, dark in the middle**. See *One format, many pieces*.
>
> **v2.6 (2026-11-08)** — **vertical composition**. A ninth sweep,
> `checkComposition()`, and the rule it enforces: every beat's content band is
> centred on the group box, and the bottom of the panel belongs to the caption.
> See *Vertical composition*.
>
> **v2.5 (2026-11-08)** — lessons from the SECOND piece (halloumi), the first
> built on this style rather than alongside it. See *Reusing the style*.
>
> **v2.4 (2026-11-08)** — target running time is **65–75s**, at the voice's
> own pace. The 1.25x speed-up is removed. See *Running time*.
>
> **v2.3 (2026-11-08)** — the pointer now LEADS what it moves, and steps off
> it afterwards. See rules 25–28.
>
> **v2.2 (2026-11-08)** — the pointer stops parking and starts operating the
> machine: it drags every stack up, sweeps the cubes in, pulls the arrows and
> clicks each label out. See rules 21–24.
>
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

## Reusing the style

The honey build and the halloumi build share the whole four-layer library, all
eight sweeps, the sound engine and the player. Only the timeline, the explainer
and the score are per-piece. **Lift, don't retype.**

The splice is: everything **up to** `/* ===== TIMELINE */`, then this piece's
timeline + explainer, then everything **from** `/* ===== LAYER SOUND */`.
**The eight sweeps live between the explainer and the sound engine** — a splice
on those two markers alone silently drops them, and the first symptom is a
`createLinearGradient` error from a NaN duration, because `window.DUR` went with
them.

29. **Sweeps address beats positionally, never by name.** `BEAT.JAR.sc` worked
    for one script and threw `undefined` on the next. Use the first content beat
    and the last beat: `Object.keys(BEAT)[1]` and `[length-1]`.
30. **An overlay window is not content inside the panel.** Flag it (`OVERLAY`)
    while drawing it, and have the clearance and idle sweeps skip it — otherwise
    the end card's own text reads as crammed against a group box it is floating
    over.
31. **A raw `fillRect` is invisible to the sweeps.** Register any decorative
    geometry that text could collide with (`GBOX.push({…, k:'band'})`). The pH
    band ran straight through the 5.4 and every sweep returned 0, exactly as the
    tag plates once did.
32. **Beat count and architecture carry over; content does not.** Halloumi uses
    the same 7-beat shape — hook, concrete object, mechanism, chart, the turn,
    second cause, takeaway — with an entirely different subject and three new
    scene types (a melting stack, a protein lattice, a whey vat). If a new topic
    will not fit that shape, the shape is not the problem; the topic needs a
    different turn.

## Running time

**Target 65–75 seconds, or longer. Never shorter.**

**Get there with breath, not with padding.** At natural pace this script is
44.6s of speech; the length comes from the gaps. Widening them from 0.45/1.20
to **0.75s between sentences and 1.85s between beats** took it from 59.6s to
70.1s and improved the pacing — padding the tail would have added the same
seconds as dead air.

**`SPD` is the one speed knob**, at module scope so the picture and the score
read the same value. Every motion duration is written at **natural rate** and
multiplied by it. Set `SPD=1.0` and the piece runs at the voice's pace; the
0.8 that lived here during the 1.25x experiment is gone.

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

21. **The pointer does not park — it operates the machine.** Nothing should
    appear by itself. The tag is *dragged* onto the jar, each stack is *hauled*
    up out of the baseline, the arrows are *pulled* along their path, every
    label is *clicked* out. Parking it in a corner between beats is the tell
    that the animation is happening without it. (This supersedes rule 19.)
22. **An action's window is the element's own animation window** — the same word
    anchor the picture uses. Then the pointer leads the thing it is moving
    instead of arriving near it afterwards.
23. **The pointer can only be in one place.** Before committing an action to the
    track, check it is *reachable*: `dt ≥ 0.26s + distance/620px·s⁻¹`. An event
    that is too soon still **rings and still sounds** — it just does not drag
    the pointer across the screen to meet it. Skipping this check produced 21
    teleports in 50 seconds, because every label wanted its own click.
24. **One gesture per burst, not one tap per element.** Six cubes landing 0.072s
    apart is a *sweep* with a ring on each cube, not six separate taps — the
    gaps are shorter than the time it takes to move.

25. **The pointer LEADS by 0.20s.** Grab and pull *ahead* of the element's own
    animation so the thing trails the hand. Run them together and the eye sees
    the effect start first and reads the mouse as following it — which is what
    it looked like before this, even though the two were perfectly simultaneous.
    **Simultaneous reads as following. Only leading reads as causing.**
26. **Step off afterwards, and only just off.** A short move — 40–80px into
    clear space beside the thing — not a trip to a corner. A far rest fails the
    reachability check and gets dropped, which leaves the pointer sitting on the
    thing it just moved: the worst of both.
27. **The caret holds for the whole typing session**, not per line. In the gaps
    between lines the arrow was reappearing on top of the text it had just
    typed.
28. **It may rest on something briefly; it may not SIT there.** Judge by dwell:
    stationary, on content, for over **0.8s** is the fault. Resting on a thing
    for a moment after acting on it is what a hand does. (Fixed exclusion
    windows were tried first and had to be so wide they covered most of the
    timeline, which made the check mean nothing.)

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
| `checkPointerJumps()` | the pointer moving more than 95px in one frame |
| `checkPointerIdle()` | the pointer sitting still on top of content for over 0.8s |
| `checkComposition()` | a beat's content sitting off-centre in the box, or filling too little of it |

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

All nine must return **0** before a build ships.

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

## One format, many pieces

A house style that lives as "a shape you copy into the next file" is not a
format, it is a habit. Honey and halloumi had already drifted to **different
buffer sizes and different cube units** while both claiming to be this style.
So the runtime is shared and the piece is the only thing that varies.

**Three files, loaded in this order.** A top-level `const` in a classic script
is shared with every later script (it is not a window property), so the three
share one lexical scope and no piece needs a namespace.

| file | holds |
|---|---|
| `cathode-lib.js` | the FORMAT: buffer, four layers, window geometry, caption strip, `MIDY`, the status bar, the sky helpers |
| `<piece>/piece.js` | the PIECE: `PIECE` metadata, the timeline, `L`, `SPOTS`, `ACTS`, `explainer()`, `buildScore()` |
| `cathode-run.js` | what needs both: the pointer track, the nine sweeps, the sound engine, the player |

**`buildScore()` belongs to the piece, not the format.** It addresses that
piece's own beats and word indices. Left in the shared file it referenced
`BEAT.PAN`, which only halloumi has, and the entire runtime threw on load —
with the first symptom being a TDZ error about `ctx`, three hundred lines away.

**Every piece declares itself:**

```js
const PIECE={ no:2, slug:'halloumi', tags:['FOOD','CHEM'],
              title:"why halloumi doesn't melt", blurb:"..." };
```

- `no` and `tags` print in the **status bar at the bottom of every frame** and
  again on the end card, as `#002  FOOD / CHEM`.
- **Two tags maximum.** A third is a sign the piece is about two things.
- The library page reads this same block. The number, the tags, the blurb and
  the running time are never typed twice.

**The palette rotates.** Win95 chrome is Win95 chrome — those seven colours
never move. Everything else is a **slot**, and each piece fills the slots from
one of four palettes picked by its number: `DUSK`, `EMBER`, `DEEP`, `VIOLET`.
Two videos in a row must not look like the same video.

- The slot **names** never change, so **no drawing code knows which palette it
  is in**. `P.ice` is "the cool accent", not "light blue".
- `usePalette()` mutates `P` in place, after the piece has declared its number
  and before anything is drawn. Anything that caches a colour must therefore
  resolve it through `P` **at draw time** — which is why the sprite sheet
  stores slot names and not hex.
- The horizon's ground colours are part of the palette too. Left hard-coded,
  the ember sky met a purple shore.

**Tags come from a closed set**, like the palette:

```
FOOD BIOLOGY CHEMISTRY PHYSICS SPACE EARTH WEATHER
NATURE WILDLIFE BODY TECH HISTORY MONEY NEWS
```

Full words, not abbreviations — `CHEM` was something nobody would file anything
under. **At most two**, and `checkPiece()` rejects a tag typed freehand, a
missing blurb, and a running time outside 65–78s. A library stops being
browsable the moment one video invents its own vocabulary.

**The overview panel always lands on a wiped stage** — `wipeStage()`, in every
piece, with the last content beat ending at `BEAT.END.sc`. Honey cleared the
client area by accident (its last beat simply stopped drawing) while halloumi
left the whey vat and the hero number sitting behind the panel. Same style, two
different endings, and nothing in either file said which was right.

**Address `VO` positionally, never by index.** `VO[17]` was the OK click on the
message box. Honey has 19 sentences, halloumi 18, ice 16 — on the third piece
it took the whole runtime down before a single frame was drawn, and the error
it reported was a TDZ on `ctx`. It is `VO[VO.length-1]` now. Same rule as the
sweeps addressing beats by position.

**A `*box` key is a container, not a surface.** The group box, a lake
cross-section, a plot area. Text inside one is the point, and the pointer
resting inside one is not standing in front of anything — so `checkOverlap()`
and `checkPointerIdle()` both exempt any key ending in `box`. Everything else
you register is a *thing*, and the rules apply.

**The library is `/vid`.** A short description of the style, one card per
piece (thumbnail, number, title, blurb, tags, length), and the format notes.
Each piece is its own page at `/vid/<slug>/`. Thumbnails are cut with
**`?bare=1`**, which strips the page to the frame at 1:1 so a headless
screenshot at the buffer size *is* the frame — there is no cropping step to get
wrong. Downscale to 216×384 for the card; a full-size frame of CRT grain is
~580KB and does not compress.

## Vibrant at the edges

The teaching beats are a dark field because that is what you read numbers off.
The **desktop, the opening beat and the end card are a dusk sky** — the first
and last thing anyone sees should not look like homework.

### The intro format

**The opening beat is a title card, and that is all it is**: a vibrant sky,
**one** solid drawn object, and the **narration itself** as the headline. Then
the sun goes down and it cuts to the blackboard. No question, no card, nothing
written over the voice.

Two versions of a question were tried and both came back wrong, for the same
underlying reason — the intro was carrying more than an intro is worth:

- **v2.9** wrote a question on screen and typed it slowly across the beat. It
  spelled out `SO WHY DOES WATER EXPAND?` for four seconds while the narrator
  was saying *"Almost everything shrinks when it freezes."* Two unrelated texts
  at once, in a piece whose whole rule is that the screen says what the voice
  is saying.
- **v3.0** fixed the sync by putting the question *into the narration* as a
  third spoken line. It synced perfectly and it was still too much: the beat
  now had a statement, an exception, a question and an object to get through
  before anything had been explained.

**What it is instead:**

- The beat's sentences are **word-gated at 34px VT323** on their measured
  onsets, one at a time, with the caret. The narration IS the headline, so
  every word on screen is the word being spoken on that frame.
- **Near-white, not gold.** Gold on the ember sky was two warm colours
  fighting. `P.paper` carries on every palette, which is what a slot is for.
- **The sun goes down across the last sentence**, so by the scene change the
  frame already *is* the dark field it cuts to. The wipe stops being a cut.
- `checkComposition()` checks the **first content beat for centring only**,
  never for fill.

### One object, drawn solid

The intro carries **exactly one drawn thing**, and it is an object, not a
chart: no axis, no tag, no number. An iceberg, a jar, a pan — a shape you
recognise in a quarter second.

- **Opaque.** A translucent silhouette on a bright sky is neither a shape nor
  a window; it just goes grey where it matters.
- **Faceted**, in four or five tones mixed from one palette slot toward `ink`,
  with thin seams between the faces, so it models the way the voxel layer does
  instead of reading as a flat cut-out. Give two adjacent faces the same tone
  and you have drawn one face.
- **A ringed outline: 9px of black, then a 3px rim inside it.** Black on both
  sides of the rim is what makes it hold against any background — a single
  white pass vanished wherever the shape crossed the bright band at the
  horizon.
- `solidShape(faces, outline, rim, seam)` and `strokePoly()`; `linePix()` for
  the open polylines on top of it (a lit lip along the ridge, striations
  through the submerged mass).

**If it looks typed, it has to BE typed.** `capLine()` printed its whole string
the instant its word was spoken, which reads as text *appearing*. It types now,
character by character across a span derived from the string's own length, with
the caret following. Tag plates and axis labels still arrive whole — those are
objects and furniture, not someone at a keyboard.

**Reachability must see typing sessions, not just actions.** The gate measured
from the last committed *action*, so a session sitting between two actions was
invisible: the hand could be parked on a caption at 12.43 and expected at a
chart 337px away at 12.78 — a 107px teleport in one frame. It takes whichever
came last now, the action or the session point.

**The Win95 icon is drawn from its centre.** One function, one circle, one
glyph centred in it by construction — it was a 26×22 ellipse with the `?`
hand-placed 3px left and 6px low, in all three pieces, because nobody had ever
computed where the middle of the circle was. `pxMid()` centres on the glyph's
**ink** box, not on its advance width, and the `?` is set at 15px: at 20 it
inked 18×18 inside a 21px disc and pushed out through the top.

**Map the sky gradient over the sky's own height**, not over the whole rect. A
tall ground swallowed the warm end of the palette and a "dusk sky" came out
uniformly purple.

## Vertical composition

A 9:16 frame is mostly height, and height is the one thing no bounds check can
police. Nothing is off screen, nothing overlaps, nothing is under the floor —
and the picture still sits in the top third with a lake of dead air under it.
That shipped, and it took a person watching it to say so.

**1. The bottom of the panel belongs to the caption.** Reserve it in the
geometry, not by eye: the group box stops **100px short** of the panel's bottom
and the caption strip starts 14px below it. At 432×768 that is a **576px box**
and room for **three 20px lines** with air under them. The caption was 18px
crammed into the 45px left over; it is 20px with its own strip now. More room
at the bottom is not a nicety on a phone — it is where the words are.

**2. Every vertical anchor is written as a distance from the box's centre
line**, never as a distance from the top of the panel:

```js
const MIDY = BY + BH/2;
const L = { cook:{ vy:MIDY-171, num:[PX+110,MIDY+39], set:MIDY+149 }, ... };
```

Written as `PY+150` the five beats drifted to five different heights — NET sat
55px above centre, COOKED 163px below it — and **nothing in the source showed
it**, because each beat's numbers only ever got read next to each other inside
their own `if` block. Written against `MIDY`, "is this beat centred" is
arithmetic you can do by looking.

**3. `checkComposition()` measures the band and holds it.** For each beat it
takes the **settled frame** — 0.6s before the handover, when the picture has
finished arriving — unions every registered extent that falls inside the group
box, and reports:

- `low` / `high` — the band's centre more than **56px** from the box's centre;
- `thin` — the band shorter than **30%** of the box. That is dead air, and it
  is the half of the complaint that centring alone does not fix.

Sweep every frame instead and it reports half-built pictures: one lattice node
had landed, so the beat read as 166px "high". The settled frame is the one the
rule is about.

**4. A thin band is content, not layout.** The pan beat failed `thin` at 0.27
and no amount of moving it helped. The fix was to make the thing bigger: a 2px
dotted line became an 18px slab, and the cheese went from a 3×3×6 stack to
4×4×10. The cube height went **7px → 9px** across the piece at the same time.
Reach for the unit before reaching for the spacing.

**5. Register raw geometry or it does not exist.** Rule 31 again, and it bit
again: the pan, the lattice nodes, the vat and the calcium bridges were all raw
`fillRect` and therefore invisible to every sweep — including the new one, which
would have measured a band with the vat missing from it. Push a `GBOX` entry for
anything that occupies space. Register a lattice **node by node**, not as one
box round the grid: a lattice is mostly air, and a solid box forbids labelling
inside it. Do *not* register a mark that is **meant** to sit on text, such as a
strikethrough.

**6. An opaque window covers what is behind it.** The moment the vat was
registered, `checkOverlap()` reported five collisions between the end card's
text and the picture underneath it. They are not collisions — that is what a
window is. Overlay text is compared only with overlay text, and underlying
content is skipped entirely while an overlay is up.

**7. Park the pointer somewhere named.** The post-typing rest was "one line
below the line it just typed" — open space while the caption was one line, the
*second* caption line the moment the strip grew. Rests near content must be
constants tied to the layout, not offsets from the last thing touched.

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
