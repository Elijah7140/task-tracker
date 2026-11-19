/**
 * Shared classes for `role="tree"` widgets. The focused tree item draws its
 * focus ring on its own row (`data-tree-row`), not around its nested group.
 */
export const treeStyles = {
  item: "outline-none [&:focus-visible>[data-tree-row]]:outline-2 [&:focus-visible>[data-tree-row]]:-outline-offset-2 [&:focus-visible>[data-tree-row]]:outline-focus",
  group: "flex flex-col gap-px",
  chevron:
    "grid size-5 shrink-0 cursor-default place-items-center rounded-[0.3125rem] text-fg-subtle transition-[rotate,color] hover:bg-hover hover:text-fg",
} as const;
