// Webcam access shared by the app and the tools.
export async function openCamera(video) {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser has no camera access.'), { name: 'NotSupportedError' });
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false,
  });
  video.srcObject = stream;
  video.muted = true; video.playsInline = true;
  await video.play();
}

export function cameraError(e) {
  const n = e?.name;
  if (n === 'NotAllowedError') return 'Camera blocked. Allow it in the address bar, then try again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No camera found.';
  if (n === 'NotReadableError') return 'The camera is busy in another app.';
  return e?.message || 'Camera failed to start.';
}

// ?delegate=cpu forces every task onto the CPU (for machines where WebGL misbehaves).
export function delegatesFromURL(q = new URLSearchParams(location.search)) {
  return (q.get('delegate') || '').toUpperCase() === 'CPU' ? { face: 'CPU', hand: 'CPU', pose: 'CPU' } : undefined;
}

// Resizes a canvas to its element at device-pixel resolution; returns CSS size and dpr.
export function fitCanvas(canvas, el = canvas) {
  const r = el.getBoundingClientRect(), dpr = devicePixelRatio || 1;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return { w: r.width, h: r.height, dpr };
}
