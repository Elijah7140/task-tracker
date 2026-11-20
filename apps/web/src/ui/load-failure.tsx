import { CircleAlert } from "lucide-react";
import { Button } from "./button.js";

/** Props for {@link LoadFailure}. */
export interface LoadFailureProps {
  readonly message: string;
  readonly onRetry: () => void;
  readonly testId?: string | undefined;
}

/** A failed load with the reason and a retry action. */
export function LoadFailure({ message, onRetry, testId }: LoadFailureProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5"
    >
      <div className="flex items-center gap-2 font-medium text-danger">
        <CircleAlert size={16} aria-hidden="true" />
        Couldn’t load this view
      </div>
      <p className="text-fg-muted">{message}</p>
      <Button size="sm" onClick={onRetry} data-testid="retry-load">
        Try again
      </Button>
    </div>
  );
}
