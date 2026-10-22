import { describe, expect, test } from "bun:test";
import { runLoop } from "../src/loop/loop";
import type { LoopInput } from "../src/loop/types";
import type { ToolCall } from "../src/provider/types";
import { createRegistry } from "../src/tool";
import type { Tool } from "../src/tool/types";
import { z } from "zod";
import {
  callTool,
  echoTool,
  guardedTool,
  makeCtx,
  reply,
  scripted,
  systemPrompt,
  testConfig,
} from "./helpers";

function input(overrides: Partial<LoopInput>): LoopInput {
  return {
    userMessage: { type: "user", content: "go" },
    systemPrompt,
    complete: scripted([reply("done")]),
    config: testConfig,
    ctx: makeCtx(),
    tools: createRegistry([echoTool, guardedTool]),
    ...overrides,
  };
}

describe("runLoop", () => {
  test("stops on a plain reply", async () => {
    const out = await runLoop(input({ complete: scripted([reply("hi")]) }));
    expect(out.stopReason).toBe("stop");
    expect(out.iterations).toBe(0);
    expect(out.messages.at(-1)).toEqual({ type: "assistant", content: "hi" });
  });

  test("runs a tool and feeds the result back", async () => {
    const out = await runLoop(
      input({
        complete: scripted([callTool("echo", { text: "ping" }), reply("ok")]),
      }),
    );
    expect(out.stopReason).toBe("stop");
    expect(out.iterations).toBe(1);
    const toolMsg = out.messages.find((m) => m.type === "tool");
    expect(toolMsg).toEqual({
      type: "tool",
      toolCallId: "call_echo",
      content: JSON.stringify({ echo: "ping" }),
    });
  });

  test("unknown tool becomes an error result, not a crash", async () => {
    const out = await runLoop(
      input({ complete: scripted([callTool("nope", {}), reply("sorry")]) }),
    );
    expect(out.stopReason).toBe("stop");
    const toolMsg = out.messages.find((m) => m.type === "tool");
    expect(toolMsg?.content).toBe('Error: unknown tool "nope"');
  });

  test("denied permission reaches the model as a tool result", async () => {
    const out = await runLoop(
      input({
        complete: scripted([
          callTool("guarded", { command: "rm -rf x" }),
          reply("could not"),
        ]),
        ctx: makeCtx({ asker: async () => "deny" }),
      }),
    );
    expect(out.stopReason).toBe("stop");
    const toolMsg = out.messages.find((m) => m.type === "tool");
    expect(toolMsg?.content).toStartWith("Not allowed to run tool: guarded");
  });

  test("stops at maxIterations", async () => {
    const forever = Array.from({ length: 10 }, () =>
      callTool("echo", { text: "again" }),
    );
    const out = await runLoop(input({ complete: scripted(forever) }));
    expect(out.stopReason).toBe("max_iterations");
    expect(out.iterations).toBe(testConfig.maxIterations);
  });

  test("stops when the token budget runs out", async () => {
    const ctx = makeCtx();
    const out = await runLoop(
      input({
        complete: scripted([
          callTool("echo", { text: "big" }, testConfig.maxTokens + 1),
          reply("never reached"),
        ]),
        ctx,
      }),
    );
    expect(out.stopReason).toBe("max_tokens");
    expect(ctx.budget.used).toBe(testConfig.maxTokens + 1);
  });

  test("abort during a tool ends as interrupted with the note", async () => {
    const controller = new AbortController();
    const aborting: Tool<{}, string> = {
      name: "abort",
      description: "simulates ctrl-c mid-tool",
      parameters: z.object({}),
      getPermissionKey: () => undefined,
      execute: async () => {
        controller.abort();
        return "partial";
      },
    };
    const out = await runLoop(
      input({
        complete: scripted([callTool("abort", {}), reply("never reached")]),
        ctx: makeCtx({ signal: controller.signal }),
        tools: createRegistry([aborting]),
      }),
    );
    expect(out.stopReason).toBe("interrupted");
    expect(out.messages.at(-1)).toEqual({
      type: "user",
      content: "[Request interrupted by user]",
    });
  });

  test("tool events fire at depth 0", async () => {
    const events: string[] = [];
    await runLoop(
      input({
        complete: scripted([callTool("echo", { text: "x" }), reply("ok")]),
        ctx: makeCtx({
          events: {
            onToolStart: (call: ToolCall, depth) =>
              events.push(`start ${call.name} ${depth}`),
            onToolResult: (call: ToolCall, _result, depth) =>
              events.push(`result ${call.name} ${depth}`),
          },
        }),
      }),
    );
    expect(events).toEqual(["start echo 0", "result echo 0"]);
  });

  test("keeps prior state and appends the new turn", async () => {
    const first = await runLoop(input({ complete: scripted([reply("one")]) }));
    const second = await runLoop(
      input({
        userMessage: { type: "user", content: "again" },
        state: first.state,
        complete: scripted([reply("two")]),
      }),
    );
    expect(second.messages.map((m) => m.content)).toEqual([
      "go",
      "one",
      "again",
      "two",
    ]);
  });
});
