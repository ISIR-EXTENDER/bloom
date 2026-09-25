"""The README's transparent Bloom logos, light and dark, from the app's logo on white paper.

Run from the repository root: uv run --no-project --with pillow --with numpy python scripts/render-readme-logo.py
"""

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SOURCE = "frontend/apps/bloom-dashboard/public/logo.png"
OUT = "docs/assets/readme"
CREAM = np.array([0xF2, 0xEA, 0xDC], dtype=float) / 255.0

rgb = np.asarray(Image.open(SOURCE).convert("RGB")).astype(float) / 255.0
h, w, _ = rgb.shape
# The paper is white to within two levels, so it is taken as pure white: ink can only darken it.
paper = np.ones(3)
alpha = np.clip((1.0 - rgb).max(axis=2), 0.0, 1.0)
# Anything within three levels of white is paper grain, fully clear; the rest rescales to keep edges soft.
floor = 3.0 / 255.0
alpha = np.clip((alpha - floor) / (1.0 - floor), 0.0, 1.0)
safe = np.maximum(alpha, 1e-6)[..., None]
colour = np.clip((rgb - paper) / safe + paper, 0.0, 1.0)
print(
    f"size {w}x{h}, opaque share {(alpha > 0.5).mean():.3f}, clear share {(alpha == 0).mean():.3f}"
)

# The flower and the wordmark sit apart; everything right of the gap is the word.
ink_columns = np.where((alpha > 0.25).any(axis=0))[0]
gaps = np.where(np.diff(ink_columns) > 40)[0]
split = (
    int((ink_columns[gaps[0]] + ink_columns[gaps[0] + 1]) / 2) if len(gaps) else w // 3
)
print(
    f"flower ends near column {ink_columns[gaps[0]] if len(gaps) else '?'}, word starts near {ink_columns[gaps[0] + 1] if len(gaps) else '?'}, split at {split}"
)

rows = np.where((alpha > 0.02).any(axis=1))[0]
cols = np.where((alpha > 0.02).any(axis=0))[0]
pad = 24
top, bottom = max(rows.min() - pad, 0), min(rows.max() + pad, h - 1)
left, right = max(cols.min() - pad, 0), min(cols.max() + pad, w - 1)


def save(name, rgb_layer):
    rgba = np.dstack([rgb_layer, alpha])[top : bottom + 1, left : right + 1]
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(
        f"{OUT}/{name}", optimize=True
    )
    print(f"wrote {name} {right - left + 1}x{bottom - top + 1}")


def save_rgba(name, rgb_layer, alpha_layer):
    rgba = np.dstack([rgb_layer, alpha_layer])[top : bottom + 1, left : right + 1]
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(
        f"{OUT}/{name}", optimize=True
    )
    print(f"wrote {name} {right - left + 1}x{bottom - top + 1}")


save("logo-light.png", colour)

# On a dark page the pale watercolour must stay pale: the flower is cut out as it looks on paper, its silhouette
# closed and its holes filled so a highlight inside a petal does not show the page through, with a soft edge.

darkness = (1.0 - rgb).max(axis=2)
flower = np.zeros((h, w), dtype=np.uint8)
flower[:, :split] = (darkness[:, :split] > 8 / 255) * 255
# Holes are paper the paint fully encloses, such as a highlight inside a petal. They stay opaque and take the
# colour of the paint around them, so nothing white shows through on a dark page.
outside = Image.fromarray(
    flower
).copy()  # a copy: an image over the array is read-only and ignores the fill
ImageDraw.floodfill(outside, (0, 0), 128)
filled = np.where(np.asarray(outside) == 128, 0, 255).astype(np.uint8)
holes = (filled > 0) & (flower == 0)
paint = (flower > 0).astype(float)


def blur(layer, radius):
    return (
        np.asarray(
            Image.fromarray((np.clip(layer, 0, 1) * 255).astype(np.uint8), "L").filter(
                ImageFilter.GaussianBlur(radius)
            )
        ).astype(float)
        / 255.0
    )


weight = blur(paint, 6) + 1e-6
nearby = np.dstack([blur(rgb[..., c] * paint, 6) / weight for c in range(3)])
flower_rgb = rgb.copy()
flower_rgb[holes] = nearby[holes]
print(f"enclosed paper pixels recoloured: {int(holes.sum())}")
# One pixel inside the paint, so the edge carries paint and not the paper it was mixed with.
inner = Image.fromarray(filled, "L").filter(ImageFilter.MinFilter(3))
flower_alpha = (
    np.asarray(inner.filter(ImageFilter.GaussianBlur(1.0))).astype(float) / 255.0
)

# The word's strokes are dark green, so the matte leaves them about three-quarters opaque; the cream word is solid.
stroke = np.percentile(alpha[:, split:][alpha[:, split:] > 0.2], 95)
word_alpha = np.clip(alpha[:, split:] / stroke, 0.0, 1.0)

dark_rgb = flower_rgb.copy()
dark_rgb[:, split:] = CREAM
dark_alpha = np.zeros((h, w))
dark_alpha[:, :split] = flower_alpha[:, :split]
dark_alpha[:, split:] = word_alpha
print(
    f"word stroke opacity {stroke:.2f}, flower coverage {(flower_alpha > 0.5).mean():.3f}"
)
save_rgba("logo-dark.png", dark_rgb, dark_alpha)
