import { resolve } from "node:path";
import type { Tool } from "../tool/types";
import { checkCommand, checkEdit, checkPath } from "./match";
import type {
  Allowed,
  Asker,
  PermDecision,
  PermKey,
  PermSession,
  UserDecision,
} from "./types";

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function checkPermission(
  tool: Tool<any, unknown>,
  args: any,
  permissions: PermSession,
  asker: Asker,
): Promise<Allowed> {
  const rawKey = tool.getPermissionKey(args);
  if (rawKey === undefined) return { ok: true };
  // edit paths are resolved so "src/a.ts" and "./src/a.ts" share one allowlist rule
  const key: PermKey =
    rawKey.kind === "edit"
      ? { ...rawKey, value: resolve(permissions.projectRoot, rawKey.value) }
      : rawKey;
  let decision: PermDecision;
  switch (key.kind) {
    case "command":
      decision = checkCommand(key.value, permissions.allowList);
      break;
    case "path":
      decision = checkPath(key.value, permissions.projectRoot);
      break;
    case "edit":
      decision = checkEdit(
        key.value,
        permissions.projectRoot,
        permissions.allowList,
      );
      break;
    default:
      decision = "ask";
  }
  if (decision === "allowed") return { ok: true };
  const userDecision: UserDecision = await asker(key, decision);
  if (userDecision === "deny") {
    return {
      ok: false,
      reason: "User denied tool use with the provided arguments",
    };
  }

  // avoid adding to permissions on always-ask toolCalls
  if (decision === "ask") {
    const trimmed = key.value.trim();
    if (userDecision === "allow-always-exact") {
      // add exact string to allowList
      permissions.allowList.push(new RegExp(`^${escapeRegex(trimmed)}$`));
    } else if (userDecision === "allow-always-prefix") {
      // add prefix * to allowList regex
      const base = trimmed.split(/\s+/)[0];
      if (base)
        permissions.allowList.push(
          new RegExp(`^${escapeRegex(base)}(\\s.*)?$`),
        );
    }
  }
  return { ok: true };
}
