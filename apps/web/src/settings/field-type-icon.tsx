import { Calendar, Hash, List, SquareCheck, Type } from "lucide-react";
import type { FieldDataType } from "./field-data-types.js";

const ICONS = {
  Text: Type,
  Number: Hash,
  Date: Calendar,
  Boolean: SquareCheck,
  Choice: List,
} as const;

/** A decorative glyph for a custom field's type, shown beside its name. */
export function FieldTypeIcon({ dataType }: { readonly dataType: FieldDataType }) {
  const Icon = ICONS[dataType];
  return <Icon size={14} aria-hidden="true" className="shrink-0 text-fg-subtle" />;
}
