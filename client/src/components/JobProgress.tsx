import { useEffect, useRef } from "react";
import { Icon } from "./icons";
import type { Job } from "../types";
import { STEP_LABELS, STEPS } from "../types";

function etaFor(job: Job): string {
  const dur = job.videoDuration ?? 0;
  switch (job.step) {
    case "download":
      return "Downloading the source video…";
    case "audio":
      return "Extracting the audio track…";
    case "transcribe":
      return dur > 0
        ? `Transcribing ${Math.round(dur / 60)} min of audio — about ${Math.max(1, Math.ceil(dur / 2 / 60))} min on this machine, or much faster when YouTube auto-captions exist.`
        : "Transcribing the audio…";
    case "moments":
      return "Scoring loudness, scene cuts and the AI scout's picks…";
    case "captions":
      return "Writing titles, captions and hashtags…";
    case "render":
      return "Rendering vertical clips — roughly real-time on this machine.";
    case "thumbnail":
      return "Picking the strongest frame for each thumbnail…";
    case "done":
      return "All clips are ready.";
    default:
      return "";
  }
}

export function JobProgress({ job }: { job: Job }) {
  const running = job.status === "running" || job.status === "queued";
  const stepIdx = Math.max(0, STEPS.indexOf(job.step as (typeof STEPS)[number]));
  const done = job.status === "done";
  const failed = job.status === "error";
  const events = (job.events ?? []).slice(-6); // latest few, whole rows, no half-cut scroll
  const feedRef = useRef<HTMLUListElement>(null);

  // Keep the live feed scrolled to the newest event as polling brings them in.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  return (
    <section className="card progress-card" aria-label="Job progress">
      <div className="progress-head">
        <div className="progress-title">
          <span className={`status-dot ${failed ? "dot-err" : done ? "dot-ok" : "dot-run"}`} aria-hidden="true" />
          <h2>{job.videoTitle || "Working on your video…"}</h2>
        </div>
        <span className="pct-wrap" aria-hidden="true">
          <svg className="pct-ring" width="44" height="44" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" className="ring-bg" />
            <circle
              cx="22"
              cy="22"
              r="18"
              className="ring-fg"
              strokeDasharray={2 * Math.PI * 18}
              strokeDashoffset={2 * Math.PI * 18 * (1 - job.pct / 100)}
            />
          </svg>
          <span className="pct">{job.pct}%</span>
        </span>
      </div>
      <p className="muted job-url">
        {job.url}
        {job.videoDuration ? ` · ${Math.round(job.videoDuration / 60)} min source` : ""}
      </p>
      <div
        className="progress"
        role="progressbar"
        aria-valuenow={job.pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Job progress"
      >
        <div className={`bar ${failed ? "bar-err" : ""}`} style={{ width: `${job.pct}%` }} />
      </div>
      <p className="status" aria-live="polite">
        {done ? "Done — your clips are below." : failed ? "This job failed." : job.message}
      </p>
      {running && <p className="eta">{etaFor(job)}</p>}

      <div className="events" aria-label="What Clipi is doing">
        <h3>What Clipi is doing</h3>
        <ul className="event-feed" ref={feedRef} aria-live="polite">
          {events.length > 0 ? (
            events.map((ev, i) => {
              const latest = i === events.length - 1 && running;
              return (
                <li key={`${ev.t}-${i}`} className={`event-item ${latest ? "latest" : "past"}`}>
                  <span className="event-dot" aria-hidden="true">
                    {!latest && <Icon name="check" size={9} stroke={3} />}
                  </span>
                  <span className="event-time">{fmtTime(ev.t)}</span>
                  <span className="event-text">{ev.text}</span>
                </li>
              );
            })
          ) : (
            <li className="event-item latest">
              <span className="event-dot" aria-hidden="true" />
              <span className="event-time">
                {new Date(job.createdAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className="event-text">{job.message || STEP_LABELS[job.step] || "Starting…"}</span>
            </li>
          )}
        </ul>
      </div>

      <ol className="steps">
        {STEPS.filter((s) => s !== "done").map((s, i) => {
          const cls =
            done || stepIdx > i ? "on" : stepIdx === i ? "now" : "";
          return (
            <li key={s} className={cls}>
              <span className="step-mark" aria-hidden="true">
                {done || stepIdx > i ? <Icon name="check" size={10} stroke={3} /> : i + 1}
              </span>
              {STEP_LABELS[s]}
            </li>
          );
        })}
      </ol>
      {failed && job.error && <p className="error">{job.error}</p>}
      {job.results?.copyNote && <p className="note">{job.results.copyNote}</p>}
    </section>
  );
}
