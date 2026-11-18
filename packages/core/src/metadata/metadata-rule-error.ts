/** A lookup or custom-field edit violated a domain rule. */
export class MetadataRuleError extends Error {
  override readonly name = "MetadataRuleError";
}
