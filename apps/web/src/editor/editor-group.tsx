import type { ReactNode } from "react";

/** Props for {@link EditorGroup}. */
export interface EditorGroupProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly testId?: string | undefined;
  /** Trailing content in the heading row, such as an add button. */
  readonly action?: ReactNode;
}

/** A titled region of related editor fields, such as Details or Schedule. */
export function EditorGroup({ title, children, testId, action }: EditorGroupProps) {
  return (
    <section aria-label={title} data-testid={testId} className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
