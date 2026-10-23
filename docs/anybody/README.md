# Anybody

Full-body pose tracking in the browser that doesn't assume you're standing up.

**[Open the test harness →](https://www.aedinlai.com/anybody/)**

553 landmarks — body, both hands, face — tracked entirely on the device. No frame
and no coordinate ever leaves the page.

---

## Why this exists

Pose models are trained almost entirely on upright, forward-facing people. Point
one at somebody lying on a mat and you are outside its training distribution.
This is well documented and it is not a small effect:

- OpenPose's authors list upside-down and atypical poses as a primary failure case.
- A markerless lifting study got **73.6% usable frames on bench press** against far
  higher rates for squats and deadlifts, and concluded tracking "works best for
  upright exercises."
- A YOLO26 walkthrough found detection **dropped out entirely** when the subject
  inverted, blamed on COCO containing almost no inverted examples.
- Rotation augmentation during training is typically only ±30°.

Which is awkward, because floor work is most of what rehab and physio movement
actually looks like: supine, prone, side-lying, quadruped, seated.

The fix here is deliberately dumb. Run the model at 0°, 90°, 180° and 270°, keep
whichever reports the most confidence, and remember it until confidence drops.

### What this is not

It is **not** an orientation estimator. An earlier design estimated the body axis
from the bounding box and carried it forward with a temporal prior. That approach
is 180°-ambiguous by construction (a supine person is a wide box whichever way
their head points), has no first-frame bootstrap, and closes a feedback loop with
no damping — one left/right swap rotates the next crop, which makes the swap
self-consistent, and it never recovers. Brute force has none of those failure
modes, because each search is stateless.

It is also **in-plane only**. Rotation addresses a model trained on upright
bodies. It does nothing for foreshortening, self-occlusion, or out-of-plane
rotation, which are different problems with different solutions. The cheapest of
those solutions is usually **moving the camera** — an overhead mount turns a
person on a mat back into an upright person in frame, for free.

---

## Using it

```js
import { createTracker } from './src/anybody.js';

const tracker = await createTracker({ orientation: 'auto' });
const result = await tracker.estimate(videoElement, performance.now());

for (const p of result.parts.body ?? []) {
  console.log(p.name, p.x, p.y, p.score);  // normalised to the source frame
}
```

### `createTracker(options)`

| option | default | meaning |
|---|---|---|
| `orientation` | `'auto'` | `'auto'` searches the four quarter turns. `'none'` never rotates. A literal `0`/`90`/`180`/`270` pins one. |
| `parts` | body + both hands | `'body'`, `'leftHand'`, `'rightHand'`, `'face'`. The face **mesh** is off by default: 478 of 553 points, the least useful for movement and the most identifying |
| `runningMode` | `'IMAGE'` | `'VIDEO'` is faster but see the caveat below |
| `keepAbove` | `0.5` | a cached rotation is kept while it scores above this. Note this means "still finding something", not "still right" |
| `recheckEvery` | `150` | forced full search, bounding how long one rotation is kept unexamined |
| `cooldown` | `15` | frames to wait after a search that changed nothing, so low confidence cannot pin the frame rate at its worst value |

**If you know how the camera is mounted, pin the rotation.** It is faster and
more reliable than any amount of inference.

### The result

```js
{
  schemaVersion: 1,
  modelId: 'mediapipe-holistic',
  modelRevision: '1.1.1',
  parts: { body: [...], leftHand: [...] },   // only what was actually found
  points: [ { part, index, name, x, y, z, score, present } ],
  world: [ { index, name, x, y, z } ] | null, // metres from the hip midpoint
  agreement: { disagreement, rotation, score } | null,  // see "a second opinion"
  rival: { rotation, score, points, body } | null,      // the runner-up pose
  box: { x, y, w, h } | null,
  orientation: { applied, score, searched, scores },
  timings: { totalMs, inferenceMs, passes },
}
```

Three things about this shape are deliberate:

1. **Parts are absent, not zero-filled.** If the hands weren't found,
   `result.parts.leftHand` is `undefined`. It is never an array of zeros, because
   a zero is a coordinate and would read as "the wrist is at the top-left corner."

2. **Every frame carries its own provenance.** `modelId`, `modelRevision` and
   `schemaVersion` are on every result, so if you ever swap the model, downstream
   code can tell. This library deliberately does **not** promise that a different
   model would be a drop-in replacement — two models that both report a wrist do
   not agree on where a wrist is, and the disagreement is about the size of the
   thing you are trying to measure.

3. **`score` is model-specific.** A 0.6 from this model does not mean what a 0.6
   from another model means. Threshold per model, never globally.

### Coordinates

`x`, `y` are normalised to the source frame, origin top-left. `z` has no
consistent metric scale and is not orthogonal to the image plane — don't compute
angles from it. Use `result.world` for anything depth-dependent; those are metres
from the hip midpoint in a proper orthogonal frame.

### The `runningMode` caveat

Defaults to `IMAGE`, which runs the detector on every frame — though not as
independently as the name suggests; see "MediaPipe IMAGE mode is not stateless"
below.
`VIDEO` is faster — it tracks a region of interest forward and only re-runs the
detector on track loss — but that means **a frame the detector would fail on
alone gets rescued by its predecessor**, which hides exactly the failures this
library exists to surface. `VIDEO` also cannot be combined with rotation search,
since it requires monotonically increasing timestamps and its tracker state would
be corrupted by being fed four rotated variants of one frame.

Use `VIDEO` when you want the fast path and accept that trade.

---

## Honesty about accuracy

**These are coordinates, not clinical measurements.**

Markerless pose error on well-behaved joints runs around **10° RMS** against lab
motion capture. One jump-landing study measured a **−19° bias** on knee valgus.
The minimal detectable change for shoulder goniometry — the threshold below which
a clinician treats a difference as measurement noise — is **5–10°**.

The model's error is the same size as the signal. A single webcam cannot measure
range of motion to a standard anyone should act on. Use this to *see* movement,
not to score it.

---

## Privacy

Everything runs in the tab. The harness ships a CSP with `connect-src 'self'`,
which blocks MediaPipe's usage-stats POST, and nothing in `src/` makes any other
network request after the model loads. Nothing is persisted unless you press
Record.

The model and runtime are self-hosted rather than fetched from a CDN. A runtime
fetch from a third party would beacon the viewer's IP, user agent and referring
URL at the moment someone steps in front of the camera, which is not a
reasonable thing to do in a clinical setting.

### What that does and does not buy you

Be precise about this, because the gap is where someone non-technical would
never think to look.

- **CSP is per-document.** A same-origin parent page that frames this one can
  reach into it and read the video element directly. The in-page guarantee is
  only as strong as the origin it is served on. **The demo at
  aedinlai.com/anybody/ is itself framed by a same-origin parent that has no
  CSP** — so treat that deployment as a demo, not as the privacy posture.
  If you are recording real people, serve this from its own origin.
- **Camera permission is granted per-origin and persists**, so it is shared with
  everything else on that origin.
- `connect-src` stops accidental telemetry. It does not stop exfiltration by
  navigation, so it is not a defence against a hostile vendored bundle.
- **The export is not de-identified.** It excludes the face *mesh* and contains
  no video, but body landmarks 0–10 are nose, eyes, ears and mouth corners, and
  hand geometry is itself a biometric. A joint-kinematics file is re-identifying.
  Do not put a person's name in the filename.
- Hashes in `vendor/HASHES.json` are a **build- and deploy-time** control, not a
  runtime one: `npm run vendor` verifies the source tree and `deploy-site.sh`
  re-verifies the copied files, but the browser itself checks nothing.

---

## Developing

```sh
npm install
npm run vendor      # copy the runtime, download the model, verify hashes
npm test            # unit tests (50)
npm run test:e2e    # browser test: starts its own server, needs Chrome
npm run test:all    # both
npm run serve       # http://localhost:5173
```

`npm run test:e2e` loads a clip with a person in it and asserts landmarks, table
rows and non-blank canvas pixels, because the two worst bugs this project has
shipped both rendered an empty page while every unit test stayed green. It is
part of `scripts/deploy-site.sh`, which also re-verifies the SHA-256 of the
**copied** vendor files rather than only the source tree.

`tests/measure/` holds the pages that produced the numbers in "What has actually
been measured" — open them in a browser with a real GPU, since headless Chrome
falls back to a software rasteriser and roughly doubles the frame times.

`vendor/HASHES.json` pins every vendored file by SHA-256. `npm run vendor` fails
if anything changed underneath you; `npm run vendor -- --update` re-pins after an
intentional version bump. The model URL is pinned to revision `1`, not `latest`,
because a silent upstream reweight would change every number this reports with
nothing in the diff to show it.

---

## What has actually been measured

Version 0.1. Measured on `fixtures/`, which is four images — small, so treat
these as findings that justify more testing, not as settled numbers.

### The rotation search earns its keep, decisively

On `prone90.jpg` (a person lying on the floor, shot in portrait):

| orientation | result |
|---|---|
| `none` / pinned 0° / pinned 180° | **nothing. 0 landmarks.** |
| pinned 90° / pinned 270° | body + both hands, 75 landmarks |

The difference is not degraded accuracy, it is total detection failure versus
working. An earlier draft of this README was about to conclude the opposite from
the upright yoga fixture alone, where all four rotations perform identically. One
more fixture overturned it.

### What to do about it: a second opinion you can see

Since no number distinguishes a correct pose from a confidently wrong one, the
library stops pretending and shows you the disagreement instead.

When a rotation search runs and more than one rotation returns a body, the
result carries the runner-up:

```js
result.agreement  // { disagreement, rotation, score } — or null
result.rival      // the runner-up pose, in source coordinates
```

`disagreement` is the mean distance between the two poses over the torso and
limb joints, in frame widths. On the prone fixture it is **0.139** while both
poses report confidence around 0.80. It is a warning, not a selector: tested as
a selector it picks the wrong one.

The harness draws the runner-up as a violet dashed skeleton (the **2nd opinion**
toggle). Sitting on the subject means the two agree. Sprawled across empty floor
means the model holds two incompatible confident opinions and the confidence
number is meaningless on that frame. **That visual check is the only one that
works, which makes the overlay part of the product rather than a demo.**

### Confidence does not tell you when the pose is wrong

On `prone.jpg`, detected directly, the hip-knee-ankle chain lands in empty floor
several body-widths from her actual legs. The same person detected via
`prone90.jpg` and un-rotated lands correctly. Mean disagreement between the two
is **0.139 of the frame, with a worst joint at 0.728**.

Both report a confidence of **~0.80**.

So the search can catch "the model found nothing", and cannot catch "the model
found something confidently wrong". If you need the second, you need a check this
library does not have — bilateral bone-length symmetry was tried and did not
separate the two cases.

### MediaPipe IMAGE mode is not stateless

This one is worth knowing about whatever you build on. The same image, through
the same landmarker, gives different answers depending on what was processed
immediately before it:

| call history | landmarks found on `prone90.jpg` |
|---|---|
| fresh landmarker | 33 |
| the same image twice | 33, identical |
| **straight after a different image** | **0** |
| after a four-rotation search | 33 |

Google's docs present IMAGE mode as per-image. It is not. The practical
consequences: results are reproducible only for a fixed call order, and the four
passes of a rotation search influence each other, so their scores are not
strictly comparable. The coarse signal — found something versus found nothing —
survives this. Fine-grained comparison between rotations does not.

### Partial framing works, and why it needed a fix

You do not need the whole body in shot. Measured on crops of the upright
fixture, after the fix below:

| framing | score | body landmarks marked absent |
|---|---|---|
| whole body | 0.999 | 0 / 33 |
| cut below the knees | 0.991 | 8 / 33 |
| cut at the hips | 0.987 | 10 / 33 |
| head and shoulders (webcam) | 0.989 | 13 / 33 |

Two things had to change to make that true.

**Scoring no longer averages over joints that are simply out of shot.** The
model always emits all 33 body landmarks, extrapolating the ones it cannot see,
so on a webcam crop the hips report 0.006 and the legs 0.05. A flat mean over
the twelve core joints sank under `keepAbove` on *every frame*, firing a
four-pass rotation search forever for a subject that was being tracked
perfectly. Scoring the best half asks "is there a body here the model
understands", which is the actual question.

**`present` now distinguishes measured from guessed.** A landmark is present
when the model reports it visible *and* it falls inside the frame. Absent ones
are still returned — the coordinates are occasionally useful — but they are not
drawn, not counted in the bounding box, and written to the export as blanks. A
knee the model placed below the bottom of the picture is a guess, and a
downstream consumer has no way to tell that from a measurement once it is a
number in a CSV.

### Why hand tracking feels so much more solid than body tracking

Worth knowing, because it is not a quality gap, it is a structural one.

The hand model is a dedicated detector for a small, self-contained object, and
when it does not find a hand it reports **nothing**. The pose model fits a whole
articulated body prior (GHUM) and **always returns all 33 landmarks**, filling
in whatever it cannot see. So a hand is either tracked or absent, while a body
is always "tracked" — sometimes with half of it invented.

On top of that, BlazePose's detector derives the whole-body region of interest
from the hip-to-shoulder axis, and its paper says training was limited to images
where the whole person is visible or where hips and shoulders could be
confidently annotated. Framings that cut the hips are outside what it was
trained on; a hand never has that problem.

### Still not measured

Real video of real rehab movement, with a moving subject, motion blur, clothing,
and a camera that is not a studio. Everything above is still images.

## Status and stability

**v0.1, one person, no deprecation policy.** The public API may change. There
are three independent version numbers and they move for different reasons:
`SCHEMA_VERSION` (the shape of a result), `formatVersion` (the layout of an
exported file) and `modelRevision` (the vendored model). If you parse the CSV,
pin the first two.

There is no published package. To depend on this, vendor `src/` and `vendor/`
and pin by git SHA.

## Licence

MIT (this code). See [LICENSES.txt](LICENSES.txt) for the MediaPipe notices.
