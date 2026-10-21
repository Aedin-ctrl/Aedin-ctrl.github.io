// 10x10 pixel-art tool icons, drawn into tiny canvases.
const C = {
  w: '#ece6d2', g: '#9a96ae', k: '#4a475f', y: '#ffd23f', o: '#ff8a1c', r: '#e8401a',
  b: '#a0683a', d: '#6e4420', c: '#7fd6ff', s: '#8a8580', p: '#ff7aa8', l: '#52c452',
};
const ICONS = {
  paint: [
    '.......ww.',
    '......wyyw',
    '.....wyyw.',
    '....wyyw..',
    '...wyyw...',
    '..dbww....',
    '.dbbd.....',
    'dbbbd.....',
    'dbbd......',
    '.dd.......',
  ],
  erase: [
    '......ww..',
    '.....wppw.',
    '....wpppw.',
    '...wpppw..',
    '..wwppw...',
    '.wwwwww...',
    'wwwwww....',
    '.wwww.....',
    '..........',
    'gggggggggg',
  ],
  fire: [
    '....o.....',
    '....oo....',
    '...ooo..o.',
    '..oyyo.oo.',
    '..oyyyooo.',
    '.oyywyyoo.',
    '.oywwwyyo.',
    '.oywwwwyo.',
    '..oyyyyo..',
    '...oooo...',
  ],
  bomb: [
    '.......yo.',
    '......y.o.',
    '.....g....',
    '...gggg...',
    '..gwggggg.',
    '.gwgggggg.',
    '.gggggggg.',
    '.gggggggg.',
    '..gggggg..',
    '...gggg...',
  ],
  grab: [
    '...w.w....',
    '..wwwww...',
    '..wwwwww..',
    '.wwwwwwww.',
    'w.wwwwwww.',
    'ww.wwwwww.',
    '.wwwwwwww.',
    '..wwwwww..',
    '...wwwww..',
    '...wwwww..',
  ],
  crate: [
    'dddddddddd',
    'dbbbbbbbbd',
    'dbdbbbbdbd',
    'dbbdbbdbbd',
    'dbbbddbbbd',
    'dbbbddbbbd',
    'dbbdbbdbbd',
    'dbdbbbbdbd',
    'dbbbbbbbbd',
    'dddddddddd',
  ],
  ball: [
    '...gggg...',
    '.gggggggg.',
    '.gwwggggg.',
    'ggwgggggkg',
    'gggggggggk',
    'gggggggggk',
    'gggggggkkg',
    '.ggggggkk.',
    '.gggkkkkk.',
    '...gkkk...',
  ],
  plank: [
    '..........',
    '..........',
    '..........',
    'dddddddddd',
    'bbbbbbbbbb',
    'bdbbbbdbbb',
    'dddddddddd',
    '..........',
    '..........',
    '..........',
  ],
  boulder: [
    '..........',
    '...sss....',
    '..sssss...',
    '.ssgssssk.',
    'ssgsssssk.',
    'sssssssskk',
    'ssssssskk.',
    '.sssskkkk.',
    '..skkkk...',
    '..........',
  ],
  tri: [
    '....bb....',
    '....bb....',
    '...bbbb...',
    '...bbbb...',
    '..bbbbbb..',
    '..bbbbbb..',
    '.bbbbbbbb.',
    '.bbbbbbbb.',
    'bbbbbbbbbb',
    'dddddddddd',
  ],
  rope: [
    'gg........',
    'gkg.......',
    '.gkg......',
    '..gg.bb...',
    '....bddb..',
    '....bddb..',
    '.....bb.gg',
    '.......gkg',
    '.......gkg',
    '........gg',
  ],
  pin: [
    '....rr....',
    '...rrrr...',
    '...rwrr...',
    '...rrrr...',
    '....rr....',
    '....gg....',
    '....gg....',
    '....gg....',
    '....g.....',
    '....g.....',
  ],
  draw: [
    'c.c.c.c...',
    '.......y..',
    'c.....yyy.',
    '.....yyy..',
    'c...yyy..c',
    '...yyy....',
    'c.wyy....c',
    '.ww.......',
    'kw.......c',
    '..c.c.c...',
  ],
};

export function iconCanvas(name){
  const rows = ICONS[name];
  const cv = document.createElement('canvas');
  cv.width = 10; cv.height = 10;
  const g = cv.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if(C[ch]){ g.fillStyle = C[ch]; g.fillRect(x, y, 1, 1); }
  }));
  return cv;
}

/** A 4x4 swatch showing a material's colour variants. */
export function swatch(palette, mat){
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 4;
  const g = cv.getContext('2d');
  const img = g.createImageData(4, 4);
  const order = [0, 1, 2, 0, 1, 3, 0, 2, 2, 0, 1, 3, 0, 1, 0, 2];
  for(let i = 0; i < 16; i++){
    const o = (mat * 4 + order[i]) * 4;
    img.data.set([palette[o], palette[o + 1], palette[o + 2], 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  return cv;
}
