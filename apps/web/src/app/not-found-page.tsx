import { Link } from "@tanstack/react-router";
import { PageContainer } from "../ui/page-container.js";
import { PageHeader } from "../ui/page-header.js";

/** Shown for an address that matches no screen. */
export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeader title="Page not found" description="This address doesn’t match a screen." />
      <Link
        to="/"
        data-testid="not-found-home"
        className="font-medium text-accent-text hover:underline"
      >
        Go to projects
      </Link>
    </PageContainer>
  );
}
