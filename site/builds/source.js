// 配装源稿（markdown 那一形）的形状，JS 这一侧的唯一定义：填表页 form.js、审核台
// admin.js 与云函数加载同一份。头部怎么读、合集怎么切、缺了哪几项、同一套的指纹取
// 哪几项、库里的 _id 怎么拼，都只在这里写。
//
// Python 那一侧是 tools/migrate.py（markdown ⇄ 记录）与 convert-build.py 的
// split_set()、SET_MAX；两边在全部真源稿上判读一致由 check_quality.py 的
// BuildSourceShape 钉住。
//
// **functions/api/source.js 是构建复制过去的，不手改**：云函数只 require 得到自己
// 目录下的东西。两份逐字相同由 npm test 钉住。
;(function (factory) {
  var api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (typeof window !== 'undefined') window.starsideSource = api
})(function () {
  'use strict'

  // 一个合集最多几套。上限 12：游戏内能存 20 套，再多左栏那列比右栏还长，而一个
  // 角色常用的就五六套。
  var SET_MAX = 12

  // 头部那几个「键：值」与配装名一趟扫完，按源稿字符串记住。首个匹配为准。
  var HEAD = /^([一-鿿]{1,6})：(.*)$/
  var headOf = new Map()
  function head (md) {
    if (!md) return {}
    var got = headOf.get(md)
    if (got) return got
    var out = {}
    md.split('\n').forEach(function (l) {
      if (l.charAt(0) === '#') {
        if (out['#'] === undefined && /^#\s/.test(l)) out['#'] = l.replace(/^#\s+/, '').trim()
        return
      }
      var m = HEAD.exec(l)
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].trim()
    })
    if (headOf.size > 300) headOf.clear()     // 只是缓存，涨到头就整片丢掉重来
    headOf.set(md, out)
    return out
  }

  // 合集：一份源稿装 N 套，`# ` 分隔，头部戴着「合集：是」。判据与 convert-build.py
  // 的 split_set() 同一条，切法也是。**只看头部那一块**：注解里引用一句「合集：是」
  // 讲解写法的单套稿，全文扫会把它判成合集，载进合集填表页后切不出成员，保存回去就是
  // 一份被搅坏的源稿。
  function isSet (md) { return /^合集：是$/m.test((md || '').split(/\n# /)[0]) }
  function sets (md) { return (md || '').trim().split(/\n(?=# )/).slice(1) }

  // 页面上那几个占位文字：留着没改等于没填。旧写法一并收着——待审队列里可能还压着
  // 按旧占位投的稿子，漏掉就成了一份「有名字」的空稿。
  // **不能用对象字面量**：名字是用户填的，叫 constructor 或 toString 时 HOLD[名字]
  // 取到原型链上的函数、读成真值，那份稿子就永远「缺名字」投不出去。
  var HOLD = Object.create(null)
  ;['配装名', '配装名称', '合集名', '合集名称', '这一套叫什么'].forEach(function (k) { HOLD[k] = 1 })

  /* 必需的这七项，[显示名, 头部的键]。**缺了不许投**——半张稿子进了队列，审的人
     既补不出推荐人也猜不到核心，只能打回去，来回一趟。装备与描述可以后补，这几项
     不行。**比指纹的 SAME 多场景与强度**：那两样是站上的目录分法，缺了
     convert-build.py 当场中止，但改它们不该让审过一轮的稿子认不出自己那一份，所以
     它们挡投稿、不进指纹。更深的结构（套装件数、六维六格）由构建时的 Python 闸门管。 */
  var NEED = [['名字', '#'], ['推荐人', '推荐人'], ['职业', '职业'], ['属性', '分支'],
              ['场景', '场景'], ['强度', '强度'], ['核心', '核心']]

  /* 合集里每一套要凑齐的那几样。**推荐人不在内**：它写在合集头部，整份一个。
     **标签也不在内**，判据是 convert-build.py 的 tags_of()：宗师/终极、日常、
     功能性这三个场景没有标签集，「标签：」整行必须不写，其余场景可写可不写。 */
  var PER = [['名称', '#'], ['职业', '职业'], ['属性', '分支'], ['核心', '核心'],
             ['使用场景', '描述']]

  function short (md, keys) {
    var h = head(md)
    return keys.filter(function (k) { return !h[k[1]] || HOLD[h[k[1]]] })
      .map(function (k) { return k[0] })
  }

  /* 这一份还缺什么，空表即齐。填表页非空即不许投，审核台照着列「缺 …」。
     套数要在这里挡住：它不在 NEED 里，缺了照样投得出去，而落盘时 split_set()
     会中止，卡住的是整次 npm run build。**至少两套凑齐才算一份合集**：只有一套
     填得完整时它就是一份单套配装。逐套报，报到是第几套。 */
  function lacking (md) {
    var lack = short(md, NEED)
    if (!isSet(md)) return lack
    var many = sets(md)
    if (many.length > SET_MAX) lack.push('套数（最多 ' + SET_MAX + ' 套）')
    var full = 0
    many.forEach(function (one, i) {
      var miss = short(one, PER)
      if (miss.length) lack.push('第 ' + (i + 1) + ' 套的' + miss.join('、'))
      else full += 1
    })
    if (full < 2) lack.unshift('两套填齐的配装（现在 ' + full + ' 套）')
    return lack
  }

  /* 同一套配装的判据：**名字、推荐人、职业、属性、核心五项一致即同一套**。不按装备
     判——改一把枪就成了另一套，而再投的人多半是想更新同一份。云函数拿这五项算指纹。
     **场景、强度与标签不进**：它们是站上的目录分法，改一次不该让审过一轮的稿子认不出
     自己那一份，与审核意见同一条理由。

     **只按头部算**。合集的头部没有职业与分支两行，全文扫会静默抓到第一套成员的，
     调换前两套的顺序再投指纹就变了、顶不掉旧的。单套只有一个 `# `，切了等于没切。
     职业写成「名字#主键」，主键不进：站内换一枚主键不该让审过的稿子认不出自己。
     **别的四项不切**：推荐人常带 Bungie 的 #1234，配装名里也可能有 #。
     改了这五项的取法，库里旧记录的 key 要跑一次 rekey。 */
  var SAME = [/^#[ \t]*(.*)$/m, /^推荐人：(.*)$/m, /^职业：(.*)$/m,
              /^分支：(.*)$/m, /^核心：(.*)$/m]
  var CLASS_AT = 2
  function same (md) {
    var top = String(md).split(/\n# /)[0]
    return SAME.map(function (re, i) {
      var got = ((re.exec(top) || ['', ''])[1] || '').replace(/\s+/g, ' ').trim()
      return i === CLASS_AT ? got.split('#')[0].trim() : got
    })
  }

  // 库里一套已上站配装的 _id，即源稿在 references/ 下的相对路径去掉扩展名。
  function id (season, slug) { return 'builds/' + season + '/' + slug }

  return { SET_MAX: SET_MAX, head: head, isSet: isSet, sets: sets, lacking: lacking,
           same: same, id: id }
})
