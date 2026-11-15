# Vendored sources — what Clipi is built from

Clipi is a new app, but it stands on three open-source clipping
projects plus the DeepChat client the owner supplied. Their code is vendored
here (not copied blindly) so the site works offline and the lineage is clear.

## 1. OpenShorts — `~/workspace/clips/tools/openshorts/` (MIT)
Open-source OpusClip alternative. Clip Generator (Gemini finds 3–15 moments),
reframe modes TRACK / GENERAL (blurred background) / SPLIT / SCREENCAST,
faster-whisper word subtitles, hook overlays, MCP server + REST + CLI.
**What Clipi takes from it:** the moment-detection shape (transcript +
scene boundaries → ranked moments), the GENERAL blurred-background reframe,
and the hook-overlay idea. Its full stack needs Docker + 8 GB RAM + a Gemini
key, so Clipi does not run it — it re-implements its pipeline locally
(ffmpeg + faster-whisper, $0). See `~/workspace/custom-skills/long-to-short-clips/`
for the full verdict.

## 2. AutoClip — `~/workspace/clips/tools/autoclip/` (MIT)
Paste a link → up to 10 clips per platform + cover + title / description /
hashtags + ZIP publish kit (Douyin, Xiaohongshu, TikTok, Reels, Shorts,
Bilibili, YouTube). Cutting/framing/rendering local; analysis needs a cloud
model or Ollama.
**What Clipi takes from it:** the publish-kit format — every clip ships
with a cover (thumbnail), title, description and hashtags, ready to post.
Same limit as OpenShorts: its analysis needs a provider key or local model,
so Clipi uses DeepChat for analysis instead.

## 3. PeakCut — `server/vendor/peakcut/` (MIT, fonts OFL)
Full clipping web app (FastAPI + PostgreSQL + yt-dlp + sherpa-onnx + Pillow).
Vendored files: `brain.py`, `render.py`, `ai.py`, `posting.py`, `README.md`,
`LICENSE`, and the caption fonts (Poppins ExtraBold, Anton).
**What Clipi takes from it, ported and running:**
- `brain.py` → the AI clip scout: timestamped transcript + (LOUD) marks →
  moments with hook/title/description/hashtags/highlight words/reason.
  Clipi runs this prompt through DeepChat instead of PeakCut's
  bring-your-own-key providers.
- `render.py` → word-level bouncy ASS captions, hook title in a white
  rounded box, highlight words, measured text widths, blur/zoom/crop
  layouts, loudnorm audio. Ported to `server/worker/build_ass.py` and used
  by `server/src/clipBuilder.ts` for every clip.
- `posting.py` → posting slots (best times, gap between posts, daily cap).
  Ported to `server/src/posting.ts`.
- `ai.py` → the pluggable-provider idea. Clipi's provider is DeepChat
  (integrated, no key); the code is structured so a Gemini/OpenAI key can
  be added later if the owner ever wants one.

## 4. DeepChat AI client — `server/lib/deepchat.mjs` (supplied by the owner)
Zero-dependency Node ESM client for the DeepChat Android app's API
(reverse-engineered; Supabase backend). Exports chat (GPT/Claude/Gemini/
DeepSeek/Kimi/Grok/Mistral/Perplexity), vision, generateImage, imageToImage,
editImage, faceSwap, humanize, optimizePrompt, getBalance, claimReward.
**What Clipi takes from it:** everything AI — the scout, the captions,
the inbuilt agent, the humanizer. Sessions are anonymous and free credits
come from ad-reward claims (auto top-up before each job).
**Honest note:** this is not an official API. It works today (tested
2026-11-15: chat returns, credits top up), but the service can rate-limit
or break it. That is why every AI call in Clipi has a local fallback:
heuristic moments, template captions, and the agent answering from the job's
own data. The site never dies because the AI is down.

## 5. Sound effects — `server/assets/sounds-kenyset/` (Kenyset free SFX pack)
108 real files (106 MP3 + 2 WAV) supplied by the owner via Google Drive.
Slot map in `server/assets/sound-map.json` (whoosh-01..04, curious-sting,
funny-hit, pop, click, riser, success, …). The clip builder mixes these
under the original narration.
