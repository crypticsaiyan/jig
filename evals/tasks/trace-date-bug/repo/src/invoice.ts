import { addDays, formatDate, parseDate } from "./dates";

export type Invoice = { id: string; issued: string; termsDays: number };

export function dueDate(invoice: Invoice): string {
  return formatDate(addDays(parseDate(invoice.issued), invoice.termsDays));
}

export function isOverdue(invoice: Invoice, today: string): boolean {
  return parseDate(today) > parseDate(dueDate(invoice));
}
