/** Placeholder cards while the project list loads. */
export function ProjectGridSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading projects"
      data-testid="projects-loading"
      className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3"
    >
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-[6.5rem] animate-pulse rounded-card border border-line bg-hover"
        />
      ))}
    </div>
  );
}
