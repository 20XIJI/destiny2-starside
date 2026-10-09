#!/usr/bin/env python3
"""Read-only DDC upstream diffs, or explicit, text/rules-only snapshot updates.

No website inputs are changed. The JSON preserves semantic inline formatting, not
Google's generated classes, coordinates, image tokens, or presentation geometry.
"""

import argparse
import json
import os
import re
import sys
import tempfile
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, replace
from difflib import unified_diff
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

import shell

BOOK = 'https://docs.google.com/spreadsheets/d/1WaxvbLx7UoSZaBqdFr1u32F2uWVLo-CJunJB4nlGUE4'
VOID = frozenset(('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                  'link', 'meta', 'param', 'source', 'track', 'wbr'))
SEMANTIC = frozenset(('color', 'font-weight', 'font-style', 'font-size',
                      'text-decoration', 'text-decoration-line', 'vertical-align'))
STRING = r'"(?:[^"\\]|\\.)*"'
ENTRY = re.compile(r'\s*name\s*:\s*(' + STRING + r')\s*,\s*pageUrl\s*:\s*'
                   + STRING + r'\s*,\s*gid\s*:\s*(' + STRING + r')\s*(?:,|$)', re.S)


def download(url: str) -> str:
    """Fetch Google's public HTML view without cookies or browser credentials."""
    request = Request(url, headers={'User-Agent': 'Starside-DDC-snapshot/1'})
    with urlopen(request, timeout=60) as response:
        return response.read().decode(response.headers.get_content_charset() or 'utf-8')


def catalog(html: str) -> list[dict[str, str]]:
    """Discover every tab from the HTML view's page-switcher catalogue."""
    entries: list[dict[str, str]] = []
    seen: set[str] = set()
    for start in re.finditer(r'\bitems\s*\.\s*push\s*\(\s*\{', html):
        # Find the closing object without treating braces in tab names as syntax.
        pos = start.end()
        depth = 1
        quote = ''
        escaped = False
        while pos < len(html) and depth:
            char = html[pos]
            if quote:
                if escaped:
                    escaped = False
                elif char == '\\':
                    escaped = True
                elif char == quote:
                    quote = ''
            elif char in ('"', "'"):
                quote = char
            elif char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
            pos += 1
        match = ENTRY.match(html[start.end():pos - 1]) if depth == 0 else None
        if match is None or not re.match(r'\s*\)', html[pos:]):
            raise ValueError('Invalid or truncated items.push tab catalogue; fetch the public /htmlview page.')
        try:
            name = json.loads(match[1])
            gid = json.loads(match[2])
        except json.JSONDecodeError as error:
            raise ValueError('Invalid JSON tab name or gid in the /htmlview catalogue.') from error
        if not isinstance(name, str) or not name.strip() or not isinstance(gid, str) or not re.fullmatch(r'[0-9]+', gid):
            raise ValueError('Invalid tab name or decimal gid in the /htmlview catalogue.')
        gid = str(int(gid))
        if gid in seen:
            raise ValueError(f'Duplicate tab gid {gid} in the /htmlview catalogue.')
        seen.add(gid)
        entries.append({'gid': gid, 'name': name})
    if not entries:
        raise ValueError('No tab catalogue found; check public spreadsheet access and use its /htmlview URL.')
    return sorted(entries, key=lambda entry: int(entry['gid']))


@dataclass
class Node:
    tag: str
    attrs: dict[str, str]
    children: list['Node | str'] = field(default_factory=list)


class Grid(HTMLParser):
    """Capture the waffle grid, its ancestor attributes, and local stylesheets."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.table: Node | None = None
        self.stack: list[Node] = []
        self.outer: list[Node] = []
        self.ancestors: list[Node] = []
        self.styles: list[str] = []
        self.in_style = False
        self.closed = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or '' for key, value in attrs}
        if tag == 'style':
            self.in_style = True
        if not self.stack:
            if tag != 'table' or 'waffle' not in values.get('class', '').split():
                if tag not in VOID:
                    self.outer.append(Node(tag, values))
                return
            if self.table is not None:
                raise ValueError('More than one waffle table; expected one /htmlview/sheet page.')
            self.table = Node(tag, values)
            self.ancestors = self.outer.copy()
            self.stack.append(self.table)
            return
        node = Node(tag, values)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag == 'style':
            self.in_style = False
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index].tag == tag:
                if tag in ('table', 'tr', 'td', 'th') and index != len(self.stack) - 1:
                    raise ValueError(f'Unclosed element inside <{tag}>; spreadsheet HTML may be truncated.')
                del self.stack[index:]
                if not self.stack:
                    self.closed = True
                return
        for index in range(len(self.outer) - 1, -1, -1):
            if self.outer[index].tag == tag:
                del self.outer[index:]
                return

    def handle_data(self, data: str) -> None:
        if self.in_style:
            self.styles.append(data)
        elif self.stack and self.stack[-1].tag != 'script':
            self.stack[-1].children.append(data)


def declarations(text: str) -> dict[str, tuple[str, bool]]:
    out: dict[str, tuple[str, bool]] = {}
    for declaration in text.split(';'):
        key, colon, value = declaration.partition(':')
        key = key.strip().lower()
        if colon and key in SEMANTIC:
            important = bool(re.search(r'\s*!important\s*$', value, re.I))
            value = re.sub(r'\s*!important\s*$', '', value, flags=re.I).strip().lower()
            if key not in out or important or not out[key][1]:
                out[key] = (value, important)
    return out


@dataclass
class Rule:
    parts: list[str]
    values: dict[str, tuple[str, bool]]
    specificity: tuple[int, int]


def rules(styles: list[str]) -> list[Rule]:
    out: list[Rule] = []
    css = re.sub(r'/\*.*?\*/', '', '\n'.join(styles), flags=re.S)
    for match in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
        values = declarations(match[2])
        if not values:
            continue
        for selector in match[1].split(','):
            parts = selector.strip().split()
            if parts and all(re.fullmatch(r'(?:[a-zA-Z][\w-]*|\*)?(?:\.[\w-]+)*', part) for part in parts):
                specificity = (selector.count('.'), sum(bool(re.match(r'[a-zA-Z]', part)) for part in parts))
                out.append(Rule(parts, values, specificity))
    return out


def matches(part: str, node: Node) -> bool:
    tag, *classes = part.split('.')
    return (not tag or tag == '*' or tag.lower() == node.tag) and set(classes).issubset(node.attrs.get('class', '').split())


def styled(node: Node, ancestors: list[Node], css: list[Rule]) -> dict[str, str]:
    selected: dict[str, tuple[tuple[int, int, int, int], str]] = {}
    for order, rule in enumerate(css):
        if not matches(rule.parts[-1], node):
            continue
        cursor = len(ancestors) - 1
        for part in reversed(rule.parts[:-1]):
            while cursor >= 0 and not matches(part, ancestors[cursor]):
                cursor -= 1
            if cursor < 0:
                break
            cursor -= 1
        else:
            for key, (value, important) in rule.values.items():
                rank = (int(important), *rule.specificity, order)
                if key not in selected or rank >= selected[key][0]:
                    selected[key] = (rank, value)
    for key, (value, important) in declarations(node.attrs.get('style', '')).items():
        rank = (int(important), 1000000, 0, len(css))
        if key not in selected or rank >= selected[key][0]:
            selected[key] = (rank, value)
    return {key: value for key, (_, value) in selected.items()}


def color(value: str) -> str:
    if re.fullmatch(r'#[0-9a-f]{3}', value):
        return '#' + ''.join(char * 2 for char in value[1:])
    if re.fullmatch(r'#[0-9a-f]{6}(?:[0-9a-f]{2})?', value):
        return value
    match = re.fullmatch(r'rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', value)
    if match and all(0 <= int(component) <= 255 for component in match.groups()):
        return '#' + ''.join(f'{int(component):02x}' for component in match.groups())
    named = {'black': '#000000', 'white': '#ffffff', 'red': '#ff0000',
             'blue': '#0000ff', 'green': '#008000', 'yellow': '#ffff00',
             'gray': '#808080', 'grey': '#808080', 'orange': '#ffa500',
             'purple': '#800080', 'transparent': ''}
    if value in named:
        return named[value]
    raise ValueError(f'Unsupported foreground color {value!r}; add its canonical hex conversion before updating.')


def font_size(value: str, inherited: float) -> float:
    match = re.fullmatch(r'([0-9]+(?:\.[0-9]+)?)(pt|px|em|rem|%)', value)
    if match:
        amount = float(match[1])
        return amount * {'pt': 4 / 3, 'px': 1, 'em': inherited,
                         'rem': 16, '%': inherited / 100}[match[2]]
    return {'smaller': inherited * 0.8, 'larger': inherited * 1.2,
            'xx-small': 9, 'x-small': 10, 'small': 13, 'medium': 16,
            'large': 18, 'x-large': 24, 'xx-large': 32}.get(value, inherited)


@dataclass(frozen=True)
class Format:
    color: str = ''
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    small: bool = False
    position: str = ''
    href: str = ''
    size: float = 40 / 3


def link(href: str) -> str:
    parsed = urlsplit(href)
    if parsed.path == '/url' and (not parsed.netloc or parsed.hostname in ('www.google.com', 'google.com')):
        targets = parse_qs(parsed.query).get('q') or parse_qs(parsed.query).get('url')
        if targets:
            return targets[0]
    return href


def formatting(node: Node, inherited: Format, values: dict[str, str], base: float) -> Format:
    out = inherited
    if node.tag in ('b', 'strong'):
        out = replace(out, bold=True)
    elif node.tag in ('i', 'em'):
        out = replace(out, italic=True)
    elif node.tag == 'u':
        out = replace(out, underline=True)
    elif node.tag in ('s', 'strike', 'del'):
        out = replace(out, strike=True)
    elif node.tag == 'small':
        out = replace(out, size=out.size * 0.8, small=True)
    elif node.tag in ('sup', 'sub'):
        out = replace(out, position=node.tag)
    elif node.tag == 'a':
        out = replace(out, href=link(node.attrs.get('href', '')))
    for key, value in values.items():
        if value in ('inherit', 'unset'):
            continue
        if key == 'color':
            out = replace(out, color='' if value == 'initial' else color(value))
        elif key == 'font-weight':
            out = replace(out, bold=value in ('bold', 'bolder') or (value.isdecimal() and int(value) >= 600))
        elif key == 'font-style':
            out = replace(out, italic=value in ('italic', 'oblique'))
        elif key in ('text-decoration', 'text-decoration-line'):
            out = replace(out, underline='underline' in value.split(), strike='line-through' in value.split())
        elif key == 'vertical-align':
            out = replace(out, position={'super': 'sup', 'sub': 'sub'}.get(value, ''))
        elif key == 'font-size':
            size = font_size(value, out.size)
            out = replace(out, size=size, small=size < base - 0.01)
    return out


def wrappers(fmt: Format) -> tuple[tuple[str, str], ...]:
    out: list[tuple[str, str]] = []
    if fmt.href:
        out.append((f'<a href="{escape(fmt.href, quote=True)}">', '</a>'))
    if fmt.color:
        out.append((f'<span style="color:{fmt.color}">', '</span>'))
    for tag, active in (('b', fmt.bold), ('i', fmt.italic), ('u', fmt.underline),
                        ('s', fmt.strike), ('small', fmt.small and not fmt.position)):
        if active:
            out.append((f'<{tag}>', f'</{tag}>'))
    if fmt.position:
        out.append((f'<{fmt.position}>', f'</{fmt.position}>'))
    return tuple(out)


def cell(node: Node, ancestors: list[Node], css: list[Rule]) -> list[str]:
    inherited = Format()
    for index, ancestor in enumerate(ancestors):
        inherited = formatting(ancestor, inherited, styled(ancestor, ancestors[:index], css), inherited.size)
    base_format = formatting(node, inherited, styled(node, ancestors, css), inherited.size)
    base_format = replace(base_format, small=False)
    runs: list[tuple[str, tuple[tuple[str, str], ...]]] = []

    def add(text: str, fmt: Format) -> None:
        text = re.sub(r'[ \t\r\f\v\u00a0]+', ' ', text)
        style = wrappers(fmt)
        if runs and runs[-1][1] == style:
            runs[-1] = (runs[-1][0] + text, style)
        else:
            runs.append((text, style))

    def visit(current: Node, parents: list[Node], fmt: Format) -> None:
        if current.tag in ('img', 'script', 'style', 'table', 'th'):
            return
        if current.tag == 'br':
            add('\n', fmt)
            return
        effective = fmt if current is node else formatting(current, fmt, styled(current, parents, css), base_format.size)
        block = current.tag in ('div', 'p', 'li')
        if block and runs and not runs[-1][0].endswith('\n'):
            add('\n', effective)
        for child in current.children:
            if isinstance(child, str):
                add(child, effective)
            else:
                visit(child, parents + [current], effective)
        if block and runs and not runs[-1][0].endswith('\n'):
            add('\n', effective)

    visit(node, ancestors, base_format)
    lines: list[list[tuple[str, tuple[tuple[str, str], ...]]]] = [[]]
    for text, style in runs:
        parts = text.split('\n')
        for index, part in enumerate(parts):
            if index:
                lines.append([])
            if part:
                lines[-1].append((part, style))
    rendered: list[str] = []
    for line in lines:
        while line and not line[0][0].lstrip():
            line.pop(0)
        while line and not line[-1][0].rstrip():
            line.pop()
        if line:
            line[0] = (line[0][0].lstrip(), line[0][1])
            line[-1] = (line[-1][0].rstrip(), line[-1][1])
        # Whitespace has no visible color/weight. Attach each separator to the
        # common style of its neighboring words, not arbitrary span boundaries.
        tokens: list[tuple[str, tuple[tuple[str, str], ...]]] = []
        for text, style in line:
            for part in re.findall(r' +|[^ ]+', text):
                if part.isspace() and tokens and tokens[-1][0] == ' ':
                    continue
                tokens.append((' ' if part.isspace() else part, style))
        for index, (text, _) in enumerate(tokens):
            if text != ' ':
                continue
            left = tokens[index - 1][1] if index else ()
            right = tokens[index + 1][1] if index + 1 < len(tokens) else ()
            shared = 0
            while shared < min(len(left), len(right)) and left[shared] == right[shared]:
                shared += 1
            tokens[index] = (text, left[:shared])
        # Keep common wrappers open across neighboring runs; nesting changes do
        # not repeatedly close/reopen the inherited cell color or bold style.
        fragments: list[str] = []
        opened: tuple[tuple[str, str], ...] = ()
        for text, style in tokens:
            shared = 0
            while shared < min(len(opened), len(style)) and opened[shared] == style[shared]:
                shared += 1
            fragments.extend(close for _, close in reversed(opened[shared:]))
            fragments.extend(start for start, _ in style[shared:])
            fragments.append(escape(text, quote=False))
            opened = style
        fragments.extend(close for _, close in reversed(opened))
        rendered.append(''.join(fragments))
    while rendered and not rendered[0]:
        rendered.pop(0)
    while rendered and not rendered[-1]:
        rendered.pop()
    return rendered


def rows(node: Node, ancestors: list[Node]) -> Iterator[tuple[Node, list[Node]]]:
    for child in node.children:
        if not isinstance(child, Node):
            continue
        if child.tag == 'tr':
            yield child, ancestors + [node]
        elif child.tag in ('thead', 'tbody', 'tfoot'):
            yield from rows(child, ancestors + [node])


def span(node: Node, key: str) -> int:
    value = node.attrs.get(key, '1')
    if not re.fullmatch(r'[0-9]+', value) or not 1 <= int(value) <= 100000:
        raise ValueError(f'Invalid {key} {value!r} in spreadsheet cell.')
    return int(value)


def sheet(html: str) -> list[list[list[str]]]:
    """Normalize a closed waffle grid to positional cells of rich text lines."""
    parser = Grid()
    parser.feed(html)
    parser.close()
    if parser.table is None or not parser.closed or parser.stack:
        raise ValueError('No closed waffle table; check public access, login redirects, or truncated sheet HTML.')
    css = rules(parser.styles)
    result: list[list[list[str]]] = []
    carry: dict[int, int] = {}
    for row, ancestors in rows(parser.table, parser.ancestors):
        cells = [child for child in row.children if isinstance(child, Node) and child.tag == 'td']
        if not cells and not carry:
            continue
        expanded: list[list[str]] = []
        column = 0
        for source in cells:
            while column in carry:
                expanded.append([])
                column += 1
            width, height = span(source, 'colspan'), span(source, 'rowspan')
            if any(index in carry for index in range(column, column + width)):
                raise ValueError('Overlapping merged cells in spreadsheet grid.')
            expanded.append(cell(source, ancestors + [row], css))
            expanded.extend([] for _ in range(width - 1))
            for index in range(column, column + width):
                if height > 1:
                    # Include this row in the counter; decrement below, even on
                    # empty rows, so rowspan expansion precedes empty-row removal.
                    carry[index] = height
            column += width
        if carry:
            expanded.extend([] for _ in range(max(carry) + 1 - len(expanded)))
        carry = {index: count - 1 for index, count in carry.items() if count > 1}
        while expanded and not expanded[-1]:
            expanded.pop()
        if any(expanded):
            result.append(expanded)
    if not result:
        raise ValueError('The waffle table has no text; refusing an empty upstream snapshot.')
    return result


def serialized(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + '\n'


def baseline(directory: Path, update: bool) -> tuple[dict[str, str], list[dict[str, str]]]:
    index = directory / 'index.json'
    if not index.exists():
        if not update:
            raise ValueError(f'Baseline missing at {index}; run python3 tools/ddc.py --update to initialize it.')
        return {}, []
    try:
        value = json.loads(index.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f'Cannot read baseline {index}: {error}') from error
    if not isinstance(value, dict) or type(value.get('format')) is not int or value.get('format') != 1:
        raise ValueError(f'Unsupported baseline format in {index}; expected format 1.')
    if value.get('spreadsheet') != BOOK or not isinstance(value.get('sheets'), list):
        raise ValueError(f'Invalid spreadsheet or sheet catalogue in baseline {index}.')
    entries: list[dict[str, str]] = []
    old = {'index.json': index.read_text(encoding='utf-8')}
    seen: set[str] = set()
    for entry in value['sheets']:
        if (not isinstance(entry, dict) or set(entry) != {'gid', 'name'}
                or not isinstance(entry['gid'], str) or not re.fullmatch(r'0|[1-9][0-9]*', entry['gid'])
                or not isinstance(entry['name'], str) or not entry['name'].strip() or entry['gid'] in seen):
            raise ValueError(f'Invalid or duplicate tab in baseline {index}.')
        seen.add(entry['gid'])
        entries.append({'gid': entry['gid'], 'name': entry['name']})
        filename = entry['gid'] + '.json'
        try:
            old[filename] = (directory / filename).read_text(encoding='utf-8')
            if not isinstance(json.loads(old[filename]), list):
                raise ValueError('expected a JSON row array')
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise ValueError(f'Cannot read baseline tab {entry["name"]!r} ({directory / filename}): {error}') from error
    if not entries:
        raise ValueError(f'Empty baseline catalogue in {index}; refusing to overwrite it.')
    return old, entries


def atomic_write(path: Path, text: str) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def refresh(directory: Path, *, update: bool = False,
            fetch: Callable[[str], str] = download) -> bool:
    """Fetch/normalize all tabs before comparing or explicitly updating files."""
    old, previous = baseline(directory, update)
    url = BOOK + '/htmlview'
    try:
        entries = catalog(fetch(url))
    except Exception as error:
        raise RuntimeError(f'Cannot fetch/parse DDC catalogue {url}: {error}') from error

    def fetch_sheet(entry: dict[str, str]) -> tuple[str, str]:
        sheet_url = BOOK + '/htmlview/sheet?headers=true&gid=' + entry['gid']
        try:
            return entry['gid'] + '.json', serialized(sheet(fetch(sheet_url)))
        except Exception as error:
            raise RuntimeError(f'Cannot fetch/parse DDC tab {entry["name"]!r} (gid {entry["gid"]}, {sheet_url}): {error}') from error

    with ThreadPoolExecutor(max_workers=4) as workers:
        current = dict(workers.map(fetch_sheet, entries))
    current['index.json'] = serialized({'format': 1, 'spreadsheet': BOOK, 'sheets': entries})
    changed = sorted(filename for filename in old.keys() | current.keys() if old.get(filename) != current.get(filename))
    if not changed:
        print('DDC: no upstream changes.')
        return False
    names = {entry['gid'] + '.json': entry['name'] for entry in previous + entries}
    if not update:
        for filename in changed:
            name = names.get(filename, 'tab catalogue')
            print(f'DDC: {name} ({filename})')
            sys.stdout.writelines(unified_diff(old.get(filename, '').splitlines(keepends=True),
                                              current.get(filename, '').splitlines(keepends=True),
                                              fromfile=f'baseline/{filename}', tofile=f'upstream/{filename}'))
        return True
    for filename in current.keys() - old.keys():
        path = directory / filename
        if path.exists() or path.is_symlink():
            raise ValueError(f'Unowned file at {path}; restore its catalogue or choose a clean --dir before updating.')
    directory.mkdir(parents=True, exist_ok=True)
    # Publish the catalogue last; only files owned by its previous version may
    # be removed. Other files in this directory are never cleanup candidates.
    for filename in changed:
        if filename != 'index.json' and filename in current:
            atomic_write(directory / filename, current[filename])
    if 'index.json' in changed:
        atomic_write(directory / 'index.json', current['index.json'])
    for filename in old.keys() - current.keys():
        (directory / filename).unlink()
    altered = {filename for filename in changed if filename != 'index.json'}
    previous_names = {entry['gid']: entry['name'] for entry in previous}
    altered.update(entry['gid'] + '.json' for entry in entries if previous_names.get(entry['gid']) != entry['name'])
    print(f'DDC: updated {len(altered)} tab(s)' + (' and catalogue.' if 'index.json' in changed else '.'))
    for filename in sorted(altered, key=lambda filename: int(filename[:-5])):
        status = 'removed' if filename not in current else 'added' if filename not in old else 'changed'
        print(f'  {status}: {names[filename]} (gid {filename[:-5]})')
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description='Compare DDC rich-text upstream snapshots; no downstream synchronization.')
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check', action='store_true', help='Read-only unified diffs (default); exit 1 when changed.')
    modes.add_argument('--update', action='store_true', help='Explicitly write a new upstream baseline.')
    parser.add_argument('--dir', type=Path, default=Path(shell.ROOT) / 'data' / 'ddc', help='Snapshot directory (default: data/ddc).')
    args = parser.parse_args(argv)
    try:
        changed = refresh(args.dir, update=args.update)
    except (OSError, ValueError, RuntimeError) as error:
        print(f'DDC: {error}', file=sys.stderr)
        return 2
    return 0 if args.update or not changed else 1


if __name__ == '__main__':
    sys.exit(main())
