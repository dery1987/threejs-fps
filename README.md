# HARBOUR LINE — a tactical three.js FPS

[![make.fun](https://img.shields.io/badge/make.fun-threejs--fps--02-orange)](https://make.fun/c/threejs-fps-02)
[![three.js 0.187.0](https://img.shields.io/badge/three.js-0.187.0-blue)](https://threejs.org)
[![No build step](https://img.shields.io/badge/build-none-green)](https://make.fun/c/threejs-fps-02)

A round-based tactical first-person shooter in the style Counter-Strike made
famous — built for the [make.fun](https://make.fun/c/threejs-fps-02) bounty
**"Make the best three.js tactical FPS"** (threejs-fps-02, $1,000).

> Play it with the referral `nqc8pk6g` — and if you build on make.fun, that
> code is the one to use when you sign up.

## The game

At a dusk container terminal, **Vanguard** (attackers, you + 4 bots) plants a
charge at site **A** or **B** while **Sentinel** (5 bots) holds the line.
First to 5 rounds takes the harbour.

- **5v5 rounds, 100 seconds each** — win by elimination, detonation, or
  defuse; buy phase before every round
- **Economy** — $800 to start, +$300 per kill, +$3,250 for a round win,
  +$1,900 for a loss; spend it in the buy menu (**B**)
- **Arsenal** — Kestrel P9 pistol, Squall SMG, Longshore AR, Tidebolt DMR,
  frag and smoke grenades, Kevlar armor
- **Gunplay that rewards stillness** — headshots deal double, recoil and
  spread punish firing on the move, ADS (right-click) tightens the cone
- **Bots with a brain** — waypoint routes to both sites, hold angles, engage
  on line-of-sight, react to gunfire they hear, plant and defuse
- **Full HUD** — health, armor, ammo, money, round timer, score, killfeed,
  dynamic crosshair, hitmarker, plant/defuse progress, scoreboard (Tab)
- **Original art, all in code** — procedural canvas textures, low-poly
  containers and cranes, sodium lamps over a dusk sky; synthesised WebAudio
  gunfire, no audio or image files anywhere

## Play it

```sh
node serve.ts        # then open http://localhost:8080
```

No build step, no network: `game/` is plain static files, three.js 0.187.0
vendored under `game/vendor/three/`. Desktop Chrome with WebGL 2.

| Key | Action |
| --- | --- |
| W A S D + mouse | Move / look (click to lock the pointer) |
| Click / R | Fire / reload |
| B, then 1–7 | Buy menu |
| G / Q | Frag / smoke grenade |
| E (hold) | Plant or defuse the charge |
| Shift / Ctrl / Space | Walk / crouch / jump |
| Right-click | Aim down sights |
| Tab | Scoreboard |

## Entry

`main.ts` (Node 22, standard library only) copies `game/` and `screenshots/`
to the output directory and writes `dossier.json` with
`vendor/makefun-threejs.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots in `screenshots/` are real renders of this game's own code,
staged with `?shot=cover|buy|plant|score`.

## License

MIT — see [LICENSE](LICENSE).
