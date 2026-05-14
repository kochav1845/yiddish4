"""
Generate logo.ico for the VoicePaste exe.

Produces a multi-resolution .ico (16, 32, 48, 64, 128, 256 px) with an amber
rounded-rectangle background and a white microphone shape, matching the webapp
header branding.

If the project's Supabase logo is reachable, it is downloaded and used instead.
Run:  python make_icon.py [--supabase-url URL]
"""

import argparse
import math
import sys
from io import BytesIO
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Pillow is required: pip install pillow")

OUT_PATH = Path("logo.ico")
SIZES = [16, 32, 48, 64, 128, 256]

# Amber-600  →  Amber-800  gradient
COLOR_TOP    = (217, 119,  6)   # amber-600
COLOR_BOTTOM = (146,  64,  14)  # amber-800
WHITE        = (255, 255, 255)
TRANSPARENT  = (0, 0, 0, 0)


def _lerp_color(a: tuple, b: tuple, t: float) -> tuple:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _rounded_rect_mask(draw: ImageDraw.ImageDraw, size: int, radius_ratio: float = 0.22):
    r = int(size * radius_ratio)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=r, fill=WHITE)


def _draw_gradient_bg(img: Image.Image, size: int):
    """Fill image with a top-to-bottom amber gradient inside a rounded rect."""
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    r = int(size * 0.22)
    md.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=r, fill=255)

    gradient = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(gradient)
    for y in range(size):
        t = y / (size - 1)
        color = _lerp_color(COLOR_TOP, COLOR_BOTTOM, t)
        gd.line([(0, y), (size - 1, y)], fill=(*color, 255))

    img.paste(gradient, mask=mask)


def _draw_mic(draw: ImageDraw.ImageDraw, size: int):
    """
    Draw a simplified microphone using basic shapes.
    All dimensions are proportional to 'size'.
    """
    s = size

    # Microphone body (rounded rectangle)
    body_w   = s * 0.28
    body_h   = s * 0.40
    body_x   = (s - body_w) / 2
    body_y   = s * 0.10
    body_r   = body_w * 0.50
    draw.rounded_rectangle(
        [(body_x, body_y), (body_x + body_w, body_y + body_h)],
        radius=body_r,
        fill=WHITE,
    )

    # Stand arc — drawn as a thick arc
    arc_margin = s * 0.14
    arc_top    = s * 0.36
    arc_bottom = s * 0.66
    lw = max(2, int(s * 0.055))
    draw.arc(
        [(arc_margin, arc_top), (s - arc_margin, arc_bottom)],
        start=180,
        end=0,
        fill=WHITE,
        width=lw,
    )

    # Vertical stem
    stem_x  = s / 2
    stem_y0 = arc_bottom - lw / 2        # bottom of arc
    stem_y1 = s * 0.76
    draw.line([(stem_x, stem_y0), (stem_x, stem_y1)], fill=WHITE, width=lw)

    # Horizontal base
    base_half = s * 0.15
    draw.line(
        [(stem_x - base_half, stem_y1), (stem_x + base_half, stem_y1)],
        fill=WHITE,
        width=lw,
    )


def make_frame(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    _draw_gradient_bg(img, size)
    _draw_mic(draw, size)
    return img


def fetch_supabase_logo(url: str) -> Image.Image | None:
    try:
        import urllib.request
        with urllib.request.urlopen(url, timeout=8) as resp:
            data = resp.read()
        img = Image.open(BytesIO(data)).convert("RGBA")
        print(f"[make_icon] Downloaded logo from {url}")
        return img
    except Exception as e:
        print(f"[make_icon] Could not fetch Supabase logo ({e}), using generated icon.")
        return None


def build_ico(base_img: Image.Image | None = None):
    frames = []
    for size in SIZES:
        if base_img is not None:
            frame = base_img.resize((size, size), Image.LANCZOS).convert("RGBA")
        else:
            frame = make_frame(size)
        frames.append(frame)

    frames[0].save(
        OUT_PATH,
        format="ICO",
        append_images=frames[1:],
        sizes=[(s, s) for s in SIZES],
    )
    print(f"[make_icon] Saved {OUT_PATH}  ({', '.join(str(s) for s in SIZES)} px)")


def main():
    parser = argparse.ArgumentParser(description="Generate logo.ico for VoicePaste")
    parser.add_argument("--supabase-url", default="", help="Public Supabase logo URL (optional)")
    args = parser.parse_args()

    base_img = None
    if args.supabase_url:
        base_img = fetch_supabase_logo(args.supabase_url)

    build_ico(base_img)


if __name__ == "__main__":
    main()
