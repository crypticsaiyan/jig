import type { PermDecision } from "./types";
import { resolve, relative } from "node:path";

const CHAINING = /&&|\|\||[;|`]|\$\(|>>|<<|[><]/;

const ALWAYS_ASK: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f\b/i, // rm -rf, rm -fr, etc.
  /\bgit\s+push\s+.*(--force|-f)\b/,
  /\bgit\s+reset\s+.*--hard\b/,
  /\bgit\s+clean\s+.*-f/,
  /\bgit\s+branch\s+-D\b/,
];

function isSafe(command: string): boolean {
  return (
    !CHAINING.test(command) &&
    !ALWAYS_ASK.some((pattern) => pattern.test(command))
  );
}

function matchesAllowed(command: string, rules: RegExp[]): boolean {
  return rules.some((pattern) => pattern.test(command));
}

export function checkCommand(command: string, rules: RegExp[]): PermDecision {
  if (!isSafe(command)) return "always-ask";
  if (matchesAllowed(command, rules)) return "allowed";
  return "ask";
}

export function checkPath(rawPath: string, projectRoot: string): PermDecision {
  const absolute = resolve(projectRoot, rawPath);
  const rel = relative(projectRoot, absolute);
  const insideRoot = !rel.startsWith("..");
  return insideRoot ? "allowed" : "always-ask";
}

// edits inside the project ask unless allowlisted, edits outside always ask
export function checkEdit(
  absolutePath: string,
  projectRoot: string,
  rules: RegExp[],
): PermDecision {
  if (checkPath(absolutePath, projectRoot) === "always-ask")
    return "always-ask";
  if (matchesAllowed(absolutePath, rules)) return "allowed";
  return "ask";
}
