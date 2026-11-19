import { cx } from "../ui/class-names.js";

/** Props for {@link ProjectIcon}. */
export interface ProjectIconProps {
  readonly name: string;
  readonly size?: "sm" | "lg" | undefined;
}

/** A rounded initial tile that identifies a project in cards and the sidebar. */
export function ProjectIcon({ name, size = "sm" }: ProjectIconProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center bg-accent-soft font-semibold text-accent",
        size === "lg" ? "size-8 rounded-control text-sm" : "size-5 rounded-[0.3125rem] text-[11px]",
      )}
    >
      {initial}
    </span>
  );
}
