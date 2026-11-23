import { Field } from "@base-ui/react/field";
import { Tabs } from "@base-ui/react/tabs";
import { useId, useState } from "react";
import { fieldStyles } from "../ui/field-styles.js";
import { MarkdownPreview } from "./markdown-preview.js";

const tabClass =
  "rounded-control px-2.5 py-1 text-[13px] font-medium text-fg-muted outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus data-active:bg-surface data-active:text-fg data-active:shadow-card";

type MarkdownView = "edit" | "preview";

/** Props for {@link MarkdownTextField}. */
export interface MarkdownTextFieldProps {
  /** The visible label, such as Notes or Detail. */
  readonly label: string;
  /** The `data-testid` stem of the text box, its tabs and its preview. */
  readonly testId: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/**
 * Edits a Markdown text field (a ticket's Detail or the notes) or shows its read-only
 * preview in the current editor session. The label names the text box only while it
 * is mounted.
 */
export function MarkdownTextField({ label, testId, value, onChange }: MarkdownTextFieldProps) {
  const inputId = useId();
  const [view, setView] = useState<MarkdownView>("edit");
  return (
    <Tabs.Root
      value={view}
      onValueChange={(next: MarkdownView) => setView(next)}
      className="min-w-0"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {view === "edit" ? (
          <label htmlFor={inputId} className={fieldStyles.label}>
            {label}
          </label>
        ) : (
          <span className={fieldStyles.label}>{label}</span>
        )}
        <Tabs.List
          aria-label={`${label} view`}
          className="flex gap-0.5 rounded-control bg-sidebar p-0.5"
        >
          <Tabs.Tab value="edit" className={tabClass} data-testid={`${testId}-edit`}>
            Edit
          </Tabs.Tab>
          <Tabs.Tab value="preview" className={tabClass} data-testid={`${testId}-preview-tab`}>
            Preview
          </Tabs.Tab>
        </Tabs.List>
      </div>
      <Tabs.Panel value="edit">
        <Field.Root>
          <Field.Control
            render={<textarea rows={7} />}
            id={inputId}
            value={value}
            onValueChange={onChange}
            data-testid={testId}
            className={fieldStyles.textarea}
          />
        </Field.Root>
      </Tabs.Panel>
      <Tabs.Panel
        value="preview"
        className="min-h-52 rounded-control border border-line-strong bg-canvas px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-focus"
      >
        <MarkdownPreview source={value} testId={`${testId}-preview`} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
