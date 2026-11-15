#!/usr/bin/env python3
"""Score moments in a long video and pick the best non-overlapping windows.

Inputs (in --job-dir):
  source/source.mp4, source/audio.wav (16kHz mono), analysis/transcript.json
Output: analysis/moments.json
  [{start, end, score, hook, excerpt, peak_second, segments: [{start,end,text}]}]

Scoring (same recipe as the long-to-short-clips skill):
  - per-second RMS loudness (numpy + stdlib wave, no scipy needed)
  - scene-cut density (ffmpeg select scene=0.35)
  - transcript keyword hits (curiosity / surprise / stakes words)
  - a window whose best seconds are black/silent loses points (brightness
    check happens later in thumbnail.py; here we drop windows with RMS ~ 0)
Windows are 25-50s, snapped to the nearest scene cut, non-overlapping.
"""
import argparse, json, os, re, subprocess, sys, wave
import numpy as np

KEYWORDS = {
    "secret": 3, "never": 3, "first time": 3, "biggest": 3, "nobody": 3,
    "warning": 3, "stop": 2, "free": 2, "exactly": 2, "finally": 2,
    "everyone": 2, "nobody knows": 3, "busted": 3, "myth": 2, "rumor": 2,
    "official": 2, "money": 2, "million": 2, "billion": 2, "hours": 1,
    "how": 1, "why": 2, "what": 1, "wrong": 2, "mistake": 2, "hidden": 2,
    "change": 1, "new": 1, "best": 2, "worst": 2, "insane": 2, "crazy": 2,
    "oh my god": 3, "wait": 2, "look": 1, "imagine": 2, "actually": 1,
}
STOPWORDS = set("the a an and or of to in on for with is are was were it its this that you your he she they we i me my his her their our as at by from".split())


def load_wav_rms(path):
    with wave.open(path, "rb") as w:
        n = w.getnframes(); sr = w.getframerate(); ch = w.getnchannels()
        raw = w.readframes(n)
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        audio = audio.reshape(-1, ch).mean(axis=1)
    secs = int(len(audio) // sr)
    rms = np.array([np.sqrt(np.mean(audio[i*sr:(i+1)*sr]**2)) if (i+1)*sr <= len(audio) else 0.0
                    for i in range(secs)])
    return rms, secs


def scene_cuts(video, duration):
    out = subprocess.run(
        ["ffmpeg", "-v", "info", "-i", video, "-vf", "select='gt(scene,0.35)',showinfo",
         "-f", "null", "-"],
        capture_output=True, text=True).stderr
    cuts = [float(m) for m in re.findall(r"pts_time:([0-9.]+)", out)]
    return sorted(set([0.0] + [c for c in cuts if c < duration]))


def kw_score(text):
    t = " " + text.lower() + " "
    return sum(w for k, w in KEYWORDS.items() if k in t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--job-dir", required=True)
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--min-len", type=float, default=25)
    ap.add_argument("--max-len", type=float, default=50)
    args = ap.parse_args()

    jd = args.job_dir
    video = os.path.join(jd, "source", "source.mp4")
    audio = os.path.join(jd, "source", "audio.wav")
    tpath = os.path.join(jd, "analysis", "transcript.json")
    transcript = json.load(open(tpath)) if os.path.exists(tpath) else {"segments": [], "duration": 0}
    duration = float(transcript.get("duration") or 0)
    if not duration:
        probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                "-of", "csv=p=0", video], capture_output=True, text=True)
        duration = float(probe.stdout.strip())
    segs = transcript.get("segments", [])

    rms, nsec = load_wav_rms(audio) if os.path.exists(audio) else (np.zeros(int(duration)), int(duration))
    rms_mean = float(rms.mean()) if len(rms) else 0.0
    json.dump({"mean": rms_mean, "per_second": [round(float(x), 5) for x in rms]},
              open(os.path.join(jd, "analysis", "rms.json"), "w"))
    cuts = scene_cuts(video, duration)

    def snap(t):
        # nearest scene cut within 2s, else t
        near = [c for c in cuts if abs(c - t) <= 2.0]
        return min(near, key=lambda c: abs(c - t)) if near else t

    # candidate windows: start every 5s, target length 35s
    cands = []
    t = 0.0
    while t + args.min_len <= duration:
        end = min(t + 35.0, duration)
        if end - t < args.min_len:
            break
        win_rms = rms[int(t):int(end)]
        rms_s = float(win_rms.mean()) / (rms_mean + 1e-6) if len(win_rms) else 0
        ncuts = sum(1 for c in cuts if t <= c < end)
        cut_s = ncuts / max((end - t) / 10.0, 1)
        wsegs = [s for s in segs if s["start"] >= t and s["start"] < end]
        kw = sum(kw_score(s["text"]) for s in wsegs) / max(len(wsegs), 1)
        # speech density: prefer windows that actually have words
        speech = len(wsegs) / max((end - t) / 5.0, 1)
        score = 0.35 * min(rms_s, 2.0) + 0.25 * min(cut_s, 2.0) + 0.25 * min(kw, 5.0) + 0.15 * min(speech, 2.0)
        if len(wsegs) == 0 and rms_mean > 0.01:
            score *= 0.7  # silent stretch in a talking video
        cands.append({"start": t, "end": end, "score": round(score, 3),
                      "segments": wsegs, "peak": int(t + int(np.argmax(win_rms))) if len(win_rms) else int(t)})
        t += 5.0

    cands.sort(key=lambda c: -c["score"])
    picked = []
    for c in cands:
        if len(picked) >= args.count:
            break
        if any(not (c["end"] + 10 < p["start"] or c["start"] > p["end"] + 10) for p in picked):
            continue
        s, e = snap(c["start"]), snap(c["end"])
        if e - s < args.min_len:
            e = s + args.min_len
        if e > duration:
            e = duration; s = max(0.0, e - args.min_len)
        wsegs = [x for x in c["segments"] if x["start"] >= s and x["start"] < e]
        hook = wsegs[0]["text"] if wsegs else ""
        excerpt = " ".join(x["text"] for x in wsegs[:3])
        picked.append({"start": round(s, 2), "end": round(e, 2), "score": c["score"],
                       "hook": hook, "excerpt": excerpt,
                       "peak_second": c["peak"],
                       "segments": [{"start": x["start"], "end": x["end"], "text": x["text"]} for x in wsegs]})
    picked.sort(key=lambda p: p["start"])

    out = os.path.join(jd, "analysis", "moments.json")
    json.dump({"duration": duration, "moments": picked}, open(out, "w"), indent=2)
    print(f"picked {len(picked)} moments -> {out}")
    for p in picked:
        print(f"  {p['start']:7.1f}-{p['end']:7.1f} score {p['score']:.2f} hook: {p['hook'][:80]}")


if __name__ == "__main__":
    main()
