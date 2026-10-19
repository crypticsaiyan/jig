import { runTurn, type TurnDeps } from "./loop/turn";
import type { Session } from "./session";
import { isToolError, summarizeArgs } from "./ui/summarize";
import { lastAssistantText } from "./util";

export type HeadlessOptions = {
  prompt: string;
  session: Session;
  deps: Omit<TurnDeps, "permissions">; // headless gets its own fresh permissions
  allowAll: boolean; // auto-approve "ask" prompts
  json: boolean; // one JSON object on stdout instead of streamed text
};

// one turn without the UI: answer on stdout, tool lines on stderr, exit code from stopReason
export async function runHeadless(opts: HeadlessOptions): Promise<number> {
  const { prompt, session, deps, allowAll, json } = opts;
  const controller = new AbortController();
  let interrupts = 0;
  process.on("SIGINT", () => {
    if (++interrupts > 1) process.exit(130);
    controller.abort();
  });

  const toolLog: { name: string; ok: boolean; depth: number }[] = [];
  const start = performance.now();

  try {
    const { result, budgetUsed, saveError } = await runTurn(
      prompt,
      session,
      { ...deps, permissions: { allowList: [], projectRoot: process.cwd() } },
      {
        // no one to ask: deny by default, never auto-approve always-ask
        asker: async (_key, decision) =>
          decision === "ask" && allowAll ? "allow-once" : "deny",
        signal: controller.signal,
        events: {
          ...(json ? {} : { onText: (c: string) => process.stdout.write(c) }),
          onToolResult: (call, result, depth) => {
            const ok = !isToolError(result);
            toolLog.push({ name: call.name, ok, depth });
            console.error(
              `${"  ".repeat(depth + 1)}${call.name} ${summarizeArgs(call.arguments)} ${ok ? "ok" : "error"}`,
            );
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
          budgetUsed,
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
