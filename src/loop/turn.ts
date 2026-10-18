import type { SystemMessage } from "../provider";
import { completeStream } from "../provider";
import type { Asker, PermSession } from "../permission/types";
import type { Session } from "../session";
import { saveSession } from "../session/store";
import type { Registry } from "../tool/types";
import { TOOLS, UI } from "../config";
import { runLoop } from "./loop";
import type { LoopConfig, LoopEvents, LoopOutput } from "./types";

// built once at startup, same for every turn
export type TurnDeps = {
  systemPrompt: SystemMessage;
  config: LoopConfig;
  tools: Registry;
  permissions: PermSession;
};

// differs per caller (UI or headless)
export type TurnIO = {
  asker: Asker;
  signal: AbortSignal;
  events: LoopEvents;
};

export type TurnResult = {
  result: LoopOutput;
  budgetUsed: number; // includes sub-agents
  saveError?: string;
};

// one user message: run the loop, update the session, save it
export async function runTurn(
  text: string,
  session: Session,
  deps: TurnDeps,
  io: TurnIO,
): Promise<TurnResult> {
  const budget = { used: 0, max: deps.config.maxTokens }; // fresh each turn
  const result = await runLoop({
    messages: [{ type: "user", content: text }],
    state: session.state,
    complete: completeStream,
    systemPrompt: deps.systemPrompt,
    config: deps.config,
    tools: deps.tools,
    ctx: {
      ...io,
      permissions: deps.permissions,
      maxOutputChars: TOOLS.maxOutputChars,
      budget,
      depth: 0,
    },
  });

  session.state = result.state;
  session.updatedAt = Date.now().toString();
  if (session.title === "") session.title = text.slice(0, UI.titleMaxChars);

  try {
    await saveSession(session);
    return { result, budgetUsed: budget.used };
  } catch (error) {
    return { result, budgetUsed: budget.used, saveError: String(error) };
  }
}
