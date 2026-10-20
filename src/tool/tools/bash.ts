import type { Tool } from "../types";
import { promisify } from "node:util";
import { exec, execFile } from "node:child_process";
import z from "zod";
import { TOOLS } from "../../config";
import { sandboxArgs } from "../../sandbox/bwrap";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

type ExecFailure = Error & {
  code?: number | string;
  signal?: string | null;
  stdout?: string;
  stderr?: string;
};

export const bashTool: Tool<
  { command: z.ZodString; unsandboxed: z.ZodOptional<z.ZodBoolean> },
  { stdout: string; stderr: string; exitCode: number }
> = {
  name: "bash",
  description:
    "Run a shell command in the project directory. Returns stdout, stderr and exitCode; a failing command (non-zero exitCode) still returns its output, so read stderr to fix the problem. Use it for search (grep, find, ls), running tests, typecheck and other non-interactive commands. Output is truncated if long, so narrow the command (head, grep, wc). No interactive commands. Commands run in a sandbox when available: the project and /tmp are writable, the rest of the filesystem is read-only, secrets are hidden and there is no network. Pipes and chaining are fine inside it. Without the sandbox, pipes, chaining and redirects need user approval, so prefer simple commands. If a command needs network (installing packages, git fetch/push) or files outside the project, set unsandboxed: true; the user is asked first.",
  parameters: z.object({
    command: z.string().describe("single non-interactive shell command to run"),
    unsandboxed: z
      .boolean()
      .optional()
      .describe(
        "run outside the sandbox; only for network access or files outside the project",
      ),
  }),
  getPermissionKey: ({ command, unsandboxed }) => ({
    kind: unsandboxed ? "command" : "sandboxed",
    value: command,
  }),
  execute: async ({ command, unsandboxed }, ctx) => {
    const options = {
      signal: ctx.signal,
      maxBuffer: TOOLS.bashMaxBufferBytes,
    };
    try {
      const { stdout, stderr } =
        ctx.permissions.sandbox && !unsandboxed
          ? await execFileAsync(
              "bwrap",
              sandboxArgs(command, ctx.permissions.projectRoot),
              options,
            )
          : await execAsync(command, options);
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
