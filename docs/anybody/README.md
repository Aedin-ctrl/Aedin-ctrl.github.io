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
| `parts` | all four | `'body'`, `'leftHand'`, `'rightHand'`, `'face'` |
| `runningMode` | `'IMAGE'` | `'VIDEO'` is faster but see the caveat below |
| `keepAbove` | `0.5` | a cached rotation is trusted while it scores above this |
| `margin` | `0.08` | a challenger rotation must beat the incumbent by this to switch |
| `recheckEvery` | `150` | forced full search, so a confidently wrong lock cannot persist |

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
which blocks MediaPipe's usage-stats POST, and there is no other network request
after the model loads. Nothing is persisted unless you press Record, and the
export never contains video.

The model and runtime are self-hosted rather than fetched from a CDN. A runtime
fetch from a third party would beacon the viewer's IP, user agent and referring
URL at the moment someone steps in front of the camera, which is not a reasonable
thing to do in a clinical setting.

If you embed this, note that **camera permission is granted per-origin and
persists**. Host it somewhere that doesn't share an origin with anything
sensitive.

---

## Developing

```sh
npm install
npm run vendor      # copy the runtime, download the model, verify hashes
npm test            # unit tests
npm run serve       # http://localhost:5173
node tests/e2e.mjs  # browser smoke test (needs Chrome)
```

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

### Still not measured

Real video of real rehab movement, with a moving subject, motion blur, clothing,
and a camera that is not a studio. Everything above is still images.

## Licence

MIT (this code). See [LICENSES.txt](LICENSES.txt) for the MediaPipe notices.
