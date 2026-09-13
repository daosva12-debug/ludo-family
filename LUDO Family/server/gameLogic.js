/**
 * LUDO Family - Game Logic
 * Board path indexing and rules for classic Ludo.
 */

const COLORS = ['green', 'red', 'blue', 'yellow'];
const COLOR_ORDER = ['green', 'red', 'blue', 'yellow']; // clockwise turn order

// Each player path has 52 main track cells + 5 home stretch + 1 finish = effective positions 0..56
// Position -1 = in yard (home base)
// Position 0..50 = main track (relative to player's start)
// Position 51..55 = home stretch
// Position 56 = finished

const PATH_LENGTH = 52;
const HOME_STRETCH = 5;
const FINISH = 56; // 51+5
const TOKENS_PER_PLAYER = 4;

// Absolute board cell index where each color starts (after leaving yard)
const START_CELLS = {
  green: 0,
  red: 13,
  blue: 26,
  yellow: 39
};

// Absolute cell just before entering home stretch
const ENTRY_CELLS = {
  green: 50,  // last main cell before green home
  red: 11,
  blue: 24,
  yellow: 37
};

// Safe cells (stars) - absolute indices on main track
const SAFE_CELLS = new Set([
  0, 8, 13, 21, 26, 34, 39, 47  // starts + star positions
]);


/** Players who have not finished all 4 tokens */
function activeRacers(state) {
  return (state.players || []).filter((p) => (p.finished || 0) < TOKENS_PER_PLAYER);
}

/**
 * End match when at most one player still has tokens outside meta.
 * Remaining player is ranked last if needed.
 */
function maybeFinishMatch(state) {
  if (!state || state.status !== 'playing') return false;
  const racing = activeRacers(state);
  if (racing.length > 1) return false;

  if (racing.length === 1) {
    const last = racing[0];
    if (!Array.isArray(state.winners)) state.winners = [];
    if (!state.winners.includes(last.id)) state.winners.push(last.id);
  }

  state.status = 'finished';
  if (!state.winner && state.winners && state.winners.length) {
    state.winner = state.winners[0];
  }
  const first = state.winner ? getPlayer(state, state.winner) : null;
  state.message = first
    ? `¡Fin de la partida! 1º lugar: ${first.name}`
    : '¡Fin de la partida!';
  return true;
}

function createInitialState(players) {
  // players: array of { id, name, color, isBot? }
  // Normalize colors, then sort clockwise on the board:
  // green (top-left) → red (top-right) → blue (bottom-right) → yellow (bottom-left)
  const normalized = players.map((p, i) => {
    const color = (p.color && COLOR_ORDER.includes(p.color))
      ? p.color
      : COLOR_ORDER[i % COLOR_ORDER.length];
    return {
      id: p.id,
      name: p.name,
      color,
      isBot: !!p.isBot,
      autoPlay: !!p.autoPlay,
      tokens: Array(TOKENS_PER_PLAYER).fill(-1), // all in yard
      finished: 0,
      // tokenIndex values in arrival order at meta (for triangle placement)
      finishOrder: []
    };
  });

  normalized.sort((a, b) => {
    const ia = COLOR_ORDER.indexOf(a.color);
    const ib = COLOR_ORDER.indexOf(b.color);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  // Random first player (not always the same seat)
  const startIndex = normalized.length
    ? Math.floor(Math.random() * normalized.length)
    : 0;
  const starter = normalized[startIndex];

  const state = {
    players: normalized,
    currentPlayerIndex: startIndex,
    diceValue: null,
    diceRolled: false,
    consecutiveSixes: 0,
    winner: null,
    winners: [],
    status: 'playing', // waiting | playing | finished
    lastMove: null,
    mustRollAgain: false,
    selectableTokens: [],
    message: starter
      ? `Empieza ${starter.name} (${colorLabel(starter.color)}). Turnos en sentido horario.`
      : ''
  };
  return state;
}

/** Spanish color name for messages */
function colorLabel(color) {
  return ({ green: 'verde', red: 'rojo', blue: 'azul', yellow: 'amarillo' })[color] || color;
}

function getPlayer(state, playerId) {
  return state.players.find(p => p.id === playerId);
}

function getCurrentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}

/** Convert relative position to absolute main-track cell (0-51), or null if not on main track */
function toAbsolute(color, relativePos) {
  if (relativePos < 0 || relativePos >= 51) return null;
  const start = START_CELLS[color];
  return (start + relativePos) % PATH_LENGTH;
}

/** Tokens of other players on an absolute main-track cell */
function tokensOnAbsoluteCell(state, absCell, exceptPlayerId) {
  const result = [];
  for (const player of state.players) {
    if (player.id === exceptPlayerId) continue;
    player.tokens.forEach((pos, tokenIndex) => {
      if (pos >= 0 && pos < 51) {
        const abs = toAbsolute(player.color, pos);
        if (abs === absCell) {
          result.push({ playerId: player.id, color: player.color, tokenIndex, pos });
        }
      }
    });
  }
  return result;
}

function isSafeAbsolute(absCell) {
  return SAFE_CELLS.has(absCell);
}

/** Can this token move with the given dice value? */
function canTokenMove(player, tokenIndex, dice) {
  const pos = player.tokens[tokenIndex];
  if (pos === FINISH) return false;

  // In yard ("casa"): ONLY a 6 lets the token enter the board (start cell)
  const roll = Number(dice);
  if (pos === -1) return roll === 6;

  // On main track (0..50)
  if (pos >= 0 && pos <= 50) {
    const next = pos + dice;
    // Entering home stretch or beyond
    if (next > 50) {
      const intoHome = next - 51; // 0-based into home stretch
      // Home stretch is positions 51..55, finish 56
      if (intoHome > HOME_STRETCH) return false; // overshoot finish
      return true;
    }
    return true;
  }

  // Already on home stretch (51..55)
  if (pos >= 51 && pos <= 55) {
    const next = pos + dice;
    if (next > FINISH) return false; // exact finish required
    return true;
  }

  return false;
}

function getMovableTokens(state, playerId) {
  const player = getPlayer(state, playerId);
  if (!player || state.diceValue == null) return [];
  const movable = [];
  for (let i = 0; i < TOKENS_PER_PLAYER; i++) {
    if (canTokenMove(player, i, state.diceValue)) {
      movable.push(i);
    }
  }
  return movable;
}

function rollDice(state, playerId) {
  if (state.status !== 'playing') return { ok: false, error: 'El juego no está en curso' };
  const current = getCurrentPlayer(state);
  if (current.id !== playerId) return { ok: false, error: 'No es tu turno' };
  if (state.diceRolled && !state.mustRollAgain) return { ok: false, error: 'Ya tiraste el dado' };

  const value = Math.floor(Math.random() * 6) + 1;
  state.diceValue = value;
  state.diceRolled = true;
  state.mustRollAgain = false;
  state.lastMove = { type: 'roll', playerId, value };

  if (value === 6) {
    // Consecutive 6s allowed — player keeps rolling after each move (no turn loss)
    state.consecutiveSixes += 1;
  } else {
    state.consecutiveSixes = 0;
  }

  const movable = getMovableTokens(state, playerId);
  state.selectableTokens = movable;

  if (movable.length === 0) {
    const allInYard = current.tokens.every((t) => t === -1);
    if (allInYard && value !== 6) {
      state.message = `${current.name} sacó un ${value}. Hace falta un 6 para salir de la casa.`;
    } else if (allInYard && value === 6) {
      state.message = `${current.name} sacó un 6 pero no puede sacar ficha.`;
    } else {
      state.message = `${current.name} no puede mover.`;
    }
    // Classic: if no moves, pass turn (even on a 6)
    if (value === 6) {
      // kept for clarity — no re-roll when nothing is movable
    }
    state.diceRolled = false;
    state.diceValue = null;
    state.selectableTokens = [];
    advanceTurn(state);
    return { ok: true, value, noMoves: true, state: publicState(state) };
  }

  // Always let the client show heartbeat / choice (even with 1 token).
  // Bots pick automatically on the server scheduler after the roll event.
  const canLeaveHome = value === 6 && movable.some((ti) => current.tokens[ti] === -1);
  if (movable.length === 1) {
    state.message = canLeaveHome && current.tokens[movable[0]] === -1
      ? `${current.name} sacó un 6. Tocá la ficha para salir de la casa.`
      : `${current.name} sacó un ${value}. Tocá la ficha.`;
  } else {
    state.message = canLeaveHome
      ? `${current.name} sacó un 6. Elegí una ficha (las de la casa pueden salir).`
      : `${current.name} sacó un ${value}. Elegí una ficha.`;
  }
  return { ok: true, value, needsChoice: true, movable, state: publicState(state) };
}

function moveToken(state, playerId, tokenIndex) {
  if (state.status !== 'playing') return { ok: false, error: 'El juego no está en curso' };
  const current = getCurrentPlayer(state);
  if (current.id !== playerId) return { ok: false, error: 'No es tu turno' };
  if (!state.diceRolled || state.diceValue == null) return { ok: false, error: 'Primero tira el dado' };

  const dice = state.diceValue;
  const player = current;

  if (tokenIndex < 0 || tokenIndex >= TOKENS_PER_PLAYER) {
    return { ok: false, error: 'Ficha inválida' };
  }
  if (!canTokenMove(player, tokenIndex, dice)) {
    const tried = player.tokens[tokenIndex];
    if (tried === -1 && Number(dice) !== 6) {
      return { ok: false, error: 'Solo con un 6 la ficha puede salir de la casa' };
    }
    return { ok: false, error: 'Esa ficha no se puede mover' };
  }

  const oldPos = player.tokens[tokenIndex];
  let newPos;
  let captured = null;
  let finishedToken = false;
  let leftYard = false;

  // Hard rule: leaving the yard ("casa") requires a 6 — never any other face
  if (oldPos === -1) {
    if (Number(dice) !== 6) {
      return { ok: false, error: 'Solo con un 6 la ficha puede salir de la casa' };
    }
    // Leave yard to start cell (relative 0) — the 6 is spent to exit, not to walk 6 cells
    newPos = 0;
    leftYard = true;
  } else {
    newPos = oldPos + Number(dice);
  }

  // Cap into home / finish
  if (newPos > FINISH) {
    return { ok: false, error: 'Movimiento inválido' };
  }

  // Capture check: only on main track
  if (newPos >= 0 && newPos < 51) {
    const abs = toAbsolute(player.color, newPos);
    if (!isSafeAbsolute(abs)) {
      const victims = tokensOnAbsoluteCell(state, abs, playerId);
      // Capture all stacked opponents (rare) - usually one
      // Rule: if 2+ of same color stacked they are safe - check
      const byColor = {};
      for (const v of victims) {
        byColor[v.color] = byColor[v.color] || [];
        byColor[v.color].push(v);
      }
      for (const color of Object.keys(byColor)) {
        if (byColor[color].length >= 2) continue; // block safe
        for (const v of byColor[color]) {
          const vp = getPlayer(state, v.playerId);
          vp.tokens[v.tokenIndex] = -1; // send home
          captured = captured || [];
          captured.push({ playerId: v.playerId, color: v.color, tokenIndex: v.tokenIndex });
        }
      }
    }
  }

  player.tokens[tokenIndex] = newPos;

  if (newPos === FINISH) {
    finishedToken = true;
    if (!Array.isArray(player.finishOrder)) player.finishOrder = [];
    if (!player.finishOrder.includes(tokenIndex)) {
      player.finishOrder.push(tokenIndex);
    }
    player.finished = player.finishOrder.length;
  }

  state.lastMove = {
    type: 'move',
    playerId,
    tokenIndex,
    from: oldPos,
    to: newPos,
    dice,
    captured,
    finishedToken
  };

  // Ranking by arrival; match ends when ≤1 player still racing
  const playerFullyDone = player.finished >= TOKENS_PER_PLAYER;
  if (playerFullyDone) {
    if (!state.winners.includes(playerId)) {
      state.winners.push(playerId);
    }
    const place = state.winners.indexOf(playerId) + 1;
    const placeLabel = place === 1 ? '1º (medalla de oro)' : place === 2 ? '2º' : place === 3 ? '3º' : `${place}º`;
    state.message = `¡${player.name} completó la meta — ${placeLabel}!`;
    maybeFinishMatch(state);
  }

  state.diceRolled = false;
  state.diceValue = null;
  state.selectableTokens = [];

  if (state.status === 'finished') {
    return { ok: true, captured, finishedToken, extraTurn: false, placed: playerFullyDone, state: publicState(state) };
  }

  // Player who already finished all 4 tokens does not keep the turn
  if (playerFullyDone) {
    state.consecutiveSixes = 0;
    advanceTurn(state);
    return { ok: true, captured, finishedToken, extraTurn: false, placed: true, state: publicState(state) };
  }

  const gotExtraTurn = dice === 6 || captured || finishedToken;

  if (gotExtraTurn) {
    // Keep turn, must roll again
    if (dice !== 6) state.consecutiveSixes = 0;
    state.message = captured
      ? `${player.name} capturó una ficha. Tira de nuevo.`
      : finishedToken
        ? `${player.name} llegó a la meta. Tira de nuevo.`
        : `${player.name} sacó 6. Tira de nuevo.`;
    state.mustRollAgain = false;
    // current player stays
    return { ok: true, captured, finishedToken, extraTurn: true, state: publicState(state) };
  }

  state.consecutiveSixes = 0;
  advanceTurn(state);
  return { ok: true, captured, finishedToken, extraTurn: false, state: publicState(state) };
}

function advanceTurn(state) {
  if (state.status !== 'playing') return;
  const n = state.players.length;
  if (maybeFinishMatch(state)) return;

  let next = (state.currentPlayerIndex + 1) % n;
  let guard = 0;
  while (state.players[next].finished >= TOKENS_PER_PLAYER && guard < n) {
    next = (next + 1) % n;
    guard++;
  }
  if (state.players[next].finished >= TOKENS_PER_PLAYER) {
    maybeFinishMatch(state);
    return;
  }
  state.currentPlayerIndex = next;
  state.diceRolled = false;
  state.diceValue = null;
  state.consecutiveSixes = 0;
  state.selectableTokens = [];
  const p = state.players[next];
  state.message = `Turno de ${p.name} (${colorLabel(p.color)})`;
}

function publicState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** Bot AI: roll and pick a move */
function botChooseToken(state, playerId) {
  const movable = getMovableTokens(state, playerId);
  if (movable.length === 0) return null;
  const player = getPlayer(state, playerId);

  // Priority: capture > finish > leave yard > advance furthest
  let best = movable[0];
  let bestScore = -Infinity;

  for (const ti of movable) {
    let score = 0;
    const pos = player.tokens[ti];
    const dice = state.diceValue;
    let newPos = pos === -1 ? 0 : pos + dice;

    if (newPos === FINISH) score += 100;
    if (pos === -1) score += 40;

    if (newPos >= 0 && newPos < 51) {
      const abs = toAbsolute(player.color, newPos);
      if (!isSafeAbsolute(abs)) {
        const victims = tokensOnAbsoluteCell(state, abs, playerId);
        if (victims.length) score += 80;
      }
      // prefer safe landing
      if (isSafeAbsolute(abs)) score += 15;
    }

    // prefer tokens further along
    score += (pos === -1 ? 0 : pos);

    if (score > bestScore) {
      bestScore = score;
      best = ti;
    }
  }
  return best;
}

module.exports = {
  COLORS,
  COLOR_ORDER,
  PATH_LENGTH,
  FINISH,
  TOKENS_PER_PLAYER,
  START_CELLS,
  SAFE_CELLS,
  createInitialState,
  rollDice,
  moveToken,
  getMovableTokens,
  getCurrentPlayer,
  getPlayer,
  publicState,
  botChooseToken,
  toAbsolute,
  advanceTurn,
  maybeFinishMatch,
  activeRacers
};
