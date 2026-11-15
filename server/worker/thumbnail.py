#!/usr/bin/env python3
"""Build a 1080x1920 thumbnail from the most interesting frame of a clip.

Picks the brightest non-black frame among samples around --peak (the
loudest / highest-scored second), then composes it full-frame over a blurred
background and burns the title on it (up to 2 lines, Inter-Black).
"""
import argparse, subprocess, sys
from PIL import Image


def mean_lum(path):
    im = Image.open(path).convert("L").resize((160, 90))
    px = list(im.getdata())
    return sum(px) / len(px)


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
    ap.add_argument("--source", required=True)
    ap.add_argument("--peak", type=float, required=True)
    ap.add_argument("--start", type=float, required=True)
    ap.add_argument("--end", type=float, required=True)
    ap.add_argument("--title", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--font", default="")
    ap.add_argument("--frame-out", default="",
                    help="also save the raw best frame (no title) for AI cover enhancement")
    args = ap.parse_args()

    font = args.font or "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    # sample 5 frames around the peak, keep the brightest one that isn't black
    best_t, best_lum = args.peak, -1
    best_sample = "/tmp/thumb-sample-0.jpg"
    for dt in (-2, -1, 0, 1, 2):
        t = min(max(args.start + 0.5, args.peak + dt), args.end - 0.2)
        tmp = f"/tmp/thumb-sample-{dt}.jpg"
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", args.source,
                        "-frames:v", "1", "-q:v", "3", tmp], check=True)
        lum = mean_lum(tmp)
        if lum > best_lum and lum > 12:
            best_lum, best_t, best_sample = lum, t, tmp
    if best_lum < 0:  # every sample black: fall back to clip middle
        best_t = (args.start + args.end) / 2
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(best_t), "-i", args.source,
                        "-frames:v", "1", "-q:v", "3", "/tmp/thumb-sample-0.jpg"], check=True)
        best_sample = "/tmp/thumb-sample-0.jpg"
    if args.frame_out:
        import shutil
        shutil.copy(best_sample, args.frame_out)

    lines = split_title(args.title)
    size = 110 if len(lines) == 1 else 88
    y0 = 1500 if len(lines) == 1 else 1440
    # Titles go through text files, never inline text='...' — apostrophes,
    # colons and other punctuation in AI titles would break filter parsing.
    import os, tempfile
    tmpdir = tempfile.mkdtemp(prefix="thumb-")
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
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(best_t), "-i", args.source,
                    "-filter_complex", filt, "-map", "[v]", "-frames:v", "1",
                    "-q:v", "2", args.out], check=True)
    print(f"thumbnail: frame @{best_t:.1f}s (lum {best_lum:.0f}), title lines={lines} -> {args.out}")


if __name__ == "__main__":
    main()
