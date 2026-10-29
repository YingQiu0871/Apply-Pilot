"""Draws the WiX dialog bitmaps from the rendered icon PNGs (run build-icons.mjs first).

banner.bmp 493x58: top strip of the installer pages.
dialog.bmp 493x312: welcome and finish pages; the left 164 px are the brand panel.
Needs Pillow.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PNG = ROOT / 'assets' / 'png'
OUT = ROOT / 'installer' / 'windows'
TOP, BOTTOM = (0x5b, 0x8c, 0xff), (0x25, 0x46, 0xc9)


def font(size):
    for name in ('segoeuisb.ttf', 'segoeui.ttf', 'arial.ttf'):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def icon(size):
    return Image.open(PNG / f'icon-{size}.png').convert('RGBA')


banner = Image.new('RGB', (493, 58), 'white')
ic = icon(48).resize((40, 40), Image.LANCZOS)
banner.paste(ic, (493 - 40 - 12, 9), ic)
ImageDraw.Draw(banner).line([(0, 57), (493, 57)], fill=(228, 231, 236))
banner.save(OUT / 'banner.bmp')

dialog = Image.new('RGB', (493, 312), 'white')
panel = Image.new('RGB', (164, 312))
d = ImageDraw.Draw(panel)
for y in range(312):
    t = y / 311
    d.line([(0, y), (164, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
dialog.paste(panel, (0, 0))
ic = icon(128).resize((88, 88), Image.LANCZOS)
dialog.paste(ic, ((164 - 88) // 2, 92), ic)
draw = ImageDraw.Draw(dialog)
f = font(17)
w = draw.textlength('Apply-Pilot', font=f)
draw.text(((164 - w) / 2, 196), 'Apply-Pilot', font=f, fill='white')
dialog.save(OUT / 'dialog.bmp')
print('wrote banner.bmp and dialog.bmp')
