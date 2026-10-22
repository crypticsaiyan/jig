import { expect, test } from "bun:test";
import { parseDuration } from "./duration";

test("single units", () => {
  expect(parseDuration("2h")).toBe(7200);
  expect(parseDuration("30m")).toBe(1800);
  expect(parseDuration("45s")).toBe(45);
});

test("combined units", () => {
  expect(parseDuration("1h30m")).toBe(5400);
  expect(parseDuration("1h5m10s")).toBe(3910);
});

test("case-insensitive and trimmed", () => {
  expect(parseDuration("1H30M")).toBe(5400);
  expect(parseDuration("  45s ")).toBe(45);
});

test("invalid input throws", () => {
  for (const bad of ["", "   ", "abc", "30m1h", "1.5h", "1h1h"])
    expect(() => parseDuration(bad)).toThrow();
});
