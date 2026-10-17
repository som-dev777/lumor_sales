/** Rupees, Indian digit grouping, no paise: 240000 → "₹2,40,000". */
export function formatInr(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
