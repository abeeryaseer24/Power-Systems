"""Minimal Markdown to print-ready HTML for docs/report.md (headings, paragraphs,
tables, lists, code blocks, bold, italic, code and links)."""
import html, re, sys

src, out = sys.argv[1], sys.argv[2]
lines = open(src, encoding='utf8').read().split('\n')

def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r'`([^`]+)`', r'<code>\1</code>', t)
    t = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', t)
    t = re.sub(r'(?<![\w*])\*([^*]+)\*(?!\w)', r'<em>\1</em>', t)
    t = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', t)
    return t

body, i = [], 0
para = []
def flush():
    global para
    if para:
        body.append('<p>' + inline(' '.join(para)) + '</p>')
        para = []

while i < len(lines):
    ln = lines[i]
    if ln.startswith('```'):
        flush()
        j = i + 1
        code = []
        while j < len(lines) and not lines[j].startswith('```'):
            code.append(html.escape(lines[j])); j += 1
        body.append('<pre>' + '\n'.join(code) + '</pre>')
        i = j + 1; continue
    m = re.match(r'^(#{1,4}) (.*)', ln)
    if m:
        flush()
        lvl = len(m.group(1))
        body.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>')
        i += 1; continue
    if ln.startswith('|') and i + 1 < len(lines) and re.match(r'^\|[\s\-:|]+\|$', lines[i + 1]):
        flush()
        head = [c.strip() for c in ln.strip('|').split('|')]
        rows = []
        j = i + 2
        while j < len(lines) and lines[j].startswith('|'):
            rows.append([c.strip() for c in lines[j].strip('|').split('|')]); j += 1
        t = '<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
        t += ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table>'
        body.append(t)
        i = j; continue
    if re.match(r'^(\d+\.|[-*]) ', ln):
        # a list block, nested by indentation: items, continuation lines, blank lines between items
        flush()
        items, j = [], i
        while j < len(lines):
            L = lines[j]
            m = re.match(r'^( *)(\d+\.|[-*]) (.*)', L)
            if m:
                items.append([len(m.group(1)), m.group(2)[-1] == '.', m.group(3)]); j += 1; continue
            if L.strip() and L.startswith(' ') and items:
                items[-1][2] += ' ' + L.strip(); j += 1; continue
            if L.strip() and items and not re.match(r'^(#|\||>|```)', L) and not lines[j - 1].strip() == '':
                items[-1][2] += ' ' + L.strip(); j += 1; continue
            if not L.strip() and j + 1 < len(lines) and re.match(r'^( *)(\d+\.|[-*]) ', lines[j + 1]):
                j += 1; continue
            break
        def render(k, ind):
            tag = 'ol' if items[k][1] else 'ul'
            out = []
            while k < len(items) and items[k][0] >= ind:
                if items[k][0] > ind:  # deeper item without a parent at this level
                    sub, k = render(k, items[k][0]); out[-1] = out[-1][:-5] + sub + '</li>' if out else sub; continue
                li = inline(items[k][2]); k += 1
                if k < len(items) and items[k][0] > ind:
                    sub, k = render(k, items[k][0]); li += sub
                out.append(f'<li>{li}</li>')
            return f'<{tag}>' + ''.join(out) + f'</{tag}>', k
        k = 0
        while k < len(items):
            h, k = render(k, items[k][0]); body.append(h)
        i = j; continue
    m = re.match(r'^!\[([^\]]*)\]\(([^)]+)\)\s*$', ln)
    if m:  # a figure: image plus its caption (the alt text)
        flush()
        body.append(f'<figure><img src="{m.group(2)}" alt=""><figcaption>{inline(m.group(1))}</figcaption></figure>')
        i += 1; continue
    if not ln.strip():
        flush(); i += 1; continue
    para.append(ln.strip()); i += 1
flush()

css = """
@page { size: A4; margin: 22mm 20mm 20mm 20mm; }
html, body { background: #fff; }
body { font-family: 'Georgia', 'Times New Roman', serif; font-size: 10.5pt; line-height: 1.45; color: #111; max-width: 170mm; margin: 0 auto; }
h1 { font-size: 20pt; line-height: 1.2; margin: 0 0 10pt; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt; page-break-after: avoid; }
p { margin: 0 0 7pt; text-align: justify; }
table { border-collapse: collapse; width: 100%; margin: 6pt 0 10pt; font-size: 9pt; page-break-inside: avoid; }
th, td { border: 0.5pt solid #888; padding: 3pt 5pt; text-align: left; vertical-align: top; }
th { background: #eee; }
pre { font-size: 8.5pt; background: #f5f5f5; padding: 6pt; white-space: pre-wrap; }
code { font-size: 9pt; }
a { color: #123d7a; text-decoration: none; }
ol, ul { margin: 0 0 8pt 18pt; padding: 0; }
li > ol, li > ul { margin: 2pt 0 2pt 14pt; }
li { margin: 1pt 0; }
figure { margin: 8pt 0 12pt; page-break-inside: avoid; text-align: center; }
figure img { width: 100%; max-width: 170mm; }
figcaption { font-size: 9pt; color: #333; text-align: left; margin-top: 4pt; }
li { margin-bottom: 3pt; }
"""
title = re.sub('<[^>]+>', '', body[0]) if body else 'Report'
open(out, 'w', encoding='utf8').write(f'<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{css}</style></head><body>' + '\n'.join(body) + '</body></html>')
print('ok', len(body))
