import type { ReactNode } from "react";
import { cx } from "./class-names.js";

/**
 * Centers main-pane content at a readable width on 1080p and 1440p displays.
 * Pass `wide` for full-width layouts such as the workspace card grid (§7.17).
 */
export function PageContainer({
  children,
  wide = false,
}: {
  readonly children: ReactNode;
  readonly wide?: boolean | undefined;
}) {
  return (
    <div className={cx("mx-auto w-full pb-16", wide ? "px-8 pt-10" : "max-w-[68rem] px-10 pt-12")}>
      {children}
    </div>
  );
}
