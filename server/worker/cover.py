#!/usr/bin/env python3
"""Compose a 1080x1920 cover image from one frame + a title.

Same look as thumbnail.py (blurred full-frame background + centred frame +
dark band + title in Inter-Black, last line yellow), but the input is a
single image — typically the AI-enhanced frame from DeepChat image-to-image.
Title text goes through text files, never inline text='...' (apostrophes
and colons in AI titles would break ffmpeg filter parsing).
"""
import argparse, os, subprocess, tempfile

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


def grade(src, dst):
    """Professional colour grade + VFX glow on the real frame: vivid colour,
    contrast, sharpness, a bloom so highlights glow, a coral-to-lavender
    light wash in Clipi's palette, and a soft vignette so the subject pops.
    Deterministic and faithful — the frame stays the frame, it just looks
    like a premium thumbnail."""
    im = Image.open(src).convert("RGB")
    im = ImageEnhance.Color(im).enhance(1.35)
    im = ImageEnhance.Contrast(im).enhance(1.18)
    im = ImageEnhance.Brightness(im).enhance(1.06)
    im = ImageEnhance.Sharpness(im).enhance(1.7)
    # bloom: screen-blend a soft blurred copy so bright areas glow
    bloom = im.filter(ImageFilter.GaussianBlur(min(im.size) * 0.06))
    im = Image.blend(im, ImageChops.screen(im, bloom), 0.35)
    # gradient light: coral kiss from the top, lavender from the bottom
    w, h = im.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(h):
        t = y / max(h - 1, 1)
        if t < 0.5:
            a = int(30 * (1 - t * 2))
            od.line([(0, y), (w, y)], fill=(255, 154, 139, a))
        else:
            a = int(30 * (t - 0.5) * 2)
            od.line([(0, y), (w, y)], fill=(201, 184, 255, a))
    im = Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")
    # vignette: darken the edges so the subject pops
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((-w * 0.25, -h * 0.25, w * 1.25, h * 1.25), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) * 0.12))
    black = Image.new("RGB", (w, h), (10, 6, 18))
    im = Image.composite(im, black, mask)
    im.save(dst, quality=92)
    return dst


def split_title(title, max_chars=16):
    words = title.upper().split()
    lines, cur = [], ""
    for w in words:
        if len(cur) + len(w) + 1 <= max_chars:
            cur = (cur + " " + w).strip()
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines[:2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--font", default="")
    args = ap.parse_args()

    font = args.font or "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    lines = split_title(args.title)
    size = 110 if len(lines) == 1 else 88
    y0 = 1500 if len(lines) == 1 else 1440
    tmpdir = tempfile.mkdtemp(prefix="cover-")
    graded = os.path.join(tmpdir, "graded.jpg")
    grade(args.frame, graded)
    draws = []
    for i, line in enumerate(lines):
        color = "yellow" if i == len(lines) - 1 else "white"
        tf = os.path.join(tmpdir, f"line{i}.txt")
        with open(tf, "w") as f:
            f.write(line)
        draws.append(
            f"drawtext=fontfile={font}:textfile={tf}:fontsize={size}:fontcolor={color}:"
            f"borderw=6:bordercolor=black:x=(w-text_w)/2:y={y0 + i * 130}")
    filt = (
        "[0:v]split=2[bg][fg];"
        "[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
        "gblur=sigma=28,eq=brightness=-0.10[bg2];"
        "[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg2];"
        "[bg2][fg2]overlay=(W-w)/2:(H-h)/2,"
        "drawbox=x=0:y=1350:w=1080:h=570:color=black@0.45:t=fill,"
        + ",".join(draws) +
        ",format=yuv420p[v]"
    )
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", graded,
                    "-filter_complex", filt, "-map", "[v]", "-frames:v", "1",
                    "-q:v", "2", args.out], check=True)
    print(f"cover: {args.frame} + {lines} -> {args.out}")


if __name__ == "__main__":
    main()
