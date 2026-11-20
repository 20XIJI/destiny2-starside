# Eververse, Xûr & Ada-1 rotation shop

The Rotation Shop (`/eververse/index.html`) displays the current Eververse bright-dust and silver inventory, Xûr's weekend offerings, and Ada-1's weekly armor shaders from same-origin JSON files (`../rotation/eververse.json` and `../rotation/xur.json`), with live cycle countdowns and vendor tab switching.

## Sub-features

- `shop-tabs` switches between `永恒之诗 · 光尘与银币` (`#eververse`), `仄 (Xûr)` (`#xur`), and `装甲合成 · 艾达-1 (Ada-1)` (`#ada`), updating `aria-pressed`, active pane visibility, and URL hash.
- `shop-render` populates `#ev-primary`, `#ev-secondary`, `#ev-silver`, and `#ev-cur-cycle` / `#ev-next-reset` / `#ev-last-fetch` from `../rotation/eververse.json` and replaces skeleton cards with rendered item cards.
- `shop-xur-ada` renders Xûr weapon/armor offers from `../rotation/xur.json` and Ada-1 shaders from the `ada` field of `eververse.json`, surfacing clear `.ev-error` notices when rotation payloads fail or are stale.

## How to get to it (user POV)

- Click the `光尘商店` card on the home page or navigate directly to `http://127.0.0.1:$PORT/eververse/index.html`.
- Switch tabs using the top `.ev-scope` buttons (`#eververse`, `#xur`, `#ada`) or jump directly via `#xur` / `#ada` URL hash.

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/eververse/index.html`.
- Because `site/rotation/` is written on CloudBase static hosting rather than committed in `site/`, intercept `**/rotation/eververse.json*` and `**/rotation/xur.json*` with deterministic test payloads (or verify the error fallback when unstubbed).
- Any `dialog.ss-notice` modal is dismissed.

- **Stub rotation JSONs & open shop (`shop-render`).** Register routes for `eververse.json` and `xur.json` before navigating:
  ```bash
  playwright-cli -s="$RUN_ID" route "**/rotation/eververse.json*" --body='{"cycleStart":"2026-11-19T17:00:00.000Z","resetAt":"2026-11-20T17:00:00.000Z","updatedAt":"2026-11-20T01:05:00.000Z","fresh":true,"total":1,"items":[{"hash":1,"name":"测试皮肤","type":"皮肤","group":"主要光尘优惠","currency":"dust","cost":1250}],"ada":{"cycleStart":"2026-11-17T17:00:00.000Z","resetAt":"2026-11-24T17:00:00.000Z","total":1,"items":[{"hash":2,"name":"测试着色器","currency":"glimmer","cost":10000}]}}'
  playwright-cli -s="$RUN_ID" route "**/rotation/xur.json*" --body='{"arrival":"2026-11-20T17:00:00.000Z","departure":"2026-11-24T17:00:00.000Z","updatedAt":"2026-11-20T17:05:00.000Z","fresh":true,"total":1,"items":[{"hash":3,"name":"测试异域武器","category":"exoticWeapon","currency":"coin","cost":23}]}'
  playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/eververse/index.html"
  ```
  Run `playwright-cli -s="$RUN_ID" --raw eval "document.querySelectorAll('#ev-primary .ev-skeleton').length + '|' + document.querySelector('#ev-cur-cycle').textContent"`. Skeleton count is `0` and `#ev-cur-cycle` is populated (not `--`).
- **Switch to Xûr and Ada-1 tabs (`shop-tabs`, `shop-xur-ada`).** Click `#xur` then `#ada`: run `playwright-cli -s="$RUN_ID" click "#xur"` and `playwright-cli -s="$RUN_ID" --raw eval "document.getElementById('xur').getAttribute('aria-pressed') + '|' + document.getElementById('ev-pane-eververse').hidden"`. `#xur` is `true` and `#ev-pane-eververse` is hidden (`true`). Repeat with `playwright-cli -s="$RUN_ID" click "#ada"` and confirm `#ada` has `aria-pressed="true"`.
- **Proof.** Capture the active tab view. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/eververse-shop.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/eververse-shop.png"`.

## Gotchas

- `site/rotation/eververse.json` and `site/rotation/xur.json` are published dynamically by CloudBase timer functions (`sync_rotation` / `sync_xur`), so an unstubbed local `http.server` returns `404` and triggers `.ev-error` banners. Always stub both JSON routes when proving populated cards, and test the `404` path separately if verifying failure UI.
- `eververse/app.js` appends `?v=<latestExpectedSyncMs>` to the JSON URLs; always use a wildcard suffix (`**/rotation/eververse.json*`) in `playwright-cli route`.
