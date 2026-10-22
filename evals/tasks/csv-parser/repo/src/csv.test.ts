import { expect, test } from "bun:test";
import { parseCsv } from "./csv";

test("plain rows", () => {
  expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("quoted field with a comma", () => {
  expect(parseCsv('name,city\n"Doe, Jane",Paris')).toEqual([
    ["name", "city"],
    ["Doe, Jane", "Paris"],
  ]);
});
