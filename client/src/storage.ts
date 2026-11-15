import type { CachedJob, ChatMsg, Job, Settings } from "./types";

const SETTINGS_KEY = "clipstudio:settings";
const JOBS_KEY = "clipstudio:jobs-cache";
const agentKey = (jobId: string | null) => `clipstudio:agent:${jobId ?? "global"}`;

export const DEFAULT_SETTINGS: Settings = { clips: 3, style: "bounce" };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — the app still works, it just won't persist
  }
}

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    clips: typeof s.clips === "number" && s.clips >= 1 && s.clips <= 5 ? s.clips : DEFAULT_SETTINGS.clips,
    style:
      s.style === "bounce" || s.style === "hype" || s.style === "clean" ? s.style : DEFAULT_SETTINGS.style,
  };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

export function toCachedJob(j: Job): CachedJob {
  const clips = j.results?.clips ?? [];
  return {
    id: j.id,
    url: j.url,
    videoTitle: j.videoTitle,
    status: j.status,
    createdAt: j.createdAt,
    videoDuration: j.videoDuration,
    clipCount: clips.length,
    clipSeconds: clips.reduce((sum, c) => sum + (c.duration || 0), 0),
  };
}

export function loadJobsCache(): CachedJob[] {
  const list = read<CachedJob[]>(JOBS_KEY, []);
  return Array.isArray(list) ? list : [];
}

/** The server is the source of truth: rebuild the cache from its jobs, so
 * deleted jobs disappear and stats are always accurate. On a failed fetch
 * the caller keeps the old cache untouched. */
export function mergeJobsCache(serverJobs: Job[]): CachedJob[] {
  const merged = serverJobs.map(toCachedJob).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 20);
  write(JOBS_KEY, merged);
  return merged;
}

export function saveJobsCache(jobs: Job[]): CachedJob[] {
  return mergeJobsCache(jobs);
}

export function loadAgentHistory(jobId: string | null): ChatMsg[] {
  const list = read<ChatMsg[]>(agentKey(jobId), []);
  return Array.isArray(list) ? list.filter((m) => m && (m.role === "user" || m.role === "assistant")) : [];
}

export function saveAgentHistory(jobId: string | null, history: ChatMsg[]): void {
  write(agentKey(jobId), history.slice(-60));
}

export const AGENT_GREETING: string =
  "Hi, I'm Clipi. Paste a video and I'll cut it into Shorts — or ask me why I picked a moment, " +
  "rewrite a caption, or cut an extra clip from any timestamp.";
