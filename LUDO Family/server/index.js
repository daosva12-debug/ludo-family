const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  COLOR_ORDER,
  createInitialState,
  rollDice,
  moveToken,
  getCurrentPlayer,
  publicState,
  botChooseToken
} = require('./gameLogic');

const app = express();
// Needed behind Railway / Render / Nginx / Cloudflare so IPs & HTTPS work
app.set('trust proxy', 1);

const server = http.createServer(app);
const io = new Server(server, {
  // Allow any web origin so friends can open the same deployed URL from phone/PC
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
    credentials: true
  },
  path: '/socket.io',
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 20000,
  // Helpful on mobile networks that drop sockets
  maxHttpBufferSize: 1e6
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
/**
 * Public URL friends can open (Cloudflare tunnel, Railway, etc.).
 * Order: env PUBLIC_BASE_URL → public/public-config.json → empty
 * Re-read on each request so tunnels can update without full redeploy.
 */
function getPublicBaseUrl(req) {
  const fromEnv = String(process.env.PUBLIC_BASE_URL || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (fromEnv && /^https?:\/\//i.test(fromEnv) && !/undefined/i.test(fromEnv)) {
    return fromEnv;
  }
  // Railway / generic proxy: build from request headers (works after first visit)
  try {
    if (req && req.get) {
      const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
      const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim() || 'https';
      if (host && !/^(localhost|127\.0\.0\.1)(:|$)/i.test(host) && !/undefined/i.test(host)) {
        return (proto + '://' + host).replace(/\/+$/, '');
      }
    }
  } catch (_) { /* ignore */ }
  try {
    const fs = require('fs');
    const cfgPath = path.join(__dirname, '../public/public-config.json');
    if (fs.existsSync(cfgPath)) {
      const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const u = String((j && (j.publicBaseUrl || j.publicUrl)) || '')
        .trim()
        .replace(/\/+$/, '');
      if (u && /^https?:\/\//i.test(u) && !/undefined/i.test(u)) return u;
    }
  } catch (_) { /* ignore */ }
  return '';
}

/** @type {Map<string, Room>} */
const rooms = new Map();

// Health check for uptime monitors / deploy platforms
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    app: 'LUDO Family',
    rooms: rooms.size,
    ts: Date.now(),
    uptime: Math.round(process.uptime())
  });
});

app.get('/api/info', (req, res) => {
  const pub = getPublicBaseUrl(req) || null;
  res.json({
    app: 'LUDO Family',
    multiplayer: true,
    maxPlayers: 4,
    realtime: 'socket.io',
    publicBaseUrl: pub,
    // Hint for client: only share this URL with friends (not Arena iframe URLs)
    shareHint: pub
      ? 'Usá este enlace público para invitar amigos'
      : 'Configurá PUBLIC_BASE_URL o abrí la app desde un host accesible (LAN/deploy)'
  });
});

// Lightweight config for the client (no cache)
app.get('/api/public-url', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ publicBaseUrl: getPublicBaseUrl(req) || null });
});

app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    // Avoid stale JS/CSS (preview + production behind CDN)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
}));

// SPA-ish: unknown paths still serve the game (deep links / refresh)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
  if (path.extname(req.path)) return next();
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

/**
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} code
 * @property {string} hostId
 * @property {Array} players
 * @property {object|null} game
 * @property {string} status
 * @property {number} maxPlayers
 * @property {NodeJS.Timeout|null} botTimer
 */

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getRoomByCode(code) {
  for (const room of rooms.values()) {
    if (room.code === code.toUpperCase()) return room;
  }
  return null;
}

function roomPublic(room) {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    maxPlayers: room.maxPlayers,
    hotseat: !!room.hotseat,
    localControllerId: room.localControllerId || null,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isBot: !!p.isBot,
      autoPlay: !!p.autoPlay,
      wasHuman: p.wasHuman !== false && !p.permanentBot,
      permanentBot: !!p.permanentBot,
      connected: p.connected,
      isLocal: !!p.isLocal
    })),
    game: room.game ? publicState(room.game) : null
  };
}

function emitRoom(room) {
  io.to(room.id).emit('room:update', roomPublic(room));
}

function clearBotTimer(room) {
  if (room.botTimer) {
    clearTimeout(room.botTimer);
    room.botTimer = null;
  }
}


function sortGamePlayersClockwise(g) {
  if (!g || !Array.isArray(g.players)) return;
  const cur = g.players[g.currentPlayerIndex];
  const curId = cur && cur.id;
  const order = { green: 0, red: 1, blue: 2, yellow: 3 };
  g.players.sort((a, b) => (order[a.color] ?? 9) - (order[b.color] ?? 9));
  if (curId) {
    const idx = g.players.findIndex((p) => p.id === curId);
    if (idx >= 0) g.currentPlayerIndex = idx;
  }
}

/** Inject a new seat into a live match (all tokens in yard). */
function addSeatToLiveGame(room, seat) {
  if (!room.game || room.game.status !== 'playing') return;
  const g = room.game;
  if (g.players.some((p) => p.id === seat.id)) return;
  g.players.push({
    id: seat.id,
    name: seat.name,
    color: seat.color,
    isBot: !!seat.isBot,
    autoPlay: !!seat.autoPlay,
    tokens: [-1, -1, -1, -1],
    finished: 0,
    finishOrder: []
  });
  sortGamePlayersClockwise(g);
  g.message = `${seat.name} se unió a la partida`;
}

function scheduleBot(room) {
  clearBotTimer(room);
  if (!room.game || room.game.status !== 'playing') return;
  const current = getCurrentPlayer(room.game);
  if (!current || !current.isBot) return;

  // Wait for client dice spin (~1.65s) and/or token step animation (~200ms × steps)
  let delay = 2200 + Math.random() * 500;
  const lm = room.game.lastMove;
  if (lm && lm.type === 'move') {
    const steps = lm.from === -1 ? 1 : Math.max(1, (lm.to - lm.from) | 0);
    const moveAnimMs = steps * 200 + 400;
    delay = Math.max(delay, moveAnimMs + 600);
  } else if (lm && lm.type === 'roll') {
    delay = Math.max(delay, 2300);
  }

  room.botTimer = setTimeout(() => {
    runBotTurn(room);
  }, delay);
}

function runBotTurn(room) {
  if (!room.game || room.game.status !== 'playing') return;
  const current = getCurrentPlayer(room.game);
  if (!current || !current.isBot) return;

  // Need to roll?
  if (!room.game.diceRolled) {
    const result = rollDice(room.game, current.id);
    emitRoom(room);
    io.to(room.id).emit('game:event', {
      type: 'roll',
      playerId: current.id,
      value: result.value,
      skipped: result.skipped,
      noMoves: result.noMoves
    });

    if (result.skipped || result.noMoves) {
      scheduleBot(room);
      return;
    }
    if (result.needsChoice) {
      // Wait so slow dice animation + token heartbeat are visible
      room.botTimer = setTimeout(() => {
        const tokenIndex = botChooseToken(room.game, current.id);
        if (tokenIndex == null) {
          scheduleBot(room);
          return;
        }
        const moveResult = moveToken(room.game, current.id, tokenIndex);
        emitRoom(room);
        io.to(room.id).emit('game:event', {
          type: 'move',
          playerId: current.id,
          tokenIndex,
          from: room.game.lastMove && room.game.lastMove.from,
          to: room.game.lastMove && room.game.lastMove.to,
          dice: room.game.lastMove && room.game.lastMove.dice,
          ...moveResult
        });
        scheduleBot(room);
      }, 1800);
      return;
    }
    // auto-moved
    if (result.ok && result.extraTurn) scheduleBot(room);
    else scheduleBot(room);
    return;
  }

  // Dice already rolled, need choice
  const tokenIndex = botChooseToken(room.game, current.id);
  if (tokenIndex == null) {
    scheduleBot(room);
    return;
  }
  const moveResult = moveToken(room.game, current.id, tokenIndex);
  emitRoom(room);
  io.to(room.id).emit('game:event', {
    type: 'move',
    playerId: current.id,
    tokenIndex,
    from: room.game.lastMove && room.game.lastMove.from,
    to: room.game.lastMove && room.game.lastMove.to,
    dice: room.game.lastMove && room.game.lastMove.dice,
    ...moveResult
  });
  scheduleBot(room);
}


/** Toggle auto-play (bot drives dice + moves) for a human seat; reversible. */
function setSeatAutoPlay(room, playerId, enabled) {
  const rp = room.players.find((p) => p.id === playerId);
  if (!rp) return { ok: false, error: 'Jugador no encontrado' };
  if (rp.permanentBot) {
    return { ok: false, error: 'Ese asiento es un bot fijo' };
  }
  // Only human-origin seats (or currently autoPlay)
  if (rp.isBot && !rp.autoPlay && rp.wasHuman === false) {
    return { ok: false, error: 'No se puede controlar ese bot' };
  }
  const on = !!enabled;
  rp.wasHuman = true;
  rp.autoPlay = on;
  rp.isBot = on;
  rp.permanentBot = false;
  // Keep display name clean
  if (on) {
    if (!/\(auto\)/i.test(rp.name)) {
      rp.name = String(rp.name || 'Jugador').replace(/\s*\((auto|bot)\)\s*$/i, '').trim() + ' (auto)';
    }
  } else {
    rp.name = String(rp.name || 'Jugador').replace(/\s*\((auto|bot)\)\s*$/i, '').trim() || 'Jugador';
  }
  if (room.game && Array.isArray(room.game.players)) {
    const gp = room.game.players.find((p) => p.id === playerId);
    if (gp) {
      gp.isBot = on;
      gp.autoPlay = on;
      gp.name = rp.name;
    }
  }
  return { ok: true, autoPlay: on, playerId };
}

function canToggleAutoPlay(socket, room, targetPlayerId) {
  if (!room || !targetPlayerId) return false;
  const actor = getActorId(socket, room);
  const target = room.players.find((p) => p.id === targetPlayerId);
  if (!target || target.permanentBot) return false;
  if (target.isBot && !target.autoPlay && target.wasHuman === false) return false;
  // Own seat
  if (targetPlayerId === actor) return true;
  // Hotseat / same-PC controller can toggle any human seat
  if (room.hotseat && isRoomController(socket, room)) return true;
  // Local seats owned by this controller
  if (target.isLocal && isRoomController(socket, room)) return true;
  return false;
}

/** Return first color in COLOR_ORDER not used by other players. */
function firstFreeColor(players, exceptId) {
  const used = new Set(
    players.filter((p) => p.id !== exceptId).map((p) => p.color).filter(Boolean)
  );
  return COLOR_ORDER.find((c) => !used.has(c)) || COLOR_ORDER[0];
}

/**
 * Keep chosen colors when unique; only fix missing/duplicate colors.
 * Does NOT reshuffle colors players already picked.
 */
function ensureColors(players) {
  const taken = new Set();
  // Keep valid unique colors; clear duplicates / invalid
  for (const p of players) {
    if (p.color && COLOR_ORDER.includes(p.color) && !taken.has(p.color)) {
      taken.add(p.color);
    } else {
      p.color = null;
    }
  }
  // Assign free colors to anyone still missing one
  for (const p of players) {
    if (!p.color) {
      p.color = COLOR_ORDER.find((c) => !taken.has(c)) || COLOR_ORDER[0];
      taken.add(p.color);
    }
  }
}

function sanitizeClientId(id) {
  if (!id || typeof id !== 'string') return null;
  const s = id.trim().slice(0, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(s)) return null;
  return s;
}

function findPlayer(room, idOrSocket) {
  if (!room) return null;
  return room.players.find((p) => p.id === idOrSocket || p.socketId === idOrSocket) || null;
}

function getActorId(socket, room) {
  const cid = socket.data && socket.data.clientId;
  if (cid && room && room.players.some((p) => p.id === cid)) return cid;
  const bySock = room && room.players.find((p) => p.socketId === socket.id);
  if (bySock) return bySock.id;
  return socket.id;
}

/** Who is allowed to roll/move on this socket (hotseat: controller plays every human seat) */
function resolveGameActor(socket, room, preferredId) {
  if (!room) return null;
  const controller = getActorId(socket, room);
  const isController =
    room.localControllerId === controller ||
    room.hostId === controller ||
    (socket.data && socket.data.clientId && socket.data.clientId === room.localControllerId);

  // Hotseat / same-PC: one browser controls all non-bot seats
  if (room.hotseat && isController && room.game) {
    const cur = room.game.players[room.game.currentPlayerIndex];
    if (cur && !cur.isBot) return cur.id;
    // fallback preferred local seat
    if (preferredId && room.players.some((p) => p.id === preferredId && !p.isBot)) {
      return preferredId;
    }
  }

  // Optional preferred seat if this socket owns it (or is hotseat controller)
  if (preferredId && room.players.some((p) => p.id === preferredId && !p.isBot)) {
    if (preferredId === controller) return preferredId;
    if (room.hotseat && isController) return preferredId;
  }
  return controller;
}

function isRoomController(socket, room) {
  if (!room) return false;
  const id = getActorId(socket, room);
  return id === room.hostId || id === room.localControllerId;
}

io.on('connection', (socket) => {
  let currentRoomId = null;
  let playerId = socket.id;

  socket.emit('connected', { playerId: socket.id, serverTime: Date.now() });

  // Resume seat after network drop / phone lock / tab refresh
  socket.on('room:rejoin', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    try {
      const code = ((payload && payload.code) || '').trim().toUpperCase();
      const clientId = sanitizeClientId(payload && payload.clientId);
      if (!code || !clientId) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Faltan datos para reconectar' });
      }
      const room = getRoomByCode(code);
      if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sala no encontrada' });
      const player = room.players.find((p) => p.id === clientId);
      if (!player) return typeof cb === 'function' && cb({ ok: false, error: 'No estás en esta sala' });

      // If this seat was converted to bot on disconnect, reclaim as human
      player.isBot = false;
      player.connected = true;
      player.socketId = socket.id;
      if (payload.name) {
        const n = String(payload.name).trim().slice(0, 12);
        if (n) player.name = n.replace(/\s*\(bot\)?$/i, '').trim() || player.name;
      } else {
        player.name = String(player.name || 'Jugador').replace(/\s*\(bot\)?$/i, '').trim() || 'Jugador';
      }

      // Restore host: keep original hostId if this is them; else pick if current host gone
      if (room.hostId === player.id) {
        // already host — stay
      } else if (!room.players.some((p) => p.id === room.hostId && p.connected && !p.isBot)) {
        room.hostId = player.id;
      }

      currentRoomId = room.id;
      playerId = clientId;
      socket.data.clientId = clientId;
      socket.join(room.id);
      if (room._gcTimer) {
        clearTimeout(room._gcTimer);
        room._gcTimer = null;
      }
      if (typeof cb === 'function') {
        cb({ ok: true, room: roomPublic(room), playerId: clientId, code: room.code });
      }
      emitRoom(room);
      if (room.status === 'playing') {
        scheduleBot(room);
      }
    } catch (e) {
      if (typeof cb === 'function') cb({ ok: false, error: e.message || 'Error al reconectar' });
    }
  });

  socket.on('room:create', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    try {
      const name = (payload && payload.name) || 'Jugador';
      const maxPlayers = (payload && payload.maxPlayers) || 4;
      const clientId = sanitizeClientId(payload && payload.clientId) || socket.id;
      const code = generateCode();
      const roomId = uuidv4();
      const hotseat = !!(payload && payload.hotseat);
      const player = {
        id: clientId,
        socketId: socket.id,
        name: String(name || (hotseat ? 'Jugador 1' : 'Jugador')).trim().slice(0, 12) || 'Jugador',
        color: (payload && payload.color && COLOR_ORDER.includes(String(payload.color).toLowerCase()))
          ? String(payload.color).toLowerCase()
          : COLOR_ORDER[0],
        isBot: false,
        wasHuman: true,
        autoPlay: false,
        permanentBot: false,
        connected: true,
        isLocal: hotseat
      };
      const room = {
        id: roomId,
        code,
        hostId: clientId,
        localControllerId: clientId,
        hotseat,
        players: [player],
        game: null,
        status: 'lobby',
        maxPlayers: Math.min(4, Math.max(2, maxPlayers || 4)),
        botTimer: null,
        createdAt: Date.now()
      };
      rooms.set(roomId, room);
      currentRoomId = roomId;
      playerId = clientId;
      socket.data.clientId = clientId;
      socket.join(roomId);
      const pub = roomPublic(room);
      if (typeof cb === 'function') cb({ ok: true, room: pub, playerId: clientId, code: room.code });
      emitRoom(room);
    } catch (e) {
      if (typeof cb === 'function') cb({ ok: false, error: e.message });
    }
  });

  socket.on('room:join', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    try {
      const code = ((payload && payload.code) || '').trim().toUpperCase();
      const name = (payload && payload.name) || 'Jugador';
      const clientId = sanitizeClientId(payload && payload.clientId) || socket.id;
      const room = getRoomByCode(code);
      if (!room) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Sala no encontrada' });
        return;
      }
      if (room.status !== 'lobby' && room.status !== 'playing') {
        if (typeof cb === 'function') cb({ ok: false, error: 'No se puede unir a esta sala ahora' });
        return;
      }

      // Already in room with same clientId → just reconnect socket
      const existing = room.players.find((p) => p.id === clientId && !p.isBot);
      if (existing) {
        existing.socketId = socket.id;
        existing.connected = true;
        if (name) existing.name = String(name).trim().slice(0, 12) || existing.name;
        currentRoomId = room.id;
        playerId = clientId;
        socket.data.clientId = clientId;
        socket.join(room.id);
        if (typeof cb === 'function') cb({ ok: true, room: roomPublic(room), playerId: clientId, code: room.code });
        emitRoom(room);
        return;
      }

      const humanCount = room.players.filter((p) => !p.isBot).length;
      if (humanCount >= room.maxPlayers) {
        if (typeof cb === 'function') cb({ ok: false, error: 'Sala llena' });
        return;
      }
      if (room.players.length >= 4) {
        const botIdx = room.players.findIndex((p) => p.isBot);
        if (botIdx >= 0) room.players.splice(botIdx, 1);
        else {
          if (typeof cb === 'function') cb({ ok: false, error: 'Sala llena' });
          return;
        }
      }

      const player = {
        id: clientId,
        socketId: socket.id,
        name: String(name || 'Jugador').trim().slice(0, 12) || 'Jugador',
        color: firstFreeColor(room.players, null),
        isBot: false,
        wasHuman: true,
        autoPlay: false,
        permanentBot: false,
        connected: true
      };
      room.players.push(player);
      ensureColors(room.players);
      if (room.status === 'playing' && room.game) {
        addSeatToLiveGame(room, player);
        io.to(room.id).emit('game:event', { type: 'player-joined', playerId: player.id, name: player.name });
      }
      currentRoomId = room.id;
      playerId = clientId;
      socket.data.clientId = clientId;
      socket.join(room.id);
      if (typeof cb === 'function') cb({ ok: true, room: roomPublic(room), playerId: clientId, code: room.code });
      emitRoom(room);
      if (room.status === 'playing') scheduleBot(room);
    } catch (e) {
      if (typeof cb === 'function') cb({ ok: false, error: e.message });
    }
  });

  socket.on('room:addBot', (payload, cb) => {
    // socket.io may pass cb as first arg if client sends no payload
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    const room = rooms.get(currentRoomId);
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala. Volvé a crear la sala.' });
    if (room.hostId !== getActorId(socket, room) && !isRoomController(socket, room)) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Solo el anfitrión puede agregar bots' });
    }
    if (room.status !== 'lobby' && room.status !== 'playing') {
      return typeof cb === 'function' && cb({ ok: false, error: 'No se puede agregar ahora' });
    }
    if (room.players.length >= 4) return typeof cb === 'function' && cb({ ok: false, error: 'Máximo 4 jugadores' });

    const botNames = ['Bot Ana', 'Bot Leo', 'Bot Sol', 'Bot Max', 'Bot Kim', 'Bot Sam'];
    const used = new Set(room.players.map(p => p.name));
    const name = botNames.find(n => !used.has(n)) || `Bot ${room.players.length + 1}`;
    const seat = {
      id: 'bot-' + uuidv4().slice(0, 8),
      name,
      color: firstFreeColor(room.players, null),
      isBot: true,
      permanentBot: true,
      wasHuman: false,
      autoPlay: false,
      connected: true
    };
    room.players.push(seat);
    ensureColors(room.players);
    if (room.status === 'playing' && room.game) {
      addSeatToLiveGame(room, seat);
      io.to(room.id).emit('game:event', { type: 'player-joined', playerId: seat.id, name: seat.name });
    }
    emitRoom(room);
    if (typeof cb === 'function') cb({ ok: true, room: roomPublic(room) });
    if (room.status === 'playing') scheduleBot(room);
  });

  socket.on('room:removePlayer', ({ targetId }, cb) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    if (room.hostId !== getActorId(socket, room)) return typeof cb === 'function' && cb({ ok: false, error: 'Solo el host' });
    if (room.status !== 'lobby') return;
    if (targetId === room.hostId) return typeof cb === 'function' && cb({ ok: false, error: 'No puedes echar al host' });
    const leaving = room.players.find((p) => p.id === targetId);
    room.players = room.players.filter((p) => p.id !== targetId);
    ensureColors(room.players);
    emitRoom(room);
    if (leaving && leaving.socketId) {
      io.to(leaving.socketId).emit('room:kicked');
    } else {
      io.to(targetId).emit('room:kicked');
    }
    if (typeof cb === 'function') cb({ ok: true });
  });

  /** Player edits own name and/or house color while in lobby */
  /** Same-PC / hotseat: add another human seat controlled by this browser */
  socket.on('room:addLocalPlayer', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    const room = rooms.get(currentRoomId);
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala' });
    if (room.status !== 'lobby' && room.status !== 'playing') {
      return typeof cb === 'function' && cb({ ok: false, error: 'No se puede agregar ahora' });
    }
    if (!isRoomController(socket, room)) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Solo el anfitrión puede sumar jugadores locales' });
    }
    if (room.players.length >= 4) return typeof cb === 'function' && cb({ ok: false, error: 'Máximo 4 jugadores' });

    room.hotseat = true;
    if (!room.localControllerId) room.localControllerId = getActorId(socket, room);

    const nHuman = room.players.filter((p) => !p.isBot && !p.permanentBot).length + 1;
    const nameRaw = payload.name != null ? String(payload.name) : ('Jugador ' + nHuman);
    const name = nameRaw.trim().slice(0, 12) || ('Jugador ' + nHuman);
    let color = payload.color && COLOR_ORDER.includes(String(payload.color).toLowerCase())
      ? String(payload.color).toLowerCase()
      : firstFreeColor(room.players, null);

    if (room.players.some((p) => p.color === color)) {
      color = firstFreeColor(room.players, null);
    }

    const localId = 'local-' + uuidv4().slice(0, 8);
    const seat = {
      id: localId,
      socketId: null,
      name,
      color,
      isBot: false,
      wasHuman: true,
      autoPlay: false,
      permanentBot: false,
      connected: true,
      isLocal: true
    };
    room.players.push(seat);
    ensureColors(room.players);
    if (room.status === 'playing' && room.game) {
      addSeatToLiveGame(room, seat);
      io.to(room.id).emit('game:event', { type: 'player-joined', playerId: seat.id, name: seat.name });
    }
    emitRoom(room);
    if (typeof cb === 'function') cb({ ok: true, room: roomPublic(room), playerId: localId });
    if (room.status === 'playing') scheduleBot(room);
  });

  /** Edit a local (same-PC) seat name/color in lobby */
  socket.on('room:updateLocalPlayer', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    const room = rooms.get(currentRoomId);
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala' });
    if (room.status !== 'lobby' && room.status !== 'playing') {
      return typeof cb === 'function' && cb({ ok: false, error: 'No se puede editar ahora' });
    }
    if (!isRoomController(socket, room)) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Solo el anfitrión' });
    }
    const targetId = payload.targetId || payload.playerId;
    const player = room.players.find((p) => p.id === targetId);
    if (!player || player.isBot) {
      return typeof cb === 'function' && cb({ ok: false, error: 'Jugador no encontrado' });
    }
    // Only seats in this hotseat / host seat
    const controller = getActorId(socket, room);
    const okTarget = player.id === controller || player.isLocal || room.hotseat;
    if (!okTarget) {
      return typeof cb === 'function' && cb({ ok: false, error: 'No podés editar ese jugador' });
    }

    if (typeof payload.name === 'string') {
      const n = payload.name.trim().slice(0, 12);
      if (n) player.name = n;
    }
    if (typeof payload.color === 'string') {
      const color = payload.color.toLowerCase();
      if (!COLOR_ORDER.includes(color)) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Color inválido' });
      }
      const taken = room.players.some((p) => p.id !== player.id && p.color === color);
      if (taken) return typeof cb === 'function' && cb({ ok: false, error: 'Ese color ya está ocupado' });
      player.color = color;
    }
    ensureColors(room.players);
    emitRoom(room);
    if (typeof cb === 'function') cb({ ok: true, room: roomPublic(room) });
  });

  socket.on('room:setProfile', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    const room = rooms.get(currentRoomId);
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala' });
    if (room.status !== 'lobby' && room.status !== 'playing') {
      return typeof cb === 'function' && cb({ ok: false, error: 'No se puede editar ahora' });
    }
    const player = room.players.find((p) => p.id === getActorId(socket, room));
    if (!player || (player.isBot && !player.autoPlay)) {
      return typeof cb === 'function' && cb({ ok: false, error: 'No se pudo actualizar el perfil' });
    }

    if (payload && typeof payload.name === 'string') {
      const n = payload.name.trim().slice(0, 12);
      if (n) {
        player.name = n;
      }
    }

    if (payload && typeof payload.color === 'string') {
      const color = payload.color.toLowerCase();
      if (!COLOR_ORDER.includes(color)) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Color inválido' });
      }
      const taken = room.players.some((p) => p.id !== player.id && p.color === color);
      if (taken) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Ese color ya está ocupado' });
      }
      player.color = color;
    }

    ensureColors(room.players);
    if (room.game && Array.isArray(room.game.players)) {
      const gp = room.game.players.find((p) => p.id === player.id);
      if (gp) {
        gp.name = player.name;
        const allYard = Array.isArray(gp.tokens) && gp.tokens.every((t) => t === -1);
        if (room.status === 'lobby' || allYard) {
          gp.color = player.color;
          sortGamePlayersClockwise(room.game);
        }
      }
    }
    emitRoom(room);
    if (typeof cb === 'function') cb({ ok: true, room: roomPublic(room) });
  });

  socket.on('room:restart', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    try {
      const room = rooms.get(currentRoomId);
      if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala' });
      if (!isRoomController(socket, room) && room.hostId !== getActorId(socket, room)) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Solo el anfitrión puede reiniciar' });
      }
      if (room.players.length < 2) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Mínimo 2 jugadores' });
      }
      clearBotTimer(room);
      room.players.forEach((p) => {
        if (p.autoPlay && !p.permanentBot) {
          p.autoPlay = false;
          p.isBot = false;
          p.name = String(p.name || 'Jugador').replace(/\s*\((auto|bot)\)\s*$/i, '').trim() || 'Jugador';
        }
      });
      ensureColors(room.players);
      room.game = createInitialState(room.players);
      room.status = 'playing';
      const pub = roomPublic(room);
      emitRoom(room);
      io.to(room.id).emit('game:started', pub);
      io.to(room.id).emit('game:event', { type: 'restart' });
      if (typeof cb === 'function') cb({ ok: true, room: pub });
      scheduleBot(room);
    } catch (e) {
      console.error('restart error', e);
      if (typeof cb === 'function') cb({ ok: false, error: e.message || 'Error al reiniciar' });
    }
  });

  socket.on('room:start', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    const room = rooms.get(currentRoomId);
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala. Volvé a crear la sala.' });
    if (room.hostId !== getActorId(socket, room)) return typeof cb === 'function' && cb({ ok: false, error: 'Solo el anfitrión puede iniciar' });
    if (room.players.length < 2) {
      return typeof cb === 'function' && cb({
        ok: false,
        error: 'Mínimo 2 jugadores. Agregá un bot o tocá “Jugar ahora”.'
      });
    }
    if (room.status !== 'lobby') return typeof cb === 'function' && cb({ ok: false, error: 'La partida ya empezó' });

    try {
      ensureColors(room.players);
      room.game = createInitialState(room.players);
      // keep random starter message from createInitialState
      room.status = 'playing';
      const pub = roomPublic(room);
      emitRoom(room);
      io.to(room.id).emit('game:started', pub);
      if (typeof cb === 'function') cb({ ok: true, room: pub });
      scheduleBot(room);
    } catch (e) {
      console.error('start error', e);
      if (typeof cb === 'function') cb({ ok: false, error: e.message || 'Error al iniciar' });
    }
  });

  // Fill bots to target count (default 4) then start
  socket.on('room:quickStart', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    const fillTo = payload.fillTo != null ? payload.fillTo : 4;
    const start = payload.start !== false;

    const room = rooms.get(currentRoomId);
    if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala. Volvé a crear la sala.' });
    if (room.hostId !== getActorId(socket, room)) return typeof cb === 'function' && cb({ ok: false, error: 'Solo el anfitrión' });
    if (room.status !== 'lobby') return typeof cb === 'function' && cb({ ok: false, error: 'La partida ya empezó' });

    try {
      const botNames = ['Bot Ana', 'Bot Leo', 'Bot Sol', 'Bot Max', 'Bot Kim', 'Bot Sam'];
      const target = Math.min(4, Math.max(2, fillTo || 4));
      while (room.players.length < target) {
        const used = new Set(room.players.map(p => p.name));
        const name = botNames.find(n => !used.has(n)) || `Bot ${room.players.length + 1}`;
        room.players.push({
          id: 'bot-' + uuidv4().slice(0, 8),
          name,
          color: COLOR_ORDER[room.players.length % 4],
          isBot: true,
          permanentBot: true,
          wasHuman: false,
          autoPlay: false,
          connected: true
        });
      }
      ensureColors(room.players);

      if (!start) {
        const pub = roomPublic(room);
        emitRoom(room);
        return typeof cb === 'function' && cb({ ok: true, room: pub });
      }

      room.game = createInitialState(room.players);
      // keep random starter message from createInitialState
      room.status = 'playing';
      const pub = roomPublic(room);
      emitRoom(room);
      io.to(room.id).emit('game:started', pub);
      if (typeof cb === 'function') cb({ ok: true, room: pub });
      scheduleBot(room);
    } catch (e) {
      console.error('quickStart error', e);
      if (typeof cb === 'function') cb({ ok: false, error: e.message || 'Error al iniciar' });
    }
  });

  
  socket.on('player:autoplay', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    try {
      const room = rooms.get(currentRoomId);
      if (!room) return typeof cb === 'function' && cb({ ok: false, error: 'Sin sala' });
      if (room.status !== 'playing' || !room.game) {
        return typeof cb === 'function' && cb({ ok: false, error: 'Solo durante la partida' });
      }
      const targetId = payload.playerId || payload.asPlayerId;
      if (!targetId) return typeof cb === 'function' && cb({ ok: false, error: 'Falta jugador' });
      if (!canToggleAutoPlay(socket, room, targetId)) {
        return typeof cb === 'function' && cb({ ok: false, error: 'No podés cambiar el auto-juego de ese jugador' });
      }
      const enabled = payload.enabled == null ? true : !!payload.enabled;
      // If payload.toggle, flip
      const target = room.players.find((p) => p.id === targetId);
      const turnOn = payload.toggle ? !(target && target.autoPlay) : enabled;
      const result = setSeatAutoPlay(room, targetId, turnOn);
      if (!result.ok) return typeof cb === 'function' && cb(result);
      emitRoom(room);
      io.to(room.id).emit('game:event', {
        type: 'autoplay',
        playerId: targetId,
        autoPlay: turnOn
      });
      if (typeof cb === 'function') cb({ ok: true, autoPlay: turnOn, playerId: targetId });
      if (turnOn) scheduleBot(room);
      else {
        // Stopping auto: clear pending bot action for this seat
        clearBotTimer(room);
        scheduleBot(room); // in case another bot is current
      }
    } catch (e) {
      console.error('autoplay error', e);
      if (typeof cb === 'function') cb({ ok: false, error: e.message || 'Error' });
    }
  });

  socket.on('game:roll', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    const room = rooms.get(currentRoomId);
    if (!room || !room.game) return typeof cb === 'function' && cb({ ok: false, error: 'Sin partida' });
    const actorId = resolveGameActor(socket, room, payload.asPlayerId || payload.playerId);
    if (!actorId) return typeof cb === 'function' && cb({ ok: false, error: 'Sin jugador' });
    const result = rollDice(room.game, actorId);
    if (!result.ok) return typeof cb === 'function' && cb(result);
    emitRoom(room);
    io.to(room.id).emit('game:event', {
      type: 'roll',
      playerId: actorId,
      value: result.value,
      skipped: result.skipped,
      noMoves: result.noMoves,
      needsChoice: result.needsChoice,
      movable: result.movable
    });
    if (typeof cb === 'function') cb(result);
    scheduleBot(room);
  });

  socket.on('game:move', (payload, cb) => {
    if (typeof payload === 'function') { cb = payload; payload = {}; }
    payload = payload || {};
    const tokenIndex = payload.tokenIndex;
    const room = rooms.get(currentRoomId);
    if (!room || !room.game) return typeof cb === 'function' && cb({ ok: false, error: 'Sin partida' });
    const actorId = resolveGameActor(socket, room, payload.asPlayerId || payload.playerId);
    if (!actorId) return typeof cb === 'function' && cb({ ok: false, error: 'Sin jugador' });
    const result = moveToken(room.game, actorId, tokenIndex);
    if (!result.ok) return typeof cb === 'function' && cb(result);
    emitRoom(room);
    io.to(room.id).emit('game:event', {
      type: 'move',
      playerId: actorId,
      tokenIndex,
      from: room.game.lastMove && room.game.lastMove.from,
      to: room.game.lastMove && room.game.lastMove.to,
      dice: room.game.lastMove && room.game.lastMove.dice,
      captured: result.captured,
      finishedToken: result.finishedToken,
      extraTurn: result.extraTurn
    });
    if (typeof cb === 'function') cb(result);
    scheduleBot(room);
  });

  socket.on('room:leave', () => {
    // Explicit leave: drop the seat (lobby) / permanent bot (in game)
    leaveRoom(socket, { intentional: true });
  });

  socket.on('chat:message', ({ text }) => {
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const player = findPlayer(room, getActorId(socket, room)) || findPlayer(room, socket.id);
    if (!player) return;
    const msg = String(text || '').trim().slice(0, 200);
    if (!msg) return;
    io.to(room.id).emit('chat:message', {
      playerId: player.id,
      name: player.name,
      color: player.color,
      text: msg,
      at: Date.now()
    });
  });

  socket.on('disconnect', () => {
    // Network drop / refresh: keep seat so room:rejoin can reclaim it
    leaveRoom(socket, { intentional: false });
  });

  /**
   * @param {import('socket.io').Socket} sock
   * @param {{ intentional?: boolean }} opts
   *   intentional=true  → user left / kicked path: remove from lobby
   *   intentional=false → disconnect: keep seat (lobby) or temp-bot (playing) for rejoin
   */
  function leaveRoom(sock, opts) {
    const intentional = !!(opts && opts.intentional);
    const room = rooms.get(currentRoomId);
    if (!room) {
      currentRoomId = null;
      return;
    }
    clearBotTimer(room);
    const cid = (sock.data && sock.data.clientId) || null;
    const idx = room.players.findIndex(
      (p) => p.socketId === sock.id || (cid && p.id === cid) || p.id === sock.id
    );
    if (idx >= 0) {
      const p = room.players[idx];
      if (room.status === 'lobby') {
        if (intentional) {
          room.players.splice(idx, 1);
          ensureColors(room.players);
          if (room.hostId === p.id) {
            const nextHost = room.players.find((x) => x.connected && !x.isBot);
            if (nextHost) room.hostId = nextHost.id;
            else {
              const any = room.players.find((x) => !x.isBot) || room.players[0];
              if (any) room.hostId = any.id;
            }
          }
        } else {
          // Soft disconnect: keep seat + host role for rejoin (phone lock, refresh, flaky wifi)
          p.connected = false;
          p.socketId = null;
          // Do NOT steal hostId — room:rejoin restores the same player as host
        }
      } else {
        // In-game: AI takes over until they rejoin
        p.connected = false;
        p.socketId = null;
        // AFK / disconnect → temporary bot (reclaimable = auto-play seat)
        p.isBot = true;
        p.autoPlay = true;
        p.wasHuman = true;
        p.permanentBot = false;
        if (room.game && Array.isArray(room.game.players)) {
          const gp = room.game.players.find((x) => x.id === p.id);
          if (gp) { gp.isBot = true; gp.autoPlay = true; gp.name = p.name; }
        }
        const base = String(p.name || 'Jugador').replace(/\s*\(bot\)?$/i, '').trim() || 'Jugador';
        if (!/\(bot\)$/i.test(p.name || '')) p.name = base + ' (bot)';
        if (room.hostId === p.id) {
          const nextHost = room.players.find((x) => x.connected && !x.isBot);
          if (nextHost) room.hostId = nextHost.id;
        }
        // Intentional leave mid-game: same bot conversion (seat stays so board stays valid)
      }
    }

    const realHumans = room.players.filter((x) => x.connected && !x.isBot);
    if (room.status === 'lobby') {
      // Delete only when empty of human seats (connected or waiting to rejoin)
      const humanSeats = room.players.filter((x) => !x.isBot);
      if (humanSeats.length === 0) {
        rooms.delete(room.id);
      } else if (realHumans.length === 0) {
        // Everyone offline briefly — keep room ~10 min for rejoin, then GC
        emitRoom(room);
        scheduleRoomGC(room);
      } else {
        emitRoom(room);
      }
    } else {
      if (realHumans.length === 0) {
        // No one online: keep a bit then GC so refresh can rejoin
        emitRoom(room);
        scheduleBot(room);
        scheduleRoomGC(room);
      } else {
        emitRoom(room);
        scheduleBot(room);
      }
    }
    try { sock.leave(room.id); } catch (_) {}
    currentRoomId = null;
  }
});

/** Soft-delete empty rooms after grace period so reconnect works */
const ROOM_GC_MS = 10 * 60 * 1000;
function scheduleRoomGC(room) {
  if (!room || room._gcTimer) return;
  room._gcTimer = setTimeout(() => {
    room._gcTimer = null;
    const still = rooms.get(room.id);
    if (!still) return;
    const online = still.players.some((p) => p.connected && !p.isBot);
    if (!online) {
      clearBotTimer(still);
      rooms.delete(still.id);
    }
  }, ROOM_GC_MS);
}

server.listen(PORT, HOST, () => {
  console.log(`LUDO Family running on http://${HOST}:${PORT}`);
  const pub = getPublicBaseUrl();
  if (pub) {
    console.log(`Public invite base: ${pub}`);
  } else {
    console.log('Online multiplayer ready — run ./start-online.sh or set PUBLIC_BASE_URL');
  }
});
