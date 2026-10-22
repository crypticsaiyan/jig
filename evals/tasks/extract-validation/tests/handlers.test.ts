import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { invite } from "../src/handlers/invite";
import { updateProfile } from "../src/handlers/profile";
import { signup } from "../src/handlers/signup";
import { validateUser } from "../src/validation";

const good = { name: "Ada", email: "ada@example.com" };

test("validateUser", () => {
  expect(validateUser(good)).toEqual({ ok: true });
  expect(validateUser({ ...good, name: " A " })).toEqual({
    ok: false,
    error: "name must be 2-50 characters",
  });
  expect(validateUser({ ...good, name: "x".repeat(51) })).toEqual({
    ok: false,
    error: "name must be 2-50 characters",
  });
  expect(validateUser({ ...good, email: "ada@nowhere" })).toEqual({
    ok: false,
    error: "invalid email",
  });
});

test("handlers behave as before", () => {
  expect(signup({ ...good, password: "longenough" })).toEqual({ ok: true });
  expect(signup({ ...good, password: "short" })).toEqual({
    ok: false,
    error: "password must be at least 8 characters",
  });
  expect(signup({ ...good, email: "bad", password: "short" })).toEqual({
    ok: false,
    error: "invalid email",
  });
  expect(invite({ ...good, role: "admin" })).toEqual({ ok: true });
  expect(invite({ ...good, role: "owner" })).toEqual({
    ok: false,
    error: "role must be member or admin",
  });
  expect(invite({ ...good, name: "A", role: "owner" })).toEqual({
    ok: false,
    error: "name must be 2-50 characters",
  });
  expect(updateProfile({ ...good, bio: "hi" })).toEqual({ ok: true });
  expect(updateProfile({ ...good, bio: "x".repeat(161) })).toEqual({
    ok: false,
    error: "bio must be at most 160 characters",
  });
});

test("the checks live in one place only", () => {
  const handlers = join(import.meta.dir, "../src/handlers");
  for (const file of readdirSync(handlers)) {
    const code = readFileSync(join(handlers, file), "utf-8");
    expect(code).toContain("validateUser");
    expect(code).not.toContain("[^\\s@]+@");
    expect(code).not.toContain("2-50 characters");
  }
});
