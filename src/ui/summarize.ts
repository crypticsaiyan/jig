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
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
  } catch {
    return "";
  }
}
