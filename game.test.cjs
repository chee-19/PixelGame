// Headless logic checks. Run: node --test game.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup() {
  const elements = new Map();
  const drawCalls = [];
  const context = new Proxy({}, { get: (_, method) => (...args) => drawCalls.push({ method, args }) });
  const element = id => {
    if (!elements.has(id)) elements.set(id, { addEventListener() {}, setAttribute() {}, getContext: () => context, width: 800, height: 500 });
    return elements.get(id);
  };
  const sandbox = vm.createContext({
    document: { getElementById: element, addEventListener() {} },
    window: { addEventListener() {} },
    Audio: class { pause() {} play() { return Promise.resolve(); } },
    Image: class { set src(value) { this.onload(); } },
    requestAnimationFrame() {}, console, drawCalls
  });
  vm.runInContext(fs.readFileSync('game.js', 'utf8'), sandbox);
  return code => vm.runInContext(code, sandbox);
}
test('movement uses time, normalizes diagonals, respects walls and rocks', () => {
  const run = setup();
  run("start(); player.x = 100; player.y = 100; keys.add('KeyD'); update(0.1)");
  assert.equal(run('player.x'), 118);
  run("start(); player.x = 100; player.y = 100; keys.add('KeyD'); keys.add('KeyS'); update(0.1)");
  assert.ok(Math.abs(run('Math.hypot(player.x - 100, player.y - 100)') - 18) < 0.001);
  run('move(player, -1000, -1000)');
  assert.equal(run('player.x'), 17);
  run('player.x = 160; player.y = 190; move(player, 10, 0)');
  assert.equal(run('player.x'), 160);
});
test('tongue damages once per attack, kills, scores and cannot pass rocks', () => {
  const run = setup();
  run('start(); remaining = 0; player.x = 100; player.y = 100; mouse.x = 200; mouse.y = 100; enemies = [{x:150,y:100,radius:16,health:2}]; beginAttack(); updateAttack(0.1); updateAttack(0.02)');
  assert.equal(run('enemies[0].health'), 1);
  run('beginAttack(); updateAttack(0.1)');
  assert.equal(run('enemies.length'), 0);
  assert.equal(run('score'), 100);
  assert.equal(run('pickups.length'), 1);
  run('player.x = 155; player.y = 190; mouse.x = 300; mouse.y = 190; enemies = [{x:270,y:190,radius:16,health:1}]; beginAttack(); updateAttack(0.14)');
  assert.equal(run('enemies[0].health'), 1);
  assert.ok(run('attack.length') < 25);
});
test('contact damage has immunity; hearts heal; flies score; pickups expire', () => {
  const run = setup();
  run('start(); remaining = 0; enemies = [{x:400,y:420,radius:16,health:2,speed:0,flash:0,routeTimer:0,route:[]}]; update(0.01); update(0.01)');
  assert.equal(run('player.health'), 4);
  run("enemies = []; pickups = [{x:400,y:420,type:'heart',life:12}, {x:400,y:420,type:'fly',life:12}, {x:20,y:20,type:'fly',life:0.01}]; update(0.02)");
  assert.equal(run('player.health'), 5);
  assert.equal(run('score'), 25);
  assert.equal(run('pickups.length'), 0);
});
test('pause freezes simulation; wave completion wins; defeat and restart reset', () => {
  const run = setup();
  run('start(); pause(); update(1)');
  assert.equal(run('state'), 'paused');
  assert.equal(run('remaining'), 6);
  run('pause(); remaining = 0; enemies = []; breakTimer = 2.99; update(0.02)');
  assert.equal(run('wave'), 2);
  assert.equal(run('score'), 250);
  run('wave = 5; remaining = 0; enemies = []; breakTimer = 2.99; update(0.02)');
  assert.equal(run('state'), 'victory');
  run('start(); player.health = 1; remaining = 0; enemies = [{x:400,y:420,radius:16,health:2,speed:0,flash:0,routeTimer:0,route:[]}]; update(0.01)');
  assert.equal(run('state'), 'defeat');
  run('start()');
  assert.equal(run('player.health'), 5);
  assert.equal(run('score'), 0);
  assert.equal(run('wave'), 1);
  assert.equal(run('enemies.length'), 0);
});
test('spawn stays distant and slime navigation can route around rocks', () => {
  const run = setup();
  run('start(); spawn()');
  assert.ok(run('Math.hypot(enemies[0].x-player.x,enemies[0].y-player.y)') > 160);
  run('player.x = 290; player.y = 190; enemies = [{x:140,y:190,radius:16,health:2,speed:60,flash:0,routeTimer:0,route:[]}]; remaining = 1; spawnTimer = 100');
  assert.ok(run('routeToPlayer(enemies[0]).length') > 1);
  run('for(let i=0;i<720;i++) update(1/120)');
  assert.ok(run('Math.hypot(enemies[0].x-player.x,enemies[0].y-player.y)') < 40);
});
test('waves 1–4 retain slime counts, health and speed; wave 5 adds one boss', () => {
  const run = setup();
  run('start()');
  for (let wave = 1; wave <= 4; wave++) {
    assert.equal(run('wave'), wave);
    assert.equal(run('remaining'), 4 + wave * 2);
    assert.equal(run('boss'), null);
    run('spawn()');
    assert.equal(run('enemies.at(-1).health'), wave >= 3 ? 2 : 1);
    assert.equal(run('enemies.at(-1).speed'), 45 + wave * 9);
    run('enemies = []; nextWave()');
  }
  assert.equal(run('remaining'), 14);
  assert.equal(run("enemies.filter(e => e.type === 'boss').length"), 1);
  assert.equal(run('boss.health'), 20);
  run('spawnBoss(); spawn(); update(0.01); update(0.01)');
  assert.equal(run("enemies.filter(e => e.type === 'boss').length"), 1);
  assert.equal(run("Boolean(images.king_slime && images.king_attack)"), true);
});
test('boss takes tongue damage; fixed health bar shrinks and disappears on death', () => {
  const run = setup();
  run('start(); wave = 4; nextWave(); remaining = 0; player.x = 100; player.y = 100; boss.x = 180; boss.y = 100; boss.speed = 0; mouse.x = 220; mouse.y = 100; drawBossHealth()');
  assert.equal(run('drawCalls.at(-1).args[2]'), 280);
  run('beginAttack(); updateAttack(0.1); drawCalls.length = 0; drawBossHealth()');
  assert.equal(run('boss.health'), 19);
  assert.equal(run('drawCalls.at(-1).args[2]'), 266);
  assert.equal(run('drawCalls.at(-1).args[0]'), 260);
  run('boss.health = 1; projectiles = [{x:50,y:50,vx:1,vy:1,radius:10,damage:1}]; beginAttack(); updateAttack(0.1); drawCalls.length = 0; drawBossHealth()');
  assert.equal(run('boss'), null);
  assert.equal(run('enemies.length'), 0);
  assert.equal(run('projectiles.length'), 0);
  assert.equal(run('drawCalls.length'), 0);
  assert.equal(run('score'), 1000);
  run('update(1.6)');
  assert.equal(run('projectiles.length'), 0);
});
test('boss waits for cooldown and fires non-homing projectiles at player', () => {
  const run = setup();
  run('start(); wave = 4; nextWave(); remaining = 0; boss.x = 100; boss.y = 100; boss.speed = 0; player.x = 400; player.y = 100; update(1)');
  assert.equal(run('projectiles.length'), 0);
  run('update(0.61)');
  assert.equal(run('projectiles.length'), 1);
  assert.equal(run('projectiles[0].vx'), 220);
  assert.equal(run('projectiles[0].vy'), 0);
  run('player.y = 400; const before = projectiles[0].x; updateProjectiles(0.1)');
  assert.equal(run('projectiles[0].y'), 100);
  assert.ok(Math.abs(run('projectiles[0].x - before') - 22) < 0.001);
  run('boss.attackTimer = 0.01; update(0.02)');
  assert.equal(run('projectiles.length'), 2);
  assert.ok(run('projectiles[1].vy') > 0);
  run('pause(); const frozenX = projectiles[0].x; const frozenTimer = boss.attackTimer; update(1)');
  assert.equal(run('projectiles[0].x === frozenX && boss.attackTimer === frozenTimer'), true);
});
test('projectile hits share immunity, remove on impact, and clean up at walls and rocks', () => {
  const run = setup();
  run('start(); player.x = 100; player.y = 100; projectiles = [{x:80,y:100,vx:220,vy:0,radius:10,damage:1}]; updateProjectiles(0.01)');
  assert.equal(run('player.health'), 4);
  assert.equal(run('player.immune'), 1.2);
  assert.equal(run('projectiles.length'), 0);
  run('projectiles = [{x:100,y:100,vx:0,vy:0,radius:10,damage:1}]; updateProjectiles(0.01)');
  assert.equal(run('player.health'), 4);
  assert.equal(run('projectiles.length'), 0);
  run('projectiles = [{x:809,y:100,vx:220,vy:0,radius:10,damage:1}, {x:170,y:190,vx:220,vy:0,radius:10,damage:1}]; updateProjectiles(0.02)');
  assert.equal(run('projectiles.length'), 0);
  run('enemies = [{x:100,y:100,radius:16,health:2}]; player.x = 700; projectiles = [{x:100,y:100,vx:0,vy:0,radius:10,damage:1}]; updateProjectiles(0.01)');
  assert.equal(run('enemies[0].health'), 2);
  assert.equal(run('projectiles.length'), 1);
  run('player.x = 100; player.health = 1; player.immune = 0; updateProjectiles(0.01)');
  assert.equal(run('state'), 'defeat');
  assert.equal(run('projectiles.length'), 0);
});
test('living boss blocks wave completion; normal slimes also block victory; restart clears boss state', () => {
  const run = setup();
  run('start(); wave = 4; nextWave(); remaining = 0; boss.speed = 0; player.immune = 100; breakTimer = 2.99; update(0.02)');
  assert.equal(run('state'), 'playing');
  assert.equal(run('score'), 0);
  run('spawn(); boss.x = 180; boss.y = 100; boss.health = 1; player.x = 100; player.y = 100; mouse.x = 220; mouse.y = 100; beginAttack(); updateAttack(0.1); update(0.02)');
  assert.equal(run('boss'), null);
  assert.equal(run('state'), 'playing');
  run('enemies = []; update(0.02)');
  assert.equal(run('state'), 'victory');
  run('start(); wave = 4; nextWave(); boss.health = 3; fireBossProjectile(); start()');
  assert.equal(run('boss'), null);
  assert.equal(run('projectiles.length'), 0);
  assert.equal(run('wave'), 1);
  run('wave = 4; nextWave()');
  assert.equal(run('boss.health'), 20);
  assert.equal(run('boss.attackTimer'), 1.6);
  run('draw()'); // Full rendering path must remain runnable with the new enemy type.
});
