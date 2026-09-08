/* 把一套配装渲染成一张图：克隆那一块 DOM，包进 SVG 的 foreignObject，画进 canvas。

   零依赖走得通是因为这一页的条件正好够——builds/style.css 里一处 CSS 背景图都没有，
   图形要么是同源 <img>，要么是内联 SVG 靠 currentColor 取色。

   **SVG 当作 <img> 加载时是隔离文档，外部资源一概不载。**样式表、字体、每一张图
   都得先变成 data URI 塞进去。漏一样就是图上少一块，浏览器不会报错，所以下面每一步
   取不到东西都当场抛，不吞。

   四处共用这一份：配装详情页、合集里的每一套、配装工具填表页、审核台。审核台那处
   由 form.js 的 starsideForm.shot() 在 iframe 里出图、父窗口弹图——iframe 只有列表下面
   那一格那么大，图弹在里面看不成。 */

/* 配料格的名字 11.5px，Perk 图标 24px。1 倍出图时它们在图上就是这个尺寸，放大只是
   放大像素；审核员要看清的恰好是这些最小的字。倍率写死不跟 devicePixelRatio 走：
   跟着走的话同一套配装在不同人机器上截出来不一样大，互相传的时候多一个变量。 */
const SCALE = 2;

/* 一份资源一个 data URI。同源，且页面刚显示过，基本都落在 HTTP 缓存里。

   **不用 FileReader.readAsDataURL。**它每张图都是一次异步回调往返，一页四五十张图
   排下来就是四五十次；实测读一张 600 字节的图要几百毫秒到几秒，整条管线卡死在这里。
   arrayBuffer 拿到就地转，没有那一轮调度。

   分块喂 btoa：String.fromCharCode 一次摊开整个数组会爆调用栈，图再小也不该赌。 */
function base64(buf) {
  const bytes = new Uint8Array(buf);
  const STEP = 0x8000;
  let s = '';
  for (let i = 0; i < bytes.length; i += STEP) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
  }
  return btoa(s);
}

async function dataUri(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  const type = res.headers.get('content-type') || 'application/octet-stream';
  return 'data:' + type + ';base64,' + base64(await res.arrayBuffer());
}

/* 页面引的每一份样式表，连同它们引用的字体，一起内联成一段 CSS。

   两处改写：
   - url() 相对样式表自身解，不是相对文档。先按样式表地址解成绝对再换 data URI。
   - :root 在 foreignObject 里选不中任何东西（那里没有 <html>），全部自定义属性会
     一起丢，图上就是一片没有颜色的骨架。补一个 .shot-root 让包装层接住它们。 */
async function inlineCss() {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  if (!links.length) throw new Error('这一页一份样式表都没引，出图必然是白的');
  let out = '';
  for (const link of links) {
    const res = await fetch(link.href);
    if (!res.ok) throw new Error(link.href + ' → HTTP ' + res.status);
    let css = await res.text();
    for (const [whole, raw] of [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)]) {
      if (raw.startsWith('data:')) continue;
      const uri = await dataUri(new URL(raw, link.href).href);
      css = css.split(whole).join('url("' + uri + '")');
    }
    out += css + '\n';
  }
  return out.split(':root {').join(':root, .shot-root {');
}

/* body 上那几条在 foreignObject 里同样落空——那里也没有 <body>。底色、字族、字号
   逐条搬到包装层上。背景那一摞（88px 刻线网格 + 顶部大气层 + 平涂）照抄 site.css，
   变量已经由 .shot-root 接住了。

   **--vw 必须钉成定值，不能照抄 site.css 那条 max(1vw, …)。**离屏量高时 1vw 是浏览器
   窗口的百分之一，而 SVG 里 1vw 是图自己宽度的百分之一，两处不是一个数：量出来的高
   与画出来的高对不上，图底下就会多出或缺一截。而且窗口一宽一窄，同一套配装出的图
   高度就不一样（1200 下量得 1494、1920 下 1510，差在 main 那条 6*--vw 的下 padding）。
   图的宽度就是它自己的视口，取它的百分之一。 */
function rootCss(width) {
  return `.shot-root {
  --vw: ${width / 100}px;
  color: var(--bone);
  font: 400 15px/1.85 var(--font-body);
  font-variant-numeric: tabular-nums;
  background:
    repeating-linear-gradient(0deg, var(--grid) 0 1px, transparent 1px 88px),
    repeating-linear-gradient(90deg, var(--grid) 0 1px, transparent 1px 88px),
    var(--atmo),
    var(--ink);
  background-repeat: repeat, repeat, repeat-x, repeat;
  background-size: auto, auto, 100% 640px, auto;
}`;
}

/* 一套配装 → 一张 PNG。root 是那一块的根元素：详情页 main、合集里的 section.set-one、
   填表页 #sheet。preview 为真时施加填表页现成的 .preview 类，把空槽与加减控件收掉。 */
export async function shot(root, opts = {}) {
  if (!root) throw new Error('没找到要截的那一块');

  const clone = root.cloneNode(true);

  /* **输入框里的值是属性不是文本，克隆与序列化都带不走它。**填表页与审核台的配装名、
     描述、推荐人、六维数值全在 <input> 与 <textarea> 里，不搬过来图上就是一排空框。
     趁还没删任何东西先搬：删过之后两棵树的序号就对不上了。 */
  const typed = root.querySelectorAll('input, textarea');
  const blank = clone.querySelectorAll('input, textarea');
  for (let i = 0; i < typed.length; i++) {
    if (blank[i].tagName === 'TEXTAREA') blank[i].textContent = typed[i].value;
    else blank[i].setAttribute('value', typed[i].value);
  }

  if (opts.preview) clone.classList.add('preview');

  /* 交互控件不进图：点赞、复制配装、详情开关、截图自己，以及藏着整份源稿的那个 pre。
     [hidden] 一并清掉——填表页没展开的可选槽位就挂在上面。 */
  clone.querySelectorAll('.head-acts, .src-tools, [hidden]').forEach((el) => el.remove());

  /* 合集那一节套着 content-visibility: auto，屏外不参与渲染，克隆体量出来会是估值。 */
  clone.querySelectorAll('*').forEach((el) => { el.style.contentVisibility = 'visible'; });
  clone.style.contentVisibility = 'visible';

  /* 版心之外的空白不进图：内容最宽只到 --min（配装页 1104 = 1060 版心 + main 左右
     22px padding），视口再宽也只是两边的留白在长。合集里的 .set-one 本身就窄于
     --min，取它自己的宽度。 */
  const cssMin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--min'));
  const live = root.getBoundingClientRect().width;
  const width = Math.round(Math.min(live, cssMin || live) || live);
  if (!width) throw new Error('量不出宽度，这一块可能是隐藏的');

  const css = await inlineCss();
  await document.fonts.ready;

  /* 每张图换成 data URI。img.src 取到的是绝对地址，克隆体不在文档里也照样。 */
  const imgs = [...clone.querySelectorAll('img')];
  for (const img of imgs) {
    img.setAttribute('src', await dataUri(img.src));
    img.removeAttribute('loading');
    img.removeAttribute('fetchpriority');
  }

  /* 离屏量高。**必须真的挂进文档**，脱离文档的节点量出来一律是 0。 */
  const host = document.createElement('div');
  host.className = 'shot-root';
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + width + 'px;';
  const style = document.createElement('style');
  style.textContent = rootCss(width);
  host.append(style, clone);
  document.body.appendChild(host);

  let height;
  try {
    height = Math.ceil(host.getBoundingClientRect().height);
    if (!height) throw new Error('量出来高度是 0');

    const holder = document.createElement('div');
    holder.className = 'shot-root';
    holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    holder.style.cssText = 'width:' + width + 'px;';
    const sheet = document.createElement('style');
    sheet.textContent = css + '\n' + rootCss(width);
    holder.append(sheet, clone.cloneNode(true));

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
      '<foreignObject x="0" y="0" width="' + width + '" height="' + height + '">' +
      new XMLSerializer().serializeToString(holder) +
      '</foreignObject></svg>';

    /* **必须是 data: URI，不能换成 blob: URL。**blob: 载入的 SVG 会把画布污染掉，
       后面 toBlob 抛 Tainted canvases may not be exported；data: 不会。

       编码用 base64 只是省一点，不修任何毛病：这段 SVG 里图的部分是纯 ASCII，
       百分号编码反而更省（1 倍对 1.33 倍），中文那部分才是 base64 划算（4 倍对 9 倍）。
       两份样式表实测 1.97 倍对 3.38 倍，整页混下来 base64 小四分之一左右。 */
    const bitmap = await new Promise((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => bad(new Error('SVG 画不出来，多半是内联漏了什么或标记不合 XML'));
      im.src = 'data:image/svg+xml;base64,' + base64(new TextEncoder().encode(svg).buffer);
    });

    const canvas = document.createElement('canvas');
    canvas.width = width * SCALE;
    canvas.height = height * SCALE;
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    /* 先铺不透明底：PNG 透明底在深色与浅色的聊天窗口里看起来是两个样子。 */
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#0b0d14';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0);

    const blob = await new Promise((ok, bad) => {
      canvas.toBlob((b) => (b ? ok(b) : bad(new Error('canvas 转不出 PNG'))), 'image/png');
    });
    return { blob, width, height, images: imgs.length, css: css.length };
  } finally {
    host.remove();
  }
}

/* 弹图。用原生 <dialog>：Esc 关闭、焦点圈住、背板都是浏览器自带的，不自己写一遍。

   样式跟着脚本走，不写进 builds/style.css——审核台不引那一份，而这个浮层四处
   都要长一个样。同类做法站里有先例：app.js 的列组开关也是靠一段内建 <style>。 */
let styled = false;

function injectCss() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.shot-dlg { max-width: 92vw; max-height: 92vh; padding: 0; color: #e6e2d6;
  background: #0b0d14; border: 1px solid #3c4457; overflow: auto; }
.shot-dlg::backdrop { background: #000000c4; }
.shot-dlg img { display: block; width: 100%; height: auto; }
.shot-dlg .shot-bar { position: sticky; left: 0; display: flex; align-items: center;
  gap: 12px; padding: 8px 12px; font: 400 12.5px/1.6 ui-monospace, "SF Mono", Menlo,
  "PingFang SC", sans-serif; color: #9aa0ac; background: #0e1119;
  border-bottom: 1px solid #2a3040; }
.shot-dlg .shot-bar button { margin-left: auto; padding: 3px 10px; color: inherit;
  font: inherit; background: none; border: 1px solid #3c4457; cursor: pointer; }
.shot-dlg .shot-bar button:hover { color: #f4f1e8; border-color: #f4f1e8; }`;
  document.head.appendChild(s);
}

/* 浮层只建一个，反复用。

   **不靠 close 事件做清理。**每次新建一个 dialog、在 close 里 remove 的写法看着更
   干净，实测那个事件不一定来（headless Chrome 里就没来），来不了就每截一次多攒一个
   浮层，各自攥着一个几兆的 blob URL 不放。复用一个则根本没有要清理的东西：换图时
   撤掉上一张的 URL，关掉就是原生的隐藏。 */
let dlg = null;
let img = null;
let note = null;
let cur = '';

export function show(blob, text) {
  injectCss();
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'shot-dlg';

    const bar = document.createElement('p');
    bar.className = 'shot-bar';
    note = document.createElement('span');
    const shut = document.createElement('button');
    shut.type = 'button';
    shut.textContent = '关闭';
    shut.addEventListener('click', () => dlg.close());
    bar.append(note, shut);

    img = new Image();
    img.alt = '配装截图';

    dlg.append(bar, img);
    /* 点背板关掉：背板在事件里就是 dialog 自己，点内容时 target 是子元素。 */
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    document.body.appendChild(dlg);
  }

  if (cur) URL.revokeObjectURL(cur);
  cur = URL.createObjectURL(blob);
  img.src = cur;
  note.textContent = text || '右键「复制图像」即可粘进聊天窗口';
  if (!dlg.open) dlg.showModal();
  return dlg;
}
