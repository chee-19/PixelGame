# Pond Patrol

A vanilla JavaScript Canvas game. Protect the pond by clearing five slime waves.
No dependencies or build step are required.

## Run

Open `index.html` in a desktop browser, or serve this folder locally:

```powershell
py -m http.server 8000 --bind 127.0.0.1
```

Visit http://localhost:8000 and press **Start game**. Stop the server with Ctrl+C.

## Controls and rules

- WASD or arrow keys: move.
- Mouse: aim. Hold left click: repeat tongue attacks.
- P or Escape: pause/resume. Losing focus automatically pauses.
- Sound button: mute/unmute.
- Clear five waves to win. Losing all five hearts ends the run.
- Slime contact costs one heart, followed by 1.2 seconds of immunity.
- Slimes award 100 points. Clearing a wave awards 250 points.
- Each defeated slime drops a collectible lasting 12 seconds: 80% gold fly
  (25 points), 20% heart (restore one health, capped at five).
- Waves contain 6, 8, 10, 12, and 14 slimes. From wave 3, they need two hits.
- Rocks block movement and tongue attacks. Slimes navigate around them.
- Each tongue strike damages an enemy at most once; holding click repeats
  every 0.42 seconds. Tongues extend/retract over 0.28 seconds with 115px reach.
- Three seconds between waves allow time to collect drops.

## Final boss

Wave 5 includes the usual 14 normal slimes and exactly one King Slime.
Defeat both the boss and every normal slime to trigger the existing victory screen.
King Slime uses `images/king_slime.png`, navigates around rocks, and takes damage
from the same tongue attacks as normal slimes. Its fixed top-center health bar
disappears on death. The boss awards 1000 points.

King Slime fires `images/king_attack.png` toward your position every 1.6 seconds.
Fireballs travel straight at 220 pixels/second and deal one heart of damage,
respecting the same invulnerability as slime contact. Rocks stop fireballs.
Fireballs disappear on impact, leaving the arena, boss death, or restart.

Rebalance the boss in `BOSS_CONFIG` near the top of `game.js`:
`maxHealth: 20`, `attackCooldown: 1.6`, `projectileSpeed: 220`,
`projectileDamage: 1`, plus size, movement speed, projectile radius and score.

## Code map

- `index.html`: canvas, HUD, buttons and state overlays.
- `style.css`: responsive arena, pixel rendering and screen styling.
- `game.js`: input, asset loading, game states, simulation and rendering.
- `game.test.cjs`: headless gameplay regression tests using Node's built-in runner.
- `images/` and `sounds/`: original sprites and slurp sound.

Simulation uses seconds and small substeps, while rendering uses
`requestAnimationFrame`. Movement is normalized diagonally and constrained by
circle/rectangle collisions. Enemy pursuit uses a visibility graph around rock
corners. Tongue hits use the distance from an enemy center to the visible attack
segment. Missing images use colored fallbacks; audio failures do not stop play.

## Checks

With Node.js installed:

```powershell
node --check game.js
node --test game.test.cjs
```

Tests cover movement, boundaries, obstacles, tongue hits, score and healing,
invulnerability, pause, wave progression, victory, defeat, restart, spawning,
enemy navigation, boss spawning and health-bar draw calls, and fireball aiming,
damage and cleanup. Visual rendering and actual audio playback need a browser check.
