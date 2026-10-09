# Ember Run

An original low-poly co-op roguelite FPS that runs in the browser (theme: the Frozen Forge). Fight through 3 floors, loot randomly rolled guns with affixes, stack perks and skill upgrades, beat the bosses and spend the Embers you earn on permanent upgrades. Built with Three.js (vendored in `public/vendor`) and a small Node server (express + ws) for co-op.

**Play:** https://geldarb.github.io/ember-run/

## How to play
- **Solo:** press ▶ Solo. Works anywhere, including GitHub Pages.
- **Co-op (2–4 players):** one player presses *Co-op: Host* and shares the 5-letter room code or the invite link. Everyone else enters the code and presses *Join*. The host's tab runs the game for everybody, so the host should keep it open and in front.
  Co-op needs the relay server (`server.js`) to be online. GitHub Pages only serves static files, so the Pages build connects to the server in `public/js/config.js`. You can point it somewhere else with `?server=wss://your-host`.
- **Desktop:** WASD move · mouse look · left click shoot · right click aim · Space jump · Shift dash · Q skill · R reload · 1/2 or wheel swap guns · E pick up/open · hold Tab (or I) to inspect your weapons · 1/2/3 pick a card · M mute · Esc pause.
- **Mobile:** play in landscape. Use the left stick to move and drag on the right to look. There are buttons for FIRE / AIM / JUMP / DASH / SKILL / R / ⇄. Walk up to a weapon to see its stat card and tap USE to take it. Tap the weapon box (bottom right) to inspect your guns, and tap again to close.

## Characters
Pick one on the main menu (or in the co-op lobby; each player picks their own, doubles allowed). Each has a starting gun, a Q / SKILL ability and a passive.

| Character | Start gun | Skill (Q) | Passive |
|---|---|---|---|
| 💣 Cinder, fire gunner | Rivet Pistol | Magma Grenade (8s): explosion + burning pool for 4s | Wildfire: kills have a 15% chance to ignite nearby enemies |
| 🧊 Frost, ice warden | Forge Rifle | Ice Barrier (12s): 6s wall that blocks enemy shots and slows enemies touching it | Frostbite: every hit slows the enemy 25% |
| 🔨 Anvil, forge tank | Scattergun | Ground Slam (9s): damage, knockback and stun around you | Iron Hide: 140 HP, 10% slower, taking damage shortens the skill cooldown |
| 🏕️ Ember, medic | Rivet Pistol | Warm Hearth (16s): 6s campfire that heals everyone nearby | Second Wind: revives teammates 2x faster |

Each character also has one character-only perk in the perk pool (Lingering Pyre, Permafrost, Aftershock, Kindred Flame).

## Weapons, rarity and affixes
14 weapon types, each with its own fire pattern, low-poly model and projectile look:

| Weapon | Class | Fire pattern | Unlock |
|---|---|---|---|
| Rivet Pistol | Pistol | semi-auto, infinite reserve | — |
| Scattergun | Shotgun | pellet spread | — |
| Forge Rifle | Assault Rifle | full-auto | — |
| Slag Launcher | Rocket Launcher | explosive rocket | — |
| Sleet Sprayer | SMG | fast, inaccurate | — |
| Tri-Forge Carbine | Burst Rifle | 3-round bursts | — |
| Anvil Hand Cannon | Hand Cannon | slow, huge crits | — |
| Cinder Mortar | Grenade Launcher | lobbed, arcing grenades | — |
| Bellows Flamer | Flamethrower | short-range flame spray, burns (🔥 innate) | — |
| Twin Rivets | Dual Pistols | alternating left/right | 90 Embers |
| Rime Crossbow | Crossbow | slow bolt with drop, pierces | 100 Embers |
| Glacier Longshot | Marksman Rifle | scope zoom, pierces 2 | 120 Embers |
| Storm Coil | Arc Caster | lightning that chains to 3 enemies (⚡ innate) | 160 Embers |
| Avalanche Minigun | Minigun | spins up, slows you while firing | 200 Embers |

Rarity sets stat multipliers and the number of random affixes: **Common 0 · Rare 1 · Epic 2 · Legendary 3**.
There are 21 affixes: Hair Trigger, Heavy Slugs, Extended Mag, Keen Eye, Quickload, Molten Core 🔥, Frostbitten ❄️, Static Charge ⚡, Vampiric, Piercing, Explosive Rounds, Ricochet, Steady Grip, Long Barrel, Brutal Edge, Deep Reserves, Overclocked, Glass Cannon, Split Shot, Executioner and Giant Slayer.
Sensible exclusions apply: one element per gun and none on guns with an innate element, Heavy vs Overclocked, Glass vs Extended Mag, no Explosive/Pierce/Split on the rocket launcher, and so on. Names come from the affixes, e.g. *Molten Anvil Hand Cannon of Precision*.

Walk up to (or look at) a weapon on the floor or a chest to see its **stat card**. The card shows damage, DPS, fire rate, magazine, reload, accuracy, crit, range, projectile speed / blast radius, pierce / chain and reserve ammo, each with ▲/▼ against the gun you're holding. It also lists the affixes and the element. Hold **Tab** to inspect your own guns. In co-op, pickups and drops are host-authoritative and synced, so the gun you swap out lands on the floor for everyone.

## The Forge (permanent progress)
Each run earns **Embers**: 4 per room, 1 per 2 kills, 20 per floor, 30 per boss and +60 for a victory. The end screen shows the breakdown. Spend them in **🔥 The Forge** on the main menu:
- **Upgrades:** Hearty Forgeborn (+8 HP ×5), Light Boots (+3% speed ×5), Bandolier (+20% reserve ammo ×3), Hawk Sight (+2% crit ×5), Lodestone (+25% pickup range ×3), Fortune Dice (+1 perk reroll per run ×3), Forge Luck (better rarity ×5), Twin Holsters (start with a 2nd random gun), Phoenix Ember (one free revive per run).
- **Characters:** per character, Forged Sidearm (starting gun +1 rarity with random affixes, up to Legendary) and Mastery (+4% damage, -4% skill cooldown ×5).
- **Armory & Codex:** unlock the 5 locked weapons, and browse every weapon you've found (count + best rarity) and the affixes you've discovered.
- **Records:** runs, wins, best floor, fastest win, kills, rooms, bosses, Embers earned.
- **Reset progress** (click twice to confirm).

Progress is saved in `localStorage` (versioned, and corrupt data falls back to a fresh save). It is **per browser and per site**, so GitHub Pages, Render and localhost each have their own save. In co-op every player brings their own upgrades and earns their own Embers. Weapon drops can be any weapon unlocked by anyone in the room.

## Floors and skill upgrades
There are 3 floors: the Ice Halls, the Molten Forge and **the Ember Core**. The Ember Core is lava-heavy with tougher enemies, and its boss is the always-enraged *Ember Core Colossus*. After the boss on floors 1 and 2, each player picks **1 of 3 upgrades for their character's Q skill**. There are 7 per character, and they stack within the run:
- **Cinder:** Bigger Blast, Lingering Magma, Cluster Charge, Quick Fuse, Lava Trail, Cauterize, Spare Grenade (2 charges)
- **Frost:** Glacier Wall, Mirror Ice (reflects shots), Shatter, Cold Snap, Second Slab (2 charges), Rime Thorns, Frost Nova
- **Anvil:** Wide Quake, Aftershock, Concussion, Iron Skin, Forge Rhythm, Seismic Force, Magma Fissure
- **Ember:** Bonfire, Scorching Hearth, Rekindle, Kindling, War Fire, Phoenix Hearth (revives downed allies), Warm Winds

Your upgrades appear next to the skill icon and in the pause menu. In co-op everyone picks independently. The portal opens once everybody has picked, or after 45 s, and players who disconnect are skipped.

Each floor is a chain of rooms. The doors seal when you walk in. Clear every wave, then pick 1 of 3 perks. Follow the light beam to the next room. Beat the boss and step into the portal. In co-op, stand next to a downed friend for 3 seconds to revive them.

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
- `public/js/weapons.js`: weapon types, rarities, affixes, name/stat generation (pure, unit-tested).
- `public/js/meta.js`: Forge save data, prices, bonuses and Ember earnings (pure, unit-tested).
- `public/js/level.js`, `data.js`, `audio.js`: level generation, game data (characters, perks, skill upgrades), procedural sound.
- `tests/`: `node tests/unit.js` (weapon generator + save data, no browser). Puppeteer/ws tests, which need `puppeteer-core` + `ws` installed and take the base URL as the first argument:
  - `solo.js`: full 3-floor run
  - `chars_solo.js <url>/ <cinder|frost|anvil|ember>`
  - `chars_coop.js`, `chars_mobile.js`, `coop.js`, `ws.js <url>`, `theme.js`, `shots.js`
  - `weapons.js`: all 14 weapons fire, tooltip, inspect, pickup and drop
  - `progress.js`: Forge buy/persist/reset, run bonuses, skill-upgrade offer and effects, Embers, mobile tooltip/inspect
  - `coop_progress.js`: 3 players: per-player saves, pickup/drop sync, contested pickup, independent picks, disconnect/timeout
  - `floor3.js`: Ember Core and boss
