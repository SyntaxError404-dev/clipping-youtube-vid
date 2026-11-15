import { Icon, type IconName } from "./icons";

export interface Toast {
  id: number;
  msg: string;
  kind: "ok" | "err" | "info";
}

const KIND_ICON: Record<Toast["kind"], IconName> = {
  ok: "check",
  err: "alert",
  info: "info",
};

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role="status">
          <span className="toast-icon" aria-hidden="true">
            <Icon name={KIND_ICON[t.kind]} size={16} />
          </span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}
