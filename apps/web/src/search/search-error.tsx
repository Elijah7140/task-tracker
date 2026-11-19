import { CircleAlert } from "lucide-react";

/** An inline Search failure, such as a refused query or a deleted result. */
export function SearchError({ message }: { readonly message: string }) {
  return (
    <p
      role="alert"
      data-testid="search-error"
      className="flex items-start gap-2 rounded-card border border-line bg-danger-soft px-4 py-3 text-[13px] text-danger"
    >
      <CircleAlert size={15} aria-hidden="true" className="mt-px shrink-0" />
      {message}
    </p>
  );
}
