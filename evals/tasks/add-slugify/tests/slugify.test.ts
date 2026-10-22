import { expect, test } from "bun:test";
import { capitalize, slugify } from "../src/strings";

test("slugify", () => {
  expect(slugify("Hello, World!")).toBe("hello-world");
  expect(slugify("  Many   spaces  ")).toBe("many-spaces");
  expect(slugify("Already-slug")).toBe("already-slug");
  expect(slugify("TypeScript 5.4 Release")).toBe("typescript-5-4-release");
  expect(slugify("!!!")).toBe("");
});

test("capitalize still works", () => {
  expect(capitalize("jig")).toBe("Jig");
});
