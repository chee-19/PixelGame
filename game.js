const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const heading = document.getElementById('heading');
const message = document.getElementById('message');
const action = document.getElementById('action');
const hud = document.getElementById('hud');
const pauseButton = document.getElementById('pause');
const sound = new Audio('sounds/slurpAudio.mp3');
sound.volume = 0.25;
const images = {}, keys = new Set();
const mouse = { x: 400, y: 250, held: false };
// Positions use centers; speeds use pixels per second.
const player = { x: 400, y: 420, radius: 17, speed: 180, health: 5, immune: 0 };
const rocks = [
  { x: 180, y: 160, w: 70, h: 60 },
  { x: 550, y: 160, w: 70, h: 60 },
  { x: 360, y: 280, w: 80, h: 45 }
];
let state = 'loading', muted = false, enemies = [], pickups = [];
let score = 0, wave = 0, remaining = 0, spawnTimer = 0, breakTimer = 0;
let attack = null, cooldown = 0, previousTime = null;
const TOTAL_WAVES = 5;
const BOSS_CONFIG = {
  maxHealth: 20,
  radius: 36,
  speed: 40,
  attackCooldown: 1.6,
  projectileSpeed: 220,
  projectileDamage: 1,
  projectileRadius: 10,
  score: 1000
};
let boss = null, projectiles = [];
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function stopSound() { sound.pause(); sound.currentTime = 0; }
function resetInput() { keys.clear(); mouse.held = false; attack = null; stopSound(); }
function screen(next, title, text, button) {
  state = next; resetInput();
  heading.textContent = title; message.textContent = text;
  action.textContent = button || ''; action.hidden = !button;
  overlay.hidden = false; pauseButton.disabled = next !== 'paused';
}
function nextWave() {
  wave++; remaining = 4 + wave * 2; spawnTimer = 0.6; breakTimer = 0;
  if (wave === TOTAL_WAVES && !boss) spawnBoss();
}
function start() {
  Object.assign(player, { x: 400, y: 420, health: 5, immune: 0 });
  enemies = []; pickups = []; score = 0; wave = 0; cooldown = 0;
  boss = null; projectiles = [];
  resetInput(); state = 'playing'; overlay.hidden = true; pauseButton.disabled = false;
  nextWave();
}
function pause() {
  if (state === 'playing') screen('paused', 'PAUSED', 'Take a breath. Resume when you’re ready.', 'Resume');
  else if (state === 'paused') { state = 'playing'; overlay.hidden = true; pauseButton.disabled = false; }
}
action.addEventListener('click', () => state === 'paused' ? pause() : start());
pauseButton.addEventListener('click', pause);
document.getElementById('mute').addEventListener('click', event => {
  muted = !muted; sound.muted = muted;
  event.currentTarget.textContent = muted ? 'Sound: off' : 'Sound: on';
  event.currentTarget.setAttribute('aria-pressed', String(muted));
});
document.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (!event.repeat && ['KeyP', 'Escape'].includes(event.code)) pause();
  if (state === 'playing') keys.add(event.code);
});
document.addEventListener('keyup', event => keys.delete(event.code));
function aim(event) {
  const rect = canvas.getBoundingClientRect(), style = getComputedStyle(canvas);
  const left = parseFloat(style.borderLeftWidth), top = parseFloat(style.borderTopWidth);
  mouse.x = (event.clientX - rect.left - left) * canvas.width / (rect.width - left - parseFloat(style.borderRightWidth));
  mouse.y = (event.clientY - rect.top - top) * canvas.height / (rect.height - top - parseFloat(style.borderBottomWidth));
}
canvas.addEventListener('pointermove', aim);
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || state !== 'playing') return;
  aim(event); mouse.held = true; canvas.setPointerCapture(event.pointerId);
});
window.addEventListener('pointerup', event => { if (event.button === 0) { mouse.held = false; stopSound(); } });
canvas.addEventListener('pointercancel', resetInput);
canvas.addEventListener('lostpointercapture', () => { mouse.held = false; });
window.addEventListener('blur', () => { resetInput(); if (state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

function blocked(x, y, radius) {
  return rocks.some(r => Math.hypot(x - clamp(x, r.x, r.x + r.w), y - clamp(y, r.y, r.y + r.h)) < radius);
}
function move(body, dx, dy) {
  const x = clamp(body.x + dx, body.radius, canvas.width - body.radius);
  if (!blocked(x, body.y, body.radius)) body.x = x;
  const y = clamp(body.y + dy, body.radius, canvas.height - body.radius);
  if (!blocked(body.x, y, body.radius)) body.y = y;
}
function clearPath(a, b, radius) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    if (blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius)) return false;
  }
  return true;
}
function routeToPlayer(enemy) {
  // A small visibility graph routes slimes around all three rocks.
  const margin = enemy.radius + 3;
  const nodes = [enemy, player];
  for (const r of rocks) for (const x of [r.x - margin, r.x + r.w + margin]) {
    for (const y of [r.y - margin, r.y + r.h + margin]) nodes.push({ x, y });
  }
  const distances = nodes.map(() => Infinity), parents = [], visited = new Set();
  distances[0] = 0;
  while (visited.size < nodes.length) {
    let current = -1;
    for (let i = 0; i < nodes.length; i++) if (!visited.has(i) && (current === -1 || distances[i] < distances[current])) current = i;
    if (current === -1 || distances[current] === Infinity || current === 1) break;
    visited.add(current);
    for (let i = 0; i < nodes.length; i++) {
      if (visited.has(i) || !clearPath(nodes[current], nodes[i], enemy.radius)) continue;
      const candidate = distances[current] + Math.hypot(nodes[i].x - nodes[current].x, nodes[i].y - nodes[current].y);
      if (candidate < distances[i]) { distances[i] = candidate; parents[i] = current; }
    }
  }
  const route = [];
  if (distances[1] !== Infinity) {
    for (let i = 1; i !== 0; i = parents[i]) route.unshift({ x: nodes[i].x, y: nodes[i].y });
  }
  return route;
}
function spawn() {
  // Choose a distant edge point, so a spawn never damages the player immediately.
  const positions = [];
  for (let i = 0; i < 12; i++) {
    const offset = 20 + Math.random() * 460;
    positions.push({ x: 20, y: offset }, { x: 780, y: offset });
    const horizontal = 20 + Math.random() * 760;
    positions.push({ x: horizontal, y: 20 }, { x: horizontal, y: 480 });
  }
  const point = positions.reduce((best, p) => Math.hypot(p.x - player.x, p.y - player.y) > Math.hypot(best.x - player.x, best.y - player.y) ? p : best);
  enemies.push({ ...point, radius: 16, health: wave >= 3 ? 2 : 1, speed: 45 + wave * 9, flash: 0, routeTimer: 0, route: [] });
}
function spawnBoss() {
  if (boss) return;
  const margin = BOSS_CONFIG.radius + 4;
  const positions = [
    { x: margin, y: margin }, { x: canvas.width - margin, y: margin },
    { x: margin, y: canvas.height - margin }, { x: canvas.width - margin, y: canvas.height - margin }
  ];
  const point = positions.reduce((best, p) => Math.hypot(p.x - player.x, p.y - player.y) > Math.hypot(best.x - player.x, best.y - player.y) ? p : best);
  boss = { ...point, type: 'boss', radius: BOSS_CONFIG.radius, health: BOSS_CONFIG.maxHealth,
    maxHealth: BOSS_CONFIG.maxHealth, speed: BOSS_CONFIG.speed, flash: 0,
    routeTimer: 0, route: [], attackTimer: BOSS_CONFIG.attackCooldown };
  enemies.push(boss);
}
function damagePlayer(amount) {
  if (state !== 'playing' || player.immune > 0) return;
  player.health = Math.max(0, player.health - amount); player.immune = 1.2;
  if (player.health === 0) screen('defeat', ' Better frog next time', `Score: ${score} · Reached wave ${wave}.`, 'Restart');
}
function fireBossProjectile() {
  const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
  projectiles.push({ x: boss.x, y: boss.y,
    vx: Math.cos(angle) * BOSS_CONFIG.projectileSpeed,
    vy: Math.sin(angle) * BOSS_CONFIG.projectileSpeed,
    radius: BOSS_CONFIG.projectileRadius, damage: BOSS_CONFIG.projectileDamage });
}
function updateProjectiles(dt) {
  projectiles = projectiles.filter(projectile => {
    projectile.x += projectile.vx * dt; projectile.y += projectile.vy * dt;
    if (projectile.x < -projectile.radius || projectile.x > canvas.width + projectile.radius ||
        projectile.y < -projectile.radius || projectile.y > canvas.height + projectile.radius) return false;
    // Rocks stop fireballs. Projectiles never interact with other enemies.
    if (blocked(projectile.x, projectile.y, projectile.radius)) return false;
    if (Math.hypot(projectile.x - player.x, projectile.y - player.y) < projectile.radius + player.radius) {
      damagePlayer(projectile.damage);
      return false; // Consume the hit even if the player is currently invulnerable.
    }
    return true;
  });
}
function beginAttack() {
  attack = { angle: Math.atan2(mouse.y - player.y, mouse.x - player.x), age: 0, length: 0, hit: new Set() };
  cooldown = 0.42;
  if (!muted) { sound.currentTime = 0; const promise = sound.play(); if (promise) promise.catch(() => {}); }
}
function updateAttack(dt) {
  if (!attack) return;
  attack.age += dt;
  if (attack.age >= 0.28) { attack = null; stopSound(); return; }
  const desired = 115 * Math.sin(Math.PI * attack.age / 0.28);
  const dx = Math.cos(attack.angle), dy = Math.sin(attack.angle);
  attack.length = desired;
  // Clip the visible tongue and its hit segment against rocks and arena edges.
  for (let d = 0; d <= desired; d += 2) {
    const x = player.x + dx * d, y = player.y + dy * d;
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height || blocked(x, y, 6)) { attack.length = Math.max(0, d - 2); break; }
  }
  for (const enemy of enemies) {
    if (attack.hit.has(enemy)) continue;
    const distance = clamp((enemy.x - player.x) * dx + (enemy.y - player.y) * dy, 0, attack.length);
    if (Math.hypot(enemy.x - player.x - dx * distance, enemy.y - player.y - dy * distance) <= enemy.radius + 6) {
      attack.hit.add(enemy); enemy.health--; enemy.flash = 0.15;
      if (enemy.health <= 0) {
        if (enemy.type === 'boss') {
          score += BOSS_CONFIG.score; boss = null;
          projectiles = []; // Remove lingering fireballs when the boss is defeated.
        } else {
          score += 100;
          pickups.push({ x: enemy.x, y: enemy.y, type: Math.random() < 0.2 ? 'heart' : 'fly', life: 12 });
        }
      }
    }
  }
  enemies = enemies.filter(enemy => enemy.health > 0);
}
function update(dt) {
  if (state !== 'playing') return;
  const dx = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
  const dy = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'));
  const magnitude = Math.hypot(dx, dy) || 1;
  move(player, dx / magnitude * player.speed * dt, dy / magnitude * player.speed * dt);
  player.immune = Math.max(0, player.immune - dt); cooldown = Math.max(0, cooldown - dt);
  if (mouse.held && cooldown === 0 && !attack) beginAttack();
  updateAttack(dt);
  if (remaining > 0) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) { spawn(); remaining--; spawnTimer = 1.1 - wave * 0.1; }
  }
  for (const enemy of enemies) {
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.routeTimer -= dt;
    if (enemy.routeTimer <= 0) { enemy.route = routeToPlayer(enemy); enemy.routeTimer = 0.5; }
    if (enemy.route.length && Math.hypot(enemy.route[0].x - enemy.x, enemy.route[0].y - enemy.y) < 3) enemy.route.shift();
    const target = clearPath(enemy, player, enemy.radius) ? player : enemy.route[0];
    if (target) {
      const ex = target.x - enemy.x, ey = target.y - enemy.y, distance = Math.hypot(ex, ey) || 1;
      const travel = Math.min(enemy.speed * dt, distance);
      move(enemy, ex / distance * travel, ey / distance * travel);
    }
    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < enemy.radius + player.radius) {
      damagePlayer(1);
      if (state !== 'playing') return;
    }
    if (enemy.type === 'boss') {
      enemy.attackTimer -= dt;
      if (enemy.attackTimer <= 0) {
        fireBossProjectile(); enemy.attackTimer += BOSS_CONFIG.attackCooldown;
      }
    }
  }
  updateProjectiles(dt);
  if (state !== 'playing') return;
  pickups = pickups.filter(item => {
    item.life -= dt;
    if (Math.hypot(item.x - player.x, item.y - player.y) < player.radius + 10) {
      if (item.type === 'heart') player.health = Math.min(5, player.health + 1);
      else score += 25;
      return false;
    }
    return item.life > 0;
  });
  if (remaining === 0 && enemies.length === 0 && !boss) {
    breakTimer += dt;
    if (breakTimer >= 3) {
      score += 250;
      if (wave === TOTAL_WAVES) screen('victory', 'Pond protected!', `All five waves cleared! Final score: ${score}.`, 'Play again');
      else nextWave();
    }
  }
}
function sprite(name, x, y, width, height, color) {
  if (images[name]) ctx.drawImage(images[name], Math.round(x), Math.round(y), width, height);
  else { ctx.fillStyle = color; ctx.fillRect(x, y, width, height); }
}
function draw() {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#152d29'; ctx.fillRect(0, 0, 800, 500);
  ctx.fillStyle = '#224236';
  for (let y = 10; y < 500; y += 32) for (let x = 10; x < 800; x += 32) ctx.fillRect(x, y, 3, 3);
  for (const rock of rocks) {
    ctx.fillStyle = '#0b201e'; ctx.fillRect(rock.x + 4, rock.y + 5, rock.w, rock.h);
    ctx.fillStyle = '#586c65'; ctx.fillRect(rock.x, rock.y, rock.w, rock.h);
    ctx.fillStyle = '#84968a'; ctx.fillRect(rock.x + 5, rock.y + 5, rock.w - 10, 5);
  }
  ctx.textAlign = 'center'; ctx.font = '20px monospace';
  for (const item of pickups) {
    ctx.fillStyle = item.type === 'heart' ? '#ff778c' : '#ffe59a';
    ctx.fillText(item.type === 'heart' ? '♥' : '✦', item.x, item.y + 7);
  }
  for (const enemy of enemies) {
    ctx.globalAlpha = enemy.flash > 0 ? 0.5 : 1;
    const size = enemy.type === 'boss' ? BOSS_CONFIG.radius * 2 + 8 : 36;
    sprite(enemy.type === 'boss' ? 'king_slime' : 'slime', enemy.x - size / 2, enemy.y - size / 2, size, size, '#9bdb55');
    ctx.globalAlpha = 1;
    if (enemy.type !== 'boss' && enemy.health > 1) { ctx.fillStyle = '#ffe59a'; ctx.fillRect(enemy.x - 8, enemy.y - 24, 16, 3); }
  }
  for (const projectile of projectiles) {
    sprite('king_attack', projectile.x - projectile.radius, projectile.y - projectile.radius,
      projectile.radius * 2, projectile.radius * 2, '#ff9955');
  }
  if (attack && attack.length > 0) {
    ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(attack.angle);
    sprite('tongue', 0, -6, attack.length, 12, '#ed7ca2'); ctx.restore();
  }
  ctx.globalAlpha = player.immune > 0 && Math.floor(player.immune * 12) % 2 ? 0.4 : 1;
  sprite('frog', player.x - 20, player.y - 20, 40, 40, '#55dd77'); ctx.globalAlpha = 1;
  if (state === 'playing' && remaining === 0 && enemies.length === 0 && !boss) {
    ctx.fillStyle = '#fff2c6'; ctx.font = '22px monospace';
    ctx.fillText(wave === TOTAL_WAVES ? 'FROGGED!' : 'Wave cleared! Catch your breath…', 400, 70);
  }
  drawBossHealth();
  const status = `Health ${'♥'.repeat(player.health)}${'♡'.repeat(5 - player.health)} · Score ${score} · Wave ${wave}/${TOTAL_WAVES} · Slimes ${enemies.filter(enemy => enemy.type !== 'boss').length + remaining}${boss ? ` · King ${boss.health}/${boss.maxHealth}` : ''}`;
  if (hud.textContent !== status) hud.textContent = status;
}
function drawBossHealth() {
  if (!boss || boss.health <= 0) return;
  const width = 280, x = (canvas.width - width) / 2;
  ctx.fillStyle = '#091917ee'; ctx.fillRect(x - 12, 6, width + 24, 56);
  ctx.textAlign = 'center'; ctx.font = 'bold 16px monospace'; ctx.fillStyle = '#ffe59a';
  ctx.fillText('KING SLIME', canvas.width / 2, 26);
  ctx.fillStyle = '#84968a'; ctx.fillRect(x - 2, 34, width + 4, 18);
  ctx.fillStyle = '#26372f'; ctx.fillRect(x, 36, width, 14);
  ctx.fillStyle = '#bde985'; ctx.fillRect(x, 36, Math.round(width * clamp(boss.health / boss.maxHealth, 0, 1)), 14);
}
function gameLoop(time) {
  let elapsed = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.1);
  previousTime = time;
  // Substeps prevent fast movement skipping narrow collisions.
  while (elapsed > 0) { const step = Math.min(elapsed, 1 / 120); update(step); elapsed -= step; }
  draw(); requestAnimationFrame(gameLoop);
}
function loadImage(name) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => { images[name] = image; resolve(); };
    image.onerror = () => resolve(); // Missing sprites get playable colored fallbacks.
    image.src = `images/${name}.png`;
  });
}
Promise.all(['frog', 'slime', 'tongue', 'king_slime', 'king_attack'].map(loadImage)).then(() => {
  screen('start', 'Frogger', 'Survive five waves and defeat King Slime in wave 5. Dodge its fireballs! Gold flies give 25 points; hearts heal. Slimes give 100 points; King Slime gives 1000; each cleared wave gives 250.', 'Start game');
  requestAnimationFrame(gameLoop);
});
