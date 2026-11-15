# Clipi — long video in, Shorts out, on your own machine

Paste a YouTube URL. Get back several vertical 9:16 clips with word-synced
captions, a hook title, sound effects, a thumbnail, and ready-to-post
captions + hashtags for YouTube and Instagram — plus the best time to post
each one. An inbuilt AI agent lives in the site: ask it why a moment was
picked, rewrite a caption, or cut an extra clip from any timestamp.

Everything runs locally. No Muse credits, no monthly fee, no API key to
paste anywhere — the AI is integrated directly in the site (see "AI" below).

## Quickstart

```bash
./setup.sh     # checks node/python/ffmpeg, installs yt-dlp + faster-whisper + npm deps
npm run dev    # server on :4000, website on http://localhost:5173
```

Open http://localhost:5173, paste a URL, pick how many clips (1-5), press
**Make clips**. Jobs run in the background — you can close the tab and come
back; the job list is on the page.

Production build: `npm run build` then `npm run start` (serves the site
from the same server on :4000).

## How a job works

1. **Download** — yt-dlp, best video ≤1080p + audio, merged to MP4.
2. **Transcript** — YouTube auto-captions first (fast). If there are none,
   local faster-whisper transcribes the audio (no key, no upload).
   Videos over 30 minutes are transcribed in 20-minute chunks so memory
   stays bounded; progress shows per chunk.
3. **Moments** — loudness (per-second RMS) + scene cuts + transcript
   keywords score every 25-50s window (local, always works).
4. **AI scout** — DeepChat reads the timestamped transcript with (LOUD)
   marks and picks the clips, with hook, title, description, hashtags,
   highlight words and a reason (PeakCut's brain, via DeepChat). If the AI
   is down, the heuristic moments are used instead.
5. **Captions + hashtags + posting guide** — from the scout, or from one
   DeepChat call; local templates if the AI is down. Posting slots follow
   PeakCut's rules (best times 12:00 / 19:00, max 2 a day, 3h apart).
6. **Render** — each clip is rebuilt vertical: blurred-background full
   frame, slow punch-in zoom, PeakCut word-level bouncy captions with
   highlight words, hook title in a white box, real sound effects
   (whoosh, sting, pop, riser, payoff) under the original voice, audio
   levelled to -14 LUFS. 1080x1920, 30fps.
7. **Thumbnail** — the loudest, brightest frame inside the clip, with the
   AI title burned on it.
8. **Agent** — the inbuilt assistant can explain any pick, rewrite a
   caption, retitle, or cut an extra clip from a timestamp you give it.

## Any length, every time

- Long videos work: chunked transcription, streaming scene detection,
  background jobs that survive closing the tab, one retry per failed step.
- Honest time: transcription runs at ~0.3x realtime on a weak CPU
  (a 30-min video ≈ 15 min with Whisper; minutes with auto-captions).
  The page shows an ETA and live progress instead of a spinner.
- If a step fails, the job says exactly which step and why (see
  `data/jobs/<id>/job.log`).
- **Resume:** if the server restarts mid-job (or the machine reboots), Clipi
  picks the job back up on startup and skips every finished step — download,
  audio, transcript, moments, rendered clips and thumbnails are all reused
  (a half-written clip is detected with ffprobe and re-rendered). A job never
  gets stuck "running" forever, and never starts over from zero.

## AI — and its limits, honestly

The AI is the DeepChat client you supplied (`server/lib/deepchat.mjs`):
a reverse-engineered client for the DeepChat Android app's API. It creates
anonymous sessions and tops free credits up via ad-reward claims — no key,
no account, no payment. Tested 2026-11-15: chat works, credits top up.

It is **not** an official API, and "unlimited" is not something any free
third-party service can promise. Clipi is built so it *behaves*
unlimited for normal use:
- one AI call per job (scout + copy together), not one per clip;
- credits topped up automatically before each job;
- a fresh anonymous session is created if one runs dry;
- **every AI step has a local fallback** (heuristic moments, template
  captions, agent answers from the job's own data), so the site keeps
  producing clips even if DeepChat is down for a day.

If you ever want a guaranteed provider, the code is structured for it
(PeakCut-style provider config) — but you do not need one to use the site.

## What it's built from

See `server/vendor/VENDOR.md`: OpenShorts (moment detection + reframe),
AutoClip (publish-kit format), PeakCut (AI scout, ASS captions, posting
slots — ported and running), DeepChat (all AI), Kenyset free SFX pack
(108 sounds, bundled in `server/assets/`).

## Use it right

Clips are short transformative cuts. Use your own footage or licensed
video, and credit the source — re-uploading someone else's full stream or
raw gameplay as-is risks Content ID / takedowns. The site never uploads
anything anywhere; you post the files yourself.

## Project layout

```
clipstudio/
  setup.sh            one-command setup
  server/             Express + TypeScript API + pipeline
    src/index.ts      API + local-only server (127.0.0.1:4000)
    src/pipeline.ts   download → transcript → moments → scout → render
    src/agent.ts      inbuilt agent actions (rewrite / retitle / extra clip)
    src/deepchat.ts   DeepChat scout + captions + humanize (with fallbacks)
    src/clipBuilder.ts PeakCut-style ASS render + SFX + loudnorm
    src/posting.ts    posting slots
    worker/           score.py, build_ass.py, thumbnail.py, transcribe.py
    assets/           sounds (Kenyset), sound-map, fonts (Poppins/Anton/Inter)
    lib/deepchat.mjs  vendored DeepChat client
    vendor/           PeakCut sources + VENDOR.md
  client/             React + Vite + TypeScript website
  data/jobs/<id>/     one folder per job (source, analysis, clips, job.log)
```
