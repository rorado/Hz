/** Formats a plain incrementing counter (Invoice.sequenceNumber) for
 * display — 1 -> "001", 42 -> "042", 1000 -> "1000" (never truncated, only
 * ever padded up to the minimum width). */
export function formatSequenceNumber(value: number, minDigits = 3): string {
  return String(value).padStart(minDigits, "0");
}
