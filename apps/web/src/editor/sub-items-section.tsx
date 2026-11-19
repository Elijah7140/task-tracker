import { Circle, CircleCheck, ListPlus } from "lucide-react";
import { Button } from "../ui/button.js";
import { cx } from "../ui/class-names.js";
import { allSiblings, type ItemNode } from "../workspace/item-outline.js";
import { EditorGroup } from "./editor-group.js";

/** Props for {@link SubItemsSection}. */
export interface SubItemsSectionProps {
  readonly node: ItemNode;
  readonly onOpen: (itemId: string) => void;
  readonly onAdd: () => void;
}

function SubItemButton({
  child,
  onOpen,
}: {
  readonly child: ItemNode;
  readonly onOpen: () => void;
}) {
  const completed = child.item.completedAtUtc !== null;
  const Icon = completed ? CircleCheck : Circle;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-testid="item-editor-subitem"
        data-completed={completed}
        className="flex h-8 w-full cursor-default items-center gap-2 rounded-control px-2 text-left text-sm outline-none hover:bg-hover focus-visible:ring-3 focus-visible:ring-focus"
      >
        <Icon
          size={15}
          aria-hidden="true"
          className={cx("shrink-0", completed ? "text-accent" : "text-line-strong")}
        />
        <span className={cx("truncate", completed && "text-fg-subtle line-through")}>
          {child.item.title}
        </span>
        {completed ? <span className="sr-only">, completed</span> : null}
      </button>
    </li>
  );
}

/**
 * The item's sub-items, open ones first, then finished ones newest first.
 * Choosing one opens it in the editor; Add sub-item creates one under this item.
 */
export function SubItemsSection({ node, onOpen, onAdd }: SubItemsSectionProps) {
  const children = allSiblings(node.children);
  const add = (
    <Button size="sm" variant="ghost" onClick={onAdd} data-testid="item-editor-add-subitem">
      <ListPlus size={14} aria-hidden="true" />
      Add sub-item
    </Button>
  );
  return (
    <EditorGroup title="Sub-items" testId="item-editor-subitems" action={add}>
      {children.length === 0 ? (
        <p className="text-[13px] text-fg-subtle">No sub-items yet.</p>
      ) : (
        <ul aria-label="Sub-items" className="-mx-2 flex flex-col">
          {children.map((child) => (
            <SubItemButton key={child.item.id} child={child} onOpen={() => onOpen(child.item.id)} />
          ))}
        </ul>
      )}
    </EditorGroup>
  );
}
