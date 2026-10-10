const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

// ================== CONFIG GENERAL ==================
const MAX_PLAYERS = 5;
const ARENA_RADIUS = 85;
const RESPAWN_MS = 3000;
const KILL_LIMIT = 20;
const MATCH_TIME_MS = 8 * 60 * 1000;
const RESTART_DELAY_MS = 12000;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ================== CLASES ==================
const CLASSES = {
  warrior: { name: 'Guerrero', hp: 160, speed: 6.2, jumpForce: 7.5, attackRange: 2.8, attackAngle: 75, attackDamage: 22, attackCooldown: 850, ranged: false },
  rogue:   { name: 'Asesino',  hp: 105, speed: 8.4, jumpForce: 8,   attackRange: 2.2, attackAngle: 85, attackDamage: 14, attackCooldown: 420, ranged: false },
  mage:    { name: 'Mago',     hp: 75,  speed: 6.4, jumpForce: 7.5, attackRange: 27,  attackAngle: 18, attackDamage: 17, attackCooldown: 1100, ranged: true, projectileSpeed: 17 },
  ranger:  { name: 'Arquero',  hp: 95,  speed: 7.2, jumpForce: 7.8, attackRange: 30,  attackAngle: 14, attackDamage: 15, attackCooldown: 750, ranged: true, projectileSpeed: 24 },
  cleric:  { name: 'Clérigo',  hp: 120, speed: 6.0, jumpForce: 7.3, attackRange: 2.6, attackAngle: 70, attackDamage: 16, attackCooldown: 900, ranged: false }
};

// ================== HABILIDADES (4 por clase) ==================
const ABILITIES = {
  warrior: {
    1: { name:'Golpe Giratorio', type:'aoe_self', radius:3.4, damage:26, cooldown:6000, anim:'Sword_AttackFast' },
    2: { name:'Grito de Guerra', type:'buff', duration:5000, dmgMult:1.35, speedMult:1.25, cooldown:15000, anim:'Idle_Attacking' },
    3: { name:'Bloqueo de Escudo', type:'shield', duration:4000, defMult:0.4, cooldown:14000, anim:'Idle_Weapon' },
    4: { name:'Estocada', type:'dash', distance:7, damage:24, width:1.6, cooldown:8000, anim:'Roll' }
  },
  rogue: {
    1: { name:'Ráfaga de Cuchillas', type:'aoe_self', radius:2.6, damage:30, hits:3, cooldown:7000, anim:'Dagger_Attack2' },
    2: { name:'Sombra', type:'dash', distance:9, damage:0, width:1.2, cooldown:10000, anim:'Roll', invulnMs:400 },
    3: { name:'Veneno', type:'dot', range:8, angle:50, initialDamage:6, tickDamage:5, ticks:4, tickIntervalMs:900, cooldown:12000, anim:'Dagger_Attack' },
    4: { name:'Golpe Certero', type:'strike', range:2.4, angle:40, damage:38, cooldown:9000, anim:'Dagger_Attack' }
  },
  mage: {
    1: { name:'Lanza de Hielo', type:'projectile_aoe', damage:28, splash:2.2, speed:20, element:'ice', cooldown:5000, anim:'Spell1' },
    2: { name:'Bola de Fuego', type:'projectile_aoe', damage:34, splash:3.4, speed:13, element:'fire', cooldown:9500, anim:'Spell2' },
    3: { name:'Parpadeo', type:'dash', distance:8, damage:0, width:1, cooldown:10000, anim:'Staff_Attack', invulnMs:300 },
    4: { name:'Nova de Escarcha', type:'aoe_self', radius:3.2, damage:22, cooldown:9000, anim:'Spell1', element:'ice' }
  },
  ranger: {
    1: { name:'Disparo Múltiple', type:'multi_projectile', count:3, spreadDeg:16, damage:14, splash:0.6, speed:24, element:'arrow', cooldown:7000, anim:'Bow_Attack_Shoot' },
    2: { name:'Trampa', type:'timed_aoe', delayMs:1400, radius:2.6, damage:26, cooldown:11000, anim:'Bow_Attack_Draw' },
    3: { name:'Retirada', type:'dash', distance:7, damage:0, width:1, backward:true, cooldown:9000, anim:'Roll', invulnMs:350 },
    4: { name:'Disparo Certero', type:'projectile_aoe', damage:40, splash:0.5, speed:30, element:'arrow', cooldown:9500, anim:'Bow_Attack_Shoot' }
  },
  cleric: {
    1: { name:'Golpe Sagrado', type:'aoe_self', radius:3, damage:24, cooldown:7000, anim:'Staff_Attack' },
    2: { name:'Curación', type:'heal', amount:45, cooldown:13000, anim:'Spell1' },
    3: { name:'Campo Sagrado', type:'shield', duration:5000, defMult:0.5, cooldown:16000, anim:'Spell2' },
    4: { name:'Rayo Sagrado', type:'projectile_aoe', damage:26, splash:1.2, speed:22, element:'holy', cooldown:6500, anim:'Spell1' }
  }
};

// ================== MONSTRUOS Y NIVELES ==================
const MONSTER_DEFS = {
  slime:    { name:'Slime',    hp:38,  speed:2.1, damage:6,  range:1.4, atkCooldown:1300, xp:14,  respawn:6000,  aggro:7 },
  skeleton: { name:'Esqueleto',hp:90,  speed:3.4, damage:12, range:1.9, atkCooldown:1000, xp:32,  respawn:12000, aggro:8 },
  dragon:   { name:'Dragón',   hp:450, speed:2.6, damage:30, range:3.8, atkCooldown:1700, xp:220, respawn:75000, aggro:12 }
};
// Puntos de aparicion repartidos por el mapa (mas cantidad que antes)
const MONSTER_SPAWNS = [
  { type:'slime', x:11, z:11 }, { type:'slime', x:-11, z:11 },
  { type:'slime', x:11, z:-11 }, { type:'slime', x:-11, z:-11 },
  { type:'slime', x:26, z:5 },  { type:'slime', x:-26, z:-5 },
  { type:'slime', x:5, z:26 },  { type:'slime', x:-5, z:-26 },
  { type:'slime', x:0, z:0 },   { type:'slime', x:18, z:-18 },
  { type:'skeleton', x:0, z:38 }, { type:'skeleton', x:0, z:-38 },
  { type:'skeleton', x:38, z:0 }, { type:'skeleton', x:-38, z:0 },
  { type:'skeleton', x:20, z:20 }, { type:'skeleton', x:-20, z:20 },
  { type:'dragon', x:0, z:62 }
];
// Zonas rectangulares aproximadas de las estructuras grandes del mapa,
// usadas por la IA de monstruos para rodearlas en vez de empujar contra
// ellas en linea recta (evasion simple, sin pathfinding real).
const STRUCTURE_ZONES = [
  { minX:-14, maxX:14, minZ:-14, maxZ:14 },   // estructura central
  { minX:-11, maxX:11, minZ:32, maxZ:52 },    // norte
  { minX:-11, maxX:11, minZ:-52, maxZ:-32 },  // sur
  { minX:32, maxX:52, minZ:-11, maxZ:11 },    // este
  { minX:-52, maxX:-32, minZ:-11, maxZ:11 }   // oeste
];
function xpForLevel(lvl) { return 50 + lvl*40; }
const MAX_LEVEL = 20;

function randCode() {
  let c = '';
  for (let i=0;i<5;i++) c += ROOM_CODE_CHARS[Math.floor(Math.random()*ROOM_CODE_CHARS.length)];
  return c;
}

// ================== ESTADO DE SALAS ==================
const rooms = new Map();

function spawnMonstersForRoom(room) {
  room.monsters = {};
  MONSTER_SPAWNS.forEach((s, i) => {
    const def = MONSTER_DEFS[s.type];
    const id = 'm_' + i;
    room.monsters[id] = {
      id, type:s.type, name:def.name, x:s.x, z:s.z, ry:0,
      hp:def.hp, maxHp:def.hp, alive:true, spawnX:s.x, spawnZ:s.z,
      lastAttack:0, targetId:null, invulnUntil:0, forceTargetId:null, forceChaseUntil:0
    };
  });
}

function createRoom() {
  let code;
  do { code = randCode(); } while (rooms.has(code));
  const room = {
    code, players: {}, projectiles: [], monsters: {},
    matchState: 'waiting', matchEndsAt: 0, matchTimer: null
  };
  spawnMonstersForRoom(room);
  rooms.set(code, room);
  return room;
}

function randomSpawn() {
  const angle = Math.random() * Math.PI * 2;
  const r = 6 + Math.random() * (ARENA_RADIUS * 0.35);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

function publicPlayer(p) {
  return { id:p.id, name:p.name, class:p.class, x:p.x, y:p.y, z:p.z, ry:p.ry,
           hp:p.hp, maxHp:p.maxHp, alive:p.alive, kills:p.kills, deaths:p.deaths,
           level:p.level, xp:p.xp, xpNeeded:xpForLevel(p.level) };
}
function publicMonster(m) {
  return { id:m.id, type:m.type, name:m.name, x:m.x, z:m.z, ry:m.ry, hp:m.hp, maxHp:m.maxHp, alive:m.alive };
}
function scoreboard(room) {
  return Object.values(room.players)
    .map(p => ({ id:p.id, name:p.name, class:p.class, kills:p.kills, deaths:p.deaths, level:p.level }))
    .sort((a,b) => b.kills - a.kills);
}
function connectedCount(room) { return Object.keys(room.players).length; }

function maybeStartMatch(room) {
  if (room.matchState === 'waiting' && connectedCount(room) >= 2) {
    room.matchState = 'active';
    room.matchEndsAt = Date.now() + MATCH_TIME_MS;
    io.to(room.code).emit('matchStart', { endsAt: room.matchEndsAt, killLimit: KILL_LIMIT });
    clearTimeout(room.matchTimer);
    room.matchTimer = setTimeout(() => endMatch(room, 'tiempo'), MATCH_TIME_MS);
  }
}
function endMatch(room, reason) {
  if (room.matchState !== 'active') return;
  room.matchState = 'finished';
  clearTimeout(room.matchTimer);
  const board = scoreboard(room);
  const winner = board[0] || null;
  io.to(room.code).emit('matchOver', { reason, winner, scoreboard: board });
  setTimeout(() => resetMatch(room), RESTART_DELAY_MS);
}
function resetMatch(room) {
  for (const id in room.players) {
    const p = room.players[id];
    const def = CLASSES[p.class];
    const spawn = randomSpawn();
    p.x=spawn.x; p.z=spawn.z; p.y=0; p.hp=p.maxHp; p.alive=true; p.kills=0; p.deaths=0;
    p.cooldowns = {}; p.buffs = {};
  }
  room.matchState = 'waiting';
  io.to(room.code).emit('matchReset', { players: Object.values(room.players).map(publicPlayer) });
  maybeStartMatch(room);
}

function getRoomOfSocket(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

// ================== DAÑO / XP (nivel de modulo, para que las use tanto
// los sockets como el loop de IA de monstruos) ==================
function dmgMultiplier(p) {
  const buffB = p.buffs && p.buffs.dmgMult;
  const buff = (buffB && buffB.expires > Date.now()) ? buffB.value : 1;
  const lvl = 1 + 0.05*((p.level||1)-1);
  return buff*lvl;
}
function speedMultiplier(p) {
  const b = p.buffs && p.buffs.speedMult;
  return (b && b.expires > Date.now()) ? b.value : 1;
}
function grantXp(room, p, amount) {
  if (!p || p.level >= MAX_LEVEL) return;
  p.xp += amount;
  let leveled = false;
  while (p.level < MAX_LEVEL && p.xp >= xpForLevel(p.level)) {
    p.xp -= xpForLevel(p.level);
    p.level++;
    leveled = true;
    const growth = 1 + 0.08*(p.level-1);
    p.maxHp = Math.round(CLASSES[p.class].hp * growth);
    p.hp = p.maxHp;
  }
  io.to(room.code).emit('xpUpdate', { id:p.id, xp:p.xp, level:p.level, xpNeeded:xpForLevel(p.level), leveled, hp:p.hp, maxHp:p.maxHp });
}

function applyDamageToPlayer(room, attacker, target, dmg) {
  if (room.matchState !== 'active') return;
  if (Date.now() < (target.invulnUntil||0)) return;
  const def = target.buffs && target.buffs.defMult;
  if (def && def.expires > Date.now()) dmg *= def.value;
  target.hp -= dmg;
  io.to(room.code).emit('damaged', { id:target.id, hp:target.hp, byId:attacker.id });
  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    target.deaths++;
    if (attacker.kills !== undefined) attacker.kills++;
    io.to(room.code).emit('kill', { killerId:attacker.id, killerName:attacker.name, victimId:target.id, victimName:target.name });
    io.to(room.code).emit('scoreboard', scoreboard(room));
    if (attacker.kills >= KILL_LIMIT) { endMatch(room, 'kills'); return; }
    setTimeout(() => {
      if (!room.players[target.id]) return;
      const spawn = randomSpawn();
      target.x=spawn.x; target.z=spawn.z; target.y=0;
      target.hp = target.maxHp; target.alive = true;
      io.to(room.code).emit('respawn', { id:target.id, x:target.x, z:target.z, hp:target.hp });
    }, RESPAWN_MS);
  }
}

function applyDamageToMonster(room, attacker, m, dmg, ranged=false) {
  if (room.matchState !== 'active' || !m.alive) return;
  m.hp -= dmg;
  io.to(room.code).emit('monsterDamaged', { id:m.id, hp:m.hp });
  if (ranged) { m.forceTargetId = attacker.id; m.forceChaseUntil = Date.now() + 9000; }
  if (m.hp <= 0) {
    m.alive = false;
    io.to(room.code).emit('monsterDied', { id:m.id, killerId:attacker.id, killerName:attacker.name });
    grantXp(room, attacker, MONSTER_DEFS[m.type].xp);
    const def = MONSTER_DEFS[m.type];
    setTimeout(() => {
      m.hp = def.hp; m.alive = true; m.x = m.spawnX; m.z = m.spawnZ; m.targetId = null;
      io.to(room.code).emit('monsterRespawn', { id:m.id, x:m.x, z:m.z, hp:m.hp });
    }, def.respawn);
  }
}

function meleeHit(room, p, range, angleDeg, damage) {
  for (const otherId in room.players) {
    if (otherId === p.id) continue;
    const o = room.players[otherId];
    if (!o.alive) continue;
    const dx=o.x-p.x, dz=o.z-p.z, dist=Math.hypot(dx,dz);
    if (dist > range) continue;
    if (angleDeg < 180) {
      let diff = Math.abs(Math.atan2(dx,dz)-p.ry);
      if (diff>Math.PI) diff = Math.PI*2-diff;
      if (diff > angleDeg*Math.PI/180) continue;
    }
    applyDamageToPlayer(room, p, o, damage);
  }
  for (const mid in room.monsters) {
    const m = room.monsters[mid];
    if (!m.alive) continue;
    const dx=m.x-p.x, dz=m.z-p.z, dist=Math.hypot(dx,dz);
    if (dist > range) continue;
    if (angleDeg < 180) {
      let diff = Math.abs(Math.atan2(dx,dz)-p.ry);
      if (diff>Math.PI) diff = Math.PI*2-diff;
      if (diff > angleDeg*Math.PI/180) continue;
    }
    applyDamageToMonster(room, p, m, damage);
  }
}

function meleeHitAt(room, p, x, z, radius, damage) {
  for (const otherId in room.players) {
    if (otherId === p.id) continue;
    const o = room.players[otherId];
    if (!o.alive) continue;
    if (Math.hypot(o.x-x, o.z-z) > radius) continue;
    applyDamageToPlayer(room, p, o, damage);
  }
  for (const mid in room.monsters) {
    const m = room.monsters[mid];
    if (!m.alive) continue;
    if (Math.hypot(m.x-x, m.z-z) > radius) continue;
    applyDamageToMonster(room, p, m, damage);
  }
}

io.on('connection', (socket) => {

  socket.on('createRoom', () => {
    const room = createRoom();
    socket.data.roomCode = room.code;
    socket.join(room.code);
    socket.emit('roomJoined', { code: room.code });
  });

  socket.on('joinRoom', (code) => {
    code = String(code || '').toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) { socket.emit('roomError', 'Esa sala no existe.'); return; }
    if (connectedCount(room) >= MAX_PLAYERS) { socket.emit('roomError', 'Sala llena (máximo 5).'); return; }
    socket.data.roomCode = code;
    socket.join(code);
    socket.emit('roomJoined', { code });
  });

  socket.on('join', ({ name, cls }) => {
    const room = getRoomOfSocket(socket);
    if (!room) { socket.emit('roomError', 'Primero crea o únete a una sala.'); return; }
    if (room.players[socket.id]) return;
    if (connectedCount(room) >= MAX_PLAYERS) { socket.emit('roomError', 'Sala llena.'); return; }
    if (!CLASSES[cls]) cls = 'warrior';
    const def = CLASSES[cls];
    const spawn = randomSpawn();
    room.players[socket.id] = {
      id: socket.id, name: String(name||'Jugador').slice(0,16), class: cls,
      x: spawn.x, y:0, z: spawn.z, ry: 0,
      hp: def.hp, maxHp: def.hp, alive:true, kills:0, deaths:0,
      level:1, xp:0,
      lastAttack:0, cooldowns:{}, buffs:{}, invulnUntil:0
    };
    socket.emit('init', {
      id: socket.id, classes: CLASSES, abilities: ABILITIES, arenaRadius: ARENA_RADIUS,
      players: Object.values(room.players).map(publicPlayer),
      monsters: Object.values(room.monsters).map(publicMonster),
      matchState: room.matchState, matchEndsAt: room.matchEndsAt, killLimit: KILL_LIMIT,
      roomCode: room.code
    });
    socket.to(room.code).emit('playerJoined', publicPlayer(room.players[socket.id]));
    io.to(room.code).emit('scoreboard', scoreboard(room));
    maybeStartMatch(room);
  });

  socket.on('move', (data) => {
    const room = getRoomOfSocket(socket);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p || !p.alive) return;
    p.x = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, data.x));
    p.z = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, data.z));
    p.y = data.y || 0;
    p.ry = data.ry;
    socket.to(room.code).emit('playerMoved', { id:socket.id, x:p.x, y:p.y, z:p.z, ry:p.ry, moving: !!data.moving });
  });

  socket.on('attack', () => {
    const room = getRoomOfSocket(socket);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p || !p.alive || room.matchState!=='active') return;
    const def = CLASSES[p.class];
    const now = Date.now();
    if (now - p.lastAttack < def.attackCooldown) return;
    p.lastAttack = now;
    io.to(room.code).emit('attackAnim', { id: socket.id, ranged: def.ranged });

    if (def.ranged) {
      room.projectiles.push({
        id: Math.random().toString(36).slice(2), ownerId: socket.id, kind:'basic',
        x:p.x, z:p.z, dx:Math.sin(p.ry), dz:Math.cos(p.ry),
        damage: def.attackDamage * dmgMultiplier(p), speed: def.projectileSpeed, splash:0.6, bornAt: now
      });
      return;
    }
    meleeHit(room, p, def.attackRange, def.attackAngle, def.attackDamage * dmgMultiplier(p));
  });

  socket.on('ability', ({ slot }) => {
    const room = getRoomOfSocket(socket);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p || !p.alive || room.matchState!=='active') return;
    const ab = ABILITIES[p.class] && ABILITIES[p.class][slot];
    if (!ab) return;
    const now = Date.now();
    const key = 'ab'+slot;
    if (p.cooldowns[key] && now - p.cooldowns[key] < ab.cooldown) return;
    p.cooldowns[key] = now;

    io.to(room.code).emit('abilityUsed', { id:socket.id, slot, name:ab.name, type:ab.type, element:ab.element||null, x:p.x, z:p.z, ry:p.ry, duration:ab.duration||null });

    if (ab.type === 'aoe_self') {
      meleeHit(room, p, ab.radius, 181, ab.damage * dmgMultiplier(p));
    } else if (ab.type === 'strike') {
      meleeHit(room, p, ab.range, ab.angle, ab.damage * dmgMultiplier(p));
    } else if (ab.type === 'buff') {
      p.buffs.dmgMult = { value: ab.dmgMult, expires: now + ab.duration };
      p.buffs.speedMult = { value: ab.speedMult, expires: now + ab.duration };
    } else if (ab.type === 'dash') {
      const dir = ab.backward ? -1 : 1;
      const nx = p.x + Math.sin(p.ry)*ab.distance*dir;
      const nz = p.z + Math.cos(p.ry)*ab.distance*dir;
      p.x = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, nx));
      p.z = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, nz));
      if (ab.invulnMs) p.invulnUntil = now + ab.invulnMs;
      if (ab.damage > 0) meleeHit(room, p, ab.distance+1.5, ab.width*22, ab.damage * dmgMultiplier(p));
      io.to(room.code).emit('forcedMove', { id:socket.id, x:p.x, z:p.z });
    } else if (ab.type === 'projectile_aoe') {
      room.projectiles.push({
        id: Math.random().toString(36).slice(2), ownerId: socket.id, kind: ab.element || 'basic',
        x:p.x, z:p.z, dx:Math.sin(p.ry), dz:Math.cos(p.ry),
        damage: ab.damage * dmgMultiplier(p), speed: ab.speed, splash: ab.splash, bornAt: now
      });
    } else if (ab.type === 'multi_projectile') {
      for (let i=0;i<ab.count;i++) {
        const off = (i - (ab.count-1)/2) * (ab.spreadDeg*Math.PI/180);
        const a = p.ry + off;
        room.projectiles.push({
          id: Math.random().toString(36).slice(2), ownerId: socket.id, kind: ab.element || 'arrow',
          x:p.x, z:p.z, dx:Math.sin(a), dz:Math.cos(a),
          damage: ab.damage * dmgMultiplier(p), speed: ab.speed, splash: ab.splash||0.5, bornAt: now
        });
      }
    } else if (ab.type === 'timed_aoe') {
      const tx = p.x + Math.sin(p.ry)*3, tz = p.z + Math.cos(p.ry)*3;
      io.to(room.code).emit('telegraphAoe', { x:tx, z:tz, radius:ab.radius, delayMs:ab.delayMs });
      setTimeout(() => {
        meleeHitAt(room, p, tx, tz, ab.radius, ab.damage * dmgMultiplier(p));
      }, ab.delayMs);
    } else if (ab.type === 'heal') {
      p.hp = Math.min(p.maxHp, p.hp + ab.amount);
      io.to(room.code).emit('damaged', { id:p.id, hp:p.hp, byId:p.id });
    } else if (ab.type === 'shield') {
      p.buffs.defMult = { value: ab.defMult, expires: now + ab.duration };
    } else if (ab.type === 'dot') {
      let target = null, best = Infinity;
      for (const id in room.players) {
        if (id===socket.id) continue;
        const o = room.players[id];
        if (!o.alive) continue;
        const dx=o.x-p.x, dz=o.z-p.z, dist=Math.hypot(dx,dz);
        if (dist > ab.range) continue;
        let diff = Math.abs(Math.atan2(dx,dz)-p.ry);
        if (diff>Math.PI) diff = Math.PI*2-diff;
        if (diff > ab.angle*Math.PI/180) continue;
        if (dist<best){best=dist; target=o;}
      }
      if (target) {
        applyDamageToPlayer(room, p, target, ab.initialDamage * dmgMultiplier(p));
        io.to(room.code).emit('dotApplied', { casterId:p.id, targetId:target.id, ticks:ab.ticks, tickIntervalMs:ab.tickIntervalMs });
        let tick=0;
        const iv = setInterval(() => {
          tick++;
          if (!room.players[target.id] || !target.alive) { clearInterval(iv); return; }
          applyDamageToPlayer(room, p, target, ab.tickDamage * dmgMultiplier(p));
          if (tick>=ab.ticks) clearInterval(iv);
        }, ab.tickIntervalMs);
      }
    }
  });

  socket.on('chat', (msg) => {
    const room = getRoomOfSocket(socket);
    if (!room) return;
    const p = room.players[socket.id];
    if (!p) return;
    io.to(room.code).emit('chat', { name:p.name, msg:String(msg).slice(0,140) });
  });

  socket.on('disconnect', () => {
    const room = getRoomOfSocket(socket);
    if (!room) return;
    delete room.players[socket.id];
    io.to(room.code).emit('playerLeft', { id: socket.id });
    io.to(room.code).emit('scoreboard', scoreboard(room));
    if (connectedCount(room) < 2 && room.matchState === 'active') {
      room.matchState = 'waiting';
      clearTimeout(room.matchTimer);
      io.to(room.code).emit('matchPaused');
    }
    if (connectedCount(room) === 0) {
      clearTimeout(room.matchTimer);
      rooms.delete(room.code);
    }
  });
});

// ================== LOOP DE PROYECTILES (por sala) ==================
setInterval(() => {
  const now = Date.now();
  rooms.forEach(room => {
    for (let i = room.projectiles.length-1; i>=0; i--) {
      const pr = room.projectiles[i];
      if (now - pr.bornAt > 3000) { room.projectiles.splice(i,1); continue; }
      const step = (pr.speed||16) * 0.05;
      pr.x += pr.dx*step; pr.z += pr.dz*step;
      let hit=false;
      const attacker = room.players[pr.ownerId];
      if (attacker) {
        for (const id in room.players) {
          if (id===pr.ownerId || hit) continue;
          const o = room.players[id];
          if (!o.alive) continue;
          if (Math.hypot(o.x-pr.x, o.z-pr.z) < (1.2+(pr.splash||0))) {
            for (const id2 in room.players) {
              const o2 = room.players[id2];
              if (!o2.alive || id2===pr.ownerId) continue;
              if (Math.hypot(o2.x-pr.x, o2.z-pr.z) <= Math.max(1.2, pr.splash||0)) {
                applyDamageToPlayer(room, attacker, o2, pr.damage);
              }
            }
            hit = true;
          }
        }
        for (const mid in room.monsters) {
          if (hit) break;
          const m = room.monsters[mid];
          if (!m.alive) continue;
          if (Math.hypot(m.x-pr.x, m.z-pr.z) < (1.2+(pr.splash||0))) {
            for (const mid2 in room.monsters) {
              const m2 = room.monsters[mid2];
              if (!m2.alive) continue;
              if (Math.hypot(m2.x-pr.x, m2.z-pr.z) <= Math.max(1.2, pr.splash||0)) {
                applyDamageToMonster(room, attacker, m2, pr.damage, true);
              }
            }
            hit = true;
          }
        }
      }
      io.to(room.code).emit('projectileTick', { id:pr.id, x:pr.x, z:pr.z });
      if (hit || Math.abs(pr.x)>ARENA_RADIUS+2 || Math.abs(pr.z)>ARENA_RADIUS+2) {
        io.to(room.code).emit('projectileEnd', { id:pr.id, x:pr.x, z:pr.z, kind:pr.kind });
        room.projectiles.splice(i,1);
      }
    }
  });
}, 50);

// ================== IA DE MONSTRUOS ==================
// Deteccion corta por defecto; pero si el monstruo recibe un golpe a
// distancia, persigue a ese jugador sin importar la distancia durante
// unos segundos. Evasion simple de las estructuras grandes del mapa
// (definidas en STRUCTURE_ZONES): si el paso recto lo mete en una zona,
// se desliza tangencialmente en vez de empujar contra la pared.
function isInsideZone(x,z,zone,margin=1.6) {
  return x>zone.minX-margin && x<zone.maxX+margin && z>zone.minZ-margin && z<zone.maxZ+margin;
}
function findBlockingZone(x,z) {
  for (const zn of STRUCTURE_ZONES) if (isInsideZone(x,z,zn)) return zn;
  return null;
}

setInterval(() => {
  const now = Date.now();
  rooms.forEach(room => {
    for (const mid in room.monsters) {
      const m = room.monsters[mid];
      if (!m.alive) continue;
      const def = MONSTER_DEFS[m.type];
      let target = null, best = Infinity;

      if (m.forceChaseUntil > now && room.players[m.forceTargetId] && room.players[m.forceTargetId].alive) {
        target = room.players[m.forceTargetId];
        best = Math.hypot(target.x-m.x, target.z-m.z);
      } else {
        m.forceTargetId = null;
        for (const pid in room.players) {
          const p = room.players[pid];
          if (!p.alive) continue;
          const d = Math.hypot(p.x-m.x, p.z-m.z);
          if (d < best && d <= def.aggro) { best = d; target = p; }
        }
      }

      if (target) {
        m.targetId = target.id;
        if (best > def.range) {
          let dx = (target.x-m.x)/best, dz = (target.z-m.z)/best;
          let nx = m.x + dx*def.speed*0.15, nz = m.z + dz*def.speed*0.15;
          const blocking = findBlockingZone(nx,nz);
          if (blocking && !isInsideZone(m.x,m.z,blocking)) {
            // deslizar tangencialmente alrededor de la zona en vez de entrar
            const tx = -dz, tz = dx;
            const side = ((m.x - (blocking.minX+blocking.maxX)/2) * tz - (m.z - (blocking.minZ+blocking.maxZ)/2) * tx) >= 0 ? 1 : -1;
            nx = m.x + tx*side*def.speed*0.15;
            nz = m.z + tz*side*def.speed*0.15;
          }
          m.x = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, nx));
          m.z = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, nz));
          m.ry = Math.atan2(dx,dz);
        } else if (room.matchState === 'active' && now - m.lastAttack >= def.atkCooldown) {
          m.lastAttack = now;
          io.to(room.code).emit('monsterAttackAnim', { id:mid });
          applyDamageToPlayer(room, m, target, def.damage);
        }
      } else {
        m.targetId = null;
      }
      io.to(room.code).emit('monsterMoved', { id:mid, x:m.x, z:m.z, ry:m.ry });
    }
  });
}, 150);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Rakion-Web escuchando en puerto ${PORT}`));
