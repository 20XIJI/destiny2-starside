# Reference pages & interactive toolbars

Reference pages (`/artifact-mods/index.html`, `/weapon-frames/index.html`, `/power-delta/index.html`, `/rotation/index.html`, and 40+ other generated pages) provide three toolbar modes driven by `assets/app.js` and `assets/chart.js`: in-page text/pinyin search with section jump chips, column-group visibility toggles (`data-cols` / `data-solo`), and the multi-view Power Delta observer (`data-chart`).

## Sub-features

- `ref-search-chips` filters `.mod` / `.set` / `.gen tbody tr:not(.lane)` items by substring or item-name pinyin, hides empty sections and their corresponding `.chip` links, and scrolls instantaneously (`behavior: 'instant'`) to a section via `replaceState` when a chip is clicked.
- `ref-col-groups` toggles table column groups on `/weapon-frames/index.html` (`data-cols`, `data-solo`), enforcing mutual exclusion among numeric DPS/reload column groups while keeping identity columns visible.
- `ref-chart` renders the interactive Power Delta observer on `/power-delta/index.html` with three view modes (`伤害倍率` / `每光收益` / `等效怪血量`), combat-zone zoom (`实战区 -50~+20`), curve overlay (`传说战役`), mark toggle (`标注`, hidden outside `mult` mode), and source table drawer (`数据表`).

## How to get to it (user POV)

- Click `神器模组`, `武器框架`, or `压光伤害` on the home page, or navigate directly to `/artifact-mods/index.html`, `/weapon-frames/index.html`, or `/power-delta/index.html`.

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/`.
- CloudBase API requests are stubbed and any `dialog.ss-notice` modal is dismissed.

- **Artifact Mods search & chip jump (`ref-search-chips`).** Navigate to `/artifact-mods/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/artifact-mods/index.html"`. Fill `.toolbar .tool-search` with `狙击手冥想`: run `playwright-cli -s="$RUN_ID" fill ".toolbar .tool-search" "狙击手冥想"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('.toolbar .tool-count').textContent + '|' + document.querySelectorAll('.artifact:not([hidden])').length"`. The count shows `1 / 490` (matching total `.mod` entries) and non-matching artifact sections and their chips are hidden. Clear the search (`fill ".toolbar .tool-search" ""`), click the last chip in `.tool-chips`, and confirm `location.hash` updates via `replaceState` (`history.length` does not increase).
- **Weapon Frames column-group toggles (`ref-col-groups`).** Navigate to `/weapon-frames/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/weapon-frames/index.html"`. By default, `基础数值`, `评分`, and `注解` are pressed (`aria-pressed="true"`). Click `首领 DPS` in `.tool-chips`: run `playwright-cli -s="$RUN_ID" click ".tool-chips button.toggle:has-text('首领 DPS')"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector(\".tool-chips button.toggle:has-text('基础数值')\").getAttribute('aria-pressed') + '|' + document.querySelector(\".tool-chips button.toggle:has-text('首领 DPS')\").getAttribute('aria-pressed')"`. Because both belong to `data-solo`, `基础数值` turns `false` and `首领 DPS` turns `true`.
- **Power Delta multi-view observer (`ref-chart`).** Navigate to `/power-delta/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/power-delta/index.html"` and wait for `assets/chart.js` to render `.chart-seg` and `svg`. Run `playwright-cli -s="$RUN_ID" --raw eval "!!document.querySelector('.chart-seg [data-mode=\"mult\"][aria-pressed=\"true\"]') + '|' + !!document.querySelector('.off-screen > table.gen')"`. Both are `true`. Switch to `每光收益`: run `playwright-cli -s="$RUN_ID" click ".chart-seg [data-mode='marginal']"` and verify `[data-mode="marginal"]` has `aria-pressed="true"` and the `标注` toggle becomes hidden (`hidden === true`). Toggle `实战区 -50~+20` (`click ".chart-tog.zoom"`), `传说战役` (`click ".chart-tog.s1"`), and `数据表` (`click ".chart-ctls button:has-text('数据表')"`) and verify `.off-screen` is removed from the source table wrapper.
- **Proof.** Capture a viewport screenshot and ARIA snapshot of the rendered observer or filtered artifact mods page. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/reference-pages.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/reference-pages.png"`.

## Gotchas

- Shopping list pages (`shopping-primary/`, `shopping-special/`, `shopping-heavy/`) split records after the fold into `rest.gz` / `rest.html` (`首屏记录：3`). `app.js` re-collects items when the `starside:rest` event fires; wait for `window.starsideRest` or check `.tool-search` placeholder (`搜索 N 个条目`) before asserting full-table counts.
- In `/power-delta/index.html`, the `标注` button is only shown in `伤害倍率` (`mult`) mode and intentionally hidden in `每光收益` (`marginal`) and `等效怪血量` (`ehp`) modes.
- Never use `playwright-cli screenshot --full-page` on `/artifact-mods/index.html` or `/armor-sets/index.html`: off-screen `.mod-row` and `.set-bonuses` have `content-visibility: auto` and appear blank in full-page captures. Scroll to the target section with `window.scrollTo({top: Y, behavior: 'instant'})` and take a viewport screenshot.
