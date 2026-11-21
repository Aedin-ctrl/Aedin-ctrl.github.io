/* ===== #052 -- CAN A COMPUTER MAKE A RANDOM NUMBER? =====
   A RUN IT piece. The folk position is that random() is random. The defect is
   not that this generator was sloppy -- it is that it PASSED every test that
   existed, because those tests looked at one number at a time and the failure
   only exists in three dimensions.

   EVERY NUMBER IN THIS PIECE IS DERIVED, NOT CITED. GATE.md carries the
   working; all of it was recomputed here in exact integer arithmetic on
   2026-11-20 before anything was drawn.

   - The generator: x(n+1) = 65539 * x(n) mod 2^31, x(0) odd. Marsaglia 1968
     is the ANALYSIS, not the specification; the parameters are reproduced
     because the arithmetic below VERIFIES them -- a different multiplier does
     not give the 9/-6/1 relation.
   - 65539 = 2^16 + 3. CHECKED: 65539^2 = 4295360521; 2^32 = 4294967296;
     65539^2 - 2^32 = 393225; and 6*65539 - 9 = 393225. The same number.
     Therefore a^2 = 6a - 9 (mod 2^31), so x(n+2) = 6x(n+1) - 9x(n), so
     9x(n) - 6x(n+1) + x(n+2) = 0 (mod 2^31), exactly, for every n.
   - FIFTEEN. With u,v,w in [0,1), 9u - 6v + w = k forces k in [-6,10)
     exclusive at both ends, i.e. k from -5 to 9. VERIFIED EMPIRICALLY HERE:
     300,000 consecutive outputs from seed 1 give 299,998 triples; the
     expression was an exact multiple of 2^31 for every one of them and the
     set of quotients observed was exactly {-5..9} -- all fifteen, no
     sixteenth.
   - THE GAP, 9.2%. The planes share the normal (9,-6,1), |n| = sqrt(118) =
     10.86278, so adjacent planes are 1/sqrt(118) = 0.09206 apart in units of
     the cube's edge. SPOKEN AND DRAWN AS THE SAME NUMBER -- "nine point two
     percent" and "9.2% OF THE CUBE". The script originally said "about a
     tenth" over a drawn 0.092; a spoken approximation beside a drawn exact
     figure is the redundancy trap, so the spoken line was changed, not the
     rule.
   - THE VIEW GEOMETRY, MEASURED 2026-11-20 BEFORE DRAWING. The turn is the
     whole episode, so it was prototyped first against a control.
     Edge-on means the view direction lies IN the planes, d.n = 0. Those
     directions form a circle; the one chosen is the one nearest the body
     diagonal, d1 = (0.4106, 0.7110, 0.5708), because that is the view in
     which a cube shows its hexagonal silhouette and still reads as a cube at
     the moment of the payoff. (The obvious choice, cross(n, up), points
     almost straight down the z axis and collapses the cube to a flat
     diamond.) Screen-up is n itself, so the sheets stack vertically and read
     as fifteen horizontals rather than diagonals.
     MEASURED, against 1,200 uniform random triples as a control, as the
     fraction of bins in the central 80% of the dots holding NO dot:
       turn 40deg (rest) RANDU 0.00  control 0.00   -- a cloud, indistinguishable
       turn 22deg        RANDU 0.00  control 0.01   -- a cloud
       turn  8deg        RANDU 0.01  control 0.01   -- still a cloud
       turn  2deg        RANDU 0.56  control 0.00
       turn  0 (edge-on) RANDU 0.83  control 0.01   -- fifteen sheets
     TWO CONSEQUENCES FOR THE BUILD, BOTH BINDING:
     (1) the collapse happens in the LAST FEW DEGREES, so the rotation must
         land on the edge-on angle to about +/-1.5deg or there is no payoff;
     (2) the idle rotation under HOOK..KEEP must never wander within ~8deg of
         edge-on, or the reveal is spent before the script asks for it.

   WHAT THIS PIECE DOES NOT SAY:

   - NOT anything about how a number is stored. #040 `float` spent IEEE-754
     and the value the machine cannot write down. Every quantity here is an
     integer below 2^31 and the subject is the SHAPE A SEQUENCE MAKES IN
     SPACE. If a draft reaches for mantissas it has become #040.
   - NOT that RANDU is "a bad generator" and that is the lesson. It passed
     the tests that existed -- mean, variance, period, uniformity in one
     dimension. The piece says the tests passed BEFORE it says the generator
     failed, because that order is the whole point.
   - NOT that a better multiplier fixes it. Every multiplicative congruential
     generator puts its n-tuples on a lattice. "Still a lattice" is the honest
     statement; "modern generators are fine" is a claim about generators this
     piece has not tested, and it is refused.
   - NOT a count of how many planes a GOOD generator reaches. Marsaglia's
     (n! m)^(1/n) bound -- about 2344 at n=3 -- is in GATE.md from secondary
     sources only, because the full text could not be retrieved (pnas.org
     403s; the PMC and DTIC PDF endpoints return interstitial HTML). It is
     kept OFF SCREEN. A number on screen has to be checkable.
   - NOT that /dev/urandom or RDRAND is "truly random". The kernel device is
     a deterministic algorithm too -- random(4) says so in as many words: a
     "pseudorandom number generator seeded from the entropy pool". What
     changed is that the SEED is a measurement of something physical. The
     piece draws exactly that swap and makes no claim about quantum
     indeterminacy.
   - NOT that anybody shipped this knowing. No source here supports a claim
     about intent, and the piece names no company for the generator at all.  */
const PIECE={ no:52, slug:'randu', tags:['TECH'],
  strand:'RUN IT',
  verbatim:[0],
  myth:"not random",
  title:"can a computer make a random number",
  blurb:"A generator that passed every test anyone ran on it, and failed completely the moment somebody plotted its output three numbers at a time. The multiplier is 65539, which is two to the sixteen plus three, and squaring it throws away the big term -- so every three consecutive outputs obey 9x - 6y + z = 0 exactly, and every triple the generator will ever produce lands on one of fifteen flat sheets with 9.2% of the cube empty between them. A different multiplier only moves the sheets. The way out is to stop calculating and measure something." };
/* ===== TIMELINE =====
   Generated by v2/layout.py from the rendered audio. Do not hand-edit.
   Every number is a measurement: sentence starts come from a uniform grid
   (0.45s between sentences, 1.20s between beats) laid over durations taken
   off the wav files, and word onsets come from transcribing the rendered
   audio back with whisper.cpp. 90% of words matched a transcribed token
   directly; the rest are interpolated between matched anchors. */
const DUR=104.2, VOHASH="7648dae5b42e";
// one entry per spoken sentence: start, end, words, absolute word onsets
const VO=[
  {b:'HOOK',a:0.8,z:2.662,w:["Can", "a", "computer", "make", "a", "random", "number?"],t:[0.83, 1.0, 1.04, 1.51, 1.75, 1.81, 2.16]},
  {b:'LOOP',a:6.162,z:9.856,w:["You", "give", "it", "a", "starting", "number,", "and", "one", "line", "of", "arithmetic", "makes", "the", "next", "one."],t:[6.162, 6.342, 6.602, 6.702, 6.762, 7.602, 7.642, 7.812, 8.002, 8.242, 8.362, 9.082, 9.262, 9.442, 9.672]},
  {b:'LOOP',a:10.606,z:14.29,w:["Run", "it", "from", "the", "same", "start", "twice", "and", "you", "get", "the", "same", "sequence,", "forever."],t:[10.606, 10.846, 10.926, 11.186, 11.376, 11.636, 11.956, 12.326, 12.486, 12.646, 12.806, 12.966, 13.176, 13.726]},
  {b:'TESTS',a:16.14,z:20.777,w:["That", "is", "not", "what", "went", "wrong.", "This", "generator", "passed", "every", "test", "anyone", "ran."],t:[16.14, 16.37, 16.48, 16.65, 16.88, 17.1, 17.58, 17.87, 18.98, 18.99, 19.55, 20.01, 20.51]},
  {b:'TESTS',a:21.527,z:26.404,w:["Those", "tests", "looked", "at", "the", "numbers", "one", "at", "a", "time.", "So", "take", "them", "three", "at", "a", "time", "instead."],t:[21.537, 21.847, 22.167, 22.557, 22.687, 22.867, 23.327, 23.497, 23.707, 23.997, 24.007, 24.167, 24.487, 24.837, 25.207, 25.367, 25.447, 25.767]},
  {b:'CUBE',a:28.254,z:30.865,w:["Every", "three", "numbers", "become", "one", "point", "in", "the", "cube."],t:[28.254, 28.624, 28.914, 29.424, 29.764, 30.054, 30.344, 30.414, 30.604]},
  {b:'CUBE',a:31.615,z:36.817,w:["The", "whole", "rule", "here", "is:", "multiply", "by", "sixty", "five", "thousand", "five", "hundred", "and", "thirty", "nine."],t:[31.615, 31.955, 32.525, 32.975, 33.465, 33.755, 34.595, 34.85, 35.105, 35.361, 35.616, 35.871, 36.126, 36.382, 36.637]},
  {b:'SPLIT',a:38.667,z:41.21,w:["Which", "is", "two", "to", "the", "sixteen,", "plus", "three."],t:[38.667, 39.097, 39.267, 39.527, 39.727, 40.142, 40.557, 40.887]},
  {b:'SPLIT',a:41.96,z:47.572,w:["Square", "it.", "Out", "comes", "two", "to", "the", "thirty", "two,", "plus", "six", "of", "itself,", "minus", "nine."],t:[41.98, 42.68, 42.96, 43.24, 43.705, 44.17, 44.34, 44.69, 45.04, 45.39, 45.675, 45.96, 46.14, 46.93, 47.392]},
  {b:'KEEP',a:49.422,z:54.067,w:["The", "machine", "only", "keeps", "what", "fits", "under", "two", "to", "the", "thirty", "one.", "The", "big", "piece", "goes."],t:[49.422, 49.642, 50.162, 50.452, 50.992, 51.152, 51.402, 51.697, 51.992, 52.132, 52.449, 52.765, 53.082, 53.242, 53.402, 53.672]},
  {b:'KEEP',a:54.817,z:61.208,w:["So", "three", "numbers", "in", "a", "row", "are", "chained:", "nine", "of", "the", "first,", "minus", "six", "of", "the", "second,", "plus", "the", "third."],t:[54.857, 54.997, 55.447, 56.077, 56.347, 56.367, 56.617, 56.877, 57.557, 57.937, 58.017, 58.247, 58.797, 59.207, 59.467, 59.592, 59.717, 60.417, 60.837, 60.877]},
  {b:'FIFTEEN',a:63.058,z:67.849,w:["That", "total", "has", "to", "be", "a", "whole", "number,", "and", "it", "only", "reaches", "the", "ones", "from", "minus", "five", "to", "nine."],t:[63.058, 63.398, 63.858, 64.078, 64.248, 64.418, 64.498, 64.928, 65.478, 65.758, 65.778, 65.988, 66.398, 66.568, 66.818, 67.028, 67.308, 67.658, 67.829]},
  {b:'FIFTEEN',a:68.599,z:70.028,w:["Fifteen.", "Turn", "the", "cube."],t:[68.599, 69.599, 69.829, 69.889]},
  {b:'GAP',a:71.878,z:77.17,w:["The", "space", "between", "the", "sheets", "is", "nine", "point", "two", "percent", "of", "the", "cube", "wide.", "Nothing", "has", "ever", "been", "in", "it."],t:[71.878, 72.078, 72.448, 72.838, 73.028, 73.448, 73.782, 74.116, 74.45, 74.784, 75.118, 75.318, 75.488, 75.778, 76.318, 76.538, 76.628, 76.768, 76.888, 76.928]},
  {b:'ANY',a:79.02,z:82.698,w:["Change", "the", "multiplier", "and", "the", "sheets", "move.", "They", "are", "still", "sheets."],t:[79.04, 79.41, 79.64, 80.27, 80.47, 80.82, 81.17, 81.58, 81.99, 82.16, 82.46]},
  {b:'NOISE',a:84.548,z:89.834,w:["Arithmetic", "cannot", "make", "a", "cloud.", "The", "way", "out", "is", "to", "stop", "calculating", "and", "measure", "something."],t:[84.548, 85.408, 85.828, 86.148, 86.228, 86.908, 87.188, 87.348, 87.708, 87.768, 87.848, 88.138, 89.128, 89.278, 89.468]},
  {b:'NOISE',a:90.584,z:96.003,w:["A", "chip", "reads", "the", "thermal", "noise", "in", "its", "own", "silicon,", "and", "the", "system", "stirs", "it", "into", "a", "pool."],t:[90.584, 90.674, 91.014, 91.654, 91.714, 92.324, 92.774, 92.954, 93.204, 93.464, 94.144, 94.344, 94.544, 94.944, 95.274, 95.404, 95.674, 95.734]},
  {b:'END',a:97.853,z:99.636,w:["Same", "cube.", "Same", "turn."],t:[97.883, 98.273, 98.943, 99.143]},
];
// beat boundaries and the frame each scene changes on
const BEAT={
  HOOK:{sc:0.0,a:0.8,z:2.662},
  LOOP:{sc:5.76,a:6.162,z:14.29},
  TESTS:{sc:15.74,a:16.14,z:26.404},
  CUBE:{sc:27.85,a:28.254,z:36.817},
  SPLIT:{sc:38.27,a:38.667,z:47.572},
  KEEP:{sc:49.02,a:49.422,z:61.208},
  FIFTEEN:{sc:62.66,a:63.058,z:70.028},
  GAP:{sc:71.48,a:71.878,z:77.17},
  ANY:{sc:78.62,a:79.02,z:82.698},
  NOISE:{sc:84.15,a:84.548,z:96.003},
  END:{sc:97.45,a:97.853,z:99.636},
};
const SENT={
  HOOK:[0],
  LOOP:[1,2],
  TESTS:[3,4],
  CUBE:[5,6],
  SPLIT:[7,8],
  KEEP:[9,10],
  FIFTEEN:[11,12],
  GAP:[13],
  ANY:[14],
  NOISE:[15,16],
  END:[17],
};
/* ===== #052 randu -- THE ONE DIAGRAM =================================
   The loop box, the strip it prints, and the cube those numbers are poured
   into. One chain, and the cube is the read-out: it is turned through the
   SAME angle three times -- FIFTEEN (fifteen sheets), ANY (a second
   multiplier, still sheets) and END (noise, still a cloud) -- which is the
   only reason the last shot means anything.                              */

/* --- the arithmetic. Every one of these is recomputed in the self-check
       below, so a number that stops supporting the spoken word shouts. --- */
const MOD=2147483648;              // 2^31
const A1=65539, A2=65541;          // 2^16+3 (RANDU) and 2^16+5 (its neighbour)
const N1=[9,-6,1],  N2=[25,-10,1]; // the plane normals, DERIVED
const PL1=15,       PL2=35;        // planes crossed by the unit cube
const K1LO=-5, K1HI=9;
const GAPPC=9.2;                   // % of the cube between sheets, 1/sqrt(118)
const RESTDEG=40;                  // the cloud angle the turn starts from
const NDOT=1700;

(()=>{ const bad=[];
  if(A1!==Math.pow(2,16)+3) bad.push('A1 is not 2^16+3');
  if(A2!==Math.pow(2,16)+5) bad.push('A2 is not 2^16+5');
  // a^2 = 2^32 + 6a - 9  =>  9x - 6y + z = 0 (mod 2^31)
  if(A1*A1-4294967296 !== 6*A1-9)   bad.push('the RANDU identity fails');
  if(A2*A2-4294967296 !== 10*A2-25) bad.push('the 65541 identity fails');
  const g=100/Math.sqrt(N1[0]*N1[0]+N1[1]*N1[1]+N1[2]*N1[2]);
  if(Math.abs(g-GAPPC)>0.05) bad.push('spoken "'+GAPPC+'%" vs computed '+g.toFixed(3)+'%');
  if(K1HI-K1LO+1!==PL1) bad.push('k range does not give '+PL1);
  // the bound that forces exactly fifteen: 9u-6v+w on [0,1)^3
  if(-(Math.abs(N1[1]))+1 !== K1LO) bad.push('k low bound');
  if(N1[0]+N1[2]-1 !== K1HI)        bad.push('k high bound');
  if(bad.length) console.error('RANDU: '+bad.join('  '));
})();

/* ===== 3D, hand-rolled and deterministic ============================== */
const v3=(a,b,c)=>[a,b,c];
const vsub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const vdot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const vscl=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const vadd=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const vcrs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const vnrm=(a)=>{const l=Math.sqrt(vdot(a,a))||1;return vscl(a,1/l);};
function vrot(v,axis,ang){
  const k=vnrm(axis),c=Math.cos(ang),s=Math.sin(ang);
  return vadd(vadd(vscl(v,c),vscl(vcrs(k,v),s)),vscl(k,vdot(k,v)*(1-c)));
}
/* The edge-on view: the direction must LIE IN the planes (d.n = 0). Those
   directions are a whole circle; take the one nearest the body diagonal,
   because that is the view in which a cube shows its hexagonal silhouette
   and still reads as a cube at the exact moment of the payoff. */
function edgeOn(n){ const b=[1,1,1]; return vnrm(vsub(b,vscl(n,vdot(b,n)))); }
const NR1=vnrm(N1), NR2=vnrm(N2);
const D1=edgeOn(NR1), D2=edgeOn(NR2);
const AX1=vnrm(vcrs(NR1,D1)), AX2=vnrm(vcrs(NR2,D2));

/* a view is {r,u,f}: screen-right, screen-up, and the direction we look
   along. Screen-up is the plane normal, so the sheets stack vertically and
   read as horizontals rather than as diagonals. */
function viewOf(nrm,d0,axis,deg){
  const f=vnrm(vrot(d0,axis,deg*Math.PI/180));
  const u=vnrm(vsub(nrm,vscl(f,vdot(nrm,f))));
  return {r:vcrs(u,f),u:u,f:f};
}
function viewMix(va,vb,e){
  if(e<=0) return va; if(e>=1) return vb;
  const f=vnrm([H.lerp(va.f[0],vb.f[0],e),H.lerp(va.f[1],vb.f[1],e),H.lerp(va.f[2],vb.f[2],e)]);
  const n=vnrm([H.lerp(va.u[0],vb.u[0],e),H.lerp(va.u[1],vb.u[1],e),H.lerp(va.u[2],vb.u[2],e)]);
  const u=vnrm(vsub(n,vscl(f,vdot(n,f))));
  return {r:vcrs(u,f),u:u,f:f};
}

/* ===== the streams. Exact in doubles: 65539 * (2^31-1) is 1.4e14, well
   inside 2^53, so every output here is the integer the machine would make. */
function stream(a,n,seed){
  let x=seed||1; const out=[];
  for(let i=0;i<n;i++){ const p=[];
    for(let j=0;j<3;j++){ x=(a*x)%MOD; p.push(x/MOD); }
    out.push(p); }
  return out;
}
const jit=(i)=>{ const v=Math.sin(i*12.9898)*43758.5453; return v-Math.floor(v); };
/* the noise fill. NOT a claim to be a hardware RNG -- it is the house hash,
   deterministic as the spec requires, and the only property the picture
   leans on is the one it genuinely has: no three-term lattice. */
function noiseStream(n){
  const out=[];
  for(let i=0;i<n;i++) out.push([jit(i*3.7+0.11),jit(i*7.3+5.27),jit(i*11.9+9.41)]);
  return out;
}
/* NDOT fills the cube; the extra 240 are the ones that keep arriving after
   it is full, so GAP and ANY are never a finished picture being described. */
const PTS1=stream(A1,NDOT+240,1), PTS2=stream(A2,NDOT+240,1), PTSN=noiseStream(NDOT+240);

/* ===== layout ========================================================= */
const Q={
  cx:216, head:70,
  open:{cx:216, cy:438, s:112},
  cube:{cx:216, cy:424, s:142},
  /* the ENGINE row -- the loop box and the strip it prints. Both stay on
     frame for the whole piece, because a loop that is running is always
     running and that is this piece's free motion. */
  loop:{x:46, y:96, w:80, h:44},
  strip:{x:150, y:110, w:96, dy:19, rows:3},
  strip2:{x:252, y:106, w:96},
  hist:{x:244, y:108, w:136, h:86, bins:12},
  /* ONE algebra row. The multiplier block does not sit beside the squared
     rectangle -- it BECOMES it, which is what the arithmetic does and which
     is the only way both fit above the cube. */
  alg:{x:66, y:178, w:250, h:32}, algLab:214,
  beamY:236, cntY:196,
  band:{x:40, y:104, w:352, h:186},
  under:556, rows:[560,580],
};
const PARK=[368,596];
const CU=Q.cube, LB=Q.loop, ST=Q.strip;

function boxReg(b,k){ if(GBOX) GBOX.push({x:b.x,y:b.y,w:b.w,h:b.h,k:k}); }
function boxPix(b,col,th){
  linePix([[b.x,b.y],[b.x+b.w,b.y],[b.x+b.w,b.y+b.h],[b.x,b.y+b.h],[b.x,b.y]],col,th||2);
}
function arrow(x0,y0,x1,y1,col,th){
  linePix([[x0,y0],[x1,y1]],col,th||2);
  const a=Math.atan2(y1-y0,x1-x0);
  linePix([[x1-Math.cos(a-0.45)*7,y1-Math.sin(a-0.45)*7],[x1,y1],
           [x1-Math.cos(a+0.45)*7,y1-Math.sin(a+0.45)*7]],col,th||2);
}
const dimc=(k)=>H.rgba(H.mix(P.bone,P.ink,k));

/* ===== THE CUBE -- the read-out ======================================= */
const CORN=[];
for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++) CORN.push([x,y,z]);
const CEDGE=[];
for(let a=0;a<8;a++)for(let b=a+1;b<8;b++){
  let d=0; for(let i=0;i<3;i++) if(CORN[a][i]!==CORN[b][i]) d++;
  if(d===1) CEDGE.push([a,b]);
}
function pj3(p,V,cx,cy,s){
  const q=[p[0]-0.5,p[1]-0.5,p[2]-0.5];
  return [cx+vdot(q,V.r)*s, cy-vdot(q,V.u)*s];
}
function cubeFrame(V,cx,cy,s,col,th){
  for(const e of CEDGE){
    const a=pj3(CORN[e[0]],V,cx,cy,s), b=pj3(CORN[e[1]],V,cx,cy,s);
    linePix([a,b],col,th||1);
  }
}
/* dots. The last few to arrive FLY IN from the strip, so an arrival is a
   travel rather than an appearance. */
function cubeDots(V,cx,cy,s,pts,count,M,fade,fly){
  const n=Math.min(pts.length,Math.max(0,Math.floor(count)));
  const col=H.rgba(H.mix(P.green,P.ink,fade===undefined?0:fade));
  for(let i=0;i<n;i++){
    let a=pj3(pts[i],V,cx,cy,s);
    if(fly&&i>n-34){
      const age=H.clamp((n-i)/34);
      const e=H.ease.out(1-age);
      a=[H.lerp(ST.x+ST.w*0.5,a[0],e), H.lerp(ST.y+ST.dy*ST.rows,a[1],e)];
    }
    rect(Math.round(a[0])-1,Math.round(a[1])-1,2,2,col);
  }
}
/* the turn. The collapse happens in the LAST FEW DEGREES (measured: 0.83 of
   the central bins empty at 0deg, 0.10 at 5deg, 0.00 by 8deg), so this must
   land exactly on 0 and the idle must never wander near it. */
const TURN_T0=VO[12].t[1];                 // the word "Turn"
const TURN_T1=BEAT.GAP.sc+1.10;
const idleDeg=(M)=>RESTDEG-6+12*(0.5+0.5*Math.sin(M*0.55));   // 34..46, never near 0
function turnDeg(M){
  if(M<TURN_T0) return idleDeg(M);
  if(M>=TURN_T1) return 0;
  return H.lerp(idleDeg(TURN_T0),0,H.ease.inOut(H.clamp((M-TURN_T0)/(TURN_T1-TURN_T0))));
}
/* ANY swaps the lattice; NOISE/END morphs the camera back to the SAME turn */
const A2_T0=VO[14].t[0], A2_T1=VO[14].t[4];
const A2_R0=VO[14].t[4], A2_R1=VO[14].z-0.15;
const NS_T0=VO[16].t[2], NS_T1=BEAT.END.sc-0.25;
const anyMix =(M)=>H.clamp((M-A2_R0)/Math.max(0.001,A2_R1-A2_R0));
const noiseMix=(M)=>H.clamp((M-NS_T0)/Math.max(0.001,NS_T1-NS_T0));
function viewNow(M){
  const V1=viewOf(NR1,D1,AX1,turnDeg(M));
  if(M<A2_R0) return V1;
  const V2=viewOf(NR2,D2,AX2,0);
  const vA=viewMix(viewOf(NR1,D1,AX1,0),V2,H.ease.inOut(anyMix(M)));
  if(M<NS_T0) return vA;
  return viewMix(vA,viewOf(NR1,D1,AX1,0),H.ease.inOut(noiseMix(M)));
}
/* how full the cube is. ONE continuous pour from CUBE to FIFTEEN -- 34
   seconds of arrival under the whole algebra run, which is the staging
   instruction BEATS.md gives and the reason the algebra is not a hole. */
const FILL0=VO[5].t[0];
const fillU=(M)=>H.clamp((M-FILL0)/Math.max(0.001,BEAT.FIFTEEN.sc-FILL0));

/* the cube is never a finished picture: dots are always still on their way
   in, because the generator never stopped running. */
function arrivals(V,cx,cy,s,pts,k,M){
  const base=NDOT+(Math.floor(M*2.0)%200);
  for(let i=0;i<k;i++){
    const p=pts[(base+i*7)%pts.length];
    const a=pj3(p,V,cx,cy,s);
    const e=H.ease.out((M*2.0+i*0.37)%1);
    const x=H.lerp(ST.x+ST.w*0.5,a[0],e), yy=H.lerp(ST.y+ST.dy*ST.rows,a[1],e);
    rect(Math.round(x)-1,Math.round(yy)-1,2,2,H.rgba(H.mix(P.green,P.ink,0.1)));
  }
}
function drawCube(M,opts){
  const o=opts||{}, V=o.V||viewNow(M), s=o.s||CU.s, cx=o.cx||CU.cx, cy=o.cy||CU.cy;
  cubeFrame(V,cx,cy,s,dimc(0.56),1);
  if(o.pts) cubeDots(V,cx,cy,s,o.pts,o.n,M,o.fade,o.fly);
  /* the cube is never a finished picture: a few dots are always still on
     their way in, because the generator never stopped running */
  if(o.extra) arrivals(V,cx,cy,s,o.pts,o.extra,M);
  return V;
}

/* ===== THE LOOP BOX -- the engine that never stops ==================== */
function loopBox(M,opts){
  const o=opts||{};
  const dy=o.dy||0, fade=H.clamp(o.fade||0);
  if(fade>=0.98) return;
  const LBx=LB.x, LBy=LB.y-dy;
  const b={x:LBx,y:LBy,w:LB.w,h:LB.h};
  boxPix(b,dimc(0.40+fade*0.5),2); boxReg(b,'loopbox');
  px('x = a*x',LBx+LB.w/2,LBy+14,14,dimc(0.22+fade*0.6),'center','"Silkscreen"');
  px('mod 2^31',LBx+LB.w/2,LBy+30,14,dimc(0.34+fade*0.5),'center','"Silkscreen"');
  if(dy>2) return;                      /* once lifted, the loop stops running */
  /* the arrow that leaves the box, curls round and comes back: this is the
     recurrence, and it runs for the whole piece */
  const rate=o.rate||1, ph=(M*rate*0.9)%1;
  const cxr=LBx+LB.w+12, cyr=LBy+LB.h/2;
  const pts=[];
  for(let i=0;i<=22;i++){
    const a=-Math.PI*0.5+ (i/22)*Math.PI*1.9;
    pts.push([cxr+Math.cos(a)*10, cyr+Math.sin(a)*10]);
  }
  linePix(pts,dimc(0.50),1);
  const k=Math.floor(ph*22), pA=pts[Math.min(21,k)];
  rect(Math.round(pA[0])-1,Math.round(pA[1])-1,3,3,H.rgba(P.gold));
  linePix([[LBx+LB.w,cyr],[cxr,cyr-10]],dimc(0.50),1);
  linePix([[cxr,cyr+10],[LBx+LB.w,cyr+2]],dimc(0.50),1);
  if(o.mult!==undefined){
    px(String(o.mult),LBx+LB.w/2,LBy+LB.h+4,16,H.rgba(P.gold),'center','"Silkscreen"');
  }
}
/* the seed sliding in */
function seedIn(M,u){
  const e=H.ease.out(H.clamp(u));
  if(e>=0.82) return;                    /* swallowed by the box */
  const x=H.lerp(LB.x-32,LB.x-16,e);
  px('1',x,LB.y+LB.h/2-8,16,H.rgba(H.mix(P.cyan,P.ink,e*0.7)),null,'"Silkscreen"');
  arrow(x+13,LB.y+LB.h/2,LB.x-2,LB.y+LB.h/2,dimc(0.46),1);
}

/* ===== THE STRIP -- what the loop prints ============================== */
/* normalised to four places, because that is what becomes a COORDINATE. A
   ten-digit integer on screen is noise; .4821 is the x of a point. */
const fmt=(u)=>('.'+String(Math.floor(u*10000)).padStart(4,'0'));
function strip(M,opts){
  const o=opts||{}, x=o.x===undefined?ST.x:o.x;
  const rate=o.rate||1.9;
  const n=Math.max(0,Math.floor((M-(o.t0||0))*rate));
  const src=o.pts||PTS1;
  const flat=[]; for(const p of src){ flat.push(p[0]); flat.push(p[1]); flat.push(p[2]); }
  const rows=ST.rows;
  for(let k=0;k<rows;k++){
    const idx=n-rows+1+k;
    if(idx<0||idx>=flat.length) continue;
    const y=ST.y+k*ST.dy;
    const fresh=(k===rows-1);
    const col=fresh?H.rgba(P.cyan):dimc(0.30+0.04*(rows-1-k));
    px(fmt(flat[idx]),x+6,y,14,col,null,'"Silkscreen"');
    if(o.triples&&idx>=0){
      /* the sliding window of three: a bracket that travels DOWN the strip,
         never stopping, grouping the numbers into points */
      const g=Math.floor(idx/3);
      if(Math.floor((n-rows+1+rows-1)/3)===g&&idx%3===0){
        linePix([[x+2,y-3],[x-2,y-3],[x-2,y+ST.dy*3-6],[x+2,y+ST.dy*3-6]],H.rgba(P.gold),1);
      }
    }
  }
  if(o.label) px(o.label,x+6,ST.y-18,14,dimc(0.36),null,'"Silkscreen"');
  return n;
}

/* ===== THE HISTOGRAM -- the test that passed ========================== */
function histo(M,u){
  const h=Q.hist, nb=h.bins;
  const counts=new Array(nb).fill(0);
  const take=Math.floor(H.clamp(u)*900);
  for(let i=0;i<take;i++){
    const p=PTS1[i%PTS1.length][i%3];
    counts[Math.min(nb-1,Math.floor(p*nb))]++;
  }
  const bw=Math.floor(h.w/nb);
  const mx=Math.max(1,take/nb*1.55);
  for(let b=0;b<nb;b++){
    const grow=H.clamp((H.clamp(u)*nb-b)*1.6);
    const hh=Math.round(h.h*H.clamp(counts[b]/mx)*grow);
    /* a settled bar still breathes by a pixel: it is a running count, not
       a photograph */
    const br=hh+(hh>2?Math.round(Math.sin(M*1.7+b*0.9)*1.2):0);
    rect(h.x+b*bw+1,h.y+h.h-br,bw-2,Math.max(1,br),H.rgba(H.mix(P.ice,P.ink,0.30)));
  }
  linePix([[h.x,h.y+h.h],[h.x+h.w,h.y+h.h]],dimc(0.46),1);
  px('ONE AT A TIME',h.x,h.y+h.h+16,14,dimc(0.34),null,'"Silkscreen"');
}

/* ===== THE ALGEBRA BAND =============================================== */
/* the multiplier as a BLOCK that splits, so 65539 arrives as a thing with
   parts rather than as a caption */
function multBlock(M,u,opts){
  const o=opts||{}, G=Q.alg;
  const y=G.y, x0=G.x, W=G.w, Hh=G.h;
  const e=H.ease.inOut(H.clamp(u));
  const sep=Math.round(e*26);
  const wBig=Math.round(W*0.86), wSml=W-wBig;
  rect(x0,y,wBig,Hh,H.rgba(H.mix(P.gold,P.ink,0.52)));
  rect(x0+wBig+sep,y,wSml,Hh,H.rgba(H.mix(P.orange,P.ink,0.34)));
  px('2^16',x0+wBig/2,y+8,16,H.rgba(P.ink),'center','"Silkscreen"');
  px('3',x0+wBig+sep+wSml/2,y+8,16,H.rgba(P.ink),'center','"Silkscreen"');
  if(e<0.45) px(String(A1),x0+W/2,Q.algLab,16,H.rgba(P.gold),'center','"Silkscreen"');
  else       px('2^16 + 3',x0+W/2,Q.algLab,16,H.rgba(P.gold),'center','"Silkscreen"');
  return {x:x0,y:y,w:W,h:Hh};
}
/* the square, cut into its three regions. The big one slides off the frame
   because the machine keeps only what is under 2^31. */
const REG=[{lab:'2^32',col:()=>P.red,  f:0.62},
           {lab:'6a',  col:()=>P.cyan, f:0.26},
           {lab:'-9',  col:()=>P.gold, f:0.12}];
function squareCut(M,cut,slide,noLab){
  const G=Q.alg, y=G.y, x0=G.x, W=G.w, Hh=G.h;
  const e=H.ease.inOut(H.clamp(cut));
  let x=x0;
  const out=[];
  for(let i=0;i<REG.length;i++){
    const w=Math.round(W*REG[i].f);
    let xx=x+Math.round(e*i*12);
    if(i===0) xx-=Math.round(H.ease.in(H.clamp(slide))*(W+150));
    const al=i===0?(1-H.clamp(slide)*0.75):1;
    const cc=H.mix(P.gold,REG[i].col(),e);
    rect(xx,y,w,Hh,H.rgba(H.mix(cc,P.ink,0.52+(1-al)*0.4)));
    if(xx>Q.band.x-4)
      px(REG[i].lab,xx+w/2,y+10,16,H.rgba(P.ink),'center','"Silkscreen"');
    out.push({x:xx,y:y,w:w,h:Hh});
    x+=w;
  }
  if(cut>0.05&&!noLab) px('a x a',x0+W/2,Q.algLab,16,dimc(0.30),'center','"Silkscreen"');
  return out;
}
/* the beam: three dots hung at 9, 6 and 1, which is the relation made into
   an object you can look at */
function beam(M,u,opts){
  const o=opts||{};
  const cx=Q.cx, y=Q.beamY;
  const e=H.ease.out(H.clamp(u));
  const W=132;
  /* it rocks as it loads and keeps a small residual sway: a balance that has
     just been loaded is not a photograph */
  const tilt=(1-e)*0.22*Math.sin(M*3.1)+0.016*Math.sin(M*1.23);
  const dx=Math.cos(tilt)*W/2, dy=Math.sin(tilt)*W/2;
  linePix([[cx-dx,y-dy],[cx+dx,y+dy]],dimc(0.50),2);
  linePix([[cx,y],[cx,y+16]],dimc(0.42),2);
  linePix([[cx-10,y+16],[cx+10,y+16]],dimc(0.42),2);
  const W3=[{w:N1[0],at:-1,c:()=>P.green},{w:N1[1],at:0,c:()=>P.cyan},{w:N1[2],at:1,c:()=>P.gold}];
  W3.forEach((q,i)=>{
    const px0=cx+q.at*W/2*0.80, py0=y+Math.sin(tilt)*q.at*W/2*0.80;
    const drop=H.lerp(0,28,H.ease.out(H.clamp((M-(o.t0||0))*0.9-i*0.30)));
    linePix([[px0,py0],[px0,py0+drop]],dimc(0.34),1);
    rect(Math.round(px0)-2,Math.round(py0+drop)-2,4,4,H.rgba(q.c()));
    px((q.w>0?'x'+q.w:'x'+Math.abs(q.w)),px0,py0+drop+8,14,H.rgba(q.c()),'center','"Silkscreen"');
  });
  px('9u - 6v + w',cx,y+48,16,dimc(0.22),'center','"Silkscreen"');
}
/* the counter that WALKS the possible totals and stops. Fifteen arrives as a
   tally that stopped counting, not as a printed number. */
function counter(M,t0,step0){
  const y=Q.cntY, x0=Q.band.x+34, W=284;
  const step=step0||0.30;
  const k=Math.max(0,Math.min(PL1,Math.floor((M-t0)/step)+1));
  for(let i=0;i<PL1;i++){
    const xx=x0+Math.round(i*(W/(PL1-1)));
    const on=i<k;
    const h=on?16:5;
    rect(xx-2,y-h,4,h,H.rgba(on?H.mix(P.green,P.ink,0.12):H.mix(P.bone,P.ink,0.70)));
  }
  linePix([[x0-6,y+2],[x0+W+6,y+2]],dimc(0.50),1);
  px(String(K1LO),x0,y+8,14,dimc(0.34),'center','"Silkscreen"');
  px('+'+String(K1HI),x0+W,y+8,14,dimc(0.34),'center','"Silkscreen"');
  const live=(M-t0)<step*PL1;
  /* the tally sits at the END of the axis it is walking, clear of the strip
     column overhead -- the centre of this band belongs to the strip */
  px(String(k),x0+W,y-56,32,H.rgba(live?P.gold:P.green),'center','"Silkscreen"');
  px('WHOLE NUMBERS',Q.cx,y+12,14,dimc(0.34),'center','"Silkscreen"');
  return k;
}

/* ===== THE GAP RULE =================================================== */
/* a rule laid ACROSS one empty gap, measured against the cube's own edge */
function gapRule(M,V,u){
  const e=H.clamp(u);
  if(e<=0) return;
  const s=CU.s, cx=CU.cx, cy=CU.cy;
  /* the sheets stack along screen-up, spacing = (1/|n|) of a cube edge */
  const sp=s/Math.sqrt(N1[0]*N1[0]+N1[1]*N1[1]+N1[2]*N1[2]);
  const yMid=cy-sp*1.5;
  const halfw=Math.round(s*0.30*H.ease.out(e));
  /* hatch the empty band, sweeping across */
  for(let x=-halfw;x<halfw;x+=4){
    rect(Math.round(cx+x),Math.round(yMid-sp/2),2,Math.max(1,Math.round(sp)),
         H.rgba(H.mix(P.red,P.ink,0.62)));
  }
  linePix([[cx-halfw,yMid-sp/2],[cx+halfw,yMid-sp/2]],H.rgba(P.red),1);
  linePix([[cx-halfw,yMid+sp/2],[cx+halfw,yMid+sp/2]],H.rgba(P.red),1);
  if(e>0.55){
    const outx=cx+s*0.96;
    linePix([[cx+halfw,yMid],[outx,yMid],[outx,Q.under-8],[300,Q.under-8]],
            H.rgba(H.mix(P.red,P.ink,0.40)),1);
    px(GAPPC+'% OF THE CUBE',Q.cx,Q.under,16,H.rgba(P.red),'center','"Silkscreen"');
  }
}

/* ===== THE SENSOR AND THE POOL ======================================== */
function sensor(M,u){
  const e=H.ease.out(H.clamp(u));
  if(e<=0) return;
  const b={x:LB.x,y:LB.y,w:LB.w,h:LB.h};
  boxPix(b,H.rgba(H.mix(P.cyan,P.ink,0.30)),2); boxReg(b,'sensorbox');
  px('THERMAL',b.x+b.w/2,b.y+5,14,H.rgba(P.cyan),'center','"Silkscreen"');
  px('NOISE',b.x+b.w/2,b.y+19,14,H.rgba(P.cyan),'center','"Silkscreen"');
  /* the trace. Noise is noisy: once this starts it is never still again. */
  const pts=[];
  for(let i=0;i<=46;i++){
    const x=b.x+4+i*((b.w-8)/46);
    const n=jit(i*1.7+Math.floor(M*22))-0.5;
    pts.push([x,b.y+b.h-9+n*8]);
  }
  linePix(pts,H.rgba(P.green),1);
}
function pool(M,u,feed){
  const e=H.clamp(u);
  if(e<=0) return;
  const b={x:LB.x+LB.w+34,y:LB.y+6,w:76,h:48};
  boxPix(b,dimc(0.46),1); boxReg(b,'poolbox');
  const lv=Math.round(b.h*H.clamp(e));
  for(let y=0;y<lv;y++){
    const w=b.w-4-Math.round(jit(y*2.3+Math.floor(M*14))*5);
    rect(b.x+2,b.y+b.h-y,w,1,H.rgba(H.mix(P.green,P.ink,0.40+0.3*jit(y+Math.floor(M*9)))));
  }
  px('POOL',b.x+b.w/2,b.y-18,14,dimc(0.34),'center','"Silkscreen"');
  if(feed>0){
    const ph=(M*1.4)%1;
    const x=H.lerp(b.x+b.w,CU.cx-60,ph);
    rect(Math.round(x),Math.round(H.lerp(b.y+b.h,CU.cy-CU.s*0.5,ph))-1,3,3,H.rgba(P.green));
  }
}

/* ===== the pointer ==================================================== */
const SPOTS=[
  {n:0,  x:DLG[0]+54, y:DLG[1]+18, s:16, r:[216,560]},
  {n:1,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:2,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:3,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:4,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:5,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:6,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:7,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:8,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:9,  x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:10, x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:11, x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:13, x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:14, x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:15, x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:16, x:PX+26, y:CAPY, s:CAPSZ, r:PARK},
  {n:17, x:BOX[0]+56, y:BOX[1]+16, s:14},
];
/* THE POINTER IS AN INSTRUMENT. It is used on the two beats whose own
   content barely moves -- SPLIT (two events across three sentences) and the
   tug on the loop box in NOISE -- and on the gap in GAP, which is the one
   place the picture asks you to look at NOTHING. */
const ACTS=(()=>{
  const A=[];
  A.push({t0:+(VO[7].t[2]-0.40).toFixed(3), t1:+(VO[7].t[2]+0.45).toFixed(3),
          a:[Q.alg.x-10,Q.alg.y+14], b:[Q.alg.x+Q.alg.w+10,Q.alg.y+14], r:PARK});
  A.push({t0:+(VO[8].t[0]-0.30).toFixed(3), t1:+(VO[8].t[0]+0.50).toFixed(3),
          a:[Q.alg.x+Q.alg.w+10,Q.alg.y+14], b:[Q.alg.x-10,Q.alg.y+14], r:PARK});
  A.push({t0:+(VO[9].t[9]-0.30).toFixed(3), t1:+(VO[9].t[9]+0.60).toFixed(3),
          a:[Q.alg.x-10,Q.alg.y+14], b:[Q.alg.x-34,Q.alg.y+14], r:PARK});
  A.push({t0:+(VO[13].t[4]-0.35).toFixed(3), t1:+(VO[13].t[4]+0.70).toFixed(3),
          a:[CU.cx+70,CU.cy-40], b:[CU.cx+54,CU.cy-CU.s/Math.sqrt(118)*1.5], r:PARK});
  A.push({t0:+(VO[15].t[8]-0.35).toFixed(3), t1:+(VO[15].t[8]+0.80).toFixed(3),
          a:[LB.x+LB.w/2,LB.y+LB.h+14], b:[LB.x+LB.w/2,LB.y-26], r:PARK});
  return A;
})();

const CAPS=[['ONE LINE OF ARITHMETIC.',1,10],
            ['SAME START, SAME SEQUENCE.',2,8],
            ['IT PASSED EVERY TEST.',3,9],
            ['THE TESTS LOOKED ONE AT A TIME.',4,6],
            ['THREE NUMBERS, ONE POINT.',5,4],
            ['MULTIPLY BY '+A1+'.',6,5],
            ['WHICH IS 2^16 + 3.',7,4],
            ['SQUARE IT.',8,1],
            ['THE BIG PIECE GOES.',9,12],
            ['9u - 6v + w, EVERY TIME.',10,9],
            ['ONLY '+K1LO+' TO '+K1HI+' FIT.',11,13],
            [PL1+' SHEETS.',12,0],
            [GAPPC+'% OF THE CUBE, EMPTY.',13,7],
            ['A NEW MULTIPLIER: '+PL2+' SHEETS.',14,5],
            ['STOP CALCULATING. MEASURE.',15,9],
            ['NOISE IN THE SILICON.',16,6]];
const BOOSTS=[[4,10,1.46,0.34],[9,12,1.50,0.34],[12,0,1.70,0.46],
              [12,1,1.54,0.40],[13,7,1.48,0.34],[17,0,1.46,0.34]];
const BEATLABEL=(T)=>
    T<BEAT.LOOP.sc    ? 'RANDOM?'
  : T<BEAT.TESTS.sc   ? 'ONE LINE'
  : T<BEAT.CUBE.sc    ? 'EVERY TEST PASSED'
  : T<BEAT.SPLIT.sc   ? 'THREE AT A TIME'
  : T<BEAT.KEEP.sc    ? '2^16 + 3'
  : T<BEAT.FIFTEEN.sc ? 'UNDER 2^31'
  : T<BEAT.GAP.sc     ? PL1+' PLANES'
  : T<BEAT.ANY.sc     ? GAPPC+'% EMPTY'
  : T<BEAT.NOISE.sc   ? 'STILL SHEETS'
  : T<BEAT.END.sc     ? 'MEASURE, NOT CALCULATE' : 'DONE';
const WINNAME='randu';
const MUSIC=[72,[146.83,174.61,220.00,196.00,174.61,146.83,130.81,146.83]];
function SCORE_EVENTS(add,w){
  add(BEAT.LOOP.sc+0.30,'click');
  for(let t=VO[1].t[4];t<BEAT.TESTS.sc;t+=0.52) add(t,'blip',2);
  add(w(2,8),'snap');                       // the two strips snap together
  for(let t=VO[3].t[6];t<VO[4].t[0];t+=0.34) add(t,'tag',1);
  add(w(4,10),'open');                      // the window of three
  for(let t=VO[5].t[0];t<BEAT.FIFTEEN.sc;t+=0.68) add(t,'blip',5);
  add(w(6,5),'knock');                      // the multiplier lands in the box
  add(w(7,4),'crack');                      // the block splits
  add(w(8,0),'draw');                       // the square is cut
  add(w(9,12),'crumble');                   // the big piece goes
  add(w(10,9),'knock');                     // the beam loads
  for(let i=0;i<PL1;i++) add(VO[11].t[13]+i*0.30,'tag',1);
  add(w(12,0),'zap'); add(w(12,1),'draw');  // FIFTEEN, and the turn
  add(BEAT.GAP.sc+1.10,'snap');             // the turn lands
  add(w(13,7),'mos');
  add(w(14,0),'splash'); add(VO[14].t[4],'draw');
  add(w(15,9),'crack');                     // the loop box comes out
  for(let t=VO[16].t[0];t<BEAT.END.sc;t+=0.21) add(t,'buzz',1);
  add(BEAT.END.sc,'zap');
}

/* ===== THE COLD OPEN =================================================
   The cube is planted before anything else, because it is the instrument
   the whole piece is read on. It turns slowly from frame one -- that costs
   nothing and it pre-loads the turn in FIFTEEN -- and one single dot falls
   into it. */
function COLDOPEN(U,gag){
  const M=U.M, o=Q.open;
  const V=viewOf(NR1,D1,AX1,idleDeg(M));
  cubeFrame(V,o.cx,o.cy,o.s,dimc(0.30),1);
  const g=H.clamp(gag/0.9);
  if(g>0.02){
    const p=PTS1[220];
    const land=pj3(p,V,o.cx,o.cy,o.s);
    const e=H.ease.out(H.clamp(g*1.5));
    const y=H.lerp(o.cy-o.s*1.30,land[1],e);
    rect(Math.round(land[0])-2,Math.round(y)-2,4,4,H.rgba(P.green));
    if(g>0.55){
      px('1 POINT',o.cx,o.cy+o.s*0.78,14,dimc(0.36),'center','"Silkscreen"');
    }
  }
  if(SCENE)SCENE.push({x:o.cx-o.s*0.9,y:o.cy-o.s*0.9,w:o.s*1.8,h:o.s*1.8,k:'cube'});
}
/* ===== THE SHARED EXPLAINER SHELL, part 1 of 2 =====
   Every piece in this library opened with the same ~150 lines: the typing
   helpers, the caption stack, the boost table, the cold-open frame, the
   program window and the clip. Thirty-one copies of it drifted exactly the
   way honey and halloumi drifted before cathode-lib existed, which is the
   argument this file is the answer to.

   The piece supplies, from _body.js:
     COLDOPEN(U,gag)   draw the desktop object and its gag. The card, the
                       press and the myth stamp are HERE, not there.
     CAPS              [[text, sentence, word], ...] -- abridged clauses
     BOOSTS            [[sentence, word, amount, seconds], ...]
     BEATLABEL(T)      the status bar's middle segment
     WINNAME           the program window's title, through winTitle()
   ...and the beat bodies, in _beats.js, which is spliced in between this
   file and _xtail.js so it shares this function's scope.                 */
function explainer(ctx,W2,Hh,t){
  const T=Math.floor(t*12)/12, M=t;
  const mp=(a,b)=>H.clamp((M-a)/(b-a));
  const wordAt=(n,i)=>VO[n].t[i];
  const after=(n,i)=>t>=VO[n].t[i];
  const said=(n,a,b)=>{const v=VO[n];const lo=a||0,hi=(b===undefined?v.w.length:b);
    let o=[];for(let i=lo;i<hi;i++) if(t>=v.t[i]) o.push(v.w[i]);return o.join(' ');};
  let CARET=null;
  const typeLine=(n,x,y,size,col,shadow,font,a,b)=>{
    const str=said(n,a,b); const v=VO[n];
    const lo=a||0, hi=(b===undefined?v.w.length:b);
    const live=t>=v.t[lo]&&t<=v.z+0.25;
    const w=str?(shadow?pxShadow(str,x,y,size,col,shadow,null,font):px(str,x,y,size,col,null,font)):0;
    if(live) CARET={x:x+w+Math.round(size*0.35),y:y,h:size,col:col};
    return w;};
  const typeWrap=(n,x,y,size,col,shadow,font,perLine)=>{
    const ws=VO[n].w, lim=perLine||CAPCH;
    const rows=[]; let cur=[], len=0;
    ws.forEach((wd,i)=>{ if(len+wd.length+1>lim&&cur.length){rows.push(cur);cur=[];len=0;}
                         cur.push(i); len+=wd.length+1; });
    if(cur.length)rows.push(cur);
    rows.forEach((rw,k)=>
      typeLine(n,x,y+k*Math.round(size*1.5),size,col,shadow,font,rw[0],rw[rw.length-1]+1));
  };
  const capLine=(str,n,i,x,y,size,col,shadow,font,span)=>{
    if(!after(n,i)) return 0;
    const t0=VO[n].t[i], t1=t0+(span||Math.max(0.45,str.length*0.042));
    const cut=str.slice(0,Math.max(1,Math.round(H.clamp((t-t0)/(t1-t0))*str.length)));
    const w=shadow?pxShadow(cut,x,y,size,col,shadow,null,font):px(cut,x,y,size,col,null,font);
    if(t<t1+0.30) CARET={x:x+w+Math.round(size*0.35),y:y,h:size,col:col};
    return w;};
  /* The one line that centres a measured string. px(...,'center') centres the
     ADVANCE width, which is what you want; this exists so a caller that needs
     the x can have it without measuring twice. */
  const mid=(str,size,font)=>Math.round(LW/2-glyph(str,size,font||'"Silkscreen"').w/2);
  const CLICK=VO[VO.length-1].z+0.52, SHUT=CLICK+0.15;
  const LASTV=VO.length-1;

  /* ===== THE TAKEAWAY STACK -- abridged clauses, never the sentence.
     Three at a time, each typing in under the one before it and staying, the
     oldest dimming off the top, so a viewer who looks up mid-piece can see
     what has been established and a muted viewer has a running summary. ==== */
  const capStack=()=>{
    if(after(LASTV,0)) return;
    const fired=CAPS.filter(c=>after(c[1],c[2]));
    if(!fired.length) return;
    const show=fired.slice(-3);
    show.forEach((c,k)=>{
      const newest=(k===show.length-1), age=show.length-1-k;
      const y=CAPY+k*26;
      const col=newest?P.gold:H.mix(P.gold,P.ink,0.34+age*0.16);
      if(newest) capLine('· '+c[0],c[1],c[2],PX+26,y,CAPSZ,H.rgba(col),null,
                         '"VT323"',Math.max(0.5,c[0].length*0.040));
      else       px('· '+c[0],PX+26,y,CAPSZ,H.rgba(col),null,'"VT323"');
    });
  };

  let boost=1;
  for(const b of BOOSTS){ const t0=wordAt(b[0],b[1]);
    if(t>t0&&t<t0+(b[3]||0.32)) boost=b[2]; }

  const U={T:T,M:M,t:t,mp:mp,wordAt:wordAt,after:after,said:said,
           typeLine:typeLine,typeWrap:typeWrap,capLine:capLine,mid:mid,
           caret:(c)=>{CARET=c;}};
  const O=Q.open;
  const okT=VO[0].z+0.52;
  const FIRST=Object.keys(BEAT)[PIECE.part?2:1];
  const dlgOut=BEAT[FIRST].sc-0.30;
  const gag=H.clamp((M-(okT+0.72))/Math.max(0.001,(dlgOut-0.14)-(okT+0.72)));
  deskSky(T,O.ground);

  /* --- THE COLD OPEN. The object is already there, on the ground line, with
     the card above it; OK is pressed and the card closes on the press; half a
     second of nothing; then the object does its one trick. A SERIES PART has
     no card of its own -- its card asks the series question, and partCard()
     draws it LAST of the cold open, because a Win95 window is in front of the
     desktop, always. --- */
  if(T<dlgOut){
    if(!PIECE.part) mythStamp(t);
    COLDOPEN(U,gag);
    if(PIECE.part) partCard(T,M,t);
    else if(T<dlgOut-0.02&&M<okT+0.30){
      const rr=winFrame(DLG[0],DLG[1],DLG[2],DLG[3],'Good To Know Tho',true);
      winIcon(rr.x+10,rr.y+11,'?');
      INCHROME=true;
      typeWrap(0,rr.x+52,rr.y+14,16,'#000',null,'"Silkscreen"',24);
      button(rr.x+rr.w/2-32,rr.y+rr.h-28,64,20,'OK',M>=okT);
      INCHROME=false;
    }
  }

  if(T>=dlgOut&&T<SHUT){
    const done=T>=BEAT.END.sc;
    /* The program window's title bar is the STRAND badge (v4.21) -- the same
       slot a series part puts its series question in. */
    const r=winFrame(8,8,PW+8,PH+34,
                     PIECE.part?PIECE.part.series:winTitle(WINNAME),!done);
    const CX=r.x,CY=r.y,CWd=r.w,CHd=r.h-18;
    rect(CX,CY,CWd,CHd,P.ink);bevel(CX,CY,CWd,CHd,'field');
    statusBar(r,T,BEATLABEL(T));
    B.save();B.beginPath();B.rect(CX+2,CY+2,CWd-4,CHd-4);B.clip();
    const dim=(k)=>H.rgba(H.mix(P.bone,P.ink,k));
    const HEAD=(s)=>px(s,Q.cx,Q.head,14,dim(0.28),'center','"Silkscreen"');
    /* the engine, drawn by every beat from LOOP on: a loop that is running
       is always running, and that is this piece's free motion. */
    const ENG=(o)=>{ loopBox(M,o||{}); };
    const STRIP=(o)=>strip(M,Object.assign({t0:VO[1].t[4],rate:2.1},o||{}));

    /* ============ LOOP -- one line of arithmetic ===================== */
    if(T>=BEAT.LOOP.sc&&T<BEAT.TESTS.sc){
      HEAD(after(2,0)?'THE SAME START, THE SAME SEQUENCE':'ONE LINE OF ARITHMETIC');
      seedIn(M,mp(VO[1].t[0],VO[1].t[4]));
      ENG();
      STRIP({});
      /* RUN 2 prints the same numbers beside RUN 1 and then slides onto it,
         number for number -- determinism shown as two things becoming one */
      if(after(2,0)){
        const sn=H.ease.inOut(mp(VO[2].t[8],VO[2].t[13]));
        if(sn<0.62) STRIP({x:H.lerp(Q.strip2.x,ST.x,sn),label:sn<0.5?'RUN 2':null});
        if(sn<0.5) px('RUN 1',ST.x+6,ST.y-18,14,dim(0.36),null,'"Silkscreen"');
        if(sn>=0.62){
          /* they have become one strip: ring it while the snap is heard */
          const fl=H.clamp((sn-0.62)/0.22);
          linePix([[ST.x+2,ST.y-4],[ST.x+ST.w,ST.y-4],[ST.x+ST.w,ST.y+ST.dy*ST.rows],
                   [ST.x+2,ST.y+ST.dy*ST.rows],[ST.x+2,ST.y-4]],
                  H.rgba(H.mix(P.gold,P.ink,fl*0.75)),1);
        }
        if(sn>0.95) px('IDENTICAL, FOREVER',ST.x+6,ST.y+ST.dy*ST.rows+12,14,
                       H.rgba(P.gold),null,'"Silkscreen"');
      }
      drawCube(M,{});
    }

    /* ============ TESTS -- the test it passed, and the one nobody ran = */
    if(T>=BEAT.TESTS.sc&&T<BEAT.CUBE.sc){
      HEAD(after(4,0)?'SO TAKE THEM THREE AT A TIME':'IT PASSED EVERY TEST ANYONE RAN');
      ENG();
      STRIP({triples:after(4,6)});
      histo(M,mp(VO[3].t[6],VO[3].t[12]));
      if(after(3,12)) px('PASS',Q.hist.x+Q.hist.w-34,Q.hist.y-18,16,
                         H.rgba(P.green),null,'"Silkscreen"');
      if(after(4,6)) px('BUT NEVER THREE AT A TIME',Q.cx,Q.hist.y+Q.hist.h+34,
                        14,H.rgba(P.gold),'center','"Silkscreen"');
      drawCube(M,{});
    }

    /* ============ CUBE -- three numbers become one point ============= */
    if(T>=BEAT.CUBE.sc&&T<BEAT.SPLIT.sc){
      HEAD(after(6,0)?'THE WHOLE RULE':'EVERY THREE NUMBERS, ONE POINT');
      ENG({mult:after(6,5)?A1:undefined,rate:after(6,5)?1.9:1});
      STRIP({triples:true});
      drawCube(M,{pts:PTS1,n:fillU(M)*NDOT,fly:true});
      if(after(5,6)) px('u  v  w',Q.cx,Q.under,14,dim(0.34),'center','"Silkscreen"');
    }

    /* ============ SPLIT -- the multiplier opened up ==================
       Two events across three sentences, so this beat has almost no motion
       of its own. It is carried by the loop still running, the strip still
       printing and the cube still filling -- all three in frame, deliberately. */
    if(T>=BEAT.SPLIT.sc&&T<BEAT.KEEP.sc){
      HEAD(after(8,0)?'SQUARE IT':'WHICH IS 2^16 + 3');
      ENG({mult:A1,rate:1.9});
      STRIP({triples:true});
      if(!after(8,0)) multBlock(M,mp(VO[7].t[2],VO[7].t[6]));
      else            squareCut(M,mp(VO[8].t[1],VO[8].t[6]),0);
      drawCube(M,{pts:PTS1,n:fillU(M)*NDOT,fly:true});
      if(after(8,6)) px('2^32 + 6a - 9',Q.cx,Q.algLab+20,14,
                        dim(0.30),'center','"Silkscreen"');
    }

    /* ============ KEEP -- the big piece goes, and what is left chains = */
    if(T>=BEAT.KEEP.sc&&T<BEAT.FIFTEEN.sc){
      HEAD(after(10,0)?'THREE IN A ROW, CHAINED':'ONLY WHAT FITS UNDER 2^31');
      ENG({mult:A1,rate:1.9});
      STRIP({triples:true});
      squareCut(M,1,mp(VO[9].t[12],VO[9].t[15]+0.45),after(9,15));
      if(after(9,15)) px('2^32 = 0  (mod 2^31)',Q.cx,Q.algLab,14,
                         H.rgba(P.red),'center','"Silkscreen"');
      if(after(10,0)) beam(M,mp(VO[10].t[4],VO[10].t[13]),{t0:VO[10].t[4]});
      drawCube(M,{pts:PTS1,n:fillU(M)*NDOT,fly:true});
    }

    /* ============ FIFTEEN -- the count, and THE TURN =================
       The rotation is the longest single move in the piece and the whole
       episode is this one visual event. It starts on the word "Turn" and
       lands exactly on the edge-on angle 1.1s into GAP: measured, the
       collapse is all in the last few degrees, so it must not be eyeballed. */
    if(T>=BEAT.FIFTEEN.sc&&T<BEAT.GAP.sc){
      HEAD(after(12,1)?'TURN THE CUBE':'ONLY WHOLE NUMBERS FIT');
      ENG({mult:A1,rate:1.9});
      STRIP({});
      beam(M,1,{t0:VO[10].t[4]});
      counter(M,VO[11].t[6],0.21);
      drawCube(M,{pts:PTS1,n:NDOT,extra:10});
    }

    /* ============ GAP -- the thing that has never been in it ========= */
    if(T>=BEAT.GAP.sc&&T<BEAT.ANY.sc){
      HEAD(PL1+' SHEETS, AND NOTHING BETWEEN');
      ENG({mult:A1,rate:1.9});
      STRIP({});
      const V=drawCube(M,{pts:PTS1,n:NDOT,extra:14});
      gapRule(M,V,mp(VO[13].t[4],VO[13].t[9]));
      if(after(13,14)) px('NOTHING HAS EVER BEEN IN IT',Q.cx,Q.rows[1],14,
                          H.rgba(P.red),'center','"Silkscreen"');
    }

    /* ============ ANY -- change the multiplier by TWO ================
       65541 = 2^16 + 5. Its identity is the same shape as RANDU's --
       a*a - 2^32 = 10a - 25 -- so 25u - 10v + w is a whole number and the
       triples sit on 35 sheets instead of 15. Verified on 299,998 triples. */
    if(T>=BEAT.ANY.sc&&T<BEAT.NOISE.sc){
      HEAD('CHANGE THE MULTIPLIER BY TWO');
      ENG({mult:A2,rate:2.2});
      STRIP({pts:PTS2});
      const sw=H.ease.inOut(mp(A2_T0,A2_T1));
      const V=viewNow(M);
      cubeFrame(V,CU.cx,CU.cy,CU.s,dim(0.56),1);
      cubeDots(V,CU.cx,CU.cy,CU.s,PTS1,NDOT*(1-sw),M,0.50*sw,false);
      cubeDots(V,CU.cx,CU.cy,CU.s,PTS2,NDOT*sw,M,0,true);
      arrivals(V,CU.cx,CU.cy,CU.s,PTS2,12,M);
      px('2^16 + 5',Q.cx,Q.alg.y,16,H.rgba(P.gold),'center','"Silkscreen"');
      px('25u - 10v + w',Q.cx,Q.alg.y+22,14,dim(0.30),'center','"Silkscreen"');
      if(after(14,6)) px(PL2+' SHEETS, NOT '+PL1,Q.cx,Q.under,16,
                         H.rgba(P.gold),'center','"Silkscreen"');
    }

    /* ============ NOISE -- stop calculating, measure something ======= */
    if(T>=BEAT.NOISE.sc&&T<BEAT.END.sc){
      HEAD(after(16,0)?'MEASURE SOMETHING INSTEAD':'ARITHMETIC CANNOT MAKE A CLOUD');
      /* the loop box is LIFTED OUT of the chain and a sensor is wired into
         the hole it leaves -- the swap the whole second leg is about */
      /* the loop box comes out of the chain across the whole sentence, and
         the lattice DRAINS OUT OF THE CUBE as it goes -- the arithmetic's
         output leaving with the arithmetic. That drain is this sentence's
         motion; without it the beat is three seconds of a static picture
         being talked over. */
      const lift=H.ease.in(mp(VO[15].t[1],VO[15].t[13]));
      ENG({mult:A2,rate:2.2,dy:lift*14,fade:H.clamp(lift*1.5)});
      sensor(M,H.clamp((lift-0.70)*3.4));
      STRIP({pts:PTS2});
      const fill=after(16,0)?mp(VO[16].t[4],VO[16].t[16]):0;
      pool(M,fill,after(16,11)?1:0);
      const drain=H.ease.inOut(mp(VO[15].t[1],VO[15].t[13]));
      const nm=noiseMix(M);
      const V=viewNow(M);
      cubeFrame(V,CU.cx,CU.cy,CU.s,dim(0.56),1);
      cubeDots(V,CU.cx,CU.cy,CU.s,PTS2,NDOT*(1-drain),M,0.50*drain,false);
      cubeDots(V,CU.cx,CU.cy,CU.s,PTSN,NDOT*nm,M,0,true);
      arrivals(V,CU.cx,CU.cy,CU.s,nm>0.3?PTSN:PTS2,14,M);
    }

    /* ============ END -- same cube, same turn ========================
       viewNow lands on exactly the angle FIFTEEN landed on. That identity
       is the only reason the last shot means anything. */
    if(T>=BEAT.END.sc){
      HEAD('SAME CUBE. SAME TURN.');
      sensor(M,1);
      pool(M,1,1);
      const V=viewNow(M);
      cubeFrame(V,CU.cx,CU.cy,CU.s,dim(0.56),1);
      cubeDots(V,CU.cx,CU.cy,CU.s,PTSN,NDOT,M,0,false);
      arrivals(V,CU.cx,CU.cy,CU.s,PTSN,12,M);
      if(after(17,2)) px('STILL A CLOUD',Q.cx,Q.under,16,H.rgba(P.green),
                         'center','"Silkscreen"');
    }
    capStack();
    B.restore();
  }
  endCard(T,M,SHUT,'it is now safe to','close this window.');

  /* --- the pointer. Hold, then move: sit still and make one decisive move in
     the last 0.55s before it is needed, rather than drifting across the middle
     of the diagram for the whole gap. A resting hand drifts +/-1px on two slow
     out-of-phase sines, because a frozen bitmap is not a hand. --- */
  const K2=PTRACK, APPROACH=0.70;
  let cx=K2[0].x, cy=K2[0].y, still=true;
  for(let i=0;i<K2.length;i++){
    if(M<K2[i].t){ cx=K2[Math.max(0,i-1)].x; cy=K2[Math.max(0,i-1)].y; break; }
    if(i===K2.length-1){ cx=K2[i].x; cy=K2[i].y; break; }
    if(M>=K2[i+1].t) continue;
    const seg=K2[i+1].t-K2[i].t;
    if(K2[i+1].d){ still=false;
      const e=H.ease.inOut(H.clamp((M-K2[i].t)/Math.max(0.001,seg)));
      cx=Math.round(H.lerp(K2[i].x,K2[i+1].x,e)); cy=Math.round(H.lerp(K2[i].y,K2[i+1].y,e));
    } else {
      const go=K2[i+1].t-Math.min(APPROACH,seg);
      if(M<=go){ cx=K2[i].x; cy=K2[i].y; }
      else { still=false;
        const e=H.ease.inOut(H.clamp((M-go)/Math.max(0.001,K2[i+1].t-go)));
        cx=Math.round(H.lerp(K2[i].x,K2[i+1].x,e)); cy=Math.round(H.lerp(K2[i].y,K2[i+1].y,e)); }
    }
    break;
  }
  if(still){ cx+=Math.round(Math.sin(M*1.07)); cy+=Math.round(Math.sin(M*0.73+1.3)); }
  window.pointerPos=()=>({x:cx,y:cy,caret:!!CARET});
  if(!CARET){ const S=SESSION_SPANS.find(q=>M>=q.a&&M<=q.z);
    if(S) CARET={x:S.x,y:S.y,h:S.s,col:'#ffffff'}; }
  if(CARET){ const d=M-Math.floor(M);
    if(d<0.55){ B.fillStyle=CARET.col; B.fillRect(CARET.x,CARET.y,2,CARET.h); } }

  ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,W2,Hh);
  ctx.drawImage(BUF,0,0,LW,LH,0,0,W2,Hh);
  glass(ctx,W2,Hh,t,boost);
}

/* ===== THE SCORE_EVENTS =====
   Every key is from the closed bank -- click snap open blip knock tag draw zap
   mos crack crumble splash sub buzz moo note bass. An invented name is simply
   a beat with no sound on it: both players wrap each event in try/catch, so
   the ONLY signal is the render printing "(1 failed)", and a render that
   prints anything but "(0 failed)" does not ship (v4.20).

   The piece supplies SCORE_EVENTS(add,w) for its own events, and MUSIC = [bpm, [the
   figure, in Hz]]. */
function buildScore(){
  const E=[],add=(t,k,n)=>E.push({t:+t.toFixed(3),k,n});
  const w=(n,i)=>VO[n].t[i];
  const LAST=VO.length-1;
  const FIRST=Object.keys(BEAT)[PIECE.part?2:1];
  add(0.05,'open');
  PTRACK.forEach(q=>{ if(q.c) add(q.t,'click'); });
  RINGS.forEach(q=>add(q.t,'click'));
  add(BEAT[FIRST].sc-0.35,'open'); add(BEAT.END.sc-0.30,'open');
  add(VO[LAST].z+0.30,'snap'); add(VO[LAST].z+0.52,'click'); add(VO[LAST].z+0.67,'open');
  // a print blip on every word of every sentence that carries a caption
  [...new Set(CAPS.map(c=>c[1]))].forEach(n=>VO[n].t.forEach((tt,i)=>add(tt,'blip',i)));
  add(VO[0].z+0.52,'snap');
  SCORE_EVENTS(add,w);
  for(const k in BEAT) if(BEAT[k].sc>0) add(BEAT[k].sc,'mos');
  const E8=30/MUSIC[0], FIG=MUSIC[1];
  for(let i=0,tt=BEAT[FIRST].sc;tt<VO[VO.length-2].t[0];i++,tt+=E8){
    add(tt,'note',FIG[i%FIG.length]*((i%16)<8?1:1.5));
    if(i%8===0) add(tt,'bass',FIG[0]/2);
  }
  E.sort((a,b)=>a.t-b.t); return E;
}
