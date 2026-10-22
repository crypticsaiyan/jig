import { expect, test } from "bun:test";
import { dueDate, isOverdue } from "./invoice";

const invoice = { id: "A1", issued: "2024-01-15", termsDays: 30 };

test("due date adds the payment terms", () => {
  expect(dueDate(invoice)).toBe("2024-02-14");
});

test("overdue only after the due date", () => {
  expect(isOverdue(invoice, "2024-02-14")).toBe(false);
  expect(isOverdue(invoice, "2024-02-15")).toBe(true);
});
