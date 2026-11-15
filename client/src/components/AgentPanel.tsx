import { useEffect, useRef, useState } from "react";
import { apiAgent, apiExtraClip, apiJob, apiRewrite } from "../api";
import { Icon } from "./icons";
import { AGENT_GREETING, loadAgentHistory, saveAgentHistory } from "../storage";
import type { AgentAction, ChatMsg, Job } from "../types";

const SUGGESTIONS = [
  "Why did you pick clip 2?",
  "Rewrite clip 1 funnier",
  "Cut an extra clip at 12:30",
];

interface Props {
  jobId: string | null;
  jobTitle: string;
  onJobRefreshed: (job: Job) => void;
  onToast: (msg: string, kind?: "ok" | "err" | "info") => void;
}

export function AgentPanel({ jobId, jobTitle, onJobRefreshed, onToast }: Props) {
  const key = jobId ?? "global";
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    const stored = loadAgentHistory(jobId);
    setMessages(stored.length > 0 ? stored : [{ role: "assistant", content: AGENT_GREETING }]);
    loadedKey.current = key;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (loadedKey.current !== key) return;
    saveAgentHistory(jobId, messages);
  }, [messages, key, jobId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const sendText = async (raw: string) => {
    const text = raw.trim();
    if (!text || thinking) return;
    const prior = messages;
    const userMsg: ChatMsg = { role: "user", content: text };
    setMessages([...prior, userMsg]);
    setInput("");
    setThinking(true);
    try {
      const res = await apiAgent(jobId, text, prior);
      const assistant: ChatMsg = { role: "assistant", content: res.reply, actions: res.actions };
      setMessages([...prior, userMsg, assistant]);
    } catch (e) {
      setMessages([
        ...prior,
        userMsg,
        { role: "assistant", content: `I couldn't reach the agent: ${(e as Error).message}. The clips themselves are unaffected — try again in a moment.` },
      ]);
    } finally {
      setThinking(false);
    }
  };

  const send = () => sendText(input);

  const runAction = async (a: AgentAction) => {
    if (!jobId) {
      onToast("Actions need a job — start or open a finished video first.", "info");
      return;
    }
    setActionBusy(a.label);
    try {
      if (a.type === "rewrite_copy" && a.clipIndex != null) {
        await apiRewrite(jobId, a.clipIndex, a.style ?? "punchier");
        onToast(`Clip ${a.clipIndex} rewritten`, "ok");
      } else if (a.type === "extra_clip" && a.start != null && a.end != null) {
        await apiExtraClip(jobId, a.start, a.end, a.title ?? "Extra clip");
        onToast("Extra clip is being cut — the job will update", "ok");
      } else if (a.type === "retitle" && a.clipIndex != null) {
        await apiRewrite(jobId, a.clipIndex, `retitle: ${a.title ?? ""}`);
        onToast(`Clip ${a.clipIndex} retitled`, "ok");
      } else {
        onToast("That action needs more detail — ask me again with a clip number or a time.", "info");
        return;
      }
      const fresh = await apiJob(jobId);
      onJobRefreshed(fresh);
    } catch (e) {
      onToast(`Action failed: ${(e as Error).message}`, "err");
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <aside className="card agent" aria-label="Clipi agent">
      <div className="agent-head">
        <div>
          <h2>
            <span className="agent-mark" aria-hidden="true">
              <Icon name="scissors" size={15} stroke={2.2} />
            </span>
            Clipi
          </h2>
          <p className="muted agent-sub">
            {jobId ? `Talking about: ${jobTitle}` : "No video open yet — ask me anything about clipping."}
          </p>
        </div>
        <span className="agent-pill">
          <Icon name="sparkles" size={13} />
          Clipi AI
        </span>
      </div>

      <div className="chat" ref={scrollRef} aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`msg msg-${m.role}`}>
            {m.role === "assistant" && (
              <span className="msg-avatar" aria-hidden="true">
                <Icon name="scissors" size={14} stroke={2.2} />
              </span>
            )}
            <div className="msg-body">
              <p>{m.content}</p>
              {m.role === "assistant" && m.actions && m.actions.length > 0 && (
                <div className="msg-actions">
                  {m.actions.map((a, j) => (
                    <button
                      key={j}
                      onClick={() => runAction(a)}
                      disabled={actionBusy !== null}
                    >
                      <Icon
                        name={actionBusy === a.label ? "refresh" : "wand"}
                        size={14}
                        className={actionBusy === a.label ? "spin" : undefined}
                      />
                      {actionBusy === a.label ? "Working…" : a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="msg msg-assistant">
            <span className="msg-avatar" aria-hidden="true">
              <Icon name="scissors" size={14} stroke={2.2} />
            </span>
            <div className="msg-body">
              <p className="typing" aria-label="Agent is thinking">
                <span aria-hidden="true" />
                <span aria-hidden="true" />
                <span aria-hidden="true" />
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input">
        <label htmlFor="agent-input" className="sr-only">
          Message Clipi
        </label>
        <input
          id="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          onFocus={(e) => {
            // On phones the keyboard can cover the composer — bring it into view.
            window.setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 350);
          }}
          placeholder="Ask about a pick, rewrite a caption, cut an extra clip…"
        />
        <button
          type="button"
          className="send-btn"
          onClick={send}
          disabled={thinking || !input.trim()}
          aria-label="Send message"
          title="Send"
        >
          <Icon name="send" size={19} />
        </button>
      </div>
      <div className="chips" aria-label="Things to try">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => sendText(s)} disabled={thinking}>
            <Icon name="sparkles" size={13} />
            {s}
          </button>
        ))}
      </div>
    </aside>
  );
}
