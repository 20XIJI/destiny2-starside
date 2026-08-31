/* 配装填表：按 builds/vocab.js 建出表单，实时拼出标准源稿。

   选项两千条，所以每个格子是 <input list> + <datalist>——原生的打字筛选，
   不引任何库，也不自己写下拉。列得出来的名字生成器一定查得到：这一页与
   tools/convert-build.py 查的是同一份词表。

   校验不在这里做。星相与碎片的联动、模组能耗、六维配点都是每季会变的游戏规则，
   写进前端就等于把同一套规则写两遍；这一页负责好填，正确性由生成器的闸门兜底。 */
(function () {
  var V = window.starsideVocab || {};
  var form = document.getElementById('form');
  var out = document.getElementById('out');
  if (!form || !out) return;

  var CLASSES = ['猎人', '泰坦', '术士'];
  var BRANCHES = ['电弧', '烈日', '虚空', '冰影', '缚丝', '棱镜'];
  var PARTS = ['头盔', '护臂', '胸甲', '腿部', '职业物品'];
  var STATS = ['生命', '近战', '手雷', '超能', '职业', '武器'];

  var lists = {};                      // datalist id → 已建
  var fields = {};                     // 名字 → input

  /* 分节标题带括注时按括注前那一截比：神器模组页写「废墟石板 (异端)」，
     括注是来源赛季，不是这件神器的名字。与 vocab.bare_kind() 同一条规则。 */
  function bare(kind) { return String(kind || '').split(' (')[0].trim(); }

  function fill(el, slot, kind) {
    el.textContent = '';
    (V[slot] || []).forEach(function (row) {
      if (kind && bare(row[1]) !== kind) return;
      var o = document.createElement('option');
      o.value = row[0];
      el.appendChild(o);
    });
  }

  function datalist(slot, kind) {
    var id = 'dl-' + slot + (kind || '');
    if (!lists[id]) {
      var el = document.createElement('datalist');
      el.id = id;
      fill(el, slot, kind);
      form.appendChild(el);
      lists[id] = el;
    }
    return id;
  }

  /* 七件神器各有自己的一套模组，候选跟着所选神器走——不过滤的话两千条里
     挑得出别件神器的模组，而生成器会当场中止。 */
  function artifacts() {
    var seen = {}, out = [];
    (V['神器'] || []).forEach(function (row) {
      var a = bare(row[1]);
      if (a && !seen[a]) { seen[a] = 1; out.push(a); }
    });
    return out.sort();
  }

  function field(key, label, opts) {
    opts = opts || {};
    var wrap = document.createElement('label');
    wrap.className = 'fld';
    wrap.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    var el = document.createElement(opts.tag || 'input');
    if (opts.slot) el.setAttribute('list', datalist(opts.slot, opts.kind));
    if (opts.rows) el.rows = opts.rows;
    if (opts.placeholder) el.placeholder = opts.placeholder;
    el.addEventListener('input', write);
    wrap.appendChild(el);
    fields[key] = el;
    return wrap;
  }

  function select(key, label, values) {
    var wrap = document.createElement('label');
    wrap.className = 'fld';
    wrap.appendChild(Object.assign(document.createElement('span'), { textContent: label }));
    var el = document.createElement('select');
    values.forEach(function (v) {
      el.appendChild(Object.assign(document.createElement('option'), { value: v, textContent: v }));
    });
    el.addEventListener('change', write);
    wrap.appendChild(el);
    fields[key] = el;
    return wrap;
  }

  function group(title, nodes) {
    var box = document.createElement('div');
    box.className = 'fset';
    box.appendChild(Object.assign(document.createElement('h3'), { textContent: title }));
    var grid = document.createElement('div');
    grid.className = 'fgrid';
    nodes.forEach(function (n) { grid.appendChild(n); });
    box.appendChild(grid);
    form.appendChild(box);
  }

  function many(key, label, n, opts) {
    var nodes = [];
    for (var i = 1; i <= n; i++) nodes.push(field(key + i, label + ' ' + i, opts));
    return nodes;
  }

  group('身份', [
    field('配装名', '配装名'),
    field('推荐人', '推荐人（名字 | 链接 | 头像，后两段可省）'),
    field('描述', '描述，一句话'),
    field('场景', '场景，用「、」隔开'),
    field('定位', '定位，用「、」隔开'),
    field('更新', '更新（YYYY.M.D）'),
    select('职业', '职业', CLASSES),
    select('分支', '分支', BRANCHES),
    field('核心', '核心装备（本页的异域武器或异域护甲）')
  ]);

  group('职业', [field('超能', '超能', { slot: '超能' })]
    .concat(many('星相', '星相', 2, { slot: '星相' }))
    .concat(many('碎片', '碎片', 7, { slot: '碎片' }))
    .concat([field('手雷', '手雷', { slot: '手雷' }),
             field('近战', '近战', { slot: '近战' }),
             field('移动', '移动手段（站内暂无资料页，纯文本）'),
             field('职业技能', '职业技能', { slot: '职业技能' })]));

  var guns = [field('异域武器', '异域武器', { slot: '异域武器' })];
  for (var g = 1; g <= 2; g++) {
    guns.push(field('传说武器' + g, '传说武器 ' + g, { slot: '传说武器' }));
    guns.push(field('传说武器' + g + 'perk1', '└ Perk 1', { slot: 'Perk' }));
    guns.push(field('传说武器' + g + 'perk2', '└ Perk 2', { slot: 'Perk' }));
  }
  group('武器', guns);

  var armor = [field('异域护甲', '异域护甲', { slot: '异域护甲' }),
               field('套装1', '套装 1', { slot: '套装' }),
               select('套装1件', '件数', ['2 件', '4 件']),
               field('套装2', '套装 2（四件套时留空）', { slot: '套装' }),
               select('套装2件', '件数', ['2 件', '4 件'])];
  PARTS.forEach(function (part) {
    armor = armor.concat(many(part, part, 3, { slot: '护甲模组', kind: part }));
  });
  group('护甲', armor);

  group('神器模组', [select('神器', '神器', artifacts())]
    .concat(many('模组', '模组', 7, { slot: '神器', kind: '__art__' })));

  // 神器一换，七个模组的候选跟着重建
  fields['神器'].addEventListener('change', function () {
    fill(lists['dl-神器__art__'], '神器', fields['神器'].value);
    for (var i = 1; i <= 7; i++) fields['模组' + i].value = '';
    write();
  });
  fill(lists['dl-神器__art__'], '神器', fields['神器'].value);
  group('六维', STATS.map(function (s) {
    return field('六维' + s, s, { placeholder: '不低于 80 ／ ~ ／ 150～200' });
  }));
  group('注解', [field('注解', '推荐人的话：换弹时机、循环顺序、备选装备', { tag: 'textarea', rows: 6 })]);

  function val(key) { return (fields[key] && fields[key].value || '').trim(); }

  function joined(prefix, n) {
    var got = [];
    for (var i = 1; i <= n; i++) if (val(prefix + i)) got.push(val(prefix + i));
    return got.join('、');
  }

  function line(key, value) { return value ? key + '：' + value + '\n' : ''; }

  function write() {
    var md = '# ' + (val('配装名') || '配装名') + '\n\n';
    md += line('推荐人', val('推荐人'));
    md += line('描述', val('描述'));
    md += line('更新', val('更新'));
    md += line('场景', val('场景'));
    md += line('定位', val('定位'));
    md += line('分支', val('分支'));
    md += line('核心', val('核心'));

    md += '\n## 职业\n\n';
    md += line('职业', val('职业'));
    md += line('超能', val('超能'));
    md += line('星相', joined('星相', 2));
    md += line('碎片', joined('碎片', 7));
    md += line('手雷', val('手雷'));
    md += line('近战', val('近战'));
    md += line('移动', val('移动'));
    md += line('职业技能', val('职业技能'));

    md += '\n## 武器\n\n';
    md += line('异域武器', val('异域武器'));
    for (var i = 1; i <= 2; i++) {
      if (!val('传说武器' + i)) continue;
      var perks = joined('传说武器' + i + 'perk', 2);
      md += '传说武器：' + val('传说武器' + i) + (perks ? ' | ' + perks : '') + '\n';
    }

    md += '\n## 护甲\n\n';
    md += line('异域护甲', val('异域护甲'));
    var sets = [];
    if (val('套装1')) sets.push(val('套装1') + ' ' + val('套装1件'));
    if (val('套装2')) sets.push(val('套装2') + ' ' + val('套装2件'));
    md += line('套装', sets.join(' × '));
    PARTS.forEach(function (part) { md += line(part, joined(part, 3)); });

    md += '\n## 神器\n\n';
    md += line('神器', val('神器'));
    md += line('模组', joined('模组', 7));

    md += '\n## 六维\n\n';
    md += '六维：' + STATS.map(function (s) {
      return s + ' ' + (val('六维' + s) || '~');
    }).join(' ｜ ') + '\n';

    if (val('注解')) md += '\n## 注解\n\n' + val('注解') + '\n';
    out.value = md;
  }

  document.getElementById('copy').addEventListener('click', function () {
    out.select();
    navigator.clipboard.writeText(out.value).then(function () {
      this.textContent = '已复制';
      setTimeout(function () { this.textContent = '复制'; }.bind(this), 1600);
    }.bind(this));
  });

  write();
})();
