import type { Tool } from "../types";
import { promisify } from "node:util";
import { exec, execFile } from "node:child_process";
import z from "zod";
import { SANDBOX, TOOLS } from "../../config";
import { sandboxArgs } from "../../sandbox/bwrap";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

type ExecFailure = Error & {
  killed?: boolean;
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
  description: `Run a shell command in the project directory. Returns stdout, stderr and exitCode; a failing command (non-zero exitCode) still returns its output, so read stderr to fix the problem. Use it for search (grep, find, ls), running tests, typecheck and other non-interactive commands. Output is truncated if long, so narrow the command (head, grep, wc). No interactive commands; stdin is closed and commands are killed after ${TOOLS.bashTimeoutMs / 1000}s, so don't start servers or watch modes. Commands run in a sandbox when available: the project and /tmp are writable, the rest of the filesystem is read-only, secrets are hidden and the only network is HTTPS to ${SANDBOX.allowedDomains.join(", ")} (when available), enough for package installs and git clone over https. Pipes and chaining are fine inside it. Without the sandbox, pipes, chaining and redirects need user approval, so prefer simple commands. If a command needs other sites, git over ssh, git push, or files outside the project, set unsandboxed: true; the user is asked first.`,
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
    kind: unsandboxed ? "bash-unsandboxed" : "bash",
    value: command,
  }),
  execute: async ({ command, unsandboxed }, ctx) => {
    const options = {
      signal: ctx.signal,
      maxBuffer: TOOLS.bashMaxBufferBytes,
      timeout: TOOLS.bashTimeoutMs,
    };
    try {
      const running =
        ctx.permissions.sandbox && !unsandboxed
          ? execFileAsync(
              "bwrap",
              sandboxArgs(
                command,
                ctx.permissions.projectRoot,
                ctx.permissions.network,
              ),
              options,
            )
          : execAsync(command, options);
      running.child.stdin?.end(); // nothing to read: commands waiting for input end now
      const { stdout, stderr } = await running;
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const failure = error as ExecFailure;
      // killed by our timeout (ctrl-c aborts instead and is rethrown below)
      if (failure.killed && !ctx.signal.aborted) {
        return {
          stdout: failure.stdout ?? "",
          stderr: `${failure.stderr ?? ""}\n[jig: killed after ${TOOLS.bashTimeoutMs / 1000}s. Don't run watch modes, servers or other commands that keep running]`,
          exitCode: 124,
        };
      }
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
