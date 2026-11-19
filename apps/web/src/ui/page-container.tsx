import type { ReactNode } from "react";

/** Centers main-pane content at a width that reads well on 1080p and 1440p displays. */
export function PageContainer({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[68rem] px-10 pt-12 pb-16">{children}</div>;
}
