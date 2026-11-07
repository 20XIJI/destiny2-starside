# Weapons armory & perk simulator

The Weapons Armory (`/weapons/index.html`) lets a user search and filter 2,208 weapons, 348 exotic armor pieces, and 56 armor sets using DIM query syntax or quick-filter buttons, open an item's detail view, select perks/masterworks/tiers to compute real-time weapon stats, and switch between PvE and PvP (TTK) stat panels.

## Sub-features

- `wpn-scope` switches between `武器`, `异域护甲`, and `护甲套装` scopes and updates the card grid and quick filters.
- `wpn-query` filters items by DIM syntax (`is:`, `perk:`, `stat:`, `breaker:`), quick-filter preset icons, and removable condition pills.
- `wpn-detail-perks` opens a weapon's detail split view, loads `pool.js` and `text.js`, and recalculates displayed stats and URL state (`?w=…&p=…`) when perks, masterwork, or tier (`T1`–`T5`) change.
- `wpn-pvp` switches the right-hand stat panel between `PvE` and `PvP` (experimental TTK / optimal kill metrics).

## How to get to it (user POV)

- Click the `装备库` card on the home page or navigate directly to `http://127.0.0.1:$PORT/weapons/index.html`.
- Click a weapon jump link (`装备库`) from the home page global search results.
- Press `/` anywhere on `/weapons/index.html` while focus is outside an input field to focus `.wpn-input`.

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/weapons/index.html`.
- `localStorage` is clean (`playwright-cli -s="$RUN_ID" localstorage-clear`).

- **Open Weapons Armory.** Navigate to `/weapons/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/weapons/index.html"`. The heading reads `装备库`, `.wpn-scope` has `武器` active, and `.wpn-count` shows the total weapon group count.
- **Quick-filter preset & mutually exclusive group (`wpn-query`).** Click the `手炮` preset button in `.wpn-quick`. Run `playwright-cli -s="$RUN_ID" click ".wpn-quick [data-act='preset'][data-v='is:手炮']"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('.wpn-input').value + '|' + document.querySelector('.wpn-count').textContent"`. The query input reads `is:手炮` and a condition pill is rendered in `.wpn-conds`. Click another weapon type in the same group (`脉冲步枪`): run `playwright-cli -s="$RUN_ID" click ".wpn-quick [data-act='preset'][data-v='is:脉冲步枪']"` and confirm `.wpn-input` replaces `is:手炮` with `is:脉冲步枪` rather than appending.
- **Compound DIM query (`wpn-query`).** Fill the query box with `is:手炮 is:异域`. Run `playwright-cli -s="$RUN_ID" fill ".wpn-input" "is:手炮 is:异域"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelectorAll('#find [data-act=\"open\"]').length"`. Only exotic hand cannons remain in `#find`.
- **Open weapon detail & simulate perks (`wpn-detail-perks`).** Click the first weapon card in `#find`. Run `playwright-cli -s="$RUN_ID" click "#find [data-act='open']"` and wait for `pool.js` and `text.js` to load (`window.WPN_POOL && window.WPN_TEXT`). Run `playwright-cli -s="$RUN_ID" --raw eval "location.search + '|' + !!document.querySelector('.wpn-split')"`. The URL contains `?q=…&w=<hash>` and `.wpn-split` renders the left result rail, center perk matrix, and right stat panel. Click an unselected perk in column 1 or 2 (`[data-act="perk"][aria-pressed="false"]`) and verify via `eval` that `location.search` updates with `&p=` and the stat numbers in `.wpn-stats` update.
- **Switch PvE / PvP stats (`wpn-pvp`).** Click the `PvP` mode button in the stat header. Run `playwright-cli -s="$RUN_ID" click "[data-act='statsmode'][data-v='pvp']"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('[data-act=\"statsmode\"][data-v=\"pvp\"]').getAttribute('aria-pressed')"`. The button is pressed (`true`) and PvP TTK / damage rows appear in the stat panel.
- **Switch scopes (`wpn-scope`).** Click `异域护甲` then `护甲套装` in `.wpn-scope`. Run `playwright-cli -s="$RUN_ID" click ".wpn-scope [data-act='scope'][data-v='armor']"` and `playwright-cli -s="$RUN_ID" --raw eval "location.search + '|' + document.querySelector('.wpn-count').textContent"`. The URL updates to `?s=armor` and the grid displays exotic armor cards. Repeat for `data-v="sets"` (`?s=sets`, `56 套`).
- **Proof.** Capture the weapon detail view with selected perks and stats visible. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/weapons-detail.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/weapons-detail.png"`.

## Gotchas

- `pool.js` (175 KB gzip) and `text.js` (342 KB gzip) load asynchronously on demand. Queries using `perk:`, `stat:`, or `perktext:` show a dashed loading pill and skeleton cards until `window.WPN_POOL` / `window.WPN_TEXT` finish loading and trigger an automatic re-evaluation.
- Selecting a weapon uses `history.pushState` (`?w=<hash>`), whereas changing queries or perk rolls uses `history.replaceState`.
- Roll customizations are persisted to `localStorage` under `wpn.rolls` and view/rail preferences under `wpn.view` / `wpn.rail`. Clear `localStorage` between isolated test runs if asserting default roll state.
