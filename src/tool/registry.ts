import { checkPermission } from "../permission/check";
import type { Allowed } from "../permission/types";
import type { ToolSpec } from "../provider";
import { bashTool } from "./tools/bash";
import { loadSkill } from "./tools/load_skill";
import { fileRead } from "./tools/read_file";
import { strReplace } from "./tools/str_replace";
import { fileWrite } from "./tools/write_file";
import { truncateStrings } from "./truncate_tool";
import type { Tool, ToolContext } from "./types";
import z from "zod";

const tools: Tool<any, unknown>[] = [
  bashTool,
  fileRead,
  strReplace,
  fileWrite,
  loadSkill,
];

export const registry: Record<string, Tool<any, unknown>> = Object.fromEntries(
  tools.map((tool) => [tool.name, tool]),
);

export function generateToolsArray(): ToolSpec[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters),
  }));
}

export async function runTool(
  name: string,
  args: string,
  ctx: ToolContext,
): Promise<string> {
  const tool = registry[name];

  if (!tool) {
    return `Error: unknown tool "${name}"`;
  }

  let jsonParsed: unknown;
  try {
    jsonParsed = JSON.parse(args);
  } catch {
    return `Error: malformed JSON arguments for tool "${name}": ${args}`;
  }

  const parsedArgs = tool.parameters.safeParse(jsonParsed);
  if (!parsedArgs.success) {
    return `Error: invalid arguments for tool "${name}": ${parsedArgs.error.message}`;
  }

  const allowedToRun: Allowed = await checkPermission(
    tool,
    parsedArgs.data,
    ctx.session.permissions,
    ctx.asker,
  );

  if (!allowedToRun.ok)
    return `Not allowed to run tool: ${name}, reason: ${allowedToRun.reason}`;

  try {
    const run = await tool.execute(parsedArgs.data, ctx.signal);
    return JSON.stringify(truncateStrings(run, ctx.maxOutputChars));
  } catch (error) {
    const message = error instanceof Error ? error.message : error;
    return truncateStrings(
      `Error: tool "${name}" failed: ${message}`,
      ctx.maxOutputChars,
    ) as string;
  }
}
