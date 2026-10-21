// rules for bash commands

import { matchesAny } from "./allowlist";
import { CHAINING, DESTRUCTIVE } from "./policy";
import type { PermDecision } from "./types";

export function isDestructive(command: string): boolean {
  return DESTRUCTIVE.some((pattern) => pattern.test(command));
}

// inside the sandbox the OS blocks the damage, so only destructive commands ask
export function checkSandboxed(command: string): PermDecision {
  return isDestructive(command) ? "always-ask" : "allowed";
}

// outside the sandbox: chained or destructive always ask, the rest asks unless allowlisted
export function checkCommand(command: string, rules: RegExp[]): PermDecision {
  if (CHAINING.test(command) || isDestructive(command)) return "always-ask";
  if (matchesAny(rules, command)) return "allowed";
  return "ask";
}
