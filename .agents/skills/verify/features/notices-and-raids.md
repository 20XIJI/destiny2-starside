# Site notices & Raid/Dungeon guides

First-time visitors see a site-wide notice dialog (`dialog.ss-notice`) loaded from `assets/notice.js` and persisted via `localStorage`/`sessionStorage` key `sn`; the home page and notice footer link to `/notices/index.html` (archive) and `/raid-guides/index.html` (full Raid & Dungeon index with section chips).

## Sub-features

- `notice-modal` opens `dialog.ss-notice` automatically on clean storage when visiting `/index.html`, renders `#ss-notice-title` and action cards, and records `notice.id` into `localStorage.sn` when dismissed via `.ss-notice-ok` (`知道了`) or `.ss-notice-x`.
- `notice-persist` keeps `dialog.ss-notice` closed on reload and on `/notices/index.html` once acknowledged.
- `raid-guides-nav` renders `/raid-guides/index.html` with `突袭` and `地牢` section chips in `.toolbar` and filters entries via `.toolbar .tool-search`.

## How to get to it (user POV)

- Open `http://127.0.0.1:$PORT/index.html` in a fresh browser session (notice modal appears automatically).
- Click `站内公告` in `.hero-util-links` or `往期公告 →` inside the modal to open `/notices/index.html`.
- Click the `Raid & 地牢` card on the home page or navigate to `http://127.0.0.1:$PORT/raid-guides/index.html`.

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/index.html`.
- `localStorage` and `sessionStorage` are clean (`playwright-cli -s="$RUN_ID" localstorage-clear` and `sessionstorage-clear`).
- CloudBase API requests are stubbed.

- **Observe & dismiss first-visit notice modal (`notice-modal`).** Navigate to `/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/index.html"` and `playwright-cli -s="$RUN_ID" --raw eval "Boolean(document.querySelector('dialog.ss-notice[open]')) + '|' + (document.getElementById('ss-notice-title') || {}).textContent"`. The modal is open (`true|…`). Capture proof of the modal before closing if verifying notices, then click `.ss-notice-ok`: run `playwright-cli -s="$RUN_ID" click ".ss-notice-ok"` and `playwright-cli -s="$RUN_ID" --raw eval "Boolean(document.querySelector('dialog.ss-notice')) + '|' + Boolean(localStorage.getItem('sn'))"`. The dialog is removed (`false|true`) and `localStorage.sn` is set.
- **Verify persistence on reload (`notice-persist`).** Reload `/index.html`: run `playwright-cli -s="$RUN_ID" reload` and `playwright-cli -s="$RUN_ID" --raw eval "Boolean(document.querySelector('dialog.ss-notice[open]'))"`. Result is `false`.
- **Verify Raid & Dungeon guides (`raid-guides-nav`).** Navigate to `/raid-guides/index.html`: run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/raid-guides/index.html"` and `playwright-cli -s="$RUN_ID" --raw eval "document.querySelector('h1').textContent + '|' + Array.from(document.querySelectorAll('.toolbar .tool-chips a.chip')).map(a => a.textContent.trim()).join(',')"`. Output confirms `Raid & 地牢|突袭,地牢`.
- **Proof.** Capture the notice modal or Raid & Dungeon page. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/notices-and-raids.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/notices-and-raids.png"`.

## Gotchas

- `assets/notice.js` skips showing the modal on `/notices/index.html` and marks `sn` seen automatically there.
- The inline notice loader in HTML pages only triggers when `window === top` (so embedded iframes such as the Build Forge inside `/admin/` never pop up the notice modal).
