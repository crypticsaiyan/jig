export type PermKey = {
  kind: "command" | "path" | "edit";
  value: string;
};

export type PermDecision = "allowed" | "ask" | "always-ask";

export type PermSession = {
  allowList: RegExp[];
  projectRoot: string;
};

export type Allowed = { ok: true } | { ok: false; reason: string };

export type UserDecision =
  "allow-once" | "allow-always-exact" | "allow-always-prefix" | "deny";

export type Asker = (
  key: PermKey,
  decision: "ask" | "always-ask",
) => Promise<UserDecision>;
