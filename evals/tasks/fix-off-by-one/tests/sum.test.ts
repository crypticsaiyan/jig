import { expect, test } from "bun:test";
import { sumTo } from "../src/sum";

test("sums 1..n", () => {
  expect(sumTo(0)).toBe(0);
  expect(sumTo(1)).toBe(1);
  expect(sumTo(3)).toBe(6);
  expect(sumTo(10)).toBe(55);
  expect(sumTo(100)).toBe(5050);
});
