/**
 * Captions + hashtags + posting guide, via the DeepChat AI client the user
 * supplied (server/lib/deepchat.mjs — a reverse-engineered client for the
 * DeepChat Android app's Supabase backend; anonymous sessions, free credits
 * via ad-reward claims, no API key needed). It works today but it is NOT an
 * official API: the service can rate-limit or break it at any time. So every
 * call has a local fallback that builds real copy from the transcript
 * (keywords + templates) — the site never dies because the AI is down.
 */

export interface ClipInput {
  index: number;
  start: number;
  end: number;
  hook: string;
  excerpt: string;
}

export interface ClipCopy {
  title: string;
  /** One punchy line that sells the clip in the feed — the Short caption. */
  shortCaption: string;
  youtubeCaption: string;
  instagramCaption: string;
  hashtagsYoutube: string[];
  hashtagsInstagram: string[];
  bestPostTime: string;
  bestDay: string;
  hookText: string;
}

const STOP = new Set(
  "the a an and or of to in on for with is are was were it its this that you your he she they we i me my his her their our as at by from but not so if then than all can will just like get got one two".split(" ")
);

export function keywordsFromText(text: string, n = 10): string[] {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
    if (w.length > 3 && !STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
}

function localFallback(videoTitle: string, clips: ClipInput[], keywords: string[]): ClipCopy[] {
  const baseTags = [...new Set([...keywords.slice(0, 6).map((k) => "#" + k.replace(/\s+/g, "")), "#shorts", "#viral", "#fyp"])];
  return clips.map((c, i) => {
    const hookWords = (c.hook || c.excerpt || videoTitle).split(/\s+/).slice(0, 5).join(" ");
    const title = hookWords.replace(/[,.!?]+$/g, "");
    const firstLine = (c.excerpt || videoTitle).split(/[.!?]+/)[0].trim().slice(0, 110);
    return {
      title: title.charAt(0).toUpperCase() + title.slice(1),
      shortCaption: firstLine ? `${firstLine}. Watch till the end.` : `${hookWords} — watch till the end.`,
      youtubeCaption: `${c.excerpt || videoTitle}\n\nClip ${i + 1} from "${videoTitle}". Watch the full video for the whole story.`,
      instagramCaption: `${c.excerpt || videoTitle}\n\nFollow for more clips like this.`,
      hashtagsYoutube: baseTags.slice(0, 10),
      hashtagsInstagram: baseTags.slice(0, 10),
      bestPostTime: "7:00 PM - 9:00 PM local time",
      bestDay: "Saturday",
      hookText: hookWords.toUpperCase().slice(0, 24),
    };
  });
}

export interface ScoutMoment {
  start: number;
  end: number;
  score: number; // 0-100
  category: string;
  hook: string;
  title: string;
  description: string;
  shortCaption: string;
  hashtags: string[];
  highlightWords: string[];
  reason: string;
}

const CATEGORIES = new Set(["funny", "fail", "clutch", "rage", "shock", "take", "story", "other"]);

function tidyScout(raw: unknown, duration: number, minLen: number, maxLen: number): ScoutMoment[] {
  const list = Array.isArray(raw) ? raw : [];
  const strip = (s: unknown, limit: number) =>
    String(s ?? "").replace(/https?:\/\/\S+|www\.\S+|@\w+/g, "").replace(/\s{2,}/g, " ").trim().slice(0, limit);
  const out: ScoutMoment[] = [];
  for (const c of list) {
    const o = c as Record<string, unknown>;
    let s = Number(o.start), e = Number(o.end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    s = Math.max(0, Math.min(s, duration - 5));
    e = Math.max(s + 5, Math.min(e, duration));
    if (e - s < minLen || e - s > maxLen + 10) continue;
    if (out.some((p) => Math.min(e, p.end) - Math.max(s, p.start) > 0.3 * (e - s))) continue;
    const cat = String(o.category || "other").toLowerCase();
    const tags = Array.isArray(o.hashtags) ? o.hashtags.map((h) => String(h).replace(/\W/g, "").slice(0, 30)).filter(Boolean).slice(0, 8) : [];
    const words = Array.isArray(o.highlight_words) ? o.highlight_words.map((w) => strip(w, 30)).filter(Boolean).slice(0, 8) : [];
    out.push({
      start: +s.toFixed(1), end: +e.toFixed(1),
      score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 50))),
      category: CATEGORIES.has(cat) ? cat : "other",
      hook: strip(o.hook, 60).toUpperCase(),
      title: strip(o.title, 100),
      description: strip(o.description, 300),
      shortCaption: strip(o.shortCaption, 140) || strip(o.description, 140),
      hashtags: tags,
      highlightWords: words,
      reason: strip(o.reason, 200),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Top the free DeepChat credits up before a job, so a job never dies mid-way. */
export async function topUp(): Promise<void> {
  try {
    const mod = (await import("../lib/deepchat.mjs")) as {
      getBalance: () => Promise<{ balance?: number }>;
      claimReward: () => Promise<{ success?: boolean }>;
    };
    const bal = await mod.getBalance().catch(() => null);
    if (bal && typeof bal.balance === "number" && bal.balance >= 2) return;
    for (let i = 0; i < 5; i++) {
      const r = await mod.claimReward().catch(() => null);
      if (r?.success) break;
    }
  } catch { /* top-up is best-effort; the chat call retries with a fresh session on 401/402 */ }
}

/**
 * PeakCut brain, powered by DeepChat: the AI reads the timestamped transcript
 * (+ LOUD marks where the audio spikes) and picks standalone clips with a
 * hook, title, description, hashtags, highlight words and a reason.
 * One call per job. Returns [] on any failure — the caller falls back to
 * the local heuristic scorer.
 */
export async function scoutMoments(
  videoTitle: string,
  lines: { s: number; text: string; loud: boolean }[],
  duration: number,
  count: number,
  minLen = 15,
  maxLen = 60
): Promise<ScoutMoment[]> {
  const transcript = lines
    .map((l) => `[${l.s.toFixed(1)}]${l.loud ? " (LOUD)" : ""} ${l.text.slice(0, 300)}`)
    .join("\n");
  const prompt =
    `You are a clip scout for short-form gaming and streaming videos (YouTube Shorts, Reels, TikTok).\n` +
    `Below is a timestamped transcript of part of a video. Each line starts with [seconds]. Lines marked (LOUD) are where the audio got much louder than usual: shouting, laughing, sudden action.\n\n` +
    `Video title: ${videoTitle}\n\n` +
    `Pick up to ${count} moments that would work as standalone clips for someone who has never seen the video: funny moments, fails, clutch plays, rage, shock, hot takes, or a short story with a payoff.\n\n` +
    `Rules:\n- Each clip is ${minLen} to ${maxLen} seconds. Use the [seconds] values for start and end.\n- Start on the setup line, not mid-sentence. End right after the payoff or reaction.\n- Do not pick intros, sponsor reads, "like and subscribe", or dead air.\n- Skip weak moments. Fewer strong clips beat many weak ones. Return [] if nothing is worth clipping.\n- score: 0-100, how likely a stranger keeps watching. Be honest; most clips are 50-80.\n- hook: at most 5 words, ALL CAPS, shown as big text on the video. Curiosity, but true to what happens.\n- title: at most 70 characters, for the post.\n- description: one or two sentences.\n- shortCaption: one punchy line, max 120 characters, that sells the clip in the feed — curiosity plus payoff, no hashtags, no emojis. This is the Short caption people read before tapping.\n- hashtags: 5 tags without the # sign.\n- highlight_words: 3 to 6 single words spoken in the clip that carry the punch.\n- category: one of funny, fail, clutch, rage, shock, take, story, other.\n- reason: one short sentence on why it works.\n- Never put links, @handles, phone numbers, or "visit / buy / subscribe" calls in any field.\n\n` +
    `<transcript>\n${transcript}\n</transcript>\n\n` +
    `Reply with ONLY a JSON array, no other text: [{"start":0,"end":30,"score":80,"category":"story","hook":"NO DISC IN THE BOX","title":"...","description":"...","shortCaption":"...","hashtags":["gta6"],"highlight_words":["disc","box"],"reason":"..."}]`;

  try {
    await topUp();
    const mod = (await import("../lib/deepchat.mjs")) as {
      chat: (msg: string, opts?: Record<string, unknown>) => Promise<{ reply: string }>;
    };
    const res = await mod.chat(prompt, { providerId: "chatgpt", modelId: "gpt-4o-mini" });
    const data = extractJson(res.reply);
    const moments = tidyScout(data, duration, minLen, maxLen);
    return moments.slice(0, count);
  } catch {
    return [];
  }
}

/** Polish template-written captions so they read human. Best-effort, 30s cap. */
export async function humanizeCopy(text: string): Promise<string> {
  try {
    await topUp();
    const mod = (await import("../lib/deepchat.mjs")) as {
      humanize: (t: string, opts?: Record<string, unknown>) => Promise<{ humanizedText: string }>;
    };
    const r = await Promise.race([
      mod.humanize(text, { intensity: "medium" }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 30000)),
    ]);
    return r.humanizedText || text;
  } catch {
    return text;
  }
}

function extractJson(text: string): unknown | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function generateCopy(
  videoTitle: string,
  videoSummary: string,
  clips: ClipInput[],
  keywords: string[]
): Promise<{ copy: ClipCopy[]; source: "deepchat" | "local-fallback"; note?: string }> {
  const clipBlock = clips
    .map(
      (c, i) =>
        `Clip ${i + 1} (${c.start}s-${c.end}s): hook line: "${c.hook}" | what happens: "${c.excerpt}"`
    )
    .join("\n");

  const prompt =
    `You write viral Shorts/Reels copy. Video: "${videoTitle}". Summary: ${videoSummary}. ` +
    `Keywords: ${keywords.join(", ")}.\n${clipBlock}\n\n` +
    `Reply with ONLY a JSON object, no other text: {"clips":[{"title":"short hooky title, max 7 words","shortCaption":"one punchy line, max 120 characters, that sells the clip in the feed — curiosity plus payoff, no hashtags","youtubeCaption":"2-3 sentences + call to action","instagramCaption":"short, punchy, 1-2 lines + call to action","hashtagsYoutube":["#tag",... 8-10 tags],"hashtagsInstagram":["#tag",... 8-10 tags],"bestPostTime":"e.g. 7:00 PM","bestDay":"e.g. Saturday","hookText":"first-3-seconds on-screen text, max 4 words"}]}\n` +
    `One entry per clip, in order. Hashtags must be relevant to this video's topic, not generic spam.`;

  try {
    await topUp();
    const mod = (await import("../lib/deepchat.mjs")) as {
      chat: (msg: string, opts?: Record<string, unknown>) => Promise<{ reply: string }>;
    };
    let data: unknown = null;
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      const res = await mod.chat(attempt === 0 ? prompt : prompt + "\n\nYour last reply was not valid JSON. Reply with ONLY the JSON object.", {
        providerId: "chatgpt",
        modelId: "gpt-4o-mini",
      });
      data = extractJson(res.reply);
    }
    const parsed = (data as { clips?: unknown[] } | null)?.clips;
    if (Array.isArray(parsed) && parsed.length === clips.length) {
      const copy = parsed.map((p, i) => {
        const c = p as Partial<ClipCopy>;
        const fb = localFallback(videoTitle, [clips[i]], keywords)[0];
        return {
          title: String(c.title || fb.title).slice(0, 80),
          shortCaption: String(c.shortCaption || fb.shortCaption).slice(0, 140),
          youtubeCaption: String(c.youtubeCaption || fb.youtubeCaption),
          instagramCaption: String(c.instagramCaption || fb.instagramCaption),
          hashtagsYoutube: Array.isArray(c.hashtagsYoutube) ? c.hashtagsYoutube.map(String).slice(0, 12) : fb.hashtagsYoutube,
          hashtagsInstagram: Array.isArray(c.hashtagsInstagram) ? c.hashtagsInstagram.map(String).slice(0, 12) : fb.hashtagsInstagram,
          bestPostTime: String(c.bestPostTime || fb.bestPostTime),
          bestDay: String(c.bestDay || fb.bestDay),
          hookText: String(c.hookText || fb.hookText).slice(0, 30),
        };
      });
      return { copy, source: "deepchat" };
    }
    throw new Error("DeepChat reply did not parse as the expected JSON");
  } catch (e) {
    return {
      copy: localFallback(videoTitle, clips, keywords),
      source: "local-fallback",
      note: `DeepChat AI was unreachable (${(e as Error).message.slice(0, 120)}). Copy was generated locally from the transcript instead — the video itself is unaffected.`,
    };
  }
}
