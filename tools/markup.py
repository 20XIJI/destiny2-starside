"""源稿方言：三份 markdown 共用的行内标记与分块规则。

着色写成 {token|文字}，token 即 assets/site.css :root 里的语义名。文本里从不
出现 { 与 }，所以这对括号可以当标记字符；| 在文本里常见，但只有紧跟在 token 名
后面的那个才是分隔符。支持嵌套。

富文本标记（**粗体**、*强调*、[文字](链接)）默认关闭，由调用方按页开启——
神器模组页的源稿里有孤立的 `*`（「呈 * 形释放」），开着会在有人再加一个星号时
静默变成 <em>。
"""

import re
from typing import NoReturn

COLOR_OPEN = re.compile(r'\{([\w-]+)\|')
LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
# 图标：![](icons/xxx.png)。alt 恒空——图标都是行内的语义重复（旁边就是文字），
# 给它们编 alt 只会让读屏软件把同一件事念两遍。
IMG = re.compile(r'!\[\]\(([^)]+)\)')


def die(msg) -> NoReturn:
    raise SystemExit('转换中止：' + msg)


def must(m: 're.Match[str] | None', msg) -> 're.Match[str]':
    """结构对不上就当场报错，不给 None 往下传的机会。"""
    if m is None:
        die(msg)
    return m


def meta_line(keys):
    """「键：值」行的匹配式。键名固定，正文行不会被误认。

    正文里「伤害：2.8% | …」「单人游玩时：」这类行长得和键值行一模一样，
    所以不能按「短前缀 + 冒号」猜，只认给定的键名。
    """
    return re.compile(r'^(?:%s)：.*$' % '|'.join(keys), re.M)


def img_size(data):
    """PNG / JPEG 的宽高，从文件头现读，不在源稿里重复记一遍尺寸。"""
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    if data[:2] == b'\xff\xd8':
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            if data[i + 1] in (0xC0, 0xC1, 0xC2):       # SOF0/1/2 里才有尺寸
                return (int.from_bytes(data[i + 7:i + 9], 'big'),
                        int.from_bytes(data[i + 5:i + 7], 'big'))
            i += 2 + int.from_bytes(data[i + 2:i + 4], 'big')
        die('JPEG 里没找到 SOF 段，取不到尺寸')
    die('只认得 PNG 与 JPEG，这个文件都不是')


def blocks_of(chunk):
    """空行分段，段内换行还原成 <br>。"""
    return ['<br>'.join(b.strip().split('\n'))
            for b in re.split(r'\n\s*\n', chunk.strip()) if b.strip()]


def inline(md, rich=False):
    """行内标记 → HTML。着色是栈式扫描，正则做不干净嵌套。

    rich 开启 **粗体**、*强调* 与 [文字](链接)。
    """
    if rich:
        def link(m):
            ext = ' target="_blank" rel="noopener"' if m.group(2).startswith('http') else ''
            return '<a href="%s"%s>%s</a>' % (m.group(2), ext, m.group(1))

        md = LINK.sub(link, md)
        md = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', md)
        md = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', md)

    out, pos, depth, i = [], 0, 0, 0
    while i < len(md):
        m = COLOR_OPEN.match(md, i)
        if m:
            out.append(md[pos:i])
            out.append('<span class="%s">' % m.group(1))
            depth += 1
            i = pos = m.end()
            continue
        if md[i] == '}' and depth:
            out.append(md[pos:i])
            out.append('</span>')
            depth -= 1
            i = pos = i + 1
            continue
        i += 1
    out.append(md[pos:])
    if depth:
        die('着色标记未闭合：%r' % md[:120])
    return ''.join(out)


def whole_marker(md):
    """整块恰好被一个 {token|…} 包住时返回 (token, 内容)，否则 None。

    判据是首个标记的闭括号落在末尾。中途闭合说明块里还有别的内容
    （`{a|白弹} → {b|绿弹}` 是两个标记，不是一个），那就不算整块。
    """
    m = COLOR_OPEN.match(md)
    if not m:
        return None
    depth, i = 1, m.end()
    while i < len(md):
        opener = COLOR_OPEN.match(md, i)
        if opener:
            depth += 1
            i = opener.end()
            continue
        if md[i] == '}':
            depth -= 1
            if depth == 0:
                return (m.group(1), md[m.end():i]) if i == len(md) - 1 else None
        i += 1
    return None
