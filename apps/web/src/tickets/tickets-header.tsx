import type { TicketProject } from "@task-tracker/contracts";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { Button } from "../ui/button.js";
import { PageHeader } from "../ui/page-header.js";
import { Select } from "../ui/select.js";
import { useFocusOnMount } from "../ui/use-focus-on-mount.js";

/** The filter value for every project. */
export const ALL_PROJECTS = "all";

/** Props for {@link TicketsHeader}. */
export interface TicketsHeaderProps {
  readonly projects: ReadonlyArray<typeof TicketProject.Type>;
  readonly projectFilter: string;
  readonly onProjectFilterChange: (value: string) => void;
  readonly onBack: () => void;
}

/** The title, Back and the project filter, which takes focus when Tickets opens (§7.16). */
export function TicketsHeader({
  projects,
  projectFilter,
  onProjectFilterChange,
  onBack,
}: TicketsHeaderProps) {
  const filterRef = useRef<HTMLButtonElement>(null);
  useFocusOnMount(filterRef);
  const options = [
    { value: ALL_PROJECTS, label: "All projects" },
    ...projects.map(({ id, name }) => ({ value: id, label: name })),
  ];
  return (
    <PageHeader
      title="Tickets"
      eyebrow={
        <Button
          size="sm"
          variant="ghost"
          className="-ml-2 self-start"
          onClick={onBack}
          data-testid="tickets-back"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </Button>
      }
      actions={
        <Select
          value={projectFilter}
          onValueChange={onProjectFilterChange}
          options={options}
          ariaLabel="Project filter"
          testId="tickets-project-filter"
          triggerRef={filterRef}
          className="w-56"
        />
      }
    />
  );
}
