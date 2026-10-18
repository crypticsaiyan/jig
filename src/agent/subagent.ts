import { z } from "zod";
import { runLoop } from "../loop/loop";
import type { LoopConfig, StopReason } from "../loop/types";
import type { SystemMessage } from "../provider";
import type { CompleteStreamFunc } from "../provider/types";
import type { Registry, Tool } from "../tool/types";
import { lastAssistantText } from "../util";

export type SubagentDeps = {
  complete: CompleteStreamFunc;
  config: LoopConfig;
  tools: Registry; // tools available to the subagent
  systemPrompt: SystemMessage;
};

const SUBAGENT_NOTE = `# SUB-AGENT:
You are a sub-agent. The caller sees only your final message, not your tool calls. When done, reply with a complete, concise report: findings, path:line references, and anything you could not determine. Do not ask questions; you cannot get answers.
`;

export function createSubagentTool(
  deps: SubagentDeps,
): Tool<{ prompt: z.ZodString }, { report: string; stopReason: StopReason }> {
  // new systemPrompt
  const systemPrompt: SystemMessage = {
    type: "system",
    content: `${deps.systemPrompt.content}\n${SUBAGENT_NOTE}`,
  };

  return {
    name: "subagent",
    description:
      "Delegate a self-contained subtask (searching the codebase, investigating, reading many files) to a sub-agent with a fresh context. It sees none of this conversation, so the prompt must include everything it needs: goal, relevant paths, what to report back. Returns only its final report. Use it when the work needs many tool calls whose details you do not need.",
    parameters: z.object({
      prompt: z
        .string()
        .describe("complete, self-contained instructions for the sub-agent"),
    }),
    getPermissionKey: () => undefined, // the child's own tool calls still ask
    execute: async ({ prompt }, ctx) => {
      const out = await runLoop({
        messages: [{ type: "user", content: prompt }],
        systemPrompt,
        complete: deps.complete,
        config: deps.config,
        tools: deps.tools,
        ctx: {
          ...ctx,
          depth: ctx.depth + 1,
          events: {
            onToolStart: (call, depth) =>
              ctx.events?.onToolStart?.(call, depth),
            onToolResult: (call, result, depth) =>
              ctx.events?.onToolResult?.(call, result, depth),
          },
        },
      });
      const last = lastAssistantText(out.messages);
      return {
        report: last ?? "sub-agent returned no report",
        stopReason: out.stopReason,
      };
    },
  };
}
