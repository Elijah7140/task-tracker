import { CircleHelp } from "lucide-react";
import { Button } from "../ui/button.js";
import { Popover } from "../ui/popover.js";

/** One example of the query syntax and what it means. */
interface SyntaxExample {
  readonly example: string;
  readonly meaning: string;
}

/** The examples shown by the "?" help; PLAN §7.7 has the full grammar. */
export const QUERY_SYNTAX_EXAMPLES: ReadonlyArray<SyntaxExample> = [
  {
    example: 'deadlock "billing job"',
    meaning: "Words and quoted phrases search title, description and ticket",
  },
  { example: "type:error", meaning: "Field equals a value (type and choices match by label)" },
  { example: "priority:7", meaning: "A priority by its number, then by its name" },
  { example: "title~index", meaning: "Text contains (title, ticket and text fields)" },
  { example: "priority!=low", meaning: "Field is not the value" },
  {
    example: "priority>high",
    meaning: "More important than High; > and < also work on dates and numbers",
  },
  {
    example: "priority>=high",
    meaning: "High or more important; >= and <= work on priority and dates",
  },
  {
    example: "due<2026-12-01",
    meaning: "Dates are yyyy-MM-dd, today, tomorrow, yesterday, +3d or -1w",
  },
  { example: "due:today..+7d", meaning: "An inclusive range between two values" },
  { example: "effort:2.5", meaning: "Numbers use a dot for decimals" },
  { example: "has:ticket", meaning: "The field has a value" },
  { example: "no:due", meaning: "The field is empty" },
  { example: "status:Testing", meaning: "A status by name; status~prog matches part of a name" },
  {
    example: "is:done  is:open",
    meaning: "Completed or open items; is:done and completed:yes include completed items",
  },
  { example: 'title:"two words"', meaning: "Quote values that contain spaces" },
];

/** The "?" button beside the query box and its popup of syntax examples (§7.7). */
export function QuerySyntaxHelp() {
  const trigger = (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Query syntax help"
      data-testid="search-help"
      className="size-9"
    >
      <CircleHelp size={16} aria-hidden="true" />
    </Button>
  );
  return (
    <Popover trigger={trigger} title="Query syntax" testId="search-help-panel">
      <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        {QUERY_SYNTAX_EXAMPLES.map(({ example, meaning }) => (
          <div key={example} className="contents">
            <dt className="font-mono text-xs leading-5 whitespace-pre text-fg">{example}</dt>
            <dd className="leading-5 text-fg-muted">{meaning}</dd>
          </div>
        ))}
      </dl>
    </Popover>
  );
}
