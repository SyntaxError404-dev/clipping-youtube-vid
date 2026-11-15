import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface Word {
  w: string;
  s: number; // absolute seconds in the source video
  e: number;
}

export interface ClipBuildOptions {
  source: string; // full-res source mp4
  start: number; // source seconds
  end: number; // source seconds
  words: Word[]; // word timestamps (absolute), for PeakCut-style ASS captions
  hook: string; // hook title shown in the white box, first 3s
  highlightWords: string[]; // punch words, coloured in the captions
  style?: "bounce" | "hype" | "clean";
  sounds: { sting: string; whoosh: string; pop: string; riser: string; success: string };
  fontsDir: string; // server/assets/fonts (Poppins + Anton + Inter)
  workDir: string; // job clips dir — .ass + fonts live here, ffmpeg runs here
  out: string; // file name inside workDir, e.g. clip-1.mp4
}

function run(cmd: string, args: string[], log: fs.WriteStream, cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    p.stdout.on("data", (d) => log.write(d));
    p.stderr.on("data", (d) => log.write(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/**
 * One vertical clip. Layout + captions are PeakCut's render.py, ported:
 * blurred-background full frame (source is HUD/text heavy), word-level
 * bouncy ASS captions with highlight words, hook title in a white box,
 * slow punch-in zoom, real SFX under the original narration, loudnorm
 * to -14 LUFS. 1080x1920, 30fps, H.264 CRF 20 +faststart.
 */
export async function buildClip(o: ClipBuildOptions, log: fs.WriteStream): Promise<void> {
  const dur = +(o.end - o.start).toFixed(2);
  const frames = Math.round(dur * 30);
  const base = path.basename(o.out, ".mp4");
  const assName = `${base}.ass`;
  const wordsName = `${base}.words.json`;

  // 1. word-level captions (.ass) — PeakCut build_ass port
  fs.mkdirSync(o.workDir, { recursive: true });
  fs.writeFileSync(path.join(o.workDir, wordsName), JSON.stringify(o.words));
  const fontsTarget = path.join(o.workDir, "fonts");
  fs.mkdirSync(fontsTarget, { recursive: true });
  for (const f of ["Poppins-ExtraBold.ttf", "Anton-Regular.ttf"]) {
    const src = path.join(o.fontsDir, f);
    if (fs.existsSync(src) && !fs.existsSync(path.join(fontsTarget, f))) {
      fs.copyFileSync(src, path.join(fontsTarget, f));
    }
  }
  await run("python3", [
    path.resolve(import.meta.dirname, "..", "worker", "build_ass.py"),
    "--words", wordsName,
    "--start", String(o.start), "--end", String(o.end),
    "--hook", o.hook,
    "--highlight", o.highlightWords.join(","),
    "--style", o.style || "bounce",
    "--fonts-dir", "fonts",
    "--out", assName,
  ], log, o.workDir);

  // 2. render: reframe + punch-in + ASS captions + SFX mix + loudnorm
  const vf =
    `[0:v]setpts=PTS-STARTPTS,split=2[bg][fg];` +
    `[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=28,eq=brightness=-0.08[bg2];` +
    `[fg]scale=1080:1920:force_original_aspect_ratio=decrease,scale=1296:730,` +
    `crop=w='1080+120*(1-n/${frames})':h='608+68*(1-n/${frames})':x='(in_w-out_w)/2':y='(in_h-out_h)/2',scale=1080:608[fg2];` +
    `[bg2][fg2]overlay=(W-w)/2:(H-h)/2,ass=${assName}:fontsdir=fonts,fps=30,format=yuv420p[v];` +
    `[0:a]atrim=0:${dur},asetpts=PTS-STARTPTS,volume=1.0[a0];` +
    `[1:a]adelay=0|0,asetpts=PTS-STARTPTS,volume=0.9[sting];` +
    `[2:a]adelay=0|0,asetpts=PTS-STARTPTS,volume=0.7[whoosh];` +
    `[3:a]adelay=500|500,asetpts=PTS-STARTPTS,volume=0.9[pop];` +
    `[4:a]atrim=0:2.0,asetpts=PTS-STARTPTS,adelay=${Math.round(Math.max(0, dur - 2.2) * 1000)}|${Math.round(Math.max(0, dur - 2.2) * 1000)},asetpts=PTS-STARTPTS,volume=0.5[riser];` +
    `[5:a]adelay=${Math.round(Math.max(0, dur - 2) * 1000)}|${Math.round(Math.max(0, dur - 2) * 1000)},asetpts=PTS-STARTPTS,volume=0.8[payoff];` +
    `[a0][sting][whoosh][pop][riser][payoff]amix=inputs=6:normalize=0[a];` +
    `[a]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`;

  const args = [
    "-y", "-v", "error",
    "-ss", String(o.start), "-t", String(dur), "-i", o.source,
    "-i", o.sounds.sting,
    "-i", o.sounds.whoosh,
    "-i", o.sounds.pop,
    "-i", o.sounds.riser,
    "-i", o.sounds.success,
    "-filter_complex", vf,
    "-map", "[v]", "-map", "[aout]",
    "-c:v", "libx264", "-crf", "20", "-preset", "veryfast",
    "-c:a", "aac", "-b:a", "160k",
    "-t", String(dur), "-movflags", "+faststart",
    o.out,
  ];
  await run("ffmpeg", args, log, o.workDir);
}
