# CATHODE DESK — house style v4.16

**Locked 2026-11-12. This file is the authority. If a build disagrees with this file, the build is wrong.**

> **v4.15 (2026-11-12)** — **the ending is an OVERVIEW, and #001 has had the
> right one since the beginning.** The user, on the money parts: *"the end
> message is too long — the end is supposed to be like the takeaways or
> overview. Look at the honey video, I like how simple the end is."* Correct,
> and #001 `honey` is the model this file should have been citing all along:
>
> ```js
> const m=winFrame(BOX[0],BOX[1],BOX[2],BOX[3],'Good To Know Tho',true);
> winIcon(m.x+10,m.y+11,'i');          // an INFORMATION dialog, which is what it is
> const tx=m.x+52;
> capLine('> Dry.',17,0,tx,m.y+8, 14,'#000');      // one word each, arriving
> capLine('> Acidic.',17,1,tx,m.y+30,14,'#000');   // on its own spoken word
> capLine('> Sealed.',17,2,tx,m.y+52,14,'#000');
> capLine('BREAK ANY ONE',18,0,tx,m.y+82, 20,'#000080','#c0c0c0');
> capLine('AND IT SPOILS.',18,5,tx,m.y+118,20,'#000080','#c0c0c0');
> ```
>
> **Three or four bulleted takeaways, then the close in two short lines.** The
> bullets are the piece's own takeaways — the same ones the strip has been
> building all the way down — so the window is a recap of what was established,
> not a restatement of the last sentence. The strip stands down while it is up,
> because printing them twice is just printing them twice.
>
> **And it is simple because it cannot be anything else.** `capLine()` with a
> null font is VT323, which advances about **one pixel per character per point
> of size**. The text column inside `BOX` is **292px**, so the hard limits are
> **20 characters at 14px and 14 characters at 20px.** That is why #001's
> bullets are single words, and it is the reason a long closing line physically
> cannot be set here. **Write to the box, not to the sentence.**
>
> The box also opens on the **first** word of the closing sentence, so the
> overview BUILDS line by line instead of arriving whole — the same rule as
> v4.14's, applied to five rows instead of one.

> **v4.14 (2026-11-12)** — **the closing box was retyping the narration, which
> is rule 10, and rule 10 has never once been enforced.** Reported by the user
> watching #015: *"the end card is way too long, it starts typing before the
> card appears, it turns up half-filled, and the grammar isn't proper."* All
> three are real, and the answer to *is this following the guidelines* is **no**.
>
> **1. It is a violation, not a gap.** Generation rule 10 has said *"print the
> CAPTION, not the raw spoken words"* since **v2.x**. v4.7 restated it, gave the
> research behind it, and said it applied **from the next piece**. Seven pieces
> were then built — #015 to #021 — and **every one of them piped its closing
> sentence straight into a dialog through `typeWrap()`**: 25 words in #015, 34
> in #017, 28 in #021. The cause is not subtle. **Nothing checked**, and the
> end-box pattern was copied forward from piece to piece, so one unchecked
> mistake reproduced itself seven times. A rule with no sweep is a comment.
>
> **2. It opened part-filled because of what `typeWrap` is.** It prints
> *everything said so far*, so a window that opens mid-sentence opens already
> holding every word spoken up to that instant — #017's box appeared with 23 of
> its 34 words in it. **A window and the line inside it are gated on the SAME
> word**, and then it types from empty.
>
> **3. The fix is the one this file already prescribed.** The closing box now
> carries a short abridged clause, in Silkscreen, answering the question in its
> own title bar: `where money comes from` → `THAT IS A BANK.` Note the font —
> `capLine()` with a null font is **VT323 at ~16px per character**, and a
> 27-character line measured 435px against a 432px screen.
>
> **4. `checkNarration()` is the FIFTEENTH sweep.** It reassembles the drawn
> text in draw order before comparing, because `typeWrap` breaks a sentence into
> rows and the first version of this sweep, looking at items one at a time,
> returned **clean on a box containing all 25 words.** It flags only *retyping*
> — eight words and over half the sentence — never quoting, because a caption
> carrying the load-bearing clause is made of the sentence's own words and that
> is the rule being obeyed. The two legitimate cases are **declared** in
> `PIECE.verbatim`: the narrated question card, and a deliberate quotation
> (#016 prints the Bank of England's own sentence, which is the beat). Pieces
> #001–#014 are grandfathered by v4.7's own clause.
>
> **5. And the gap, which is separate: a caption appeared ALONE and LATE.**
> Three of #015's six landed in the **last quarter of their beat** — the strip
> sat empty for most of it, flashed one line, and the next beat wiped it.
> Nothing accumulated, so nothing built. **Takeaways now stack like the bullets
> of a slide:** each types in under the one before it and stays, three at a
> time, the oldest dimming off the top, so at any moment the viewer can see what
> the piece has established. This is a new rule, because nothing in this file
> said when a caption should appear or how long it should live.

> **v4.13 (2026-11-12)** — **a window that is BURIED is as broken as one that
> buries, and `checkCard` only ever asked the second question.** Reported by the
> user watching #015: *"the part one box is completely underneath and behind the
> gag, you can't even see it."* Correct — "PART 1" was a sliver of blue behind a
> bank, and the same fault was in #016 and #019. Four things had to line up:
>
> 1. **`partCard()` was called BEFORE the cold open drew its object**, so the
>    desktop object painted over the window. On a Win95 desktop the window is in
>    front, always. The card now draws **last** of the cold open.
> 2. **`PART_FLOOR` already existed for exactly this**, and this file already
>    said pieces should read it rather than carry 358 as a literal — **and not
>    one of the five read it.** All of them now do.
> 3. **The registered box is not the stated `y`.** `bankBuilding()` reserves
>    18px above its origin for the pediment and `loaf()` is positioned by its
>    CENTRE, so an object whose top looked 6px clear of the card still overlapped
>    it by 12 and 15. **Clear the card against the box a piece REGISTERS, not
>    against the number passed in** — `_detail.mjs` prints the overlap.
> 4. **No sweep could see any of it.** The cold open's objects go into `SCENE`,
>    which only `checkFraming` ever read, and `checkCard` compared windows
>    against `BOUNDS` and `GBOX` only — and only against items drawn *before*
>    the window. A window could therefore be completely covered with all
>    fourteen at 0. `winFrame()` now records `ns`, the depth of `SCENE` when the
>    window opened, and **`checkCard` flags anything pushed after that which
>    overlaps it.** Verified against a deliberately broken control before being
>    trusted: it reports `buriedBy:"town", overlap:[160,14]`.
>
> The general rule, which is the third time this file has had to write a version
> of it: **a sweep can only see what the piece hands it, and a list nothing
> compares is not a check.** `SCENE` had been write-only for every sweep but one.

> **v4.12 (2026-11-12)** — **a stamp is also a no-repeat.** A full-library
> audit found #007 `sweat` and #020 `wrinkle` shipping the **same stamp**,
> `NOT THE WATER`, and the second one was wrong on its own terms: #020's script
> says out loud that the skin *does* soak up water and that this is not what
> makes the ridges, so the thing it denies is the **swelling**, not the water.
> It ships as `NOT SWELLING`. Two pieces wearing one stamp is the gold tag
> saying the two episodes kill the same belief, which is the no-repeats rule in
> three words — so **the stamp goes in the no-repeats table with the mechanism,
> and no two pieces may carry the same one.** No sweep can check this: a stamp
> is one short string in `PIECE`, and nothing reads the other twenty. Grep them
> all before adding one — `grep -ho 'myth:"[^"]*"' */piece.js | sort | uniq -c`
> prints the whole library in one line.

> **v4.11 (2026-11-12)** — **two things no sweep can see, both found in series
> D with all fourteen returning 0.**
>
> **A stamp names the answer it kills, never the one it gives.** Every stamp in
> the library is a negation of the folk answer — `NOT THE AIR`, `NOT A VAULT`,
> `NOT INTERMEDIARIES`, `NOT YOUR LUNGS`, `NOT THE WATER`. #017 was built with
> `the ruler moved` and #018 with `the debt moves`, which state the piece's own
> conclusion instead, and each fails differently. The first **gives the turn
> away in the cold open**: #017 spends its whole length walking the viewer from
> *bread got dearer* to *the unit shrank*, and the stamp announced the
> destination before the first beat. The second is **simply false** — #018's
> finding is that the interest/principal split migrates while the debt barely
> moves for eighteen years, so `the debt moves` contradicts the piece it is
> stamped on. The rule the library had been following without writing down:
> **the stamp is the wrong answer, crossed out.** It is what the viewer believes
> walking in, in three or four words. If it cannot be written as a negation, the
> misconception has not been found — and inventing one is already forbidden
> above. They ship as `NOT THE BREAD` and `NOT THE DEBT`.
>
> **A number on screen must be the number the narrator says.** #018's card
> formatted the monthly payment through `Math.round`, printing **$1,799**
> beneath a narrator saying *"one thousand seven hundred and ninety-eight"* —
> and beneath its own caption, `$1,798.65 x 360`, **in the same frame**. Three
> statements of one quantity, two of them disagreeing. #020 did the same thing
> in one glance: `−27.6%` under the bar and `−28%` in the readout card directly
> below it, on screen together, and with two different minus signs because
> `toFixed()` hands back an ASCII hyphen where every other figure uses U+2212.
> **Display formatting is a content decision, not a presentation one.** A
> rounded number is a different claim from the one the voice makes, and the
> sweeps read geometry, not arithmetic — they confirm the glyphs fit the box and
> can never tell you the box is lying. Read every rendered number against the
> sentence it plays under; the figures are in `script.json` and the formatter is
> three lines from them.

> **v4.10 (2026-11-12)** — **a series may run to eight parts, and the rules
> that matter are not the ones a validator can check.** `checkPiece()` capped
> `part.of` at **4**, written when C was the only series that existed and this
> file's series section was titled *"three pieces, one question"*. `IDEAS.md`
> has meanwhile planned a five-part **D** and **E** and two eight-part series,
> so the ledger and the code disagreed — and the disagreement was **invisible
> until a five-part part was actually built**, where it would have failed its
> own sweep at the END of the build rather than the start. The cap is now
> **2–8**. This buys nothing on its own: the binding constraints on a series
> are *every part stands alone*, *one part one turn*, and *a part ends where
> its successor begins*, and **no sweep can check any of them.** A longer
> series is a bigger promise to the viewer, not a bigger number in a field.

> **v4.6 (2026-11-10)** — **a window must land on a clear stage**, and a
> **fourteenth sweep**, `checkCard()`, to hold it. #013's last beat drew the
> piece's closing statement on the stage and opened the summary dialog over it
> in the same instant: the answer to the question the piece had spent ninety
> seconds asking spent its five seconds underneath a window, with all thirteen
> sweeps returning 0. Three things made it unreachable — `checkOverlap` exempts
> any pair that straddles the overlay boundary (correctly: a window IS opaque),
> chrome is skipped, and **the window plate is not a text item**, so there was
> nothing to collide with. The missing fact was never a rectangle; every
> rectangle was already registered. It was the **draw order**. `winFrame()` now
> records the lengths `BOUNDS` and `GBOX` had when it ran, and anything with a
> lower index than that is underneath it. See *A window lands on a clear stage*.
>
> **v4.9 (2026-11-12)** — **a model read at a compressed rate is motion, and it
> can alias.** #014 drew its orbiting cars from the 12 fps content tick at up to
> 19.7x compression, advancing them 130% of a car spacing per tick, and the ring
> read as running **backwards** through three beats. Drawn from `M` now, at one
> constant 2.5x, with the per-frame advance asserted over every rendered frame.
> No sweep can see this: every single frame is correct. Also: the myth-stamp
> rule now tests the TITLE rather than the subject, because a title that states
> an absence settles the myth as finally as one that contradicts it, and #014
> shipped `NOT A CAUSE` under the title "the traffic jam with nothing in front
> of it". And a guard that checks one of two runs is guarding neither — #014's
> controller drove into the back of the queue for a whole beat behind an
> assertion that only ever read `RUN_H`.

> **v4.8 (2026-11-12)** — **every sentence names what moves.** The script is now
> written as two columns — spoken line, and the thing that MOVES while it is
> spoken — and a sentence that cannot fill the right-hand column does not go in
> the script. A label appearing, a number appearing, a plate landing and a caption
> typing **do not count as movement**; something arriving, changing state,
> travelling, being counted or being compared does. #012's right-hand column,
> filled honestly, would have read *a line gets taller · the line stops · a number
> appears · a shorter line appears · three plates appear · two more lines appear*
> — **six sentences and one event**, visible in a table that takes ten minutes.
> The table is also how the v4.7 abridged caption is found: the caption is
> whatever names the thing in the right-hand column. See *Every sentence names
> what moves*.
>
> **v4.7 (2026-11-12)** — **a gate before the storyboard, and the caption rule
> gets its evidence.** #012 (the straw) was built, rendered, pushed and scrapped:
> derivable to the last digit, clean at −14 LUFS, **0 on all fourteen sweeps**,
> and unwatchable. The subject was picked on one filter — *can I verify every
> number* — and that filter cannot see the two things that actually killed it.
> Its beats joined with **"and then"** six times (a list, not an argument) and its
> subject was a **quantity, not a thing** (nothing on screen you have ever
> touched). Both were visible before a frame was drawn. See *Does the idea work?*
> for the five-line gate, which is now mandatory before a storyboard. The gate
> was then control-tested against four known-good pieces and the scrapped one,
> which found two defects in it — see `gate-test/STRESS-TEST.md`.
>
> And the research pass that came out of it found this file was **already right
> and already ignored**: generation rule 10 has said *"do not retype the sentence
> as the caption"* since v2.x, and all thirteen pieces hand `typeWrap()` the
> literal spoken words. Mayer's redundancy principle says what that costs
> (d ≈ 0.87 against narration alone), and Yue/Bjork/Bjork add the sharp part —
> **abridged** text beats identical text, while viewers *prefer* identical text
> and do worse with it. Captions are abridged from the next piece on; the
> thirteen keep theirs. The same pass confirmed **temporal contiguity** (d ≈ 1.30,
> the largest of the five) is the thing this format already does better than
> almost anything, by hanging the picture off measured word onsets. **Do not
> trade that away.** See *How it is displayed*.
>
> Also recorded there: **there is no retention statistic worth quoting.** Every
> "first three seconds" number findable is a vendor blog and they contradict each
> other (3s retention given as 28%, 32%, 50–58%). The hook rule stands on
> Loewenstein's information-gap theory instead, which is a real literature: the
> gap **only opens once a question is activated**, which is why the cold open must
> ask rather than assert — the mechanism, not a preference.
>
> **v4.6.1 (2026-11-11)** — **documentation only.** The Enforcement table named
> ten sweeps of the fourteen that exist: `checkPiece`, `checkChrome`,
> `checkFraming` and `checkEndCard` were never added to it, `checkEndCard`
> missing since the v4.0 entry that introduced it. Nothing in the code changed.
> The table did, and it now states that it is the whole set and that `sweep.mjs`
> runs exactly those names — so the next time the two drift apart, the document
> says which one to trust. A rule nobody can see enforced is advice, and this
> file has already been bitten once by advice (`PART_FLOOR`, v4.4).
>
> **v4.5 (2026-11-10)** — **a shape must stay inside the shape that contains
> it**, and three more ways the sweeps were quiet. #012 ruled a round wafer into
> square dies by testing each die's CENTRE against the radius, so dies hung 8px
> out over the edge of the disc and into the caption above it — the shot's whole
> claim is a round thing divided into square things. **Test the corners.** Also
> new: `checkOverlap` now compares **a plate with another plate** (#012 laid
> SAME SILICON, TWO PRODUCTS across the bottom half of both bin labels and no
> sweep could see it); `checkPointerIdle` finally implements the exemption its
> own comment has promised since v2.6, **positionally** — the hand is excused
> where it last acted, not for a second after acting; and three keys that were
> never containers (`wavebox`, `wafermapbox`, `cutmapbox`) gave their `*box`
> suffix back — found by renaming all 31 of them and reading what fired, which
> is a procedure now.
>
> Two more, found after the first four were fixed. **The card REGISTERS**: v4.4
> added `PART_FLOOR`, told pieces to read it rather than carry 358 as a literal,
> and no piece ever read it, so the clearance was advice. `partCard()` files its
> two windows in `GBOX` and `checkOverlap` measures them like anything else —
> which needed the card's own title marked `INCHROME`, because the words inside
> a dialog are the dialog. And **a case-sensitive regex ate an index remap**:
> the re-cut shifted every sentence index with `\b(wordAt|after|typeWrap|w)\(`
> while the pointer acts are written `W(n,i)`, so every scene moved and every
> act stayed. #012's DUST tap fired thirteen seconds early, during SHEET, and
> parked on the wafer map. **Nothing drawn was wrong, so no sweep had anything
> to measure** — after any index remap, diff the `W(` set against the `wordAt(`
> set. See *A shape stays inside its container*, *The `*box` suffix*, *The
> pointer is excused where it acted*, and *Series*.
>
> **v4.4 (2026-11-10)** — **a part opens on ONE card, and the card talks.**
> It was two: the series card, and then the piece's own question in the cold
> open — two questions put to the viewer before anything had been explained,
> and neither of them was *the* question. The series question is now the only
> one, it is **narrated while it types**, the part number **pops out from under
> it** and is **said**, and the two windows are dismissed in the order they
> arrived: OK, then the X. **Part one no longer gets a recap** — it has nothing
> to hand over, so it opens on a question. See *Series*.
>
> Three things that were quietly true for months: `solidShape()` filed its
> extent in `SCENE` and not in `GBOX`, so **no drawn object was visible to
> `checkOverlap`**; the graphic-vs-graphic test only ever compared `tag:* vs
> voxbar`, so a plate on anything else could not be found; and #010's puller
> was filed from `Q.rod+36`, 36px below where it was drawn, **and** named
> `pullerbox`. Each of the three on its own was enough to report a clean 23px
> gap through a caption the rod was drawn straight across. All three fixed, and
> `checkPiece`'s duration gate no longer refuses a standalone built to v4.3's
> own target. See *Register what you draw* and *Shapes a sweep cannot see*.
>
> **v4.3 (2026-11-10)** — **the running-time target is 85–110s, not 65–75.**
> Twelve finished pieces settle it: the nine built to the old bar all land
> between 66.6s and 73.5s and each one stops just as it gets going, while the
> three built to the longer bar (102.3s · 104.2s · 92.3s) are the better pieces.
> The old rule said to get there "with breath, not with padding"; that was right
> at 70s and wrong at 100s. **The gaps do not move** — the length comes from a
> third mechanism. See Running time.
>
> **v4.2 (2026-11-10)** — the part card is a PAIR of windows: the series title,
> the same on all three parts, and the part number in its own small one below
> it. It says "PART 2", not "PART 2 OF 3". **The recap left the card and became
> the first spoken beat on the blackboard** — a dialog box is furniture, and the
> one thing a viewer needs was set in the smallest type in the piece. `BEAT.RECAP`
> is now required of every part; `PIECE.part.recap` is gone.
> *(It was not. The field stayed in all three parts for two days, holding a
> sentence nobody spoke. Removed for real in v4.4 — a changelog entry is a
> claim, and this one was wrong.)*
>
> **v4.1 (2026-11-10)** — an audit with instruments that do NOT read the
> registries found what the registries could not. `blockTag()` sized its plate
> from `text.length*(size*0.62)`; Silkscreen advances **0.6667**, so every tag
> past ~17 characters was drawn on a plate narrower than its own text and the
> same wrong number was filed in GBOX, which silenced checkOverlap and
> checkBounds along with it. It measures now. `realign.py` clamps word onsets to
> the length of their own wav — the monotonic nudge cascaded one caption 0.18s
> past the end of its audio.
>
> **v4.0 (2026-11-10)** — a **thirteenth sweep**, `checkEndCard()`: the sign-off
> is the one shot with no window on it, and four pieces shipped with the program
> window and the dialog both still standing behind it. The end card moved into
> the library (`endCard()`), which owns both drawing it and being the only thing
> a piece draws after `SHUT`. **A series now has to earn the name** — a `recap`,
> a part card, and parts that hand over to each other; #006-#008 were demoted to
> standalones because they did not. `isoBox()`/`isoSolid()` added, and clamped so
> a box wider than it is tall stops drawing a bowtie.
>
> **v3.9 (2026-11-09)** — a **twelfth sweep**, `checkFraming()`: a cold-open
> prop that has come to REST has to be centred on the frame. The cold open is
> the one scene with no group box, so `checkComposition` — which measures a
> band against that box — is structurally blind to it, and `solidShape()`
> registered nothing anywhere, so no other sweep could see a prop either. #005
> shipped with its block and its tree sitting 74px left of the middle and
> thirteen sweeps between them had nothing to say. `solidShape()` now files its
> own extent, a key ending in `exit` marks a prop that is MEANT to leave, and
> the status bar registers its own segments. Also **series**: `PIECE.part`
> ({n, of, first, series, titles}) makes a numbered multi-parter, all parts
> sharing the palette of part one. #006–#008 are the first one.
>
> **v3.8 (2026-11-09)** — an **eleventh sweep**, `checkChrome()`: text whose
> origin is inside a Win95 container has to stay inside it. Every sweep until
> now skipped `b.chrome` and `checkTruncation` only ever asked whether a string
> was wider than the SCREEN, so #005's question ran 29px past its own card and
> two end cards ran out through the right edge of their windows — in every
> frame, invisible to all ten. The folk answer became a **stamp above the
> card**, not a line inside it. #005's cold open is two objects.
>
> **v3.7 (2026-11-09)** — the folk answer moved onto the **question card**:
> `PIECE.myth`, drawn by `mythNote()` as a tilted gold note on a dark marker
> band under the question. It costs no narration, so it was fitted to the three
> pieces that were already shipped. #002 has none and gets none.
>
> **v3.6 (2026-11-09)** — #005. A fifth palette, `STORM`, so the rotation does
> not come back round to #001's look on the fifth piece. **Kill the common
> belief in the first spoken line** (see *Refute the folk answer*). The library
> page builder discovers pieces instead of listing them — a hard-coded list had
> silently left #004 off the page it generates.
>
> **v3.5 (2026-11-09)** — #004 built straight from this file, first time. The
> palette rotation has now been round once: DUSK, EMBER, DEEP, VIOLET.
>
> **v3.4 (2026-11-09)** — **all three pieces open this way.** The gag bank and
> the object bank are part of the format now.
>
> **v3.3 (2026-11-09)** — **the gag gets its own silence**: a beat may claim a
> longer run-up than the uniform gap, and the cold open's trick is scored in
> four phases with its own sound bank. See *The cold open*.
>
> **v3.2 (2026-11-09)** — **the cold open**: the object is already there, the
> question card opens above it, OK is pressed, the object does one trick, and
> then the window opens onto the blackboard. No headline over the sky.
> See *The cold open*.
>
> **v3.1 (2026-11-09)** — there is no question written over the intro. It is a title
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

**A simulation read at a compressed rate is motion, and it can alias.** #014
drew twenty-two cars orbiting a ring from `T`, the content tick, because the
positions come out of a model and the model felt like drawn content. Two things
followed. First, the cars are *continuous motion* and belong on `M` — the rule
above already said so. Second, and the part no rule covered: when evenly spaced
objects advance more than **half their spacing** between the frames you actually
draw, the eye pairs each one with its neighbour and the whole group reads as
moving **the other way**. #014's cars sat 10.45 m apart and its time
compression peaked at 19.7×, advancing them 13.6 m per 12 fps tick — 130% of the
spacing — so the ring ran visibly backwards through three beats and snapped
forwards again when the compression dropped to 3.9×.

So, for anything periodic driven off a model clock:

- **One constant compression for the whole piece.** Any *change* in the rate is
  itself a visible speed change, and a change large enough to cross the aliasing
  threshold reads as a reversal. #014 is a flat 2.5× throughout; buy the screen
  time you need by making the model reach its state sooner, not by speeding the
  clock up for one beat.
- **Bound the per-frame advance and assert it.** Check it at the *render* frame
  rate, which is lower than the browser's, over every frame of the finished
  piece — #014 asserts 0 backward frames and a maximum advance of 27.2% of a
  spacing. An eyeball check cannot see this: each individual frame is correct.
- **No sweep can catch it.** The fourteen sweeps read one frame at a time, and
  every frame of a reversed ring is perfectly well formed. This one was found by
  the person watching it, which is the expensive way.

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

## Does the idea work? — the gate before the gate

**Added v4.7 after #012 was built, rendered, pushed and scrapped.** That piece
was derivable to the last digit, rendered clean at −14 LUFS and returned 0 on all
fourteen sweeps, and it was still unwatchable: *"doesn't make sense, doesn't have
a lot of visual cues, I really don't understand what they're talking about."*
**Passing the checks is not the same as being worth watching.** The filter used
to pick it — *can I verify every number* — is necessary and nowhere near
sufficient. Three more, and an idea has to pass all three **before** a storyboard
is drawn.

### 1. The but/therefore test — is it an argument or a list?

Write the beats out and join them with the only connective that honestly fits.
**If the only word that fits between two beats is "and then", they are not an
argument, they are a list.** "But" supplies conflict; "therefore" supplies
consequence; "and then" supplies nothing.

This is Parker and Stone's working rule, formalised by Randy Olson as **ABT**
(And, But, Therefore) as a way to turn a scientist's *"this, and this, and
this"* into a story. The exact original wording is only in secondary sources —
treat it as a tool, not a law. The tool is what matters:

| #012, the straw — as built | |
|---|---|
| the air pushes, **and then** | the ceiling is 10.33 m, **and then** |
| Galileo was wrong, **and then** | mercury is shorter, **and then** |
| it is three units, **and then** | it boils first |

Six true facts, every one verified, joined by nothing. **That is the whole
diagnosis, and it was visible before a frame was drawn.** Compare a piece that
works:

> honey does not spoil, **but** it is mostly water, **therefore** something must
> be stopping the microbes, **but** it is not a preservative, **therefore** it is
> the water itself being unavailable…

**Write the chain into the build dir before the script.** An idea that cannot be
chained is not ready, however good its numbers are.

### 2. The concreteness test — **what is it drawn AS?**

Concrete things are processed faster and more accurately than abstract ones;
the usual account is that an abstract idea has only a verbal code to retrieve,
where a concrete one also has an imagery code. (The *mechanism* is contested —
context-availability and Barsalou-style accounts compete with dual coding — but
the effect itself is not.)

**This line was wrong in its first draft and the stress test caught it.** It said
to reject any subject that was a quantity — which rejects **#013**, one of the
best pieces in the library, whose subject is a *probability*. The difference
between #013 and #012 is not the subject. It is what the subject is **drawn as**:

| | subject | drawn as |
|---|---|---|
| #013, works | a probability | **a million dots you can count, and a bar split 99 against 9,999** |
| #012, scrapped | a pressure | **a line, with numbers beside it** |

**So an abstract subject is fine if it can be rendered as a countable, changing
thing. It is fatal when it can only be rendered as a value.** Name the subject,
then name the thing on screen that stands for it, and check that the second one
can be *counted* or *watched changing*. "A jar of honey", "twenty-two cars in a
circle", "a million dots" pass. "A column with a number next to it" does not.

### 3. The been-inside-it test

Curiosity is a gap between what someone knows and what they want to know, and
the gap **only opens once a question is activated in their mind** (Loewenstein
1994, *Psychological Bulletin*). It pulls harder when the missing information
feels important, salient, and likely to be resolved.

**So the cold open must ASK, not assert** — that is not a stylistic preference,
it is the mechanism by which anyone starts caring. And the gap is widest when
the viewer has personally been inside the phenomenon: a jam with no cause, a
fever that makes you cold, a jar that never goes off. *(The popular claim that
curiosity peaks when you "almost know" the answer is unverified secondary
material — do not build on it.)*

### 4. The closes test — does the gap shut again?

Loewenstein again: the gap pulls harder when the missing information seems
**likely to be resolved**. A piece that opens a question and then declines to
answer it has spent the viewer's attention and returned nothing. Honey, ice,
metal and tests all land their answer.

**An honest "and nobody knows why" is a fine SECOND-ORDER beat and a bad
ENDING.** #025 (why fingers wrinkle) resolves its mechanism and leaves only the
*purpose* open, in the last few seconds — that passes. #104 (why a bicycle stays
up) ends on "there is no single cause", which does not, and the fix is to change
the question to one the evidence answers: not *"why does it stay up"* but
*"what is actually holding it up"*, which closes on what it **is not**, with the
open part demoted.

### The gate, as five lines in the build dir

```
SUBJECT   the subject, AND the countable/changing thing it is drawn as
CHAIN     beat -> but/therefore -> beat -> ... , no "and then" -> argument
QUESTION  the exact words the card will type, ending in "?"   -> the gap opens
INSIDE    the sentence "you have been in this" must be true   -> it is about them
CLOSES    the question asked is answered on screen            -> the gap shuts
```

All five, before the storyboard. **#012 failed four of them and would have been
caught in ten minutes.** The gate itself was control-tested against four pieces
known to work and one known to have failed before being trusted — see
`gate-test/STRESS-TEST.md`, which is also what found that SUBJECT was testing
the wrong thing and that CLOSES was missing.

## Every sentence names what moves — the paired script

**Added v4.8.** The script is **not** written and then illustrated. It is written
as two columns, and a sentence that cannot fill its right-hand column does not go
in the script.

```
| # | spoken                                    | WHAT MOVES                        |
|---|-------------------------------------------|-----------------------------------|
| 1 | "Twenty-two cars, one circle, no junction"| 22 dots take even spacing, orbit  |
| 2 | "Everyone asked to hold thirty"           | speed readout settles, all green  |
| 3 | "One driver brakes a little harder"       | ONE dot reddens, its gap closes   |
```

**The test is the right-hand column, and it is brutal:** if the only thing you
can write there is *"the number appears"* or *"the label lands"*, the sentence is
narration with a caption, not an explainer. Text arriving is not an event.

This is the rule #012 broke everywhere. Its right-hand column, honestly filled,
would have read: *a line gets taller · the line stops · a second number appears ·
a shorter line appears beside it · three plates appear · two more lines appear.*
**Six sentences and one actual event**, and it is visible in a table that takes
ten minutes to write.

### What counts as "moves"

| counts | does not count |
|---|---|
| something **appears that was not there** — a prop, a wafer, a cube | a **label** appearing |
| something **changes state** — melts, freezes, reddens, stops | a **number** appearing |
| something **travels** — a wave, a cursor, a share being cut out of a bar | a **plate** landing |
| something is **counted** — dots filling in, a stack building | a **caption** typing |
| a **comparison is drawn** — two things put side by side, a share cut | the **beat name** changing |

The right column cannot repeat itself either. **Three sentences in a row whose
visual is "another rule drops in" is one event with three captions**, which is
how #012's last beat read.

### It is also the fix for the redundancy problem

v4.7 established that the caption must carry the **load-bearing clause**, not the
spoken sentence. The paired table is how you find that clause: it is whatever
names the thing in the right-hand column. If the right column says *"the red
spreads backwards while every dot still runs forwards"*, the caption is
`THE JAM GOES BACKWARDS` — not the sentence that said it.

### Where it lives

`SCRIPT.md` in the build dir, written **after the gate and before `script.json`**,
and it is the thing to read when the storyboard looks thin. The voice is built
from `script.json`; `SCRIPT.md` is what proves `script.json` was worth building.

## How it is displayed — what the evidence actually says

Mayer's multimedia-learning work is the closest thing to an evidence base for
this format, and three of its principles bear directly on choices this file has
already made. Effect sizes below are from Mayer 2017 (*J. Computer Assisted
Learning*); the 2014 Cambridge Handbook chapter reports different, generally
larger figures from a different study set, and at least one individual-
differences study failed to replicate coherence and signalling. **Directional,
not exact.**

### The one this format already gets right: temporal contiguity (d ≈ 1.30)

Corresponding words and pictures land **simultaneously**, not one after the
other — and it is the largest effect of the five. Cathode Desk hangs the picture
off word onsets measured from the rendered waveform, so an on-screen word appears
on the frame it is spoken. **That is the single most defensible thing about the
format. Do not trade it away for anything.**

### The one this format gets WRONG: redundancy (d ≈ 0.87)

People learn **more** from graphics + narration than from graphics + narration +
**identical** on-screen text, and the effect is specifically about text and
narration presented *at the same time*. Yue, Bjork & Bjork (2013) sharpen it:
identical text impaired recall and transfer, while a **small mismatch —
abridged text — improved** learning. Learners **preferred** the identical text
while performing worse with it, so *"it feels right"* is not evidence.

**Rule 10 of the generation rules has said "do not retype the sentence as the
caption" since v2.x. Every piece in the library does it anyway** — `typeWrap()`
is handed `VO[n].w`, the literal spoken words, five to seven times per piece.
The rule was right, nothing enforced it, and the research says what it costs.

**Going forward the caption carries the sentence's load-bearing clause, not the
sentence.** Not a summary of the beat — the few words that the picture is
actually about:

```
spoken:  "A hundred and one kilopascals holds up ten point three metres
          of water, and no more."
caption: 101 kPa -> 10.33 m. AND NO MORE.          <- abridged, not verbatim
```

**The ending is an OVERVIEW (v4.15).** The closing window is an information
dialog: three or four **bulleted takeaways**, each arriving on its own spoken
word, then the close in **two short lines**. The bullets are the piece's own
takeaways, so the window recaps what was established rather than restating the
last sentence, and the caption strip stands down while it is up. **#001 `honey`
is the model.** The limits are physical: `capLine()`'s null font is VT323 at
about one pixel per character per point, and the column inside `BOX` is 292px —
**20 characters at 14px, 14 characters at 20px.** Write to the box.

**Takeaways ACCUMULATE (v4.14).** A caption used to appear alone, be wiped by
the next beat, and leave nothing behind — and three of #015's six landed in the
**last quarter of their beat**, so the strip was empty for most of it. Treat the
strip as the bullets of a slide: each takeaway **types in under the one before
it and stays**, three at a time, the oldest dimming off the top. A viewer who
looks up mid-piece can then see what has been established, and a viewer on mute
has a running summary instead of one line that flashes and goes.

**And gate a takeaway EARLY in its beat**, on the word that makes it true, not
on the last words of the beat. A line that arrives with three seconds left is a
footnote to a beat that has already finished.

**The boundary condition that keeps captions at all:** short-form video is
watched on mute, and Mayer's own exception is for cases where on-screen text
carries something the viewer needs. A muted viewer has no narration channel, so
removing text entirely is wrong for this medium. **Abridged, not absent.**

The thirteen pieces built before v4.7 keep their verbatim captions; this is not
worth re-rendering a library for. It applies from the next piece.

### Coherence (d ≈ 0.70) — the beat that only exists for completeness

Extraneous material hurts, even when it is true and interesting. **A beat that
adds no link to the chain is extraneous by definition.** #012's "three ways of
writing one number" beat added a fact and no causal step; it was the right thing
to cut and the but/therefore test would have cut it.

### Signalling (d ≈ 0.46) — weakest of the five, and already handled

Cue the essential material: the gold hero number, the takeaway plate, the
phosphor flash on the key moment. Already in the format. Being the weakest
effect, it is not worth adding more of.

### On retention statistics: there are none worth quoting

Every "first three seconds" figure findable is a vendor blog, and they
contradict each other badly — 3-second retention is given as 28%, 32%, 50–58%;
first-three-second drop-off as 45%, 50%, 55%. No platform-published or
peer-reviewed numbers surfaced. **The defensible claim is only that the opening
seconds carry disproportionate weight and the magnitude is not reliably known.**
Do not put a retention statistic in this file or in `UPLOAD.md`. The hook rule
stands on Loewenstein, which is a real literature, not on a marketing blog.

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

**Target 85–110 seconds. Never under 65.**

Measured, finished: honey **71.7s** · halloumi **69.4s** · ice **73.5s** · sky
**66.6s** · metal **71.4s** · shiver **67.4s** · sweat **67.7s** · fever
**70.6s** · glass **67.9s** — then the chip series, built to the longer bar:
sand **102.3s** · litho **104.2s** · fab **92.3s**. The first nine sat on the
old 65–75 target and every one of them stops just as it gets going. The three
that ran past 90 say more and are the better pieces.

**Get there with a third mechanism, not with wider gaps.** The gaps stay at
**0.75s between sentences and 1.85s between beats**. Widening them from
0.45/1.20 to those values is what took honey from 59.6s to 70.1s, and that was
the right fix at the time — but they are already about 35% of the running time,
and widening them again is dead air, not pacing. A longer piece is longer
because it *says more*, at the same cadence.

**The arithmetic:** hook (1 beat) + two mechanisms (2 beats each, one of them
charted) + the turn (2 beats) + a second-order consequence (1–2 beats) +
takeaway (1 beat) = **9–11 beats · 190–240 spoken words**. A piece standing on
one mechanism runs 30s and then repeats itself; if the second leg cannot be
named before storyboarding, the episode does not exist yet. `IDEAS.md`
annotates every entry with the legs it stands on for exactly this reason.

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
    sentence as the caption. **Enforced since v4.14 by `checkNarration()`, the
    fifteenth sweep** — this rule stood unchecked from v2.x and was broken by
    every one of the seven pieces built after v4.7 said it applied. Legitimate
    verbatim printing (the narrated question card; a deliberate quotation) is
    declared in `PIECE.verbatim`. **A window and the line inside it are gated on
    the SAME word**, or the window opens already holding everything said so far.
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

Every rule above is checked by a sweep, and all **fifteen** must return **0**.
**This table is the whole set** — `sweep.mjs` runs exactly these names, so if a
sweep exists and is not listed here, one of the two is wrong.

| sweep | catches |
|---|---|
| `checkPiece()` | the registry itself: a bad tag, a short blurb, a running time outside **65–115s** (a part: 82–115s), an incoherent `part` block |
| `checkLegibility()` | type under the floor |
| `checkBounds()` | anything leaving the window's client area |
| `checkStraddle()` | a label lying across the group box border |
| `checkOverlap()` | label on label, label on graphics, **plate on stack** |
| `checkTruncation()` | a string cut by the rasteriser or running off the screen |
| `checkClearance()` | anything inside the box with under 6px of air around it |
| `checkPointerJumps()` | the pointer moving more than 95px in one frame |
| `checkPointerIdle()` | the pointer sitting still on top of content for over 0.8s |
| `checkComposition()` | a beat's content sitting off-centre in the box, or filling too little of it |
| `checkChrome()` | a string overflowing the innermost window frame it sits in |
| `checkFraming()` | a prop escaping the client panel, or the scene off-centre once it has settled |
| `checkEndCard()` | a window still open over the sign-off — or no end card at all |
| `checkCard()` | a floating window opening on top of stage content |

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
one of five palettes picked by its number: `DUSK`, `EMBER`, `DEEP`, `VIOLET`,
`STORM`. Add one rather than let the rotation wrap: #005 would otherwise have
been #001 again.
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
missing blurb, and a running time outside **65–115s** (a part: 82–115s; see
*Running time*). A library stops being
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

### The cold open

**Full frame on the desktop, before the program window exists.** Four moves,
in this order, and nothing else:

1. **The object is already there.** Not introduced, not drawn on — present
   from the first frame, on the vibrant sky, with the sea line across it.
2. **The question card opens above it.** The Win95 dialog carries the piece's
   title question and types it out. It sits in the top half; the object owns
   the bottom half. That is why `DLG` is at y=150.
   > **A SERIES PART HAS NO CARD OF ITS OWN HERE.** Its card asks the series
   > question and is narrated (see *Series*), and a second question underneath
   > it meant two questions were put to the viewer before anything had been
   > explained. A part keeps steps 1, 3 and 4 — the object, the press, the
   > trick — and its hook becomes the first line on the blackboard. The press
   > that starts the trick is the X on the part window, not an OK of its own.
3. **OK is pressed, and the card closes on the press** — nothing stands in
   front of what happens next.
4. **The object does one trick, and the trick is a joke.** The iceberg cracks
   and sinks. The honey jar gets carried off by a bee. The halloumi turns into
   a cow and walks away.

**The gag gets its own silence.** A beat may claim a longer run-up than the
uniform `gap_beat` by declaring `gap_before` in `script.json` — the cold open
takes **3.50s** instead of 1.85. Squeezing press, card-close, pause and trick
into the standard gap read as a glitch rather than a joke. The run-up is a
timeline decision, made before anything is synthesised; never speed the trick
up to fit a gap.

**Phases, off one press:**

```
okT        press; the card starts closing (it shrinks toward its own centre)
okT+0.22   card gone
okT+0.72   the trick starts -- half a second of nothing first
  +0.42    the crack has drawn
  +0.42..  the object comes apart and goes
  +1.05    it lands
  +1.70    the last of it fades, and the window opens on the blackboard
```

**Score it in four voices, not one.** A snap, a wash and a thump are different
sounds and a gag needs all of them: `crack` is the event (three or four of
them, 0.13s apart, detuned), `crumble` is the consequence (overlapping washes),
`sub` is the weight, `splash` is the landing. One `knock` where all that should
be is why the first cut of this read as a glitch.

**Two objects, not one, once it breaks.** Intact it is one silhouette with
seams between its faces; split it is two, each with its own black-and-rim ring.
Stroking every *face* instead turns it into stained glass.

**The card holds its contents for the first third of the close.** Shrinking a
blank full-size card from frame one reads as the dialog blinking out, not as
it closing.

**What the three have:**

| # | object | trick | sound |
|---|---|---|---|
| 001 honey | a jar on a shelf: amber body in three tones, metal lid, fill line | a bee flies in, hooks the lid and takes the whole thing up and out, leaving a couple of drips | `buzz` under it, `tag`+`knock` as it takes the weight |
| 002 halloumi | a block on the board: one isometric cuboid, three faces, rind line | it squashes once, pops, and walks off as the cow it came from, kicking dust | `knock` ×2, `mos`+`zap` on the pop, `moo`, hoofbeats |
| 003 ice | a berg in the sea: six faces, lit lip, striations below the water | it cracks, the halves tip apart and go under, rings spread | `crack` ×4, `crumble` ×4, `sub`, `splash` ×2 |
| 004 sky | a cloud: body, lit lobe, scalloped underside | it leans, darkens, rains on nothing in particular and slopes off left | `sub`, nine `click`s for the shower, `mos` |

**The card owns the top half.** Every object has to sit clear of `DLG`, which
ends at y=306. The cloud was drawn at the height a cloud goes and spent the
whole cold open behind the dialog.

**A trick is two frames minimum.** `bee`/`bee2` and `cow`/`cow2` are a wingbeat
and a walk cycle; a single frame translating across the screen is a prop being
dragged, not a thing that is alive.

Then the window opens on the blackboard and the piece is a program from there
to the end card. **No headline, no caption, no question text over the sky** —
the only words in the whole cold open are the ones inside the dialog.

**The water hides what goes under it.** The sink needs a clip line that sweeps
up to the waterline over the first fifth of the gag; without it the berg just
translated down the screen and sat there, perfectly visible, on top of the
sea. The submerged mass goes with it, which is the point of the clip sweeping
rather than snapping.

**This replaces two earlier attempts at an intro**, both of which asked the
opening to do more than an opening is worth:

- **v2.9** wrote a question on the sky and typed it slowly across the beat —
  spelling out `SO WHY DOES WATER EXPAND?` for four seconds while the narrator
  was saying *"Almost everything shrinks when it freezes."* Two unrelated
  texts at once, in a piece whose whole rule is that the screen says what the
  voice is saying.
- **v3.0** fixed the sync by putting the question *into the narration* as a
  third spoken line. It synced perfectly and was still too much: a statement,
  an exception, a question and an object, all before anything was explained.

The narration is **unchanged** by any of this. The cold open plays over the
piece's existing first line, and the beat that used to be the title card is a
normal blackboard beat with a diagram like every other one.

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

## Refute the folk answer

> **On a part, the folk answer goes on the BLACKBOARD**, not on the card: a
> part's card asks the series question and carries nothing else. #010 puts it
> in `BEAT.OPEN` — *"sand. But you cannot make one on a beach."*

**If there is a well-known wrong explanation, kill it on the question card** —
before any mechanism, while the question is still the only thing in the viewer's
head. Ice floats *because there is air in it*; the sky is blue *because it
reflects the sea*; metal *is colder than wood*. Someone who arrives holding the
wrong answer is not listening to the right one, they are waiting to see whether
you agree.

**It is a declared field, not a drawing.** `PIECE.myth` is two or three words;
`mythStamp()` places it identically in every piece — a **stamp standing on its
own above the card**, landing on the question's **last word**.

- **Not inside the dialog.** The first cut wrote it under the question, where it
  read as a second line *of* the question, which is the one thing it must not
  be. A stamp is a separate object that was applied to the screen afterwards.
- **Tilted by stepping integers**, both the plate's columns and the text's
  characters — never by rotating the canvas. A rotation resamples the baked
  glyphs and the pixel grid is the whole format.
- **Gold on an ink plate with a gold border.** Gold straight onto the Win95 face
  grey was barely there; under the bloom that dialog reads almost white.
- **It costs no narration**, which is the point: #001, #003 and #004 took it
  after they had shipped, with no re-synthesis and no re-timing.
- **If the title already settles it, there is no stamp.** #005 asks *why does
  metal feel colder than wood* and answers *it isn't colder* in its first spoken
  line; stamping `NOT COLDER` over that is the same sentence twice.

  **The test is the TITLE, not the subject.** #003 is "why ice floats", which
  says nothing at all about trapped air, so `NOT THE AIR` has work to do — it
  reaches a belief the title leaves standing. #014 is "the traffic jam with
  nothing in front of it", which *already asserts there is no cause*, so
  `NOT A CAUSE` only restates the title. Both pieces have a real, widely held
  misconception behind them; the difference is whether the title has already
  dealt with it. A title that **states the absence** settles the myth just as
  finally as #005's title **contradicts** it, and #014 shipped with the stamp
  anyway because this rule read as being about contradiction alone. Say the
  title out loud, then say the stamp: if the second is contained in the first,
  there is no stamp. A tag that restates its title teaches the viewer that the
  gold tag is decoration, which costs every later piece that needs one.

- **No two pieces carry the same stamp.** It belongs in the no-repeats table
  beside the mechanism: an identical tag on two episodes claims they kill the
  same belief. `grep -ho 'myth:"[^"]*"' */piece.js | sort | uniq -c` is the
  check, and nothing automatic does it.
- **The stamp is a negation — the wrong answer, crossed out.** It names what
  the viewer believes walking in, never what the piece concludes: `NOT THE
  AIR`, `NOT A VAULT`, `NOT INTERMEDIARIES`, `NOT THE BREAD`. A stamp that
  asserts the true thing either gives the turn away before the first beat
  (#017's first draft, `the ruler moved`) or contradicts its own piece (#018's,
  `the debt moves`, over ninety seconds showing the debt barely moving). If it
  will not take the word *not*, the misconception has not been found yet.
- When it is spoken too, it is **one short sentence**, three or four words, and
  it gets a **picture of its own**: in #005 the word `COLDER` is printed large
  and the pointer strikes it out, and it is gone before the first bar lands.
- The piece does not then argue with the folk answer. It states that it is
  wrong, once, and spends the rest of the time on what is actually true.
- **If there is no common wrong answer, skip it.** Inventing a misconception to
  knock down is worse than not having one: it tells the viewer that something
  they never believed is now their problem.

**The word must clear before the thing that replaces it arrives.** The fade is
written off the END of its own sentence (`VO[n].z`), never off a word inside the
next one — "a" and "steel" in #005 are 70ms apart, and a 0.40s fade across that
gap put the struck-out word inside the first voxel bar.

## The eleventh sweep: text stays inside its box

`checkChrome()` takes every string whose top-left corner falls inside a
registered Win95 container — a title bar (minus the close button) or a window's
client area — and requires the whole string to be inside it.

**Nothing swept chrome before v3.8.** `checkBounds`, `checkTruncation`,
`checkOverlap` and `checkLegibility` all begin `if(b.chrome) continue;`, and
truncation only ever compared a string against the width of the SCREEN. So a
question that ran 29px past the edge of its own card, and two end cards whose
lines ran out through the right edge of the window, were present in every frame
of a shipped piece and no sweep could see any of them. A person watching it
found them.

The rule it encodes: **a container is a measurement, not a suggestion.**
`winFrame()` registers its own two rects, so the check costs the piece nothing
and a new window is covered the moment it is drawn.

## The twelfth sweep: a scene at rest is centred

`checkFraming()` sweeps the props — everything `solidShape()` drew — and holds
two different rules on purpose:

* a prop **in motion** only has to stay inside the client panel. It is allowed
  to fly, crouch, launch and topple.
* the moment the scene **stops moving** — three sampled frames with an
  unchanged span — the combined left-to-right extent of everything in it has to
  be centred on the frame, within 26px.

**The cold open had never been measured at all.** `checkComposition` works
against the group box, and the cold open does not have one; `solidShape()`
returned a bounding box to its caller and registered it nowhere. So #005 went
out with its two props 74px left of centre, and nothing in a format with eleven
sweeps could say so. A person watching it said so.

Two conventions carry it, and both are names rather than special cases:

* **`solidShape(..., key)` files its own extent** in `SCENE`, the way
  `winFrame()` files its own containers. A new prop is measured the moment it
  is drawn.
* **a key ending in `exit` is exempt.** #004's cloud slopes off to the left on
  purpose, so it is `'cloudexit'`. Same idea as the `*box` suffix that marks a
  container — the name carries the exemption and a new piece gets it free.

The rule it encodes: **a still is a composition.** A gag that ends off to one
side is a framing error even though every pixel of it is on screen. Where a
centred BEFORE and a centred AFTER cannot both fit, that is the geometry
telling you the gag is wrong — #005's tree had to fall back over the metal
instead of away from it, which is also what kicking the foot out of a standing
pole actually does.

## The `*box` suffix is a promise, not an escape hatch

A GBOX key ending in `box` marks a **container**: a surface that text is
deliberately drawn on top of, so `checkOverlap` and `checkPointerIdle` leave it
alone. A finger with `33°C` printed on it is a container. A slab with a
temperature on it is a container.

**It is not a way to quiet a complaint.** Building #006, #007 and #009 I named
three ordinary objects `tankbox`, `rungbox` and `flowbox`, and all three went
on to cover something:

* #006's sugar tank lay straight across the `REST` and `SHIVERING` tags and
  hid both of them completely.
* #009's packed rungs had `ABSORBED, ALL OF IT` printed across the middle of
  them, unreadable.
* #007's flow column was the one honest one — the arrows really are a surface
  nothing is written on.

All thirteen sweeps returned 0 through every one of those frames, because the
name told them to. Before naming something `*box`, ask whether text belongs
*on* it. If the answer is no, it is a thing, and let the sweep do its job.

### Auditing it

"Only looking found them" was true for a year and it is not good enough, because
**a wrong `*box` is invisible by construction** — it silences the three sweeps
that would have objected. There is a procedure now.

The rule (*it is a promise, not an escape hatch*) was already here. What was
missing was a way to check it, because a wrong `*box` is invisible by
construction — it silences the three sweeps that would have objected.

**The audit: rename every `*box` key in the library to drop the suffix, run the
sweeps, and read what fires.** 31 keys, ~47 overlaps. Then classify each hit:

* **text the container is there to carry** → the name was honest. `33°C` on a
  finger, `Si` on an atom, `RESIST` on a stack, `TARGET`/`YOU` on an axis,
  `ICE` on a lake. 28 of the 31 were this.
* **anything else landing on it** → the name was a lie, and it had been hiding
  something. Three were: `wavebox` (nothing is written on a sine wave — it was
  hiding a 143px collision with `NANOMETRES`), `wafermapbox` and `cutmapbox`
  (nothing is written on a wafer).

**Do this audit after any beat gains a `*box`.** The question "does text belong
*on* this?" is easy to answer wrongly while writing the draw, and the renamed
sweep answers it for you.

## Series: one question, two to eight pieces

**Written for three and still mostly phrased that way** — the examples below
are C, which was three parts. Everything in them holds for any length the
validator now accepts (2–8); where a passage says "three", read "all of them".

The standing rule is **one-offs**. A **series** is the exception, and it is
declared rather than implied:

```js
part:{ n:1, of:3, first:10, series:'How is a microchip made?',
       titles:['from sand to silicon','printing circuits with light',
               'testing, cutting, geopolitics'],
       pop:3.27, shut:4.63, xshut:5.33 }
```

**The parts have to need each other.** The first attempt at this was #006-#008,
three videos about body temperature that each stood up perfectly well on their
own, numbered PART 1/3 in the status bar and linked nowhere else. That is a
label, not a series: nothing in part two depended on part one, so the numbering
was a claim the videos did not keep, and it was removed — they ship as three
standalones that mention each other. A real part **ends somewhere its successor
begins**: #010 hands over a blank wafer, #011 prints a circuit on it, #012 cuts
it up and sells it. If you can reorder the parts, you have not got a series.

### One card, and it is the series' question

**`series` is a QUESTION, and it is the only question the piece asks.** It used
to be a statement — *How a Microchip Is Made* — sitting above a second card that
asked the piece's own hook: *"a microchip starts as sand, so why can't you make
one on a beach?"* Two cards, two questions, and the viewer had been asked both
of them before a single thing had been explained. Whichever one was the real
question, the other one spent its screen time diluting it.

So: **the card asks the series question, identical on all three parts, and the
piece's hook becomes the first line on the blackboard, where it is content.**
That is also the honest place for it — *"sand, and yet you cannot make one on a
beach"* is an argument, and arguments belong on the board.

* **The title is wrapped over two lines** at the split that comes out most even.
  A greedy wrap breaks `HOW IS A MICROCHIP / MADE?`, which is a worse read than
  `HOW IS A / MICROCHIP MADE?` for no reason.
* **The program window's title is the SERIES question**, not the part. Three
  videos opening the same program is most of what makes them one thing.
* **The status bar's third segment carries `PART n/of`**, and the segments are
  registered in `FRAMES`, so `checkChrome()` holds that text inside them.

### The card is narrated, and it is a sequence

**Anything on screen long enough to read is spoken.** The card used to be two
and a half seconds of text with no voice on it at all. The format's own rule is
that the screen says what the voice is saying — v2.9 was thrown out for putting
a question on the sky while the narrator said something else — and silent text
breaks the same rule from the other side. A part's first two beats are therefore
the card itself:

| beat | says | drawn |
|---|---|---|
| `TITLE` | *"How is a microchip made?"* | types **word by word off its own word onsets** |
| `PART` | *"Part one."* | `PART 1` appears as the narrator says it |

Typing at a character rate drifts against a voice inside half a sentence. The
onsets are measurements of this exact audio, so a word lands as it is said.

**It is two objects, so it is a sequence.** Both windows used to arrive together
at t=0.40 and die on a single press, which read as one graphic with a button on
it rather than a program being used. In order:

```
0.05  the question rises out of the taskbar
0.80  it types itself while the narrator asks it
pop   the part number pops out from UNDER the question, in a window of its own
      ...and the number appears when the narrator says it, not when the box opens
shut  OK on the question; it shrinks and goes
xshut the X on the part window; it shrinks and goes
      half a second of nothing, and then the gag
```

**`pop`, `shut` and `xshut` live in `PIECE`** because two things need them: the
piece, to draw the card, and `PTRACK`, to put the hand on the button. Held
privately in the piece they drifted and the card shut by itself while the
pointer was somewhere else entirely. `checkPiece()` holds the order: `pop` at or
after `TITLE` ends, `shut` at or after `PART` ends, `xshut` at least 0.40s after
`shut` — **two presses, not one.**

### Part one opens on a question, not a recap

**Every part still opens cold.** The viewer who starts at part three is the
normal case, which is why each part hands over rather than assuming.

**But part one has nothing to hand over.** It was made to carry a recap anyway,
and the only thing a recap of nothing can say is the plan — *"three videos, one
chip, this one is about the material it is made of"* — which is a table of
contents read out loud, sitting exactly where the first real thought belongs.
A question does the same orienting job and does work as well: *"so: what is a
chip actually made of?"* hands straight to the beat that answers it.

* **Part one: `BEAT.OPEN`**, a question, and `checkPiece()` **refuses a part one
  that has a `RECAP`**.
* **Parts two and up: `BEAT.RECAP`**, narrated, first on the blackboard, in the
  form *"in the last video X, so now Y"*. These have a real handover and keep it.
* `PIECE.part.recap` **does not exist.** It lived on the card as three rows of
  small print — the one thing a viewer who starts here actually needs, set in
  the smallest type in the piece and gone in two seconds. v4.2 said the field
  was gone and left it in all three parts, holding a sentence that **was not the
  one being spoken**. A dead field that looks authoritative is worse than no
  field.

### The card reaches lower than a dialog, so the gag sits lower

`DLG` ends at **y=306** and every cold-open object is drawn to clear it. The
part card is two windows and the stack ends at **`PART_FLOOR` = 358**, 52px
lower. #011's pen was drawn against 306 and spent the whole card standing inside
the part number's window; it moved down 72px. **Read `PART_FLOOR`; do not carry
358 as a literal** — that is how the cloud in #004 ended up behind a dialog.

**And this one is checked, not advised.** For a version it was only written here,
and no piece ever read it (see v4.4). `partCard()` now files both of its windows
in `GBOX` while they are on screen, so **`checkOverlap()` measures any cold-open
object against the card** exactly as it measures anything else. Getting the floor
wrong is now a sweep hit rather than something you have to have read this
paragraph to avoid. No piece reads `PART_FLOOR` in code today and none needs to —
but if you hand-type the clearance and `PART_NUM` later moves, the constant is
still the only thing that follows it.

**The gag stays.** It is the object's one trick and it is the best thing in the
cold open. It simply loses its card: the object is on the sky from the first
frame with the card above it, the card goes in two presses, and then it does the
trick over about three seconds of its own silence. **The cold open ends when the
PROGRAM WINDOW opens**, not when the first beat starts — it used to run on
behind the window for the whole first beat, invisible but still drawing, and
still registering objects the overlap sweep measured against text inside the
window.

### The rest

* **"PART 2", not "PART 2 OF 3".** How many there are is not what you need to
  know when you are about to watch one.
* **A part runs 82-115s** against a standalone's 65-115. It spends its first six
  seconds on a narrated card and a gag, and it is carrying a third of an
  argument.
* **`first` exists because the palette rotates by piece number.** Part two would
  otherwise arrive in a different colour from part one, so all parts take
  `usePalette(PIECE.part.first)`. A series is deliberately one look.
* **`checkPiece()` validates the whole shape**: `of` in 2..4, `n` in 1..of,
  `first` equal to `no - (n-1)`, a series name, exactly `of` titles, spoken
  `TITLE` and `PART` beats, an `OPEN` for part one or a `RECAP` for the rest,
  and `pop`/`shut`/`xshut` in order. A part that disagrees with its own number
  cannot ship.

## The end card is the library's, and it stands alone

The sign-off is the one shot in a piece with **no window on it at all**. The
program window has closed, the Good-To-Know dialog has closed, and GOOD TO KNOW
THO sits on the bare sky. Call it and nothing else after `SHUT`:

```js
if(T>=BEAT.FIRST.sc-0.30 && T<SHUT){ ...the whole piece... }
endCard(T,M,SHUT,'it is now safe to','close this window.');
```

`endCard()` owns both halves — drawing the card, and being the only thing a
piece draws once the card is up. **A piece must not hand-roll its own.** Nine
pieces each carried their own copy of the same ten lines while the guard that
takes the stage *down* lived two hundred lines away in a different `if`, so the
two could disagree; four of the nine shipped with the program window *and* the
dialog both still standing behind the card, the gold lettering printed across a
white dialog box, on top of that dialog's own text, for the last three seconds
of the video. Twelve sweeps reported zero, because no sweep had any opinion
about what a piece draws late.

**`checkEndCard()` is the thirteenth sweep.** `endCard()` sets `BARE` the moment
the desktop goes bare; once `BARE` is set, `FRAMES` must be empty, because every
Win95 container on screen files itself there. A piece that never reaches
`endCard()` fails it too — every piece signs off.

## A window lands on a clear stage

**A floating window — the Good-To-Know summary card, a `test.exe` dialog, the
question card — opens on a stage with nothing on it.** It is not a layer you
put over a finished picture. Whatever is under it is gone for as long as it is
up, and the viewer has no way of knowing something was there.

The failure is specific and it is easy to write by accident, because both
halves look right on their own. #013's last beat:

```js
/* WRONG -- both of these are inside `if(T>=BEAT.END.sc)` */
px('THE ACCURACY WAS NEVER',216,MIDY+32,15,P.bone,'center');
px('THE QUESTION',216,MIDY+80,15,P.bone,'center');
blockTag(216,MIDY+176,'HOW RARE IT IS',14,P.gold,'#000');
const bk=winFrame(BOX[0],BOX[1],BOX[2],BOX[3],'Good To Know Tho',true);
```

The statement is the answer to the question in the title bar, and it was drawn
on the stage and then covered by the card at the same instant — five seconds of
a ninety-second piece, spent face down. **Wipe the stage and let the card carry
the statement**, which is what every other piece in the library already does:

```js
/* RIGHT */
wipeStage(CX,CY,CWd,CHd); groupBox(BX,BY,BW,BH,'DONE');
const bk=winFrame(BOX[0],BOX[1],BOX[2],BOX[3],'Good To Know Tho',true);
capLine('HOW RARE IT IS',15,0,bk.x+16,bk.y+86,20,'#000080','#c0c0c0',null,0.90);
```

**`checkCard()` is the fourteenth sweep,** and the thing worth taking from it
is *what* was missing. Not a rectangle: the window's plate, the statement's
extent and the tag's plate were all registered already, in the registries the
other thirteen sweeps read. Three separate exemptions, each of them correct on
its own terms, closed every route to it — `checkOverlap` skips any pair that
straddles the overlay boundary (**a window IS opaque; its own text genuinely
does not collide with what it hides**), chrome is skipped everywhere, and the
window plate is not a text item so there was nothing for the text test to find.

What was missing was the **draw order**. Content drawn *before* a window and
under it is hidden; content drawn *after* a window and on it is that window's
own, and those two are the same rectangle. So `winFrame()` records the lengths
`BOUNDS` and `GBOX` had at the moment it ran:

```js
if(WINS) WINS.push({x:x,y:y,w:w,h:h,title:String(title||''),
                    nb:BOUNDS?BOUNDS.length:0, ng:GBOX?GBOX.length:0});
```

Anything at a lower index than `nb`/`ng` was drawn underneath. **No registry
needed a new field and no draw site needed touching** — there are 73 `GBOX.push`
calls across the library and pieces, and a sequence number on each of them
would have been 73 chances to write the wrong one. A window's own arrival is
the only moment the order has to be recorded.

**The biggest window in a frame is the stage.** That is the program window the
piece runs in, and content is *supposed* to be inside it; every other window
floats and has to land clear. Exempt: the pointer, which is allowed anywhere
(every other sweep says so), the group box, which is an outline the size of the
panel and which every dialog covers by definition, and the question card's own
two windows, which are windows and not content.

**Control-tested, both branches.** Putting the two `px()` lines back scores 2
and names them — `{"window":"Good To Know Tho","covers":"THE ACCURACY WAS
NEVER","overlap":[333,14]}`. Putting a `blockTag` back scores 2 and names the
label *and* its plate. Removed again, it is 0, and 0 on all thirteen pieces.
It also sees what it should see and pass: #013 has 184 frames with two windows
up, the `test.exe` dialog floating over 7 text items and the summary card over
5, and finds no intersection in any of them, because there is none.

## Register what you draw, in SCENE as well as GBOX

`solidShape()` files its own extent in **`SCENE`, which `checkFraming()` reads,
and in `GBOX`, which `checkOverlap()` reads.** It filed only the first of those
for months, which meant **no drawn object was visible to the overlap sweep at
all**: #010's `CO OUT` plate sat on the furnace stack through every frame of the
beat with all thirteen sweeps at 0, because the stack was in `SCENE` and the
sweep does not read `SCENE`. Anything drawn with raw `fillRect` still registers
nothing, and a half-registered diagram is worse than an unregistered one: #011's optics beat had a `solidShape`
lens on the left and a `fillRect` mirror stack on the right, so the sweep could
see half of a deliberately balanced pair and called it 88px off centre. If a
scene object is drawn by hand, push it:

```js
if(SCENE)SCENE.push({x:S.x2-42,y:S.mid-8,w:84,h:96,k:'mirror'});
```

Same rule, same reason, as raw-drawn geometry registering in `GBOX`.

**A box that disagrees with the draw buys silence, and silence reads as a
pass.** #010's puller rod was drawn from `Q.rod` and filed from `Q.rod+36`. The
sweep compared the caption against a box that started 23px *below* it and
reported a clean gap, while the renderer drew the rod 13px *into* it — through
the letter A of "AND". The `+36` was somebody making a complaint go away.
**Register the rectangle you actually fill.** If a hand-written box needs an
offset to pass, the picture is what is wrong.

**And the graphic-vs-graphic test has to be able to reach the case.** It was
written for one — a tag plate on a voxel stack — and the condition was literally
`tag:* vs voxbar`, so the one case it had been written for was the only case it
could ever find. A plate is opaque wherever it lands. It now tests a plate
against **any** registered surface that is not itself a plate, a container or
the pointer.

**A bounding box is not a silhouette.** A tapered shaft registers the empty
corners either side of it, so a label beside the taper can be flagged when
nothing is really covered. That is the sweep being conservative in the right
direction: move the label, or accept that it sits in the object's rectangle.

## Two labels that do not overlap can still read as one line

`checkOverlap()` answers "do these two boxes intersect", which is not the
question a reader asks. #010 printed `FURNACE GRADE` and `CHIP GRADE` under two
columns with **5px between them** and it read as one continuous line of text;
#011 did the same thing with `NANOMETRES` under both numbers. No sweep can see
this. The fixes are all cheap and none of them is "move it 4px":

* **One word per column** (`FURNACE` / `CHIP`), not two.
* **The unit goes once, in the middle**, not under each number.
* **Different rows** when both columns need a sentence.

Two column labels on the same row need a gap you could put a third label in.
This is stricter than `checkClearance`, and it is the one a reader applies:
#011's two 44px numbers left 20px between them — half a character — and
`193 13.5` read as one run of digits with all thirteen sweeps at 0.

**And they have to be the same KIND of label** — see *Say the same kind of thing
on both sides of a comparison*.

## An estimate filed as a fact is worse than nothing

A registry is only a measurement if something measured it. `blockTag()` wrote
`text.length*(size*0.62)` into GBOX as the tag's extent. Silkscreen advances
0.6667 of its point size, not 0.62, so from about 17 characters up the plate was
**narrower than the text printed on it** — "ONE CRYSTAL, TWO METRES LONG" hung
9px off each end, first and last letter clipped by the plate edge, visible in
the frame at normal size.

Thirteen sweeps had nothing to say, and that is the part worth remembering: the
*same wrong number* was what `checkOverlap` and `checkBounds` compared against,
so the mistake was checking itself. **Measure with `glyph(str,size,font).w`.**
If you cannot measure a thing, do not file a guess about it — leave it
unregistered, where at least its absence is honest.

The only other estimate left is `groupBox`'s label plate (`len*7+6` for 6px
Press Start 2P, which advances 1.0 — so the plate is wider than the text and
the error is in the safe direction). Checked, 2026-11-10.

## Audit with instruments that do not read the registries

Every sweep in this format asks a registry what was drawn. When the drawing code
and the registry share a mistake, re-running the sweeps confirms the mistake.
Three instruments that do not, each of which earned its keep:

* **Measure text through a different API.** Hook `px()` and re-measure every
  call with `ctx.measureText`'s `actualBoundingBox`, then apply your own
  collision rule. 11,039 frames across twelve pieces, and it is what caught the
  tag plates.
* **Diff against the clip.** Render the frame, render it again with
  `CanvasRenderingContext2D.prototype.clip` stubbed out, and compare: any pixel
  that changes outside the client panel is content the clip was quietly cutting
  off. This needs no registry at all. **Validate it against a control** — inject
  a deliberate off-panel `rect()` and confirm it is caught, or you have only
  proved the instrument is silent.
* **Measure contrast off the canvas.** Text sitting on a `*box` container is
  exempt from `checkOverlap` and nothing then checks it can be READ. Sample the
  string's own pixels and compare luminance against its backdrop. Expect hits on
  the mosaic beat-transition, on the first frame of any alpha fade, and on the
  inactive Win95 title bar — all three are intentional, so confirm each flagged
  string reaches healthy contrast later rather than dismissing it.

## Shapes a sweep cannot see

Three things in this format are pure geometry, and geometry is the one thing no
sweep has an opinion about. All three were caught by pulling a frame and
looking:

* **`isoBox` inverts when it is wider than it is tall.** The shoulder drop is
  0.6 of the half-width and at `s >= hh` the top and bottom shoulders cross
  over: a crucible 160 wide and 80 tall drew a **bowtie**. It is clamped now, so
  a wide flat box degrades to a shallow plate, which is what it should be — but
  a *bowl* is still not a box, and #010's crucible had to be drawn as a rim
  ellipse and a tapering wall before it stopped reading as an arrowhead.
* **A flat fill is not a cylinder.** #010's ingot was a rectangle with vertical
  lines across it and read as a ruler, or a strip of film. Rounded caps, a
  highlight band along the top and a shadow along the bottom are the only things
  that say "round".
* **An isometric box with a slot in it is not a machine.** The thermostat in
  #008 and the furnace in #010 made the same mistake: a grey crate says nothing
  about what the thing does. A furnace got a stack, hoops, a lit throat and a
  tap that runs; a thermometer got a bulb, a stem, a column and a scale. **An
  object has to carry what it does on the outside.** The furnace then needed a
  *second* pass, because having all four parts was not the same as reading as a
  furnace — see **Window chrome belongs to windows**, which is what that pass
  turned out to be about.

## A shape stays inside its container

When a beat establishes a boundary — a disc, a bar, a panel, a lake — then
**everything the beat puts inside it has to be inside it**, including the last
pixel of the last one. The boundary is the argument; a shape crossing it argues
the opposite.

#012's wafer map is the case. It rules a 300px disc into 26px square dies, and
it decided which dies existed like this:

```js
if(Math.hypot(die_centre - wafer_centre) > r - 10) continue;   // WRONG
```

A square's corner is 18px from its centre, so testing the **centre** let dies
hang 8px out over the rim of the disc — three off the top, through the caption
above it, and more off each side. The shot says *one round wafer, hundreds of
square copies*; squares leaving the circle say the wafer is not the boundary.

```js
const ok = [[0,0],[s,0],[0,s],[s,s]]                           // RIGHT
  .every(([ox,oy]) => Math.hypot(x+ox-cx, y+oy-cy) <= r-3);
```

* **Test the corners, not the centre** — of anything square inside anything
  round, and of anything at all inside a clip.
* **Register the container's own bounds, with no padding.** The map was filed
  8px larger than the disc it draws, and that pad alone put it 4px into the
  caption once its key stopped claiming to be a container.
* **Fewer items is the correct answer.** The honest test dropped 280 copies to
  208. A number that falls out of the geometry beats a number that was tuned to
  look right.

## The pointer is excused where it acted, not when

`checkPointerIdle` flags a hand that has been stationary on content for longer
than `SIT` (0.80s). Its comment has said since v2.6 that *"a button it has just
pressed is a fine place to be"* — and nothing implemented that. The only thing
exempt was the text caret, so the check was quietly wrong in both directions:
it flagged a hand doing the right thing, and (because `solidShape` registered
nothing in `GBOX` until v4.4) it could not see a hand parked on a diagram.

The exemption is **positional**: the hand is excused while it sits within 3px of
the last place it acted — a press or the end of a drag — and the moment it acts
elsewhere or moves off, the exemption is gone.

* **Not time-limited.** A hand that pressed OK and has not moved is still on the
  button it pressed, whether the gag it is watching runs one second or three.
  #002 and #007 were both flagged for watching their own cold open.
* **A drag's destination is ON the object** — the probe comes down onto a die,
  the saw is drawn down a lane. Flagging the hand for being where the drag put
  it is flagging the act.
* **Control-tested.** Parking a caption rest on #010's crucible — somewhere the
  hand never acted — still reports two hits. An exemption that cannot fail its
  own control is not an exemption, it is a hole.

**And `near()` is not a rest.** The automatic rest offsets ±112/±132 from the
act, which is still inside a 300px disc. A beat whose diagram fills the panel
has to name its own rest, outside the diagram.

## Say the same kind of thing on both sides of a comparison

Two labelled things side by side are a sentence with an *and* in it, and the two
halves have to be the same part of speech. *(The spacing half of this rule is
**Two labels that do not overlap can still read as one line**; this is the
wording half.)*

#012 binned its chips into **FULL SPEED** and **SOLD SLOWER**: one is a speed,
the other is a sale, so the pair did not read as two grades of one thing. It is
**FULL SPEED** and **SLOWER SPEED** now. Same for `FURNACE`/`CHIP` in #010 and
`BEFORE`/`NOW` in #011 — one word each, the same kind of word.

**And the script has to agree with the screen.** #010 said *"sand, and yet you
cannot make one on a beach"* over a card reading **BUT NOT ON A BEACH**. "And
yet" and "but" are the same turn written twice in two registers; the plainer one
wins, in both places.

## Window chrome belongs to windows

The four layers put Win95 furniture and physical objects on the same screen, and
the moment an object borrows the furniture's edges it stops being an object.

#010's furnace is the case. It had everything the last revision asked for — a
stack, hoops, a lit throat, a tap that runs — and still read as a grey crate,
because the **throat was a `fillRect` with `bevel(...,'field')` on it**: the
sunken border Win95 puts round a *text input*, on the mouth of a furnace. A
viewer cannot say why that is wrong and does not need to; it reads as a form
control with fire behind it.

* **`bevel()`, `winFrame()`, `button()`, `groupBox()` are for chrome.** A window,
  a dialog, a status bar, a group box, a button. Nothing that exists inside the
  story gets them.
* **An object gets its own edges**: facets from `solidShape()`, a rim, seams,
  and openings cut as shapes. The furnace's throat is an arch with a heat
  gradient inside it and **no border at all**.
* **A primitive per feature is not a drawing.** The hoops were three 3px dark
  lines, which is a scratch; a raised band is a **lit edge over a dark edge**,
  and following the taper makes it say the shaft is not parallel as well.
* **The silhouette carries the claim.** A furnace tapers — wider at the base
  than the top. That one decision does more than the stack, the hoops and the
  tap put together, because it is the part you read before you read anything.

**And a heavy rim crushes a small object.** `solidShape()` strokes 9px of black
and 3px of rim round whatever it is given. On a 28x34 lump that is most of the
shape, so #010's three pieces of carbon came out as three empty rings whatever
colour the facets were. Small objects get **bigger, and a mid-tone rim** — the
near-white rim is for the hero object in the shot.

## The pointer can do the explaining

The hand is the one thing on screen that is not a diagram, so the shots where it
*acts* are worth more than the shots where it watches.

#010's purity beat draws a hundred identical dots and one of them is the foreign
atom. It used to arrive already red, which made the grid a picture of a fact and
the pointer a bystander standing nearby. **The click is what turns it**: a
hundred identical things, and somebody going and finding the one. Same drawing,
same beat, and now the pointer is the argument.

* **Aim it at the thing.** That tap was sent to `N.x1+44` while the dot is drawn
  at `N.x1-45+40` — 49px away, a hand tapping empty blackboard next to the point
  it was making. Derive the hand's target from **the same arithmetic that places
  the mark**, so they cannot drift apart.
* **Nothing changes before the press.** If the state flips early the click is
  decoration.
* **One act per beat.** Two is a demonstration of a mouse.

## Accuracy

**Say so when the geometry cannot be to scale.** The density curve in #003 and
the two light paths in #004 are both caricatures — an exaggerated peak and a
40:1 ratio drawn at about 1.4:1 — and both carry `not to scale` on the frame.
A diagram that implies a measurement it is not making is the same fault as a
wrong number.

Draw the subject correctly. Check the science before it goes in the visuals.
If a number is an assumption, it gets listed under the storyboard — never
presented on screen as fact.

Check comparisons as hard as numbers. "pH 3.9 — as acidic as a tomato" shipped in
v1.0 and v1.1; a tomato is pH 4.3–4.9, so honey is the *more* acidic of the two.
It is orange juice (3.3–4.2) that actually matches.

---

## The view has to be able to show the mechanism

**v4.16, from #022.** The piece is *"what is actually holding a bicycle up"*,
and the answer is that it leans and steers into the lean. It was built side-on,
because trail is a side-on fact — and **leaning is rotation about the line the
wheels roll along, which in a side view points straight at the camera.** So the
one thing the piece exists to show was invisible. Every sweep returned 0; the
lean *trace* under the machine moved while the machine itself sat still, which
is worse than nothing, because the instrument said something was happening and
the picture denied it.

The geometry beats kept the side view. The behaviour beats are drawn **from
behind**, where a lean is a lean and the front wheel showing more of its rim
*is* the steering. Two views, chosen per beat by what each has to prove.

**Ask it before the storyboard: can the view I have chosen show the thing the
piece is about?** A diagram that cannot express the mechanism is not a drawing
problem, it is the wrong camera.

## A measurement taken before the font loads is not a measurement

**v4.16, from #023.** Eight token plates were sized with
`const CHUNKW = TOKS.map(s => glyph(s, 14, '"Silkscreen"').w + 10)` at **module
scope** — which runs as the file is parsed, long before `document.fonts.ready`.
Every width came back in whatever fallback the browser had to hand, the plates
were laid out to those numbers, and the text was then drawn in Silkscreen. Three
of the eight ran into their neighbour.

This is **An estimate filed as a fact** wearing a different hat, and it is
harder to see, because the code is doing the right thing — it calls `glyph()`,
it does not guess. It just calls it too early. `glyph()` caches, so there is no
reason not to measure inside the draw. **Any width that feeds a layout is
computed per frame, never at module scope.** The same applies to `ACTS` and
`SPOTS`, which are also built as the file loads: a pointer target must not come
off a font metric at all — give it a fixed point.

## Two more ways a container silences the sweep

**v4.16.** `*box` already carries the warning that it is a promise, not an
escape hatch. Two new shapes of the same failure:

* **#023 printed the first row's token ids onto the second row's plates.** The
  rows were 56px apart; plate 26 + integer 14 needs more than that. Nothing
  objected, because the plate under the text was a `chunkbox` and text on a
  container is allowed — but it was *somebody else's* container. A container
  excuses the text that belongs to it, and nothing else. Row pitch is now plate
  + gap + text + air, and it is 64.
* **A step drawn at the wrong rate is gone by the frame anybody reads.** #022's
  mechanism is a race between two inverted pendulums, and theta grows as
  cosh(sqrt(g/L)·t) — so at the rate first chosen *both* were flat on the
  baseline within a second, and `checkComposition`'s settled frame, half a
  second before the beat hands over, measured two horizontal lines. The short
  one reaches horizontal at s = 0.84 while the tall one is still at 13°: that
  instant **is** the picture, so the clock stops there and holds it. **When a
  simulation is the explanation, solve for the frame you want and stop the
  clock on it** — do not let it run on into a shape that proves nothing.

## A beat that opens on an empty stage

**v4.16.** A beat's first sentence is spoken over whatever the beat drew at its
own first word — and if every element is gated on a word that arrives two
seconds in, the panel is empty for two seconds while the narrator talks. No
sweep reports it: `checkComposition` measures the **settled** frame, half a
second before the beat hands over, which is the fullest frame of the beat.

`render/_density.mjs <slug>` samples every 0.25s and counts registered items
inside the group box. Fewer than three is the flag. #023 had three such holes
(ASK, MEASURE, SPLIT — 2.5s at worst) and #022 one. The fix is always the same:
**the furniture of the beat goes up on the beat's first word, and only the
values wait for theirs** — an empty track with its label, a panel with no
verdict yet, a reply slot reading `...`.

**Two things that read as thin and are not.** The END overview and a series
PART card are overlays drawn on a wiped stage, so they count nothing by
construction. And on anything built before the registration rules, the probe
measures **how much of the drawing is registered**, not how full the picture
is: #004's two sine waves and #001's cube row are both on screen and both
largely invisible to GBOX. The probe is only a composition check on pieces
built under the current rules.

**Known and not fixed:** #017 `ruler` opens its TWO beat on a loaf and nothing
else for about 1.25s. It is live and the fix would mean re-rendering a piece
that may already be posted, so it is recorded here rather than changed.

## Do not shrink type below the floor to make something fit

**v4.16, from #023.** Eight token plates at the 14px label floor come to 397px
against a 372px box. Dropping the type to 12px made them fit and
`checkLegibility` reported eight failures at once — correctly: it is the same
text, now unreadable. **The layout gives way, not the type.** The sentence
breaks into two rows of four, which is what a line of text does anyway, and the
floor is never the variable.

## Workflow

**The idea gate first** — SUBJECT / CHAIN / QUESTION / INSIDE / CLOSES, five lines in the build dir (`GATE.md`), before anything is drawn. See *Does the idea work?*. An idea that cannot be chained with but/therefore is not an episode yet, however good its numbers are.

**Storyboard second.** One HTML page, a grid of 6–10 panels, each a canvas
showing that beat's key frame drawn in this style with the real drawing code.
Under each: beat number, start/end time, exact on-screen text, how it gets
there from the previous panel, key sounds. Then wait for approval.

Build the full animation from the storyboard's own drawing code.

---

*Sampler: aedinlai.com/vid*
