// WebGL2 renderer. The simulation hands us one RGBA byte per channel per
// cell (material, shade, life, flags); we upload only the rows that changed
// and turn them into colour on the GPU:
//   1. cells  -> colour + glow   (sim resolution, two render targets)
//   2. glow   -> blurred glow    (half resolution, two separable passes)
//   3. colour + glow -> screen   (nearest-neighbour upscale, optional CRT)
import { M } from './materials.js';

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const CELL_FS = `#version 300 es
precision highp float;
uniform sampler2D uSim;
uniform sampler2D uPal;
uniform float uTime;
uniform vec2 uSize;
layout(location = 0) out vec4 oColor;
layout(location = 1) out vec4 oGlow;

float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
int flagsAt(ivec2 p){
  if(p.x < 0 || p.y < 0 || p.x >= int(uSize.x) || p.y >= int(uSize.y)) return 0;
  return int(texelFetch(uSim, p, 0).a * 255.0 + 0.5);
}
void main(){
  ivec2 p = ivec2(gl_FragCoord.xy);
  p.y = int(uSize.y) - 1 - p.y;
  vec4 c = texelFetch(uSim, p, 0) * 255.0;
  int m = int(c.r + 0.5), shade = int(c.g + 0.5), fl = int(c.a + 0.5);
  float life = c.b;
  float fy = float(p.y) / uSize.y;
  vec3 bg = mix(vec3(0.102, 0.110, 0.200), vec3(0.043, 0.047, 0.086), fy);
  // A sparse, slowly twinkling star field in the empty sky.
  float h = hash(vec2(p));
  if(h > 0.9965) bg += vec3(0.10, 0.10, 0.16) * (0.6 + 0.4 * sin(uTime * 1.3 + h * 90.0)) * (1.0 - fy);
  vec3 glow = vec3(0.0);
  if(m == 0){ oColor = vec4(bg, 1.0); oGlow = vec4(0.0); return; }

  vec3 col = texelFetch(uPal, ivec2(shade >> 6, m), 0).rgb;
  float flick = hash(vec2(p) + floor(uTime * 18.0));
  if(m == ${M.FIRE}){
    float t = clamp(life / 32.0, 0.0, 1.0);
    col = mix(vec3(0.75, 0.12, 0.04), vec3(1.0, 0.92, 0.45), t * 0.75 + flick * 0.25);
    glow = col * 1.3;
  } else if(m == ${M.LAVA}){
    float n = 0.5 + 0.5 * sin(uTime * 1.7 + float(p.x) * 0.23 + float(p.y) * 0.31 + float(shade) * 0.03);
    col *= 0.82 + 0.35 * n;
    glow = col * 0.9;
  } else if(m == ${M.WATER} || m == ${M.OIL} || m == ${M.ACID} || m == ${M.NITRO}){
    col *= 0.93 + 0.07 * sin(uTime * 2.6 + float(p.x) * 0.45 + float(p.y) * 0.7);
    col = mix(bg, col, m == ${M.OIL} ? 0.95 : 0.84);
    if(m == ${M.ACID}) glow = col * 0.35;
  } else if(m == ${M.SMOKE} || m == ${M.STEAM}){
    col = mix(bg, col, clamp(life / 90.0, 0.12, 0.85));
  } else if(m == ${M.GAS}){
    col = mix(bg, col, 0.4);
  } else if(m == ${M.GLASS} || m == ${M.ICE}){
    col = mix(bg, col, m == ${M.GLASS} ? 0.5 : 0.8);
  } else if(m == ${M.TAP}){
    col *= 0.9 + 0.1 * sin(uTime * 6.0);
  } else if(m == ${M.BATTERY}){
    if(mod(life, 40.0) < 4.0){ col = mix(col, vec3(1.0, 0.95, 0.6), 0.6); glow = col * 0.6; }
  }
  // A spark running through metal or water (life 1-3).
  if((m == ${M.METAL} || m == ${M.WATER}) && life >= 0.5 && life < 3.5){
    col = mix(col, m == ${M.METAL} ? vec3(1.0, 0.96, 0.55) : vec3(0.75, 0.95, 1.0), 0.85);
    glow = col * 1.2;
  }
  if((fl & 4) != 0){
    col = mix(col, vec3(1.0, 0.42 + 0.4 * flick, 0.08), 0.55 + 0.35 * flick);
    glow = col * 0.9;
  }
  if((fl & 16) != 0){
    // Rigid body: darken its outline so objects read as objects.
    int edge = 0;
    edge += (flagsAt(p + ivec2(1, 0)) & 16) == 0 ? 1 : 0;
    edge += (flagsAt(p - ivec2(1, 0)) & 16) == 0 ? 1 : 0;
    edge += (flagsAt(p + ivec2(0, 1)) & 16) == 0 ? 1 : 0;
    edge += (flagsAt(p - ivec2(0, 1)) & 16) == 0 ? 1 : 0;
    if(edge > 0) col *= 0.68;
  }
  if((fl & 32) != 0) col = mix(col, vec3(1.0), 0.3 + 0.2 * sin(uTime * 9.0));
  oColor = vec4(col, 1.0);
  oGlow = vec4(glow, 1.0);
}`;

const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uDir;
in vec2 vUv;
out vec4 o;
void main(){
  vec4 s = texture(uTex, vUv) * 0.227;
  s += (texture(uTex, vUv + uDir * 1.38) + texture(uTex, vUv - uDir * 1.38)) * 0.316;
  s += (texture(uTex, vUv + uDir * 3.23) + texture(uTex, vUv - uDir * 3.23)) * 0.070;
  o = s;
}`;

const SCREEN_FS = `#version 300 es
precision highp float;
uniform sampler2D uColor;
uniform sampler2D uGlow;
uniform float uGlowAmt;
uniform float uCrt;
uniform vec2 uSim;
uniform vec2 uOut;
in vec2 vUv;
out vec4 o;
void main(){
  vec3 col = texture(uColor, vUv).rgb;
  col += texture(uGlow, vUv).rgb * uGlowAmt;
  if(uCrt > 0.0){
    // Scanline per simulation row and a soft vignette.
    float row = fract(vUv.y * uSim.y);
    col *= mix(1.0, 0.78 + 0.22 * smoothstep(0.0, 0.35, row) * smoothstep(1.0, 0.65, row), uCrt);
    vec2 d = vUv - 0.5;
    col *= 1.0 - dot(d, d) * 0.55 * uCrt;
  }
  o = vec4(col, 1.0);
}`;

function compile(gl, type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function program(gl, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VS));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for(let i = 0; i < n; i++){ const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return { p, u };
}
function texture(gl, w, h, filter, data){
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function target(gl, ...texs){
  const f = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  texs.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
  gl.drawBuffers(texs.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return f;
}

export class Renderer {
  constructor(canvas, w, h, palette){
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if(!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas; this.w = w; this.h = h;
    this.glow = true; this.crt = false;
    this.cell = program(gl, CELL_FS);
    this.blur = program(gl, BLUR_FS);
    this.screen = program(gl, SCREEN_FS);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.sim = texture(gl, w, h, gl.NEAREST);
    this.pal = texture(gl, 4, palette.length / 16, gl.NEAREST, palette);
    this.color = texture(gl, w, h, gl.NEAREST);
    this.glowTex = texture(gl, w, h, gl.LINEAR);
    this.cellFbo = target(gl, this.color, this.glowTex);
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.half = [hw, hh];
    this.ping = texture(gl, hw, hh, gl.LINEAR);
    this.pong = texture(gl, hw, hh, gl.LINEAR);
    this.pingFbo = target(gl, this.ping);
    this.pongFbo = target(gl, this.pong);
  }

  /** Upload rows y0..y1 of the view buffer. */
  upload(view, y0, y1){
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sim);
    const row = this.w * 4;
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, y0, this.w, y1 - y0 + 1, gl.RGBA, gl.UNSIGNED_BYTE, view.subarray(y0 * row, (y1 + 1) * row));
  }

  draw(time){
    const gl = this.gl;
    // 1. cells
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cellFbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.useProgram(this.cell.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sim);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(this.cell.u.uSim, 0);
    gl.uniform1i(this.cell.u.uPal, 1);
    gl.uniform1f(this.cell.u.uTime, time);
    gl.uniform2f(this.cell.u.uSize, this.w, this.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // 2. glow blur at half resolution
    if(this.glow){
      const [hw, hh] = this.half;
      gl.viewport(0, 0, hw, hh);
      gl.useProgram(this.blur.p);
      gl.uniform1i(this.blur.u.uTex, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo);
      gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
      gl.uniform2f(this.blur.u.uDir, 1 / this.w, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pongFbo);
      gl.bindTexture(gl.TEXTURE_2D, this.ping);
      gl.uniform2f(this.blur.u.uDir, 0, 1 / hh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pingFbo);
      gl.bindTexture(gl.TEXTURE_2D, this.pong);
      gl.uniform2f(this.blur.u.uDir, 2 / hw, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.pongFbo);
      gl.bindTexture(gl.TEXTURE_2D, this.ping);
      gl.uniform2f(this.blur.u.uDir, 0, 2 / hh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 3. screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.screen.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.color);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.pong);
    gl.uniform1i(this.screen.u.uColor, 0);
    gl.uniform1i(this.screen.u.uGlow, 1);
    gl.uniform1f(this.screen.u.uGlowAmt, this.glow ? 0.9 : 0);
    gl.uniform1f(this.screen.u.uCrt, this.crt ? 1 : 0);
    gl.uniform2f(this.screen.u.uSim, this.w, this.h);
    gl.uniform2f(this.screen.u.uOut, this.canvas.width, this.canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
