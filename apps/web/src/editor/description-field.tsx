import { Field } from "@base-ui/react/field";
import { Tabs } from "@base-ui/react/tabs";
import { useId } from "react";
import { fieldStyles } from "../ui/field-styles.js";
import { MarkdownPreview } from "./markdown-preview.js";

const tabClass =
  "rounded-control px-2.5 py-1 text-[13px] font-medium text-fg-muted outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus data-active:bg-surface data-active:text-fg data-active:shadow-card";

/** Edits the Markdown source or shows its read-only preview in the current editor session. */
export function DescriptionField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const inputId = useId();
  return (
    <Tabs.Root defaultValue="edit" className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className={fieldStyles.label}>
          Description
        </label>
        <Tabs.List
          aria-label="Description view"
          className="flex gap-0.5 rounded-control bg-sidebar p-0.5"
        >
          <Tabs.Tab value="edit" className={tabClass} data-testid="item-editor-description-edit">
            Edit
          </Tabs.Tab>
          <Tabs.Tab
            value="preview"
            className={tabClass}
            data-testid="item-editor-description-preview-tab"
          >
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
            data-testid="item-editor-description"
            className={fieldStyles.textarea}
          />
        </Field.Root>
      </Tabs.Panel>
      <Tabs.Panel
        value="preview"
        className="min-h-52 rounded-control border border-line-strong bg-canvas px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-focus"
      >
        <MarkdownPreview source={value} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}
