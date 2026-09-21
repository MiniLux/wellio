"""Génère les icônes de l'app (dégradé + courbe de suivi)."""
from PIL import Image, ImageDraw
import os, math

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)
S = 1024


def gradient(size, c1, c2):
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        for_x = y / (size - 1)
        # dégradé diagonal approximé ligne par ligne + décalage horizontal
        d.line([(0, y), (size, y)], fill=tuple(
            int(c1[i] + (c2[i] - c1[i]) * for_x) for i in range(3)))
    # voile diagonal
    overlay = Image.new("RGB", (size, size))
    do = ImageDraw.Draw(overlay)
    for x in range(size):
        t = x / (size - 1)
        do.line([(x, 0), (x, size)], fill=tuple(
            int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3)))
    return Image.blend(img, overlay, 0.5)


def curve(draw, size, pad, width):
    """Courbe façon suivi de données, tracée au « stylo rond » pour des bords nets."""
    n = 1400
    r = width / 2
    pts = []
    for i in range(n + 1):
        t = i / n
        x = pad + t * (size - 2 * pad)
        y = size * 0.56 - math.sin(t * math.pi * 1.7) * size * 0.15 - t * size * 0.05
        pts.append((x, y))
    for (x, y) in pts:
        draw.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
    # points de saisie
    for t in (0.18, 0.5, 0.82):
        x, y = pts[int(t * n)]
        rr = size * 0.05
        draw.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(255, 255, 255))


def build(size, pad_ratio, rounded):
    img = gradient(S, (37, 106, 191), (27, 175, 122)).convert("RGBA")
    d = ImageDraw.Draw(img)
    inset = S * pad_ratio
    curve(d, S, inset + S * 0.06, int(S * 0.055))
    if rounded:
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.225), fill=255)
        img.putalpha(mask)
    return img.resize((size, size), Image.LANCZOS)


build(512, 0.0, False).save(os.path.join(OUT, "icon-512.png"))
build(192, 0.0, False).save(os.path.join(OUT, "icon-192.png"))
build(180, 0.0, False).convert("RGB").save(os.path.join(OUT, "icon-180.png"))
# maskable : marge de sécurité de 20 %
m = Image.new("RGBA", (S, S), (0, 0, 0, 0))
base = build(int(S * 0.72), 0.0, False).convert("RGBA")
bg = gradient(S, (37, 106, 191), (27, 175, 122)).convert("RGBA")
bg.paste(base, (int(S * 0.14), int(S * 0.14)), base)
bg.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-maskable-512.png"))
print("icônes générées dans", OUT)
