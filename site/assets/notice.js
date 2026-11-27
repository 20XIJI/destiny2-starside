import notice from "./notice-data.js";

var KEY = "sn";

function markSeen() {
  try { sessionStorage.setItem(KEY, notice.id); } catch {}
  try { localStorage.setItem(KEY, notice.id); } catch {}
}

function isSeen() {
  try { if (localStorage.getItem(KEY) === notice.id) return true; } catch {}
  try { if (sessionStorage.getItem(KEY) === notice.id) return true; } catch {}
  return false;
}

function siteRoot() {
  var css = document.querySelector('link[href$="assets/site.css"]');
  var href = css ? css.getAttribute("href") : "";
  return href.replace(/assets\/site\.css(?:\?.*)?$/, "");
}

function injectStyle() {
  if (document.getElementById("ss-notice-css")) return;
  var s = document.createElement("style");
  s.id = "ss-notice-css";
  s.textContent =
    "dialog.ss-notice{box-sizing:border-box;width:min(640px,calc(100vw - 32px));max-height:calc(100vh - 48px);" +
    "margin:auto;padding:0;overflow:hidden;border:1px solid var(--hair-lit);border-radius:var(--r-lg);" +
    "background-color:var(--surf-1);color:var(--bone);" +
    "box-shadow:0 28px 72px rgba(0,0,0,.78),inset 0 1px 0 color-mix(in srgb,var(--accent) 32%,rgba(255,255,255,.06));" +
    "font-family:var(--font-body);display:flex;flex-direction:column;" +
    "animation:ss-n-in .2s cubic-bezier(.22,.68,.3,1) both}" +
    "dialog.ss-notice:focus{outline:none}" +
    "@keyframes ss-n-in{from{opacity:0;transform:translateY(8px) scale(.99)}}" +
    "@media(prefers-reduced-motion:reduce){dialog.ss-notice{animation:none}}" +
    "dialog.ss-notice::backdrop{background:rgba(7,9,15,.78);backdrop-filter:blur(8px)}" +
    ".ss-notice-hd{display:flex;align-items:center;gap:12px;padding:13px 20px;" +
    "background-color:var(--surf-2);border-bottom:1px solid var(--bd-in)}" +
    ".ss-notice-meta{display:flex;align-items:center;gap:10px;flex:none}" +
    ".ss-notice-mark{display:flex;flex:none;gap:3px;color:var(--accent)}" +
    ".ss-notice-mark i{width:5px;height:5px;background:currentcolor;border:1px solid currentcolor;transform:rotate(45deg)}" +
    ".ss-notice-mark i:last-child{background:none}" +
    ".ss-notice-tag{color:var(--bone);font-family:var(--font-cn);font-size:12px;font-weight:600;letter-spacing:.1em}" +
    ".ss-notice-sep{width:1px;height:11px;background:var(--hair-lit)}" +
    ".ss-notice-date{color:var(--bone-dim);font-family:var(--font-disp);font-size:12px;font-weight:600;" +
    "letter-spacing:.12em;font-variant-numeric:tabular-nums}" +
    ".ss-notice-rule{flex:1;height:5px;opacity:.85;" +
    "background-image:linear-gradient(90deg,var(--hair-lit) 1px,transparent 1px),linear-gradient(var(--hair),var(--hair));" +
    "background-size:16px 5px,100% 1px;background-position:0 0,0 50%;background-repeat:no-repeat}" +
    ".ss-notice-x{display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0;" +
    "border:1px solid transparent;border-radius:var(--r-sm);background:transparent;color:var(--bone-dim);" +
    "cursor:pointer;transition:color .15s ease,background-color .15s ease,border-color .15s ease}" +
    ".ss-notice-x svg{width:14px;height:14px;fill:none;stroke:currentcolor;stroke-width:1.6;stroke-linecap:round}" +
    ".ss-notice-x:hover{background-color:var(--tint);border-color:var(--hair-lit);color:var(--bone)}" +
    ".ss-notice-main{padding:22px 22px 20px;overflow-y:auto}" +
    ".ss-notice-title{margin:0 0 8px;color:var(--bone);font-family:var(--font-cn);" +
    "font-size:20px;font-weight:600;line-height:1.4;letter-spacing:.01em}" +
    ".ss-notice-body > p{margin:0 0 14px;color:var(--bone-dim);font-size:13px;line-height:1.7}" +
    ".ss-notice-body > p:last-child{margin-bottom:0}" +
    ".ss-notice-body ul{margin:0;padding:0;list-style:none;display:grid;gap:10px}" +
    ".ss-notice-body li{position:relative;border:1px solid var(--hair);border-radius:var(--r-md);" +
    "background-color:var(--surf-1);box-shadow:var(--sh-block);overflow:hidden;" +
    "transition:background-color .15s ease,border-color .15s ease,transform .15s ease}" +
    ".ss-notice-body li:not(.has-card){padding:13px 16px 13px 34px;color:var(--bone);font-size:13px;line-height:1.7}" +
    ".ss-notice-body li:not(.has-card)::before{content:\"\";position:absolute;left:16px;top:21px;width:5px;height:5px;" +
    "transform:rotate(45deg);background:var(--accent)}" +
    ".ss-notice-body li.has-card:hover{background-color:var(--surf-2);" +
    "border-color:color-mix(in srgb,var(--accent) 45%,var(--hair-lit));transform:translateY(-1px)}" +
    ".ss-notice-card{position:relative;display:flex;align-items:center;justify-content:space-between;gap:16px;" +
    "padding:14px 18px 14px 36px;color:inherit;text-decoration:none;border-bottom:0}" +
    ".ss-notice-card::before{content:\"\";position:absolute;left:16px;top:22px;width:5px;height:5px;" +
    "transform:rotate(45deg);background:var(--accent)}" +
    ".ss-notice-card-main{display:flex;flex-direction:column;gap:4px;min-width:0}" +
    ".ss-notice-card-title{color:var(--bone);font-family:var(--font-cn);font-size:13px;font-weight:600;" +
    "line-height:1.4;transition:color .15s ease}" +
    ".ss-notice-card:hover .ss-notice-card-title{color:var(--accent)}" +
    ".ss-notice-card-desc{color:var(--bone-dim);font-size:13px;line-height:1.65}" +
    ".ss-notice-card-go{flex:none;display:inline-flex;align-items:center;gap:4px;color:var(--bone-dim);" +
    "font-family:var(--font-cn);font-size:12px;font-weight:600;letter-spacing:.04em;" +
    "white-space:nowrap;transition:color .15s ease,transform .15s ease}" +
    ".ss-notice-card:hover .ss-notice-card-go{color:var(--accent);transform:translateX(3px)}" +
    ".ss-notice-body li:not(.has-card) strong{color:var(--bone);font-weight:600}" +
    ".ss-notice-body li:not(.has-card) a{color:var(--bone);text-decoration:none;" +
    "border-bottom:1px solid color-mix(in srgb,var(--bone-ghost) 65%,transparent);" +
    "transition:color .15s ease,border-color .15s ease}" +
    ".ss-notice-body li:not(.has-card) a:hover{color:var(--accent);border-bottom-color:var(--accent)}" +
    ".ss-notice-ft{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;" +
    "padding:13px 20px;background-color:var(--surf-2);border-top:1px solid var(--bd-in)}" +
    ".ss-notice-links{display:flex;align-items:center;gap:18px;font-size:12px}" +
    ".ss-notice-links a{color:var(--bone-dim);text-decoration:none;font-family:var(--font-cn);" +
    "letter-spacing:.04em;transition:color .15s ease}" +
    ".ss-notice-links a:hover{color:var(--accent)}" +
    ".ss-notice-ok{position:relative;padding:6px 20px;border:1px solid var(--hair-lit);border-radius:var(--r-sm);" +
    "background-color:var(--surf-2);color:var(--bone);font-family:var(--font-cn);" +
    "font-size:13px;font-weight:600;letter-spacing:.08em;cursor:pointer;user-select:none;" +
    "transition:color .15s ease,border-color .15s ease,background-color .15s ease}" +
    ".ss-notice-ok::before,.ss-notice-ok::after{content:\"\";position:absolute;width:6px;height:6px;" +
    "border:1px solid var(--accent);opacity:.65;transition:opacity .15s ease}" +
    ".ss-notice-ok::before{top:-1px;left:-1px;border-right:0;border-bottom:0}" +
    ".ss-notice-ok::after{right:-1px;bottom:-1px;border-left:0;border-top:0}" +
    ".ss-notice-ok:hover{background-color:var(--surf-3);border-color:var(--accent);color:var(--accent)}" +
    ".ss-notice-ok:hover::before,.ss-notice-ok:hover::after{opacity:1}";
  document.head.appendChild(s);
}

function show() {
  if (!notice || !notice.id || !document.body) return;
  injectStyle();
  var root = siteRoot();

  var dlg = document.createElement("dialog");
  dlg.className = "ss-notice";
  dlg.tabIndex = -1;
  dlg.setAttribute("aria-labelledby", "ss-notice-title");

  var hd = document.createElement("div");
  hd.className = "ss-notice-hd";
  var meta = document.createElement("div");
  meta.className = "ss-notice-meta";
  var mark = document.createElement("span");
  mark.className = "ss-notice-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
  var tag = document.createElement("span");
  tag.className = "ss-notice-tag";
  tag.textContent = "站内公告";
  meta.append(mark, tag);
  if (notice.date) {
    var sep = document.createElement("span");
    sep.className = "ss-notice-sep";
    sep.setAttribute("aria-hidden", "true");
    var date = document.createElement("span");
    date.className = "ss-notice-date";
    date.textContent = notice.date;
    meta.append(sep, date);
  }
  var rule = document.createElement("span");
  rule.className = "ss-notice-rule";
  rule.setAttribute("aria-hidden", "true");
  var btnX = document.createElement("button");
  btnX.type = "button";
  btnX.className = "ss-notice-x";
  btnX.setAttribute("aria-label", "关闭公告");
  var svgNS = "http://www.w3.org/2000/svg";
  var xSvg = document.createElementNS(svgNS, "svg");
  xSvg.setAttribute("viewBox", "0 0 14 14");
  xSvg.setAttribute("aria-hidden", "true");
  var xPath = document.createElementNS(svgNS, "path");
  xPath.setAttribute("d", "M3 3l8 8M11 3l-8 8");
  xSvg.appendChild(xPath);
  btnX.appendChild(xSvg);
  hd.append(meta, rule, btnX);

  var main = document.createElement("div");
  main.className = "ss-notice-main";
  var h2 = document.createElement("h2");
  h2.id = "ss-notice-title";
  h2.className = "ss-notice-title";
  h2.textContent = notice.title || "";
  var body = document.createElement("div");
  body.className = "ss-notice-body";
  body.innerHTML = notice.html || "";
  body.querySelectorAll("a[data-to]").forEach(function (a) {
    a.setAttribute("href", root + a.getAttribute("data-to"));
    a.removeAttribute("data-to");
  });
  body.querySelectorAll("li").forEach(function (li) {
    var anchors = li.querySelectorAll("a");
    var lead = li.firstElementChild;
    if (anchors.length !== 1 || !lead || lead.tagName !== "STRONG" || !lead.contains(anchors[0])) return;
    var card = document.createElement("a");
    card.className = "ss-notice-card";
    card.href = anchors[0].getAttribute("href") || "#";
    var cardMain = document.createElement("span");
    cardMain.className = "ss-notice-card-main";
    var cardTitle = document.createElement("span");
    cardTitle.className = "ss-notice-card-title";
    cardTitle.textContent = lead.textContent || "";
    var cardDesc = document.createElement("span");
    cardDesc.className = "ss-notice-card-desc";
    lead.remove();
    while (li.firstChild) cardDesc.appendChild(li.firstChild);
    if (cardDesc.firstChild && cardDesc.firstChild.nodeType === 3) {
      cardDesc.firstChild.nodeValue = cardDesc.firstChild.nodeValue.replace(/^[：:]\s*/, "");
    }
    cardMain.append(cardTitle, cardDesc);
    var go = document.createElement("span");
    go.className = "ss-notice-card-go";
    go.setAttribute("aria-hidden", "true");
    go.textContent = "查看 →";
    card.append(cardMain, go);
    li.className = "has-card";
    li.appendChild(card);
  });
  body.addEventListener("click", function (e) {
    if (e.target.closest("a")) markSeen();
  });
  main.append(h2, body);

  var ft = document.createElement("div");
  ft.className = "ss-notice-ft";
  var links = document.createElement("div");
  links.className = "ss-notice-links";
  var aArchive = document.createElement("a");
  aArchive.href = root + "notices/index.html";
  aArchive.textContent = "往期公告 →";
  var aLog = document.createElement("a");
  aLog.href = root + "changelog/index.html";
  aLog.textContent = "更新日志 →";
  links.append(aArchive, aLog);
  links.addEventListener("click", function (e) {
    if (e.target.closest("a")) markSeen();
  });

  var btnOk = document.createElement("button");
  btnOk.type = "button";
  btnOk.className = "ss-notice-ok";
  btnOk.textContent = "知道了";
  ft.append(links, btnOk);

  dlg.append(hd, main, ft);

  function closeAndAck() {
    markSeen();
    if (dlg.open) dlg.close();
  }
  btnX.onclick = closeAndAck;
  btnOk.onclick = closeAndAck;
  dlg.addEventListener("cancel", markSeen);
  dlg.addEventListener("close", function () { dlg.remove(); });

  document.body.appendChild(dlg);
  dlg.showModal();
  btnOk.focus({ preventScroll: true });
}

if (/(?:^|\/)notices\/(?:index\.html)?$/.test(location.pathname)) {
  markSeen();
} else if (!isSeen()) {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", show, { once: true });
  } else {
    show();
  }
}
