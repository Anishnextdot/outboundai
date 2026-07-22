// Self-contained inline SVG icons (Lucide-style strokes). No external deps —
// keeps the bundle CSP-safe and dependency-free.
import type { CSSProperties, ReactElement } from "react";

export type IconName =
  | "dashboard"
  | "leads"
  | "research"
  | "drafts"
  | "approvals"
  | "campaigns"
  | "sent"
  | "replies"
  | "analytics"
  | "settings"
  | "plane"
  | "clock"
  | "shield"
  | "chat"
  | "calendar"
  | "check"
  | "alert"
  | "info"
  | "chevronDown"
  | "chevronRight"
  | "plus"
  | "bot"
  | "kebab";

const P: Record<IconName, ReactElement> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  leads: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M13 9h5M13 13h5M6.5 16c.6-1.3 1.6-2 2.5-2s1.9.7 2.5 2" />
    </>
  ),
  research: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20c0-2.8 2.2-5 5-5s5 2.2 5 5" />
      <circle cx="17.5" cy="15.5" r="2.5" />
      <path d="M19.5 17.5 21 19" />
    </>
  ),
  drafts: (
    <>
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v4h4M8 13h8M8 17h6" />
    </>
  ),
  approvals: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  campaigns: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  sent: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </>
  ),
  replies: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-3.3A8.4 8.4 0 1 1 21 11.5z" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 20V4" />
      <rect x="7" y="12" width="3" height="6" rx="1" />
      <rect x="12" y="8" width="3" height="10" rx="1" />
      <rect x="17" y="5" width="3" height="13" rx="1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H2.8a2 2 0 1 1 0-4H3a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 3.4V3a2 2 0 1 1 4 0v.2A1.6 1.6 0 0 0 15.7 4.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 19.6 9H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 2z" />
    </>
  ),
  plane: (
    <>
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22l-4-9-9-4 20-7z" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v5c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6l-7-3z" />
    </>
  ),
  chat: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-3.3A8.4 8.4 0 1 1 21 11.5z" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20L12 3z" />
      <path d="M12 10v4M12 17.5v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.1" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  bot: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4M9 4h6M9 14h.1M15 14h.1" />
    </>
  ),
  kebab: (
    <>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </>
  ),
};

export function Icon({
  name,
  size = 20,
  style,
  filled = false,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  );
}
