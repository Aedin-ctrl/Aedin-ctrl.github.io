// Thin wrapper over the WebAssembly exports. Views into wasm memory go stale
// if memory grows, so they're rebuilt whenever the buffer changes.
export async function loadSim(url, w, h){
  let mod;
  try {
    mod = await WebAssembly.instantiateStreaming(fetch(url), {});
  } catch(e){
    const bytes = await (await fetch(url)).arrayBuffer();
    mod = await WebAssembly.instantiate(bytes, {});
  }
  return new Sim(mod.instance.exports, w, h);
}

export class Sim {
  constructor(ex, w, h, seed = (Math.random() * 1e9) >>> 0){
    this.ex = ex;
    ex.init(w, h, seed);
    this.w = ex.width();
    this.h = ex.height();
    this.buffer = null;
  }
  /** The renderer's cell buffer. Rebuilt when memory grows or the world is
   *  recreated (clear/load allocate a new one). */
  get view(){
    const ptr = this.ex.view_ptr();
    if(this.buffer !== this.ex.memory.buffer || this.viewPtr !== ptr){
      this.buffer = this.ex.memory.buffer;
      this.viewPtr = ptr;
      this._view = new Uint8Array(this.buffer, ptr, this.w * this.h * 4);
    }
    return this._view;
  }
  palette(){
    const n = this.ex.mat_count();
    return new Uint8Array(this.ex.memory.buffer, this.ex.palette_ptr(), n * 16).slice();
  }
  step(n = 1){ this.ex.step(n); }
  /** Rows changed since last call, or null. */
  render(){
    const r = this.ex.render();
    if(r === 0xFFFFFFFF) return null;
    return [r & 0xFFFF, r >>> 16];
  }
  paint(x, y, r, m, mode = 0, extra = 0){ return this.ex.paint(x, y, r, m, mode, extra); }
  line(x0, y0, x1, y1, r, m, mode = 0, extra = 0){ return this.ex.paint_line(x0, y0, x1, y1, r, m, mode, extra); }
  rect(x0, y0, x1, y1, m, extra = 0){ this.ex.fill_rect(x0, y0, x1, y1, m, extra); }
  ignite(x, y, r){ this.ex.ignite(x, y, r); }
  explode(x, y, r){ this.ex.explode(x, y, r); }
  spawn(shape, m, x, y, size, angle = 0){ return this.ex.spawn(shape, m, x, y, size, angle); }
  markedToBody(x0, y0, x1, y1){ return this.ex.marked_to_body(x0, y0, x1, y1); }
  bodyAt(x, y){ return this.ex.body_at(x, y); }
  rope(x0, y0, x1, y1, m, thick = 2){ return this.ex.rope(x0, y0, x1, y1, m, thick); }
  pin(x, y, motor = 0){ return this.ex.pin(x, y, motor) === 1; }
  unpin(x, y, r = 3){ return this.ex.unpin(x, y, r); }
  joints(){
    const p = this.ex.joint_lines();
    return new Float32Array(this.ex.memory.buffer, p, this.ex.joint_count() * 5);
  }
  removeBody(id){ this.ex.remove_body(id); }
  tag(id, t){ this.ex.set_body_tag(id, t); }
  push(id, vx, vy, spin = 0){ this.ex.push_body(id, vx, vy, spin); }
  findTag(t, after = 0){ return this.ex.find_tag(t, after); }
  body(id){
    const p = this.ex.body_state(id);
    if(!p) return null;
    const f = new Float32Array(this.ex.memory.buffer, p, 10);
    return { x: f[0], y: f[1], angle: f[2], vx: f[3], vy: f[4], spin: f[5], mass: f[6], sleeping: !!f[7], tag: f[8], pixels: f[9] };
  }
  /** Every body with tag t. */
  tagged(t){
    const out = [];
    for(let id = this.findTag(t); id; id = this.findTag(t, id)) out.push(this.body(id));
    return out;
  }
  grabStart(x, y){ return this.ex.grab_start(x, y); }
  grabMove(x, y){ this.ex.grab_move(x, y); }
  grabEnd(){ this.ex.grab_end(); }
  cell(x, y){ return this.ex.cell(x, y); }
  count(m, x0, y0, x1, y1){ return this.ex.count_rect(m, x0, y0, x1, y1); }
  stats(){
    const f = new Float32Array(this.ex.memory.buffer, this.ex.stats(), 9);
    return { chunks: f[0], cells: f[1], particles: f[2], bodies: f[3], awake: f[4], explosions: f[5], frame: f[6], burning: f[7], impact: f[8] };
  }
  rects(){
    const p = this.ex.chunk_rects();
    return new Int32Array(this.ex.memory.buffer, p, this.ex.chunk_rect_count() * 4);
  }
  clear(){ this.ex.clear(); }
  save(){
    const n = this.ex.save();
    return new Uint8Array(this.ex.memory.buffer, this.ex.buf_ptr(), n).slice();
  }
  load(bytes){
    const p = this.ex.buf(bytes.length);
    new Uint8Array(this.ex.memory.buffer, p, bytes.length).set(bytes);
    return this.ex.load() === 1;
  }
}
