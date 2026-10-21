// one tool call: build its key, decide, ask the user if needed, remember "allow always"

import { resolve } from "node:path";
import type { Tool } from "../tool/types";
import { ruleFor } from "./allowlist";
import { checkCommand, checkSandboxed } from "./command";
import { checkEdit, checkPath } from "./path";
import type {
  Allowed,
  Asker,
  PermDecision,
  PermKey,
  PermSession,
  UserDecision,
} from "./types";

// file paths become absolute, so "src/a.ts" and "./src/a.ts" share one allowlist rule
function permissionKey(
  tool: Tool<any, unknown>,
  args: any,
  projectRoot: string,
): PermKey | undefined {
  const key = tool.getPermissionKey(args);
  if (key === undefined || key.kind.startsWith("bash")) return key;
  return { ...key, value: resolve(projectRoot, key.value) };
}

// what the rules say, before anyone is asked
export function decide(key: PermKey, permissions: PermSession): PermDecision {
  const { allowList, projectRoot } = permissions;
  switch (key.kind) {
    case "bash":
      // no working sandbox: the command runs normally, so check it like one
      return permissions.sandbox
        ? checkSandboxed(key.value)
        : checkCommand(key.value, allowList);
    case "bash-unsandboxed":
      return checkCommand(key.value, allowList);
    case "read":
      return checkPath(key.value, projectRoot, "read");
    case "write":
      return checkPath(key.value, projectRoot, "write");
    case "edit":
      return checkEdit(key.value, projectRoot, allowList);
  }
}

function remember(
  key: PermKey,
  answer: UserDecision,
  permissions: PermSession,
): void {
  const rule = ruleFor(key.value, answer);
  if (rule) permissions.allowList.push(rule);
}

export async function checkPermission(
  tool: Tool<any, unknown>,
  args: any,
  permissions: PermSession,
  asker: Asker,
): Promise<Allowed> {
  const key = permissionKey(tool, args, permissions.projectRoot);
  if (key === undefined) return { ok: true };

  const decision = decide(key, permissions);
  if (decision === "allowed") return { ok: true };

  const answer = await asker(key, decision);
  if (answer === "deny") {
    return {
      ok: false,
      reason: "User denied tool use with the provided arguments",
    };
  }
  // always-ask actions are approved once, never saved
  if (decision === "ask") remember(key, answer, permissions);
  return { ok: true };
}
