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
  session: PermSession,
  asker: Asker,
): Promise<Allowed> {
  const rawKey = tool.getPermissionKey(args);
  if (rawKey === undefined) return { ok: true };
  // edit paths are resolved so "src/a.ts" and "./src/a.ts" share one allowlist rule
  const key: PermKey =
    rawKey.kind === "edit"
      ? { ...rawKey, value: resolve(session.projectRoot, rawKey.value) }
      : rawKey;
  let decision: PermDecision;
  switch (key.kind) {
    case "command":
      decision = checkCommand(key.value, session.allowList);
      break;
    case "path":
      decision = checkPath(key.value, session.projectRoot);
      break;
    case "edit":
      decision = checkEdit(key.value, session.projectRoot, session.allowList);
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

  // avoid adding to session on always-ask toolCalls
  if (decision === "ask") {
    const trimmed = key.value.trim();
    if (userDecision === "allow-always-exact") {
      // add exact string to allowList
      session.allowList.push(new RegExp(`^${escapeRegex(trimmed)}$`));
    } else if (userDecision === "allow-always-prefix") {
      // add prefix * to allowList regex
      const base = trimmed.split(/\s+/)[0];
      if (base)
        session.allowList.push(new RegExp(`^${escapeRegex(base)}(\\s.*)?$`));
    }
  }
  return { ok: true };
}
