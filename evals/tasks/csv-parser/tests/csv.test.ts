import { expect, test } from "bun:test";
import { parseCsv } from "../src/csv";

test("basics still work", () => {
  expect(parseCsv("a,b\n1,2\n")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
  expect(parseCsv('x,"y, z"')).toEqual([["x", "y, z"]]);
});

test("escaped quotes", () => {
  expect(parseCsv('"say ""hi""",b')).toEqual([['say "hi"', "b"]]);
});

test("empty fields are kept, including the last one", () => {
  expect(parseCsv("a,,c")).toEqual([["a", "", "c"]]);
  expect(parseCsv("a,b,")).toEqual([["a", "b", ""]]);
  expect(parseCsv('a,""')).toEqual([["a", ""]]);
});

test("CRLF line endings", () => {
  expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("newline inside a quoted field", () => {
  expect(parseCsv('id,note\n1,"line one\nline two"\n2,ok')).toEqual([
    ["id", "note"],
    ["1", "line one\nline two"],
    ["2", "ok"],
  ]);
});
