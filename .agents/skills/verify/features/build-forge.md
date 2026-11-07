# Build forge (creation, import & export)

The Build Forge (`/builds/new/index.html` and `/builds/new/set/index.html`) lets a user author a single build or multi-build set by filling metadata and picking equipment/skills from a live candidate grid, exports standard Starside markdown in `#out`, imports existing markdown round-trip via `#in`, and validates required fields before submission.

## Sub-features

- `forge-pick` opens the candidate picker for any slot (`职业`, `元素`, `超能`, `异域护甲`, `异域武器`, etc.), narrows candidates by class/slot/tier rules, and updates the live slot cell and `#out` markdown.
- `forge-facets` toggles scene (`适用环境`), tier (`强度`), and scene-scoped tags (`标签` only shown for `突袭`/`地牢` or `PVP`).
- `forge-import` imports a complete build markdown block from `#in` into the form, populating all slots, prose fields, and the core icon, and reporting `已导入` in `#imp-tip`.
- `forge-submit-guard` blocks submission (`#send`) when any of the 7 required fields (`配装名称`, `推荐人`, `职业`, `属性`, `适用环境`, `强度`, `核心`) are missing, and sends `POST {a:"sub",md}` when complete.

## How to get to it (user POV)

- Click the `配装工具` card on the home page, click `投稿配装` in the Builds Directory header, or navigate directly to `http://127.0.0.1:$PORT/builds/new/index.html` (or `/builds/new/set/index.html` for build sets).

## Driving it with playwright-cli

Preconditions:

- Starside is healthy at `http://127.0.0.1:$PORT/builds/new/index.html`.
- CloudBase API requests are stubbed with `playwright-cli -s="$RUN_ID" route "https://*.service.tcloudbase.com/api*" --body='{"ok":1}'`.

- **Open Build Forge.** Navigate to `/builds/new/index.html`. Run `playwright-cli -s="$RUN_ID" goto "http://127.0.0.1:$PORT/builds/new/index.html"`. The heading input (`配装名称`) and empty slot buttons (`[data-slot]`) are rendered, and `window.starsideVocab` is loaded.
- **Check submission guard on empty form (`forge-submit-guard`).** Click `#send` (`投稿`) on a blank form. Run `playwright-cli -s="$RUN_ID" click "#send"` and `playwright-cli -s="$RUN_ID" --raw eval "document.getElementById('copy-tip').textContent"`. `#copy-tip` reports the missing required fields (`还缺：配装名称、推荐者、职业、元素、适用环境、强度、核心装备`).
- **Pick class, element, and super (`forge-pick`).** Click the `职业` slot button (`[data-slot="职业"]`), then pick `猎人` in `.picker`. Run `playwright-cli -s="$RUN_ID" click "[data-slot='职业']"` and `playwright-cli -s="$RUN_ID" click ".picker .pick-item"`. Click `[data-slot="元素"]` and pick `棱镜`: run `playwright-cli -s="$RUN_ID" click "[data-slot='元素']"` and `playwright-cli -s="$RUN_ID" click ".picker .pick-item:has-text('棱镜')"`. Verify via `eval` that `<main id="sheet">` gains class `b-prismatic` and `.cls-id` mirrors `猎人 · 棱镜`.
- **Toggle scene-scoped tags (`forge-facets`).** Click `突袭` under `适用环境` and `meta` under `强度`. Run `playwright-cli -s="$RUN_ID" click ".facets button:has-text('突袭')"` and `playwright-cli -s="$RUN_ID" click ".facets button:has-text('meta')"`. Verify via `eval` that the `输出`, `机制`, and `五壮举` tag buttons become unhidden (`!document.querySelector("button[data-for*='突袭']").hidden`).
- **Import markdown round-trip (`forge-import`).** Open `#imp` (`从配装文本导入`), paste a valid build markdown text into `#in`, and trigger `input` or click `#to-import`. Run:
  ```bash
  playwright-cli -s="$RUN_ID" --raw eval "
    document.getElementById('imp').open = true;
    var md = '# 测试猎人配装\n推荐人：测试员\n描述：用于验证导入导出\n场景：突袭\n标签：输出\n职业：猎人\n分支：棱镜\n强度：meta\n核心：星界夜鹰\n\n## 职业\n超能：黄金枪：神枪手\n星相：\n碎片：\n\n## 护甲\n异域护甲：星界夜鹰\n';
    var inp = document.getElementById('in');
    inp.value = md;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('imp-tip').textContent + '|' + document.getElementById('out').value.split('\n')[0];
  "
  ```
  The result confirms `#imp-tip` updated and `#out` starts with `# 测试猎人配装`, with `星界夜鹰` filled in both the exotic armor slot and the `#f-core-art` core icon.
- **Proof.** Expand `#src` (`展开配装文本`) and capture the populated Build Forge state. Run `playwright-cli -s="$RUN_ID" --raw eval "document.getElementById('src').open = true"`, `playwright-cli -s="$RUN_ID" snapshot --filename="evidence/build-forge.yaml"`, and `playwright-cli -s="$RUN_ID" screenshot --filename="evidence/build-forge.png"`.

## Gotchas

- Prose inputs (`描述`, `注解`, `审核意见`, `合集介绍`) use an overlay `.ink` mirror (`el.style.color = 'transparent'`) to render color tokens (`{token|…}`) inline. Reading `el.value` returns plain text; `document.getElementById('out').value` contains the serialized markdown with `{token|…}` markers restored.
- Leading `#` characters and unmatched braces `{` `}` typed into prose fields are stripped on the fly by `tidy()` so user input cannot corrupt markdown section boundaries.
- `#f-verdict` (`审核意见`) is hidden by default for public users and only unhidden when `starsideForm.review(true)` is called by the admin review stage or when an imported build already contains a `## 审核意见` section.
