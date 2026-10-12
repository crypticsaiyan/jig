import type { Tool } from "../types";
import { promisify } from "node:util";
import { exec } from "node:child_process";
import z from "zod";
import { TOOLS } from "../../config";

const execAsync = promisify(exec);

type ExecFailure = Error & {
  code?: number | string;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
};

export const bashTool: Tool<
  { command: z.ZodString },
  { stdout: string; stderr: string; exitCode: number }
> = {
  name: "bash",
  description:
    "Run a shell command in the project directory. Returns stdout, stderr and exitCode; a failing command (non-zero exitCode) still returns its output, so read stderr to fix the problem. Use it for search (grep, find, ls), running tests, typecheck and other non-interactive commands. Output is truncated if long, so narrow the command (head, grep, wc). No interactive commands. Pipes, chaining (&&, ;, |) and redirects need user approval each time, so prefer single simple commands.",
  parameters: z.object({
    command: z.string().describe("single non-interactive shell command to run"),
  }),
  getPermissionKey: ({ command }) => ({ kind: "command", value: command }),
  execute: async ({ command }, signal) => {
    try {
      const { stdout, stderr } = await execAsync(command, {
        signal,
        maxBuffer: TOOLS.bashMaxBufferBytes,
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const failure = error as ExecFailure;
      if (typeof failure.code === "number") {
        return {
          stdout: failure.stdout ?? "",
          stderr: failure.stderr ?? "",
          exitCode: failure.code,
        };
      }

      const reason = failure.signal
        ? `killed by ${failure.signal}`
        : (failure.message ?? String(error));
      throw new Error(`Bash execution failed: ${reason}`);
    }
  },
};
