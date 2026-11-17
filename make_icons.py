import numpy as np
from PIL import Image, ImageDraw

SS = 4  # supersampling
STOPS = [(0.0, (108, 76, 245)), (0.70, (255, 95, 162)), (1.0, (255, 179, 71))]
PURPLE = (108, 76, 245)
WHITE = (255, 255, 255)
GOLD = (255, 209, 102)

def gradient(n):
    ys, xs = np.mgrid[0:n, 0:n]
    t = (xs + ys) / (2.0 * (n - 1))
    out = np.zeros((n, n, 3), dtype=np.float64)
    for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
        m = (t >= t0) & (t <= t1)
        k = ((t - t0) / (t1 - t0))[m][:, None]
        out[m] = np.array(c0) * (1 - k) + np.array(c1) * k
    return Image.fromarray(out.astype(np.uint8), 'RGB').convert('RGBA')

def bez(p0, p1, p2, steps=40):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        pts.append(((1-t)**2*p0[0] + 2*(1-t)*t*p1[0] + t*t*p2[0],
                    (1-t)**2*p0[1] + 2*(1-t)*t*p1[1] + t*t*p2[1]))
    return pts

def thick_line(d, pts, w, fill):
    d.line(pts, fill=fill, width=int(w), joint='curve')
    r = w / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([x-r, y-r, x+r, y+r], fill=fill)

def render(size, kind):
    """kind: 'any' (rounded, transparent corners) | 'maskable' (full bleed) | 'favicon' (simplified)"""
    n = size * SS
    s = n / 512.0
    P = lambda x, y: (x * s, y * s)
    img = gradient(n)
    d = ImageDraw.Draw(img)

    if kind == 'favicon':
        # kotak gradien + centang besar (terbaca jelas di 16px)
        thick_line(d, [P(128, 268), P(222, 362), P(388, 170)], 66 * s, WHITE)
    else:
        # topi wisuda
        d.polygon([P(256, 66), P(396, 122), P(256, 178), P(116, 122)], fill=WHITE)
        base = [P(172, 152), P(172, 198)] + [P(x, y) for x, y in bez((172, 198), (256, 252), (340, 198))] + [P(340, 152), P(256, 190)]
        d.polygon(base, fill=(255, 255, 255, 235))
        # kuncir
        thick_line(d, [P(396, 122), P(396, 200)], 12 * s, GOLD)
        d.ellipse([*P(384, 196), *P(408, 224)], fill=GOLD)
        # lencana centang
        cx, cy, r = 256, 340, 104
        d.ellipse([*P(cx - r, cy - r), *P(cx + r, cy + r)], fill=WHITE)
        thick_line(d, [P(206, 342), P(244, 380), P(312, 304)], 30 * s, PURPLE)

    if kind in ('any', 'favicon'):
        mask = Image.new('L', (n, n), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * (0.22 if kind == 'any' else 0.2)), fill=255)
        img.putalpha(mask)
    else:
        img = img.convert('RGB').convert('RGBA')
    return img.resize((size, size), Image.LANCZOS)

out = 'public/icons/'
render(192, 'any').save(out + 'icon-192.png')
render(512, 'any').save(out + 'icon-512.png')
render(192, 'maskable').save(out + 'maskable-192.png')
render(512, 'maskable').save(out + 'maskable-512.png')
render(180, 'maskable').convert('RGB').save(out + 'apple-touch-icon.png')
render(32, 'favicon').save('public/favicon-32.png')
render(16, 'favicon').save('public/favicon-16.png')
ico = [render(s, 'favicon') for s in (48, 32, 16)]
ico[0].save('public/favicon.ico', format='ICO', sizes=[(48, 48), (32, 32), (16, 16)], append_images=ico[1:])
render(1024, 'any').resize((512, 512), Image.LANCZOS).save('preview-icon.png')
print('ok')
