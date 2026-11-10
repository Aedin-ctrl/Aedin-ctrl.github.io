/* The palette is chosen HERE, after the piece has declared its number and
   before anything is drawn: slot values only, so no drawing code knows which
   palette it is in. Rotating it is the point -- two videos in a row should not
   look like the same video. */
// A series keeps ONE palette: the rotation is by piece number, so part two of
// a trilogy would otherwise arrive in a different colour from part one.
usePalette(PIECE.part?PIECE.part.first:PIECE.no); paintSwatches();

/* ===== CATHODE DESK -- the shared runtime, part 2 of 2 =====
   Loaded AFTER the piece, because the pointer track is built from the
   piece's own SPOTS and ACTS, and the sweeps measure its explainer.  */

const RINGS=[];
const PTRACK=(()=>{
  const sp=SPOTS.slice().sort((a,b)=>VO[a.n].t[0]-VO[b.n].t[0]);
  const sess=[];
  sp.forEach(x=>{
    const last=sess[sess.length-1];
    const near = last && Math.hypot(x.x-last.prev.x, x.y-last.prev.y) < SESSION_NEAR;
    if(last && near && VO[x.n].t[0]-VO[last.lastN].z < SESSION_GAP){ last.lastN=x.n; last.prev=x; }
    else sess.push({first:x, lastN:x.n, prev:x});
  });
  const pending=[];
  /* A series part opens on its own card, and the hand presses THAT first. The
     default start of [250,196] is in open desktop for a standalone and inside
     the part card for a part, so without this the hand spent the whole card
     sitting on the recap it was supposed to be letting you read. */
  const P=[PIECE.part?{t:0,x:PART_OK.x-96,y:PART_OK.y+74}:{t:0,x:250,y:196}];
  if(PIECE.part) P.push({t:+Number(PIECE.part.shut).toFixed(3),
                         x:PART_OK.x, y:PART_OK.y, c:1});
  sess.forEach(S=>{
    P.push({t:+(VO[S.first.n].t[0]-0.30).toFixed(3),
            x:S.first.x+3, y:S.first.y+Math.round(S.first.s*0.55), c:1});
    SESSION_SPANS.push({a:VO[S.first.n].t[0], z:VO[S.lastN].z+0.45,
                        x:S.first.x, y:S.first.y, s:S.first.s});
    // a SPOT may name its own rest. The field was documented and then ignored,
    // so "one line below what it just typed" was the only option -- which is
    // the next line of whatever it just typed.
    const rt=+(VO[S.lastN].z+0.55).toFixed(3);
    pending.push(S.first.r ? {t:rt, x:S.first.r[0], y:S.first.r[1]}
      : S.first.y>=CAPY ? {t:rt, x:CAPREST[0], y:CAPREST[1]}
      : {t:rt, x:S.first.x+8, y:S.first.y+Math.round(S.first.s)+28});
  });
  P.push({t:+(VO[0].z+0.12).toFixed(3), x:OK_DIALOG.x, y:OK_DIALOG.y, c:1});
  // LAST sentence, not sentence 17: honey has 19, halloumi 18, ice 16. A
  // hard-coded index is how the sweeps used to break on the next script, and
  // here it took the whole runtime down before a single frame was drawn.
  const LASTV=VO[VO.length-1];
  P.push({t:+(LASTV.z+0.52).toFixed(3), x:OK_BOX.x, y:OK_BOX.y, c:1});
  P.push({t:DUR, x:OK_BOX.x, y:OK_BOX.y});
  P.sort((a,b)=>a.t-b.t);
  const SPEED=620, SETTLE=0.14, MINTIME=0.26;
  const reach=(from,to,dt)=>dt >= MINTIME + Math.hypot(to[0]-from[0],to[1]-from[1])/SPEED;
  let lastT=P[0].t, lastP=[P[0].x,P[0].y];
  const commit=q=>{P.push(q); lastT=q.t; lastP=[q.x,q.y];};
  const fixed=P.slice().sort((a,b)=>a.t-b.t);
  const taken=(t)=>fixed.find(f=>Math.abs(f.t-t)<0.30);
  /* Reachability was measured from the last committed ACTION only, so a
     typing session sitting between two actions was invisible to it: the hand
     could be parked on a caption at 12.43 and expected at a chart 337px away
     at 12.78. Take whichever came last, the action or the session point. */
  const prevPoint=(t)=>{ let b={t:lastT,x:lastP[0],y:lastP[1]};
    for(const f of fixed) if(f.t<=t && f.t>b.t) b=f;
    return b; };
  ACTS.slice().sort((a,b)=>a.t0-b.t0).forEach(A=>{
    if(A.k==='ring'){ RINGS.push({t:A.t0,x:A.a[0],y:A.a[1]}); return; }
    if(taken(A.t0)){ RINGS.push({t:A.t0,x:A.a[0],y:A.a[1]}); return; }
    const pv=prevPoint(A.t0);
    if(!reach([pv.x,pv.y],A.a,A.t0-pv.t)){ RINGS.push({t:A.t0,x:A.a[0],y:A.a[1]}); return; }
    if(A.k==='click'){
      commit({t:+(A.t0-SETTLE).toFixed(3),x:A.a[0],y:A.a[1]});
      commit({t:A.t0,x:A.a[0],y:A.a[1],c:1});
    } else {
      commit({t:A.t0,x:A.a[0],y:A.a[1],g:1});
      commit({t:A.t1,x:A.b[0],y:A.b[1],d:1});
    }
    if(A.r){ pending.push({t:+(A.t1+0.42).toFixed(3),x:A.r[0],y:A.r[1],alt:1});
             pending.push({t:+(A.t1+0.70).toFixed(3),x:A.r[0],y:A.r[1],alt:2}); }
  });
  P.sort((a,b)=>a.t-b.t);
  const placed=new Set();
  pending.forEach(q=>{
    const key=q.x+','+q.y+','+(q.alt||0);
    if(q.alt===2 && placed.has(q.x+','+q.y+',1')) return;
    const before=[...P].reverse().find(r=>r.t<=q.t);
    const after =P.find(r=>r.t>q.t);
    if(!before) return;
    if(!reach([before.x,before.y],[q.x,q.y],q.t-before.t)) return;
    if(after && !reach([q.x,q.y],[after.x,after.y],after.t-q.t)) return;
    P.push(q); placed.add(key); P.sort((a,b)=>a.t-b.t);
  });
  P.filter(q=>q.c&&!q.s2).forEach(q=>{ if(!P.some(r=>Math.abs(r.t-(q.t-SETTLE))<0.01))
    P.push({t:+(q.t-SETTLE).toFixed(3),x:q.x,y:q.y,s2:1}); });
  P.sort((a,b)=>a.t-b.t);
  return P;
})();


/* The piece's own declaration, checked rather than trusted: a number, a title,
   a blurb, and at most two tags FROM THE CLOSED SET. A tag typed freehand is
   how a library stops being browsable. */
window.checkPiece=function(){
  const bad=[];
  if(!(PIECE.no>0)) bad.push({field:'no',got:PIECE.no});
  if(!PIECE.slug) bad.push({field:'slug',got:PIECE.slug});
  if(!PIECE.title||PIECE.title.length<8) bad.push({field:'title',got:PIECE.title});
  if(!PIECE.blurb||PIECE.blurb.length<40) bad.push({field:'blurb',got:PIECE.blurb});
  if(!Array.isArray(PIECE.tags)||!PIECE.tags.length||PIECE.tags.length>2)
    bad.push({field:'tags',got:PIECE.tags,need:'1 or 2'});
  else for(const t of PIECE.tags)
    if(TAGS.indexOf(t)<0) bad.push({field:'tag',got:t,need:'one of '+TAGS.join(',')});
  /* A standalone is 65-78s. A part of a series is allowed to be longer, and has
     to be: it spends its first four seconds on the part card and its recap, and
     it is carrying a third of an argument rather than a whole one. */
  const LO=PIECE.part?78:65, HI=PIECE.part?100:78;
  if(DUR<LO||DUR>HI) bad.push({field:'DUR',got:DUR,need:LO+'-'+HI+'s'});
  if(PIECE.part){
    const q=PIECE.part;
    if(!(q.of>=2&&q.of<=4)) bad.push({field:'part.of',got:q.of,need:'2-4'});
    if(!(q.n>=1&&q.n<=q.of)) bad.push({field:'part.n',got:q.n,need:'1..of'});
    if(q.first!==PIECE.no-(q.n-1)) bad.push({field:'part.first',got:q.first,
                                             need:PIECE.no-(q.n-1)});
    if(!q.series||q.series.length<4) bad.push({field:'part.series',got:q.series});
    if(!Array.isArray(q.titles)||q.titles.length!==q.of)
      bad.push({field:'part.titles',got:q.titles,need:q.of+' titles'});
    /* The recap is what makes the numbering mean anything. Part two of the first
       attempt at a series opened exactly like a standalone and the PART 2/3 in
       the status bar was the only thing distinguishing it, which is how three
       videos came to claim they were a series without being one. */
    if(!q.recap||q.recap.length<16) bad.push({field:'part.recap',got:q.recap,
                                              need:'a sentence of catch-up'});
    /* The card's own close time. It lives in PIECE because TWO things need it:
       the piece, to stop drawing the card, and PTRACK, to put the hand on the
       button. Held in the piece alone they drifted apart and the card shut on
       its own while the hand was elsewhere. */
    if(!(q.shut>=1.6&&q.shut<=VO[0].a-0.6))
      bad.push({field:'part.shut',got:q.shut,need:'1.6 .. lead_in-0.6'});
    if(q.recap&&q.recap.length>110) bad.push({field:'part.recap',got:q.recap.length,
                                              need:'<=110 chars (3 rows of 34)'});
    // the lead_in has to be long enough for the card to open, be read and shut
    if(VO[0].a<4.0) bad.push({field:'lead_in',got:VO[0].a,
                              need:'>=4.0s -- the part card goes first'});
  }
  return bad;
};
window.DUR=DUR; window.LW=LW; window.LH=LH; window.VO=VO; window.BEAT=BEAT; window.VOHASH=VOHASH; window.PTRACKDBG=PTRACK;
// Beat names differ per piece, so the sweeps address them positionally: the
// first CONTENT beat (after the hook) and the LAST beat. Hard-coding JAR/END
// worked for one script and threw on the next.
const BKEYS=Object.keys(BEAT);
const FIRST_CONTENT=BEAT[BKEYS[1]].sc, LAST_BEAT=BEAT[BKEYS[BKEYS.length-1]].sc;
window.checkBounds=function(step){
  const pad=2, lo={x:PX+pad,y:PY+pad}, hi={x:PX+PW-pad,y:PY+PH-pad};
  const bad=[]; const seen=new Set();
  for(let tt=0; tt<=DUR; tt+=(step||1/12)){
    BOUNDS=[]; explainer(ctx,OUTW,OUTH,tt); const rec=BOUNDS; BOUNDS=null;
    for(const b of rec){
      // Chrome legitimately lives outside the client area: the title bar above
      // it, the status bar below it, and the dialog / message box drawn over
      // the desktop. Those are judged against the whole 640x360 buffer; only
      // SCREEN and OBJECT layer text is held to the client rect.
      const chrome = b.y < lo.y || b.y > PY+PH-20 || tt < FIRST_CONTENT || tt >= LAST_BEAT;
      const L=chrome?0:lo.x, Tp=chrome?0:lo.y, R=chrome?LW:hi.x, Bt=chrome?LH:hi.y;
      if(b.x<L||b.y<Tp||b.x+b.w>R||b.y+b.h>Bt){
        const k=b.s+'|'+b.size;
        if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),text:b.s,size:b.size,
                  box:[b.x,b.y,b.x+b.w,b.y+b.h],limit:[L,Tp,R,Bt]});
      }
    }
  }
  return bad;
};

/* Two labels can both sit inside the panel and still land on top of each other
   -- which is what happened to WATER PULLED OUT and OSMOSIS once, and to YEAST
   and the threshold label in the first cut of the seal beat. So overlap is
   checked too. pxShadow draws the same string twice at a 1px offset, so an
   identical string within 1px of itself is the shadow, not a collision. */
/* The spec sets a legibility floor in BUFFER pixels (x2 to output): headlines
   >=22, any label the story depends on >=14, key numbers >=32, VT323 >=13.
   This reports anything under it. Chrome -- the Win95 dialog furniture -- is
   exempt, because Win95 chrome is 9px by definition. */
/* ===== THE TWELFTH SWEEP: a scene at rest is centred =====
   The cold open is the only scene with no group box, so checkComposition has
   nothing to measure a band against and skips it entirely -- and solidShape
   used to register nothing, so the props were invisible to every other sweep
   too. #005 went out with its block and its tree 74px left of frame centre.

   Two rules, different on purpose. A prop in MOTION only has to stay inside
   the client panel; it is allowed to fly. But the moment the scene STOPS
   MOVING -- three identical frames -- the combined span of everything in it
   has to be centred on the frame, because that still is the shot a viewer
   actually reads. A gag that ends off to one side is a framing error even
   though every pixel of it is on screen.                                   */
window.checkFraming=function(tol,step){
  const T=tol||26, st=step||1/12, bad=[], seen=new Set();
  let prev=null, still=0;
  for(let tt=0; tt<=DUR; tt+=st){
    SCENE=[]; explainer(ctx,OUTW,OUTH,tt);
    /* A key ending in `exit` is a prop that is MEANT to leave -- #004's cloud
       slopes off to the left on purpose. Same idea as the `*box` suffix that
       marks a container: the name carries the exemption, so the sweep does not
       need a list of special cases and a new piece gets it for free. */
    const s=SCENE.filter(b=>!/exit$/.test(b.k)); SCENE=null;
    if(!s.length){ prev=null; still=0; continue; }
    for(const b of s){
      if(b.x>=PX-1 && b.x+b.w<=PX+PW+1) continue;
      const k='escape|'+b.k; if(seen.has(k))continue; seen.add(k);
      bad.push({t:+tt.toFixed(2), what:b.k, why:'escapes the client panel',
                x:[Math.round(b.x),Math.round(b.x+b.w)], panel:[PX,PX+PW]});
    }
    const x0=Math.min(...s.map(b=>b.x)), x1=Math.max(...s.map(b=>b.x+b.w));
    const key=Math.round(x0)+','+Math.round(x1);
    still=(key===prev)?still+1:0; prev=key;
    if(still!==3) continue;          // three frames unchanged: it has settled
    const off=Math.round((x0+x1)/2-LW/2);
    if(Math.abs(off)<=T) continue;
    const k='off|'+key; if(seen.has(k))continue; seen.add(k);
    bad.push({t:+tt.toFixed(2), what:'scene at rest', why:'off centre',
              off:off, tol:T, span:[Math.round(x0),Math.round(x1)]});
  }
  return bad;
};

/* ===== THE ELEVENTH SWEEP: text inside a Win95 box stays inside it =====
   checkTruncation only ever asked whether a string was wider than the SCREEN,
   and every sweep skipped `b.chrome` entirely -- so a title that ran past its
   own title bar, and message-box lines that ran out through the window's right
   edge, were invisible to all ten. A string whose top-left corner is inside a
   registered frame has to be wholly inside that frame.                     */
/* ===== THE THIRTEENTH SWEEP: the end card stands alone =====
   The sign-off is the one shot in a piece with NO window on it. The program
   window has closed, the Good-To-Know dialog has closed, and GOOD TO KNOW THO
   sits on the bare sky. #006-#009 all shipped with both windows still standing
   behind it: the gold lettering was printed across a white dialog box, on top
   of the dialog's own text, in the last three seconds of four videos.

   Nothing caught it because the end card and the guard that takes the stage
   DOWN were two hundred lines apart in nine separate copies -- the five older
   pieces bounded their window block with `&& T<SHUT` and the four newer ones
   simply did not, and no sweep had any opinion about what a piece draws late.
   endCard() owns both halves now, and this holds it: once BARE is set, FRAMES
   must be empty, because every Win95 container on screen files itself there. */
window.checkEndCard=function(step){
  const st=step||1/12, bad=[]; let saw=false;
  for(let tt=0; tt<=DUR; tt+=st){
    FRAMES=[]; BARE=false; explainer(ctx,OUTW,OUTH,tt);
    const f=FRAMES, bare=BARE; FRAMES=null; BARE=false;
    if(!bare) continue;
    saw=true;
    if(f.length) bad.push({t:+tt.toFixed(2), why:'a window is still open on the end card',
                           open:[...new Set(f.map(q=>q.k))]});
  }
  // a piece with no end card at all is also a fault: every piece signs off
  if(!saw) bad.push({t:null, why:'no end card -- endCard() is never reached'});
  return bad;
};
window.checkChrome=function(step){
  const bad=[],seen=new Set();
  for(let tt=0; tt<=DUR; tt+=(step||1/6)){
    BOUNDS=[]; FRAMES=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, f=FRAMES; BOUNDS=null; FRAMES=null;
    for(const b of r){
      // the innermost frame whose box contains the string's origin
      let best=null;
      for(const q of f){
        if(b.x>=q.x-1 && b.x<q.x+q.w && b.y>=q.y-1 && b.y<q.y+q.h)
          if(!best || q.w*q.h < best.w*best.h) best=q;
      }
      if(!best) continue;
      const over=Math.round((b.x+b.w)-(best.x+best.w)),
            under=Math.round((b.y+b.h)-(best.y+best.h));
      if(over>1||under>1){
        const k=b.s+'|'+best.k; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),text:b.s,box:best.k,
                  overflowX:over>1?over:0, overflowY:under>1?under:0});
      }
    }
  }
  return bad;
};

window.checkLegibility=function(step){
  const FLOOR={head:22,label:14,num:32,vt:13};
  const bad=[],seen=new Set();
  for(let tt=0; tt<=DUR; tt+=(step||1/6)){
    BOUNDS=[]; explainer(ctx,OUTW,OUTH,tt); const r=BOUNDS; BOUNDS=null;
    for(const b of r){
      if(b.chrome) continue;
      const need = b.role==='num'?FLOOR.num : b.role==='head'?FLOOR.head
                 : b.role==='vt'?FLOOR.vt : FLOOR.label;
      if(b.size<need){
        const k=b.s+'|'+b.size; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),text:b.s,size:b.size,needs:need,role:b.role||'label'});
      }
    }
  }
  return bad;
};

/* A label can sit inside the panel and still straddle the group box's border --
   half on the diagram, half off it. That is what the seal beat shipped with, and
   checkBounds could not see it: it only ever tested the panel rect. A text box
   must be wholly inside the group box or wholly outside it, never across. */
/* A string wider than the rasteriser used to be cut silently. It cannot be any
   more, but a string wider than the SCREEN is still a defect, so sweep for it. */
window.checkTruncation=function(step){
  const bad=[],seen=new Set();
  for(let tt=0; tt<=DUR; tt+=(step||1/6)){
    BOUNDS=[]; explainer(ctx,OUTW,OUTH,tt); const r=BOUNDS; BOUNDS=null;
    for(const b of r){
      if(!b.cut && b.x+b.w<=LW && b.x>=0) continue;
      const k=b.s+'|'+b.size; if(seen.has(k))continue; seen.add(k);
      bad.push({t:+tt.toFixed(2),text:b.s,size:b.size,width:b.full,
                right:b.x+b.full,screen:LW,cut:!!b.cut});
    }
  }
  return bad;
};

/* "Touching the barrier" is its own defect: a label or a stack that technically
   sits inside the group box but with 3px of air reads as crammed against it.
   Require real clearance from the border for anything inside. */
window.checkClearance=function(step,minGap){
  const G=minGap||6, bad=[],seen=new Set();
  for(let tt=0; tt<=DUR; tt+=(step||1/12)){
    BOUNDS=[]; GBOX=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, g=GBOX; BOUNDS=null; GBOX=null;
    const box=g.find(q=>q.k==='groupbox'); if(!box) continue;
    const items=r.filter(a=>!a.chrome&&!a.overlay).map(a=>({x:a.x,y:a.y,w:a.w,h:a.h,k:'"'+a.s+'"'}))
      .concat(g.filter(q=>q.k!=='groupbox'&&q.k!=='cursor'));
    for(const a of items){
      const inside = a.x>=box.x&&a.y>=box.y&&a.x+a.w<=box.x+box.w&&a.y+a.h<=box.y+box.h;
      if(!inside) continue;
      const gap=Math.min(a.x-box.x, a.y-box.y,
                         (box.x+box.w)-(a.x+a.w), (box.y+box.h)-(a.y+a.h));
      if(gap<G){
        const k=a.k; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),item:a.k,gap:gap,need:G});
      }
    }
  }
  return bad;
};

/* The pointer can only be in one place. Two track points at nearly the same
   instant in different places make it teleport, which is what happened the
   first time every label got its own click: 21 jumps over 50 seconds. */
/* When the pointer is NOT working -- no caret, not dragging, not on a click --
   it must not be standing in front of anything. "Open space" is otherwise just
   a coordinate I guessed; this checks it against what is actually on screen. */
window.checkPointerIdle=function(step){
  // Resting on a thing for a moment after acting on it is what a hand does.
  // SITTING on it is the fault. So the rule is dwell-based: flagged only once
  // the pointer has been stationary on content for longer than SIT seconds.
  // Widening fixed exclusion windows instead would have covered most of the
  // timeline and made the check mean nothing.
  const bad=[],seen=new Set(), dt=step||1/12, SIT=0.80;
  let prev=null, stillFor=0;
  for(let tt=0; tt<=DUR; tt+=dt){
    BOUNDS=[]; GBOX=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, g=GBOX; BOUNDS=null; GBOX=null;
    const p=window.pointerPos();
    // In transit it will inevitably cross things; the rule is about where it
    // COMES TO REST. And a button it has just pressed is a fine place to be.
    const moved = !prev || Math.hypot(p.x-prev.x,p.y-prev.y)>1.5;
    stillFor = moved ? 0 : stillFor+dt;
    prev=p;
    if(p.caret || stillFor < SIT) continue;
    const c={x:p.x,y:p.y,w:10,h:16};
    // a *box key is a CONTAINER -- the group box, the lake, the plot area.
    // Standing inside one is not standing in front of anything.
    const items=r.filter(a=>!a.chrome&&!a.overlay).map(a=>({x:a.x,y:a.y,w:a.w,h:a.h,k:'"'+a.s+'"'}))
                 .concat(g.filter(q=>q.k!=='cursor'&&q.k.slice(-3)!=='box'));
    for(const a of items){
      const ox=Math.min(c.x+c.w,a.x+a.w)-Math.max(c.x,a.x);
      const oy=Math.min(c.y+c.h,a.y+a.h)-Math.max(c.y,a.y);
      if(ox>0&&oy>0){
        const k=a.k; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),over:a.k,at:[p.x,p.y],sat:+stillFor.toFixed(2)});
      }
    }
  }
  return bad;
};

window.checkPointerJumps=function(step,maxPx){
  const LIM=maxPx||95, dt=step||1/24, bad=[];
  let prev=null;
  for(let tt=0; tt<=DUR; tt+=dt){
    explainer(ctx,OUTW,OUTH,tt);
    const p=window.pointerPos();
    if(prev && !p.caret && !prev.caret){
      const d=Math.hypot(p.x-prev.x,p.y-prev.y);
      if(d>LIM) bad.push({t:+tt.toFixed(2),px:Math.round(d),limit:LIM});
    }
    prev=p;
  }
  return bad;
};

/* The ninth sweep, and the one that would have caught what every screenshot
   showed and no check did: a beat whose content is all crammed into one end of
   the group box. Nothing is off screen, nothing overlaps, nothing is too small
   -- it just sits low. So measure the band the beat actually occupies and hold
   its centre to the middle of the box. A band narrower than a third of the box
   is reported too: that is dead air, not composition. */
window.checkComposition=function(tol,minFill){
  const T=tol||56, MF=minFill||0.30, bad=[];
  // Measure each beat ONCE, on its SETTLED frame -- half a second before it
  // hands over. Sweeping every frame measured half-built pictures and reported
  // a beat as "high" because only the first of twenty lattice nodes had landed.
  const ks=BKEYS.filter(k=>BEAT[k].sc>=FIRST_CONTENT&&BEAT[k].sc<LAST_BEAT);
  for(let i=0;i<ks.length;i++){
    const next = (i+1<ks.length) ? BEAT[ks[i+1]].sc : LAST_BEAT;
    const tt = next-0.60;
    BOUNDS=[]; GBOX=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, g=GBOX; BOUNDS=null; GBOX=null;
    const box=g.find(q=>q.k==='groupbox'); if(!box) continue;
    const bt=box.y, bb=box.y+box.h;
    const items=r.filter(a=>!a.chrome&&!a.overlay).map(a=>({y:a.y,h:a.h}))
      .concat(g.filter(q=>q.k!=='groupbox'&&q.k!=='cursor'));
    let y0=1e9,y1=-1e9,n=0;
    for(const a of items){
      if(a.y+a.h<=bt || a.y>=bb) continue;     // the caption lives below the box
      y0=Math.min(y0,a.y); y1=Math.max(y1,a.y+a.h); n++;
    }
    if(n<2) continue;
    const off=(y0+y1)/2-(bt+box.h/2), fill=(y1-y0)/box.h;
    // The first content beat is a TITLE CARD -- a typed question on the sky,
    // deliberately sparse. Centring still applies to it; filling does not.
    const card = i===0;
    const why=(off>T?'low':off<-T?'high':'')+((!card&&fill<MF)?(off>T||off<-T?'+':'')+'thin':'');
    if(!why) continue;
    bad.push({beat:ks[i],t:+tt.toFixed(2),band:[y0,y1],
              off:Math.round(off),tol:T,fill:+fill.toFixed(2),why:why});
  }
  return bad;
};

window.checkStraddle=function(step){
  const bad=[],seen=new Set();
  for(let tt=0; tt<=DUR; tt+=(step||1/12)){
    BOUNDS=[]; GBOX=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, g=GBOX; BOUNDS=null; GBOX=null;
    const box=g.find(q=>q.k==='groupbox'); if(!box) continue;
    const subjects=r.filter(a=>!a.chrome&&!a.overlay)
      .map(a=>({x:a.x,y:a.y,w:a.w,h:a.h,s:a.s,size:a.size}))
      .concat(g.filter(q=>q.k!=='groupbox'&&q.k!=='cursor')
               .map(q=>({x:q.x,y:q.y,w:q.w,h:q.h,s:q.k,size:0})));
    for(const a of subjects){
      const inside = a.x>=box.x&&a.y>=box.y&&a.x+a.w<=box.x+box.w&&a.y+a.h<=box.y+box.h;
      const outside= a.x+a.w<=box.x||a.x>=box.x+box.w||a.y+a.h<=box.y||a.y>=box.y+box.h;
      if(!inside&&!outside){
        const k=a.s+'|'+a.size; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),text:a.s,box:[a.x,a.y,a.x+a.w,a.y+a.h],
                  groupbox:[box.x,box.y,box.x+box.w,box.y+box.h]});
      }
    }
  }
  return bad;
};

window.checkOverlap=function(step){
  const hits=[]; const seen=new Set();
  const hit=(a,b)=>{const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),
                          oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
                    return (ox>1&&oy>1)?[ox,oy]:null;};
  for(let tt=0; tt<=DUR; tt+=(step||1/12)){
    BOUNDS=[]; GBOX=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, g=GBOX; BOUNDS=null; GBOX=null;
    // a TAG PLATE on a STACK. Checking only text-vs-graphics missed this
    // entirely: the plate is opaque, so the label on it stayed readable while
    // the plate itself covered the cubes it was meant to label.
    for(let i=0;i<g.length;i++)for(let j=i+1;j<g.length;j++){
      const A=g[i],Bq=g[j];
      const ks=[A.k,Bq.k];
      const isPair=(ks[0].indexOf('tag:')===0&&ks[1]==='voxbar')||
                   (ks[1].indexOf('tag:')===0&&ks[0]==='voxbar');
      if(!isPair) continue;
      const o=hit(A,Bq); if(!o) continue;
      const k='GG|'+ks.join('~'); if(seen.has(k))continue; seen.add(k);
      hits.push({t:+tt.toFixed(2),a:A.k,b:Bq.k,overlap:o});
    }
    // text sitting on top of a sprite, a stack, a tag or the cursor
    const anyOverlay=r.some(a=>a.overlay);
    for(const a of r)for(const b of g){
      // A message box drawn OVER the panel is opaque: its own text does not
      // collide with the vat or the hero number underneath, and the covered
      // text underneath is not visible to collide with anything. Registering
      // the vat is what first surfaced this -- five "overlaps" that are a
      // window sitting on top of a picture, which is what a window is for.
      if(a.overlay!==b.overlay && (a.overlay||anyOverlay)) continue;
      if(a.chrome) continue;                  // title bars sit on their own chrome
      if(b.k==='cursor') continue;            // the pointer is allowed anywhere
      if(b.k.slice(-3)==='box') continue;     // an outline, not a surface -- text
                                              // inside it is the whole point, and
                                              // checkStraddle() polices its border
      if(b.k==='tag:'+a.s) continue;          // a tag's own label sits ON its plate
      // a label printed on an opaque tag plate is readable over whatever the
      // plate covers, so it does not collide with what is behind the plate
      if(g.some(q=>q.k==='tag:'+a.s)) continue;
      const o=hit(a,b); if(!o) continue;
      const k='G|'+a.s+'||'+b.k; if(seen.has(k))continue; seen.add(k);
      hits.push({t:+tt.toFixed(2),a:a.s,b:b.k,overlap:o});
    }
    for(let i=0;i<r.length;i++)for(let j=i+1;j<r.length;j++){
      const a=r[i],b=r[j];
      if(a.overlay!==b.overlay) continue;     // one of them is behind a window
      if(a.s===b.s&&Math.abs(a.x-b.x)<=1&&Math.abs(a.y-b.y)<=1) continue;   // shadow
      const ox=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x);
      const oy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
      if(ox>1&&oy>1){
        const k=a.s+'||'+b.s; if(seen.has(k))continue; seen.add(k);
        hits.push({t:+tt.toFixed(2),a:a.s,b:b.s,overlap:[ox,oy]});
      }
    }
  }
  return hits;
};

/* ===== LAYER SOUND =====
   The spec's kit, one source per layer: chrome = UI snaps, screen = chip
   blips, objects = hollow plastic knocks, glass = mains hum + phosphor zap.
   Everything except the voice is synthesised, so it costs no bytes, seeks
   instantly and stays a pure function of t like the picture does.

   Browsers will not start audio without a user gesture, so nothing is built
   until SOUND ON is pressed -- the picture plays silent until then, which is
   why the button says what it says. */
const AU={on:false,ctx:null,t0:0,i:0,vo:null,voBuf:null,hum:null,g:{}};

function auBuild(){
  const C=window.AudioContext||window.webkitAudioContext; if(!C) return false;
  const c=new C(); AU.ctx=c;
  const mk=(v,to)=>{const g=c.createGain();g.gain.value=v;g.connect(to||c.destination);return g;};
  AU.g.master=mk(0.9);
  AU.g.voice =mk(1.00,AU.g.master);   // the voice is the thing being listened to
  AU.g.sfx   =mk(0.40,AU.g.master);   // effects in front of the bed, under the voice
  AU.g.music =mk(0.085,AU.g.master);  // "a hint" -- felt, not followed
  AU.g.hum   =mk(0.030,AU.g.master);  // the tube, not a note
  // noise once, reused by every click/knock/zap
  const n=c.createBuffer(1,c.sampleRate*0.5,c.sampleRate),d=n.getChannelData(0);
  let seed=12345; for(let i=0;i<d.length;i++){seed=(seed*1664525+1013904223)|0;d[i]=(seed/2147483648);}
  AU.noise=n; return true;
}
const env=(g,t,a,dec,peak)=>{g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(peak,t+a);
  g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec);};
function noiseAt(t,dur,type,freq,q,peak,dest){
  const c=AU.ctx,s=c.createBufferSource();s.buffer=AU.noise;
  s.loop=true;s.playbackRate.value=1;
  const f=c.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
  const g=c.createGain();s.connect(f);f.connect(g);g.connect(dest||AU.g.sfx);
  env(g,t,0.002,dur,peak);s.start(t);s.stop(t+dur+0.05);
}
function toneAt(t,type,f0,f1,dur,peak,dest,atk){
  const c=AU.ctx,o=c.createOscillator(),g=c.createGain();
  o.type=type;o.frequency.setValueAtTime(f0,t);
  if(f1!==f0)o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  o.connect(g);g.connect(dest||AU.g.sfx);
  env(g,t,atk||0.004,dur,peak);o.start(t);o.stop(t+dur+0.06);
}
/* one function per kit entry, so a beat's sound is named not improvised */
const SFX={
  click:t=>{noiseAt(t,0.022,'bandpass',2600,1.1,0.55);toneAt(t,'square',1500,900,0.016,0.10);},
  snap: t=>{noiseAt(t,0.035,'bandpass',1700,0.9,0.42);toneAt(t,'square',900,520,0.022,0.09);},
  open: t=>{toneAt(t,'square',320,1180,0.17,0.11);noiseAt(t+0.01,0.12,'highpass',1800,0.7,0.16);},
  blip: (t,n)=>{toneAt(t,'square',880+((n|0)%3)*110,880+((n|0)%3)*110,0.028,0.085);},
  knock:(t,n)=>{toneAt(t,'triangle',250-((n|0)%3)*18,110,0.085,0.42);
                noiseAt(t,0.03,'lowpass',900,0.8,0.22);},
  tag:  t=>{toneAt(t,'triangle',520,300,0.07,0.30);noiseAt(t,0.02,'bandpass',1200,1,0.16);},
  draw: t=>{toneAt(t,'square',420,1250,0.26,0.055);},
  zap:  t=>{toneAt(t,'sawtooth',1500,180,0.16,0.42);noiseAt(t,0.1,'bandpass',2400,0.6,0.3);},
  mos:  t=>{noiseAt(t,0.17,'bandpass',800,0.5,0.34);toneAt(t,'square',200,90,0.14,0.10);},
  /* the cold open's gag bank. A snap, a wash and a thump are three different
     sounds and a gag needs all three: the crack is the event, the crumble is
     the consequence, the sub is the weight of it going under. */
  crack:(t,n)=>{noiseAt(t,0.05,'highpass',3200,0.8,0.52);
                toneAt(t,'square',2300-((n|0)%3)*320,420,0.055,0.26);
                noiseAt(t+0.012,0.10,'bandpass',1500,1.6,0.24);},
  crumble:(t,n)=>{noiseAt(t,0.44,'bandpass',720-((n|0)%4)*95,0.5,0.30);
                  toneAt(t,'triangle',155,62,0.34,0.20);},
  splash:t=>{noiseAt(t,0.30,'lowpass',2600,0.4,0.44);
             noiseAt(t+0.05,0.40,'highpass',900,0.5,0.20);
             toneAt(t,'sine',300,90,0.22,0.18);},
  sub:  t=>{toneAt(t,'sine',92,36,0.72,0.55);noiseAt(t,0.5,'lowpass',260,0.7,0.26);},
  /* two detuned saws through a bandpass with an LFO on the cutoff -- a bee is
     a beating filter, not a pitch. */
  buzz: (t,d)=>{const c=AU.ctx, dd=d||1.0, g=c.createGain(), bp=c.createBiquadFilter();
    bp.type='bandpass'; bp.frequency.value=880; bp.Q.value=3.2;
    const lfo=c.createOscillator(), lg=c.createGain();
    lfo.type='sine'; lfo.frequency.value=23; lg.gain.value=340;
    lfo.connect(lg); lg.connect(bp.frequency);
    [196,204].forEach(f=>{const o=c.createOscillator();o.type='sawtooth';
      o.frequency.value=f;o.connect(bp);o.start(t);o.stop(t+dd+0.05);});
    bp.connect(g); g.connect(AU.g.sfx);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.26,t+0.09);
    g.gain.setValueAtTime(0.26,t+dd*0.72);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dd);
    lfo.start(t); lfo.stop(t+dd+0.05);},
  moo:  t=>{const c=AU.ctx,o=c.createOscillator(),g=c.createGain(),bp=c.createBiquadFilter();
    bp.type='bandpass'; bp.Q.value=4.5;
    bp.frequency.setValueAtTime(620,t); bp.frequency.linearRampToValueAtTime(360,t+0.78);
    o.type='sawtooth'; o.frequency.setValueAtTime(148,t);
    o.frequency.linearRampToValueAtTime(188,t+0.22);
    o.frequency.linearRampToValueAtTime(116,t+0.80);
    o.connect(bp); bp.connect(g); g.connect(AU.g.sfx);
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.40,t+0.07);
    g.gain.setValueAtTime(0.40,t+0.55);
    g.gain.exponentialRampToValueAtTime(0.0001,t+0.86);
    o.start(t); o.stop(t+0.92);},
  note: (t,f,d)=>{const c=AU.ctx,o=c.createOscillator(),g=c.createGain(),lp=c.createBiquadFilter();
    lp.type='lowpass';lp.frequency.value=2200;o.type='square';o.frequency.value=f;
    o.connect(lp);lp.connect(g);g.connect(AU.g.music);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.5,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.start(t);o.stop(t+d+0.05);},
  bass: (t,f,d)=>{const c=AU.ctx,o=c.createOscillator(),g=c.createGain();
    o.type='triangle';o.frequency.value=f;o.connect(g);g.connect(AU.g.music);
    g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.75,t+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,t+d);o.start(t);o.stop(t+d+0.05);}
};

/* ---- the score ----
   buildScore() lives in the PIECE, not here: it addresses that piece's own
   beats and word indices. Honey's copy referenced BEAT.PAN, which only
   halloumi has, and the whole runtime threw on load.                      */
const SCORE=buildScore();
// the spec asks for this: the offline renderer mixes from the same score
window.scoreSound=(a,b)=>SCORE.filter(e=>e.t>=a&&e.t<b);
window.AU=AU;window.TL_VO=VOHASH;   // so a test can assert the voice actually decoded, not just that a button exists

/* ---- transport ---- */
function auStartHum(){
  if(AU.hum) return; const c=AU.ctx; AU.hum=[];
  [60,120].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();
    o.type='sine';o.frequency.value=f;g.gain.value=i?0.35:1;
    o.connect(g);g.connect(AU.g.hum);o.start();AU.hum.push(o);});
}
function auSeek(t){                       // audio follows the picture, never leads
  if(!AU.on||!AU.ctx) return;
  AU.i=0; while(AU.i<SCORE.length&&SCORE[AU.i].t<t) AU.i++;
  AU.t0=AU.ctx.currentTime-t;
  if(AU.vo){try{AU.vo.stop();}catch(e){} AU.vo=null;}
  if(AU.voBuf&&t<DURATION-0.05){
    const s=AU.ctx.createBufferSource();s.buffer=AU.voBuf;s.connect(AU.g.voice);
    s.start(AU.ctx.currentTime,Math.max(0,t)); AU.vo=s;}
}
function auStop(){ if(AU.vo){try{AU.vo.stop();}catch(e){} AU.vo=null;} }
function auTick(t){                       // schedule a 0.25s lookahead
  if(!AU.on||!AU.ctx) return;
  const c=AU.ctx, until=t+0.25;
  while(AU.i<SCORE.length&&SCORE[AU.i].t<until){
    const e=SCORE[AU.i++], when=Math.max(c.currentTime,AU.t0+e.t);
    try{ if(e.k==='note')SFX.note(when,e.n,0.21);
         else if(e.k==='bass')SFX.bass(when,e.n,0.5);
         else SFX[e.k](when,e.n); }catch(err){}
  }
}

/* ===== player ===== */
const cv=document.getElementById('tv'),ctx=cv.getContext('2d');
const ppB=document.getElementById('pp'),scrub=document.getElementById('scrub'),
      timeEl=document.getElementById('time'),loopEl=document.getElementById('loop'),
      sndB=document.getElementById('snd');
let cur=0,playing=false,last=0;
const DURATION=DUR;             // single source: the generated timeline
buildGlass(OUTW,OUTH);
window.DURATION=DURATION;
window.seek=(t)=>{cur=H.clamp(t,0,DURATION);explainer(ctx,OUTW,OUTH,cur);
  scrub.value=(cur/DURATION)*1000;timeEl.textContent=cur.toFixed(2)+' / '+DURATION.toFixed(1);};
function frame(ts){if(!playing)return;
  // dt is clamped: a backgrounded tab hands back a delta of seconds, which
  // used to jump the picture past half the piece while the audio stayed put.
  const dt=Math.min(0.1,(ts-last)/1000);last=ts;cur+=dt;
  if(cur>=DURATION){
    if(loopEl.checked){cur=0;auSeek(0);}else{cur=DURATION;setPlay(false);}}
  window.seek(cur);auTick(cur);requestAnimationFrame(frame);}
function setPlay(v){playing=v;ppB.textContent=v?'PAUSE':'PLAY';
  if(v){last=performance.now();auSeek(cur);requestAnimationFrame(frame);}else auStop();}
// picture clock, exposed so a harness can measure it against the audio clock
window.pictureTime=()=>cur;
ppB.onclick=()=>setPlay(!playing);
scrub.oninput=()=>{window.seek((scrub.value/1000)*DURATION);auSeek(cur);};
document.addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();setPlay(!playing);}});

/* --- audio is armed by a click, because browsers require one --- */
async function armAudio(){
  if(!AU.ctx && !auBuild()){sndB.textContent='NO AUDIO';return false;}
  if(AU.ctx.state==='suspended') await AU.ctx.resume();
  if(!AU.voBuf){
    sndB.textContent='LOADING';
    // Raced against a timeout: on a slow connection, or anywhere decodeAudioData
    // never settles, the button used to sit on LOADING for ever with no way back.
    // The effects and the bed are synthesised, so they still work voiceless.
    try{
      AU.voBuf=await Promise.race([
        // The URL carries the track's content hash. It used to be a bare
        // 'narration.mp3' with cache:'force-cache', which tells the browser to
        // reuse ANY cached copy regardless of freshness -- so a reload could
        // show a new picture driven by the previous take's voice.
        (async()=>{ const r=await fetch('narration.mp3?v='+VOHASH);
                    if(!r.ok) throw new Error('narration '+r.status);
                    return await AU.ctx.decodeAudioData(await r.arrayBuffer()); })(),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('voice timed out')),8000))
      ]);
    }catch(e){ AU.voBuf=null; console.warn('[cathode] voice unavailable:',e.message); }
  }
  auStartHum(); return true;
}
sndB.onclick=async()=>{
  if(AU.on){AU.on=false;auStop();AU.g.master.gain.value=0;sndB.textContent='AUDIO OFF';return;}
  if(!await armAudio()) return;
  AU.on=true;AU.g.master.gain.value=0.9;sndB.textContent='AUDIO ON';
  auSeek(cur);
};
(async()=>{
  try{await Promise.all(['8px "Press Start 2P"','16px "Press Start 2P"','10px "Silkscreen"',
    '38px "Silkscreen"','9px "VT323"'].map(f=>document.fonts.load(f,'AaZz0123456789%?°')));
    await document.fonts.ready;}catch(e){}
  TCACHE.clear();CCACHE.clear();   // both are keyed on glyphs the fallback font drew
  // ?t=6.5 jumps straight to a frame and holds it -- used for review and for
  // the frame-by-frame video render, which needs a still at an exact time.
  const q=new URLSearchParams(location.search), qt=parseFloat(q.get('t'));
  // ?bare=1 strips the page down to the frame itself at 1:1, so a headless
  // screenshot at the buffer size IS the frame -- that is how the library's
  // thumbnails are cut, with no cropping step to get wrong.
  if(q.get('bare')){
    const st=document.querySelector('.stage');
    document.querySelectorAll('body *').forEach(e=>{
      if(e===st||st.contains(e)||e.contains(st)) return;
      e.style.display='none';});
    for(let n=st; n&&n!==document.body; n=n.parentElement)
      n.style.cssText='margin:0;padding:0;border:0;max-width:none;box-shadow:none;display:block;background:#000';
    document.body.style.cssText='margin:0;padding:0;background:#000;overflow:hidden';
    document.querySelector('.bar').style.display='none';
    cv.style.width=LW+'px';
  }
  if(!isNaN(qt)){window.seek(qt);setPlay(false);}
  else{window.seek(0);setPlay(true);}
})();
