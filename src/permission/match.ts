import type { PermDecision } from "./types";
import { basename, resolve, relative } from "node:path";

const CHAINING = /&&|\|\||[;|`\n\r]|\$\(|>>|<<|[><]/;

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

// files that usually hold secrets; they always ask, even inside the project
const SENSITIVE: RegExp[] = [
  /^\.env(\..+)?$/i, // .env, .env.local, .env.production
  /\.(pem|key|p12|pfx)$/i, // certificates and private keys
  /^id_(rsa|ecdsa|ed25519|dsa)$/, // ssh private keys
  /^\.(npmrc|netrc|pgpass)$/, // tokens and passwords
];
const NOT_SENSITIVE = /^\.env\.(example|sample|template)$/i;

function isSensitive(absolutePath: string): boolean {
  const name = basename(absolutePath);
  return !NOT_SENSITIVE.test(name) && SENSITIVE.some((p) => p.test(name));
}

export function checkPath(rawPath: string, projectRoot: string): PermDecision {
  const absolute = resolve(projectRoot, rawPath);
  if (isSensitive(absolute)) return "always-ask";
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
