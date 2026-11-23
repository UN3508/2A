/* Vẽ đảo nông trại isometric bằng SVG (kiểu gạch nhựa lắp ghép) */
window.Farm = (function () {
  'use strict';
  const HW = 32, HH = 16, T = 14; // nửa rộng ô, nửa cao ô, độ dày gạch

  /* Bản đồ đảo:  . trống  g cỏ  p lối đi  H nền nhà  T cây
     c ô cà rốt  t ô cà chua  b ô cải thảo  d ô vịt  w nước ao */
  const MAP = [
    '..ggpggg..',
    '.gHHpgccc.',
    'gTHHpggggg',
    'ggggpgtttg',
    'pppppppppg',
    'ggggpggggg',
    'gbbbpgdddw',
    'Tgggpgwwww',
    '.ggTpgggg.',
    '..ggpgg...'
  ];
  const W = MAP[0].length, H = MAP.length;

  const C = {
    grass: { t: '#7fcf55', l: '#5cab3b', r: '#4a922e' },
    grassStud: { t: '#93dc68', l: '#62b142' },
    path: { t: '#fbfaf4', l: '#dedbd0', r: '#c6c2b5' },
    soil: { t: '#a5733f', l: '#85582f', r: '#6e4624' },
    ridge: { t: '#bd8650', l: '#946235', r: '#7d522b' },
    water: { t: '#4db2f7', l: '#3593d8', r: '#2a7cbc' },
    under: [
      { l: '#a0703f', r: '#875c33' },
      { l: '#8e6137', r: '#764f2c' },
      { l: '#7c5330', r: '#654225' },
      { l: '#6a4628', r: '#54371f' }
    ],
    wall: { t: '#ffffff', l: '#f3efe6', r: '#ddd7c9' },
    roof: { t: '#ea4636', l: '#c9322a', r: '#ab2720' },
    roofStud: { t: '#f2675a', l: '#c9322a' },
    trunk: { t: '#a8703f', l: '#8d5c31', r: '#764c28' },
    leaf: [
      { t: '#56bb48', l: '#40a034', r: '#348a2a' },
      { t: '#63c652', l: '#4aa93b', r: '#3c922f' },
      { t: '#72d05f', l: '#55b345', r: '#459b37' }
    ],
    leafStud: { t: '#84da70', l: '#55b345' },
    cloud: { t: '#ffffff', l: '#e6f0fa', r: '#cfdff0' },
    cloudStud: { t: '#ffffff', l: '#dbe8f5' }
  };

  const f = n => Math.round(n * 10) / 10;
  function P(x, y, z) { z = z || 0; return [(x - y) * HW, (x + y) * HH - z]; }
  function pts(a) { return a.map(p => f(p[0]) + ',' + f(p[1])).join(' '); }
  const EDGE = 'stroke="rgba(45,30,20,.28)" stroke-width="1" stroke-linejoin="round"';
  function poly(a, fill, extra) { return '<polygon points="' + pts(a) + '" fill="' + fill + '" ' + (extra === undefined ? EDGE : extra) + '/>'; }
  function box(x, y, z, w, d, h, c) {
    return poly([P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)], c.l) +
      poly([P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)], c.r) +
      poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], c.t);
  }
  function stud(x, y, z, c, r, h) {
    r = r || 6; h = h || 4;
    const p = P(x, y, z), sx = p[0], sy = p[1], ry = r / 2;
    return '<path d="M' + f(sx - r) + ',' + f(sy - h) + 'V' + f(sy) + 'A' + r + ',' + ry + ' 0 0 0 ' + f(sx + r) + ',' + f(sy) +
      'V' + f(sy - h) + 'A' + r + ',' + ry + ' 0 0 1 ' + f(sx - r) + ',' + f(sy - h) + 'Z" fill="' + c.l + '" ' + EDGE + '/>' +
      '<ellipse cx="' + f(sx) + '" cy="' + f(sy - h) + '" rx="' + r + '" ry="' + ry + '" fill="' + c.t + '" ' + EDGE + '/>';
  }

  function cell(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const ch = MAP[y][x];
    return ch === '.' ? null : ch;
  }
  function matOf(ch) {
    if ('ctb'.indexOf(ch) >= 0) return 'soil';
    if ('dw'.indexOf(ch) >= 0) return 'water';
    if (ch === 'p') return 'path';
    return 'grass';
  }
  function topOf(ch) {
    const m = matOf(ch);
    return m === 'soil' ? 4 : m === 'water' ? -4 : 0;
  }

  /* Các ô có thể liên kết với môn học */
  const TYPE_OF = { c: 'carrot', t: 'tomato', b: 'cabbage', d: 'duck' };
  const SLOTS = [];
  (function () {
    const cnt = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const type = TYPE_OF[MAP[y][x]];
      if (type) { cnt[type] = (cnt[type] || 0) + 1; SLOTS.push({ id: type + '-' + cnt[type], type: type, x: x, y: y, n: cnt[type] }); }
    }
  })();
  const slotById = {};
  SLOTS.forEach(s => { slotById[s.id] = s; });

  /* ---------- Phần tĩnh: đáy đảo, mặt đất, thác nước ---------- */
  function cellsSorted(set) {
    return Array.from(set).map(k => k.split(',').map(Number)).sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
  }
  function buildUnder() {
    let prev = new Set();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cell(x, y)) prev.add(x + ',' + y);
    const layers = [];
    for (let k = 1; k <= 4; k++) {
      const cur = new Set();
      prev.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        if (prev.has((x + 1) + ',' + y) && prev.has((x - 1) + ',' + y) && prev.has(x + ',' + (y + 1)) && prev.has(x + ',' + (y - 1))) cur.add(key);
      });
      if (!cur.size) break;
      layers.push(cur); prev = cur;
    }
    let s = '';
    for (let k = layers.length; k >= 1; k--) {
      const S = layers[k - 1], c = C.under[k - 1], LT = 26, zb = -T - k * LT, zt = zb + LT;
      cellsSorted(S).forEach(([x, y]) => {
        if (!S.has(x + ',' + (y + 1))) s += poly([P(x, y + 1, zt), P(x + 1, y + 1, zt), P(x + 1, y + 1, zb), P(x, y + 1, zb)], c.l);
        if (!S.has((x + 1) + ',' + y)) s += poly([P(x + 1, y, zt), P(x + 1, y + 1, zt), P(x + 1, y + 1, zb), P(x + 1, y, zb)], c.r);
      });
    }
    return s;
  }

  function faceY(x, y, zb, zt, c) { return poly([P(x, y + 1, zt), P(x + 1, y + 1, zt), P(x + 1, y + 1, zb), P(x, y + 1, zb)], c.l); }
  function faceX(x, y, zb, zt, c) { return poly([P(x + 1, y, zt), P(x + 1, y + 1, zt), P(x + 1, y + 1, zb), P(x + 1, y, zb)], c.r); }
  function sideFaces(x, y, ch, fn, zb, zt) {
    const m = matOf(ch);
    if (m === 'grass' || m === 'path') return fn(x, y, zb, zt, C[m]);
    let s = '';
    const g0 = zb, g1 = Math.min(zt, 0);
    if (g1 > g0) s += fn(x, y, g0, g1, C.grass);
    const m0 = Math.max(zb, 0);
    if (m === 'soil' && zt > m0) s += fn(x, y, m0, zt, C.soil);
    return s;
  }

  function tile(x, y, ch) {
    const m = matOf(ch), top = topOf(ch), M = C[m];
    let s = '';
    const n1 = cell(x, y + 1), b1 = n1 ? topOf(n1) : -T;
    const n2 = cell(x + 1, y), b2 = n2 ? topOf(n2) : -T;
    if (b1 < top) s += sideFaces(x, y, ch, faceY, b1, top);
    if (b2 < top) s += sideFaces(x, y, ch, faceX, b2, top);
    s += poly([P(x, y, top), P(x + 1, y, top), P(x + 1, y + 1, top), P(x, y + 1, top)], M.t);

    if (ch === 'g') {
      [[.25, .25], [.75, .25], [.25, .75], [.75, .75]].forEach(([u, v]) => { s += stud(x + u, y + v, top, C.grassStud); });
    } else if (ch === 'T') {
      [[.25, .75], [.75, .25], [.75, .75]].forEach(([u, v]) => { s += stud(x + u, y + v, top, C.grassStud); });
    } else if (ch === 'p') {
      s += poly([P(x + .1, y + .1, top), P(x + .9, y + .1, top), P(x + .9, y + .9, top), P(x + .1, y + .9, top)], 'none', 'stroke="rgba(0,0,0,.07)" stroke-width="1"');
    } else if (ch === 'c') { // cà rốt: 2 luống dài, hẹp
      s += box(x + .08, y + .22, top, .84, .16, 3, C.ridge);
      s += box(x + .08, y + .62, top, .84, .16, 3, C.ridge);
    } else if (ch === 'b') { // cải thảo: 2 ụ đất vuông
      s += box(x + .1, y + .54, top, .36, .36, 3, C.ridge);
      s += box(x + .54, y + .1, top, .36, .36, 3, C.ridge);
    } else if (ch === 't') { // cà chua: hố trồng tròn
      const c = P(x + .5, y + .5, top);
      s += '<ellipse cx="' + f(c[0]) + '" cy="' + f(c[1]) + '" rx="14" ry="7" fill="#8a5c31" stroke="rgba(45,30,20,.25)"/>';
    } else if (m === 'water') {
      const off = ((x * 7 + y * 3) % 5) * 0.06;
      [[.18 + off, .32], [.42 - off / 2, .72]].forEach(([u, v], i) => {
        const a = P(x + u, y + v, top), b = P(x + u + .26, y + v, top);
        s += '<line class="ripple" x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) +
          '" style="animation-delay:-' + ((x * 3 + y * 5 + i * 2) % 6) + 's"/>';
      });
    }
    return s;
  }

  function buildGround() {
    const list = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (cell(x, y)) list.push([x, y]);
    list.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0]);
    return list.map(([x, y]) => tile(x, y, cell(x, y))).join('');
  }

  function buildWaterfall() {
    const x = 10, y0 = 7.24, y1 = 7.76, zt = -4, zb = -150;
    let s = poly([P(x, y0, zt), P(x, y1, zt), P(x, y1, zb), P(x, y0, zb)], 'url(#wfGrad)', 'stroke="none"');
    [7.33, 7.5, 7.67].forEach((y, i) => {
      const a = P(x, y, zt - 2), b = P(x, y, zb + 24);
      s += '<line class="wf-line" x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" style="animation-delay:-' + (i * 0.4) + 's"/>';
    });
    const lip = P(x, 7.5, zt);
    s += '<ellipse cx="' + f(lip[0]) + '" cy="' + f(lip[1] + 1) + '" rx="9" ry="3" fill="#bfe6ff" opacity=".9"/>';
    const m = P(x, 7.5, zb + 18);
    [[-8, 0, 7], [6, 3, 6], [0, 8, 8]].forEach(([dx, dy, r], i) => {
      s += '<circle class="mist" cx="' + f(m[0] + dx) + '" cy="' + f(m[1] + dy) + '" r="' + r + '" style="animation-delay:-' + i + 's"/>';
    });
    return s;
  }

  /* ---------- Vật thể: nhà, cây ---------- */
  const WINDOWS = [
    [P(2.3, 2.95, 12), P(2.8, 2.95, 12), P(2.8, 2.95, 26), P(2.3, 2.95, 26)],
    [P(3.2, 2.95, 12), P(3.7, 2.95, 12), P(3.7, 2.95, 26), P(3.2, 2.95, 26)],
    [P(3.95, 1.3, 12), P(3.95, 1.8, 12), P(3.95, 1.8, 26), P(3.95, 1.3, 26)]
  ];
  function windowShape(q, fill) {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const t = mid(q[3], q[2]), b = mid(q[0], q[1]), l = mid(q[0], q[3]), r = mid(q[1], q[2]);
    return poly(q, fill, 'stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"') +
      '<path d="M' + f(t[0]) + ',' + f(t[1]) + 'L' + f(b[0]) + ',' + f(b[1]) + 'M' + f(l[0]) + ',' + f(l[1]) + 'L' + f(r[0]) + ',' + f(r[1]) + '" stroke="#ffffff" stroke-width="1.6"/>';
  }
  function house() {
    let s = box(2.05, 1.05, 0, 1.9, 1.9, 34, C.wall);
    // cửa ra lối đi
    s += poly([P(3.95, 2.15, 0), P(3.95, 2.7, 0), P(3.95, 2.7, 22), P(3.95, 2.15, 22)], '#9a6434');
    const k = P(3.95, 2.62, 11);
    s += '<circle cx="' + f(k[0]) + '" cy="' + f(k[1]) + '" r="1.4" fill="#ffd54f"/>';
    WINDOWS.forEach(q => { s += windowShape(q, '#bfe6ff'); });
    // mái đỏ
    const xa = 1.92, xb = 4.08, ya = .92, yb = 3.08, ym = 2, zb = 34, zr = 60;
    s += poly([P(xa, ya, zb), P(xb, ya, zb), P(xb, ym, zr), P(xa, ym, zr)], C.roof.l);
    s += box(2.4, 1.3, 40, .28, .28, 28, { t: '#f3efe6', l: '#ddd7c9', r: '#c9c1b0' });
    s += poly([P(3.95, 1.05, 34), P(3.95, 2, 58), P(3.95, 2.95, 34)], C.wall.r);
    s += poly([P(xb, ya, zb), P(xb, ym, zr), P(xb, ym, zr - 4), P(xb, ya, zb - 4)], C.roof.r);
    s += poly([P(xa, ym, zr), P(xb, ym, zr), P(xb, yb, zb), P(xa, yb, zb)], C.roof.t);
    [.25, .5, .75].forEach(q => {
      const a = P(xa + .02, ym + q * (yb - ym), zr - q * (zr - zb)), b = P(xb - .02, ym + q * (yb - ym), zr - q * (zr - zb));
      s += '<line x1="' + f(a[0]) + '" y1="' + f(a[1]) + '" x2="' + f(b[0]) + '" y2="' + f(b[1]) + '" stroke="rgba(120,20,15,.35)" stroke-width="1.2"/>';
    });
    s += poly([P(xb, ym, zr), P(xb, yb, zb), P(xb, yb, zb - 4), P(xb, ym, zr - 4)], C.roof.r);
    s += poly([P(xa, yb, zb), P(xb, yb, zb), P(xb, yb, zb - 4), P(xa, yb, zb - 4)], C.roof.l);
    [2.3, 2.75, 3.2, 3.65].forEach(x => { s += stud(x, ym, zr, C.roofStud, 4.5, 3); });
    return s;
  }
  function tree(x, y) {
    let s = box(x + .42, y + .42, 0, .16, .16, 14, C.trunk);
    s += box(x + .12, y + .12, 12, .76, .76, 14, C.leaf[0]);
    s += box(x + .2, y + .2, 26, .6, .6, 12, C.leaf[1]);
    s += box(x + .3, y + .3, 38, .4, .4, 10, C.leaf[2]);
    s += stud(x + .5, y + .5, 48, C.leafStud, 5, 3);
    return s;
  }

  /* ---------- Cây trồng và vịt theo bước phát triển ---------- */
  function leaf(bx, by, ang, len, w, fill, stroke) {
    const tx = bx + Math.sin(ang) * len, ty = by - Math.cos(ang) * len;
    const mx = (bx + tx) / 2, my = (by + ty) / 2, px = Math.cos(ang) * w, py = Math.sin(ang) * w;
    return '<path d="M' + f(bx) + ',' + f(by) + 'Q' + f(mx + px) + ',' + f(my + py) + ' ' + f(tx) + ',' + f(ty) +
      'Q' + f(mx - px) + ',' + f(my - py) + ' ' + f(bx) + ',' + f(by) + 'Z" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1"/>';
  }
  function seed(sx, sy) {
    return '<ellipse cx="' + f(sx) + '" cy="' + f(sy) + '" rx="4" ry="2" fill="#6d4422"/>' +
      '<ellipse cx="' + f(sx) + '" cy="' + f(sy - 1.5) + '" rx="1.8" ry="1.3" fill="#f3dfb5" stroke="#8d6e46" stroke-width=".6"/>';
  }
  function carrot(sx, sy, st) {
    if (st === 0) return seed(sx, sy);
    const n = [0, 2, 3, 5, 6][st], L = [0, 6, 10, 14, 17][st];
    let s = '';
    if (st >= 3) {
      const r = st === 3 ? 3.4 : 4.8;
      s += '<ellipse cx="' + f(sx) + '" cy="' + f(sy - 1) + '" rx="' + r + '" ry="' + f(r * .75) + '" fill="#ff8a1f" stroke="#c75000" stroke-width="1"/>';
    }
    for (let i = 0; i < n; i++) {
      const a = -0.75 + 1.5 * i / (n - 1);
      s += leaf(sx, sy - 2, a, L * (1 - Math.abs(a) * .22), 2.2, '#4caf50', '#2e7d32');
    }
    return s;
  }
  function stake(sx, sy) {
    return '<rect x="' + f(sx + 6) + '" y="' + f(sy - 42) + '" width="3.4" height="42" rx="1" fill="#c9a06f" stroke="#8a6440" stroke-width="1"/>' +
      '<ellipse cx="' + f(sx + 7.7) + '" cy="' + f(sy - 42) + '" rx="1.7" ry=".9" fill="#dcb98c"/>';
  }
  function tomato(sx, sy, st) {
    if (st === 0) return seed(sx, sy);
    const Hh = [0, 9, 18, 27, 34][st], pairs = [0, 1, 2, 3, 4][st];
    let s = '<path d="M' + f(sx) + ',' + f(sy) + 'Q' + f(sx - 2.5) + ',' + f(sy - Hh / 2) + ' ' + f(sx + 1) + ',' + f(sy - Hh) +
      '" stroke="#3d8b37" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    for (let i = 0; i < pairs; i++) {
      const yy = sy - Hh * (i + 0.8) / (pairs + 0.4), sz = 4.5 + st * .7;
      s += leaf(sx - .5, yy, -1.05, sz, 2.6, '#4caf50', '#2e7d32') + leaf(sx - .5, yy, 1.05, sz, 2.6, '#55b84f', '#2e7d32');
      if (i % 2 === 1) s += '<line x1="' + f(sx) + '" y1="' + f(yy) + '" x2="' + f(sx + 7) + '" y2="' + f(yy - 1) + '" stroke="#f5e6c8" stroke-width="1.2"/>';
    }
    s += leaf(sx + 1, sy - Hh + 1, 0, 5 + st * .4, 2.6, '#5cc055', '#2e7d32');
    const fruit = (x, y, r, c, s2) => '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + r + '" fill="' + c + '" stroke="' + s2 + '" stroke-width="1"/>' +
      '<circle cx="' + f(x - r * .35) + '" cy="' + f(y - r * .35) + '" r="' + f(r * .3) + '" fill="#fff" opacity=".55"/>' +
      '<path d="M' + f(x - 1.8) + ',' + f(y - r + .3) + 'L' + f(x) + ',' + f(y - r - 1.2) + 'L' + f(x + 1.8) + ',' + f(y - r + .3) + '" stroke="#2e7d32" stroke-width="1.1" fill="none"/>';
    if (st === 3) {
      s += fruit(sx - 6, sy - Hh * .45, 2.8, '#a5d66b', '#689f38') + fruit(sx + 4.5, sy - Hh * .62, 2.8, '#a5d66b', '#689f38');
    } else if (st === 4) {
      [[-7, .35], [5.5, .5], [-5, .72], [3, .22]].forEach(([dx, q]) => { s += fruit(sx + dx, sy - Hh * q, 3.7, '#e53935', '#a3201c'); });
    }
    return s;
  }
  function cabbage(sx, sy, st) {
    if (st === 0) return seed(sx, sy);
    let s = '';
    if (st <= 2) {
      const n = st === 1 ? 3 : 5, len = st === 1 ? 7 : 11, w = st === 1 ? 3 : 4.6;
      for (let i = 0; i < n; i++) { const a = -1.1 + 2.2 * i / (n - 1); s += leaf(sx, sy, a, len, w, i % 2 ? '#9ccc65' : '#8bc34a', '#558b2f'); }
      return s;
    }
    const rx = st === 3 ? 6.2 : 8.6, ry = st === 3 ? 8.5 : 13, cy = sy - ry + 1.5;
    s += leaf(sx - 2, sy, -1.0, ry * 1.1, 4.2, '#7cb342', '#4e7d2a') + leaf(sx + 2, sy, 1.0, ry * 1.1, 4.2, '#7cb342', '#4e7d2a');
    s += '<ellipse cx="' + f(sx) + '" cy="' + f(cy) + '" rx="' + rx + '" ry="' + ry + '" fill="url(#cabbageGrad)" stroke="#6f9f3a" stroke-width="1.1"/>';
    s += '<path d="M' + f(sx) + ',' + f(sy - 1) + 'Q' + f(sx - rx * .5) + ',' + f(cy) + ' ' + f(sx - rx * .15) + ',' + f(cy - ry * .85) +
      'M' + f(sx + 1) + ',' + f(sy - 1) + 'Q' + f(sx + rx * .55) + ',' + f(cy) + ' ' + f(sx + rx * .3) + ',' + f(cy - ry * .8) + '" stroke="#9fc96a" stroke-width="1" fill="none"/>';
    s += leaf(sx - 1, sy, -.45, ry * .95, rx * .45, '#8bc34a', '#5b8f2f');
    return s;
  }
  function duck(sx, sy, st, idx) {
    let s = '<ellipse class="ring" cx="' + f(sx) + '" cy="' + f(sy + 1) + '" rx="15" ry="5" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2"/>';
    if (st === 0) {
      return s + '<ellipse cx="' + f(sx) + '" cy="' + f(sy - 1) + '" rx="10" ry="4.5" fill="#b08a62" stroke="#6d4c41" stroke-width="1.2"/>' +
        '<ellipse cx="' + f(sx) + '" cy="' + f(sy - 3) + '" rx="7" ry="2.6" fill="#8d6e4b"/>' +
        '<ellipse cx="' + f(sx) + '" cy="' + f(sy - 6) + '" rx="3.8" ry="4.8" fill="#fffaf0" stroke="#bfb29a" stroke-width="1"/>';
    }
    const sc = [0, .52, .68, .84, 1.04][st];
    const body = st <= 2 ? '#ffd84d' : st === 3 ? '#fff4c9' : '#ffffff';
    const wing = st <= 2 ? '#f2bd25' : st === 3 ? '#efe0a8' : '#e1e7ee';
    const hr = st <= 2 ? 6.6 : 5.6;
    const k = '#5d4037';
    s += '<g class="bob" style="animation-delay:-' + (idx * .9) + 's"><g transform="translate(' + f(sx) + ',' + f(sy - 1) + ') scale(' + sc + ')">' +
      '<path d="M-11,-6 L-18,-13 L-8,-9 Z" fill="' + body + '" stroke="' + k + '" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<ellipse cx="0" cy="-6" rx="12.5" ry="7.5" fill="' + body + '" stroke="' + k + '" stroke-width="1.3"/>' +
      '<ellipse cx="-2" cy="-7" rx="7" ry="4" fill="' + wing + '" stroke="' + k + '" stroke-width=".9"/>' +
      '<circle cx="8.5" cy="-15" r="' + hr + '" fill="' + body + '" stroke="' + k + '" stroke-width="1.3"/>' +
      '<path d="M' + (8 + hr - 1) + ',-16.5 L' + (8 + hr + 5.5) + ',-14.5 L' + (8 + hr - 1) + ',-12.5 Z" fill="#ff9800" stroke="#c66900" stroke-width="1" stroke-linejoin="round"/>' +
      '<circle cx="10" cy="-16.5" r="1.3" fill="#222"/>' +
      '</g></g>';
    return s;
  }

  function plantSVG(sl, stage) {
    const top = topOf(MAP[sl.y][sl.x]);
    const x = sl.x, y = sl.y;
    if (sl.type === 'carrot') {
      return [[.3, .3], [.7, .3], [.3, .7], [.7, .7]].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]) || a[0] - b[0])
        .map(([u, v]) => { const p = P(x + u, y + v, top + 3); return carrot(p[0], p[1], stage); }).join('');
    }
    if (sl.type === 'cabbage') {
      return [[.28, .72], [.72, .28]].map(([u, v]) => { const p = P(x + u, y + v, top + 3); return cabbage(p[0], p[1], stage); }).join('');
    }
    if (sl.type === 'tomato') { const p = P(x + .5, y + .5, top); return tomato(p[0], p[1], stage); }
    const p = P(x + .5, y + .5, top);
    return duck(p[0], p[1], stage, sl.n);
  }

  /* ---------- Khởi tạo và cập nhật ---------- */
  let farmEl, overEl, objG, hitG, badgeG, fxG;
  const BADGE_Z = { carrot: 34, cabbage: 38, tomato: 54, duck: 34 };

  function init(farmSvg, overlaySvg) {
    farmEl = farmSvg; overEl = overlaySvg;
    farmEl.innerHTML =
      '<defs>' +
      '<linearGradient id="wfGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc3ff" stop-opacity=".95"/><stop offset=".65" stop-color="#a9dcff" stop-opacity=".75"/><stop offset="1" stop-color="#dff3ff" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="cabbageGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b3d87a"/><stop offset=".55" stop-color="#d8edb3"/><stop offset="1" stop-color="#f6faea"/></linearGradient>' +
      '</defs>' +
      '<g id="g-under">' + buildUnder() + '</g>' +
      '<g id="g-ground">' + buildGround() + '</g>' +
      '<g id="g-fx">' + buildWaterfall() + '</g>' +
      '<g id="g-objects"></g>';
    objG = farmEl.querySelector('#g-objects');

    let lights = '<g class="lights" aria-hidden="true">';
    const g1 = P(3, 3.4, 0), g2 = P(4.4, 1.9, 0);
    lights += '<ellipse cx="' + f(g1[0]) + '" cy="' + f(g1[1]) + '" rx="40" ry="12" fill="#ffc861" opacity=".22" filter="url(#softGlow)"/>';
    lights += '<ellipse cx="' + f(g2[0]) + '" cy="' + f(g2[1]) + '" rx="22" ry="9" fill="#ffc861" opacity=".2" filter="url(#softGlow)"/>';
    WINDOWS.forEach(q => { lights += '<g filter="url(#glow)">' + windowShape(q, '#ffd57a') + '</g>'; });
    lights += '</g>';
    overEl.innerHTML =
      '<defs>' +
      '<filter id="glow" x="-150%" y="-150%" width="400%" height="400%"><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="6"/></filter>' +
      '</defs>' + lights +
      '<g id="g-hit"></g><g id="g-badges"></g><g id="g-float"></g>';
    hitG = overEl.querySelector('#g-hit');
    badgeG = overEl.querySelector('#g-badges');
    fxG = overEl.querySelector('#g-float');
  }

  const escA = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* o: { bySlot:{slotId:{stage}}, badges:{slotId:{n,over,label}}, labels:{slotId}, selected, highlight, pop } */
  function update(o) {
    const items = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (MAP[y][x] === 'T') items.push({ d: x + y + .5, s: tree(x, y) });
    items.push({ d: 5.9, s: house() });
    SLOTS.forEach(sl => {
      const sub = o.bySlot[sl.id];
      let s = '';
      if (sl.type === 'tomato') { const p = P(sl.x + .5, sl.y + .5, topOf('t')); s += stake(p[0], p[1]); }
      if (sub) s += '<g class="plant' + (o.pop === sl.id ? ' pop' : '') + '" data-stage="' + sub.stage + '">' + plantSVG(sl, sub.stage) + '</g>';
      items.push({ d: sl.x + sl.y + .5, s: s });
    });
    items.sort((a, b) => a.d - b.d);
    objG.innerHTML = items.map(i => i.s).join('');

    let hits = '', badges = '';
    SLOTS.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y)).forEach(sl => {
      const top = topOf(MAP[sl.y][sl.x]), x = sl.x, y = sl.y, up = 46;
      const rh = [P(x, y, top), P(x + 1, y, top), P(x + 1, y + 1, top), P(x, y + 1, top)];
      const hull = [P(x, y + 1, top + up), P(x, y, top + up), P(x + 1, y, top + up), P(x + 1, y, top), P(x + 1, y + 1, top), P(x, y + 1, top)];
      const empty = !o.bySlot[sl.id];
      const cls = 'hit' + (empty ? ' empty' : '') + (o.selected === sl.id ? ' selected' : '') + (o.highlight === sl.id ? ' highlight' : '');
      const label = escA(o.labels[sl.id] || '');
      let plus = '';
      if (empty) {
        const c = P(x + .5, y + .5, top + 8);
        plus = '<g class="plus" transform="translate(' + f(c[0]) + ',' + f(c[1]) + ')"><circle r="9"/><path d="M-4,0H4M0,-4V4"/></g>';
      }
      hits += '<g class="' + cls + '" data-slot="' + sl.id + '" tabindex="0" role="button" aria-label="' + label + '"><title>' + label + '</title>' +
        '<polygon class="hit-area" points="' + pts(hull) + '"/><polygon class="hit-outline" points="' + pts(rh) + '"/>' + plus + '</g>';

      const b = o.badges[sl.id];
      if (b && b.n > 0) {
        const p = P(x + .5, y + .5, top + BADGE_Z[sl.type]);
        const txt = (b.over ? '❗' : '🔔') + ' ' + b.n;
        const w = 30 + String(b.n).length * 9;
        badges += '<g class="badge' + (b.over ? ' over' : '') + '" data-badge="' + sl.id + '" tabindex="0" role="button" aria-label="' + escA(b.label) + '" transform="translate(' + f(p[0]) + ',' + f(p[1]) + ')">' +
          '<title>' + escA(b.label) + '</title>' +
          '<path class="badge-tail" d="M-5,-3 L0,5 L5,-3 Z"/>' +
          '<rect class="badge-bg" x="' + (-w / 2) + '" y="-25" width="' + w + '" height="23" rx="11.5"/>' +
          '<text x="0" y="-8.5" text-anchor="middle">' + txt + '</text></g>';
      }
    });
    hitG.innerHTML = hits;
    badgeG.innerHTML = badges;
  }

  function floatText(slotId, text) {
    const sl = slotById[slotId]; if (!sl || !fxG) return;
    const p = P(sl.x + .5, sl.y + .5, topOf(MAP[sl.y][sl.x]) + 30);
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    el.setAttribute('x', f(p[0])); el.setAttribute('y', f(p[1]));
    el.setAttribute('text-anchor', 'middle'); el.setAttribute('class', 'float-fx');
    el.textContent = text;
    fxG.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  /* Mây ghép khối cho nền trời */
  function cloudSVG(v) {
    const shapes = [
      [[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 1]],
      [[0, 0, 0], [1, 0, 0], [1, 1, 0], [2, 1, 0], [1, 0, 1], [2, 1, 1]],
      [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
      [[0, 0, 0], [1, 0, 0], [2, 0, 0], [3, 0, 0], [1, 1, 0], [2, 1, 0], [2, 0, 1]]
    ];
    const cells = shapes[v % shapes.length].slice().sort((a, b) => a[2] - b[2] || (a[0] + a[1]) - (b[0] + b[1]));
    const set = new Set(cells.map(c => c.join(',')));
    let s = '', minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    const h = 14;
    cells.forEach(([x, y, z]) => {
      [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].forEach(([a, b]) => {
        [z * h, z * h + h + 5].forEach(zz => { const p = P(a, b, zz); minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
      });
      s += box(x, y, z * h, 1, 1, h, C.cloud);
      if (!set.has(x + ',' + y + ',' + (z + 1))) [[.3, .3], [.7, .3], [.3, .7], [.7, .7]].forEach(([u, w]) => { s += stud(x + u, y + w, z * h + h, C.cloudStud, 5, 3.5); });
    });
    const pad = 4;
    return '<svg viewBox="' + f(minX - pad) + ' ' + f(minY - pad) + ' ' + f(maxX - minX + 2 * pad) + ' ' + f(maxY - minY + 2 * pad) + '" xmlns="http://www.w3.org/2000/svg">' + s + '</svg>';
  }

  return { SLOTS: SLOTS, slot: id => slotById[id], init: init, update: update, floatText: floatText, cloudSVG: cloudSVG };
})();
