import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ruleFor } from "../src/permission/allowlist";
import { decide } from "../src/permission/check";
import type { PermKey, PermSession } from "../src/permission/types";

// temp project with real symlinks pointing out of it
let root: string;
let outside: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "jig-perm-root-"));
  outside = mkdtempSync(join(tmpdir(), "jig-perm-out-"));
  mkdirSync(join(root, "src"));
  mkdirSync(join(root, ".git/hooks"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "");
  writeFileSync(join(root, ".env"), "KEY=1");
  writeFileSync(join(outside, "secret.txt"), "s");
  symlinkSync(join(outside, "secret.txt"), join(root, "src/link.txt"));
  symlinkSync(outside, join(root, "src/outdir"));
  symlinkSync(join(outside, "missing.txt"), join(root, "src/dangling.txt"));
  symlinkSync(join(root, ".env"), join(root, "src/notes.txt"));
});

function session(sandbox: boolean, allowList: RegExp[] = []): PermSession {
  return { allowList, projectRoot: root, sandbox };
}

// file keys arrive absolute, as checkPermission builds them
function fileKey(kind: "read" | "write" | "edit", path: string): PermKey {
  return { kind, value: join(root, path) };
}

describe("bash with the sandbox on", () => {
  test("pipes run without asking", () => {
    expect(decide({ kind: "bash", value: "ls | wc -l" }, session(true))).toBe(
      "allowed",
    );
  });

  test("destructive commands always ask", () => {
    for (const command of [
      "rm -rf build",
      "git push --force",
      "git reset --hard",
    ])
      expect(decide({ kind: "bash", value: command }, session(true))).toBe(
        "always-ask",
      );
  });

  test("unsandboxed asks, even with the sandbox on", () => {
    expect(
      decide({ kind: "bash-unsandboxed", value: "ls" }, session(true)),
    ).toBe("ask");
  });
});

describe("bash with the sandbox off", () => {
  test("pipes always ask", () => {
    expect(decide({ kind: "bash", value: "ls | wc -l" }, session(false))).toBe(
      "always-ask",
    );
  });

  test("plain commands ask unless allowlisted", () => {
    const key: PermKey = { kind: "bash", value: "ls" };
    expect(decide(key, session(false))).toBe("ask");
    expect(decide(key, session(false, [/^ls$/]))).toBe("allowed");
  });
});

describe("file paths", () => {
  test.each([
    ["read", "src/a.ts", "allowed"],
    ["write", "src/new/deep/file.ts", "allowed"], // new folders are fine
    ["read", "../escape.txt", "always-ask"],
    ["read", "src/link.txt", "always-ask"], // symlink to a file outside
    ["write", "src/outdir/x.txt", "always-ask"], // symlink to a folder outside
    ["write", "src/dangling.txt", "always-ask"], // writing would create a file outside
    ["read", ".env", "always-ask"],
    ["read", "src/notes.txt", "always-ask"], // innocent name, points to .env
    ["read", ".git/config", "allowed"], // reading protected paths is harmless
    ["write", ".git/hooks/pre-commit", "always-ask"],
    ["write", ".jig/skills/evil.md", "always-ask"],
  ] as const)("%s %s -> %s", (kind, path, expected) => {
    expect(decide(fileKey(kind, path), session(true))).toBe(expected);
  });

  test("edits ask unless allowlisted", () => {
    const key = fileKey("edit", "src/a.ts");
    expect(decide(key, session(true))).toBe("ask");
    const rule = ruleFor(key.value, "allow-always-exact");
    expect(decide(key, session(true, rule ? [rule] : []))).toBe("allowed");
  });
});

describe("allowlist rules", () => {
  test("exact rule matches only that value", () => {
    const rule = ruleFor("git status", "allow-always-exact");
    expect(rule?.test("git status")).toBe(true);
    expect(rule?.test("git status --short")).toBe(false);
  });

  test("prefix rule matches the first word with any arguments", () => {
    const rule = ruleFor("git status", "allow-always-prefix");
    expect(rule?.test("git log -5")).toBe(true);
    expect(rule?.test("git")).toBe(true);
    expect(rule?.test("gitx")).toBe(false);
  });

  test("answers that save nothing give no rule", () => {
    expect(ruleFor("ls", "allow-once")).toBeUndefined();
    expect(ruleFor("ls", "deny")).toBeUndefined();
  });
});
