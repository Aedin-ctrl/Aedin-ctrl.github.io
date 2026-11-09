/* ===== CATHODE DESK -- the shared runtime, part 1 of 2 =====
   Everything here is the FORMAT, not the piece: the 9:16 buffer, the four
   layers, the window geometry, the caption strip. Both halves of the runtime
   used to be copied into every piece's HTML; honey and halloumi had already
   drifted to different buffer sizes and different cube units, which is the
   same "two lists of numbers that must agree" that has caused every other
   fault in this project.

   Load order is lib -> piece -> run. A top-level `const` in a classic script
   is shared with every later script (it is NOT a window property), so the
   three files share one lexical scope and no piece needs a namespace.   */

/* ===== H: seeded randomness, noise, math, colour (from the reference harness) ===== */
const H={};
H.rng=function(seed=1){let a=(typeof seed==='string')?(()=>{let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;})():(seed>>>0)||1;
  const r=function(){a|=0;a=(a+0x6d2b79f5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
  r.range=(lo,hi)=>lo+r()*(hi-lo);r.int=(lo,hi)=>Math.floor(lo+r()*(hi-lo+1));r.pick=x=>x[Math.floor(r()*x.length)];r.chance=p=>r()<p;return r;};
H.makeNoise=function(seed=1){const r=H.rng(seed),p=new Uint8Array(512),perm=[...Array(256).keys()];
  for(let i=255;i>0;i--){const j=Math.floor(r()*(i+1));[perm[i],perm[j]]=[perm[j],perm[i]];}
  for(let i=0;i<512;i++)p[i]=perm[i&255];
  const fade=t=>t*t*t*(t*(t*6-15)+10),lp=(a,b,t)=>a+(b-a)*t;
  const g3=(h,x,y,z)=>{h&=15;const u=h<8?x:y,v=h<4?y:(h===12||h===14)?x:z;return ((h&1)?-u:u)+((h&2)?-v:v);};
  function n3(x,y,z){const X=Math.floor(x)&255,Y=Math.floor(y)&255,Z=Math.floor(z)&255;x-=Math.floor(x);y-=Math.floor(y);z-=Math.floor(z);
    const u=fade(x),v=fade(y),w=fade(z),A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,B=p[X+1]+Y,BA=p[B]+Z,BB=p[B+1]+Z;
    return lp(lp(lp(g3(p[AA],x,y,z),g3(p[BA],x-1,y,z),u),lp(g3(p[AB],x,y-1,z),g3(p[BB],x-1,y-1,z),u),v),
              lp(lp(g3(p[AA+1],x,y,z-1),g3(p[BA+1],x-1,y,z-1),u),lp(g3(p[AB+1],x,y-1,z-1),g3(p[BB+1],x-1,y-1,z-1),u),v),w);}
  const n2=(x,y)=>n3(x,y,0.5);
  const fbm2=(x,y,o=4)=>{let s=0,a=0.5,f=1,nn=0;for(let i=0;i<o;i++){s+=a*n2(x*f,y*f);nn+=a;a*=0.5;f*=2;}return s/nn;};
  return {n2,n3,fbm2};};
H.lerp=(a,b,t)=>a+(b-a)*t; H.clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
H.smooth=(e0,e1,x)=>{const t=H.clamp((x-e0)/(e1-e0));return t*t*(3-2*t);};
H.ease={inOut:t=>(t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2),out:t=>1-Math.pow(1-t,3),in:t=>t*t*t,
  back:t=>{const c=1.70158;return 1+(c+1)*Math.pow(t-1,3)+c*Math.pow(t-1,2);}};
H.hex=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return [(n>>16)&255,(n>>8)&255,n&255];};
H.rgba=(c,a=1)=>{const[r,g,b]=Array.isArray(c)?c:H.hex(c);return `rgba(${r|0},${g|0},${b|0},${a})`;};
H.mix=(c1,c2,t)=>{const a=Array.isArray(c1)?c1:H.hex(c1),b=Array.isArray(c2)?c2:H.hex(c2);return [0,1,2].map(i=>a[i]+(b[i]-a[i])*t);};
H.layer=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};

/* ===== palette: the closed set ===== */
/* Win95 chrome is Win95 chrome -- those seven never move. Everything else is
   a SLOT, and each piece fills the slots from one of the palettes below, so
   two videos in a row do not look like the same video. The slot NAMES stay
   put, so no drawing code knows which palette it is in.
   P is mutated in place by usePalette(); anything that caches a colour must
   resolve it through P at draw time, which is why the sprite sheet stores slot
   names and not hex. */
const P={
  face:'#c0c0c0',hi:'#ffffff',lt:'#dfdfdf',sh:'#808080',dk:'#000000',navy:'#000080',teal:'#008080',
  sky:[],paper:'',bone:'',earth:'',orange:'',grass:'',ice:'',cyan:'',green:'',red:'',gold:'',ink:''};
const PALETTES=[
  { name:'DUSK',                                   // #001 -- the original
    sky:['#140c34','#1e1146','#2c1658','#43206a','#632a78','#8c357c','#b8457a','#e05c72','#f6806a','#ffaa6e','#ffd28a'],
    paper:'#fff4e2',bone:'#e3d6c0',earth:'#74432d',orange:'#ff8a3d',grass:'#9fcb55',
    ice:'#7fc8e8',cyan:'#7ff9ff',green:'#6aff8a',red:'#ff5a4f',gold:'#ffd27a',ink:'#0a0618' , ground:['#2c1658','#43206a'] },
  { name:'EMBER',                                  // hot coals into a bleached sky
    sky:['#1a0a12','#2b0f1a','#431423','#5e1a26','#7d2426','#9c3222','#bd4a1e','#d96a22','#ee8f3a','#f8b563','#ffd9a0'],
    paper:'#fff0d8',bone:'#ddc9a6',earth:'#5c3320',orange:'#ff7a2f',grass:'#c8d46a',
    ice:'#63d6c7',cyan:'#7ff0e2',green:'#b9e36a',red:'#ff4d4d',gold:'#ffc247',ink:'#120608' , ground:['#2a1410','#3d1d16'] },
  { name:'DEEP',                                   // cold water, green phosphor
    sky:['#04121c','#061c2b','#07283c','#07354e','#06445e','#0a566b','#157079','#2a8d84','#55ab8d','#8cc79c','#c9e4b7'],
    paper:'#eaf7ff',bone:'#b9d4dd',earth:'#20414e',orange:'#5fd0ff',grass:'#7ae6b0',
    ice:'#bfeaff',cyan:'#6ff2ff',green:'#6affb4',red:'#ff6b7a',gold:'#ffe08a',ink:'#030c14' , ground:['#041019','#082230'] },
  { name:'VIOLET',                                 // indigo night, acid highlights
    sky:['#0c0820','#141033','#1e1548','#2b1c5e','#3b246f','#50307c','#6a3d87','#8a4e8f','#ad6294','#cc7f9e','#e6a7b4'],
    paper:'#f4ecff',bone:'#cbbcdd',earth:'#3b2a55',orange:'#ff9ad5',grass:'#a8f06a',
    ice:'#a6c8ff',cyan:'#8affe8',green:'#9cff7a',red:'#ff5f8d',gold:'#ffd66b',ink:'#070418' , ground:['#160e2c','#241640'] },
  { name:'STORM',                                  // slate weather into a sulphur horizon
    sky:['#0a1014','#101a22','#162330','#1d2d3d','#26384a','#324557','#425462','#59656a','#78796b','#a08f68','#cbb06c'],
    paper:'#f2f6f4',bone:'#c5cfc8',earth:'#2c3a36',orange:'#ffa83d',grass:'#9fd96a',
    ice:'#9fd8ff',cyan:'#72f0ff',green:'#7affa0',red:'#ff6050',gold:'#ffd05a',ink:'#05090c' , ground:['#0e171b','#1b2a2e'] },
];
function usePalette(n){
  const q=PALETTES[((n|0)-1+PALETTES.length*4)%PALETTES.length];
  for(const k in q) if(k!=='name') P[k]=q[k];
  P.paletteName=q.name; return q.name;
}
function paintSwatches(){const put=(id,arr)=>{const e=document.getElementById(id); if(!e)return;   // the player pages carry no swatches
  arr.forEach(c=>{const i=document.createElement('i');i.style.background=c;i.title=c;e.appendChild(i);});};
 put('pc',[P.face,P.hi,P.lt,P.sh,P.dk,P.navy,P.teal]);put('ps',P.sky);
 put('pv',[P.paper,P.bone,P.earth,P.orange,P.grass,P.ice]);put('pp2',[P.cyan,P.green,P.red,P.gold,P.ink]);}

/* ===== buffer: everything draws at 640x360, blits x2 ===== */
// VERTICAL 9:16 -- this is made for phones, so the frame is the phone's.
// OUT is the output size; LW/LH is the buffer everything is drawn in, blitted x2.
const LW=432,LH=768, OUTW=864, OUTH=1536;
const BUF=H.layer(LW,LH), B=BUF.getContext('2d',{willReadFrequently:true});
const BAYER=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v=>(v+0.5)/16);
const bay=(x,y)=>BAYER[(y&3)*4+(x&3)];
const rect=(x,y,w,h,c)=>{B.fillStyle=c;B.fillRect(x|0,y|0,w|0,h|0);};
const dline=(y,x0,x1,c1,c2,a)=>{for(let x=x0;x<x1;x++){B.fillStyle=(a>bay(x,y))?c2:c1;B.fillRect(x,y,1,1);} };

/* --- LAYER 1: CHROME (Win95) --- */
function bevel(x,y,w,h,kind){let o1,o2,i1,i2;
  if(kind==='window'){o1=P.lt;o2=P.dk;i1=P.hi;i2=P.sh;}
  else if(kind==='button'){o1=P.hi;o2=P.dk;i1=P.lt;i2=P.sh;}
  else if(kind==='pressed'){o1=P.dk;o2=P.hi;i1=P.sh;i2=P.lt;}
  else {o1=P.sh;o2=P.hi;i1=P.dk;i2=P.lt;}
  rect(x,y,w-1,1,o1);rect(x,y,1,h-1,o1);rect(x,y+h-1,w,1,o2);rect(x+w-1,y,1,h,o2);
  rect(x+1,y+1,w-3,1,i1);rect(x+1,y+1,1,h-3,i1);rect(x+1,y+h-2,w-2,1,i2);rect(x+w-2,y+1,1,h-2,i2);}
function winFrame(x,y,w,h,title,active){
  rect(x,y,w,h,P.face);bevel(x,y,w,h,'window');
  const tx=x+3,ty=y+3,tw=w-6,th=15;
  rect(tx,ty,tw,th,active?P.navy:P.sh);
  // the usable title strip stops short of the close button, which is the line
  // the title has to stay behind
  if(FRAMES){ FRAMES.push({x:tx+4,y:ty+2,w:(x+w-20)-(tx+4)-2,h:th,k:'titlebar'});
              FRAMES.push({x:x+4,y:y+4+th+1,w:w-8,h:h-8-th-1,k:'client'}); }
  INCHROME=true; px(title,tx+4,ty+4,6,active?'#ffffff':'#c0c0c0'); INCHROME=false;
  // close button
  const bx=x+w-20;rect(bx,ty+1,13,12,P.face);bevel(bx,ty+1,13,12,'button');
  B.fillStyle='#000';for(let i=0;i<5;i++){B.fillRect(bx+4+i,ty+4+i,2,1);B.fillRect(bx+8-i,ty+4+i,2,1);}
  return {x:x+4,y:y+4+th+1,w:w-8,h:h-8-th-1};}
function button(x,y,w,h,label,pressed){rect(x,y,w,h,P.face);bevel(x,y,w,h,pressed?'pressed':'button');
  INCHROME=true; px(label,x+w/2,y+h/2-3+(pressed?1:0),6,'#000','center'); INCHROME=false;}
function groupBox(x,y,w,h,label){
  if(GBOX)GBOX.push({x:x,y:y,w:w,h:h,k:'groupbox'});
  rect(x,y+4,w,1,P.sh);rect(x,y+5,w,1,P.hi);rect(x,y+h-2,w,1,P.sh);rect(x,y+h-1,w,1,P.hi);
  rect(x,y+4,1,h-5,P.sh);rect(x+1,y+5,1,h-6,P.hi);rect(x+w-2,y+4,1,h-5,P.sh);rect(x+w-1,y+4,1,h-4,P.hi);
  const lw=label.length*7+6;rect(x+8,y,lw,9,P.face);
  INCHROME=true;px(label,x+11,y+1,6,'#000');INCHROME=false;}
function dottedArrow(pts,prog,col){let tot=0,seg=[];
  for(let i=0;i<pts.length-1;i++){const l=Math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]);seg.push(l);tot+=l;}
  const lim=tot*H.clamp(prog);B.fillStyle=col;let acc=0,dir=[1,0];
  for(let i=0;i<seg.length;i++){const[ax,ay]=pts[i],[bx2,by2]=pts[i+1];
    for(let d=0;d<seg[i];d+=4){if(acc+d>lim)break;const u=d/seg[i];
      B.fillRect(Math.round(ax+(bx2-ax)*u)-1,Math.round(ay+(by2-ay)*u)-1,2,2);dir=[(bx2-ax)/seg[i],(by2-ay)/seg[i]];}
    acc+=seg[i];}
  if(prog>=1){const[ex,ey]=pts[pts.length-1];
    for(let k=0;k<6;k++){const bx2=ex-dir[0]*k,by2=ey-dir[1]*k,pxx=-dir[1],pyy=dir[0];
      for(let s=-k;s<=k;s++)B.fillRect(Math.round(bx2+pxx*s*0.6),Math.round(by2+pyy*s*0.6),1,1);}}}
// Text caret, sized to the line it is writing and drawn in that line's own
// colour. A fixed 15px caret sat high against 18px text -- the caret has to
// span the glyph box, not a constant.
function ibeam(x,y,h,col){
  const HH=Math.max(10,h|0), c=col||'#fff';
  if(GBOX)GBOX.push({x:x-3,y:y-2,w:7,h:HH+4,k:'cursor'});
  for(let i=-3;i<=3;i++){rect(x+i,y-2,1,1,c);rect(x+i,y+HH+1,1,1,c);}   // serifs
  for(let j=-1;j<=HH;j++){rect(x-1,y+j,1,1,c);rect(x,y+j,1,1,c);rect(x+1,y+j,1,1,c);}}
// the arrow mid-drag: same pointer, button down, with a grabbed-edge marker
function dragCursor(x,y){ cursor(x,y);
  B.fillStyle=P.hi; for(let i=0;i<5;i++){B.fillRect(x+3+i,y+13,1,1);B.fillRect(x+3+i,y+17,1,1);}
  B.fillRect(x+3,y+14,1,3); B.fillRect(x+7,y+14,1,3); }
function cursor(x,y){if(GBOX)GBOX.push({x:x,y:y,w:10,h:16,k:'cursor'});const rows=['X','XX','XOX','XOOX','XOOOX','XOOOOX','XOOOOOX','XOOOOOOX','XOOOOOOOX','XOOOOOXXXX','XOOXOOX','XOX XOOX','XX  XOOX','X    XOOX','     XOOX','      XX'];
  rows.forEach((r,j)=>{for(let i=0;i<r.length;i++){if(r[i]==='X')rect(x+i,y+j,1,1,'#000');else if(r[i]==='O')rect(x+i,y+j,1,1,'#fff');}});}
function zoomRect(from,to,t,t0,t1){if(t<t0||t>=t1)return;
  for(let k=0;k<3;k++){const p=H.clamp((t-t0)/(t1-t0)-k*0.12);if(p<=0)continue;
    const x=Math.round(H.lerp(from[0],to[0],p)),y=Math.round(H.lerp(from[1],to[1],p)),
          w=Math.round(H.lerp(from[2],to[2],p)),h=Math.round(H.lerp(from[3],to[3],p));
    B.fillStyle=P.face;B.fillRect(x,y,w,2);B.fillRect(x,y+h,w,2);B.fillRect(x,y,2,h);B.fillRect(x+w,y,2,h+2);}}

/* --- pixel text: rasterise a real font and threshold to hard pixels --- */
// 720 wide: the buffer is 640, so anything that fits on screen fits here.
// At 420 an over-wide string was silently CUT at 420px and then reported a
// 420px width, so checkBounds saw a string that fitted while the screen
// showed one running off the edge. That is how 'SPOILS' disappeared.
const TC=H.layer(720,64),TX=TC.getContext('2d',{willReadFrequently:true});
const TCACHE=new Map();
let BOUNDS=null;   // text extents
/* Every Win95 container that text can overflow: the title bar (minus the close
   button) and the client area of each window. checkChrome() uses these. Until
   v3.8 nothing swept chrome at all, and #005's title ran off the end of its own
   title bar in every single frame of the piece. */
let FRAMES=null;
let GBOX=null;     // extents of the things text can hide behind
let INCHROME=false;
let OVERLAY=false; // true while drawing a window that FLOATS OVER the panel// true while drawing Win95 furniture, which is 9px by definition
/* The glyph cache, split out of px() so a caller can MEASURE before placing.
   g.w is the advance width plus slop and g.h is the last lit row; neither is
   the ink box, which is what you need to centre something inside a circle.
   ix0..iy1 are that box. */
function glyph(str,size,font){
  const key=str+'|'+size+'|'+(font||'p');
  let g=TCACHE.get(key);
  if(!g){TX.clearRect(0,0,420,48);
    TX.font=size+'px '+(font||'"Press Start 2P"');TX.textBaseline='top';TX.fillStyle='#fff';TX.fillText(str,1,1);
    const raw=Math.ceil(TX.measureText(str).width)+3;
    const w=Math.min(720,raw),h=Math.min(64,Math.ceil(size*1.6)+3);
    const cut=raw>720;
    const d=TX.getImageData(0,0,w,h).data,pts=[];
    for(let j=0;j<h;j++)for(let i=0;i<w;i++)if(d[(j*w+i)*4+3]>120)pts.push([i,j]);
    let gh=0,ix0=1e9,ix1=-1e9,iy0=1e9,iy1=-1e9;
    for(const[i,j]of pts){ if(j+1>gh) gh=j+1;
      if(i<ix0)ix0=i; if(i>ix1)ix1=i; if(j<iy0)iy0=j; if(j>iy1)iy1=j; }
    if(!pts.length){ix0=iy0=0;ix1=iy1=-1;}
    g={pts,w,h:gh,cut:cut,full:raw,ix0,ix1,iy0,iy1};TCACHE.set(key,g);}
  return g;}
function px(str,x,y,size,col,align,font){
  const g=glyph(str,size,font);
  const key=str+'|'+size+'|'+(font||'p');
  let ox=Math.round(x);if(align==='center')ox=Math.round(x-g.w/2);if(align==='right')ox=Math.round(x-g.w);
  const oy=Math.round(y);
  // A string is drawn hundreds of times at the same size and colour, so the
  // thresholded glyph is baked into a small canvas per (string,size,font,colour)
  // and blitted. Same pixels, one drawImage instead of one fillRect per lit
  // pixel. Falls back to the per-pixel path for any non-hex colour.
  const ck=key+'|'+col;
  let tc=CCACHE.get(ck);
  if(tc===undefined){ tc=bakeGlyph(g,col); CCACHE.set(ck,tc);
    if(CCACHE.size>700) CCACHE.clear(); }
  // BOUNDS is null normally. window.checkBounds() sets it to an array and
  // sweeps the whole piece, so "is anything off screen" is a measurement
  // rather than a thing I squint at in screenshots.
  if(BOUNDS){const f=font||'p';
    const role = f.indexOf('VT323')>=0 ? 'vt'
               : f.indexOf('Silkscreen')>=0 ? (size>=24?'num':'label')
               // A headline is one SET as a headline: >=22 in the buffer, the
               // spec's own floor. Anything between the label floor and that is
               // just a large label and already clears its floor -- treating it
               // as a headline made the checker demand 22px of an 18px label.
               : (size>=22?'head':'label');
    BOUNDS.push({x:ox,y:oy,w:g.w,h:g.h,s:str,size:size,role:role,chrome:INCHROME,overlay:OVERLAY,
                 cut:g.cut,full:g.full});}
  if(tc) B.drawImage(tc,ox,oy);
  else { B.fillStyle=col; for(const[i,j]of g.pts)B.fillRect(ox+i,oy+j,1,1); }
  return g.w;}
const CCACHE=new Map();
function bakeGlyph(g,col){
  if(typeof col!=='string'||col[0]!=='#') return null;   // rgba()/gradient: draw live
  let w=1,h=1; for(const[i,j]of g.pts){if(i>=w)w=i+1;if(j>=h)h=j+1;}
  const c=H.layer(w,h),x=c.getContext('2d',{willReadFrequently:true}),id=x.createImageData(w,h),d=id.data,[r,gg,b]=H.hex(col);
  for(const[i,j]of g.pts){const o=(j*w+i)*4;d[o]=r;d[o+1]=gg;d[o+2]=b;d[o+3]=255;}
  x.putImageData(id,0,0); return c;}
function pxShadow(str,x,y,size,col,shadow,align,font){
  px(str,x+1,y+1,size,shadow,align,font);return px(str,x,y,size,col,align,font);}

/* --- LAYER 2: SCREEN (16-bit) --- */
// The dusk plate (banded sky + dithered ground) is a pure function of its
// rectangle, so it is baked ONCE into a canvas and blitted after that.
// Drawn live it was ~190,000 1x1 fillRects per frame and measured 42.8ms --
// beat 2 ran at 23fps while the rest of the piece ran at 400+. The dither
// phase is taken from ABSOLUTE x,y, exactly as dline() did, so the cached
// pixels are identical to the ones this replaces.
const PLATE=new Map();
// Baked ONCE as raw ImageData and written with putImageData, which is the
// fast path into a willReadFrequently canvas. drawImage of a cached canvas
// was tried first and stayed at 40ms/frame; putImageData is the one that
// actually lands. Because putImageData ignores the clip, the plate is baked
// already trimmed to the client area's clip rect (2px in on every side) --
// the band and dither maths still use the ORIGINAL full-rect coordinates, so
// the pixels are identical to the ones dline() drew.
function duskPlate(x0,y0,w,h,groundH){
  const key=x0+','+y0+','+w+','+h+','+groundH;
  let d=PLATE.get(key); if(d) return d;
  const iw=w-4, ih=h-4;
  const id=B.createImageData(iw,ih), a=id.data;
  const row=(j,c1,c2,amt)=>{const A=H.hex(c1),C=H.hex(c2),ay=y0+2+j;
    for(let i=0;i<iw;i++){const col=(amt>bay(x0+2+i,ay))?C:A,o=(j*iw+i)*4;
      a[o]=col[0];a[o+1]=col[1];a[o+2]=col[2];a[o+3]=255;}};
  for(let j=0;j<ih;j++){
    const y=j+2;                                  // y inside the ORIGINAL rect
    let c1,c2,amt;
    if(groundH && y>=h-groundH){ c1=P.ground[0]; c2=P.ground[1]; amt=(y-(h-groundH))/groundH; }
    // The sky gradient is mapped over the sky's OWN height, not the whole
    // rect. Mapped over the rect, a tall ground swallowed the warm end of the
    // palette and a "dusk sky" came out uniformly purple.
    else { const sh=Math.max(1,h-(groundH||0));
           const f=Math.pow(H.clamp(y/sh),1.2)*(P.sky.length-1);
           const i=Math.min(P.sky.length-2,Math.floor(f));
           c1=P.sky[i]; c2=P.sky[i+1]; amt=H.smooth(0.55,1,f-i); }
    row(j,c1,c2,amt);}
  PLATE.set(key,id); return id;}
function skyBands(x0,y0,w,h,groundH){B.putImageData(duskPlate(x0,y0,w,h,groundH||0),x0+2,y0+2);}
// Cache occupancy, for the next time someone benchmarks this: a count that
// climbs with the frame number means something is missing the cache.
window.cacheSizes=()=>({plates:PLATE.size,glyphs:CCACHE.size,text:TCACHE.size});
function stars(x0,y0,w,h,n,seed,T){const r=H.rng(seed);
  for(let s=0;s<n;s++){const x=x0+r.int(0,w-1),y=y0+r.int(0,h-1),ph=r()*6.28;
    if(Math.sin(T*3+ph)>-0.3)rect(x,y,1,1,y<y0+h*0.4?'#fff4d8':'#a88ac8');}}
const SPR={
  jar:['..KKKKKKKK..','.KWWWWWWWWK.','.KKKKKKKKKK.','KHHHHHHHHHHK','KHHHHHHHHHHK','KHHHHHHHHHHK',
       'KHHGGGGGGHHK','KHHGGGGGGHHK','KHHGGGGGGHHK','KHHHHHHHHHHK','KHHHHHHHHHHK','KHHHHHHHHHHK','.KKKKKKKKKK.'],
  // the same jar with the lid off -- the seal beat needs it open
  jaropen:['KK........KK','K..........K','KHHHHHHHHHHK','KHHHHHHHHHHK',
       'KHHGGGGGGHHK','KHHGGGGGGHHK','KHHGGGGGGHHK','KHHHHHHHHHHK','KHHHHHHHHHHK',
       'KHHHHHHHHHHK','.KKKKKKKKKK.'],
  bug:['..K..K..','.KKKKKK.','KGGGGGGK','KGKGGKGK','KGGGGGGK','.KGGGGK.','..K..K..'],
  // the lake beat needs something alive under the lid. First attempt was a
  // symmetrical blob -- no tail, no eye, and it read as a lozenge.
  fish:['...KKKK.....','..KGGGGKK..K','.KGKGGGGGKKK','KGGGGGGGGGGK','.KGGGGGGGKKK','..KGGGGKK..K','...KKKK.....'],
  // the cold-open gags. Two frames each, because a walk cycle and a wingbeat
  // are the whole difference between a prop and a thing that is alive.
  bee: ['...WW.WW..','..KKKKKKK.','.KYYDDYYDK','.KYYDDYYDK','.KYYDDYYDK','..KKKKKKK.','...K...K..'],
  bee2:['..W.W.W.W.','..KKKKKKK.','.KYYDDYYDK','.KYYDDYYDK','.KYYDDYYDK','..KKKKKKK.','...K...K..'],
  cow: ['..............K.','...KKKKKKKKKKKKK','..KWWKKWWWWKWWWK','..KWKKKWWWWKWWWK','..KWWWWWWWWKKWKK','..KWWKKKWWWWWWK.','..KKWWWWWWWWKK..','...K.K...K.K....','...K.K...K.K....','...KKK...KKK....'],
  cow2:['..............K.','...KKKKKKKKKKKKK','..KWWKKWWWWKWWWK','..KWKKKWWWWKWWWK','..KWWWWWWWWKKWKK','..KWWKKKWWWWWWK.','..KKWWWWWWWWKK..','....K.K...K.K...','....K.K...K.K...','....KKK...KKK...'],
};
// slot names, not hex: the palette is swapped per piece after this file loads
const SPRC={jar:{K:'ink',W:'face',H:'orange',G:'gold'},
            jaropen:{K:'ink',W:'face',H:'orange',G:'gold'},
            bug:{K:'ink',G:'grass'},
            fish:{K:'ink',G:'grass',W:'hi'},
            bee:{K:'ink',Y:'gold',D:'earth',W:'paper'},
            bee2:{K:'ink',Y:'gold',D:'earth',W:'paper'},
            cow:{K:'ink',W:'paper'}, cow2:{K:'ink',W:'paper'}};
function sprite(name,x,y,s){const m=SPRC[name],c={};for(const k in m)c[k]=P[m[k]];
  if(GBOX)GBOX.push({x:x,y:y,w:SPR[name][0].length*s,h:SPR[name].length*s,k:'sprite:'+name});
  SPR[name].forEach((row,j)=>{for(let i=0;i<row.length;i++){const ch=row[i];if(ch==='.')continue;
    rect(x+i*s,y+j*s,s,s,c[ch]);}});}
function mosaic(x0,y0,w,h,n){if(n<=1)return;
  const img=B.getImageData(x0,y0,w,h),d=img.data;
  for(let by=0;by<h;by+=n)for(let bx=0;bx<w;bx+=n){
    const sx=Math.min(w-1,bx+(n>>1)),sy=Math.min(h-1,by+(n>>1)),si=(sy*w+sx)*4;
    for(let y=by;y<Math.min(h,by+n);y++)for(let x=bx;x<Math.min(w,bx+n);x++){
      const i=(y*w+x)*4;d[i]=d[si];d[i+1]=d[si+1];d[i+2]=d[si+2];}}
  B.putImageData(img,x0,y0);}

/* --- LAYER 3: OBJECTS (voxel, isometric, three-tone) --- */
const CW=10,CH=5,CZ=9;   // bigger unit: a 5px cube left a 9:16 frame mostly air
const proj=(ox,oy)=>(x,y,z)=>[ox+(x-y)*CW,oy+(x+y)*CH-z*CZ];
function cube(Pr,x,y,z,col){
  const c=Array.isArray(col)?col:H.hex(col),top=c.map((v,i)=>v*1.00*[1.0,0.98,0.93][i]),
        fr=c.map((v,i)=>v*0.80*[0.97,0.95,1.0][i]), sd=c.map((v,i)=>v*0.64*[0.92,0.92,1.04][i]);
  const p=(a,b,cc)=>Pr(x+a,y+b,z+cc);
  const face=(pts,col2)=>{B.fillStyle=H.rgba(col2);B.beginPath();pts.forEach((q,i)=>i?B.lineTo(q[0],q[1]):B.moveTo(q[0],q[1]));B.closePath();B.fill();};
  face([p(0,0,1),p(1,0,1),p(1,1,1),p(0,1,1)],top);
  face([p(0,1,0),p(1,1,0),p(1,1,1),p(0,1,1)],fr);
  face([p(1,0,0),p(1,1,0),p(1,1,1),p(1,0,1)],sd);}
function voxBar(Pr,bx,by,hgt,col,drop,foot){ // drop: 0..1, per-cube landing from above
  const f=foot||3;
  if(GBOX&&drop>0){const c=[];
    for(const[a,b2,z]of[[bx,by+f,0],[bx+f,by,0],[bx,by,hgt],[bx+f,by+f,0]])c.push(Pr(a,b2,z));
    const xs=c.map(q=>q[0]),ys=c.map(q=>q[1]);
    GBOX.push({x:Math.round(Math.min(...xs)),y:Math.round(Math.min(...ys)),
               w:Math.round(Math.max(...xs)-Math.min(...xs)+CW),
               h:Math.round(Math.max(...ys)-Math.min(...ys)+CH*2),k:'voxbar'});}
  for(let z=0;z<hgt;z++){
    const k=H.clamp(drop*hgt-z);if(k<=0)break;
    const lift=(1-H.ease.out(k))*7;          // 0.32s drop, eased out, as the spec sets
    for(let a=0;a<f;a++)for(let b=0;b<f;b++)cube(Pr,bx+a,by+b,z+lift,col);}}
function blockTag(x,y,text,size,bg,col){
  const w=text.length*(size*0.62)+14,h=size+10,d=4;
  if(GBOX)GBOX.push({x:Math.round(x-w/2),y:Math.round(y-h/2),w:Math.round(w+d),h:Math.round(h+d),k:'tag:'+text});
  B.fillStyle=H.rgba(H.hex(bg).map(c=>c*0.62));
  B.beginPath();B.moveTo(x+w/2,y-h/2);B.lineTo(x+w/2+d,y-h/2+d);B.lineTo(x+w/2+d,y+h/2+d);B.lineTo(x+w/2,y+h/2);B.fill();
  B.fillStyle=H.rgba(H.hex(bg).map(c=>c*0.78));
  B.beginPath();B.moveTo(x-w/2,y+h/2);B.lineTo(x+w/2,y+h/2);B.lineTo(x+w/2+d,y+h/2+d);B.lineTo(x-w/2+d,y+h/2+d);B.fill();
  rect(x-w/2,y-h/2,w,h,bg);
  rect(x-w/2,y-h/2,w,1,'rgba(255,255,255,0.45)');
  px(text,x,y-size/2+1,size,col,'center','"Silkscreen"');}

/* --- LAYER 4: GLASS (phosphor CRT) — all cached, composited at output res --- */
let SCAN=null,GRAIN=null,VIG=null;
function buildGlass(W,Hh){
  SCAN=H.layer(W,Hh);const s=SCAN.getContext('2d');
  for(let y=0;y<Hh;y+=3){s.fillStyle='rgba(0,0,0,0.26)';s.fillRect(0,y,W,1);
    s.fillStyle='rgba(0,0,0,0.11)';s.fillRect(0,y+1,W,1);}
  GRAIN=H.layer(W,Hh);const g=GRAIN.getContext('2d'),id=g.createImageData(W,Hh),d=id.data,r=H.rng(3);
  for(let i=0;i<d.length;i+=4){const n=(r()-0.5)*0.055*255,v=n>0?255:0;
    d[i]=d[i+1]=d[i+2]=v;d[i+3]=Math.min(255,Math.abs(n)*(n>0?4:1.2));}
  g.putImageData(id,0,0);
  VIG=H.layer(W,Hh);const v=VIG.getContext('2d');
  const rg=v.createRadialGradient(W/2,Hh/2,Math.min(W,Hh)*0.30,W/2,Hh/2,Math.hypot(W,Hh)*0.56);
  rg.addColorStop(0,'rgba(0,0,0,0)');rg.addColorStop(1,'rgba(0,0,0,0.60)');
  v.fillStyle=rg;v.fillRect(0,0,W,Hh);}
const BLOOM=H.layer(216,384),BL=BLOOM.getContext('2d');
function glass(ctx,W,Hh,t,boost){
  // bloom: downscale, blur, add back
  BL.clearRect(0,0,216,384);BL.filter='blur(2.4px)';BL.drawImage(BUF,0,0,216,384);BL.filter='none';
  ctx.save();ctx.globalCompositeOperation='lighter';ctx.globalAlpha=0.34*boost;
  ctx.imageSmoothingEnabled=true;ctx.drawImage(BLOOM,0,0,W,Hh);ctx.restore();
  ctx.drawImage(SCAN,0,0);
  // hum bar rolling up the tube
  const hy=((t*0.16)%1.25-0.12)*Hh;
  ctx.save();ctx.globalCompositeOperation='lighter';
  const hg=ctx.createLinearGradient(0,hy-60,0,hy+60);
  hg.addColorStop(0,'rgba(80,220,120,0)');hg.addColorStop(0.5,'rgba(80,220,120,0.05)');hg.addColorStop(1,'rgba(80,220,120,0)');
  ctx.fillStyle=hg;ctx.fillRect(0,hy-60,W,120);ctx.restore();
  // phosphor green lift + vignette + grain
  ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle='rgba(18,52,28,0.30)';ctx.fillRect(0,0,W,Hh);ctx.restore();
  ctx.drawImage(VIG,0,0);
  ctx.save();ctx.globalAlpha=0.5;ctx.drawImage(GRAIN,0,0);ctx.restore();}


/* ===== LAYOUT =====
   The window never moves, so its geometry is a constant -- and it is declared
   ONCE here. The drawing and the pointer's action table both read it. They used
   to carry their own copies of the same coordinates, which is exactly why the
   drags stopped landing on anything the moment a chart moved 22px. */
const PX=12, PY=28, PW=408, PH=710;              // the client panel, 9:16
// The box used to run to PH-74 and the caption was crammed into the 45px left
// under it. The bottom 100px of the panel now BELONG to the caption: three
// 20px lines with air under them, and the diagram gets what is left.
const BX=PX+12, BY=PY+10, BW=PW-24, BH=PH-134;   // the group box inside it
const IL=BX+16, IT=BY+24, IR=BX+BW-16, IB=BY+BH-16;
const CAPY=BY+BH+14;                             // caption strip, below the box
const CAPSZ=20, CAPCH=39;                        // 20px VT323 fits 39 chars across
// Every beat's content band is centred on this line. Vertical is unforgiving:
// a band that sits 60px low reads as "bottom-weighted" even when nothing is
// off screen, and no bounds sweep can see it. checkComposition() does.
const MIDY=BY+BH/2;
const DLG=[46,150,340,156];   // above the object, which owns the lower half
const DLG_OK={x:DLG[0]+4+(DLG[2]-8)/2, y:DLG[1]+4+15+1+(DLG[3]-8-15-1)-26+10};
const BOX=[36,272,360,224];
const BOX_OK={x:BOX[0]+4+(BOX[2]-8)/2, y:BOX[1]+4+15+1+(BOX[3]-8-15-1)-26+10};
const CAPREST=[PX+300, BY+BH-42];
const OK_DIALOG=DLG_OK, OK_BOX=BOX_OK;
const SESSION_SPANS=[]; const SESSION_GAP=2.0; const SESSION_NEAR=80;
const SPD=1.0, LEAD=0.20;
const W=(n,i)=>VO[n].t[i];
const CWv=10, CHv=5, CZv=9;                      // mirrors CW/CH/CZ in the voxel layer
const stackTop=(oy,cubes)=>oy-cubes*CZv;
const stackMid=(ox,bx,by)=>ox+(bx-by)*CWv;

/* ===== the piece's own badge =====
   Every video says which number it is and what it is filed under, in the
   status bar at the bottom of the frame and again on the end card. Two tags
   maximum -- a third is a sign the piece is about two things.  */
// A closed set, like the palette. "CHEM" was an abbreviation nobody files
// anything under; these are the words a person would actually browse by.
const TAGS=['FOOD','BIOLOGY','CHEMISTRY','PHYSICS','SPACE','EARTH','WEATHER',
            'NATURE','WILDLIFE','BODY','TECH','HISTORY','MONEY','NEWS'];
const pieceTag=()=>'#'+String(PIECE.no).padStart(3,'0')+'  '+PIECE.tags.slice(0,2).join(' / ');
/* Put a glyph's INK centre on a point, both axes. px() places a top-left (or
   a centred advance width, which is not the same thing), so the ? inside the
   help icon was placed by eye in every piece: 3px left and 6px low, in all
   three, because nobody ever computed where the circle's middle was. */
function pxMid(str,cx,cy,size,col,font){
  const g=glyph(str,size,font);
  if(g.ix1<g.ix0) return 0;
  return px(str, Math.round(cx-(g.ix0+g.ix1+1)/2), Math.round(cy-(g.iy0+g.iy1+1)/2),
            size, col, null, font);
}

/* The Win95 info/help icon: one circle, one glyph, centred in it by
   construction. Drawn from the CENTRE out, so the circle is symmetrical and
   the thing inside it lands on the same point. kind is '?' or 'i'. */
function winIcon(x,y,kind){
  const R=12, cx=x+R, cy=y+R, navy='#000080';
  // a CIRCLE, not the 26x22 ellipse this used to be
  for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++){
    const d=Math.hypot(i,j)/R;
    if(d<0.93) rect(cx+i,cy+j,1,1,'#fff');
    else if(d<1.0) rect(cx+i,cy+j,1,1,'#000');
  }
  // 15px, not 20: at 20 the ? inked 18x18 inside a 21px disc and pushed out
  // through the top and bottom of its own circle
  if(kind==='?') pxMid('?',cx,cy,15,navy);
  else { rect(cx-1,cy-7,3,3,navy); rect(cx-1,cy-1,3,9,navy); }   // dot + stem: 15 rows, cy-7..cy+7
  return {cx:cx,cy:cy,r:R};
}

function statusBar(r,T,beat){
  const sy=r.y+r.h-15, w1=150, w2=126, x3=r.x+w1+4+w2+4;
  const seg=(x,w)=>{rect(x,sy,w,14,P.face);bevel(x,sy,w,14,'field');};
  seg(r.x,w1); seg(r.x+w1+4,w2); seg(x3,r.x+r.w-x3);
  INCHROME=true;
  px(pieceTag(),r.x+4,sy+1,12,'#000',null,'"VT323"');
  px(beat,r.x+w1+8,sy+1,12,'#000',null,'"VT323"');
  px(T.toFixed(1)+'s',r.x+r.w-6,sy+1,12,'#000','right','"VT323"');
  INCHROME=false;
  return sy;}

/* The desktop behind the window. The content beats are a dark field on
   purpose -- you read numbers off a blackboard -- but the FIRST thing and the
   LAST thing anyone sees should not look like homework, so the desktop is a
   dusk sky and the opening beat gets one inside the window too. */
function deskSky(T,groundH){ const g=(groundH===undefined)?300:groundH;
  skyBands(0,0,LW,LH,g); stars(0,0,LW,(LH-g)*0.92,46,11,T); }

/* The overview panel always lands on a WIPED stage. Honey cleared the client
   area because its last beat simply stopped drawing; halloumi left the whey
   vat and the hero number sitting behind the panel. Same style, two different
   endings -- so it is one call now and every piece makes it. */
function wipeStage(CX,CY,CWd,CHd){ rect(CX+2,CY+2,CWd-4,CHd-4,P.ink); }

/* The vibrant beat is a QUESTION, and nothing else. Big type on the dusk sky,
   TYPED across the beat's own speech, then the piece wipes to the blackboard.
   No diagram on it: a voxel chart on a sunset was competing with its own
   background, and the contrast between a title card and a dark field is the
   whole reason the sky is there. Left-aligned, because typing reads from a
   margin and a caret on the end of a centred line wanders.
   Returns where the caret belongs, for the caller to hand to CARET. */
/* A SOLID object with a ringed outline.

   Opaque, because a translucent silhouette on a bright sky was neither a
   shape nor a window -- it just went grey where it mattered. Faceted, in
   three tones with seams between them, so it models the way the voxel layer
   does instead of reading as a flat cut-out.

   The outline is a RING: black first at 7px, then the rim at 3px inside it,
   so there is black on both sides of the rim and it holds against any
   background -- a single white pass vanished wherever the shape crossed the
   bright band at the horizon. */
/* ===== THE FOLK ANSWER, STAMPED =====
   The wrong explanation everyone already holds, marked off before the piece
   starts -- so a viewer who arrived with it is not spending the first mechanism
   waiting to see whether we agree.

   It is a STAMP, standing on its own above the card, not a line inside it: in
   the dialog it read as part of the question, which is the one thing it must
   not be. Tilted by stepping each COLUMN of the plate and each character of the
   text by an integer, never by rotating the canvas -- a rotation resamples the
   baked glyphs and the pixel grid is the whole format.                      */
function mythStamp(t){
  if(!PIECE.myth) return;
  const v=VO[0]; if(t < v.t[v.w.length-1]) return;     // lands on the last word
  const f='"Silkscreen"', size=20, pad=11, bd=3, slope=-0.10;
  const cs=PIECE.myth.toUpperCase().split('');
  const ws=cs.map(c=>glyph(c,size,f).w);
  const tw=Math.round(ws.reduce((a,b)=>a+b,0));
  const W=tw+pad*2, Hh=size+pad*2;
  const x0=Math.round(LW/2-W/2), top=DLG[1]-Hh-26, mid=x0+W/2;
  const yAt=(x)=>Math.round(top+slope*(x-mid));
  for(let i=0;i<W;i++){
    const x=x0+i, y=yAt(x);
    B.fillStyle=P.ink; B.fillRect(x,y,1,Hh);
    B.fillStyle=P.gold;
    if(i<bd||i>=W-bd) B.fillRect(x,y,1,Hh);
    else { B.fillRect(x,y,1,bd); B.fillRect(x,y+Hh-bd,1,bd); }
  }
  // a *box key: the stamp's own text sits on its own plate by design
  if(GBOX)GBOX.push({x:x0,y:yAt(x0+W)-2,w:W,h:Hh+Math.round(Math.abs(slope*W))+4,k:'stampbox'});
  let xx=x0+pad;
  cs.forEach((c,i)=>{ if(c.trim()) px(c,Math.round(xx),yAt(xx)+pad,size,P.gold,null,f); xx+=ws[i]; });
}

function strokePoly(pts,col,th,open){
  if(!col) return;
  B.fillStyle=col; const h=th>>1, n0=open?pts.length-1:pts.length;
  for(let i=0;i<n0;i++){
    const a0=pts[i], b0=pts[(i+1)%pts.length];
    const n=Math.max(1,Math.round(Math.hypot(b0[0]-a0[0],b0[1]-a0[1])));
    for(let k=0;k<=n;k++)B.fillRect(Math.round(a0[0]+(b0[0]-a0[0])*k/n)-h,
                                   Math.round(a0[1]+(b0[1]-a0[1])*k/n)-h,th,th);
  }
}
function solidShape(facets,outer,rim,seam){
  facets.forEach(f=>{ B.fillStyle=f.c;
    B.beginPath(); f.p.forEach((q,i)=>i?B.lineTo(q[0],q[1]):B.moveTo(q[0],q[1]));
    B.closePath(); B.fill(); });
  if(seam) facets.forEach(f=>strokePoly(f.p,seam,2));
  strokePoly(outer,'#000000',9);   // 3px of black either side of the rim
  strokePoly(outer,rim,3);
  const xs=outer.map(q=>q[0]), ys=outer.map(q=>q[1]);
  return {x:Math.min(...xs)-4,y:Math.min(...ys)-4,
          w:Math.max(...xs)-Math.min(...xs)+8,h:Math.max(...ys)-Math.min(...ys)+8};
}

/* An open polyline in hard pixels -- ridges, striations, crevasses. solidShape
   closes its path, so detail INSIDE a silhouette needs its own primitive. */
function linePix(pts,col,w){
  const th=w||2; B.fillStyle=col;
  for(let i=0;i<pts.length-1;i++){
    const a0=pts[i], b0=pts[i+1];
    const n=Math.max(1,Math.round(Math.hypot(b0[0]-a0[0],b0[1]-a0[1])));
    for(let k=0;k<=n;k++)B.fillRect(Math.round(a0[0]+(b0[0]-a0[0])*k/n)-(th>>1),
                                   Math.round(a0[1]+(b0[1]-a0[1])*k/n)-(th>>1),th,th);
  }
}

function questionCard(lines,t,t0,t1,y,size,gap,until){
  const sz=size||26, gp=gap||44, x=IL+8;
  const total=lines.reduce((a,l)=>a+l.length+1,0)-1;
  let n=Math.round(H.clamp((t-t0)/Math.max(0.001,t1-t0))*total);
  let caret=null;
  for(let i=0;i<lines.length;i++){
    const L=lines[i], yy=y+i*gp;
    if(n<=0) break;
    const cut=L.slice(0,Math.min(L.length,n));
    // paper, not gold: gold on the ember sky was two warm colours fighting.
    // Near-white carries on every palette, which is the point of a slot.
    const w=cut?pxShadow(cut,x,yy,sz,P.paper,P.ink):0;
    caret={x:x+w+Math.round(sz*0.35),y:yy,h:sz,col:P.paper};
    n-=L.length+1;
  }
  // The caret stays until the scene changes. Letting it go the moment the
  // question finished left the pointer parked on the second line for the rest
  // of the beat -- the exact thing checkPointerIdle() is for.
  // ...and one CONTENT frame past that: the beat is gated on T (12fps) while
  // the caret is gated on t, so for up to 1/12s the card is still on screen
  // with nothing typing on it. That one frame is a pointer-idle hit.
  return (t < (until===undefined?t1+0.45:until+1/12)) ? caret : null;
}
function introSky(CX,CY,CWd,CHd,T,groundH){ const g=(groundH===undefined)?400:groundH;
  skyBands(CX,CY,CWd,CHd,g); stars(CX,CY,CWd,(CHd-g)*0.9,34,7,T); }
