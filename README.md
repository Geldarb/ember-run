# Ember Run

An original low-poly co-op roguelite FPS that runs in the browser. Clear rooms of enemies, grab random guns, stack perks and beat the golem boss. Built with Three.js (vendored in `public/vendor`) and a small Node server (express + ws) for co-op.

**Play:** https://geldarb.github.io/ember-run/

## How to play
- **Solo:** press ▶ Solo. Works anywhere, including GitHub Pages.
- **Co-op (2–4 players):** one player presses *Co-op: Host* and shares the 5-letter room code or the invite link. Everyone else enters the code and presses *Join*. The host's tab runs the game for everybody, so the host should keep it open and in front.
  Co-op needs the relay server (`server.js`) to be online. GitHub Pages only serves static files, so the Pages build connects to the server in `public/js/config.js`. You can point it somewhere else with `?server=wss://your-host`.
- **Desktop:** WASD move · mouse look · left click shoot · right click aim · Space jump · Shift dash · Q skill · R reload · 1/2 or wheel swap guns · E pick up/open · M mute · Esc pause.
- **Mobile:** play in landscape. Use the left stick to move and drag on the right to look. There are buttons for FIRE / AIM / JUMP / DASH / SKILL / R / ⇄.

Each floor is a chain of rooms. The doors seal when you walk in. Clear every wave, then pick 1 of 3 perks. Follow the light beam to the next room. Beat the golem and step into the portal. In co-op, stand next to a downed friend for 3 seconds to revive them.

## Run the server locally
    npm install
    PORT=3010 node server.js      # open http://localhost:3010 (solo + co-op on the same origin)
    ./start.sh                    # server + Cloudflare quick tunnel, prints a public URL

When the page is served by `server.js`, co-op always uses the same origin (`/ws`). Health check: `/health`.

## Publishing
- `./publish-pages.sh` pushes `public/` to the `gh-pages` branch, which GitHub Pages serves.
- `./publish-config.sh [wss://host/ws]` sets `COOP_SERVER` in `public/js/config.js` (by default to the tunnel URL from the last `./start.sh`), commits it and republishes Pages.

URL flags: `?server=wss://host` (co-op server; invite links carry it along), `?join=CODE` (prefill room code), `?fps`, `?desktop`, `?static` (behave as if statically hosted).

## Structure
- `server.js`: static files + WebSocket room relay (`/ws`), 5-char room codes, max 4 players.
- `public/js/config.js`: co-op server used when statically hosted.
- `public/js/net.js`: solo loopback / WebSocket co-op client.
- `public/js/host.js`: host-authoritative sim (rooms, waves, enemy AI, boss, pickups).
- `public/js/main.js`: rendering, input (desktop + touch), player, weapons, HUD, FX.
- `public/js/level.js`, `data.js`, `audio.js`: level generation, game data, procedural sound.
- `tests/`: puppeteer/ws smoke tests (`node tests/solo.js <url>/`, `node tests/ws.js <url>`).
