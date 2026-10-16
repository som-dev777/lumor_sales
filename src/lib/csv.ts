// CSV files that open safely in Excel and Google Sheets.

/**
 * One cell. Quotes when needed, and defuses values that a spreadsheet would run as a
 * formula (starting with = + - @ or a tab/return) by putting a ' in front.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text =
    typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Byte-order mark: tells Excel the file is UTF-8 (so ₹ and accents show correctly). */
const BOM = String.fromCharCode(0xfeff);

/** A whole file: a header row, then one row per record. Starts with a BOM so Excel reads UTF-8. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
