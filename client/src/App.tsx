import { useCallback, useEffect, useRef, useState } from "react";
import { apiCreateJob, apiJob, apiJobs, isYouTubeUrl } from "./api";
import { loadJobsCache, loadSettings, mergeJobsCache, saveSettings } from "./storage";
import type { CachedJob, Job, Settings } from "./types";
import { AgentPanel } from "./components/AgentPanel";
import { ClipCard } from "./components/ClipCard";
import { Dashboard } from "./components/Dashboard";
import { Icon } from "./components/icons";
import { JobProgress } from "./components/JobProgress";
import { Toasts, type Toast } from "./components/Toasts";

let toastId = 0;

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<Job | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cached, setCached] = useState<CachedJob[]>(() => loadJobsCache());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timer = useRef<number | null>(null);

  const pushToast = useCallback((msg: string, kind: "ok" | "err" | "info" = "ok") => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      const list = await apiJobs();
      setJobs(list);
      setCached(mergeJobsCache(list));
      return list;
    } catch {
      // server unreachable — the cached dashboard still shows
      return [] as Job[];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    // On load, reopen the newest job — running or finished — so your latest
    // work (progress feed or finished clips) is visible right away.
    refreshJobs().then((list) => {
      if (cancelled) return;
      const newest = list[0];
      if (newest) {
        apiJob(newest.id)
          .then((full) => { if (!cancelled) setJob(full); })
          .catch(() => {});
      }
    });
    return () => { cancelled = true; };
  }, [refreshJobs]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const running = job !== null && (job.status === "running" || job.status === "queued");

  // Background refresh every 30s so the dashboard stats and Recent jobs
  // stay accurate even for jobs made outside this page.
  useEffect(() => {
    const id = window.setInterval(() => { refreshJobs(); }, 30000);
    return () => window.clearInterval(id);
  }, [refreshJobs]);

  useEffect(() => {
    if (!job || !running) return;
    timer.current = window.setInterval(async () => {
      try {
        const fresh = await apiJob(job.id);
        setJob(fresh);
        if (fresh.status === "done" || fresh.status === "error") {
          if (timer.current) window.clearInterval(timer.current);
          refreshJobs();
          if (fresh.status === "done") {
            pushToast(`${fresh.results?.clips.length ?? 0} clips ready — scroll down to watch them`, "ok");
          }
        }
      } catch {
        // keep polling; a transient failure is not a job failure
      }
    }, 2500);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [job?.id, running, refreshJobs, pushToast]);

  const pasteUrl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setUrl(text.trim());
        setErr("");
      } else {
        pushToast("Clipboard is empty", "info");
      }
    } catch {
      pushToast("Clipboard read isn't available here — paste with Ctrl+V / long-press", "info");
    }
  };

  const start = async () => {
    const trimmed = url.trim();
    if (!isYouTubeUrl(trimmed)) {
      setErr("Paste a YouTube video URL (youtube.com or youtu.be).");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const created = await apiCreateJob(trimmed, settings.clips, settings.style);
      const full = await apiJob(created.id);
      setJob(full);
      pushToast("Job started — it keeps running in the background", "info");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openJob = async (id: string) => {
    try {
      const full = await apiJob(id);
      setJob(full);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      pushToast(`Couldn't open that job: ${(e as Error).message}`, "err");
    }
  };

  const copySourceLabel =
    job?.results?.copySource === "deepchat-scout"
      ? "Clipi AI scout"
      : job?.results?.copySource === "deepchat"
        ? "Clipi AI"
        : "local fallback (Clipi AI was down)";

  return (
    <div className="app-shell">
      <div className="bg-shapes" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="bg-dots" aria-hidden="true" />

      <div className="topbar">
        <div className="topbar-inner">
          <span className="topbar-mark" aria-hidden="true">
            <Icon name="scissors" size={17} stroke={2.2} />
          </span>
          <span className="topbar-name">Clipi</span>
          <span className="topbar-badge">Local · No keys · No uploads</span>
        </div>
      </div>

      <div className="page">
        <header className="hero">
          <div className="hero-mark" aria-hidden="true">
            <Icon name="scissors" size={30} stroke={2} />
          </div>
          <div>
            <h1 className="wordmark">Clipi</h1>
            <p>
              Long video in. Shorts out. Everything runs on your machine — download, transcribe,
              AI scout, cut, captions, thumbnails, posting plan.
            </p>
          </div>
          <span className="hero-badge">Local · No keys · No uploads</span>
        </header>

        <Dashboard cached={cached} currentJobId={job?.id ?? null} onOpen={openJob} />

        <section className="card intake" aria-label="New job">
          <label htmlFor="url-input" className="intake-label">
            YouTube video URL
          </label>
          <div className="row">
            <div className="url-wrap">
              <input
                id="url-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                onKeyDown={(e) => e.key === "Enter" && start()}
                autoComplete="off"
                spellCheck={false}
              />
              {url.trim() ? (
                <button
                  type="button"
                  className="url-tool"
                  onClick={() => setUrl("")}
                  aria-label="Clear URL"
                  title="Clear"
                >
                  <Icon name="x" size={15} />
                </button>
              ) : (
                <button
                  type="button"
                  className="url-tool url-paste"
                  onClick={pasteUrl}
                  aria-label="Paste URL from clipboard"
                  title="Paste from clipboard"
                >
                  <Icon name="paste" size={15} />
                  Paste
                </button>
              )}
            </div>
            <label className="sr-only" htmlFor="clip-count">
              How many clips
            </label>
            <select
              id="clip-count"
              value={settings.clips}
              onChange={(e) => setSettings({ ...settings, clips: Number(e.target.value) })}
              title="How many clips"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} clip{n > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="cap-style">
              Caption style
            </label>
            <select
              id="cap-style"
              value={settings.style}
              onChange={(e) => setSettings({ ...settings, style: e.target.value as Settings["style"] })}
              title="Caption style"
            >
              <option value="bounce">Bounce</option>
              <option value="hype">Hype</option>
              <option value="clean">Clean</option>
            </select>
            <button className="cta" onClick={start} disabled={busy || !url.trim()}>
              {busy ? (
                <>
                  <Icon name="refresh" size={17} className="spin" />
                  Starting…
                </>
              ) : (
                <>
                  <Icon name="scissors" size={17} />
                  Make clips
                </>
              )}
            </button>
          </div>
          {err && (
            <p className="error" role="alert">
              {err}
            </p>
          )}
          <p className="hint">
            Any length works — a 30-minute video takes about 15 minutes to transcribe on a normal laptop
            (faster when YouTube auto-captions exist). Jobs keep running in the background; this page
            polls for progress every few seconds.
          </p>
        </section>

        <div className="workspace">
          <div className="main-col">
            {job && <JobProgress job={job} />}

            {running && (
              <section aria-label="Clips being cut">
                <h2>Cutting your clips…</h2>
                <div className="grid">
                  {Array.from({ length: settings.clips }).map((_, i) => (
                    <div key={i} className="clip skeleton" aria-hidden="true">
                      <div className="sk-media" />
                      <div className="sk-body">
                        <div className="sk-line sk-line-title" />
                        <div className="sk-line" />
                        <div className="sk-line sk-line-short" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {job?.status === "done" && job.results && (
              <section aria-label="Your clips">
                <h2>Your clips</h2>
                <p className="muted">{job.results.summary}</p>
                <p className="muted">Captions by: {copySourceLabel}</p>
                <div className="grid">
                  {job.results.clips.map((c) => (
                    <ClipCard key={c.index} clip={c} onToast={pushToast} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <AgentPanel
            jobId={job?.id ?? null}
            jobTitle={job?.videoTitle ?? job?.url ?? ""}
            onJobRefreshed={(fresh) => {
              setJob(fresh);
              refreshJobs();
            }}
            onToast={pushToast}
          />
        </div>

        <footer>
          Clipi — your own little clipping studio. Clips are transformative cuts; use your own
          or licensed video and credit the source.
        </footer>
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}
