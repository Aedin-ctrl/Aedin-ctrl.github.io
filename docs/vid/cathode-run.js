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
  /* TWO presses, in the order the windows arrived: OK on the question, then
     the X on the part number. One press used to shut both, which is why they
     read as one graphic rather than two things on a desktop. */
  if(PIECE.part){ P.push({t:+Number(PIECE.part.shut).toFixed(3),
                          x:PART_OK.x, y:PART_OK.y, c:1});
                  P.push({t:+Number(PIECE.part.xshut).toFixed(3),
                          x:PART_X.x, y:PART_X.y, c:1}); }
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
  /* The cold open's own question card belongs to a standalone. A part asks
     the SERIES question on its card instead, so VO[0] is that card's line and
     pressing OK_DIALOG after it would put the hand on a window that is not
     there. */
  if(!PIECE.part) P.push({t:+(VO[0].z+0.12).toFixed(3), x:OK_DIALOG.x, y:OK_DIALOG.y, c:1});
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
  // A part carries the part card AND a spoken recap before it starts teaching,
  // so both ends of its range sit above a standalone's.
  /* House style v4.3: the target is 85-110s and the floor is 65. The old gate
     here was 65-78 for a standalone, which was the v2.4 target and would now
     REFUSE any standalone built to the current spec -- the next piece would
     have failed its own sweep. The ceiling is one number for both; a part
     still has a floor of its own because it carries a narrated card. */
  const LO=PIECE.part?82:65, HI=115;
  if(DUR<LO||DUR>HI) bad.push({field:'DUR',got:DUR,need:LO+'-'+HI+'s'});
  if(PIECE.part){
    const q=PIECE.part;
    /* v4.10: the cap was 4, written when C (3 parts) was the only series that
       existed and the spec section was titled "Series: three pieces, one
       question". IDEAS.md meanwhile planned a 5-part D and E and two 8-part
       series, so the ledger and the validator disagreed, and the disagreement
       was invisible until a 5-part part was actually built -- it would have
       failed its own sweep at the end of the build, not the start. 8 is the
       longest thing the ledger plans. The REAL limit on a series is the series
       rules (every part stands alone, one part one turn), which no validator
       can check. */
    if(!(q.of>=2&&q.of<=8)) bad.push({field:'part.of',got:q.of,need:'2-8'});
    if(!(q.n>=1&&q.n<=q.of)) bad.push({field:'part.n',got:q.n,need:'1..of'});
    if(q.first!==PIECE.no-(q.n-1)) bad.push({field:'part.first',got:q.first,
                                             need:PIECE.no-(q.n-1)});
    if(!q.series||q.series.length<4) bad.push({field:'part.series',got:q.series});
    if(!Array.isArray(q.titles)||q.titles.length!==q.of)
      bad.push({field:'part.titles',got:q.titles,need:q.of+' titles'});
    /* The recap is what makes the numbering mean anything, and it is a SPOKEN
       BEAT, not a field. It lived as three rows of small print on the part card
       and that was the wrong place: a dialog box is furniture, and the one thing
       a viewer actually needs -- where the last part got to -- was set in the
       smallest type in the piece and gone in two seconds. It is the first thing
       on the blackboard now, narrated like everything else that matters. */
    /* The card is NARRATED, so the first two spoken beats are the card itself:
       TITLE asks the series question out loud while it types, and PART says
       which part this is. It used to be 2.5s of silent text. */
    if(!BEAT.TITLE||!VO.some(v=>v.b==='TITLE'))
      bad.push({field:'BEAT.TITLE',got:Object.keys(BEAT).join(','),
                need:'a spoken TITLE beat -- the series question, asked aloud'});
    if(!BEAT.PART||!VO.some(v=>v.b==='PART'))
      bad.push({field:'BEAT.PART',got:Object.keys(BEAT).join(','),
                need:'a spoken PART beat -- "Part two.", said aloud'});
    /* Part one has nothing to hand over, so it opens on a QUESTION. Requiring
       a recap of it could only ever produce a plan -- "three videos, one chip,
       this one is about the material it is made of" -- which is a table of
       contents read aloud, and it was. Parts after the first have a real
       handover and keep it. */
    if(q.n===1){
      if(!BEAT.OPEN||!VO.some(v=>v.b==='OPEN'))
        bad.push({field:'BEAT.OPEN',got:Object.keys(BEAT).join(','),
                  need:'part one opens on a question, not a recap'});
      if(BEAT.RECAP) bad.push({field:'BEAT.RECAP',got:'present',
                               need:'part one has nothing to recap'});
    } else if(!BEAT.RECAP||!VO.some(v=>v.b==='RECAP'))
      bad.push({field:'BEAT.RECAP',got:Object.keys(BEAT).join(','),
                need:'a spoken RECAP beat, first on the blackboard'});
    /* The card's own close time. It lives in PIECE because TWO things need it:
       the piece, to stop drawing the card, and PTRACK, to put the hand on the
       button. Held in the piece alone they drifted apart and the card shut on
       its own while the hand was elsewhere. */
    /* Four moments, in the order a person would do them: the question is
       asked, the part number pops out from under it and is said, OK, then the
       X. They live in PIECE because the piece draws them and PTRACK puts the
       hand on them; held privately they drifted and a card shut by itself
       while the pointer was somewhere else. */
    const tv=VO.find(v=>v.b==='TITLE'), pv=VO.find(v=>v.b==='PART');
    if(tv&&!(q.pop>=tv.z-0.10))
      bad.push({field:'part.pop',got:q.pop,need:'>= TITLE end '+tv.z.toFixed(2)});
    if(pv&&!(q.shut>=pv.z))
      bad.push({field:'part.shut',got:q.shut,need:'>= PART end '+pv.z.toFixed(2)});
    if(!(q.xshut>=q.shut+0.40))
      bad.push({field:'part.xshut',got:q.xshut,need:'>= shut+0.40 -- two presses, not one'});
    if(!(q.shut>=1.6)) bad.push({field:'part.shut',got:q.shut,need:'>=1.6'});
  }
  return bad;
};
window.DUR=DUR; window.LW=LW; window.LH=LH; window.VO=VO; window.BEAT=BEAT; window.VOHASH=VOHASH; window.PTRACKDBG=PTRACK;
// Beat names differ per piece, so the sweeps address them positionally: the
// first CONTENT beat (after the hook) and the LAST beat. Hard-coding JAR/END
// worked for one script and threw on the next.
const BKEYS=Object.keys(BEAT);
/* A part spends its first TWO beats on the card -- the series question and the
   part number -- and neither is drawn inside the program window, so neither is
   content. A standalone spends its first on the cold open. Hard-coding
   BKEYS[1] measured a part's "composition" against a dialog box on the sky. */
const FIRST_IDX=PIECE.part?2:1;
const FIRST_CONTENT=BEAT[BKEYS[FIRST_IDX]].sc, LAST_BEAT=BEAT[BKEYS[BKEYS.length-1]].sc;
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
  /* ...and the END OF A DRAG is a fine place to be, for the same reason a
     button it has just pressed is. A drag's whole point is that the hand takes
     something somewhere, and where it takes it is ON the object: the probe
     comes down onto a die, the saw is drawn down a lane. The hand then waits
     there until its rest is due. Flagging that is flagging the act. The
     exemption is narrow -- within 1.2s of arriving, and within 3px of the
     arrival point -- so a hand that genuinely parks is still caught. */
  /* Same for a press. The comment above has said since v2.6 that "a button it
     has just pressed is a fine place to be" and nothing ever implemented it,
     so the only thing actually exempt was the text caret. */
  const ARRIVE=(window.PTRACKDBG||[]).filter(k=>k.d||k.c)
                                     .sort((a,c)=>a.t-c.t);
  /* "Where it last acted" -- not "where it acted in the last second". A hand
     that pressed OK and has not moved since is still on the button it pressed,
     whether the gag it is watching runs for one second or three; #002 and #007
     were flagged for sitting on their own dialog button through the cold open,
     which is what a hand does when the joke is the content. The moment it acts
     somewhere else, or moves off, the exemption is gone -- so a hand parked on
     a diagram it never touched is still caught, which is the case the check
     was written for (#010's pointer sat 8.67s on a silicon atom off a SPOT
     rest, and that still fires). */
  const justDragged=(tt,x,y)=>{
    let last=null;
    for(const k of ARRIVE){ if(k.t>tt) break; last=k; }
    return !!last && Math.abs(x-last.x)<=3 && Math.abs(y-last.y)<=3; };
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
    if(justDragged(tt,p.x,p.y)) continue;
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
      /* A tag plate is opaque, so it hides whatever it lands on whether that
         is a voxel stack or a drawn object. This used to test `tag:* vs
         voxbar` and nothing else, so the one case it had been written for was
         the only case it could ever find. Now: a plate against any registered
         surface that is not itself a plate, a container or the pointer. */
      const ti=[ks[0].indexOf('tag:')===0, ks[1].indexOf('tag:')===0];
      if(!ti[0]&&!ti[1]) continue;                // neither is a plate
      if(ti[0]&&ti[1]){
        /* TWO PLATES. Both are opaque, so the one drawn second hides the one
           drawn first along with its label -- and nothing else in this sweep
           could see it: the plate-vs-surface test needs exactly one plate, and
           the text test skips any string that sits on a plate of its own. #012
           printed FULL SPEED and SOLD SLOWER and then laid SAME SILICON, TWO
           PRODUCTS across the bottom half of both of them, unreadable, with
           all thirteen sweeps at 0. */
      } else {
        const other=ti[0]?ks[1]:ks[0];
        if(other==='cursor'||other.slice(-3)==='box') continue;
      }
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

/* ===== THE FOURTEENTH SWEEP: a window lands on a clear stage =====
   #013 drew the piece's closing statement on the stage and opened the summary
   dialog over it in the SAME instant, so the answer to the question the piece
   had spent ninety seconds asking spent its last five seconds underneath a
   window -- with all thirteen sweeps returning 0. Three separate things made
   it unreachable: checkOverlap exempts any text pair that straddles the
   overlay boundary (`a.overlay!==b.overlay`, which is correct -- a window IS
   opaque and its own text does not collide with what it hides), window chrome
   is skipped by `b.chrome`, and the window plate is not a text item at all, so
   there was nothing in any registry to collide WITH.

   The missing fact was never a rectangle -- all the rectangles were already
   registered. It was the ORDER. Content drawn before a window and under it is
   hidden; content drawn after a window and on it is that window's own. So
   winFrame() records the lengths BOUNDS and GBOX had when it ran, and anything
   with a lower index than that is underneath.

   The biggest window in a frame is the stage -- the program window the piece
   runs in, which is the thing content is SUPPOSED to be inside. Every other
   window floats, and a floater has to land on clear stage. Exempt: the
   pointer (allowed anywhere, like every other sweep), the group box (an
   outline the size of the panel -- every dialog covers part of it by
   definition), and the question card's own two windows, which are windows and
   not content.                                                              */
window.checkCard=function(step){
  const st=step||1/12, bad=[], seen=new Set();
  const EXEMPT=new Set(['cursor','groupbox','card','cardnum']);
  const ov=(a,b)=>{const x=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),
                         y=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);
                   return (x>1&&y>1)?[Math.round(x),Math.round(y)]:null;};
  for(let tt=0; tt<=DUR; tt+=st){
    BOUNDS=[]; GBOX=[]; WINS=[]; SCENE=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS, g=GBOX, w=WINS, sc=SCENE;
    BOUNDS=null; GBOX=null; WINS=null; SCENE=null;
    if(w.length<2) continue;         // one window cannot float over anything
    let stage=w[0]; for(const q of w) if(q.w*q.h>stage.w*stage.h) stage=q;
    for(const q of w){
      if(q===stage) continue;
      for(let i=0;i<q.nb&&i<r.length;i++){
        const b=r[i]; if(b.chrome) continue;
        const o=ov(q,b); if(!o) continue;
        const k='T|'+b.s+'|'+q.title; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),window:q.title||'(untitled)',covers:b.s,overlap:o});
      }
      for(let i=0;i<q.ng&&i<g.length;i++){
        const b=g[i]; if(EXEMPT.has(b.k)) continue;
        const o=ov(q,b); if(!o) continue;
        const k='G|'+b.k+'|'+q.title; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),window:q.title||'(untitled)',covers:b.k,overlap:o});
      }
    }
    /* ...and the reverse question, which this sweep never asked: a window that
       is BURIED is as broken as one that buries. The cold open's object list
       is SCENE, which only checkFraming ever read, so #015's bank could be
       drawn after the part card and cover all but a sliver of "PART 1" with
       all fourteen sweeps at 0. Anything pushed to SCENE after a window opened
       was painted on top of it. */
    for(const q of w){
      for(let i=q.ns||0;i<sc.length;i++){
        const b=sc[i]; if(/exit$/.test(b.k)) continue;
        const o=ov(q,b); if(!o) continue;
        const k='S|'+b.k+'|'+q.title; if(seen.has(k))continue; seen.add(k);
        bad.push({t:+tt.toFixed(2),window:q.title||'(untitled)',buriedBy:b.k,overlap:o});
      }
    }
  }
  return bad;
};

/* ===== THE FIFTEENTH SWEEP: DO NOT RETYPE THE NARRATION =====
   Generation rule 10 has said "print the CAPTION, not the raw spoken words"
   since v2.x, and v4.7 restated it and said it applied from the next piece.
   Seven pieces were then built that all retyped their closing sentence into a
   dialog -- up to 34 words of it -- because the pattern was copied forward from
   piece to piece and NOTHING EVER CHECKED. A rule with no sweep is a comment.

   The two legitimate cases are real: the narrated question card, where the
   typing IS the narrator asking, and a deliberate verbatim QUOTATION (#016
   prints the Bank of England's own sentence, which is the point of the beat).
   Both are now DECLARED, in PIECE.verbatim, so an exemption is a visible
   decision in the piece header rather than a thing that quietly happens. */
window.checkNarration=function(){
  const bad=[];
  /* v4.7 grandfathered what came before it: "The thirteen pieces built before
     v4.7 keep their verbatim captions ... It applies from the next piece."
     #014 was the last of them. */
  if(typeof PIECE!=='undefined' && PIECE.no<=14) return bad;
  const allow=new Set((typeof PIECE!=='undefined'&&PIECE.verbatim)||[]);
  const norm=x=>String(x).toUpperCase().replace(/[^A-Z0-9']/g,'');
  /* typeWrap() breaks a sentence into ROWS, so no single drawn item ever holds
     more than a few words of it -- the first version of this sweep looked at
     items one at a time and returned CLEAN on a box containing all 25 words.
     The drawn text has to be reassembled in draw order before it is compared.
     Sampled just after each sentence finishes, which is when a retyped one is
     fully on screen. */
  for(let n=0;n<VO.length;n++){
    if(allow.has(n)) continue;
    const sn=VO[n].w.map(norm);
    const lim=Math.max(8,Math.ceil(sn.length*0.55));
    if(sn.length<lim) continue;
    const tt=Math.min(DUR,VO[n].z+0.12);
    BOUNDS=[]; explainer(ctx,OUTW,OUTH,tt);
    const r=BOUNDS; BOUNDS=null;
    const W=[];
    for(const b of r){ if(b.chrome) continue;
      String(b.s||'').split(/\s+/).map(norm).filter(Boolean).forEach(x=>W.push(x)); }
    if(W.length<lim) continue;
    // longest contiguous run common to the drawn text and the sentence
    let best=0, at=-1, prev=new Array(sn.length+1).fill(0);
    for(let a=1;a<=W.length;a++){
      const cur=new Array(sn.length+1).fill(0);
      for(let c=1;c<=sn.length;c++){
        if(W[a-1]===sn[c-1]){ cur[c]=prev[c-1]+1;
          if(cur[c]>best){ best=cur[c]; at=c-cur[c]; } }
      }
      prev=cur;
    }
    if(best>=lim)
      bad.push({sentence:n, of:sn.length, printed:best, limit:lim,
                t:+tt.toFixed(2), text:sn.slice(at,at+Math.min(best,8)).join(' ')});
  }
  return bad;
};

/* ===== VIEWING PREFERENCES =====
   Speed, size and whether the sound is wanted. They follow you from one
   video to the next inside the tab, and a RELOAD clears them -- which is the
   rule as asked for, and is why this is sessionStorage plus an explicit check
   of the navigation type rather than localStorage. Every access is wrapped:
   sessionStorage throws outright in a private window and in some embeds, and
   the player must not die with it. */
const RATES=[0.5,0.75,1,1.25,1.5,2];
const SIZES=[['S',320],['M',430],['L',580],['XL',760]];
const PREFS=(()=>{
  const d={rate:1,size:430,sound:true};
  try{
    const nav=performance.getEntriesByType('navigation')[0];
    if(nav&&nav.type==='reload'){ sessionStorage.removeItem('cathode.prefs'); return d; }
    const raw=JSON.parse(sessionStorage.getItem('cathode.prefs')||'{}');
    // validated, not trusted: a stale or hand-edited value must not be able to
    // set a rate of 0 and stop the clock dead.
    if(RATES.indexOf(raw.rate)>=0) d.rate=raw.rate;
    if(SIZES.some(z=>z[1]===raw.size)) d.size=raw.size;
    if(typeof raw.sound==='boolean') d.sound=raw.sound;
  }catch(e){}
  return d;
})();
function savePrefs(){ try{ sessionStorage.setItem('cathode.prefs',JSON.stringify(PREFS)); }catch(e){} }

/* ===== LAYER SOUND =====
   The spec's kit, one source per layer: chrome = UI snaps, screen = chip
   blips, objects = hollow plastic knocks, glass = mains hum + phosphor zap.
   Everything except the voice is synthesised, so it costs no bytes, seeks
   instantly and stays a pure function of t like the picture does.

   Browsers will not start audio without a user gesture, so nothing is built
   until one arrives. The page now ASKS for sound by default and arms itself on
   the first press -- PLAY, the scrub, the spacebar, a click anywhere -- so the
   silent-until-you-find-the-button state only exists while nothing is playing.
   AUDIO OFF is still a real toggle, and it is remembered like the other two
   preferences. */
const AU={on:false,ctx:null,t0:0,i:0,vo:null,voFailed:false,hum:null,g:{}};

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
/* The voice is an <audio> element routed into the graph, not a decoded
   AudioBuffer. An AudioBufferSourceNode CAN be sped up -- but its playbackRate
   is a resampler, so 2x arrives a whole octave high and 0.5x an octave low.
   A media element has preservesPitch, which is what makes a speed control
   usable on a voice. The effects and the bed stay synthesised, so they are
   still a pure function of t and still cost no bytes. */
function applyRate(){
  const el=AU.vo; if(!el) return;
  el.playbackRate=PREFS.rate;
  // the standard name landed late; the two prefixed ones are what older
  // Safari and Firefox read, and setting all three is free.
  el.preservesPitch=true; el.webkitPreservesPitch=true; el.mozPreservesPitch=true;
}
/* piece-time t maps to real time as t0 + t/rate: every schedule below divides,
   and getting one of them wrong puts the clicks and the voice on two clocks. */
function auSeek(t){                       // audio follows the picture, never leads
  if(!AU.on||!AU.ctx) return;
  AU.i=0; while(AU.i<SCORE.length&&SCORE[AU.i].t<t) AU.i++;
  AU.t0=AU.ctx.currentTime-t/PREFS.rate;
  const el=AU.vo; if(!el) return;
  applyRate();
  try{ el.currentTime=H.clamp(t,0,Math.max(0,DURATION-0.02)); }catch(e){}
  if(playing&&t<DURATION-0.05){ const pr=el.play(); if(pr&&pr.catch) pr.catch(()=>{}); }
  else { try{el.pause();}catch(e){} }
}
function auStop(){ if(AU.vo){try{AU.vo.pause();}catch(e){}} }
function auTick(t){                       // schedule a 0.25s lookahead
  if(!AU.on||!AU.ctx) return;
  const c=AU.ctx, r=PREFS.rate, until=t+0.25*r;
  while(AU.i<SCORE.length&&SCORE[AU.i].t<until){
    const e=SCORE[AU.i++], when=Math.max(c.currentTime,AU.t0+e.t/r);
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
  // dt is clamped BEFORE the rate is applied: a backgrounded tab hands back a
  // delta of seconds, which used to jump the picture past half the piece while
  // the audio stayed put. Clamping after multiplying would let 2x through at
  // twice the ceiling.
  const dt=Math.min(0.1,(ts-last)/1000)*PREFS.rate;last=ts;cur+=dt;
  if(cur>=DURATION){
    if(loopEl.checked){cur=0;auSeek(0);}else{cur=DURATION;setPlay(false);}}
  window.seek(cur);auTick(cur);requestAnimationFrame(frame);}
function setPlay(v){playing=v;ppB.textContent=v?'PAUSE':'PLAY';
  if(v){last=performance.now();auSeek(cur);requestAnimationFrame(frame);}else auStop();}
// picture clock, exposed so a harness can measure it against the audio clock
window.pictureTime=()=>cur;
ppB.onclick=()=>{setPlay(!playing);autoArm();};
scrub.oninput=()=>{window.seek((scrub.value/1000)*DURATION);auSeek(cur);};
document.addEventListener('keydown',e=>{
  if(e.code!=='Space') return;
  // Space is the page's play/pause -- except when a control in the bar has
  // focus, where it belongs to that control. Swallowing it there meant the
  // speed and size buttons could be reached by keyboard and not pressed.
  const a=document.activeElement;
  if(a&&a.closest&&a.closest('.bar')) return;
  e.preventDefault();setPlay(!playing);autoArm();});

/* ===== speed and size =====
   One popup at the end of the control bar, which puts it in the bottom-right
   corner of the picture without a magic offset -- and means `?bare=1`, which
   hides the bar, takes it along. */
const fxB=document.getElementById('fxb'),fxP=document.getElementById('fxp'),
      fxRate=document.getElementById('fxrate'),fxSize=document.getElementById('fxsize'),
      stageEl=document.querySelector('.stage');
function fxMark(){
  if(fxB) fxB.textContent=(PREFS.rate===1?'1':String(PREFS.rate))+'x';
  [[fxRate,'rate'],[fxSize,'size']].forEach(([host,key])=>{
    if(!host) return;
    host.querySelectorAll('button').forEach(b=>
      b.classList.toggle('on',Number(b.dataset.v)===PREFS[key]));
  });
}
function applySize(){ if(stageEl) stageEl.style.maxWidth=PREFS.size+'px'; }
function setRate(r){
  PREFS.rate=r; savePrefs(); fxMark();
  // re-anchor: AU.t0 and the voice element are both rate-dependent, so a rate
  // changed mid-play has to re-seek or the clicks drift off the voice.
  auSeek(cur);
}
function setSize(px){ PREFS.size=px; savePrefs(); applySize(); fxMark(); }
if(fxRate&&fxSize){
  RATES.forEach(r=>{const b=document.createElement('button');
    b.type='button'; b.dataset.v=r; b.textContent=(r===1?'1':String(r))+'x';
    b.onclick=()=>setRate(r); fxRate.appendChild(b);});
  SIZES.forEach(([lab,px])=>{const b=document.createElement('button');
    b.type='button'; b.dataset.v=px; b.textContent=lab;
    b.onclick=()=>setSize(px); fxSize.appendChild(b);});
}
if(fxB&&fxP){
  const openFx=v=>{fxP.hidden=!v;fxB.setAttribute('aria-expanded',String(v));};
  fxB.onclick=e=>{e.stopPropagation();openFx(fxP.hidden);};
  fxP.addEventListener('click',e=>e.stopPropagation());
  document.addEventListener('click',()=>openFx(false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')openFx(false);});
}
applySize(); fxMark();

/* --- audio is armed by a gesture, because browsers require one --- */
async function armAudio(){
  if(!AU.ctx && !auBuild()){sndB.textContent='NO AUDIO';return false;}
  if(AU.ctx.state==='suspended') await AU.ctx.resume();
  if(!AU.vo && !AU.voFailed){
    const back=sndB.textContent; sndB.textContent='LOADING';
    // Raced against a timeout: on a slow connection, or anywhere the element
    // never reports itself ready, the button used to sit on LOADING for ever
    // with no way back. The effects and the bed are synthesised, so they still
    // work voiceless.
    try{
      // The URL carries the track's content hash. It used to be a bare
      // 'narration.mp3' with cache:'force-cache', which tells the browser to
      // reuse ANY cached copy regardless of freshness -- so a reload could
      // show a new picture driven by the previous take's voice.
      //
      // The whole file is fetched and handed to the element as a BLOB, not as
      // a URL for it to stream. An element streaming from a URL can only seek
      // where the server answers a Range request, and on a host that does not
      // every scrub -- and every speed change, which re-seeks -- silently
      // rewinds the voice to zero while the picture carries on. A blob is
      // local and always seekable, so the scrub stays exact the way the
      // decoded buffer used to be.
      const el=new Audio(); el.preload='auto';
      const got=await Promise.race([
        (async()=>{ const r=await fetch('narration.mp3?v='+VOHASH);
                    if(!r.ok) throw new Error('narration '+r.status);
                    return await r.blob(); })(),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('voice timed out')),8000))
      ]);
      el.src=URL.createObjectURL(got);
      await Promise.race([
        new Promise((res,rej)=>{
          el.addEventListener('canplay',res,{once:true});
          el.addEventListener('error',()=>rej(new Error('narration undecodable')),{once:true});
        }),
        new Promise((_,rej)=>setTimeout(()=>rej(new Error('voice timed out')),8000))
      ]);
      // Routed into the graph, so the voice bus still mixes it under the
      // effects exactly as the buffer source did.
      AU.ctx.createMediaElementSource(el).connect(AU.g.voice);
      AU.vo=el; applyRate();
    }catch(e){ AU.vo=null; AU.voFailed=true;
               console.warn('[cathode] voice unavailable:',e.message); }
    sndB.textContent=back;
  }
  auStartHum(); return true;
}
function sndLabel(){ sndB.textContent=PREFS.sound?'AUDIO ON':'AUDIO OFF'; }
/* The first press that starts the piece turns the sound on, if it is wanted.
   Pressing PLAY is a gesture, so "press play and you hear it" is the normal
   path and nobody has to find a second button. */
let arming=false;
async function autoArm(){
  if(!PREFS.sound||AU.on||arming) return;
  arming=true;
  try{ const ok=await armAudio();
       // re-read the wish AFTER the await: the same press that armed this can
       // also have been the press on AUDIO ON that turned it back off.
       if(ok&&PREFS.sound){ AU.on=true; AU.g.master.gain.value=0.9; auSeek(cur); } }
  finally{ arming=false; }
}
sndB.onclick=async()=>{
  if(AU.on||arming){ PREFS.sound=false; savePrefs(); sndLabel();
                     AU.on=false; auStop(); if(AU.g.master) AU.g.master.gain.value=0; return; }
  PREFS.sound=true; savePrefs(); sndLabel();
  await autoArm();
};
sndLabel();
/* Armed from the three gestures that actually start the piece -- PLAY, the
   spacebar, the scrub -- and not from any click on the document: a visitor who
   lands here and clicks straight back to the library should not have pulled
   half a megabyte of voice down on the way out. */
scrub.addEventListener('input',()=>autoArm());
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
  // It opens on a held frame, never playing: the sound is wanted by default
  // and a browser will not grant it without a press, so starting the picture
  // on its own would only guarantee you watched the first seconds silent.
  window.seek(isNaN(qt)?0:qt); setPlay(false);
})();
