import Link from "next/link";
import type { ReactNode } from "react";

export type EmptyStateVariant = "search" | "inbox" | "trophy" | "compass" | "spark";

const ACCENT = "#2E6FEF";

/** The prop the robot holds per variant: each floats beside it, drawn in the same line style. */
const ROBOT_PROPS: Record<EmptyStateVariant, ReactNode> = {
  // Magnifying glass (the original #293 illustration).
  search: (
    <g transform="translate(14, 12)">
      <circle cx="44" cy="24" r="9" fill="var(--zk-surface, #ffffff)" stroke={ACCENT} strokeWidth="2.5" />
      <circle cx="44" cy="24" r="6" fill={ACCENT} fillOpacity="0.12" />
      <line x1="50.5" y1="30.5" x2="59" y2="39" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 20V22M44 26V28M41 24H43M45 24H47" stroke={ACCENT} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  ),
  // Envelope: the inbox, both notifications and escalations.
  inbox: (
    <g transform="translate(44, 10)">
      <rect x="0" y="0" width="24" height="17" rx="3.5" fill="var(--zk-surface, #ffffff)" stroke="currentColor" strokeWidth="2.5" />
      <path d="M1.5 4 12 10.5 22.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="12" cy="7" r="2.5" fill={ACCENT} />
    </g>
  ),
  // Trophy: ranking and earnings.
  trophy: (
    <g transform="translate(46, 8) scale(1.25)">
      <path
        d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </g>
  ),
  // Compass: a page that isn't there (404s).
  compass: (
    <g transform="translate(44, 8)">
      <circle cx="12" cy="12" r="11" fill="var(--zk-surface, #ffffff)" stroke="currentColor" strokeWidth="2.5" />
      <path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5Z" fill={ACCENT} fillOpacity="0.22" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="1.2" fill={ACCENT} />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </g>
  ),
  // Spark: the first-agent onboarding panel.
  spark: (
    <g transform="translate(46, 10)">
      <path
        d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3.5" fill={ACCENT} fillOpacity="0.15" stroke={ACCENT} strokeWidth="2" />
    </g>
  ),
};

/**
 * The robot mascot every empty state shares (#293). One body, a different prop
 * per context, so "nothing here" always looks like the same friendly robot.
 */
export function EmptyStateRobot({ variant = "search" }: { variant?: EmptyStateVariant }) {
  return (
    <div
      className="flex h-28 w-28 shrink-0 items-center justify-center rounded-3xl bg-zk-tint/60 text-zk-accent"
      aria-hidden="true"
    >
      <svg
        width="76"
        height="76"
        viewBox="0 0 76 76"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="transition-transform duration-300 hover:scale-105"
      >
        {/* Antenna */}
        <line x1="38" y1="12" x2="38" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <circle cx="38" cy="9" r="4" fill={ACCENT} />

        {/* Robot Head */}
        <rect x="18" y="20" width="40" height="32" rx="12" fill="var(--zk-surface, #ffffff)" stroke="currentColor" strokeWidth="2.5" />

        {/* Ears */}
        <rect x="13" y="31" width="5" height="10" rx="2" fill="currentColor" />
        <rect x="58" y="31" width="5" height="10" rx="2" fill="currentColor" />

        {/* Happy Eyes */}
        <path d="M26 33C27.5 30.5 30.5 30.5 32 33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M44 33C45.5 30.5 48.5 30.5 50 33" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

        {/* Friendly Smile */}
        <path d="M33 41C35 44 41 44 43 41" stroke={ACCENT} strokeWidth="2.5" strokeLinecap="round" />

        {/* Robot Body hints */}
        <path d="M25 52V58C25 61 29 63 38 63C47 63 51 61 51 58V52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />

        {ROBOT_PROPS[variant]}

        {/* Playful Floating Stars */}
        <circle cx="12" cy="18" r="1.5" fill={ACCENT} opacity="0.6" />
        <circle cx="66" cy="22" r="2" fill={ACCENT} opacity="0.5" />
        <circle cx="16" cy="56" r="1.5" fill={ACCENT} opacity="0.4" />
      </svg>
    </div>
  );
}

export type EmptyStateAction = {
  label: string;
  href: string;
  primary?: boolean;
};

interface WhimsicalEmptyStateProps {
  title?: string;
  description?: string;
  clearHref: string;
  createHref: string;
  showClear?: boolean;
  showCreate?: boolean;
  /** When given, these buttons replace the Clear filters / Create a new issue pair. */
  actions?: EmptyStateAction[];
  variant?: EmptyStateVariant;
  /** Inside a card that already provides the frame, drop this state's own border and surface. */
  frameless?: boolean;
}

export function WhimsicalEmptyState({
  title = "It's quiet in here... No issues match this filter.",
  description = "Maybe the bugs went into hiding, or they've all been squashed! Try clearing your filters or create a new issue.",
  clearHref,
  createHref,
  showClear = true,
  showCreate = true,
  actions,
  variant = "search",
  frameless = false,
}: WhimsicalEmptyStateProps) {
  const buttons: EmptyStateAction[] = actions
    ? actions
    : [
        ...(showClear ? [{ label: "Clear filters", href: clearHref, primary: true }] : []),
        ...(showCreate ? [{ label: "Create a new issue", href: createHref }] : []),
      ];

  return (
    <div
      data-testid="whimsical-empty-state"
      className={[
        "flex flex-col items-center justify-center px-6 text-center",
        frameless
          ? "py-10"
          : "rounded-[24px] border border-zk-border bg-zk-surface py-14 shadow-[0_4px_24px_rgba(0,0,0,0.02)]",
      ].join(" ")}
    >
      <div className="mb-5">
        <EmptyStateRobot variant={variant} />
      </div>

      <h3 className="text-lg font-bold text-zk-text sm:text-xl">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm text-zk-muted">
        {description}
      </p>

      {buttons.length > 0 ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {buttons.map((button) => (
            <Link
              key={`${button.label}-${button.href}`}
              href={button.href}
              className={
                button.primary
                  ? "inline-flex h-10 items-center justify-center rounded-full bg-electric-blue-strong px-5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(46,111,239,0.28)] transition-all hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue"
                  : "inline-flex h-10 items-center justify-center rounded-full border border-zk-border bg-zk-surface px-5 text-sm font-bold text-zk-text transition-colors hover:bg-zk-chip focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric-blue"
              }
            >
              {button.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
