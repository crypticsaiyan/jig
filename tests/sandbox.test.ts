import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { SANDBOX } from "../src/config";
import {
  sandboxArgs,
  sandboxAvailable,
  socatAvailable,
} from "../src/sandbox/bwrap";
import { isAllowedHost, startProxy } from "../src/sandbox/proxy";

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

async function sandboxed(
  command: string,
  env: NodeJS.ProcessEnv = {},
  network = false,
) {
  try {
    const { stdout } = await execFileAsync(
      "bwrap",
      sandboxArgs(command, root, network),
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

describe("egress proxy", () => {
  test("allows listed domains and their subdomains only", () => {
    const domains = ["github.com"];
    expect(isAllowedHost("github.com", domains)).toBe(true);
    expect(isAllowedHost("api.github.com", domains)).toBe(true);
    expect(isAllowedHost("evilgithub.com", domains)).toBe(false);
    expect(isAllowedHost("github.com.evil.io", domains)).toBe(false);
  });

  test("network on adds the socket, proxy env and bridge", () => {
    const args = sandboxArgs("true", root, true);
    expect(valuesAfter(args, "--bind")).toContain(SANDBOX.proxySocket);
    expect(valuesAfter(args, "--setenv")).toContain("HTTPS_PROXY");
    expect(args.at(-3)).toContain("socat");
    expect(args.at(-1)).toBe("true");
  });

  test("network off adds none of it", () => {
    const args = sandboxArgs("true", root);
    expect(valuesAfter(args, "--setenv")).not.toContain("HTTPS_PROXY");
    expect(args.at(-1)).toBe("true");
  });
});

// real proxy + bwrap + socat; reaching an allowed site also needs internet, so it's opt-in
const networkReady = available && (await socatAvailable());

describe.skipIf(!networkReady)("inside bwrap, network on", () => {
  let stop: () => void;
  beforeAll(async () => {
    stop = await startProxy(SANDBOX.proxySocket, ["registry.npmjs.org"]);
  });
  afterAll(() => stop());

  test("unlisted domains are refused by the proxy", async () => {
    const result = await sandboxed(
      "curl -s -m 5 https://example.com",
      {},
      true,
    );
    expect(result.code).not.toBe(0);
  });

  test("bypassing the proxy finds no network", async () => {
    const result = await sandboxed(
      'curl -s --noproxy "*" -m 3 https://registry.npmjs.org',
      {},
      true,
    );
    expect(result.code).not.toBe(0);
  });

  test("exit codes pass through the bridge", async () => {
    expect((await sandboxed("exit 7", {}, true)).code).toBe(7);
  });

  test.skipIf(!process.env.JIG_NET_TESTS)(
    "allowed domains get through (JIG_NET_TESTS=1)",
    async () => {
      const result = await sandboxed(
        'curl -s -o /dev/null -w "%{http_code}" -m 10 https://registry.npmjs.org/zod',
        {},
        true,
      );
      expect(result.out).toBe("200");
    },
  );
});
