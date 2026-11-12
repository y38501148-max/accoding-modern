"""Build SVG glyphs from the original Computer Modern Type 1 fonts.

Requires fonttools. The unmodified AMS font sources and license are vendored.
The output uses the same 1000-unit coordinates as MathJax's SVG font tables.
"""
import json
from pathlib import Path
from fontTools.t1Lib import T1Font
from fontTools.agl import toUnicode
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
root = Path(__file__).resolve().parent.parent / 'vendor/cm-math'

def glyphs(name):
    font = T1Font(str(root / (name + '.pfb')))
    gs = font.getGlyphSet()
    result = {}
    for key, glyph in gs.items():
        text = toUnicode(key)
        if len(text) != 1:
            continue
        path = SVGPathPen(gs); glyph.draw(path)
        bounds = BoundsPen(gs); glyph.draw(bounds)
        if bounds.bounds is None:
            continue
        left, bottom, right, top = bounds.bounds
        result[str(ord(text))] = [round(top), round(-bottom), round(glyph.width), round(left), round(right), path.getCommands().removeprefix('M').removesuffix('Z')]
    return result

main = glyphs('cmr12')
for key, value in glyphs('cmsy10').items():
    if int(key) > 127:
        main.setdefault(key, value)
# Mathematical minus is not the text hyphen.
if '8722' in glyphs('cmsy10'):
    main['8722'] = glyphs('cmsy10')['8722']
result = {'MathJax_Main': main, 'MathJax_Math-italic': glyphs('cmmi12')}
(root / 'glyphs.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Computer Modern glyphs:', sum(map(len,result.values())))
