// A meme's picture. Emoji are drawn on this device with its own emoji font (in the same 512 px
// layout the masks were measured on), so no emoji artwork is hosted; everything else is the
// image file next to its meme.json.
function glyphCanvas(glyph) {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.font = '430px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, 256, 270);
  c.naturalWidth = 512; c.naturalHeight = 512;
  return c;
}
// → a drawable with naturalWidth/naturalHeight (canvas or <img>)
export function memeImage(m) {
  if (m.source.glyph) return Promise.resolve(glyphCanvas(m.source.glyph));
  const im = new Image(); im.src = `${m.dir}img.webp`;
  return im.decode().then(() => im);
}
// → a URL for an <img> element
export function memePictureURL(m) {
  return m.source.glyph ? glyphCanvas(m.source.glyph).toDataURL('image/png') : `${m.dir}img.webp`;
}
