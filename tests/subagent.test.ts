import { describe, expect, test } from "bun:test";
import { createSubagentTool } from "../src/agent/subagent";
import { runLoop } from "../src/loop/loop";
import { createRegistry } from "../src/tool";
import {
  callTool,
  echoTool,
  makeCtx,
  reply,
  scripted,
  systemPrompt,
  testConfig,
} from "./helpers";

// parent registry: echo + a subagent whose model is `child`
function parentTools(child: ReturnType<typeof scripted>) {
  return createRegistry([
    echoTool,
    createSubagentTool({
      complete: child,
      config: testConfig,
      tools: createRegistry([echoTool]),
      systemPrompt,
    }),
  ]);
}

describe("subagent", () => {
  test("parent receives only the child's final report", async () => {
    const child = scripted([
      callTool("echo", { text: "noise" }),
      reply("found it at a.ts:3"),
    ]);
    const out = await runLoop({
      messages: [{ type: "user", content: "find it" }],
      systemPrompt,
      complete: scripted([
        callTool("subagent", { prompt: "search for it" }),
        reply("it is at a.ts:3"),
      ]),
      config: testConfig,
      ctx: makeCtx(),
      tools: parentTools(child),
    });
    expect(out.stopReason).toBe("stop");
    const toolMsg = out.messages.find((m) => m.type === "tool");
    expect(JSON.parse(toolMsg?.content ?? "")).toEqual({
      report: "found it at a.ts:3",
      stopReason: "stop",
    });
    // the child's echo call never enters the parent's history
    expect(JSON.stringify(out.messages)).not.toContain("noise");
  });

  test("child spending counts toward the parent's budget", async () => {
    const ctx = makeCtx();
    const out = await runLoop({
      messages: [{ type: "user", content: "go" }],
      systemPrompt,
      complete: scripted([
        callTool("subagent", { prompt: "expensive" }, 10),
        reply("never reached"),
      ]),
      config: testConfig,
      ctx,
      tools: parentTools(
        scripted([reply("spent a lot", testConfig.maxTokens)]),
      ),
    });
    expect(out.stopReason).toBe("max_tokens");
    expect(out.tokensUsed).toBe(10); // parent's own calls only
    expect(ctx.budget.used).toBe(10 + testConfig.maxTokens); // shared total
    expect(ctx.budget.costUsd).toBeCloseTo(0.002); // parent call + child call
  });

  test("child tool events arrive at depth 1", async () => {
    const events: string[] = [];
    await runLoop({
      messages: [{ type: "user", content: "go" }],
      systemPrompt,
      complete: scripted([
        callTool("subagent", { prompt: "work" }),
        reply("done"),
      ]),
      config: testConfig,
      ctx: makeCtx({
        events: {
          onToolStart: (call, depth) =>
            events.push(`start ${call.name} ${depth}`),
          onToolResult: (call, _r, depth) =>
            events.push(`result ${call.name} ${depth}`),
        },
      }),
      tools: parentTools(
        scripted([callTool("echo", { text: "x" }), reply("report")]),
      ),
    });
    expect(events).toEqual([
      "start subagent 0",
      "start echo 1",
      "result echo 1",
      "result subagent 0",
    ]);
  });
});
