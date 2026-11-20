import { cx } from "../ui/class-names.js";
import { projectIconFor } from "./project-icons.js";

/** Props for {@link ProjectIcon}. */
export interface ProjectIconProps {
  readonly name: string;
  /** The chosen icon (§7.19); without one the tile shows the name's initial. */
  readonly iconKey?: string | null | undefined;
  readonly size?: "sm" | "lg" | undefined;
}

/** A rounded tile with the project's icon, or its initial, in cards and the sidebar. */
export function ProjectIcon({ name, iconKey, size = "sm" }: ProjectIconProps) {
  const choice = projectIconFor(iconKey);
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const Icon = choice?.icon;
  return (
    <span
      aria-hidden="true"
      data-testid="project-icon"
      data-icon={choice?.key ?? "initial"}
      className={cx(
        "grid shrink-0 place-items-center bg-accent-soft font-semibold text-accent-text",
        size === "lg" ? "size-8 rounded-control text-sm" : "size-5 rounded-[0.3125rem] text-[11px]",
      )}
    >
      {Icon === undefined ? initial : <Icon size={size === "lg" ? 17 : 12} strokeWidth={2.25} />}
    </span>
  );
}
