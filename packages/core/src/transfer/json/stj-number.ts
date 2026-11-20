/**
 * Formats a finite double the way the legacy exporter (System.Text.Json on .NET 10)
 * wrote it: the shortest round-trip digits, in plain notation unless the decimal
 * exponent puts the point more than 17 digits right of the first digit or more than
 * three zeros left of it, then as `1.5E-07` with at least two exponent digits.
 */
export function formatStjDouble(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError("Only finite numbers can be exported.");
  }
  if (value === 0) {
    return Object.is(value, -0) ? "-0" : "0";
  }
  const [mantissa, exponentText] = Math.abs(value).toExponential().split("e");
  const digits = mantissa!.replace(".", "");
  const exponent = Number(exponentText);
  const sign = value < 0 ? "-" : "";
  const scale = exponent + 1;
  if (scale > 17 || scale < -3) {
    const fraction = digits.length > 1 ? `.${digits.slice(1)}` : "";
    const power = String(Math.abs(exponent)).padStart(2, "0");
    return `${sign}${digits[0]}${fraction}E${exponent < 0 ? "-" : "+"}${power}`;
  }
  return sign + plain(digits, scale);
}

function plain(digits: string, scale: number): string {
  if (scale <= 0) {
    return `0.${"0".repeat(-scale)}${digits}`;
  }
  if (scale >= digits.length) {
    return digits + "0".repeat(scale - digits.length);
  }
  return `${digits.slice(0, scale)}.${digits.slice(scale)}`;
}
