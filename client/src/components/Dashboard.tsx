import { useEffect, useRef, useState } from "react";
import { fmtDuration } from "../api";
import { Icon } from "./icons";
import type { CachedJob } from "../types";

interface Props {
  cached: CachedJob[];
  currentJobId: string | null;
  onOpen: (id: string) => void;
}

function statusLabel(s: CachedJob["status"]): string {
  return s === "done" ? "done" : s === "error" ? "failed" : s === "running" ? "running" : "queued";
}

/** Eased count-up: animates from the previous value to the new one. */
function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    const to = value;
    prev.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

export function Dashboard({ cached, currentJobId, onOpen }: Props) {
  const totalJobs = cached.length;
  const totalClips = cached.reduce((sum, c) => sum + c.clipCount, 0);
  const totalSeconds = cached.reduce((sum, c) => sum + c.clipSeconds, 0);
  const last = cached[0];
  const jobsNum = useCountUp(totalJobs);
  const clipsNum = useCountUp(totalClips);
  const secondsNum = useCountUp(totalSeconds);

  return (
    <section className="dashboard" aria-label="Clipi dashboard">
      <div className="stats">
        <div className="stat">
          <span className="stat-icon stat-icon-jobs">
            <Icon name="film" size={18} />
          </span>
          <span className="stat-num">{jobsNum}</span>
          <span className="stat-label">jobs</span>
        </div>
        <div className="stat">
          <span className="stat-icon stat-icon-clips">
            <Icon name="scissors" size={18} />
          </span>
          <span className="stat-num">{clipsNum}</span>
          <span className="stat-label">clips cut</span>
        </div>
        <div className="stat">
          <span className="stat-icon stat-icon-time">
            <Icon name="clock" size={18} />
          </span>
          <span className="stat-num">{fmtDuration(secondsNum)}</span>
          <span className="stat-label">of clips</span>
        </div>
        <div className="stat">
          <span className="stat-icon stat-icon-status">
            <Icon name="gauge" size={18} />
          </span>
          <span className="stat-num stat-status">{last ? statusLabel(last.status) : "—"}</span>
          <span className="stat-label">last job</span>
        </div>
      </div>

      {cached.length === 0 ? (
        <div className="recent empty-state">
          <h2>No jobs yet</h2>
          <p className="muted">
            Paste a YouTube link above and Clipi will cut your first Shorts — captions,
            thumbnails and posting times included.
          </p>
        </div>
      ) : (
        <div className="recent">
          <h2>Recent jobs</h2>
          <ul>
            {cached.slice(0, 8).map((j) => {
              const failed = j.status === "error";
              const busy = j.status === "running" || j.status === "queued";
              return (
                <li key={j.id} className={`${j.id === currentJobId ? "current" : ""} ${failed ? "failed" : ""}`}>
                  <span
                    className="job-status-icon"
                    style={{ color: failed ? "var(--rose)" : busy ? "var(--peri)" : "var(--lav)" }}
                    aria-hidden="true"
                  >
                    <Icon
                      name={failed ? "alert" : busy ? "refresh" : "check"}
                      size={14}
                      className={busy ? "spin" : undefined}
                    />
                  </span>
                  <button className="link" onClick={() => onOpen(j.id)} title={j.url}>
                    {j.videoTitle || j.url}
                  </button>
                  <span className="muted">
                    {" "}— {failed ? "failed — tap to see why" : statusLabel(j.status)}
                    {j.clipCount > 0 ? ` · ${j.clipCount} clip${j.clipCount > 1 ? "s" : ""}` : ""}
                    {" · "}
                    {new Date(j.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
