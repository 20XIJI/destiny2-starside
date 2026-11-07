# Builds directory & facet filtering

The Builds Directory (`/builds/index.html` and `/builds/sets/index.html`) lets a user browse seasonal build recommendations and multi-build sets, filter them across five dimensions (class, scene, tier, branch, tag) plus free-text/pinyin search, and open a build detail page with hover tooltips and DIM export links.

## Sub-features

- `builds-facets-bar` filters builds by single-select centered bars (`职业`, `场景`, `强度`), regrouping overlapping `突袭、地牢` cards into a single grid when a specific scene (`突袭` or `地牢`) is selected and restoring exact original order (`ord`) when reset to `全部`.
- `builds-facets-tuck` filters builds by multi-select tucked facets (`分支`, `标签`) inside the `筛选` `<details class="drop">` menu and updates the active filter badge count `b` on the summary button.
- `builds-empty-reset` displays the `.tool-empty` status box and `重置筛选` button when combined filters + search yield 0 matches, and restores all cards when clicked.
- `builds-detail` opens a build detail page (`/builds/s29/<slug>/index.html`) or build set page, shows item hover descriptions (`builds/tip.js`), and provides `复制配装`, `截图`, and `DIM` actions.

## How to get to it (user POV)

- Click the `配装推荐` or `配装合集` card on the home page, or navigate to `http://127.0.0.1:$PORT/builds/index.html`.
- From `/builds/index.html`, click the `配装合集` portal in `.head-portals` to switch to `/builds/sets/index.html`.

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/builds/index.html`.
- CloudBase API requests are stubbed.

- **Open Builds Directory.** Navigate to `/builds/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/builds/index.html"`. The heading reads `配装推荐`, the three centered facet bars (`职业`, `场景`, `强度`) are populated by `assets/app.js`, and `[data-facet-tuck] details.drop` renders the `筛选` trigger.
- **Scene regrouping (`builds-facets-bar`).** Click `地牢` in `[data-facet="场景"]`. Run `playwright-cli -s="$RUN_ID" click "[data-facet='场景'] button[data-v='地牢']"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('.toolbar .tool-count').textContent + '|' + document.querySelectorAll('section.block:not([hidden])').length"`. Overlapping `突袭\t地牢` cards are moved into the `地牢` section (`1` visible section block) and `.tool-count` shows the matching ratio. Click `全部` in `[data-facet="场景"]` and verify via `eval` that cards return to their original sections in ascending `ord` order.
- **Tucked multi-select facets (`builds-facets-tuck`).** Open the `筛选` menu and select `棱镜` and `虚空`. Run `playwright-cli -s="$RUN_ID" click "[data-facet-tuck] summary.toggle"`, `playwright-cli -s="$RUN_ID" click "[data-facet-tuck] button[data-v='棱镜']"`, and `playwright-cli -s="$RUN_ID" click "[data-facet-tuck] button[data-v='虚空']"`. Run `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('[data-facet-tuck] summary.toggle b').textContent"`. The badge reads `2` and the menu stays open so multiple options can be toggled.
- **Zero-match & reset (`builds-empty-reset`).** Enter `不存在的配装词xyz` into `.toolbar .tool-search`. Run `playwright-cli -s="$RUN_ID" fill ".toolbar .tool-search" "不存在的配装词xyz"` and `playwright-cli -s="$RUN_ID" --raw eval "!document.querySelector('.tool-empty').hidden + '|' + document.querySelector('.toolbar .tool-count').textContent"`. `.tool-empty` is visible (`true|0 / …`). Click `重置筛选`: run `playwright-cli -s="$RUN_ID" click ".tool-empty button.op"` and confirm `.tool-count` is empty (`""`), `[data-facet-tuck] summary.toggle b` is `""`, and all sections are visible again.
- **Build detail & hover tooltip (`builds-detail`).** Click the first build card (`a.entry`). Run `playwright-cli -s="$RUN_ID" click "ul.entries a.entry"` and `playwright-cli -s="$RUN_ID" hover "a.item[data-d]"`. Wait for `desc.js` to load, then run `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('.item-tip') && document.querySelector('.item-tip').textContent.slice(0, 30)"`. The floating `.item-tip` panel displays the item's in-site description.
- **Proof.** Capture the filtered Builds Directory state and the build detail tooltip state. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/builds-detail.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/builds-detail.png"`.

## Gotchas

- All facet buttons on `/builds/index.html` are built at runtime by `assets/app.js` scanning `li[data-*]`; the static HTML only contains empty `<nav class="facet-bar" data-facet="…">` containers.
- Empty `.sub-label` headings (for class subsections that exist only as landing targets for `regroup()`) are hidden on initial load by `trimSubs()`.
- Hover tooltips in build details read per-page `desc.js` (`data-desc="desc.js"`) unless disabled via `localStorage.tipoff`.
