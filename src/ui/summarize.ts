import { UI } from "../config";

// short one-line summary of a tool call's JSON arguments, for display
export function summarizeArgs(raw: string): string {
  try {
    const args = JSON.parse(raw);
    const main =
      args.command ??
      args.path ??
      args.skillName ??
      Object.values(args)[0] ??
      "";
    const text = String(main).replace(/\s+/g, " ");
    const max = UI.toolSummaryChars;
    return text.length > max ? text.slice(0, max - 3) + "..." : text;
  } catch {
    return "";
  }
}

// failed tool calls, denied calls, and bash commands with a non-zero exit code
export function isToolError(result: string): boolean {
  return /^(Error|Not allowed)/.test(result) || /"exitCode":[1-9]/.test(result);
}
