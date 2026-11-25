import { Dialog } from "@base-ui/react/dialog";
import type { CsvPreviewRow } from "@task-tracker/contracts";
import { TriangleAlert } from "lucide-react";
import { useRef } from "react";
import type { CsvPreviewOptions } from "../state/dialog-store.js";
import { csvPreviewText } from "../transfer/csv-preview-text.js";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { dialogStyles } from "../ui/dialog-styles.js";
import { useDialogLifecycle } from "./use-dialog-lifecycle.js";

/** Props for {@link CsvPreviewDialog}. */
export interface CsvPreviewDialogProps {
  readonly id: number;
  readonly options: CsvPreviewOptions;
}

type Row = typeof CsvPreviewRow.Type;

const CELL = "truncate px-2 py-1.5 text-left";

function SampleRow({ row }: { readonly row: Row }) {
  return (
    <tr data-testid="csv-preview-row" className="border-t border-line">
      <td className={cx(CELL, "text-fg-subtle tabular-nums")}>{row.rowNumber}</td>
      <td className={cx(CELL, "max-w-0 font-medium")}>{row.title}</td>
      <td className={cx(CELL, "max-w-0")}>{row.priority}</td>
      <td className={cx(CELL, "tabular-nums")}>{row.dueDate}</td>
      <td className={CELL}>
        {row.hasError ? (
          <span
            data-testid="csv-preview-row-error"
            className="inline-flex items-center gap-1 font-semibold text-danger"
          >
            <TriangleAlert size={13} aria-hidden="true" />
            Error
          </span>
        ) : null}
      </td>
    </tr>
  );
}

function SampleTable({ rows }: { readonly rows: ReadonlyArray<Row> }) {
  return (
    <div className="overflow-hidden rounded-control border border-line">
      <table className="w-full table-fixed text-sm" data-testid="csv-preview-rows">
        <caption className="sr-only">First rows of the file</caption>
        <colgroup>
          <col className="w-12" />
          <col />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-20" />
        </colgroup>
        <thead className="text-xs text-fg-subtle">
          <tr>
            {["Row", "Title", "Priority", "Due date"].map((name) => (
              <th key={name} scope="col" className={cx(CELL, "font-medium")}>
                {name}
              </th>
            ))}
            <th scope="col" className={CELL}>
              <span className="sr-only">Problems</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SampleRow key={row.rowNumber} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The CSV import preview (§7.9, the legacy ImportPreviewView): the row count,
 * how columns were read, the first rows with errors marked, and every problem.
 * Import shows only when the file has no problems; Escape cancels.
 */
export function CsvPreviewDialog({ id, options }: CsvPreviewDialogProps) {
  const lifecycle = useDialogLifecycle<boolean>(id, false);
  const importRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { preview } = options;
  const text = csvPreviewText(preview, options.targetName);
  return (
    <Dialog.Root
      open={lifecycle.open}
      onOpenChange={lifecycle.onOpenChange}
      onOpenChangeComplete={lifecycle.onOpenChangeComplete}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={dialogStyles.backdrop} />
        <Dialog.Popup
          className={cx(dialogStyles.popup, "top-1/2 w-[42rem]")}
          initialFocus={preview.canImport ? importRef : cancelRef}
          data-testid="csv-preview-dialog"
        >
          <div className={dialogStyles.header}>
            <Dialog.Title className={cx(dialogStyles.title, "wrap-break-word")}>
              {text.heading}
            </Dialog.Title>
            <Dialog.Description className="text-sm text-fg-muted">{text.target}</Dialog.Description>
          </div>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-sm">
            <p className="font-semibold" data-testid="csv-preview-row-count">
              {text.rowSummary}
            </p>
            <p className="wrap-break-word">{text.columns}</p>
            {text.unknownColumns === null ? null : (
              <p
                className="wrap-break-word text-fg-muted"
                data-testid="csv-preview-unknown-columns"
              >
                {text.unknownColumns}
              </p>
            )}
            {text.ignoredColumns === null ? null : (
              <p className="wrap-break-word text-fg-muted">{text.ignoredColumns}</p>
            )}
            <SampleTable rows={preview.sampleRows} />
            <p className="font-semibold" role="status" data-testid="csv-preview-status">
              {text.status}
            </p>
            {text.issueLines.length === 0 ? null : (
              <ul
                className="flex flex-col gap-1 text-danger"
                aria-label="Problems"
                data-testid="csv-preview-issues"
              >
                {text.issueLines.map((line, index) => (
                  <li key={index} className="wrap-break-word">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={dialogStyles.footer}>
            <Button
              ref={cancelRef}
              onClick={() => lifecycle.close(false)}
              data-testid="csv-preview-cancel"
            >
              {preview.canImport ? "Cancel" : "Close"}
            </Button>
            {preview.canImport ? (
              <Button
                ref={importRef}
                variant="primary"
                onClick={() => lifecycle.close(true)}
                data-testid="csv-preview-import"
              >
                Import
              </Button>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
