// "2024-03-05" -> Date at local midnight
export function parseDate(text: string): Date {
  const [year, month, day] = text.split("-").map(Number);
  return new Date(year!, month!, day!);
}

// Date -> "2024-03-05"
export function formatDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
