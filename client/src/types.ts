export interface ClipCopy {
  title: string;
  /** One punchy line that sells the clip in the feed (max ~120 chars). */
  shortCaption: string;
  youtubeCaption: string;
  instagramCaption: string;
  hashtagsYoutube: string[];
  hashtagsInstagram: string[];
  bestPostTime: string;
  bestDay: string;
  hookText: string;
}

export interface ClipResult {
  index: number;
  start: number;
  end: number;
  duration: number;
  video: string;
  thumbnail: string;
  /** 1080x1920 cover: real best frame, colour-graded, AI title on top. */
  cover: string;
  category?: string;
  reason?: string;
  postSlot?: string;
  copy: ClipCopy;
}

export interface JobResults {
  clips: ClipResult[];
  summary: string;
  copySource: "deepchat-scout" | "deepchat" | "local-fallback";
  copyNote?: string;
}

export type JobStatus = "queued" | "running" | "done" | "error";

export interface JobEvent {
  /** ISO timestamp */
  t: string;
  text: string;
}

export interface Job {
  id: string;
  url: string;
  status: JobStatus;
  step: string;
  pct: number;
  message: string;
  createdAt: string;
  videoTitle?: string;
  videoDuration?: number;
  error?: string;
  events?: JobEvent[];
  results?: JobResults;
}

/** Light fields kept in localStorage so the dashboard survives a reload. */
export interface CachedJob {
  id: string;
  url: string;
  videoTitle?: string;
  status: JobStatus;
  createdAt: string;
  videoDuration?: number;
  clipCount: number;
  clipSeconds: number;
}

export interface Settings {
  clips: number;
  style: "bounce" | "hype" | "clean";
}

export interface ChatMsg {
  role: "user" | "assistant";
  content: string;
  actions?: AgentAction[];
}

export interface AgentAction {
  type: "rewrite_copy" | "extra_clip" | "retitle";
  clipIndex?: number;
  start?: number;
  end?: number;
  title?: string;
  style?: string;
  label: string;
}

export const STEPS = [
  "download",
  "audio",
  "transcribe",
  "moments",
  "captions",
  "render",
  "thumbnail",
  "done",
] as const;

export const STEP_LABELS: Record<string, string> = {
  download: "Download",
  audio: "Audio",
  transcribe: "Transcribe",
  moments: "Find moments",
  captions: "Captions & AI",
  render: "Cut clips",
  thumbnail: "Thumbnails",
  done: "Done",
};

export const CATEGORY_COLORS: Record<string, string> = {
  funny: "#ffb3a7",
  fail: "#ff8a7a",
  clutch: "#c9b8ff",
  rage: "#ff9a8b",
  shock: "#e3c8ff",
  take: "#a8c8ff",
  story: "#9fd8e8",
  other: "#b9a8cc",
};
