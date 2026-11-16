// main.ts — the entrypoint for HARBOUR LINE (threejs-fps-02, Node 22, stdlib only).
//
// It hands the game in: copy this repository's game/ and screenshots/ into the
// output directory and write /output/dossier.json with the vendored make.fun
// library (vendor/makefun-threejs.ts, the kit's copy, unchanged). The run is
// deterministic: same input files, same output bytes, every time.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean directory so a stale screenshot or dossier can never
// leak into the entry; the grader runs this twice and compares the bytes.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// The playable game: static ES modules, three.js 0.187.0 vendored inside.
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });

// The screenshots: real renders of the game's own code, first by name = cover.
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The dossier the judge reads: screenshots first, then the game's source,
// capped at 160 KiB of text. The gate rebuilds it with the same library and
// compares byte for byte, so these options must match the scorer's caps.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
