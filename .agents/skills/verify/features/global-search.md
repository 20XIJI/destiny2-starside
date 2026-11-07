# Global search & home preview

Global search lets a user search all reference pages, items, and builds from the home page using Chinese text, pinyin (full or initials), or English item names, jump to the Weapons Armory for weapon queries, and land directly on the filtered row and section of a reference page.

## Sub-features

- `search-cn` matches page titles, item names, and body text in Chinese, ranking Compendium (`c:1`) pages first and inserting a Weapons Armory jump link for weapon hits.
- `search-pinyin-en` matches catalog item names by pinyin initials/full spelling or English name without exposing English text in the page body.
- `search-land` navigates from a search hit (`<page>?q=<term>#<section>`) into the target reference page, pre-filling its toolbar search box and filtering rows to the match.
- `search-empty` reports zero hits (`没有命中`) and marks `.hero-search[data-miss]` when a query has no matches.
- `search-clear` clears the query via `Escape` and collapses the hit listbox.

## How to get to it (user POV)

- Open the home page (`http://127.0.0.1:$PORT/index.html`) and focus the `搜索全站资料` combobox in `.hero-band`.
- Type a query in the `搜索全站资料` combobox and press `ArrowDown` / `Enter` or click a result in `#hero-hits`.

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/index.html`.
- CloudBase API requests are stubbed with `playwright-cli -s="$RUN_ID" route "https://*.service.tcloudbase.com/api*" --body='{"today":12,"total":3456}'`.
- Doctor check passes for session `$RUN_ID`.

- **Open home page.** Navigate to the home page. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/index.html"`. The page title is `Starside · Destiny 2 中文资料台` and the `.hero-search` combobox (`搜索全站资料`) is rendered.
- **Chinese weapon search (`search-cn`).** Focus and fill the search combobox with `枯萎囤积`. Run `playwright-cli -s="$RUN_ID" fill "getByRole('combobox', { name: '搜索全站资料' })" "枯萎囤积"`. Wait for `assets/search.js` to load, then run `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('.hero-search .tool-count').textContent"`. The status reads `N 条命中` (e.g., `16 条命中`), the first item in `#hero-hits` is `异域武器详解 · 动能武器`, followed by the `装备库` jump link (`weapons/index.html?q=%E6%9E%AF%E8%90%8E%E5%9B%A4%E7%A7%AF`).
- **Pinyin and English match (`search-pinyin-en`).** Replace the query with pinyin initials `kwtj`. Run `playwright-cli -s="$RUN_ID" fill "getByRole('combobox', { name: '搜索全站资料' })" "kwtj"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('#hero-hits .hit b').textContent"`. The top hit title is `枯萎囤积`. Replace the query with `Witherhoard`: run `playwright-cli -s="$RUN_ID" fill "getByRole('combobox', { name: '搜索全站资料' })" "Witherhoard"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('#hero-hits .hit b').textContent"`. The top hit title is again `枯萎囤积`.
- **Empty state (`search-empty`).** Enter a non-existent query `不存在的词xyz`. Run `playwright-cli -s="$RUN_ID" fill "getByRole('combobox', { name: '搜索全站资料' })" "不存在的词xyz"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('.hero-search').hasAttribute('data-miss') + ':' + document.querySelector('.hero-search .tool-count').textContent"`. The result is `true:没有命中`.
- **Escape clear (`search-clear`).** Press `Escape` in the search input. Run `playwright-cli -s="$RUN_ID" press Escape` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('#hero-hits').childElementCount"`. The hit list is empty (`0`) and `aria-expanded` is `false`.
- **Landing filter (`search-land`).** Search `枯萎囤积` again and click the first reference page hit (`异域武器详解 · 动能武器`). Run `playwright-cli -s="$RUN_ID" fill "getByRole('combobox', { name: '搜索全站资料' })" "枯萎囤积"`, `playwright-cli -s="$RUN_ID" click "#hero-hit-0"`, and `playwright-cli -s="$RUN_ID" --raw eval "location.pathname + ':' + document.querySelector('.toolbar .tool-search').value + ':' + document.querySelector('.toolbar .tool-count').textContent"`. The browser lands on `/exotic-weapon/index.html`, the page's toolbar search input is pre-filled with `枯萎囤积`, and `.tool-count` reports the filtered row count (e.g., `4 / 141`).
- **Proof.** Capture the populated search results on the home page and the filtered landing state. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/global-search-landed.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/global-search-landed.png"`.

## Gotchas

- `assets/search.js` (approx. 1.2 MB) is lazy-loaded on `requestIdleCallback` (up to 3s timeout) or on the first `focus`/`input` event on the search box. While loading, `.tool-count` momentarily reads `索引载入中…` before re-drawing with the actual results.
- Pinyin and English matching apply only to catalog item/set/mod names (`window.starsidePy`), not to arbitrary prose or boss names.
- The `装备库` jump row (`r.jump`) is inserted into `#hero-hits` for weapon queries but is intentionally excluded from the `N 条命中` counter.
