// rules for file paths (read_file, write_file, str_replace)

import { lstatSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { matchesAny } from "./allowlist";
import { NOT_SENSITIVE, PROTECTED, SENSITIVE } from "./policy";
import type { PermDecision } from "./types";

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

function isProtected(rel: string): boolean {
  return PROTECTED.some((p) => rel === p || rel.startsWith(p + sep));
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
  if (matchesAny(rules, absolutePath)) return "allowed";
  return "ask";
}
