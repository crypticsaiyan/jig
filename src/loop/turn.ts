import type { SystemMessage } from "../provider";
import type { CompleteStreamFunc } from "../provider/types";
import type { Asker, PermSession } from "../permission/types";
import type { Session } from "../session";
import { saveSession } from "../session/store";
import type { Registry } from "../tool/types";
import { TOOLS, UI } from "../config";
import { runLoop } from "./loop";
import type { LoopConfig, LoopEvents, LoopOutput, TokenBudget } from "./types";

// built once at startup, same for every turn
export type TurnDeps = {
  complete: CompleteStreamFunc; // the model call, with stall timeout and retries
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
  budget: TokenBudget; // what the turn spent, sub-agents included
  saveError?: string;
};

// one user message: run the loop, update the session, save it
export async function runTurn(
  text: string,
  session: Session,
  deps: TurnDeps,
  io: TurnIO,
): Promise<TurnResult> {
  // fresh each turn
  const budget: TokenBudget = {
    used: 0,
    max: deps.config.maxTokens,
    costUsd: 0,
    promptTokens: 0,
    cachedTokens: 0,
    cacheWriteTokens: 0,
  };
  const result = await runLoop({
    userMessage: { type: "user", content: text },
    state: session.state,
    complete: deps.complete,
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
    return { result, budget };
  } catch (error) {
    return { result, budget, saveError: String(error) };
  }
}
