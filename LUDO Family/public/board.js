/**
 * LUDO Family - Board renderer
 * Visual style matched to classic plastic Ludo board reference
 * (wood frame, thick color yards, white cross, triangle center, circular 3D tokens).
 */

const BOARD = {
  N: 15,
  COLORS: {
    green:  { main: '#43a047', dark: '#2e7d32', light: '#66bb6a', token: '#4caf50', mid: '#388e3c', hole: '#1b5e20' },
    red:    { main: '#e53935', dark: '#c62828', light: '#ef5350', token: '#f44336', mid: '#d32f2f', hole: '#7f1010' },
    blue:   { main: '#1e88e5', dark: '#1565c0', light: '#42a5f5', token: '#2196f3', mid: '#1976d2', hole: '#0d47a1' },
    yellow: { main: '#fdd835', dark: '#f9a825', light: '#ffee58', token: '#ffc107', mid: '#fbc02d', hole: '#f57f17' }
  }
};

/**
 * Canonical 52-cell main path [col, row], index 0 = GREEN START (1,6).
 * Clockwise around the cross.
 */
function buildCanonicalPath() {
  const p = [];
  for (let c = 1; c <= 5; c++) p.push([c, 6]);           // 0-4  green start strip
  for (let r = 5; r >= 1; r--) p.push([6, r]);            // 5-9
  p.push([6, 0], [7, 0], [8, 0]);                         // 10-12
  for (let r = 1; r <= 5; r++) p.push([8, r]);            // 13-17 red start = 13
  for (let c = 9; c <= 13; c++) p.push([c, 6]);           // 18-22
  p.push([14, 6], [14, 7], [14, 8]);                      // 23-25
  for (let c = 13; c >= 9; c--) p.push([c, 8]);           // 26-30 blue start = 26
  for (let r = 9; r <= 13; r++) p.push([8, r]);           // 31-35
  p.push([8, 14], [7, 14], [6, 14]);                      // 36-38
  for (let r = 13; r >= 9; r--) p.push([6, r]);           // 39-43 yellow start = 39
  for (let c = 5; c >= 1; c--) p.push([c, 8]);            // 44-48
  p.push([0, 8], [0, 7], [0, 6]);                         // 49-51
  if (p.length !== 52) console.error('Path length', p.length);
  return p;
}

const MAIN_PATH = buildCanonicalPath();

const HOME_STRETCH_CELLS = {
  green:  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  red:    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  blue:   [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]
};

// Yard token slots (2×2 inside white nest) — slightly inset for thick frame look
const YARD_POSITIONS = {
  green:  [[1.55, 1.55], [3.45, 1.55], [1.55, 3.45], [3.45, 3.45]],
  red:    [[10.55, 1.55], [12.45, 1.55], [10.55, 3.45], [12.45, 3.45]],
  blue:   [[10.55, 10.55], [12.45, 10.55], [10.55, 12.45], [12.45, 12.45]],
  yellow: [[1.55, 10.55], [3.45, 10.55], [1.55, 12.45], [3.45, 12.45]]
};

const FINISH_POSITIONS = {
  green:  [[6.35, 7.0], [6.7, 6.65], [6.7, 7.35], [7.0, 7.0]],
  red:    [[7.0, 6.35], [6.65, 6.7], [7.35, 6.7], [7.0, 7.0]],
  blue:   [[8.65, 7.0], [8.3, 6.65], [8.3, 7.35], [8.0, 7.0]],
  yellow: [[7.0, 8.65], [6.65, 8.3], [7.35, 8.3], [7.0, 8.0]]
};

// Safe cells: starts + stars (absolute path indices)
const STAR_ABS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const START_ABS = { green: 0, red: 13, blue: 26, yellow: 39 };

// Pure safe cells (not also a start) — grey king-crown marks
const STAR_ONLY_ABS = new Set([8, 21, 34, 47]);

function cellCenter(col, row, cellSize) {
  return {
    x: col * cellSize + cellSize / 2,
    y: row * cellSize + cellSize / 2
  };
}

function posToXY(color, relativePos, tokenIndex, cellSize) {
  if (relativePos < 0) {
    const [c, r] = YARD_POSITIONS[color][tokenIndex];
    return { x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 };
  }
  if (relativePos >= 56) {
    const [c, r] = FINISH_POSITIONS[color][tokenIndex];
    return { x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 };
  }
  if (relativePos >= 51) {
    const idx = relativePos - 51;
    const [c, r] = HOME_STRETCH_CELLS[color][idx];
    return cellCenter(c, r, cellSize);
  }
  const start = START_ABS[color];
  const abs = (start + relativePos) % 52;
  const [c, r] = MAIN_PATH[abs];
  return cellCenter(c, r, cellSize);
}

/** Relative positions visited one cell at a time (includes destination). */
function buildMoveSteps(from, to) {
  if (from == null || to == null) return [];
  if (from === -1) return [0];
  if (to === from) return [];
  const steps = [];
  if (to > from) {
    for (let p = from + 1; p <= to; p++) steps.push(p);
  }
  return steps;
}

function isPathCell(c, r) {
  // Cross corridors rows 6-8 or cols 6-8, excluding the 3×3 center which is special
  const onCross = (r >= 6 && r <= 8) || (c >= 6 && c <= 8);
  if (!onCross) return false;
  // 3×3 center handled separately
  if (c >= 6 && c <= 8 && r >= 6 && r <= 8) return false;
  return true;
}

/**
 * King crown mark — classic 3-peak crown pin (peaks point "up" / -Y at rotation 0).
 * Local paths centered at origin so the whole mark can be rotated.
 */
function crownBodyPathLocal(r) {
  const w = r * 1.15;
  const h = r * 1.0;
  return [
    'M', (-w * 0.92).toFixed(2), (h * 0.62).toFixed(2),
    'Q', '0', (h * 0.78).toFixed(2), (w * 0.92).toFixed(2), (h * 0.62).toFixed(2),
    'L', (w * 0.95).toFixed(2), (h * 0.08).toFixed(2),
    'Q', (w * 0.98).toFixed(2), (-h * 0.22).toFixed(2), (w * 0.72).toFixed(2), (-h * 0.42).toFixed(2),
    'Q', (w * 0.58).toFixed(2), (-h * 0.55).toFixed(2), (w * 0.48).toFixed(2), (-h * 0.22).toFixed(2),
    'Q', (w * 0.28).toFixed(2), (h * 0.02).toFixed(2), (w * 0.14).toFixed(2), (-h * 0.18).toFixed(2),
    'Q', (w * 0.06).toFixed(2), (-h * 0.72).toFixed(2), '0', (-h * 0.88).toFixed(2),
    'Q', (-w * 0.06).toFixed(2), (-h * 0.72).toFixed(2), (-w * 0.14).toFixed(2), (-h * 0.18).toFixed(2),
    'Q', (-w * 0.28).toFixed(2), (h * 0.02).toFixed(2), (-w * 0.48).toFixed(2), (-h * 0.22).toFixed(2),
    'Q', (-w * 0.58).toFixed(2), (-h * 0.55).toFixed(2), (-w * 0.72).toFixed(2), (-h * 0.42).toFixed(2),
    'Q', (-w * 0.98).toFixed(2), (-h * 0.22).toFixed(2), (-w * 0.95).toFixed(2), (h * 0.08).toFixed(2),
    'L', (-w * 0.92).toFixed(2), (h * 0.62).toFixed(2),
    'Z'
  ].join(' ');
}

function crownBandPathLocal(r) {
  const w = r * 1.15;
  const h = r * 1.0;
  const top = h * 0.18;
  const bot = h * 0.48;
  return [
    'M', (-w * 0.78).toFixed(2), top.toFixed(2),
    'L', (w * 0.78).toFixed(2), top.toFixed(2),
    'L', (w * 0.82).toFixed(2), bot.toFixed(2),
    'Q', '0', (bot + h * 0.12).toFixed(2), (-w * 0.82).toFixed(2), bot.toFixed(2),
    'Z'
  ].join(' ');
}

/**
 * Draw a crown at (cx,cy). rotationDeg: 0 = peaks up (-Y).
 * fill/stroke colors configurable (grey safe cells vs white finish crowns).
 */
function drawCrownMark(cx, cy, r, rotationDeg, fill, stroke) {
  const hi = fill === '#ffffff' || fill === '#fff' ? '#ffffff' : '#d4d4d4';
  const body = crownBodyPathLocal(r);
  const bodyHi = crownBodyPathLocal(r * 0.9);
  const bodyIn = crownBodyPathLocal(r * 0.88);
  const band = crownBandPathLocal(r);
  const bandHi = crownBandPathLocal(r * 0.98);
  const ballR = r * 0.16;
  const jewelR = r * 0.09;
  const rot = rotationDeg || 0;
  let s = '';
  s += `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${rot})">`;
  // Soft drop shadow (in local space, slightly offset "down" toward base)
  s += `<path d="${crownBodyPathLocal(r)}" transform="translate(0.6,1.1)" fill="#000" opacity="0.14"/>`;
  // Body
  s += `<path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="0.9" stroke-linejoin="round"/>`;
  // Gloss / relief
  s += `<path d="${bodyHi}" transform="translate(-0.3,-0.5)" fill="${hi}" opacity="0.28"/>`;
  s += `<path d="${bodyIn}" fill="none" stroke="${stroke}" stroke-width="0.55" opacity="0.35"/>`;
  // Band
  s += `<path d="${band}" fill="none" stroke="${stroke}" stroke-width="1.1" opacity="0.8"/>`;
  s += `<path d="${bandHi}" transform="translate(0,-0.15)" fill="${hi}" opacity="0.18"/>`;
  // Three ring jewels on the band
  const bandY = r * 0.34;
  [-0.42, 0, 0.42].forEach((fx) => {
    const jx = r * 1.15 * fx;
    s += `<circle cx="${jx.toFixed(1)}" cy="${bandY.toFixed(1)}" r="${jewelR.toFixed(1)}" fill="none" stroke="${stroke}" stroke-width="1.05" opacity="0.9"/>`;
    s += `<circle cx="${(jx - jewelR * 0.2).toFixed(1)}" cy="${(bandY - jewelR * 0.25).toFixed(1)}" r="${(jewelR * 0.28).toFixed(1)}" fill="#fff" opacity="0.4"/>`;
  });
  // Ball tips on three peaks
  const balls = [
    { bx: -r * 0.72, by: -r * 0.42, br: ballR * 0.95 },
    { bx: 0, by: -r * 0.88, br: ballR * 1.05 },
    { bx: r * 0.72, by: -r * 0.42, br: ballR * 0.95 }
  ];
  balls.forEach((b) => {
    s += `<circle cx="${b.bx.toFixed(1)}" cy="${b.by.toFixed(1)}" r="${b.br.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="0.7"/>`;
    s += `<circle cx="${(b.bx - b.br * 0.25).toFixed(1)}" cy="${(b.by - b.br * 0.28).toFixed(1)}" r="${(b.br * 0.35).toFixed(1)}" fill="#fff" opacity="0.45"/>`;
  });
  s += `</g>`;
  return s;
}

function tokenDiscSVG(col, scale) {
  // Circular plastic token with 3D volume (sphere-like disc)
  const s = scale;
  const body = col.token;
  const dark = col.dark;
  const light = col.light;
  const mid = col.mid || body;
  const r = s * 0.48;
  return `
    <g class="token-disc">
      <!-- ground contact shadow -->
      <ellipse cx="0" cy="${(r * 0.55).toFixed(2)}" rx="${(r * 0.92).toFixed(2)}" ry="${(r * 0.28).toFixed(2)}" fill="#000" opacity="0.16"/>
      <!-- dark base rim (thickness) -->
      <ellipse cx="0" cy="${(r * 0.12).toFixed(2)}" rx="${r.toFixed(2)}" ry="${(r * 0.92).toFixed(2)}" fill="${dark}"/>
      <!-- main body disc -->
      <circle cx="0" cy="0" r="${r.toFixed(2)}" fill="${body}"/>
      <!-- radial volume: darker lower edge -->
      <path d="M ${(-r).toFixed(2)},0 A ${r.toFixed(2)},${r.toFixed(2)} 0 0 0 ${r.toFixed(2)},0 A ${r.toFixed(2)},${(r * 0.7).toFixed(2)} 0 0 1 ${(-r).toFixed(2)},0 Z"
            fill="${dark}" opacity="0.28"/>
      <!-- soft mid ring -->
      <circle cx="0" cy="${(-r * 0.06).toFixed(2)}" r="${(r * 0.78).toFixed(2)}" fill="none" stroke="${mid}" stroke-width="${Math.max(1, s * 0.04).toFixed(2)}" opacity="0.35"/>
      <!-- specular highlight blob -->
      <ellipse cx="${(-r * 0.28).toFixed(2)}" cy="${(-r * 0.32).toFixed(2)}" rx="${(r * 0.38).toFixed(2)}" ry="${(r * 0.28).toFixed(2)}" fill="#fff" opacity="0.42"/>
      <ellipse cx="${(-r * 0.18).toFixed(2)}" cy="${(-r * 0.22).toFixed(2)}" rx="${(r * 0.16).toFixed(2)}" ry="${(r * 0.12).toFixed(2)}" fill="#fff" opacity="0.55"/>
      <!-- thin glossy rim -->
      <circle cx="0" cy="0" r="${(r * 0.96).toFixed(2)}" fill="none" stroke="#fff" stroke-width="${Math.max(0.8, s * 0.035).toFixed(2)}" opacity="0.35"/>
      <circle cx="0" cy="0" r="${r.toFixed(2)}" fill="none" stroke="${dark}" stroke-width="${Math.max(0.7, s * 0.03).toFixed(2)}" opacity="0.55"/>
    </g>`;
}

function renderBoard(container, gameState, options = {}) {
  const N = 15;
  const pad = 18;           // wood frame thickness in viewBox units
  const size = 600;         // playable grid size
  const full = size + pad * 2;
  const cs = size / N;
  const colors = BOARD.COLORS;
  const onTokenClick = options.onTokenClick;

  // Map path abs → coord
  const pathSet = new Set(MAIN_PATH.map(([c, r]) => c + ',' + r));
  const homeSet = {};
  Object.keys(HOME_STRETCH_CELLS).forEach((color) => {
    HOME_STRETCH_CELLS[color].forEach(([c, r], i) => {
      homeSet[c + ',' + r] = { color, i };
    });
  });
  const startCell = {};
  Object.entries(START_ABS).forEach(([color, abs]) => {
    const [c, r] = MAIN_PATH[abs];
    startCell[c + ',' + r] = color;
  });
  const starCell = {};
  STAR_ONLY_ABS.forEach((abs) => {
    const [c, r] = MAIN_PATH[abs];
    starCell[c + ',' + r] = true;
  });

  let svg = '';
  svg += `<svg viewBox="0 0 ${full} ${full}" xmlns="http://www.w3.org/2000/svg" class="ludo-board-svg">`;
  svg += `<defs>
    <linearGradient id="woodGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8c99a"/>
      <stop offset="45%" stop-color="#d2a86a"/>
      <stop offset="100%" stop-color="#c49a5c"/>
    </linearGradient>
    <linearGradient id="woodEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f3e0c0"/>
      <stop offset="100%" stop-color="#b8894c"/>
    </linearGradient>
    <filter id="tokenShadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-opacity="0.28"/>
    </filter>
    <filter id="boardInset" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.12"/>
    </filter>
    <linearGradient id="cellShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;

  // Outer frame — solid color when theme provides rim (wallpaper themes)
  const rim = (options && options.rimColor) || (typeof document !== 'undefined' && document.documentElement
    && getComputedStyle(document.documentElement).getPropertyValue('--board-rim').trim()) || '';
  const rimHi = (options && options.rimHighlight) || (typeof document !== 'undefined' && document.documentElement
    && getComputedStyle(document.documentElement).getPropertyValue('--board-rim-hi').trim()) || '';
  const rimLo = (options && options.rimShadow) || (typeof document !== 'undefined' && document.documentElement
    && getComputedStyle(document.documentElement).getPropertyValue('--board-rim-lo').trim()) || '';
  const plate = (options && options.plateColor) || (typeof document !== 'undefined' && document.documentElement
    && getComputedStyle(document.documentElement).getPropertyValue('--board-plate').trim()) || '#f7f4ee';

  if (rim) {
    svg += `<rect x="0" y="0" width="${full}" height="${full}" rx="22" ry="22" fill="${rim}"/>`;
    if (rimHi) {
      svg += `<rect x="3" y="3" width="${full - 6}" height="${full - 6}" rx="19" ry="19" fill="none" stroke="${rimHi}" stroke-width="2" opacity="0.55"/>`;
    }
    if (rimLo) {
      svg += `<rect x="6" y="6" width="${full - 12}" height="${full - 12}" rx="16" ry="16" fill="none" stroke="${rimLo}" stroke-width="1.5" opacity="0.5"/>`;
    }
  } else {
    svg += `<rect x="0" y="0" width="${full}" height="${full}" rx="22" ry="22" fill="url(#woodGrad)"/>`;
    svg += `<rect x="3" y="3" width="${full - 6}" height="${full - 6}" rx="19" ry="19" fill="none" stroke="#f6e6c8" stroke-width="2" opacity="0.7"/>`;
    svg += `<rect x="6" y="6" width="${full - 12}" height="${full - 12}" rx="16" ry="16" fill="none" stroke="#a8783a" stroke-width="1.5" opacity="0.45"/>`;
  }

  // Playable plate
  svg += `<g transform="translate(${pad}, ${pad})">`;
  svg += `<rect x="0" y="0" width="${size}" height="${size}" rx="6" ry="6" fill="${plate || '#f7f4ee'}" filter="url(#boardInset)"/>`;

  // ---- Helper: raised plastic cell ----
  function cellRect(c, r, fill, stroke, sw) {
    const x = c * cs;
    const y = r * cs;
    const gap = 1.1;
    const rr = Math.max(2.2, cs * 0.12);
    return `<rect x="${x + gap}" y="${y + gap}" width="${cs - gap * 2}" height="${cs - gap * 2}" rx="${rr}" ry="${rr}" fill="${fill}" stroke="${stroke || '#d9d2c5'}" stroke-width="${sw == null ? 1 : sw}"/>`;
  }

  // Base yards (thick colored frames + white nest + 4 color dots like reference)
  // Dots stay visible when a token has left the "casa"
  function drawYard(color, x0, y0) {
    const col = colors[color];
    const w = cs * 6;
    const outerR = cs * 0.35;
    const inset = cs * 0.55;
    // Outer colored block
    svg += `<rect x="${x0 * cs}" y="${y0 * cs}" width="${w}" height="${w}" rx="${outerR}" ry="${outerR}" fill="${col.main}"/>`;
    // Inner bevel (lighter edge)
    svg += `<rect x="${x0 * cs + 3}" y="${y0 * cs + 3}" width="${w - 6}" height="${w - 6}" rx="${outerR - 2}" ry="${outerR - 2}" fill="none" stroke="${col.light}" stroke-width="2.5" opacity="0.55"/>`;
    // Darker inner rim
    svg += `<rect x="${x0 * cs + cs * 0.22}" y="${y0 * cs + cs * 0.22}" width="${w - cs * 0.44}" height="${w - cs * 0.44}" rx="${cs * 0.28}" ry="${cs * 0.28}" fill="${col.dark}" opacity="0.22"/>`;
    // White nest (rounded square)
    const nx = x0 * cs + inset;
    const ny = y0 * cs + inset;
    const nw = w - inset * 2;
    // Soft pastel fill tinted with player color (like reference light-green plate)
    const nestFill = col.light;
    svg += `<rect x="${nx}" y="${ny}" width="${nw}" height="${nw}" rx="${cs * 0.42}" ry="${cs * 0.42}" fill="#ffffff" stroke="${col.main}" stroke-width="2.2" opacity="0.98"/>`;
    svg += `<rect x="${nx + 3}" y="${ny + 3}" width="${nw - 6}" height="${nw - 6}" rx="${cs * 0.36}" ry="${cs * 0.36}" fill="${nestFill}" opacity="0.35"/>`;
    // Soft nest inner edge
    svg += `<rect x="${nx + 2}" y="${ny + 2}" width="${nw - 4}" height="${nw - 4}" rx="${cs * 0.38}" ry="${cs * 0.38}" fill="none" stroke="#fff" stroke-width="2" opacity="0.7"/>`;

    // 4 circular wells — dark recessed holes (show clearly when token left home)
    const slots = YARD_POSITIONS[color];
    const slotR = cs * 0.30;
    const hole = col.hole || col.dark;
    slots.forEach(([gc, gr], slotIndex) => {
      const sx = gc * cs + cs / 2;
      const sy = gr * cs + cs / 2;
      // Outer raised lip (nest floor)
      svg += `<circle cx="${sx}" cy="${sy}" r="${(slotR + 3.2).toFixed(2)}" fill="${col.main}" opacity="0.22"/>`;
      // Hard rim — light on top-left, dark on bottom-right (inset bevel)
      svg += `<circle cx="${sx}" cy="${sy}" r="${(slotR + 1.6).toFixed(2)}" fill="none" stroke="#ffffff" stroke-width="2.2" opacity="0.55"/>`;
      svg += `<circle cx="${(sx + 0.6).toFixed(2)}" cy="${(sy + 0.8).toFixed(2)}" r="${(slotR + 1.2).toFixed(2)}" fill="none" stroke="${hole}" stroke-width="2.4" opacity="0.55"/>`;
      // Deep well body — very dark player color
      svg += `<circle cx="${sx}" cy="${sy}" r="${slotR.toFixed(2)}" fill="${hole}"/>`;
      // Inner depth gradient (darker center-bottom)
      svg += `<ellipse cx="${sx}" cy="${(sy + slotR * 0.12).toFixed(2)}" rx="${(slotR * 0.78).toFixed(2)}" ry="${(slotR * 0.72).toFixed(2)}" fill="#000" opacity="0.28"/>`;
      // Soft top-edge light inside the pit (low relief)
      svg += `<ellipse cx="${(sx - slotR * 0.12).toFixed(2)}" cy="${(sy - slotR * 0.28).toFixed(2)}" rx="${(slotR * 0.55).toFixed(2)}" ry="${(slotR * 0.32).toFixed(2)}" fill="${col.dark}" opacity="0.35"/>`;
      // Thin outer stroke to separate from nest
      svg += `<circle cx="${sx}" cy="${sy}" r="${(slotR + 1.6).toFixed(2)}" fill="none" stroke="${hole}" stroke-width="1.2" opacity="0.7"/>`;
    });
  }

  drawYard('green', 0, 0);
  drawYard('red', 9, 0);
  drawYard('blue', 9, 9);
  drawYard('yellow', 0, 9);

  // Path white cells (cross arms, excluding center 3×3 and excluding home stretch which we paint colored)
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const key = c + ',' + r;
      if (homeSet[key]) continue;
      if (c >= 6 && c <= 8 && r >= 6 && r <= 8) continue; // center
      if (!isPathCell(c, r) && !pathSet.has(key)) continue;

      // Only draw cells that are on the path corridors
      if (!isPathCell(c, r) && !pathSet.has(key)) continue;

      let fill = '#ffffff';
      let stroke = '#e0d8cc';
      // Colored start cells
      if (startCell[key]) {
        const sc = colors[startCell[key]];
        fill = sc.main;
        stroke = sc.dark;
      }
      svg += cellRect(c, r, fill, stroke, 1);
      // subtle top shine on white cells
      if (!startCell[key]) {
        const x = c * cs + 2;
        const y = r * cs + 2;
        svg += `<rect x="${x}" y="${y}" width="${cs - 4}" height="${(cs - 4) * 0.35}" rx="2" fill="url(#cellShine)" opacity="0.5"/>`;
      }
    }
  }

  // Home stretch colored cells
  Object.keys(HOME_STRETCH_CELLS).forEach((color) => {
    const col = colors[color];
    HOME_STRETCH_CELLS[color].forEach(([c, r]) => {
      svg += cellRect(c, r, col.main, col.dark, 1.1);
      // gloss
      const x = c * cs + 2.2;
      const y = r * cs + 2.2;
      svg += `<rect x="${x}" y="${y}" width="${cs - 4.4}" height="${(cs - 4.4) * 0.32}" rx="2" fill="#fff" opacity="0.22"/>`;
    });
  });

  // Center finish — four triangles (like reference)
  const cx = 7.5 * cs;
  const cy = 7.5 * cs;
  const c0 = 6 * cs;
  const c1 = 9 * cs;
  // Slight inset plate under triangles
  svg += `<rect x="${c0}" y="${c0}" width="${3 * cs}" height="${3 * cs}" fill="#f0ebe3"/>`;
  // Red top, blue right, yellow bottom, green left
  svg += `<polygon points="${c0},${c0} ${c1},${c0} ${cx},${cy}" fill="${colors.red.main}" stroke="${colors.red.dark}" stroke-width="0.8"/>`;
  svg += `<polygon points="${c1},${c0} ${c1},${c1} ${cx},${cy}" fill="${colors.blue.main}" stroke="${colors.blue.dark}" stroke-width="0.8"/>`;
  svg += `<polygon points="${c1},${c1} ${c0},${c1} ${cx},${cy}" fill="${colors.yellow.main}" stroke="${colors.yellow.dark}" stroke-width="0.8"/>`;
  svg += `<polygon points="${c0},${c1} ${c0},${c0} ${cx},${cy}" fill="${colors.green.main}" stroke="${colors.green.dark}" stroke-width="0.8"/>`;
  // soft highlight on each triangle
  svg += `<polygon points="${c0 + 4},${c0 + 4} ${c1 - 4},${c0 + 4} ${cx},${cy - 6}" fill="#fff" opacity="0.12"/>`;

  // Direction arrows on home-stretch entrances (outer end, pointing inward)
  function arrow(points, fill) {
    svg += `<polygon points="${points}" fill="${fill}" stroke="#fff" stroke-width="0.6" opacity="0.95"/>`;
  }
  // Green: left edge pointing right into stretch  (at col0-ish of row7 — actually arrow sits on left of stretch)
  // Reference: green arrow on left of green stretch pointing right; red on top pointing down; etc.
  // Place on the cell just outside / on first approach — use edge of stretch outer cell
  {
    const col = colors.green;
    // left of green stretch, centered on row 7
    const ax = 0.5 * cs, ay = 7.5 * cs, s = cs * 0.28;
    arrow(`${ax - s},${ay} ${ax + s * 0.7},${ay - s * 0.85} ${ax + s * 0.7},${ay + s * 0.85}`, col.main);
  }
  {
    const col = colors.red;
    const ax = 7.5 * cs, ay = 0.5 * cs, s = cs * 0.28;
    arrow(`${ax},${ay - s} ${ax + s * 0.85},${ay + s * 0.7} ${ax - s * 0.85},${ay + s * 0.7}`, col.main);
  }
  {
    const col = colors.blue;
    const ax = 14.5 * cs, ay = 7.5 * cs, s = cs * 0.28;
    arrow(`${ax + s},${ay} ${ax - s * 0.7},${ay - s * 0.85} ${ax - s * 0.7},${ay + s * 0.85}`, col.main);
  }
  {
    const col = colors.yellow;
    const ax = 7.5 * cs, ay = 14.5 * cs, s = cs * 0.28;
    arrow(`${ax},${ay + s} ${ax + s * 0.85},${ay - s * 0.7} ${ax - s * 0.85},${ay - s * 0.7}`, col.main);
  }

  // Grey king crowns on safe (non-start) cells — shape like reference pin
  STAR_ONLY_ABS.forEach((abs) => {
    const [c, r] = MAIN_PATH[abs];
    const { x, y } = cellCenter(c, r, cs);
    svg += drawCrownMark(x, y, cs * 0.32, 0, '#b0b0b0', '#8a8a8a');
  });

  // Finish crowns on each color's FINAL TRIANGLE (center home).
  // Peaks point toward board center; base faces the entry stretch / arrow (outer side).
  // Triangle centroids (in cell units): green left 6.5,7.5 | red top 7.5,6.5 |
  // blue right 8.5,7.5 | yellow bottom 7.5,8.5
  // rotation: 0 peaks up(-Y), 90 peaks right(+X), 180 peaks down(+Y), -90 peaks left(-X)
  const FINISH_CROWN = {
    green:  { x: 6.5, y: 7.5, rot: 90 },   // peaks → center (right); base toward left arrow
    red:    { x: 7.5, y: 6.5, rot: 180 },  // peaks → center (down); base toward top arrow
    blue:   { x: 8.5, y: 7.5, rot: -90 },  // peaks → center (left); base toward right arrow
    yellow: { x: 7.5, y: 8.5, rot: 0 }     // peaks → center (up); base toward bottom arrow
  };
  Object.keys(FINISH_CROWN).forEach((color) => {
    const fc = FINISH_CROWN[color];
    const col = colors[color];
    const px = fc.x * cs;
    const py = fc.y * cs;
    // White crown with player-color border, sized for the triangle
    svg += drawCrownMark(px, py, cs * 0.34, fc.rot, '#ffffff', col.dark);
  });

  // Light grid lines over path only (subtle)
  svg += `<g stroke="#ddd5c8" stroke-width="0.6" fill="none" opacity="0.35">`;
  // skip — cells already have own borders
  svg += `</g>`;

  // ---- Tokens ----
  if (gameState && gameState.players) {
    const tokensToDraw = [];
    gameState.players.forEach((player) => {
      player.tokens.forEach((pos, ti) => {
        tokensToDraw.push({ player, pos, ti });
      });
    });

    const stackCount = {};
    tokensToDraw.forEach((t) => {
      let key;
      if (t.pos < 0) key = `yard-${t.player.color}-${t.ti}`;
      else if (t.pos >= 56) key = `fin-${t.player.color}-${t.ti}`;
      else if (t.pos >= 51) key = `home-${t.player.color}-${t.pos}`;
      else {
        const start = START_ABS[t.player.color];
        key = `main-${(start + t.pos) % 52}`;
      }
      t._stackKey = key;
      t._stackI = stackCount[key] || 0;
      stackCount[key] = (stackCount[key] || 0) + 1;
    });

    // Draw yard tokens first, then path, then finish (z-order)
    tokensToDraw.sort((a, b) => {
      const sa = a.pos < 0 ? 0 : a.pos >= 56 ? 2 : 1;
      const sb = b.pos < 0 ? 0 : b.pos >= 56 ? 2 : 1;
      if (sa !== sb) return sa - sb;
      return a.pos - b.pos;
    });

    tokensToDraw.forEach(({ player, pos, ti, _stackI, _stackKey }) => {
      let { x, y } = posToXY(player.color, pos, ti, cs);
      const n = stackCount[_stackKey] || 1;
      if (n > 1 && pos >= 0 && pos < 56) {
        const ang = (_stackI / n) * Math.PI * 2 - Math.PI / 2;
        const off = cs * 0.14;
        x += Math.cos(ang) * off;
        y += Math.sin(ang) * off;
      }
      const col = colors[player.color];
      const isSel = (
        options.selectableTokens &&
        player.color === options.currentColor &&
        options.selectableTokens.includes(ti)
      );
      const scale = cs * (n > 1 && pos >= 0 && pos < 51 ? 0.78 : 0.92);
      const selClass = isSel ? 'selectable' : '';
      const pulseR = scale * 0.5;

      svg += `<g class="token ${selClass}" data-player="${player.id}" data-token="${ti}" data-color="${player.color}"
         filter="url(#tokenShadow)" ${isSel ? 'style="cursor:pointer"' : ''}
         transform="translate(${x}, ${y})">`;
      if (isSel) {
        svg += `
        <circle class="token-pulse-ring" cx="0" cy="0" r="${pulseR + 4}" fill="none"
                stroke="#ffffff" stroke-width="2.5" opacity="0.85">
          <animate attributeName="r" values="${pulseR + 2};${pulseR + 10};${pulseR + 2}" dur="1.1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.9;0;0.9" dur="1.1s" repeatCount="indefinite"/>
        </circle>
        <circle class="token-pulse-ring" cx="0" cy="0" r="${pulseR + 3}" fill="none"
                stroke="#ffe566" stroke-width="2" opacity="0.7">
          <animate attributeName="r" values="${pulseR + 1};${pulseR + 8};${pulseR + 1}" dur="1.1s" begin="0.15s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.8;0;0.8" dur="1.1s" begin="0.15s" repeatCount="indefinite"/>
        </circle>`;
      }
      svg += `<g>`;
      if (isSel) {
        svg += `<animateTransform attributeName="transform" type="scale"
          values="1;1;1.14;0.96;1.08;1;1" keyTimes="0;0.28;0.42;0.55;0.68;0.82;1"
          dur="1.1s" repeatCount="indefinite"/>`;
      }
      svg += tokenDiscSVG(col, scale);
      svg += `</g></g>`;
    });
  }

  svg += `</g></svg>`; // end pad transform + svg

  container.innerHTML = svg;

  if (onTokenClick) {
    container.querySelectorAll('.token.selectable').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const tokenIndex = parseInt(el.getAttribute('data-token'), 10);
        const playerId = el.getAttribute('data-player');
        onTokenClick(playerId, tokenIndex);
      });
    });
  }
}

/** Dice face as SVG — pass null/0 for blank die */
function diceSVG(value, size) {
  size = size || 36;
  const pips = {
    1: [[0.5, 0.5]],
    2: [[0.28, 0.28], [0.72, 0.72]],
    3: [[0.28, 0.28], [0.5, 0.5], [0.72, 0.72]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.28, 0.28], [0.72, 0.28], [0.5, 0.5], [0.28, 0.72], [0.72, 0.72]],
    6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]]
  };
  const r = size * 0.09;
  let s = `<svg class="dice-svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" rx="${size * 0.18}" fill="#fff" stroke="#e8e8e8" stroke-width="1.5"/>`;
  if (value >= 1 && value <= 6) {
    (pips[value] || []).forEach(([px, py]) => {
      s += `<circle cx="${px * size}" cy="${py * size}" r="${r}" fill="#333"/>`;
    });
  }
  s += `</svg>`;
  return s;
}

window.LudoBoard = {
  renderBoard,
  diceSVG,
  MAIN_PATH,
  START_ABS,
  BOARD,
  posToXY,
  buildMoveSteps,
  HOME_STRETCH_CELLS,
  YARD_POSITIONS,
  cellSizeView: 600 / 15
};
