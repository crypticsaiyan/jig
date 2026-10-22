import { runTurn, type TurnDeps } from "./loop/turn";
import type { Session } from "./session";
import { isToolError, summarizeArgs } from "./ui/summarize";
import { lastAssistantText } from "./util";

export type HeadlessOptions = {
  prompt: string;
  session: Session;
  deps: TurnDeps;
  allowAll: boolean; // auto-approve "ask" prompts
  allowEdits: boolean; // auto-approve file edits only; unsandboxed commands stay denied
  skipPermissions: boolean; // approve everything; the caller's container is the sandbox
  json: boolean; // one JSON object on stdout instead of streamed text
};

// one turn without the UI: answer on stdout, tool lines on stderr, exit code from stopReason
export async function runHeadless(opts: HeadlessOptions): Promise<number> {
  const { prompt, session, deps, allowAll, allowEdits, skipPermissions, json } =
    opts;
  if (skipPermissions)
    console.error(
      "jig: --dangerously-skip-permissions: every action is approved",
    );
  const controller = new AbortController();
  let interrupts = 0;
  process.on("SIGINT", () => {
    if (++interrupts > 1) process.exit(130);
    controller.abort();
  });

  const toolLog: { name: string; ok: boolean; depth: number }[] = [];
  const start = performance.now();
  // stderr log with elapsed time, so a hang shows what jig was waiting on
  const log = (depth: number, text: string) =>
    console.error(
      `[${((performance.now() - start) / 1000).toFixed(1)}s]${"  ".repeat(depth + 1)}${text}`,
    );
  const complete: typeof deps.complete = async (...args) => {
    log(0, "model call...");
    const response = await deps.complete(...args);
    log(0, `model done (${response.stats.totalTokens} tokens)`);
    return response;
  };

  try {
    const { result, budget, saveError } = await runTurn(
      prompt,
      session,
      { ...deps, complete },
      {
        // no one to ask: deny by default, never auto-approve always-ask
        asker: async (key, decision) =>
          skipPermissions ||
          (decision === "ask" &&
            (allowAll || (allowEdits && key.kind === "edit")))
            ? "allow-once"
            : "deny",
        signal: controller.signal,
        events: {
          ...(json ? {} : { onText: (c: string) => process.stdout.write(c) }),
          onToolStart: (call, depth) =>
            log(depth, `${call.name} ${summarizeArgs(call.arguments)}...`),
          onToolResult: (call, result, depth) => {
            const ok = !isToolError(result);
            toolLog.push({ name: call.name, ok, depth });
            log(depth, `${call.name} ${ok ? "ok" : "error"}`);
          },
        },
      },
    );
    if (saveError) console.error("cant save session: " + saveError);

    if (json) {
      console.log(
        JSON.stringify({
          result: lastAssistantText(result.messages) ?? "",
          stopReason: result.stopReason,
          iterations: result.iterations,
          tokensUsed: result.tokensUsed,
          budgetUsed: budget.used,
          costUsd: budget.costUsd,
          promptTokens: budget.promptTokens,
          cachedTokens: budget.cachedTokens,
          cacheWriteTokens: budget.cacheWriteTokens,
          durationMs: Math.round(performance.now() - start),
          tools: toolLog,
          sessionId: session.id,
        }),
      );
    } else {
      process.stdout.write("\n"); // answer already streamed
    }

    if (result.stopReason === "stop") return 0;
    if (result.stopReason === "interrupted") return 130;
    console.error(`stopped: ${result.stopReason}`);
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
