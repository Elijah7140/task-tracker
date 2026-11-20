/** Characters that make the legacy reader quote a property name in a path. */
const SPECIAL = /[. '/"[\]()\t\n\r\f\b\\\u{85}\u{2028}\u{2029}]/u;

/** The path of a property, for example `$.projects` or `$['odd name']`. */
export function propertyPath(path: string, name: string): string {
  return SPECIAL.test(name) ? `${path}['${name}']` : `${path}.${name}`;
}

/** The path of an array element, for example `$.projects[2]`. */
export function elementPath(path: string, index: number): string {
  return `${path}[${index}]`;
}
