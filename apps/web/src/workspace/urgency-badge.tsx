import { cx } from "../ui/class-names.js";

/** A server-computed urgency level (§6.3). */
export type Urgency = "None" | "Approaching" | "Imminent" | "Overdue";

const tones: Record<Exclude<Urgency, "None">, { readonly pill: string; readonly dot: string }> = {
  Approaching: {
    pill: "bg-urgency-approaching-soft text-urgency-approaching",
    dot: "bg-urgency-approaching",
  },
  Imminent: { pill: "bg-urgency-overdue-soft text-urgency-overdue", dot: "bg-urgency-overdue" },
  Overdue: { pill: "bg-urgency-overdue-soft text-urgency-overdue", dot: "bg-urgency-overdue" },
};

/**
 * Displayed urgency as a soft pill with a dot, like the home overdue badge.
 * The label carries the meaning without color. Nothing shows for `None`.
 */
export function UrgencyBadge({ urgency }: { readonly urgency: Urgency }) {
  if (urgency === "None") {
    return null;
  }
  const tone = tones[urgency];
  return (
    <span
      data-testid="item-urgency"
      data-urgency={urgency}
      className={cx(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        tone.pill,
      )}
    >
      <span aria-hidden="true" className={cx("size-1.5 rounded-full", tone.dot)} />
      {urgency}
    </span>
  );
}
