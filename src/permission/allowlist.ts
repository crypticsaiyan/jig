// "allow always" rules: what the user approved for the rest of the session

import type { UserDecision } from "./types";

export function matchesAny(rules: RegExp[], value: string): boolean {
  return rules.some((rule) => rule.test(value));
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// the rule an answer adds; undefined for answers that save nothing
export function ruleFor(
  value: string,
  answer: UserDecision,
): RegExp | undefined {
  const trimmed = value.trim();
  if (answer === "allow-always-exact") {
    return new RegExp(`^${escapeRegex(trimmed)}$`);
  }
  if (answer === "allow-always-prefix") {
    // first word, any arguments: "git" allows "git status", "git log -5"
    const base = trimmed.split(/\s+/)[0];
    return base ? new RegExp(`^${escapeRegex(base)}(\\s.*)?$`) : undefined;
  }
  return undefined;
}
