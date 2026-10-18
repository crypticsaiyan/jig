import { runTurn, type TurnDeps } from "./loop/turn";
import type { Session } from "./session";
import { isToolError, summarizeArgs } from "./ui/summarize";

export type HeadlessOptions = {
  prompt: string;
  session: Session;
  deps: Omit<TurnDeps, "permissions">; // headless gets its own fresh permissions
  allowAll: boolean; // auto-approve "ask" prompts
};

// one turn without the UI: answer on stdout, tool lines on stderr, exit code from stopReason
export async function runHeadless(opts: HeadlessOptions): Promise<number> {
  const { prompt, session, deps, allowAll } = opts;
  const controller = new AbortController();
  let interrupts = 0;
  process.on("SIGINT", () => {
    if (++interrupts > 1) process.exit(130);
    controller.abort();
  });

  try {
    const { result, saveError } = await runTurn(
      prompt,
      session,
      { ...deps, permissions: { allowList: [], projectRoot: process.cwd() } },
      {
        // no one to ask: deny by default, never auto-approve always-ask
        asker: async (_key, decision) =>
          decision === "ask" && allowAll ? "allow-once" : "deny",
        signal: controller.signal,
        events: {
          onText: (c) => process.stdout.write(c),
          onToolResult: (call, result, depth) => {
            const ok = !isToolError(result);
            console.error(
              `${"  ".repeat(depth + 1)}${call.name} ${summarizeArgs(call.arguments)} ${ok ? "ok" : "error"}`,
            );
          },
        },
      },
    );
    process.stdout.write("\n"); // answer already streamed
    if (saveError) console.error("cant save session: " + saveError);

    if (result.stopReason === "stop") return 0;
    if (result.stopReason === "interrupted") return 130;
    console.error(`stopped: ${result.stopReason}`);
    return 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
