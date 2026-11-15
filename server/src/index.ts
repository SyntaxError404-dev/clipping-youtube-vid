import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DATA_DIR, loadJob, saveJob, runJob, type JobState } from "./pipeline.js";
import { agentReply, rewriteClip, extraClip } from "./agent.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Serve rendered clips / thumbnails: /files/<jobId>/clips/clip-1.mp4
app.use("/files", (req, res, next) => {
  if (!/^\/[A-Za-z0-9-]+\//.test(req.path)) return res.status(400).end("bad path");
  next();
}, express.static(DATA_DIR));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "Clipi", ffmpeg: true, sounds: fs.existsSync(path.resolve(import.meta.dirname, "..", "assets", "sound-map.json")) });
});

app.get("/api/jobs", (_req, res) => {
  const ids = fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : [];
  const jobs = ids.map((id) => loadJob(id)).filter(Boolean)
    .sort((a, b) => (b!.createdAt < a!.createdAt ? -1 : 1)).slice(0, 20);
  res.json(jobs);
});

app.post("/api/jobs", (req, res) => {
  const { url, clips, style } = req.body as { url?: string; clips?: number; style?: string };
  if (!url || typeof url !== "string" || !/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    return res.status(400).json({ error: "Paste a YouTube video URL (youtube.com or youtu.be)." });
  }
  const id = randomUUID().slice(0, 8);
  const job: JobState = {
    id, url, status: "queued", step: "queued", pct: 0,
    message: "Queued…", createdAt: new Date().toISOString(),
    options: {
      clips: Math.min(5, Math.max(1, Number(clips) || 3)),
      style: style === "hype" || style === "clean" ? style : "bounce",
    },
    events: [{ t: new Date().toISOString(), text: "Clipi got your link — starting…" }],
  };
  saveJob(job);
  // run in background — the client polls GET /api/jobs/:id
  void runJob(id, url, job.options);
  res.status(201).json({ id });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = loadJob(req.params.id);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

// Inbuilt AI agent: chat + actions (rewrite, retitle, extra clip).
// No keys, no settings — DeepChat is integrated directly in the server.
app.post("/api/agent", async (req, res) => {
  const { jobId, message, history } = req.body as {
    jobId?: string; message?: string; history?: { role: "user" | "assistant"; content: string }[];
  };
  if (!message || typeof message !== "string") return res.status(400).json({ error: "message is required." });
  const out = await agentReply(jobId, message, Array.isArray(history) ? history : []);
  res.json(out);
});

app.post("/api/jobs/:id/rewrite", async (req, res) => {
  const { clipIndex, style } = req.body as { clipIndex?: number; style?: string };
  const out = await rewriteClip(req.params.id, Number(clipIndex), String(style || "better"));
  if (!out.ok) return res.status(400).json({ error: out.error });
  res.json(out);
});

app.post("/api/jobs/:id/extra-clip", async (req, res) => {
  const { start, end, title } = req.body as { start?: number; end?: number; title?: string };
  const out = await extraClip(req.params.id, Number(start), Number(end), String(title || "Extra clip"));
  if (!out.ok) return res.status(400).json({ error: out.error });
  res.json(out);
});

// In production, serve the built React client from client/dist
const clientDist = path.resolve(import.meta.dirname, "..", "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
}

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Clipi server on http://localhost:${PORT} (local only)`);
  // Resume jobs that were running when the server stopped (restart, crash):
  // runJob skips every step whose output is already on disk, so a resume
  // picks up where the job stopped instead of starting over.
  if (fs.existsSync(DATA_DIR)) {
    for (const id of fs.readdirSync(DATA_DIR)) {
      const j = loadJob(id);
      if (j && (j.status === "running" || j.status === "queued")) {
        console.log(`Resuming job ${id} (${j.videoTitle || j.url})`);
        void runJob(id, j.url, j.options);
      }
    }
  }
});
