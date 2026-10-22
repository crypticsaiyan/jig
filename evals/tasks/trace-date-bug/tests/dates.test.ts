import { expect, test } from "bun:test";
import { formatDate, parseDate } from "../src/dates";
import { dueDate } from "../src/invoice";

test("parse and format round-trip", () => {
  for (const d of ["2024-03-05", "2023-12-31", "2024-02-29", "2024-01-01"])
    expect(formatDate(parseDate(d))).toBe(d);
});

test("due dates across months, years and leap days", () => {
  expect(dueDate({ id: "B", issued: "2024-01-31", termsDays: 1 })).toBe(
    "2024-02-01",
  );
  expect(dueDate({ id: "C", issued: "2023-12-20", termsDays: 15 })).toBe(
    "2024-01-04",
  );
  expect(dueDate({ id: "D", issued: "2024-02-20", termsDays: 10 })).toBe(
    "2024-03-01",
  );
});
