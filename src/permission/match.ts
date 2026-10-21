import type { PermDecision } from "./types";
import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { SANDBOX } from "../config";

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

// inside the sandbox only destructive commands ask; the OS blocks the rest
export function checkSandboxed(command: string): PermDecision {
  return ALWAYS_ASK.some((pattern) => pattern.test(command))
    ? "always-ask"
    : "allowed";
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

export function isSensitive(absolutePath: string): boolean {
  const name = basename(absolutePath);
  return !NOT_SENSITIVE.test(name) && SENSITIVE.some((p) => p.test(name));
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// where a path really points after following symlinks; a new file is resolved
// through its nearest existing parent. undefined: a dangling symlink on the way
function realTarget(absolute: string): string | undefined {
  const missing: string[] = [];
  let current = absolute;
  while (true) {
    try {
      return join(realpathSync(current), ...missing);
    } catch {
      if (isSymlink(current)) return undefined;
      const parent = dirname(current);
      if (parent === current) return undefined;
      missing.unshift(basename(current));
      current = parent;
    }
  }
}

// git hooks, git config, .jig: run or loaded later, outside the sandbox
function isProtected(rel: string): boolean {
  return SANDBOX.protectedInProject.some(
    (p) => rel === p || rel.startsWith(p + sep),
  );
}

// access "write" also guards protected paths; reading them is harmless
export function checkPath(
  rawPath: string,
  projectRoot: string,
  access: "read" | "write",
): PermDecision {
  const absolute = resolve(projectRoot, rawPath);
  const target = realTarget(absolute);
  if (target === undefined) return "always-ask";
  if (isSensitive(absolute) || isSensitive(target)) return "always-ask";
  const rel = relative(realTarget(projectRoot) ?? projectRoot, target);
  const insideRoot = rel !== ".." && !rel.startsWith(".." + sep);
  if (!insideRoot) return "always-ask";
  if (access === "write" && isProtected(rel)) return "always-ask";
  return "allowed";
}

// edits inside the project ask unless allowlisted, edits outside always ask
export function checkEdit(
  absolutePath: string,
  projectRoot: string,
  rules: RegExp[],
): PermDecision {
  if (checkPath(absolutePath, projectRoot, "write") === "always-ask")
    return "always-ask";
  if (matchesAllowed(absolutePath, rules)) return "allowed";
  return "ask";
}
