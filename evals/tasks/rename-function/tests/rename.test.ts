import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as math from "../src/math";
import { totalLine } from "../src/report";

test("addNumbers exists and calc is gone", () => {
  expect(math.addNumbers(2, 3)).toBe(5);
  expect("calc" in math).toBe(false);
});

test("callers still work", () => {
  expect(totalLine([1, 2, 3])).toBe("total: 6");
});

test("no file still mentions calc", () => {
  const src = join(import.meta.dir, "../src");
  for (const file of readdirSync(src))
    expect(readFileSync(join(src, file), "utf-8")).not.toMatch(/\bcalc\b/);
});
