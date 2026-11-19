/** A typed value supplied to a search field filter (§7.2). */
export type FilterValue =
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "number"; readonly value: number }
  | { readonly kind: "date"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "choice"; readonly id: string }
  | { readonly kind: "choiceRange"; readonly min: string; readonly max: string }
  | { readonly kind: "numberRange"; readonly min: number; readonly max: number }
  | { readonly kind: "dateRange"; readonly min: string; readonly max: string };
