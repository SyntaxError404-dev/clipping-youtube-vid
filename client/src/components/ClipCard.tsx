import { useRef, useState } from "react";
import { copyToClipboard, fmtClock } from "../api";
import { Icon } from "./icons";
import { CATEGORY_COLORS } from "../types";
import type { ClipResult } from "../types";

interface Props {
  clip: ClipResult;
  onToast: (msg: string, kind?: "ok" | "err" | "info") => void;
}

export function ClipCard({ clip, onToast }: Props) {
  const [platform, setPlatform] = useState<"yt" | "ig">("yt");
  const [copied, setCopied] = useState(false);
  const [copiedShort, setCopiedShort] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const copyTimer = useRef<number | null>(null);
  const shortTimer = useRef<number | null>(null);
  const cap = platform === "yt" ? clip.copy.youtubeCaption : clip.copy.instagramCaption;
  const tags = platform === "yt" ? clip.copy.hashtagsYoutube : clip.copy.hashtagsInstagram;
  const catColor = clip.category ? CATEGORY_COLORS[clip.category] ?? "#9aa0af" : undefined;
  const cover = clip.cover || clip.thumbnail;
  const short = clip.copy.shortCaption || "";

  const copyAll = async () => {
    const head = short ? `${short}\n\n${clip.copy.title}` : clip.copy.title;
    const text = `${head}\n\n${cap}\n\n${tags.join(" ")}`;
    const ok = await copyToClipboard(text);
    onToast(ok ? `Caption + hashtags copied (clip ${clip.index})` : "Copy failed — select the text manually", ok ? "ok" : "err");
    if (ok) {
      setCopied(true);
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
    }
  };

  const copyShort = async () => {
    const ok = await copyToClipboard(short);
    onToast(ok ? `Short caption copied (clip ${clip.index})` : "Copy failed — select the text manually", ok ? "ok" : "err");
    if (ok) {
      setCopiedShort(true);
      if (shortTimer.current) window.clearTimeout(shortTimer.current);
      shortTimer.current = window.setTimeout(() => setCopiedShort(false), 1800);
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  return (
    <article className="clip" style={{ animationDelay: `${Math.min((clip.index - 1) * 70, 280)}ms` }}>
      <div className="clip-media">
        <video
          ref={videoRef}
          src={clip.video}
          poster={cover}
          controls
          playsInline
          preload="metadata"
          onClick={togglePlay}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        {!playing && (
          <button
            type="button"
            className="play-overlay"
            onClick={togglePlay}
            aria-label={`Play clip ${clip.index}`}
          >
            <Icon name="play" size={26} />
          </button>
        )}
        <span className="clip-dur">
          <Icon name="clock" size={12} />
          {fmtClock(Math.round(clip.duration))}
        </span>
      </div>
      <div className="clip-body">
        <div className="clip-head">
          <h3>{clip.copy.title}</h3>
          {clip.category && (
            <span className="badge" style={{ color: catColor, borderColor: catColor }}>
              {clip.category}
            </span>
          )}
        </div>
        {short && (
          <div className="short-cap">
            <p>{short}</p>
            <button type="button" onClick={copyShort} className={copiedShort ? "copied" : ""}>
              <Icon name={copiedShort ? "check" : "copy"} size={13} />
              {copiedShort ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        <p className="muted clip-meta">
          Clip {clip.index} · {fmtClock(clip.start)}–{fmtClock(clip.end)} · hook: “{clip.copy.hookText}”
        </p>
        {clip.reason && <p className="reason">{clip.reason}</p>}
        <div className="tabs" role="tablist" aria-label="Caption platform">
          <button
            role="tab"
            aria-selected={platform === "yt"}
            className={platform === "yt" ? "on" : ""}
            onClick={() => setPlatform("yt")}
          >
            <Icon name="video" size={14} />
            YouTube
          </button>
          <button
            role="tab"
            aria-selected={platform === "ig"}
            className={platform === "ig" ? "on" : ""}
            onClick={() => setPlatform("ig")}
          >
            <Icon name="image" size={14} />
            Instagram
          </button>
        </div>
        <p className="caption">{cap}</p>
        <p className="tags">{tags.join(" ")}</p>
        <p className="muted post-line">
          <Icon name="calendar" size={14} />
          <span>
            Best time to post: <b>{clip.copy.bestDay}, {clip.copy.bestPostTime}</b>
            {clip.postSlot ? (
              <>
                {" "}· scheduled slot: <b>{clip.postSlot}</b>
              </>
            ) : null}
          </span>
        </p>
        <div className="actions">
          <button onClick={copyAll} className={copied ? "copied" : ""}>
            <Icon name={copied ? "check" : "copy"} size={14} />
            {copied ? "Copied" : "Copy caption + tags"}
          </button>
          <a href={clip.video} download={`clip-${clip.index}.mp4`}>
            <button type="button">
              <Icon name="download" size={14} />
              Download video
            </button>
          </a>
          <a href={cover} download={`clip-${clip.index}-cover.jpg`}>
            <button type="button">
              <Icon name="image" size={14} />
              Cover
            </button>
          </a>
          <a href={clip.thumbnail} download={`clip-${clip.index}-thumb.jpg`}>
            <button type="button">
              <Icon name="image" size={14} />
              Download thumbnail
            </button>
          </a>
        </div>
      </div>
    </article>
  );
}
