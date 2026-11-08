# CATHODE DESK — house style v1.1

**Locked 2026-11-08. This file is the authority. If a build disagrees with this file, the build is wrong.**

> **v1.1 (2026-11-08)** — two changes, both made because the v1.0 build was
> measured and watched, not because the look needed softening:
> 1. **Two ticks.** Drawn content still steps at 12fps; continuous motion moves
>    at 24fps. See *Motion* below.
> 2. **Sound is built, not pending.** See *Sound*.
>
> Nothing else moved. The palette, the layer order, the type floors and the
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
- **24 fps motion tick** — `M = Math.floor(t*24)/24`. Everything that *moves
  continuously*: the cursor, voxel drop-in, arrow draw-on, counters settling,
  outline zooms, mosaic block size.
- The glass layer may run at full rate (scanline roll, grain).

Content on 2s, movement on 1s — the oldest split in hand-drawn animation. v1.0
ran everything at 12 and the result read as a slideshow under the cursor moves.
Do **not** raise the content tick to fix smoothness; raise the motion tick.

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

Aim 12–30s. Set it in a `DURATION` constant.

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

## Accuracy

Draw the subject correctly. Check the science before it goes in the visuals.
If a number is an assumption, it gets listed under the storyboard — never
presented on screen as fact.

---

## Workflow

**Storyboard first.** One HTML page, a grid of 6–10 panels, each a canvas
showing that beat's key frame drawn in this style with the real drawing code.
Under each: beat number, start/end time, exact on-screen text, how it gets
there from the previous panel, key sounds. Then wait for approval.

Build the full animation from the storyboard's own drawing code.

---

*Sampler: aedinlai.com/vid*
