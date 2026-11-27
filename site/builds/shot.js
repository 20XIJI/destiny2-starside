/* 把一套配装渲染成一张 PNG：克隆目标 DOM，包进 SVG foreignObject，画进 canvas。
   四处共用：单套详情页、合集单套、配装/合集工具页、审核台（iframe 出图、父窗口弹图）。 */

const SCALE = 2;
const CONTENT_WIDTH = 1060;
const PAD_X = 24;
const CANVAS_WIDTH = CONTENT_WIDTH + PAD_X * 2;

const dataUriCache = new Map();
let cssCacheKey = '';
let cssCachePromise = null;

function base64(buf) {
  const bytes = new Uint8Array(buf);
  const STEP = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += STEP) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(s);
}

function dataUri(url) {
  let pending = dataUriCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
        const type = res.headers.get('content-type') || 'application/octet-stream';
        return res.arrayBuffer().then((buf) => 'data:' + type + ';base64,' + base64(buf));
      })
      .catch((err) => {
        dataUriCache.delete(url);
        throw err;
      });
    dataUriCache.set(url, pending);
  }
  return pending;
}

/* 仅内联 @font-face 内的字体资源，跳过页脚公安备案图等与配装正文无关的背景图。 */
async function inlineFontsInCss(css, baseHref) {
  const blocks = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)];
  if (!blocks.length) return css;
  const urlPairs = new Map();
  for (const [block] of blocks) {
    for (const [whole, raw] of block.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (raw.startsWith('data:')) continue;
      const abs = new URL(raw, baseHref).href;
      urlPairs.set(whole, abs);
    }
  }
  if (!urlPairs.size) return css;
  const entries = [...urlPairs.entries()];
  const uris = await Promise.all(entries.map(([, abs]) => dataUri(abs)));
  let out = css;
  for (let i = 0; i < entries.length; i++) {
    out = out.split(entries[i][0]).join('url("' + uris[i] + '")');
  }
  return out;
}

function inlineCss() {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  if (!links.length) throw new Error('这一页一份样式表都没引，出图必然是白的');
  const key = links.map((l) => l.href).join('\n');
  if (cssCachePromise && cssCacheKey === key) return cssCachePromise;
  cssCacheKey = key;
  cssCachePromise = Promise.all(
    links.map(async (link) => {
      const res = await fetch(link.href);
      if (!res.ok) throw new Error(link.href + ' → HTTP ' + res.status);
      return inlineFontsInCss(await res.text(), link.href);
    })
  )
    .then((parts) => {
      const merged = parts.join('\n');
      return merged.replace(/(^|[}\s,])(:root)(?=[\s,{:.#[])/g, '$1$2, .shot-root');
    })
    .catch((err) => {
      cssCachePromise = null;
      throw err;
    });
  return cssCachePromise;
}

function rootCss(width) {
  return `.shot-root {
  --vw: ${width / 100}px;
  --wrap: ${CONTENT_WIDTH}px;
  --min: ${width}px;
  color: var(--bone);
  font: 400 14px/1.85 var(--font-body);
  font-variant-numeric: tabular-nums;
  background:
    repeating-linear-gradient(0deg, var(--grid) 0 1px, transparent 1px 88px),
    repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px 88px),
    var(--atmo),
    var(--ink);
  background-repeat: repeat, repeat, repeat-x, repeat;
  background-size: auto, auto, 100% 640px, auto;
}
.shot-accent {
  height: 2px;
  background: var(--accent, var(--hair-lit));
  opacity: .9;
}
.shot-stage {
  padding: 24px ${PAD_X}px 0;
}
.shot-stage > main,
.shot-stage > .set-one {
  width: 100%;
  max-width: none;
  margin: 0;
  padding: 0;
}
.shot-stage > main > .block:last-of-type,
.shot-stage > .set-one > .block:last-of-type {
  margin-bottom: 0;
}
.shot-stage textarea {
  overflow: hidden;
  resize: none;
}
.shot-stage .shot-desc-text {
  display: block;
  white-space: pre-wrap;
  word-break: break-word;
}
.shot-stage .who-text {
  display: block;
  color: var(--bone);
  font: 500 13px/1.5 var(--font-cn);
  word-break: break-word;
}
.shot-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 22px;
  padding: 13px ${PAD_X}px 16px;
  border-top: 1px solid var(--hair);
  color: var(--bone-dim);
  font: 400 12px/1.4 var(--font-mono);
}
.shot-foot-l,
.shot-foot-r {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.shot-foot-brand {
  color: var(--bone);
  font: 600 12px/1 var(--font-disp);
  letter-spacing: .1em;
}
.shot-foot-sep {
  color: var(--bone-ghost);
}
.shot-foot-r {
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}`;
}

function readVal(el) {
  if (!el) return '';
  return ('value' in el ? el.value : el.textContent || '').trim();
}

function extractMeta(root, opts) {
  const isSetForm = root.matches('#sheet[data-set]');
  const isSetItem = root.classList.contains('set-one');
  const branchClass = [...root.classList].find((c) => c.startsWith('b-')) || '';

  let title = '';
  let setTitle = '';
  let author = '';
  let season = '';

  if (isSetForm) {
    title = readVal(root.querySelector('.set-body input[data-key="配装名"]'));
    setTitle = readVal(root.querySelector('#set-head input[data-key="合集名"]'));
    author = readVal(root.querySelector('#set-head input[data-key="推荐人"]')).split('|')[0].trim();
    season = readVal(root.querySelector('#set-head .season'));
  } else if (isSetItem) {
    title = readVal(root.querySelector('.one-head h2'));
    setTitle = readVal(document.querySelector('.build-head h1'));
    author = readVal(document.querySelector('.build-head .who .nm'));
    season = readVal(document.querySelector('.build-head .season'));
  } else if (opts.preview) {
    title = readVal(root.querySelector('input[data-key="配装名"]'));
    author = readVal(root.querySelector('input[data-key="推荐人"]'));
    season = readVal(root.querySelector('.season'));
  } else {
    title = readVal(root.querySelector('.build-head h1'));
    author = readVal(root.querySelector('.build-head .who .nm'));
    season = readVal(root.querySelector('.season'));
  }

  let right = '';
  if (opts.preview) {
    const parts = [];
    if (setTitle) parts.push(setTitle);
    if (author && isSetForm) parts.push('推荐者 ' + author);
    parts.push(opts.review ? '待审预览' : '配装工具预览');
    right = parts.join(' · ');
  } else {
    const path = location.pathname.replace(/\/index\.html$/, '');
    const sitePath = path.includes('/builds/')
      ? 'starside.work' + path + (isSetItem && root.id ? '#' + root.id : '')
      : 'starside.work';
    const parts = [];
    if (isSetItem && setTitle) parts.push(setTitle);
    if (isSetItem && author) parts.push('推荐者 ' + author);
    parts.push(sitePath);
    right = parts.join(' · ');
  }

  return { title, setTitle, author, season, branchClass, right };
}

function hasNotesIn(root, preview) {
  const scope = root.matches('#sheet[data-set]')
    ? root.querySelector('.set-body') || root
    : root;
  const nodes = scope.querySelectorAll('.verdict, [id$="sec-5"]');
  for (const el of nodes) {
    if (el.hidden) continue;
    if (preview) {
      const f = el.querySelector('input, textarea');
      if (f && (f.value || '').trim()) return true;
    } else if ((el.textContent || '').trim()) {
      return true;
    }
  }
  return false;
}

function buildFooter(meta) {
  const foot = document.createElement('footer');
  foot.className = 'shot-foot';

  const left = document.createElement('div');
  left.className = 'shot-foot-l';
  const mark = document.createElement('span');
  mark.className = 'mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  const brand = document.createElement('span');
  brand.className = 'shot-foot-brand';
  brand.textContent = 'STARSIDE';
  left.append(mark, brand);
  if (meta.season) {
    const sep = document.createElement('span');
    sep.className = 'shot-foot-sep';
    sep.textContent = '·';
    const s = document.createElement('span');
    s.textContent = meta.season;
    left.append(sep, s);
  }

  const right = document.createElement('div');
  right.className = 'shot-foot-r';
  right.textContent = meta.right;

  foot.append(left, right);
  return foot;
}

function buildFrame(clone, meta) {
  const frame = document.createElement('div');
  frame.className = 'shot-frame';

  const accent = document.createElement('div');
  accent.className = 'shot-accent';

  const stage = document.createElement('div');
  stage.className = 'shot-stage';
  stage.appendChild(clone);

  frame.append(accent, stage, buildFooter(meta));
  return frame;
}

function syncOffscreenTextareas(scope) {
  scope.querySelectorAll('textarea').forEach((ta) => {
    ta.style.overflow = 'hidden';
    ta.style.resize = 'none';
    ta.style.height = 'auto';
    let h = ta.scrollHeight;
    const box = ta.closest('.ink-box');
    const ink = box && box.querySelector('.ink');
    if (ink) {
      const cs = getComputedStyle(ta);
      ink.style.paddingLeft = cs.paddingLeft;
      ink.style.paddingRight = cs.paddingRight;
      ink.style.paddingTop = cs.paddingTop;
      ink.style.paddingBottom = cs.paddingBottom;
      h = Math.max(h, ink.scrollHeight);
    }
    if (h) ta.style.height = (h + 2) + 'px';
  });
}

export async function shot(root, opts = {}) {
  if (!root) throw new Error('没找到要截的那一块');

  const meta = extractMeta(root, opts);
  const hasNotes = hasNotesIn(root, !!opts.preview);
  const clone = root.cloneNode(true);

  /* 输入框的值是 DOM 属性而非文本，须在删除任何节点前按原序号搬进克隆体。 */
  const typed = root.querySelectorAll('input, textarea');
  const blank = clone.querySelectorAll('input, textarea');
  for (let i = 0; i < typed.length; i++) {
    if (blank[i].tagName === 'TEXTAREA') {
      blank[i].textContent = typed[i].value;
    } else {
      blank[i].setAttribute('value', typed[i].value);
    }
  }

  /* 合集工具页只截当前正在编辑的这一套（.set-body），保留 #sheet 壳与分支色以沿用 #sheet.preview 规则。 */
  if (clone.matches('#sheet[data-set]')) {
    const body = clone.querySelector('.set-body');
    clone.removeAttribute('data-set');
    if (body) {
      clone.replaceChildren(...body.childNodes);
    }
  }

  if (opts.preview) {
    clone.classList.add('preview');
    clone.querySelectorAll('.ink-box > .ink').forEach((el) => {
      el.style.paddingLeft = '0px';
    });
    clone.querySelectorAll('.desc, [id$="sec-5"], #sec-0, .verdict').forEach((el) => {
      const f = el.querySelector('input, textarea');
      if (f && !(f.getAttribute('value') || f.textContent || '').trim()) el.remove();
    });
    if (window.starsideForm && typeof window.starsideForm.syncPreview === 'function') {
      window.starsideForm.syncPreview(clone);
    }
    clone.querySelectorAll('input, textarea').forEach((el) => {
      el.removeAttribute('placeholder');
    });
    /* 单行 <input> 在长描述或带链接的推荐人处会被水平截断，截图克隆体里展开成自动折行文本。 */
    clone.querySelectorAll('.desc').forEach((desc) => {
      const inp = desc.querySelector('input');
      if (!inp) return;
      const ink = desc.querySelector('.ink-box > .ink');
      const span = document.createElement('span');
      span.className = 'shot-desc-text';
      if (ink) span.innerHTML = ink.innerHTML;
      else span.textContent = inp.getAttribute('value') || '';
      (desc.querySelector('.ink-box') || inp).replaceWith(span);
    });
    clone.querySelectorAll('input.who-in').forEach((inp) => {
      const raw = (inp.getAttribute('value') || '').trim();
      const name = raw.split('|')[0].trim();
      const span = document.createElement('span');
      span.className = 'who-text';
      span.textContent = name || raw;
      inp.replaceWith(span);
    });
  }

  if (opts.compact) {
    clone.querySelectorAll('.verdict, [id$="sec-5"]').forEach((el) => el.remove());
  }

  clone
    .querySelectorAll('.head-acts, .src-tools, .to-wpn, .picker, .dpanel, .shot-tip, dialog, [hidden]')
    .forEach((el) => el.remove());

  /* 将 <use href="#glN"> 展开为独立图形，避免截单套 .set-one 时丢掉 <main> 顶部的 sprite。 */
  clone.querySelectorAll('svg > use').forEach((use) => {
    const ref = use.getAttribute('href') || '';
    const sym = ref.startsWith('#') && document.getElementById(ref.slice(1));
    if (!sym) throw new Error('图标 ' + ref + ' 在页面上找不到对应的 symbol');
    use.parentNode.setAttribute('viewBox', sym.getAttribute('viewBox'));
    use.replaceWith(...[...sym.childNodes].map((n) => n.cloneNode(true)));
  });

  clone.querySelectorAll('*').forEach((el) => {
    el.style.contentVisibility = 'visible';
  });
  clone.style.contentVisibility = 'visible';

  const width = CANVAS_WIDTH;
  const imgs = [...clone.querySelectorAll('img')];
  const [css, uris] = await Promise.all([
    inlineCss(),
    Promise.all(imgs.map((im) => dataUri(im.src))),
    document.fonts.ready,
  ]);

  for (let i = 0; i < imgs.length; i++) {
    imgs[i].setAttribute('src', uris[i]);
    imgs[i].removeAttribute('loading');
    imgs[i].removeAttribute('fetchpriority');
  }

  const host = document.createElement('div');
  host.className = 'shot-root' + (meta.branchClass ? ' ' + meta.branchClass : '');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + width + 'px;';
  const style = document.createElement('style');
  style.textContent = rootCss(width);
  const frame = buildFrame(clone, meta);
  host.append(style, frame);
  document.body.appendChild(host);

  let height;
  try {
    syncOffscreenTextareas(frame);
    height = Math.ceil(host.getBoundingClientRect().height);
    if (!height) throw new Error('量出来高度是 0');

    const holder = document.createElement('div');
    holder.className = host.className;
    holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    holder.style.cssText = 'width:' + width + 'px;';
    const sheet = document.createElement('style');
    sheet.textContent = css + '\n' + rootCss(width);
    holder.append(sheet, frame.cloneNode(true));

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '">' +
      '<foreignObject x="0" y="0" width="' +
      width +
      '" height="' +
      height +
      '">' +
      new XMLSerializer().serializeToString(holder) +
      '</foreignObject></svg>';

    const bitmap = await new Promise((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => bad(new Error('SVG 渲染失败，可能存在未内联资源或非法标记'));
      im.src = 'data:image/svg+xml;base64,' + base64(new TextEncoder().encode(svg).buffer);
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#0b0d14';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);

    const blob = await new Promise((ok, bad) => {
      canvas.toBlob((b) => (b ? ok(b) : bad(new Error('canvas 导出 PNG 失败'))), 'image/png');
    });
    return {
      blob,
      width: width * SCALE,
      height: height * SCALE,
      images: imgs.length,
      css: css.length,
      title: meta.title || meta.setTitle || 'starside-build',
      branchClass: meta.branchClass,
      hasNotes,
      compact: !!opts.compact,
    };
  } finally {
    host.remove();
  }
}

let styled = false;

function injectCss() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.shot-dlg {
  width: min(94vw, 1140px);
  max-width: 94vw;
  max-height: 92vh;
  margin: auto;
  padding: 0;
  color: var(--bone, #ebe7dc);
  background: var(--ink, #0b0d14);
  border: 1px solid var(--hair-lit, #3c4457);
  border-radius: var(--r-lg, 8px);
  box-shadow: 0 24px 64px rgba(0, 0, 0, .72);
  overflow: auto;
}
.shot-dlg::backdrop {
  background: rgba(5, 7, 12, .8);
  backdrop-filter: blur(3px);
}
.shot-dlg .shot-bar {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 0;
  padding: 10px 14px;
  font: 400 12px/1.5 var(--font-mono, ui-monospace, "SF Mono", Menlo, "PingFang SC", sans-serif);
  color: var(--bone-dim, #9ea6b5);
  background: var(--surf-1, #0f131d);
  border-bottom: 1px solid var(--hair, #2a3040);
}
.shot-dlg .shot-meta {
  margin-right: auto;
  white-space: nowrap;
}
.shot-dlg .shot-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.shot-dlg .shot-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  padding: 0 11px;
  border-radius: var(--r-sm, 4px);
  border: 1px solid var(--hair-lit, #3c4457);
  background: var(--surf-2, #161c2b);
  color: var(--bone, #ebe7dc);
  font: 400 12px/1 var(--font-cn, "PingFang SC", sans-serif);
  cursor: pointer;
  transition: border-color .15s, color .15s, background-color .15s;
}
.shot-dlg .shot-btn:hover:not([disabled]) {
  border-color: var(--bone, #ebe7dc);
  background: var(--surf-3, #1e2638);
}
.shot-dlg .shot-btn[disabled] {
  opacity: .5;
  cursor: wait;
}
.shot-dlg .shot-btn.is-primary {
  border-color: var(--accent, #ebe7dc);
  color: var(--accent, #ebe7dc);
}
.shot-dlg .shot-btn.is-primary:hover:not([disabled]) {
  background: var(--surf-3, #1e2638);
}
.shot-dlg .shot-btn[aria-pressed="true"] {
  border-color: var(--accent, #ebe7dc);
  color: var(--accent, #ebe7dc);
  background: var(--surf-3, #1e2638);
}
.shot-dlg .shot-btn.is-quiet {
  background: transparent;
  color: var(--bone-dim, #9ea6b5);
}
.shot-dlg .shot-btn.is-quiet:hover:not([disabled]) {
  color: var(--bone, #ebe7dc);
}
.shot-dlg .shot-body {
  padding: 12px;
  background: var(--ink, #0b0d14);
}
.shot-dlg .shot-body img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--r-md, 6px);
  border: 1px solid var(--hair, #2a3040);
}`;
  document.head.appendChild(s);
}

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

function fileName(title, compact) {
  const safe = String(title || 'starside-build')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return 'starside-' + (safe || 'build') + (compact ? '-仅配置' : '') + '.png';
}

let dlg = null;
let img = null;
let note = null;
let btnCopy = null;
let btnSave = null;
let btnCompact = null;
let curUrl = '';
let curBlob = null;
let curTitle = '';
let curCompact = false;
let curRerender = null;
let copyTimer = 0;
let showSeq = 0;

function setNote(text) {
  if (note) note.textContent = text;
}

function metaLine(res) {
  const parts = [];
  if (res.width && res.height) parts.push(res.width + ' × ' + res.height);
  if (res.blob && res.blob.size) parts.push(fmtSize(res.blob.size));
  return parts.join(' · ') || '右键「复制图像」即可粘贴';
}

function applyResult(res, customText) {
  if (curUrl) URL.revokeObjectURL(curUrl);
  curBlob = res.blob;
  curTitle = res.title || '';
  curCompact = !!res.compact;
  curUrl = URL.createObjectURL(res.blob);
  img.src = curUrl;
  dlg.className = 'shot-dlg' + (res.branchClass ? ' ' + res.branchClass : '');
  setNote(customText || metaLine(res));
  if (btnCompact) {
    btnCompact.hidden = !(res.hasNotes && curRerender);
    btnCompact.setAttribute('aria-pressed', curCompact ? 'true' : 'false');
    btnCompact.textContent = curCompact ? '显示注解' : '仅配置';
  }
}

export function show(input, opts = {}) {
  injectCss();
  const res = input instanceof Blob ? { blob: input } : input;
  const text = typeof opts === 'string' ? opts : opts.text;
  curRerender = typeof opts === 'object' && opts && typeof opts.rerender === 'function' ? opts.rerender : null;

  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'shot-dlg';

    const bar = document.createElement('div');
    bar.className = 'shot-bar';

    note = document.createElement('span');
    note.className = 'shot-meta';
    note.setAttribute('role', 'status');

    const acts = document.createElement('div');
    acts.className = 'shot-acts';

    btnCompact = document.createElement('button');
    btnCompact.type = 'button';
    btnCompact.className = 'shot-btn';
    btnCompact.hidden = true;
    btnCompact.addEventListener('click', async () => {
      if (!curRerender) return;
      const seq = showSeq;
      const next = !curCompact;
      btnCompact.disabled = true;
      btnCopy.disabled = true;
      btnSave.disabled = true;
      setNote('重绘中…');
      try {
        const updated = await curRerender(next);
        if (seq !== showSeq) return;
        applyResult(updated);
      } catch (err) {
        if (seq !== showSeq) return;
        setNote('重绘失败：' + err.message);
        console.error(err);
      } finally {
        if (seq === showSeq) {
          btnCompact.disabled = false;
          btnCopy.disabled = false;
          btnSave.disabled = false;
        }
      }
    });

    btnCopy = document.createElement('button');
    btnCopy.type = 'button';
    btnCopy.className = 'shot-btn is-primary';
    btnCopy.textContent = '复制图片';
    btnCopy.addEventListener('click', async () => {
      if (!curBlob) return;
      const seq = showSeq;
      clearTimeout(copyTimer);
      if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
        setNote('当前环境不支持一键复制，请右键图片复制或点「保存 PNG」');
        return;
      }
      btnCopy.disabled = true;
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': curBlob })]);
        if (seq !== showSeq) return;
        btnCopy.textContent = '已复制';
        copyTimer = setTimeout(() => {
          if (seq === showSeq) btnCopy.textContent = '复制图片';
        }, 1800);
      } catch (err) {
        if (seq !== showSeq) return;
        setNote('剪贴板写入被拒绝，请右键图片复制或点「保存 PNG」');
        console.error(err);
      } finally {
        if (seq === showSeq) btnCopy.disabled = false;
      }
    });

    btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'shot-btn';
    btnSave.textContent = '保存 PNG';
    btnSave.addEventListener('click', () => {
      if (!curUrl) return;
      const a = document.createElement('a');
      a.href = curUrl;
      a.download = fileName(curTitle, curCompact);
      a.click();
    });

    const shut = document.createElement('button');
    shut.type = 'button';
    shut.className = 'shot-btn is-quiet';
    shut.textContent = '关闭';
    shut.addEventListener('click', () => dlg.close());

    acts.append(btnCompact, btnCopy, btnSave, shut);
    bar.append(note, acts);

    const body = document.createElement('div');
    body.className = 'shot-body';
    img = new Image();
    img.alt = '配装截图';
    body.appendChild(img);

    dlg.append(bar, body);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
    document.body.appendChild(dlg);
  }

  showSeq += 1;
  clearTimeout(copyTimer);
  btnCompact.disabled = false;
  btnCopy.disabled = false;
  btnSave.disabled = false;
  btnCopy.textContent = '复制图片';
  applyResult(res, text);
  if (!dlg.open) dlg.showModal();
  btnCopy.focus({ preventScroll: true });
  dlg.scrollTop = 0;
  return dlg;
}
