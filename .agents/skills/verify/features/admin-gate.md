# Admin console login & review gate

The Admin Console (`/admin/index.html`) authenticates editors against CloudBase Auth v2 (`POST /auth/v1/signin`), blocks non-whitelisted users with their copyable UID (`#stranger`), and unlocks the review queue (`审核`, `记录`, `编辑者`) via `boot` once authorized.

## Sub-features

- `admin-login-ui` renders the starry dual-bezel login gate (`#gate` / `#login`), username/password fields (`#gate-user`, `#gate-pw`), and password visibility toggle (`#pw-toggle`).
- `admin-stranger` shows `#stranger` with `#my-uid` and `#copy-uid` when authentication succeeds (`lv: 0`) but the user is not in the `editors` whitelist.
- `admin-boot-queue` transitions from `#gate` to `#top` + `#views` when `boot` returns `lv >= 1`, showing pending badge `#n-wait` and role-gated tabs (`[data-view="eds"]` hidden unless `lv >= 4`).

## How to get to it (user POV)

- Navigate directly to `http://127.0.0.1:$PORT/admin/index.html` (there is no public nav button on the main page).

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/admin/index.html`.
- `localStorage` is clean (`playwright-cli -s="$RUN_ID" localstorage-clear`) so `localStorage.sa_at` does not pre-hide `#gate`.
- Intercept both CloudBase Auth (`https://*.api.tcloudbasegateway.com/auth/v1/*`) and CloudBase API (`https://*.service.tcloudbase.com/api*`) before navigating. Never hit live production auth or mutations during verification.

- **Open login gate & toggle password visibility (`admin-login-ui`).** Navigate to `/admin/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/admin/index.html"` and `playwright-cli -s="$RUN_ID" --raw eval "!document.getElementById('login').hidden + '|' + document.getElementById('gate-pw').type"`. Result is `true|password`. Click `#pw-toggle`: run `playwright-cli -s="$RUN_ID" click "#pw-toggle"` and `playwright-cli -s="$RUN_ID" --raw eval "document.getElementById('gate-pw').type + '|' + document.getElementById('pw-toggle').getAttribute('aria-pressed')"`. Result is `text|true`.
- **Stub login & verify unauthorized stranger screen (`admin-stranger`).** Stub `signin` with a dummy token and `api` (`boot`) with `lv: 0`:
  ```bash
  playwright-cli -s="$RUN_ID" route "https://*.api.tcloudbasegateway.com/auth/v1/signin*" --body='{"access_token":"test-at","refresh_token":"test-rt","expires_in":3600}'
  playwright-cli -s="$RUN_ID" route "https://*.service.tcloudbase.com/api*" --body='{"me":{"uid":"uid-stranger-1","name":"","lv":0}}'
  playwright-cli -s="$RUN_ID" fill "#gate-user" "stranger"
  playwright-cli -s="$RUN_ID" fill "#gate-pw" "secret"
  playwright-cli -s="$RUN_ID" click "#f-pw button[type='submit']"
  ```
  Run `playwright-cli -s="$RUN_ID" --raw eval "!document.getElementById('stranger').hidden + '|' + document.getElementById('my-uid').textContent"`. Result is `true|uid-stranger-1`.
- **Verify authorized review queue (`admin-boot-queue`).** Update the API stub to return an authorized `lv: 4` `boot` payload and click `#reload`:
  ```bash
  playwright-cli -s="$RUN_ID" route "https://*.service.tcloudbase.com/api*" --body='{"me":{"uid":"uid-admin-1","name":"测试超管","lv":4},"docs":[],"subs":[],"edits":[],"more":0}'
  playwright-cli -s="$RUN_ID" click "#reload"
  ```
  Run `playwright-cli -s="$RUN_ID" --raw eval "!document.getElementById('top').hidden + '|' + document.getElementById('me-name').textContent + '|' + !document.querySelector('[data-view=\"eds\"]').hidden"`. Result is `true|测试超管|true`.
- **Proof.** Capture the login gate or unlocked admin workspace. Run `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/admin-gate.yaml"` and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/admin-gate.png"`.

## Gotchas

- `site/admin/index.html` adds `document.documentElement.classList.add('signed')` synchronously in `<head>` whenever `localStorage.sa_at` is truthy, hiding `#gate` before `admin.js` runs. Always clear `localStorage` before testing the login form.
- Clicking `#out` (`退出`) clears `localStorage.sa_at` / `sa_rt` and returns to `#gate`.
