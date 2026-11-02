# Wildkin

A real-world monster adventure for phones. Walk around with GPS on a real map (OpenStreetMap).
When you get right next to a monster or fairy, tap it and it appears in AR through your camera.

## Making monster buddies — 3 ways

1. **Battle** — fight with your team of up to 3 buddies. Win and the monster joins you.
   Lose and there is a 35% chance one of your buddies runs off (a *Guardian Bell* prevents this, and you never lose your last buddy).
   Element matchups matter: 🔥>🌿🌀 · 💧>🔥🪨 · 🌿>💧🪨 · ⚡>💧🌀 · 🪨>⚡🔥 · 🌀>🌿⚡ · 🌙>🌙
2. **Talk** — what happens depends on its personality:
   - 😊 *Friendly*: chat. Give answers it likes and it wants to be friends.
   - 🤩 *Curious*: asks to see something from the real world (a color, the sky, a sunset, fruit, a flower, a cup...).
     Accept and it **follows you for 24 hours**, so you don't have to go back. Take a photo and the game scans it.
   - 😜 *Playful*: plays a "which paw?" game. Lose and it asks for a photo instead.
   - 🥺 *Shy*: offer a treat first.
   - 😤 *Proud*: respects strong humans. If your buddies are strong enough it joins, otherwise prove yourself in battle.
   - 😠 *Fierce*: doesn't like humans. Battle only.
3. **Luck** — some monsters just like you and ask to come along (Lucky Clover and Moon Feather boost this).

## Fairies
Trickster fairies (riddles, guessing games, pranks, they want something) and Question fairies (quizzes, questions, photos)
fly around the map. Make them happy and **choose one of three presents**, sometimes a rare one
(Guardian Bell, Star Candy, Moon Feather, or the legendary Rainbow Prism).

## How it works
- **Spawns** are seeded per ~165 m map cell and per 20 minutes, so everyone at the same spot sees the same monsters.
  Rare *Dream* monsters show up more at night.
- **Reach**: the design target is 1 m. Phone GPS is only accurate to a few metres, so in GPS mode your reach is
  1 m + the GPS error your phone reports (capped at 25 m). In *Explore* mode (tap the map to move, for testing or indoors)
  it really is 1 m.
- **AR** uses the rear camera and the phone's motion sensors to pin the creature to a real direction, so it works in
  any mobile browser (no WebXR needed). Without a camera it shows a painted scene.
- **Photo scanning** runs on the phone. Colors and scenes (sky, plants, sunset, night lights) are judged from the pixels;
  objects (food, fruit, flowers, cups, wheels, books, shoes) use the MobileNet image classifier, loaded on demand.
  If it can't load, objects are judged by their typical colors.
- Progress is saved on the device (localStorage).

## Run
GPS and camera need HTTPS (or `localhost`). From the repo root:

```sh
python3 -m http.server 8000   # open http://localhost:8000/wildkin/
node wildkin/tools/test.mjs -v  # logic tests: spawns, battle balance, photo judging, presents
```

Deployed with the rest of the repo to GitHub Pages at `/wildkin/`.

```
src/data.js       species, personalities, moves, items, photo requests, fairy tasks, dialogue
src/game.js       stats, spawns, fairies, luck, presents, save format
src/battle.js     turn-based battle rules
src/scan.js       photo analysis (colors / scenes / MobileNet)
src/art.js        procedural SVG monsters and fairies
src/ar.js         camera + orientation AR
src/encounter.js  the AR encounter flows (luck, talk, photo requests, battle, fairies)
src/main.js       map, GPS / explore movement, menus
vendor/leaflet    Leaflet 1.9.4 (BSD-2)
```
