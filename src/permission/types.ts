export type PermKey = {
  // bash: sandboxed when possible; bash-unsandboxed: the model asked to skip the sandbox
  kind: "bash" | "bash-unsandboxed" | "read" | "write" | "edit";
  value: string; // the command, or the file path
};

export type PermDecision = "allowed" | "ask" | "always-ask";
export type AskDecision = Exclude<PermDecision, "allowed">;

export type PermSession = {
  allowList: RegExp[];
  projectRoot: string;
  sandbox: boolean; // bwrap works here, so bash runs sandboxed
};

export type Allowed = { ok: true } | { ok: false; reason: string };

export type UserDecision =
  "allow-once" | "allow-always-exact" | "allow-always-prefix" | "deny";

export type Asker = (
  key: PermKey,
  decision: AskDecision,
) => Promise<UserDecision>;
