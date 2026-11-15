import type { AgentAction, ChatMsg, Job } from "./types";

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts?.headers || {}) },
  });
  const j: unknown = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg =
      j && typeof j === "object" && "error" in j && typeof (j as { error: unknown }).error === "string"
        ? (j as { error: string }).error
        : `Request failed (HTTP ${r.status})`;
    throw new Error(msg);
  }
  return j as T;
}

export const apiHealth = () => api<{ ok: boolean; ffmpeg: boolean; sounds: boolean; name?: string }>("/api/health");

export const apiJobs = () => api<Job[]>("/api/jobs");

export const apiJob = (id: string) => api<Job>(`/api/jobs/${id}`);

export const apiCreateJob = (url: string, clips: number, style: string) =>
  api<{ id: string }>("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ url, clips, style }),
  });

export interface AgentResponse {
  reply: string;
  actions?: AgentAction[];
}

export const apiAgent = (jobId: string | null, message: string, history: ChatMsg[]) =>
  api<AgentResponse>("/api/agent", {
    method: "POST",
    body: JSON.stringify({
      jobId: jobId ?? undefined,
      message,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

export const apiRewrite = (jobId: string, clipIndex: number, style: string) =>
  api<{ ok: boolean; clip: unknown }>(`/api/jobs/${jobId}/rewrite`, {
    method: "POST",
    body: JSON.stringify({ clipIndex, style }),
  });

export const apiExtraClip = (jobId: string, start: number, end: number, title: string) =>
  api<{ ok: boolean; clip: unknown }>(`/api/jobs/${jobId}/extra-clip`, {
    method: "POST",
    body: JSON.stringify({ start, end, title }),
  });

export function isYouTubeUrl(raw: string): boolean {
  const u = raw.trim();
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//.test(u);
}

export function fmtClock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

export function fmtDuration(totalSeconds: number): string {
  const m = Math.round(totalSeconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
