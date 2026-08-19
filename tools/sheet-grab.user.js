// ==UserScript==
// @name         Sheet Grab — Google 表格取数（替换后的文本 + 图片 URL）
// @namespace    starside
// @version      1.0
// @description  在 Google 表格 htmlview 页面上一键导出：单元格文本按渲染后的样子取（术语替换已生效），图片只记 URL 不内联。产物几十 KB，替代 SingleFile 的二十兆。
// @match        https://docs.google.com/spreadsheets/*/htmlview*
// @match        https://docs.google.com/spreadsheets/*/pubhtml*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/* 为什么不内联图片：
   1. base64 让文件涨到二十兆，且大半是内嵌字体，其中真正要的图不到一成。
   2. 术语替换脚本会连 base64 一起改坏——护甲模组表就有一张图的 ammo 被替成
      「弹药」，PNG 当场损坏。图片记 URL、事后单独下载，替换脚本碰不到它。
   3. 跨域取不到的图，SingleFile 会静默换成占位 <svg>，看着有图其实是空的。
      记 URL 则原样留痕，下载失败会明确报错。 */

(function () {
  'use strict';

  /* 术语替换若是双语模式（原文与译文同时在 DOM 里），把注入节点的选择器填在这里，
     取文本前会先从副本里摘掉。默认为空——先导一次看看有没有重复文本再决定。 */
  const STRIP = [];

  /* 单元格文本：换行要留住。表格里的换行是 <br>，直接读 textContent 会把上下两行
     粘成一个词（「任何输出场景基本都需要」原本是两行）。先在副本上把 <br> 换成
     \n，再读。副本还避免了改动页面本身。 */
  function textOf(td) {
    const box = td.cloneNode(true);
    STRIP.forEach((sel) => box.querySelectorAll(sel).forEach((n) => n.remove()));
    box.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    return box.textContent.replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
  }

  function grab() {
    /* htmlview 一次只渲染当前那张表；有多张时取可见的那一张 */
    const table = [...document.querySelectorAll('table.waffle')]
      .find((t) => t.offsetParent !== null) || document.querySelector('table.waffle');
    if (!table) return alert('这一页没找到 table.waffle，可能还没渲染完，等表格出来再点。');

    const rows = [];
    let images = 0;
    [...table.querySelectorAll('tbody tr')].forEach((tr, r) => {
      const cells = [];
      /* 只取 td：每行开头那个 <th> 是行号（1、2、3…），不是数据 */
      [...tr.querySelectorAll('td')].forEach((td) => {
        const span = parseInt(td.getAttribute('colspan') || '1', 10);
        const imgs = [...td.querySelectorAll('img')]
          .map((i) => i.currentSrc || i.src)
          .filter((u) => u && !u.startsWith('data:'));   // 占位 svg 一律丢掉
        images += imgs.length;
        cells.push({ t: textOf(td), img: imgs });
        /* 合并单元格补空位，列号才对得上 */
        for (let k = 1; k < span; k++) cells.push({ t: '', img: [] });
      });
      rows.push(cells);
      void r;
    });

    const gid = (location.href.match(/[?&#]gid=(\d+)/) || [])[1] || '0';
    const name = (document.title || 'sheet').replace(/\s*-\s*Google.*$/, '').trim();
    const out = {
      title: name,
      gid,
      url: location.href,
      grabbedAt: new Date().toISOString(),
      rows,
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
    btn.textContent = `✓ ${rows.length} 行 / ${images} 图 / ${kb} KB`;
    setTimeout(() => (btn.textContent = LABEL), 4000);
  }

  const LABEL = '导出这张表';
  const btn = document.createElement('button');
  btn.textContent = LABEL;
  btn.onclick = grab;
  Object.assign(btn.style, {
    position: 'fixed', right: '18px', bottom: '18px', zIndex: 2147483647,
    padding: '9px 16px', font: '600 13px/1.4 system-ui, sans-serif',
    color: '#fff', background: '#1a73e8', border: 0, borderRadius: '4px',
    boxShadow: '0 2px 8px rgba(0,0,0,.3)', cursor: 'pointer',
  });
  document.body.appendChild(btn);
})();
