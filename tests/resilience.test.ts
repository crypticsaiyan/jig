import { afterEach, describe, expect, test } from "bun:test";
import { TOOLS } from "../src/config";
import { StreamStalledError, withIdleTimeout } from "../src/provider/stall";
import { UnexpectedClientError } from "@openrouter/sdk/models/errors";
import { withRetry } from "../src/provider/retry";
import type { CompleteStreamFunc } from "../src/provider/types";
import { bashTool } from "../src/tool/tools/bash";
import { makeCtx, reply } from "./helpers";

async function* chunks(gapsMs: number[]) {
  for (const gap of gapsMs) {
    await Bun.sleep(gap);
    yield gap;
  }
}

describe("withIdleTimeout", () => {
  test("a steady stream never trips it", async () => {
    let idle = false;
    for await (const _ of withIdleTimeout(
      chunks([10, 10, 10]),
      100,
      () => (idle = true),
    ));
    expect(idle).toBe(false);
  });

  test("a long gap between chunks trips it", async () => {
    let idle = false;
    for await (const _ of withIdleTimeout(
      chunks([10, 150]),
      100,
      () => (idle = true),
    ));
    expect(idle).toBe(true);
  });
});

// a fake model call that fails with each given error in turn, then replies
function failing(errors: unknown[], streamFirst = false) {
  let calls = 0;
  const fn: CompleteStreamFunc = async (_m, _t, _s, _model, callbacks) => {
    calls++;
    const error = errors[calls - 1];
    if (streamFirst) callbacks?.onText?.("partial");
    if (error) throw error;
    return reply("ok");
  };
  return { fn, calls: () => calls };
}

const call = (fn: CompleteStreamFunc, signal = new AbortController().signal) =>
  fn([], [], signal, "test-model", {});

describe("withRetry", () => {
  test("retries a stall, then succeeds", async () => {
    const fake = failing([new StreamStalledError(1000)]);
    let retried = 0;
    const result = await call(withRetry(fake.fn, 2, () => retried++));
    expect(result.message.content).toBe("ok");
    expect(fake.calls()).toBe(2);
    expect(retried).toBe(1);
  });

  test("retries a dropped connection", async () => {
    const fake = failing([new UnexpectedClientError("Unable to connect")]);
    const result = await call(withRetry(fake.fn, 2));
    expect(result.message.content).toBe("ok");
    expect(fake.calls()).toBe(2);
  });

  test("gives up after the retry limit", async () => {
    const stall = new StreamStalledError(1000);
    const fake = failing([stall, stall, stall]);
    expect(call(withRetry(fake.fn, 1))).rejects.toThrow("stalled");
  });

  test("never retries after ctrl-c", async () => {
    const fake = failing([new StreamStalledError(1000)]);
    const controller = new AbortController();
    controller.abort();
    expect(call(withRetry(fake.fn, 2), controller.signal)).rejects.toThrow();
    expect(fake.calls()).toBe(1);
  });

  test("never retries once text was shown", async () => {
    const fake = failing([new StreamStalledError(1000)], true);
    expect(call(withRetry(fake.fn, 2))).rejects.toThrow("stalled");
    expect(fake.calls()).toBe(1);
  });

  test("doesn't retry errors that would fail again", async () => {
    const fake = failing([new Error("bad request")]);
    expect(call(withRetry(fake.fn, 2))).rejects.toThrow("bad request");
    expect(fake.calls()).toBe(1);
  });
});

describe("bash limits", () => {
  const saved = TOOLS.bashTimeoutMs;
  afterEach(() => (TOOLS.bashTimeoutMs = saved));

  test("a command that keeps running is killed with exit code 124", async () => {
    TOOLS.bashTimeoutMs = 300;
    const start = performance.now();
    const result = await bashTool.execute({ command: "sleep 5" }, makeCtx());
    expect(result.exitCode).toBe(124);
    expect(result.stderr).toContain("killed after");
    expect(performance.now() - start).toBeLessThan(2000);
  });

  test("a command waiting for input ends right away", async () => {
    const result = await bashTool.execute(
      { command: "cat; echo done" },
      makeCtx(),
    );
    expect(result.stdout).toBe("done\n");
  });
});
