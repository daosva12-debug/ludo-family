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

/**
 * Finish triangle slots by ARRIVAL ORDER (0=first … 3=fourth), not tokenIndex.
 *
 * Layout in "local" triangle coords (tip toward board center, base toward entry):
 *   slot0 TOP    = near tip (apex toward center) — first token home
 *   slot1 LEFT   = base-left corner — second
 *   slot2 CENTER = base-center (aligned with top) — third
 *   slot3 RIGHT  = base-right corner — fourth
 * So 2nd, 3rd, 4th form the base row; 1st + 3rd form the vertical axis.
 *
 * Each color's triangle in the center 3×3:
 *   green  left:   apex at center (7.5,7.5), base on left edge x=6
 *   red    top:    apex at center, base on top edge y=6
 *   blue   right:  apex at center, base on right edge x=9
 *   yellow bottom: apex at center, base on bottom edge y=9
 *
 * Values are in board cell units (0..15). Tokens are small (~0.22 cell radius
 * after scale) so they stay strictly inside the triangle with margin.
 */
const FINISH_SLOTS = {
  // green: left triangle — tip toward center (right), base on left
  // 1st near tip; 2nd/3rd/4th on base (upper / mid / lower) aligned
  green: [
    [6.98, 7.50], // 1st TOP (toward center / tip)
    [6.45, 7.00], // 2nd LEFT (base upper)
    [6.45, 7.50], // 3rd CENTER (base mid) — vertical with 1st
    [6.45, 8.00]  // 4th RIGHT (base lower)
  ],
  // red: top triangle — tip toward center (down), base on top
  red: [
    [7.50, 6.98], // 1st TOP
    [7.00, 6.45], // 2nd LEFT
    [7.50, 6.45], // 3rd CENTER
    [8.00, 6.45]  // 4th RIGHT
  ],
  // blue: right triangle — tip toward center (left), base on right
  blue: [
    [8.02, 7.50], // 1st TOP
    [8.55, 7.00], // 2nd LEFT (base upper)
    [8.55, 7.50], // 3rd CENTER
    [8.55, 8.00]  // 4th RIGHT (base lower)
  ],
  // yellow: bottom triangle — tip toward center (up), base on bottom
  yellow: [
    [7.50, 8.02], // 1st TOP
    [7.00, 8.55], // 2nd LEFT
    [7.50, 8.55], // 3rd CENTER
    [8.00, 8.55]  // 4th RIGHT
  ]
};

// Back-compat alias
const FINISH_POSITIONS = FINISH_SLOTS;

/** Map tokenIndex → finish slot (arrival order). Falls back to tokenIndex. */
function finishSlotIndex(player, tokenIndex) {
  if (player && Array.isArray(player.finishOrder) && player.finishOrder.length) {
    const i = player.finishOrder.indexOf(tokenIndex);
    if (i >= 0) return i;
    // already finished but not listed? put after known
    return Math.min(3, player.finishOrder.length);
  }
  return tokenIndex;
}

function finishXY(color, slotIndex, cellSize) {
  const slots = FINISH_SLOTS[color] || FINISH_SLOTS.green;
  const i = Math.max(0, Math.min(3, slotIndex | 0));
  const [c, r] = slots[i];
  return { x: c * cellSize, y: r * cellSize };
}

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

function posToXY(color, relativePos, tokenIndex, cellSize, player) {
  if (relativePos < 0) {
    const [c, r] = YARD_POSITIONS[color][tokenIndex];
    return { x: c * cellSize + cellSize / 2, y: r * cellSize + cellSize / 2 };
  }
  if (relativePos >= 56) {
    const slot = finishSlotIndex(player, tokenIndex);
    return finishXY(color, slot, cellSize);
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


/**
 * Layout for multiple tokens sharing one path/home-stretch cell.
 * 2–3: left → right row
 * 4: 2×2 like die face 4 (TL, TR, BL, BR)
 * All offsets stay inside the cell with margin; scale shrinks so discs don't clip.
 * Returns { dx, dy, scaleMul } relative to cell center; scaleMul multiplies base token scale.
 */
function stackLayoutInCell(count, index, cellSize) {
  const n = Math.max(1, Math.min(4, count | 0));
  const i = Math.max(0, Math.min(n - 1, index | 0));
  if (n <= 1) return { dx: 0, dy: 0, scaleMul: 1 };

  // Usable half-size of cell (leave border / gap so discs stay inside)
  const inset = cellSize * 0.12;
  const usable = cellSize - inset * 2;

  if (n === 2 || n === 3) {
    // Horizontal row, centered — discs fully inside cell
    // tokenDiscSVG radius ≈ scale * 0.48; keep |dx|+r ≤ usable/2
    const scaleMul = n === 2 ? 0.55 : 0.46;
    const r = cellSize * scaleMul * 0.48;
    const gap = cellSize * (n === 2 ? 0.04 : 0.03);
    let pitch = r * 2 + gap;
    const maxSpan = usable - r * 2; // outermost centers must stay inset by r
    if (pitch * (n - 1) > maxSpan) pitch = maxSpan / (n - 1);
    const totalW = pitch * (n - 1);
    const dx = -totalW / 2 + i * pitch;
    const dy = 0;
    return { dx, dy, scaleMul };
  }

  // n === 4 → die face 4: 2×2 (TL, TR, BL, BR)
  const scaleMul = 0.42;
  const r = cellSize * scaleMul * 0.48;
  const gap = cellSize * 0.04;
  let pitch = r * 2 + gap;
  const maxSpan = usable - r * 2;
  if (pitch > maxSpan) pitch = maxSpan;
  const col = i % 2; // 0 left, 1 right
  const row = i < 2 ? 0 : 1; // 0 top, 1 bottom
  const dx = (col === 0 ? -1 : 1) * pitch * 0.5;
  const dy = (row === 0 ? -1 : 1) * pitch * 0.5;
  return { dx, dy, scaleMul };
}


/**
 * Gold medal with hanging ribbon (ribbon = house color; medal always gold).
 * Soft drop shadow for volume. Drawn large in the center of the winner's casa.
 */
function drawGoldMedalSVG(cx, cy, size, ribbonColor) {
  const s = size;
  const gold1 = '#ffe566';
  const gold2 = '#f5c518';
  const gold3 = '#d4a017';
  const gold4 = '#b8860b';
  const rib = ribbonColor || '#2e7d32';
  const ribDark = shadeHex(rib, -0.22);
  const ribLight = shadeHex(rib, 0.18);
  let out = '';
  // Soft volume shadow under whole medal+ribbon
  out += `<ellipse cx="${(cx + s * 0.04).toFixed(1)}" cy="${(cy + s * 0.72).toFixed(1)}" rx="${(s * 0.55).toFixed(1)}" ry="${(s * 0.16).toFixed(1)}" fill="#000" opacity="0.28"/>`;
  out += `<ellipse cx="${cx.toFixed(1)}" cy="${(cy + s * 0.08).toFixed(1)}" rx="${(s * 0.48).toFixed(1)}" ry="${(s * 0.14).toFixed(1)}" fill="#000" opacity="0.18"/>`;

  // Ribbon hanging behind / below the disc (V tails)
  const topY = cy - s * 0.15;
  const joinY = cy + s * 0.05;
  // Left ribbon tail
  out += `<path d="M ${(cx - s * 0.08).toFixed(1)} ${topY.toFixed(1)}
    L ${(cx - s * 0.42).toFixed(1)} ${(cy + s * 0.95).toFixed(1)}
    L ${(cx - s * 0.12).toFixed(1)} ${(cy + s * 0.88).toFixed(1)}
    L ${(cx - s * 0.02).toFixed(1)} ${(joinY + s * 0.12).toFixed(1)}
    Z" fill="${rib}" stroke="${ribDark}" stroke-width="1.2" stroke-linejoin="round"/>`;
  // Right ribbon tail
  out += `<path d="M ${(cx + s * 0.08).toFixed(1)} ${topY.toFixed(1)}
    L ${(cx + s * 0.42).toFixed(1)} ${(cy + s * 0.95).toFixed(1)}
    L ${(cx + s * 0.12).toFixed(1)} ${(cy + s * 0.88).toFixed(1)}
    L ${(cx + s * 0.02).toFixed(1)} ${(joinY + s * 0.12).toFixed(1)}
    Z" fill="${ribLight}" stroke="${ribDark}" stroke-width="1.2" stroke-linejoin="round"/>`;
  // Ribbon fold highlight
  out += `<path d="M ${(cx - s * 0.06).toFixed(1)} ${topY.toFixed(1)}
    L ${cx.toFixed(1)} ${(cy + s * 0.22).toFixed(1)}
    L ${(cx + s * 0.06).toFixed(1)} ${topY.toFixed(1)}
    Z" fill="${ribDark}" opacity="0.35"/>`;

  // Medal disc shadow (contact)
  out += `<circle cx="${(cx + 1.5).toFixed(1)}" cy="${(cy + 2.5).toFixed(1)}" r="${(s * 0.48).toFixed(1)}" fill="#000" opacity="0.22"/>`;

  // Outer gold ring
  out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(s * 0.50).toFixed(1)}" fill="${gold3}" stroke="${gold4}" stroke-width="${(s * 0.04).toFixed(1)}"/>`;
  // Mid ring
  out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(s * 0.44).toFixed(1)}" fill="${gold2}" stroke="${gold1}" stroke-width="${(s * 0.035).toFixed(1)}"/>`;
  // Inner disc with radial-ish highlight (layered circles)
  out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(s * 0.38).toFixed(1)}" fill="${gold2}"/>`;
  out += `<circle cx="${(cx - s * 0.10).toFixed(1)}" cy="${(cy - s * 0.12).toFixed(1)}" r="${(s * 0.22).toFixed(1)}" fill="${gold1}" opacity="0.75"/>`;
  out += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(s * 0.38).toFixed(1)}" fill="none" stroke="${gold4}" stroke-width="1.2" opacity="0.5"/>`;

  // Beaded outer rim dots
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(ang) * s * 0.47;
    const by = cy + Math.sin(ang) * s * 0.47;
    out += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(s * 0.035).toFixed(1)}" fill="${gold1}" stroke="${gold4}" stroke-width="0.5"/>`;
  }

  // Center star (5-point)
  const starR = s * 0.22;
  const starInner = s * 0.09;
  let star = '';
  for (let i = 0; i < 5; i++) {
    const aOut = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const aIn = aOut + Math.PI / 5;
    const ox = cx + Math.cos(aOut) * starR;
    const oy = cy + Math.sin(aOut) * starR;
    const ix = cx + Math.cos(aIn) * starInner;
    const iy = cy + Math.sin(aIn) * starInner;
    star += (i === 0 ? `M ${ox.toFixed(1)} ${oy.toFixed(1)}` : ` L ${ox.toFixed(1)} ${oy.toFixed(1)}`) + ` L ${ix.toFixed(1)} ${iy.toFixed(1)}`;
  }
  star += ' Z';
  out += `<path d="${star}" fill="#fff8e1" stroke="${gold4}" stroke-width="1.2" stroke-linejoin="round"/>`;
  // Small "1" under star for 1st place
  const fs = s * 0.28;
  out += `<text x="${cx.toFixed(1)}" y="${(cy + s * 0.32).toFixed(1)}" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-size="${fs.toFixed(1)}" font-weight="900" fill="${gold4}" style="user-select:none">1°</text>`;

  return out;
}

function shadeHex(hex, amt) {
  // amt -1..1 darken/lighten
  let h = String(hex || '#888').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length !== 6) return hex || '#888';
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = (v) => Math.max(0, Math.min(255, Math.round(v + (amt >= 0 ? (255 - v) * amt : v * amt))));
  if (amt < 0) {
    const k = 1 + amt;
    r = Math.round(r * k); g = Math.round(g * k); b = Math.round(b * k);
  } else {
    r = t(r); g = t(g); b = t(b);
  }
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
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
  
  // ---- 1st-place gold medal in center of winner's house (while match may continue) ----
  if (gameState && Array.isArray(gameState.winners) && gameState.winners.length) {
    const firstId = gameState.winners[0];
    const firstPl = (gameState.players || []).find((p) => p && p.id === firstId);
    if (firstPl && firstPl.finished >= 4 && firstPl.color) {
      const yardOrigin = { green: [0, 0], red: [9, 0], blue: [9, 9], yellow: [0, 9] };
      const [x0, y0] = yardOrigin[firstPl.color] || [0, 0];
      const cx = (x0 + 3) * cs;
      const cy = (y0 + 3) * cs;
      // LARGE medal relative to house nest (~2.4 cells wide)
      const medalSize = cs * 2.35;
      const ribCol = (colors[firstPl.color] && colors[firstPl.color].main) || '#2e7d32';
      svg += `<g class="winner-medal" data-color="${firstPl.color}" data-place="1">`;
      svg += drawGoldMedalSVG(cx, cy, medalSize, ribCol);
      svg += `</g>`;
    }
  }

svg += `</g>`;

  // ---- Finish count badges (outside playable grid, beside each home yard) ----
  // Number of tokens that reached meta (0–4), outside the board next to that color's house.
  function drawFinishCountBadge(color, count, bx, by) {
    const n = Math.max(0, Math.min(4, Number(count) || 0));
    const col = colors[color] || colors.green;
    const R = Math.max(11, cs * 0.38);
    // Soft shadow
    svg += `<circle cx="${(bx + 1.2).toFixed(1)}" cy="${(by + 1.6).toFixed(1)}" r="${R.toFixed(1)}" fill="#000" opacity="0.18"/>`;
    // Disc
    svg += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${R.toFixed(1)}" fill="${col.main}" stroke="#fff" stroke-width="2.4"/>`;
    svg += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(R - 2.2).toFixed(1)}" fill="none" stroke="${col.dark}" stroke-width="1.2" opacity="0.55"/>`;
    // Number (always visible 0–4 so progress is clear)
    const fs = Math.max(12, cs * 0.42);
    svg += `<text x="${bx.toFixed(1)}" y="${(by + fs * 0.35).toFixed(1)}" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-size="${fs.toFixed(1)}" font-weight="900" fill="#fff" stroke="${col.dark}" stroke-width="0.6" paint-order="stroke" style="user-select:none">${n}</text>`;
    // Tiny label
    const ls = Math.max(6.5, cs * 0.18);
    svg += `<text x="${bx.toFixed(1)}" y="${(by + R + ls + 2).toFixed(1)}" text-anchor="middle" font-family="Nunito, system-ui, sans-serif" font-size="${ls.toFixed(1)}" font-weight="800" fill="${col.dark}" opacity="0.9" style="user-select:none">META</text>`;
  }

  // Positions: outside the 15×15 playable area, beside each yard (still on the frame)
  // green top-left  → left of house
  // yellow bottom-left → left of house
  // red top-right → right of house
  // blue bottom-right → right of house
  const finishCountByColor = { green: 0, red: 0, blue: 0, yellow: 0 };
  if (gameState && gameState.players) {
    gameState.players.forEach((p) => {
      if (!p || !p.color) return;
      let n = 0;
      if (Array.isArray(p.finishOrder) && p.finishOrder.length) n = p.finishOrder.length;
      else if (typeof p.finished === 'number') n = p.finished;
      else if (Array.isArray(p.tokens)) n = p.tokens.filter((pos) => pos >= 56).length;
      finishCountByColor[p.color] = Math.max(0, Math.min(4, n));
    });
  }
  {
    // Place in pad-local coords: negative X = left of board, >size = right of board
    const edge = Math.max(10, pad * 0.58);
    const leftX = -edge;
    const rightX = size + edge;
    const topY = 3 * cs;      // middle of top yards (rows 0–6)
    const botY = 12 * cs;     // middle of bottom yards (rows 9–15)
    drawFinishCountBadge('green', finishCountByColor.green, leftX, topY);
    drawFinishCountBadge('yellow', finishCountByColor.yellow, leftX, botY);
    drawFinishCountBadge('red', finishCountByColor.red, rightX, topY);
    drawFinishCountBadge('blue', finishCountByColor.blue, rightX, botY);
  }

  // ---- Tokens ----
  if (gameState && gameState.players) {
    const tokensToDraw = [];
    gameState.players.forEach((player) => {
      player.tokens.forEach((pos, ti) => {
        tokensToDraw.push({ player, pos, ti });
      });
    });

    // Group tokens that share a path/home cell (different players / multi-token cell)
    const stackBuckets = {};
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
      if (!stackBuckets[key]) stackBuckets[key] = [];
      stackBuckets[key].push(t);
    });
    // Stable left→right order: by color order, then player id, then token index
    const COLOR_RANK = { green: 0, red: 1, blue: 2, yellow: 3 };
    const stackCount = {};
    Object.keys(stackBuckets).forEach((key) => {
      const list = stackBuckets[key];
      list.sort((a, b) => {
        const ca = COLOR_RANK[a.player.color] ?? 9;
        const cb = COLOR_RANK[b.player.color] ?? 9;
        if (ca !== cb) return ca - cb;
        const ida = String(a.player.id || '');
        const idb = String(b.player.id || '');
        if (ida !== idb) return ida < idb ? -1 : 1;
        return a.ti - b.ti;
      });
      list.forEach((t, i) => {
        t._stackI = i;
      });
      stackCount[key] = list.length;
    });

    // Draw yard tokens first, then path, then finish (z-order)
    tokensToDraw.sort((a, b) => {
      const sa = a.pos < 0 ? 0 : a.pos >= 56 ? 2 : 1;
      const sb = b.pos < 0 ? 0 : b.pos >= 56 ? 2 : 1;
      if (sa !== sb) return sa - sb;
      return a.pos - b.pos;
    });

    tokensToDraw.forEach(({ player, pos, ti, _stackI, _stackKey }) => {
      let { x, y } = posToXY(player.color, pos, ti, cs, player);
      const n = stackCount[_stackKey] || 1;
      const col = colors[player.color];
      const isSel = (
        options.selectableTokens &&
        player.color === options.currentColor &&
        options.selectableTokens.includes(ti)
      );
      // Scale + layout
      let scale;
      if (pos >= 56) {
        // Finish triangle slots — already dedicated positions
        scale = cs * 0.48;
      } else if (n > 1 && pos >= 0 && pos < 56) {
        // Shared casillero (main path or home stretch): row (2–3) or 2×2 (4)
        const lay = stackLayoutInCell(n, _stackI, cs);
        x += lay.dx;
        y += lay.dy;
        scale = cs * 0.92 * lay.scaleMul;
      } else {
        scale = cs * 0.92;
      }
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
  finishSlotIndex,
  finishXY,
  FINISH_SLOTS,
  buildMoveSteps,
  HOME_STRETCH_CELLS,
  YARD_POSITIONS,
  cellSizeView: 600 / 15,
  stackLayoutInCell,
  drawGoldMedalSVG
};
