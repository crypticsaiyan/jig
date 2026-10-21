import { beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sandboxArgs, sandboxAvailable } from "../src/sandbox/bwrap";

const execFileAsync = promisify(execFile);

// temp project, so sandboxed writes never touch the repo
let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "jig-sandbox-"));
  mkdirSync(join(root, ".git/hooks"), { recursive: true });
  writeFileSync(join(root, ".env"), "KEY=1");
  writeFileSync(join(root, ".env.example"), "KEY=");
});

// value after a flag at each place it appears: ["--tmpfs", "/tmp"] -> "/tmp"
function valuesAfter(args: string[], flag: string): string[] {
  return args.flatMap((a, i) => (a === flag ? [args[i + 1] ?? ""] : []));
}

describe("sandboxArgs", () => {
  test("ends with the command for bash", () => {
    expect(sandboxArgs("echo hi", root).slice(-3)).toEqual([
      "bash",
      "-c",
      "echo hi",
    ]);
  });

  test("cuts the network and clears the env", () => {
    const args = sandboxArgs("true", root);
    expect(args).toContain("--unshare-net");
    expect(args).toContain("--clearenv");
  });

  test("masks .env but not .env.example", () => {
    const args = sandboxArgs("true", root);
    const masked = args.flatMap((a, i) =>
      a === "/dev/null" && args[i - 1] === "--ro-bind" ? [args[i + 1]] : [],
    );
    expect(masked).toContain(join(root, ".env"));
    expect(masked).not.toContain(join(root, ".env.example"));
  });

  test("protected paths that exist are mounted read-only", () => {
    const readOnly = valuesAfter(sandboxArgs("true", root), "--ro-bind");
    expect(readOnly).toContain(join(root, ".git/hooks"));
    expect(readOnly).not.toContain(join(root, ".jig")); // not in this project
  });
});

// real bwrap runs; skipped where the sandbox can't start
const available = await sandboxAvailable();

async function sandboxed(command: string, env: NodeJS.ProcessEnv = {}) {
  try {
    const { stdout } = await execFileAsync(
      "bwrap",
      sandboxArgs(command, root),
      {
        env: { ...process.env, ...env },
      },
    );
    return { code: 0, out: stdout.trim() };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string };
    return { code: failure.code ?? -1, out: (failure.stdout ?? "").trim() };
  }
}

describe.skipIf(!available)("inside bwrap", () => {
  test("pipes work", async () => {
    expect(await sandboxed("echo hi | wc -c")).toEqual({ code: 0, out: "3" });
  });

  test("env secrets are dropped", async () => {
    const result = await sandboxed('echo "[$JIG_TEST_SECRET]"', {
      JIG_TEST_SECRET: "sk-leak",
    });
    expect(result.out).toBe("[]");
  });

  test("no network", async () => {
    const result = await sandboxed("curl -sS -m 3 https://example.com");
    expect(result.code).not.toBe(0);
  });

  test(".env reads as empty", async () => {
    const result = await sandboxed("cat .env 2>/dev/null | wc -c");
    expect(result.out).toBe("0");
  });

  test("git hooks can't be written", async () => {
    const result = await sandboxed("echo x > .git/hooks/pre-commit");
    expect(result.code).not.toBe(0);
    expect(existsSync(join(root, ".git/hooks/pre-commit"))).toBe(false);
  });

  test("the project is writable", async () => {
    const result = await sandboxed("echo ok > made.txt && cat made.txt");
    expect(result.out).toBe("ok");
    expect(existsSync(join(root, "made.txt"))).toBe(true);
  });
});
