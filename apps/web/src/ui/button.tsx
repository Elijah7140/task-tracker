import { Button as BaseButton } from "@base-ui/react/button";
import { cx } from "./class-names.js";

/** Visual weight. Use one `primary` action per view and `danger` only to confirm destruction. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

/** `icon` is a square button that must carry an `aria-label`. */
export type ButtonSize = "sm" | "md" | "icon";

/** Props for {@link Button}. Class names are strings so variants stay predictable. */
export interface ButtonProps extends Omit<BaseButton.Props, "className"> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly className?: string | undefined;
}

const base =
  "inline-flex shrink-0 cursor-default items-center justify-center rounded-control font-medium whitespace-nowrap select-none transition-colors duration-100 disabled:opacity-50 data-disabled:opacity-50";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-card hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-fg shadow-card hover:bg-hover",
  ghost: "text-fg-muted hover:bg-hover hover:text-fg data-popup-open:bg-hover",
  danger: "bg-danger-solid text-on-danger shadow-card hover:bg-danger-solid-hover",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-7 gap-1 px-2 text-[13px]",
  md: "h-8 gap-1.5 px-3 text-sm",
  icon: "size-7",
};

/** Returns the Tailwind class string for a button variant and size, for reuse on links. */
export function buttonClassName(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cx(base, variants[variant], sizes[size], className);
}

/** The shared button built on Base UI. Pass it to Base UI `render` props to style triggers. */
export function Button({ variant = "secondary", size = "md", className, ...props }: ButtonProps) {
  return <BaseButton className={buttonClassName(variant, size, className)} {...props} />;
}
