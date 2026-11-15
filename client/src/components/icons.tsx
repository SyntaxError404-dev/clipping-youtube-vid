/**
 * Clipi icon pack — one consistent inline-SVG stroke set, lucide-style.
 * 24px viewBox, 2px stroke, round caps and joins, hand-drawn paths.
 * No dependency, no emoji, no text glyphs. Size and colour come from props.
 */

export type IconName =
  | "scissors"
  | "sparkles"
  | "send"
  | "copy"
  | "check"
  | "download"
  | "play"
  | "pause"
  | "clock"
  | "calendar"
  | "hash"
  | "video"
  | "image"
  | "film"
  | "wand"
  | "alert"
  | "chevron-down"
  | "plus"
  | "x"
  | "link"
  | "gauge"
  | "refresh"
  | "paste"
  | "info";

const PATHS: Record<IconName, React.ReactNode> = {
  scissors: (
    <>
      <circle cx="6" cy="6" r="2.6" />
      <circle cx="6" cy="18" r="2.6" />
      <path d="M8.3 7.7 20 17" />
      <path d="M8.3 16.3 20 7" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3.5 13.4 8.6 18.5 10 13.4 11.4 12 16.5 10.6 11.4 5.5 10 10.6 8.6Z" />
      <path d="M18.5 15.5 19.4 18.1 22 19 19.4 19.9 18.5 22.5 17.6 19.9 15 19 17.6 18.1Z" />
      <path d="M5 16.5 5.7 18.6 7.8 19.3 5.7 20 5 22.1 4.3 20 2.2 19.3 4.3 18.6Z" />
    </>
  ),
  send: (
    <>
      <path d="M21 3.5 10.4 14.1" />
      <path d="M21 3.5 14.8 21 10.4 14.1 3.5 9.7Z" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </>
  ),
  check: <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />,
  download: (
    <>
      <path d="M12 3.5V15" />
      <path d="m6.5 10 5.5 5.5L17.5 10" />
      <path d="M3.5 20.5h17" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <path d="M9 5.5v13" strokeWidth="3" />
      <path d="M15 5.5v13" strokeWidth="3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  hash: (
    <>
      <path d="M9.5 4.5 7.5 19.5" />
      <path d="M16.5 4.5 14.5 19.5" />
      <path d="M4.5 9.5h16" />
      <path d="M3.5 14.5h16" />
    </>
  ),
  video: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4.5 18.5 4.5-4.5 3.5 3.5 3-3 4 4" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M7.5 4.5v15M16.5 4.5v15M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" />
    </>
  ),
  wand: (
    <>
      <path d="m5 19 3.5-3.5" />
      <path d="m14.5 4.5 1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5Z" />
      <path d="M18.5 14.5l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8Z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 2.8 19.5h18.4Z" />
      <path d="M12 10v4.2" />
      <path d="M12 17.2v.1" />
    </>
  ),
  "chevron-down": <path d="m6 9.5 6 6 6-6" />,
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  link: (
    <>
      <path d="M10 14.5a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5" />
      <path d="M14 9.5a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M4.5 18.5a8.5 8.5 0 1 1 15 0" />
      <path d="M12 13.5 15.5 9" />
      <path d="M4.5 18.5h15" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 3.5v4h-4" />
    </>
  ),
  paste: (
    <>
      <rect x="5.5" y="4.5" width="13" height="16" rx="2.5" />
      <path d="M9 4.5V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" />
      <path d="M9 11h6M9 14.5h4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 7.8v.1" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  /** Stroke width, default 2. */
  stroke?: number;
}

/** Single entry point for every icon in the UI. */
export function Icon({ name, size = 18, className, stroke = 2 }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
