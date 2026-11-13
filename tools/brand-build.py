#!/usr/bin/env python3
"""Build Blue Street's logo files from one set of measurements.

assets/brand/ is the only home for the logo. This script writes the master
SVGs there, then exports the site's icons and link-preview image from them.
Change the logo here, run it, and every copy updates:

    python3 tools/brand-build.py

Needs: fontTools (Python), rsvg-convert, and Inter (ExtraBold + Bold) installed.
Letters are turned into shapes, so the SVGs look the same on every device
whether or not Inter is installed there.
"""
import os
import subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRAND = os.path.join(ROOT, 'assets', 'brand')
ASSETS = os.path.join(ROOT, 'assets')
FONTS = '/usr/share/fonts/opentype/inter/'

BLUE = '#0a84ff'
IVORY = '#f6f2ea'
BLACK = '#101319'  # the site's dark ink
WHITE = '#ffffff'

# ---- The sign's geometry (512 grid) -------------------------------------
POST = '<rect x="92" y="88" width="30" height="336" rx="15"/>'
ARROW = '<path d="M108 150 H384 L438 210 L384 270 H108 Z" stroke-width="14" stroke-linejoin="round"/>'
# Lettering on the sign. ST sits clear of the E (Rami, 2026-11-13: option A).
BLUE_TXT = dict(text='BLUE', x=134, y=244, size=82, spacing=-2, weight='ExtraBold')
ST_TXT = dict(text='ST', x=343, y=190, size=32, spacing=0, weight='ExtraBold')
# Sign's visible box (post + arrow incl. stroke): x 92..445, y 88..424
SIGN_BOX = (84, 80, 362, 352)

_fonts = {}


def text_path(text, x, y, size, spacing=0, weight='ExtraBold'):
    """Inter lettering as one SVG path (baseline at y). Returns (d, width)."""
    if weight not in _fonts:
        _fonts[weight] = TTFont(FONTS + 'Inter-%s.otf' % weight)
    font = _fonts[weight]
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
    scale = size / font['head'].unitsPerEm
    pen = SVGPathPen(gs)
    cx = 0.0
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        gs[g].draw(TransformPen(pen, (scale, 0, 0, -scale, x + cx, y)))
        cx += hmtx[g][0] * scale + (spacing if i < len(text) - 1 else 0)
    return pen.getCommands(), cx


def sign_shape(sign_fill, letter_fill=None):
    """Post + arrow, with or without the BLUE ST lettering."""
    out = '<g fill="%s" stroke="%s">%s%s</g>' % (sign_fill, sign_fill, POST, ARROW)
    if letter_fill:
        b, _ = text_path(**BLUE_TXT)
        s, _ = text_path(**ST_TXT)
        out += '<path fill="%s" d="%s %s"/>' % (letter_fill, b, s)
    return out


def svg(w, h, body, vb=None, bg=None):
    vb = vb or (0, 0, w, h)
    bgr = '<rect x="%s" y="%s" width="%s" height="%s" fill="%s"/>' % (vb[0], vb[1], vb[2], vb[3], bg) if bg else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="%s %s %s %s">%s%s</svg>\n'
            % (w, h, vb[0], vb[1], vb[2], vb[3], bgr, body))


def write(name, content):
    with open(os.path.join(BRAND, name), 'w') as f:
        f.write(content)


def lockup(sign_fill, word_fill):
    """Blank sign with 'Blue Street' beside it (banner lockup)."""
    size = 150
    gap = 70
    # Centre the name's capitals on the arrow's middle line (y=210).
    cap = 1490 / 2048 * size
    tx, ty = 445 + gap, 210 + cap / 2
    d, w = text_path('Blue Street', tx, ty, size, spacing=-3, weight='Bold')
    body = sign_shape(sign_fill) + '<path fill="%s" d="%s"/>' % (word_fill, d)
    return body, (84, 80, round(tx + w + 8 - 84), 352)


def main():
    os.makedirs(BRAND, exist_ok=True)
    x, y, w, h = SIGN_BOX

    # Sign (full logo) and symbol (blank sign), in both colourways.
    write('sign-ivory.svg', svg(w, h, sign_shape(IVORY, BLUE), SIGN_BOX))
    write('sign-blue.svg', svg(w, h, sign_shape(BLUE, IVORY), SIGN_BOX))
    write('symbol-ivory.svg', svg(w, h, sign_shape(IVORY), SIGN_BOX))
    write('symbol-blue.svg', svg(w, h, sign_shape(BLUE), SIGN_BOX))
    write('symbol-black.svg', svg(w, h, sign_shape(BLACK), SIGN_BOX))

    # Wordmark: BLUE with raised ST, no sign.
    b, bw = text_path('BLUE', 0, 82, 82, -2)
    s, sw = text_path('ST', bw + 9, 46, 32)  # tops line up with BLUE
    ww = bw + 9 + sw
    for name, fill in (('wordmark-ivory.svg', IVORY), ('wordmark-blue.svg', BLUE)):
        write(name, svg(round(ww), 84, '<path fill="%s" d="%s %s"/>' % (fill, b, s), (0, 22, round(ww) + 2, 62)))

    # Banner lockup: blank sign + "Blue Street".
    for name, sf, wf in (('lockup-ivory.svg', IVORY, IVORY), ('lockup-blue.svg', BLUE, BLUE),
                         ('lockup-black.svg', BLACK, BLACK)):
        body, vb = lockup(sf, wf)
        write(name, svg(round(vb[2] / 2), round(vb[3] / 2), body, vb))

    # ---- Exports the site uses -------------------------------------------
    def png(svgtext, out, w, h):
        tmp = os.path.join(BRAND, '.tmp.svg')
        with open(tmp, 'w') as f:
            f.write(svgtext)
        subprocess.run(['rsvg-convert', '-w', str(w), '-h', str(h), tmp, '-o', out], check=True)
        os.remove(tmp)

    tile = lambda body: svg(512, 512, body, (0, 0, 512, 512), BLUE)
    # Home-screen icons: ivory sign with lettering on a blue tile.
    for n, size in (('icon-512.png', 512), ('icon-192.png', 192), ('apple-touch-icon.png', 180)):
        png(tile(sign_shape(IVORY, BLUE)), os.path.join(ASSETS, n), size, size)
    # Browser tab: blank sign (too small for lettering).
    png(tile(sign_shape(IVORY)), os.path.join(ASSETS, 'favicon.png'), 64, 64)

    # Link preview 1200x630: sign + name + tagline.
    name_d, name_w = text_path('Blue Street', 584, 318, 104, -2, 'Bold')
    tag = 'GLOBAL FUNDAMENTALS FOR FX'
    _, plain = text_path(tag, 0, 0, 26, 0, 'Medium')
    track = (1168 - 586 - plain) / (len(tag) - 1)  # spread to end at x=1168
    tag_d, _ = text_path(tag, 586, 384, 26, track, 'Medium')
    og = ('<g transform="translate(70 60) scale(1.0)">%s</g>' % sign_shape(IVORY, BLUE)
          + '<path fill="%s" d="%s"/>' % (IVORY, name_d)
          + '<path fill="%s" fill-opacity="0.78" d="%s"/>' % (IVORY, tag_d))
    png(svg(1200, 630, og, (0, 0, 1200, 630), BLUE), os.path.join(ASSETS, 'og.png'), 1200, 630)
    export_pngs(png)
    print('Brand files written to assets/brand/ and icons exported to assets/.')


def place(W, H, body, vb, max_w, max_h, bg):
    """Centre a logo (body in viewBox vb) on a W x H canvas, as an SVG."""
    k = min(max_w * W / vb[2], max_h * H / vb[3])
    tx, ty = (W - vb[2] * k) / 2 - vb[0] * k, (H - vb[3] * k) / 2 - vb[1] * k
    return svg(W, H, '<g transform="translate(%.2f %.2f) scale(%.4f)">%s</g>' % (tx, ty, k, body), (0, 0, W, H), bg)


def export_pngs(png):
    """High-res PNGs to save or post (assets/brand/png/): logos on their
    backgrounds, plus social banners in two styles."""
    out = os.path.join(BRAND, 'png')
    os.makedirs(out, exist_ok=True)
    import shutil
    shutil.rmtree(out)
    os.makedirs(out)
    sign_vb = SIGN_BOX
    lock_body, lock_vb = {}, None
    for c in (IVORY, BLUE, BLACK):
        lock_body[c], lock_vb = lockup(c, c)
    b, bw = text_path('BLUE', 0, 82, 82, -2)
    s, sw = text_path('ST', bw + 9, 46, 32)
    word = lambda c: '<path fill="%s" d="%s %s"/>' % (c, b, s)
    word_vb = (0, 22, bw + 9 + sw, 62)

    def save(group, name, svgtext):
        # Sorted into folders by look: png/<group>/<file>.
        os.makedirs(os.path.join(out, group), exist_ok=True)
        tmp = os.path.join(out, '.tmp.svg')
        with open(tmp, 'w') as f:
            f.write(svgtext)
        subprocess.run(['rsvg-convert', tmp, '-o', os.path.join(out, group, name)], check=True)
        os.remove(tmp)

    # Logos, 2048px tall squares / 3000px wide.
    sq, wide = (2048, 2048), (3000, 1200)
    logos = [
        ('sign-on-blue.png', sq, sign_shape(IVORY, BLUE), sign_vb, BLUE),
        ('sign-on-ivory.png', sq, sign_shape(BLUE, IVORY), sign_vb, IVORY),
        ('sign-on-white.png', sq, sign_shape(BLUE, WHITE), sign_vb, WHITE),
        ('symbol-on-white.png', sq, sign_shape(BLUE), sign_vb, WHITE),
        ('lockup-on-white.png', wide, lock_body[BLUE], lock_vb, WHITE),
        ('symbol-on-blue.png', sq, sign_shape(IVORY), sign_vb, BLUE),
        ('symbol-on-ivory.png', sq, sign_shape(BLUE), sign_vb, IVORY),
        ('symbol-black-on-ivory.png', sq, sign_shape(BLACK), sign_vb, IVORY),
        ('lockup-on-blue.png', wide, lock_body[IVORY], lock_vb, BLUE),
        ('lockup-on-ivory.png', wide, lock_body[BLUE], lock_vb, IVORY),
        ('lockup-black-on-ivory.png', wide, lock_body[BLACK], lock_vb, IVORY),
        ('wordmark-on-blue.png', wide, word(IVORY), word_vb, BLUE),
        ('wordmark-on-ivory.png', wide, word(BLUE), word_vb, IVORY),
    ]
    for name, (W, H), body, vb, bg in logos:
        save(name.split('-')[0], name, place(W, H, body, vb, 0.7, 0.62, bg))

    # Social banners at 2x the platform size. Logo kept in the middle so
    # profile photos and phone crops don't cover it.
    sizes = [('x', 3000, 1000), ('linkedin', 3168, 792),
             ('linkedin-page', 2256, 382), ('facebook', 1640, 624)]
    styles = [('sign', sign_shape(IVORY, BLUE), sign_vb, BLUE),
              ('black-lockup', lock_body[BLACK], lock_vb, IVORY),
              ('white-sign', sign_shape(BLUE, WHITE), sign_vb, WHITE),
              ('white-lockup', lock_body[BLUE], lock_vb, WHITE)]
    for style, body, vb, bg in styles:
        for plat, W, H in sizes:
            save('banners/' + style, 'banner-%s-%s.png' % (plat, style), place(W, H, body, vb, 0.5, 0.6, bg))


if __name__ == '__main__':
    main()
