export default function init(heads) {
  var index = heads.findIndex(function (head) { return head.textContent.trim() === '职业'; });
  if (index < 0) throw new Error('输出手法排行缺少职业列');
  var catIdx = heads.findIndex(function (head) { return head.textContent.trim() === '类别'; });
  var susIdx = heads.findIndex(function (head) { return head.textContent.trim() === '可续'; });
  var table = heads[index].closest('table');
  var rows = Array.from(table.querySelectorAll('tbody tr'));
  var colNames = heads.map(function (head) { return head.textContent.trim(); });
  rows.forEach(function (row) {
    Array.prototype.forEach.call(row.cells, function (cell, ci) {
      if (!cell.classList.contains('ico')) return;
      var img = cell.querySelector('img');
      if (img && !img.title && colNames[ci]) img.title = colNames[ci];
    });
  });

  var state = { cls: '全部', cat: '', sus: false, noMeme: false };
  function apply() {
    rows.forEach(function (row) {
      var ok = (state.cls === '全部' || row.children[index].textContent.trim() === state.cls)
        && (!state.cat || (catIdx >= 0 && row.children[catIdx].textContent.trim() === state.cat))
        && (!state.sus || (susIdx >= 0 && row.children[susIdx].textContent.trim() === '●'))
        && (!state.noMeme || !row.querySelector('.dps-fun, .dps-bug'));
      row.hidden = !ok;
    });
  }

  var values = Array.from(new Set(rows.map(function (row) { return row.children[index].textContent.trim(); })));
  var drop = document.createElement('details');
  drop.className = 'class-filter';
  var trigger = document.createElement('summary');
  trigger.setAttribute('aria-label', '筛选职业');
  trigger.title = '筛选职业：全部';
  trigger.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 3h12L9.5 8v4l-3 1V8z"/></svg>';
  drop.appendChild(trigger);
  var menu = document.createElement('div');
  menu.className = 'class-filter-menu';
  var buttons = [];
  ['全部'].concat(values).forEach(function (value) {
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = value;
    button.setAttribute('aria-pressed', value === '全部' ? 'true' : 'false');
    button.addEventListener('click', function () {
      state.cls = value;
      apply();
      buttons.forEach(function (item) {
        item.setAttribute('aria-pressed', item === button ? 'true' : 'false');
      });
      trigger.dataset.active = value === '全部' ? 'false' : 'true';
      trigger.title = '筛选职业：' + value;
      trigger.setAttribute('aria-label', trigger.title);
      drop.open = false;
      trigger.focus();
    });
    buttons.push(button);
    menu.appendChild(button);
  });
  drop.appendChild(menu);
  heads[index].appendChild(drop);
  document.addEventListener('click', function (event) {
    if (!drop.contains(event.target)) drop.open = false;
  });
  drop.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && drop.open) {
      drop.open = false;
      trigger.focus();
    }
  });

  var toolbar = document.querySelector('.toolbar');
  if (!toolbar) return;
  var group = document.createElement('div');
  group.className = 'tool-chips dps-filters';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', '筛选手法');
  var sep = document.createElement('span');
  sep.className = 'tool-sep';
  sep.setAttribute('aria-hidden', 'true');
  group.appendChild(sep);

  var catBtns = {};
  ['通用', '专精', '辅助'].forEach(function (cat) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle';
    btn.textContent = cat;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      state.cat = state.cat === cat ? '' : cat;
      Object.keys(catBtns).forEach(function (k) {
        catBtns[k].setAttribute('aria-pressed', state.cat === k ? 'true' : 'false');
      });
      apply();
    });
    catBtns[cat] = btn;
    group.appendChild(btn);
  });

  var sep2 = document.createElement('span');
  sep2.className = 'tool-sep';
  sep2.setAttribute('aria-hidden', 'true');
  group.appendChild(sep2);

  [
    ['仅可续', 'sus'],
    ['排除整活/BUG', 'noMeme']
  ].forEach(function (spec) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle';
    btn.textContent = spec[0];
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', function () {
      state[spec[1]] = !state[spec[1]];
      btn.setAttribute('aria-pressed', state[spec[1]] ? 'true' : 'false');
      apply();
    });
    group.appendChild(btn);
  });

  toolbar.appendChild(group);
}
