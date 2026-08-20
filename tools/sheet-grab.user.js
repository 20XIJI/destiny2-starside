// ==UserScript==
// @name         Sheet Grab — Google 表格取数（替换后的文本 + 内联图片）
// @namespace    starside
// @version      2.1
// @description  在 Google 表格 htmlview 页面上一键导出：单元格文本按渲染后的样子取（术语替换已生效），图片当场取回内联成 base64。产物自包含，事后不必再联网。
// @match        https://docs.google.com/spreadsheets/*/htmlview*
// @match        https://docs.google.com/spreadsheets/*/pubhtml*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      docs.google.com
// @connect      drive.google.com
// @connect      googleusercontent.com
// ==/UserScript==

/* 图为什么在页面里当场取，不留 URL 事后下载：
   1. 有一半下不动。lh3.googleusercontent.com 那批要 Google 登录 cookie，命令行
      curl 一律 403；页面里取带着登录态，一次过。
   2. URL 会过期。sheets-images-rt 的 token 不是永久的，只存 URL 的 JSON 放上几周
      就成了空壳。内联之后 JSON 自包含。
   3. 术语替换脚本碰不到它。当年改坏 base64 的是「DOM 里原本就是 data: URL」那种；
      这里的 base64 是脚本自己请求回来的二进制，替换发生在 DOM 上，够不着。

   取不到的图不塞占位——SingleFile 那套静默换成空 <svg> 的做法，看着有图其实没有。
   这里记进 imagesFailed，弹框报数，json2xlsx.py 那头还会再拦一道。 */

(function () {
  'use strict';

  if (typeof GM_xmlhttpRequest !== 'function') {
    return alert('脚本管理器没给 GM_xmlhttpRequest 权限，跨域的图取不了。\n去油猴里检查这个脚本的权限设置，放行后刷新页面。');
  }

  /* 术语替换若是双语模式（原文与译文同时在 DOM 里），把注入节点的选择器填在这里，
     取文本前会先从副本里摘掉。默认为空——先导一次看看有没有重复文本再决定。 */
  const STRIP = [];

  const PAR = 4;           // 同时取几张。浏览器对单域名本来也就 6 条连接
  const RETRY_MS = 1500;   // 失败后隔多久重来一次
  const TIMEOUT_MS = 30000;

  /* 单元格文本：换行要留住。表格里的换行是 <br>，直接读 textContent 会把上下两行
     粘成一个词（「任何输出场景基本都需要」原本是两行）。先在副本上把 <br> 换成
     \n，再读。副本还避免了改动页面本身。 */
  function textOf(td) {
    const box = td.cloneNode(true);
    STRIP.forEach((sel) => box.querySelectorAll(sel).forEach((n) => n.remove()));
    box.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return box.textContent.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function toDataURL(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error('读不出这张图'));
      fr.readAsDataURL(blob);
    });
  }

  /* 扩展发的请求：绕开 CORS，且带 cookie。跨域那批只有这条路走得通 */
  function gmFetch(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'blob',
        timeout: TIMEOUT_MS,
        onload: (r) => (r.status === 200
          ? resolve(r.response)
          : reject(new Error('HTTP ' + r.status))),
        onerror: () => reject(new Error('请求失败')),
        ontimeout: () => reject(new Error('超时')),
      });
    });
  }

  /* 先问浏览器缓存要：docs.google.com 那批带 ACAO: * 与 max-age 86400，页面刚渲染完
     必然还在缓存里，这一步零网络请求。拿不到就落到扩展——按能不能拿到分流，不按
     主机名写死，换一张表图片落在别的主机也照常走。 */
  async function once(url) {
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (r.ok) return await toDataURL(await r.blob());
    } catch (e) {
      void e;                                  // CORS 挡下，走下面
    }
    return toDataURL(await gmFetch(url));
  }

  async function grabImage(url) {
    try {
      return await once(url);
    } catch (e) {
      void e;                                  // 限流与瞬时抖动，隔一下再来一次
      await sleep(RETRY_MS);
      return once(url);                        // 还失败就往上抛，由调用方记进 failed
    }
  }

  /* PAR 个 worker 共享一个游标顺序领取 */
  async function inlineImages(urls, onProgress) {
    const images = {};
    const failed = [];
    let next = 0;
    let done = 0;
    await Promise.all(Array.from({ length: PAR }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        try {
          images[url] = await grabImage(url);
        } catch (e) {
          failed.push(url + ' —— ' + e.message);
        }
        onProgress(++done, urls.length);
      }
    }));
    return { images, failed };
  }

  /* 把一行的格子摊平到列位上。**colspan 与 rowspan 都要补位**：Google 表格里
     纵向合并的格子只在首行出现一个 <td>，后续行少一个，整行往左错位——护甲模组表
     的框架族就是这么把说明挤进图标列的。carry 记「这一列还被上面占几行」。
     纯函数，输入是 cellsOf() 那种描述、不碰 DOM，便于离线断言。 */
  function spread(items, carry) {
    const cells = [];
    let i = 0;
    let col = 0;
    while (i < items.length || carry.has(col)) {
      const left = carry.get(col);
      if (left) {
        cells.push({ t: '', img: [] });
        if (left > 1) carry.set(col, left - 1);
        else carry.delete(col);
        col += 1;
        continue;
      }
      const it = items[i];
      i += 1;
      for (let k = 0; k < it.cspan; k++) {
        cells.push(k === 0 ? { t: it.t, img: it.img } : { t: '', img: [] });
        if (it.rspan > 1) carry.set(col, it.rspan - 1);
        col += 1;
      }
    }
    return cells;
  }

  /* 只取 td：每行开头那个 <th> 是行号（1、2、3…），不是数据 */
  function cellsOf(tr) {
    return [...tr.querySelectorAll('td')].map((td) => ({
      t: textOf(td),
      img: [...td.querySelectorAll('img')]
        .map((i) => i.currentSrc || i.src)
        .filter((u) => u && !u.startsWith('data:')),   // 占位 svg 一律丢掉
      cspan: parseInt(td.getAttribute('colspan') || '1', 10),
      rspan: parseInt(td.getAttribute('rowspan') || '1', 10),
    }));
  }

  async function grab() {
    /* htmlview 一次只渲染当前那张表；有多张时取可见的那一张 */
    const table = [...document.querySelectorAll('table.waffle')]
      .find((t) => t.offsetParent !== null) || document.querySelector('table.waffle');
    if (!table) return alert('这一页没找到 table.waffle，可能还没渲染完，等表格出来再点。');

    const carry = new Map();          // 列号 → 这一列还被上面的行占几行
    const rows = [...table.querySelectorAll('tbody tr')]
      .map((tr) => spread(cellsOf(tr), carry));

    const urls = [...new Set(rows.flatMap((r) => r.flatMap((c) => c.img)))];
    btn.disabled = true;
    const { images, failed } = await inlineImages(urls, (d, n) => {
      btn.textContent = `取图 ${d}/${n}`;
    });
    btn.disabled = false;

    const gid = (location.href.match(/[?&#]gid=(\d+)/) || [])[1] || '0';
    const name = (document.title || 'sheet').replace(/\s*-\s*Google.*$/, '').trim();
    const out = {
      title: name,
      gid,
      url: location.href,
      grabbedAt: new Date().toISOString(),
      rows,
      images,
      imagesFailed: failed,
    };

    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${gid}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);

    const kb = Math.round(blob.size / 1024);
    const miss = failed.length ? ` / ${failed.length} 失败` : '';
    btn.textContent = `✓ ${rows.length} 行 / ${urls.length} 图${miss} / ${kb} KB`;
    setTimeout(() => (btn.textContent = LABEL), 6000);

    /* 只写控制台等于没报：失败必须挡在眼前 */
    if (failed.length) {
      console.warn('这些图没取到：\n' + failed.join('\n'));
      alert(`${failed.length} 张图没取到。明细在控制台，JSON 的 imagesFailed 里也记着。`);
    }
  }

  const LABEL = '导出这张表';
  const btn = document.createElement('button');
  btn.textContent = LABEL;
  btn.onclick = () => grab().catch((e) => {
    btn.disabled = false;
    btn.textContent = LABEL;
    alert('导出中止：' + e.message);
  });
  Object.assign(btn.style, {
    position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647,
    padding: '9px 16px', font: '600 13px/1.4 system-ui, sans-serif',
    color: '#fff', background: '#1a73e8', border: 0, borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,.3)', cursor: 'pointer',
  });
  document.body.appendChild(btn);
})();
