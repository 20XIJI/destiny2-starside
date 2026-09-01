"""源稿方言：三个生成器共用的行内标记、分块规则、图标登记与自检工具。

着色写成 {token|文字}，token 即 assets/site.css :root 里的语义名。文本里从不
出现 { 与 }，所以这对括号可以当标记字符；| 在文本里常见，但只有紧跟在 token 名
后面的那个才是分隔符。支持嵌套。

富文本标记（**粗体**、*强调*、~~划掉~~、[文字](链接)）默认关闭，由调用方按页开启——
神器模组页的源稿里有孤立的 `*`（「呈 * 形释放」），开着会在有人再加一个星号时
静默变成 <em>。

一个目的只留一份实现：剥标签取文本、保真前的归一化、计数比对、图片尺寸、
图标登记与首屏优先级判定都收在这里，三个生成器一律从这里取。
"""

import hashlib
import html as htmllib
import os
import re
from typing import NoReturn

COLOR_OPEN = re.compile(r'\{([\w-]+)\|')
LINK = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
# 图标：![](icons/xxx.png)。alt 恒空——图标都是行内的语义重复（旁边就是文字），
# 给它们编 alt 只会让读屏软件把同一件事念两遍。
IMG = re.compile(r'!\[\]\(([^)]+)\)')
# 标签。属性值里的 > 不当收尾——引号内的内容整体跳过。
TAG = re.compile(r'<(?:"[^"]*"|\'[^\']*\'|[^>])*>')
# 着色 span 不得嵌套：嵌套说明整块判定或分支顺序被改坏了。
NESTED_SPAN = re.compile(r'<span[^>]*>[^<]*<span')


def die(msg) -> NoReturn:
    raise SystemExit('转换中止：' + msg)


def must(m: 're.Match[str] | None', msg) -> 're.Match[str]':
    """结构对不上就当场报错，不给 None 往下传的机会。"""
    if m is None:
        die(msg)
    return m


def eq(label, got, want) -> None:
    """计数闸门。参数顺序固定为「名目、实际、期望」。"""
    if got != want:
        die('%s：%d，期望 %d' % (label, got, want))


def text_of(frag, collapse=False):
    """剥掉标签取纯文本。collapse=True 保留单空格，否则连空白一并去掉。

    保真比对要的是无空格视图（空格不算内容，见 design.md 三节）；需要读回
    一句人话时才 collapse。
    """
    t = htmllib.unescape(TAG.sub('', frag)).replace('\xa0', ' ')
    return re.sub(r'\s+', ' ', t).strip() if collapse else re.sub(r'\s+', '', t)


COLOR_ONE = re.compile(r'\{[\w-]+\|([^{}]*)\}')


def uncolor(md):
    """剥掉源稿里的 {token|文字}，只留文字。嵌套的从里往外一层层剥。

    配装详情页的「复制配装」用它：读者复制走的是能直接粘回配装工具的源稿，
    着色标记在那里没有用处，只会让人以为要照着写。
    """
    while True:
        out = COLOR_ONE.sub(r'\1', md)
        if out == md:
            return out
        md = out


def plain(s, marks='*`}\\'):
    """保真比对前的归一化：去空白，去只承担排版的标记字符。

    这些字符在页面上由字重、颜色与表格线承担，不落成字符，所以两侧都要去掉。
    marks 按源稿方言给：显式标记那条路要去 { } 与格内换行的 \\，词表那条路要
    去 buff 名的中文引号。
    """
    return re.sub(r'[%s\s]' % re.escape(marks), '', s)


def no_nested_span(out, where) -> None:
    m = NESTED_SPAN.search(out)
    if m:
        die('%s 出现嵌套着色 span：%r' % (where, m.group(0)[:80]))


def loading_attr(index, eager):
    """第 index 张图（从 0 数）的加载优先级。

    首屏图片不加 loading="lazy"——那会让它们等布局算完才开始下载，是反模式；
    排在 eager 之前的改成高优先级预取，其余交给 lazy。
    """
    return 'fetchpriority="high"' if index < eager else 'loading="lazy"'


def meta_line(keys):
    """「键：值」行的匹配式。键名固定，正文行不会被误认。

    正文里「伤害：2.8% | …」「单人游玩时：」这类行长得和键值行一模一样，
    所以不能按「短前缀 + 冒号」猜，只认给定的键名。
    """
    return re.compile(r'^(?:%s)：.*$' % '|'.join(keys), re.M)


def img_size(data):
    """PNG / JPEG / WebP 的宽高，从文件头现读，不在源稿里重复记一遍尺寸。"""
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        # WebP 三种码流各自把尺寸放在不同位置。VP8L 与 VP8X 存的是「减一」的值，
        # VP8 存的是原值——按同一条规则读会让有损那一支整批少一像素。
        tag = data[12:16]
        if tag == b'VP8 ':                             # 有损：帧头 keyframe 起第 6 字节
            return (int.from_bytes(data[26:28], 'little') & 0x3FFF,
                    int.from_bytes(data[28:30], 'little') & 0x3FFF)
        if tag == b'VP8L':                             # 无损：14 位宽 + 14 位高，紧挨着打包
            n = int.from_bytes(data[21:25], 'little')
            return (n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1
        if tag == b'VP8X':                             # 扩展（带 alpha 或动画）：各 24 位
            return (int.from_bytes(data[24:27], 'little') + 1,
                    int.from_bytes(data[27:30], 'little') + 1)
        die('WebP 的第一个块是 %r，认不出尺寸' % tag)
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        if data[12:16] != b'IHDR':
            die('PNG 的第一个块不是 IHDR，取不到尺寸')
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
    die('只认得 PNG、JPEG 与 WebP，这个文件都不是')


def blocks_of(chunk):
    """空行分段，段内换行还原成 <br>。"""
    return ['<br>'.join(b.strip().split('\n'))
            for b in re.split(r'\n\s*\n', chunk.strip()) if b.strip()]


def inline(md, rich=False):
    """行内标记 → HTML。着色是栈式扫描，正则做不干净嵌套。

    rich 开启 **粗体**、*强调*、~~划掉~~ 与 [文字](链接)。
    """
    if rich:
        def link(m):
            ext = ' target="_blank" rel="noopener"' if m.group(2).startswith('http') else ''
            return '<a href="%s"%s>%s</a>' % (m.group(2), ext, m.group(1))

        md = LINK.sub(link, md)
        md = re.sub(r'~~(.+?)~~', r'<s>\1</s>', md)
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


class Icons:
    """页面目录下的图标：尺寸从文件头现读，文件名即内容的 md5 前 10 位。

    每次转换都复核这个名字——它不只是命名习惯，而是缓存策略的依据：README
    「部署与缓存」给图标目录设了一年的浏览器缓存，前提是「改了内容必然换名字」。
    原地覆盖一张图会让读者看一年的旧图，而控制台刷新只清得掉节点缓存，清不掉
    已经发出去的浏览器缓存。所以在这里拦住。

    rel 既是相对 outdir 的路径，也是产出里的 src，两者同一个字符串。
    """

    def __init__(self, outdir, eager):
        self.dir = outdir
        self.eager = eager
        self.size = {}
        self.refs = 0

    def html(self, rel, cls=''):
        if rel not in self.size:
            path = os.path.join(self.dir, rel)
            if not os.path.exists(path):
                die('源稿引用的图标不存在：%s' % rel)
            with open(path, 'rb') as f:
                data = f.read()
            want = hashlib.md5(data).hexdigest()[:10] + os.path.splitext(rel)[1]
            if os.path.basename(rel) != want:
                die('%s 的内容与文件名对不上，应叫 %s。\n'
                    '  图标按内容哈希命名，改内容就要换名字——这是给图标目录设长缓存\n'
                    '  的前提，原地覆盖会让读者看到过期的图。换图按 README「换图」\n'
                    '  那三步走：新图按新哈希存进 icons/，改源稿的引用，再删旧文件。'
                    % (rel, want))
            self.size[rel] = img_size(data)
        w, h = self.size[rel]
        # 引用顺序即文档顺序，首屏那几张走高优先级
        attr = loading_attr(self.refs, self.eager)
        self.refs += 1
        return ('<img %ssrc="%s" alt="" width="%d" height="%d" %s>'
                % ('class="%s" ' % cls if cls else '', rel, w, h, attr))


def inner_marker(text, at):
    """text[at] 落在哪个 {token|内容} 里，返回 (token, 内容)；不在标记里就是 None。"""
    depth, i = 0, at - 1
    while i >= 0:
        if text[i] == '}':
            depth += 1
        elif text[i] == '{':
            if depth == 0:
                m = re.match(r'\{([\w-]+)\|', text[i:])
                if not m:
                    return None
                start = i + m.end()          # m 是对 text[i:] 匹配的，偏移要加回 i
                j, d = start, 1
                while j < len(text) and d:
                    d += text[j] == '{'
                    d -= text[j] == '}'
                    j += 1
                return m.group(1), text[start:j - 1]
            depth -= 1
        i -= 1
    return None


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
