import type { Tool } from "../types";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import z from "zod";

export const bashTool: Tool<
  { command: z.ZodString },
  { stdout: string; stderr: string }
> = {
  name: "bash",
  description:
    "Run a shell command in the project directory and return stdout and stderr. Use it for search (grep, find, ls), running tests, typecheck and other non-interactive commands. A non-zero exit returns an Error. Output is truncated if long, so narrow the command (head, grep, wc). No interactive commands. Pipes, chaining (&&, ;, |) and redirects need user approval each time, so prefer single simple commands.",
  parameters: z.object({
    command: z.string().describe("single non-interactive shell command to run"),
  }),
  getPermissionKey: ({ command }) => ({ kind: "command", value: command }),
  execute: async ({ command }, signal) => {
    try {
      const execAsync = promisify(exec);
      return await execAsync(command, { signal });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Bash execution failed: ${error.message}`);
      }
      throw new Error("Bash execution failed");
    }
  },
};
