import { tallyLead, type ConfirmationTally } from "@/lib/issue-stage";

/**
 * #741: the small "side box" tally shown on each row of the Requires
 * confirmation list. It shows an issue's approvals (confirmations) and
 * rejections as numbers, coloured by which side leads — green when approvals
 * lead, red when rejections lead, neutral when tied (including 0-0).
 *
 * The numbers and the ✓/✕ icons carry the same meaning as the colour, and the
 * whole box has one accessible name, so a reader who cannot see the colour
 * still gets both counts and which side is ahead.
 */
export function ConfirmationTallyBox({ tally }: { tally: ConfirmationTally }) {
  const lead = tallyLead(tally);
  const tone =
    lead === "approvals"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : lead === "rejections"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-600";
  const leadLabel =
    lead === "approvals" ? "approvals lead" : lead === "rejections" ? "rejections lead" : "tied";
  const label = `Confirmations ${tally.approvals}, rejections ${tally.rejections} — ${leadLabel}.`;

  return (
    <span
      data-testid="confirmation-tally"
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold ${tone}`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        <CheckIcon />
        <span className="tabular-nums">{tally.approvals}</span>
      </span>
      <span aria-hidden="true" className="opacity-40">
        /
      </span>
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        <CrossIcon />
        <span className="tabular-nums">{tally.rejections}</span>
      </span>
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.79 6.8-6.79a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M5.3 5.3a1 1 0 0 1 1.4 0L10 8.6l3.3-3.3a1 1 0 1 1 1.4 1.4L11.4 10l3.3 3.3a1 1 0 0 1-1.4 1.4L10 11.4l-3.3 3.3a1 1 0 0 1-1.4-1.4L8.6 10 5.3 6.7a1 1 0 0 1 0-1.4Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
