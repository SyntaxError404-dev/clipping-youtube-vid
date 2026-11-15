import { spawn, execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildClip } from "./clipBuilder.js";
import { generateCopy, scoutMoments, humanizeCopy, keywordsFromText, type ClipCopy, type ScoutMoment } from "./deepchat.js";
import { nextSlots } from "./posting.js";

export interface JobOptions {
  clips: number; // how many clips to cut (1-5)
  style: "bounce" | "hype" | "clean"; // caption style, chosen in the UI
}

export interface JobState {
  id: string;
  url: string;
  status: "queued" | "running" | "done" | "error";
  step: string;
  pct: number;
  message: string;
  createdAt: string;
  options: JobOptions;
  videoTitle?: string;
  videoDuration?: number;
  error?: string;
  /** Live process feed: what Clipi is doing right now, timestamped. */
  events?: { t: string; text: string }[];
  results?: JobResults;
}

export interface JobResults {
  clips: {
    index: number;
    start: number;
    end: number;
    duration: number;
    video: string; // /files/<id>/clips/clip-N.mp4
    thumbnail: string;
    /** AI-enhanced cover image (image-to-image + title), falls back to the thumbnail. */
    cover: string;
    category?: string;
    reason?: string;
    postSlot?: string;
    copy: ClipCopy;
  }[];
  summary: string;
  copySource: "deepchat-scout" | "deepchat" | "local-fallback";
  copyNote?: string;
}

const ROOT = path.resolve(import.meta.dirname, "..");
export const DATA_DIR = path.resolve(ROOT, "..", "data", "jobs");
const WORKER = path.join(ROOT, "worker");
/** Jobs currently executing in this process (guards against double runs). */
const ACTIVE = new Set<string>();
const ASSETS = path.join(ROOT, "assets");
const SOUND_MAP: Record<string, string> = JSON.parse(
  fs.readFileSync(path.join(ASSETS, "sound-map.json"), "utf-8")
);
const FONT = path.join(ASSETS, "fonts", "Inter-Black.otf");

function sound(slot: string): string {
  return path.join(ASSETS, "sounds-kenyset", SOUND_MAP[slot]);
}

function findYtDlp(): string | null {
  const cands = [
    path.join(ROOT, "tools", "venv", "bin", "yt-dlp"),
    path.join(os.homedir(), "workspace", "clips", "tools", "venv-dl", "bin", "yt-dlp"),
    "yt-dlp",
  ];
  for (const c of cands) if (c.includes("/") ? fs.existsSync(c) : true) return c;
  return null;
}

function findWhisperPython(): string {
  const cands = [
    path.join(ROOT, "tools", "venv", "bin", "python"),
    path.join(os.homedir(), ".faceless-shorts", "venv", "bin", "python"),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return "python3";
}

function sh(cmd: string, args: string[], log: fs.WriteStream, opts: { cwd?: string } = {}): Promise<{ stdout: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; log.write(d); });
    p.stderr.on("data", (d) => log.write(d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve({ stdout: out }) : reject(new Error(`${cmd} ${args[0]} exited ${code}`))));
  });
}

async function withRetry<T>(fn: () => Promise<T>, tries = 2, label = "step"): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 5000 * (i + 1)));
    }
  }
  throw new Error(`${label} failed after ${tries} tries: ${(last as Error).message}`);
}

function jobDir(id: string) {
  return path.join(DATA_DIR, id);
}

export function loadJob(id: string): JobState | null {
  const f = path.join(jobDir(id), "job.json");
  if (!fs.existsSync(f)) return null;
  return JSON.parse(fs.readFileSync(f, "utf-8"));
}

export function saveJob(j: JobState) {
  fs.mkdirSync(jobDir(j.id), { recursive: true });
  fs.writeFileSync(path.join(jobDir(j.id), "job.json"), JSON.stringify(j, null, 2));
}

function parseVtt(vtt: string): { start: number; end: number; text: string; words: { w: string; start: number; end: number }[] }[] {
  const segs: { start: number; end: number; text: string; words: { w: string; start: number; end: number }[] }[] = [];
  const toSec = (s: string) => {
    const [h, m, rest] = s.split(":");
    const [sec, ms] = rest.split(".");
    return +h * 3600 + +m * 60 + +sec + (+ms || 0) / 1000;
  };
  const blocks = vtt.split(/\n\s*\n/);
  for (const b of blocks) {
    const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
    const tline = lines.find((l) => l.includes("-->"));
    if (!tline) continue;
    const [a, c] = tline.split("-->").map((x) => x.trim().split(" ")[0]);
    const text = lines.filter((l) => l !== tline && !/^\d+$/.test(l))
      .join(" ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim();
    if (!text) continue;
    const start = toSec(a), end = toSec(c);
    const words = text.split(/\s+/);
    const per = (end - start) / Math.max(words.length, 1);
    segs.push({
      start, end, text,
      words: words.map((w, i) => ({ w, start: start + i * per, end: start + (i + 1) * per })),
    });
  }
  // merge overlapping/duplicate caption lines
  return segs.filter((s, i) => i === 0 || s.start >= segs[i - 1].end - 0.1);
}

export async function runJob(id: string, url: string, options: JobOptions): Promise<void> {
  // One run per job at a time — a restart must not start a duplicate.
  if (ACTIVE.has(id)) return;
  ACTIVE.add(id);
  const dir = jobDir(id);
  fs.mkdirSync(path.join(dir, "source"), { recursive: true });
  fs.mkdirSync(path.join(dir, "analysis"), { recursive: true });
  fs.mkdirSync(path.join(dir, "clips"), { recursive: true });
  const log = fs.createWriteStream(path.join(dir, "job.log"), { flags: "a" });
  const job = loadJob(id)!;
  const set = (step: string, pct: number, message: string) => {
    job.step = step; job.pct = pct; job.message = message; job.status = "running";
    saveJob(job);
  };
  /** Live feed event — what Clipi is doing, so the page feels alive. */
  const ev = (text: string) => {
    if (!job.events) job.events = [];
    job.events.push({ t: new Date().toISOString(), text });
    saveJob(job);
  };
  if ((job.events?.length ?? 0) > 1) ev("Clipi restarted — picking this job back up where it stopped.");
  /** Is a media file actually finished (not a partial write from a killed run)? */
  async function mediaComplete(file: string, expectedSec?: number): Promise<boolean> {
    if (!fs.existsSync(file) || fs.statSync(file).size < 10_000) return false;
    try {
      const { stdout } = await sh("ffprobe", ["-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", file], log);
      const dur = parseFloat(stdout.trim());
      if (expectedSec !== undefined) return !Number.isNaN(dur) && Math.abs(dur - expectedSec) < 1.5;
      return !Number.isNaN(dur);
    } catch {
      return false;
    }
  }

  try {
    const ytdlp = findYtDlp();
    if (!ytdlp) throw new Error("yt-dlp not found. Run ./setup.sh first.");
    const src = path.join(dir, "source", "source.mp4");
    const srcExists = fs.existsSync(src) && fs.statSync(src).size > 1_000_000;

    // 1. metadata + download (skipped on resume when the file is already here)
    if (!job.videoTitle || !job.videoDuration) {
      set("download", 5, "Reading video info…");
      const meta = await sh(ytdlp, ["--no-playlist", "--js-runtimes", "node", "--print", "%(title)s|||%(duration)s", url], log);
      const [title, durStr] = meta.stdout.trim().split("|||");
      job.videoTitle = title || url;
      job.videoDuration = parseFloat(durStr) || 0;
      saveJob(job);
    }
    if (!srcExists) {
      ev(`Found "${job.videoTitle}" — ${Math.round((job.videoDuration || 0) / 60)} minutes long.`);
      set("download", 10, `Downloading "${job.videoTitle}" (${Math.round((job.videoDuration || 0) / 60)} min)…`);
      await withRetry(() => sh(ytdlp, ["--no-playlist", "--js-runtimes", "node", "--retries", "3",
        "-f", "bv*[height<=1080]+ba/b",
        "--merge-output-format", "mp4", "-o", path.join(dir, "source", "source.mp4"), url], log), 2, "download");
      if (!fs.existsSync(src)) throw new Error("Download produced no file.");
      ev("Download finished — the video is on this machine now.");
    } else {
      ev(`"${job.videoTitle}" is already downloaded — picking up where I left off.`);
    }

    // 2. audio
    const wavPath = path.join(dir, "source", "audio.wav");
    if (!fs.existsSync(wavPath)) {
      set("audio", 25, "Extracting audio…");
      await sh("ffmpeg", ["-y", "-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", wavPath], log);
      ev("Audio pulled out — now for the words.");
    } else {
      ev("Audio already extracted — moving on.");
    }

    // 3. transcript — fast path: YouTube auto-captions; fallback: local Whisper.
    //    On resume, a finished transcript.json is reused as-is.
    set("transcribe", 30, "Getting the transcript…");
    let transcript: { segments: unknown[]; duration: number } | null = null;
    const transcriptPath = path.join(dir, "analysis", "transcript.json");
    if (fs.existsSync(transcriptPath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(transcriptPath, "utf-8"));
        if (Array.isArray(saved.segments) && typeof saved.duration === "number") {
          transcript = saved;
          ev(`Transcript already done (${saved.segments.length} lines) — reusing it.`);
        }
      } catch { /* fall through and redo it */ }
    }
    if (!transcript) {
    try {
      await sh(ytdlp, ["--no-playlist", "--js-runtimes", "node", "--write-auto-subs", "--sub-lang", "en",
        "--sub-format", "vtt", "--skip-download", "-o", path.join(dir, "source", "subs"), url], log);
      const vttPath = path.join(dir, "source", "subs.en.vtt");
      if (fs.existsSync(vttPath)) {
        const segs = parseVtt(fs.readFileSync(vttPath, "utf-8"));
        if (segs.length > 20) {
          transcript = { segments: segs, duration: job.videoDuration };
          ev(`Found YouTube's own captions (${segs.length} lines) — no listening needed.`);
        }
      }
    } catch { /* fall through to Whisper */ }
    }
    if (!transcript) {
      const eta = job.videoDuration ? ` (about ${Math.max(1, Math.ceil(job.videoDuration / 2 / 60))} min on this machine — it runs in the background)` : "";
      set("transcribe", 32, `No auto-captions found — transcribing locally with Whisper${eta}`);
      ev("No captions on YouTube, so Clipi is listening to the audio itself…");
      const py = findWhisperPython();
      const wav = path.join(dir, "source", "audio.wav");
      const outJson = path.join(dir, "analysis", "transcript.json");
      const dur = job.videoDuration || 0;
      if (dur > 1800) {
        // Long video: transcribe in 20-min chunks so memory stays bounded
        // and progress is visible. Offsets are added back when merging.
        const CHUNK = 1200;
        const n = Math.ceil(dur / CHUNK);
        const allSegs: unknown[] = [];
        for (let i = 0; i < n; i++) {
          const off = i * CHUNK;
          const len = Math.min(CHUNK, dur - off);
          const chunkWav = path.join(dir, "source", `audio-chunk-${i}.wav`);
          const chunkJson = path.join(dir, "analysis", `transcript-chunk-${i}.json`);
          set("transcribe", 32 + Math.round((i / n) * 20), `Transcribing chunk ${i + 1} of ${n} (Whisper, local)…`);
          ev(`Listening to part ${i + 1} of ${n}…`);
          await sh("ffmpeg", ["-y", "-v", "error", "-ss", String(off), "-t", String(len), "-i", wav, chunkWav], log);
          await withRetry(() => sh(py, [path.join(WORKER, "transcribe.py"), chunkWav, chunkJson], log, { cwd: dir }), 2, `transcribe chunk ${i + 1}`);
          const cj = JSON.parse(fs.readFileSync(chunkJson, "utf-8")) as { segments: { start: number; end: number; words?: { w: string; start: number; end: number }[] }[] };
          for (const s of cj.segments) {
            s.start += off; s.end += off;
            if (s.words) for (const w of s.words) { w.start += off; w.end += off; }
            allSegs.push(s);
          }
          fs.rmSync(chunkWav, { force: true });
        }
        fs.writeFileSync(outJson, JSON.stringify({ segments: allSegs, duration: dur }, null, 2));
      } else {
        await withRetry(() => sh(py, [path.join(WORKER, "transcribe.py"), wav, outJson], log, { cwd: dir }), 2, "transcribe");
      }
      transcript = JSON.parse(fs.readFileSync(outJson, "utf-8"));
    } else {
      fs.writeFileSync(path.join(dir, "analysis", "transcript.json"), JSON.stringify(transcript, null, 2));
    }
    if (!transcript) throw new Error("Transcript missing after transcription.");
    const segs = (transcript.segments as { start: number; end: number; text: string }[]);
    const fullText = segs.map((s) => s.text).join(" ");
    const wordCount = fullText.trim() ? fullText.trim().split(/\s+/).length : 0;
    ev(`Transcript ready — ${segs.length} lines, about ${wordCount.toLocaleString()} words.`);
    const keywords = keywordsFromText(fullText, 12);
    const summary = segs.length
      ? `A ${Math.round(job.videoDuration / 60)}-minute video. It opens with: "${segs[0].text}" and covers: ${segs.slice(0, 12).map((s) => s.text).join(" ").slice(0, 500)}`
      : "A music / visuals-driven video with no spoken words. Moments were picked from loudness and scene changes.";

    // 4. score moments (heuristic: loudness + scene cuts + keywords).
    //    On resume, a finished moments.json is reused as-is.
    set("moments", 55, "Finding the best moments…");
    const momentsPath = path.join(dir, "analysis", "moments.json");
    let scored: {
      start: number; end: number; score: number; hook: string; excerpt: string; peak_second: number;
      segments: { start: number; end: number; text: string }[];
    }[];
    if (fs.existsSync(momentsPath)) {
      try {
        scored = JSON.parse(fs.readFileSync(momentsPath, "utf-8")).moments;
        if (!Array.isArray(scored) || scored.length === 0) throw new Error("empty");
        ev(`Moments already ranked (${scored.length} candidates) — reusing them.`);
      } catch {
        scored = await scoreMoments();
      }
    } else {
      scored = await scoreMoments();
    }
    async function scoreMoments() {
      await sh("python3", [path.join(WORKER, "score.py"), "--job-dir", dir, "--count", String(options.clips)], log);
      return JSON.parse(fs.readFileSync(momentsPath, "utf-8")).moments as typeof scored;
    }
    if (scored.length === 0) throw new Error("No moments found in this video.");
    ev(`Found ${scored.length} loud, sharp moments — ranking them now.`);

    // 5. AI scout (PeakCut brain via DeepChat): reads the transcript + LOUD
    //    marks and picks the clips with hook/title/hashtags/reason. One AI
    //    call per job. Falls back to the heuristic moments when it fails.
    set("moments", 62, "Letting the AI scout the best moments…");
    type Moment = {
      start: number; end: number; score: number; hook: string; excerpt: string; peak_second: number;
      segments: { start: number; end: number; text: string }[];
      scout?: ScoutMoment;
    };
    let moments: Moment[] = scored;
    let scoutUsed = false;
    if (segs.length > 10) {
      let loudSet = new Set<number>();
      try {
        const rmsData = JSON.parse(fs.readFileSync(path.join(dir, "analysis", "rms.json"), "utf-8")) as { mean: number; per_second: number[] };
        rmsData.per_second.forEach((v, s) => { if (v > rmsData.mean * 1.8) loudSet.add(s); });
      } catch { /* loud marks are optional */ }
      const lines = segs.map((s) => ({ s: s.start, text: s.text, loud: loudSet.has(Math.round(s.start)) }));
      const scout = await scoutMoments(job.videoTitle, lines, job.videoDuration, options.clips);
      if (scout.length > 0) {
        moments = scout.map((m) => {
          const peak = scored.reduce((best, c) => (Math.abs(c.start - m.start) < Math.abs(best.start - m.start) ? c : best), scored[0]);
          const wsegs = segs.filter((s) => s.start >= m.start && s.start < m.end);
          return {
            start: m.start, end: m.end, score: m.score, hook: m.hook,
            excerpt: m.description || wsegs.map((s) => s.text).join(" ").slice(0, 300),
            peak_second: peak?.peak_second ?? Math.round((m.start + m.end) / 2),
            segments: wsegs, scout: m,
          };
        });
        scoutUsed = true;
        ev(`Clipi AI picked ${moments.length} clips: ${moments.map((m) => `"${m.scout?.title || m.hook}"`).join(", ")}.`);
      } else {
        ev("The AI scout was quiet — using the loudest moments instead.");
      }
    }

    // 6. Copy: the scout already wrote title/description/hashtags per clip.
    //    If it didn't run, one generateCopy call does the same job.
    set("captions", 70, "Writing titles, captions and hashtags…");
    ev("Writing titles, captions and hashtags for every clip…");
    const slots = nextSlots(moments.length);
    let copy: ClipCopy[];
    let copySource: JobResults["copySource"];
    let copyNote: string | undefined;
    if (scoutUsed) {
      copySource = "deepchat-scout";
      copy = moments.map((m, i) => {
        const s = m.scout!;
        const tags = s.hashtags.map((h) => "#" + h);
        return {
          title: s.title || s.hook,
          shortCaption: s.shortCaption || s.description,
          youtubeCaption: `${s.description}\n\nClip from "${job.videoTitle}". Watch the full video for the whole story.`,
          instagramCaption: `${s.description}\n\nFollow for more clips like this.`,
          hashtagsYoutube: [...tags, "#shorts", "#viral"].slice(0, 12),
          hashtagsInstagram: [...tags, "#reels", "#fyp"].slice(0, 12),
          bestPostTime: slots[i]?.time || "7:00 PM",
          bestDay: slots[i]?.day || "Saturday",
          hookText: s.hook,
        };
      });
    } else {
      const clipInputs = moments.map((m, i) => ({ index: i, start: m.start, end: m.end, hook: m.hook, excerpt: m.excerpt }));
      const gen = await generateCopy(job.videoTitle, summary, clipInputs, keywords);
      copy = gen.copy;
      copySource = gen.source === "deepchat" ? "deepchat" : "local-fallback";
      copyNote = gen.note;
      copy.forEach((c, i) => { c.bestPostTime = slots[i]?.time || c.bestPostTime; c.bestDay = slots[i]?.day || c.bestDay; });
    }
    // Polish template-written captions so they read human (only when the
    // copy came from the local fallback — scout/AI copy is already human).
    if (copySource === "local-fallback") {
      try {
        const joined = copy.map((c) => c.youtubeCaption).join("\n---\n");
        const polished = await humanizeCopy(joined);
        const parts = polished.split("---").map((s) => s.trim()).filter(Boolean);
        if (parts.length === copy.length) parts.forEach((p, i) => { copy[i].youtubeCaption = p; });
      } catch { /* keep the originals */ }
    }
    ev(`Captions ready — posting times picked for each clip (${slots.map((s) => s.label).join(", ")}).`);

    // 7. build clips (PeakCut ASS captions + SFX + loudnorm)
    const allWords: { w: string; s: number; e: number }[] = [];
    for (const s of segs as { words?: { w: string; start: number; end: number }[] }[]) {
      if (s.words) for (const w of s.words) allWords.push({ w: w.w, s: w.start, e: w.end });
    }
    const results: JobResults["clips"] = [];
    for (let i = 0; i < moments.length; i++) {
      const m = moments[i];
      set("render", 75 + Math.round((i / moments.length) * 20), `Cutting clip ${i + 1} of ${moments.length}…`);
      const outName = `clip-${i + 1}.mp4`;
      const clipsDir = path.join(dir, "clips");
      const clipPath = path.join(clipsDir, outName);
      if (await mediaComplete(clipPath, m.end - m.start)) {
        ev(`Clip ${i + 1} of ${moments.length} already rendered — reusing it.`);
      } else {
        ev(`Cutting clip ${i + 1} of ${moments.length} — "${copy[i]?.title || m.hook}" (${m.start}s–${m.end}s).`);
        await buildClip({
          source: src, start: m.start, end: m.end,
          words: allWords.filter((w) => w.s >= m.start - 0.05 && w.s < m.end),
          hook: copy[i]?.hookText || m.hook || "WATCH THIS",
          highlightWords: m.scout?.highlightWords || [],
          style: options.style || "bounce",
          sounds: {
            sting: sound("curious-sting-01"), whoosh: sound("whoosh-02"), pop: sound("pop-01"),
            riser: sound("riser-01"), success: sound("success-01"),
          },
          fontsDir: path.join(ASSETS, "fonts"),
          workDir: clipsDir,
          out: outName,
        }, log);
      }
      // 8. thumbnail from the most interesting frame + AI title
      const thumb = path.join(dir, "clips", `clip-${i + 1}-thumb.jpg`);
      const framePath = path.join(dir, "clips", `clip-${i + 1}-frame.jpg`);
      if (await mediaComplete(thumb)) {
        ev(`Thumbnail for clip ${i + 1} already made — reusing it.`);
      } else {
        set("thumbnail", 92, `Making thumbnail ${i + 1} of ${moments.length}…`);
        ev(`Making the thumbnail for clip ${i + 1} — brightest frame, title on top.`);
        await sh("python3", [path.join(WORKER, "thumbnail.py"), "--source", src,
          "--peak", String(m.peak_second), "--start", String(m.start), "--end", String(m.end),
          "--title", copy[i]?.title || "WATCH THIS", "--out", thumb, "--font", FONT,
          "--frame-out", framePath], log);
      }
      // 9. AI cover: the best frame, professionally colour-graded (vivid,
      //    sharp, warm, vignette) with the AI title on top. The grade is
      //    done locally on the real frame on purpose: DeepChat's
      //    image-to-image was tested twice and invents a brand-new picture
      //    instead of enhancing the frame (people who aren't in the video),
      //    so it must never touch a thumbnail.
      const coverPath = path.join(dir, "clips", `clip-${i + 1}-cover.jpg`);
      let cover = `/files/${id}/clips/clip-${i + 1}-thumb.jpg`;
      if (await mediaComplete(coverPath)) {
        cover = `/files/${id}/clips/clip-${i + 1}-cover.jpg`;
      } else {
        set("thumbnail", 94, `Making the AI cover for clip ${i + 1} of ${moments.length}…`);
        ev(`Making the cover for clip ${i + 1} — grading the frame, title on top.`);
        if (fs.existsSync(framePath)) {
          await sh("python3", [path.join(WORKER, "cover.py"), "--frame", framePath,
            "--title", copy[i]?.title || "WATCH THIS", "--out", coverPath, "--font", FONT], log);
          cover = `/files/${id}/clips/clip-${i + 1}-cover.jpg`;
          ev(`Cover ready for clip ${i + 1}.`);
        } else {
          fs.copyFileSync(thumb, coverPath);
          cover = `/files/${id}/clips/clip-${i + 1}-cover.jpg`;
        }
      }
      results.push({
        index: i + 1, start: m.start, end: m.end, duration: +(m.end - m.start).toFixed(1),
        video: `/files/${id}/clips/clip-${i + 1}.mp4`,
        thumbnail: `/files/${id}/clips/clip-${i + 1}-thumb.jpg`,
        cover,
        category: m.scout?.category,
        reason: m.scout?.reason,
        postSlot: slots[i]?.label,
        copy: copy[i],
      });
    }

    job.status = "done"; job.step = "done"; job.pct = 100;
    job.message = `Done — ${results.length} clips ready.`;
    job.results = { clips: results, summary, copySource, copyNote };
    ev(`All ${results.length} clips are ready — enjoy, they are yours.`);
    saveJob(job);
  } catch (e) {
    job.status = "error"; job.error = (e as Error).message; job.message = `Failed: ${(e as Error).message}`;
    ev(`Stopped here: ${(e as Error).message.slice(0, 120)}`);
    saveJob(job);
    log.write(`\nERROR: ${(e as Error).stack}\n`);
  } finally {
    ACTIVE.delete(id);
    log.end();
  }
}
