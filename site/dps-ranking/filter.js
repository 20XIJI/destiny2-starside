export default function init(heads) {
  var index = heads.findIndex(function (head) { return head.textContent.trim() === '职业'; });
  if (index < 0) throw new Error('输出手法排行缺少职业列');
  var table = heads[index].closest('table');
  var rows = Array.from(table.querySelectorAll('tbody tr'));
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
      rows.forEach(function (row) {
        row.hidden = value !== '全部' && row.children[index].textContent.trim() !== value;
      });
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
}
