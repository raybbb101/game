# Games

- **Wildkin** (`wildkin/`) — real-world GPS + AR monster adventure. See [wildkin/README.md](wildkin/README.md).
- **Tide Keeper** (root) — 3D light-bending puzzle game, below.

# Tide Keeper

A calm 3D mobile puzzle game. You are **Lumi**, the last spark of a lighthouse scattered by a storm.
Turn the old mirrors to bend your light across each island, guide lost boats, and find your way home.

- Real-time 3D (Three.js): animated ocean shader with shoreline foam, bloom, soft shadows, night sky
- Smooth, spring-based mirror rotation: **tap** to quarter-turn, **drag around** or **swipe** a mirror to spin it, flick to carry momentum
- 12 hand-tuned islands; every one is machine-verified solvable
- 3 stars per island: reach the lighthouse · guide every boat · finish within par
- Synthesized ambient audio (waves, chimes) and haptics, no asset downloads
- Installable PWA, works offline, progress saved on device

## Play

Open the deployed page on your phone and use **Add to Home Screen** for a full-screen app.

Run locally (any static server works):

```sh
python3 -m http.server 8000
# open http://localhost:8000 (on a phone: http://<your-computer-ip>:8000)
```

## Deploy to GitHub Pages

1. In the repo settings → **Pages**, set **Source** to **GitHub Actions**.
2. Merge to `main` (or run the *Deploy to GitHub Pages* workflow manually).

## Tiles

| Tile | Meaning |
| --- | --- |
| `>` `<` `^` `v` | Lumi's shrine and the direction the light starts |
| `L` | Lighthouse (home) |
| `/` `\` | Mirror you can turn |
| `P` `Q` | Rusted mirror (fixed) |
| `s` `z` | Crystal prism: splits the light (can turn) |
| `b` | Lost boat (light passes through and rescues it) |
| `#` | Rock (blocks light) |
| `.` `~` | Sand / open water |

## Development

```sh
node tools/check-levels.mjs -v                 # solve every level, show par + solution
node tools/generate-levels.mjs > src/levels.js # regenerate the procedural islands
```

```
index.html, style.css     UI shell and screens
src/main.js               game flow, saving, main loop
src/scene.js              renderer, sky, ocean, bloom, camera framing
src/board.js              island building, pieces, beam, touch rotation, Lumi
src/logic.js              pure puzzle logic + solver (runs in Node too)
src/audio.js              Web Audio synthesis
vendor/three/             Three.js r170 (MIT), vendored for offline play
```
