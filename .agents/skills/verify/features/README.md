# Starside verification map

This directory is the maintained source for verifying the user-facing behavior of Destiny 2 Starside (`destiny2-starside`). Read this index before driving the app, then follow the matching feature file as the recipe.

## Baseline preconditions

- `npm run build` and `npm test` pass from `/Users/eliver/code/MISC/destiny2-starside`.
- Launch an isolated HTTP server serving `site/` at `http://127.0.0.1:$PORT` with `RUN_ID="ss-$(date +%s)"`, `SCRATCH="/tmp/starside-verify-$RUN_ID"`, and `EVIDENCE_DIR="$SCRATCH/evidence"`.
- Run `playwright-cli` inside `$SCRATCH` using session `-s="$RUN_ID"` resized to `1440 900`.
- Intercept CloudBase API calls (`https://*.service.tcloudbase.com/api*`) with `playwright-cli -s="$RUN_ID" route` so offline runs are deterministic and never mutate production counters or submissions.
- Run the Doctor check from [`SKILL.md`](../SKILL.md) and require the expected `$PORT`, live server PID, and clean repo working tree.
- Never drive an instance or browser session that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions state otherwise.
- Always use explicit `/index.html` URLs (`cleanUrls` is disabled in `serve.json`).
- Prefer ARIA roles, accessible names, and stable `data-*` attributes over DOM position.
- Treat every command as literal. Keep quoted names and flags unchanged.
- Use `window.scrollTo({top: ..., behavior: 'instant'})` before reading layout or capturing a scrolled viewport.
- Retain all proof artifacts in `$EVIDENCE_DIR` during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot (`.yaml`), a `1440×900` viewport screenshot (`.png`) with the page identity visible, and `--raw eval` state verification.
- Never use `--full-page` screenshots on pages with `content-visibility: auto`.
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with playwright-cli` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Global search & home preview](./global-search.md) covers home page search by Chinese, pinyin, and English names, weapons armory jump links, landing-page row filtering, and empty state.
- [Weapons armory & perk simulator](./weapons-armory.md) covers DIM-syntax queries, scope switching (weapons, exotic armor, armor sets), quick-filter presets, weapon detail perk selection, real-time stat calculation, and PvE/PvP mode switching.
- [Builds directory & facet filtering](./builds-directory.md) covers single-build and build-set directories, class/scene/tier facet bars, tucked branch/tag filter menu, scene regrouping, and zero-match reset.
- [Build forge (creation, import & export)](./build-forge.md) covers interactive slot selection, candidate narrowing, live markdown export, text import round-trip, and submission validation.
- [Reference pages & interactive toolbars](./reference-pages.md) covers in-page search and section chips (`artifact-mods`), column-group toggles (`weapon-frames`), and interactive SVG line charts (`power-delta`).
