// runs every eval task through headless jig and reports what got solved
// usage: bun evals/run.ts [--tries 3] [--only task-a,task-b]

import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG } from "../src/config";
import { sandboxAvailable } from "../src/sandbox/bwrap";
import { formatReport, summarize, type RunResult } from "./report";
import { loadTasks, type Task } from "./tasks";

const JIG = join(import.meta.dir, "../src/index.tsx");
const JIG_TIMEOUT_MS = 5 * 60_000;
const CHECK_TIMEOUT_MS = 60_000;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

// runs a command, killing it after timeoutMs
export async function run(cmd: string[], cwd: string, timeoutMs: number) {
  const proc = Bun.spawn(cmd, {
    cwd,
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);
  return { stdout, stderr, code, timedOut };
}

// fresh copy of the starting repo, plus whatever setup.sh generates
export async function prepare(task: Task, overlay?: string): Promise<string> {
  const work = mkdtempSync(join(tmpdir(), `jig-eval-${task.name}-`));
  cpSync(task.repoDir, work, { recursive: true });
  if (overlay) cpSync(overlay, work, { recursive: true });
  if (task.setupScript) {
    const setup = await run(["bash", task.setupScript], work, CHECK_TIMEOUT_MS);
    if (setup.code !== 0)
      throw new Error(`${task.name}: setup.sh failed: ${setup.stderr}`);
  }
  return work;
}

// hidden checks arrive only now, so jig could never read or edit them
export function runCheck(task: Task, work: string) {
  if (task.testsDir)
    cpSync(task.testsDir, join(work, "tests_hidden"), { recursive: true });
  return run(["bash", task.checkScript], work, CHECK_TIMEOUT_MS);
}

const tail = (text: string, lines = 15) =>
  text.trim().split("\n").slice(-lines).join("\n");

async function attempt(task: Task, n: number): Promise<RunResult> {
  // fresh copy every try, so no run sees another's changes
  const work = await prepare(task);

  const start = performance.now();
  const jig = await run(
    ["bun", JIG, "-p", task.instruction, "--json", "--allow-edits"],
    work,
    JIG_TIMEOUT_MS,
  );
  const durationMs = performance.now() - start;

  let out: Record<string, any> = {};
  let error: string | undefined;
  try {
    out = JSON.parse(jig.stdout.trim().split("\n").at(-1) ?? "");
  } catch {
    error = jig.timedOut
      ? "jig timed out"
      : `jig printed no JSON: ${tail(jig.stderr, 5)}`;
  }

  const check = await runCheck(task, work);
  const passed = check.code === 0 && !check.timedOut;

  // keep failed attempts for a look, drop passed ones
  if (passed) rmSync(work, { recursive: true, force: true });

  return {
    task: task.name,
    attempt: n,
    passed,
    stopReason: jig.timedOut ? "timeout" : (out.stopReason ?? "crash"),
    tokens: out.budgetUsed ?? 0,
    costUsd: out.costUsd ?? 0,
    iterations: out.iterations ?? 0,
    toolCalls: Array.isArray(out.tools) ? out.tools.length : 0,
    durationMs,
    ...(error ? { error } : {}),
    checkOutput: tail(check.stdout + check.stderr),
    ...(passed && !jig.timedOut ? {} : { jigLog: tail(jig.stderr, 30) }),
    ...(passed ? {} : { workDir: work }),
  };
}

if (import.meta.main) await main();

async function main(): Promise<void> {
  const tries = Number(flag("--tries") ?? 1);
  const only = flag("--only")?.split(",");

  if (!(await sandboxAvailable())) {
    console.error(
      "evals need a working bwrap sandbox: jig runs unattended here",
    );
    process.exit(1);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error(
      "OPENROUTER_API_KEY is not set (run from the jig root so .env loads)",
    );
    process.exit(1);
  }

  const tasks = loadTasks(join(import.meta.dir, "tasks")).filter(
    (t) => !only || only.includes(t.name),
  );
  console.log(
    `${tasks.length} tasks x ${tries} tries, model ${CONFIG.loopModel}\n`,
  );

  const results: RunResult[] = [];
  for (const task of tasks) {
    for (let n = 1; n <= tries; n++) {
      const r = await attempt(task, n);
      results.push(r);
      console.log(
        `${task.name} ${n}/${tries}: ${r.passed ? "pass" : "FAIL"}  ${(r.durationMs / 1000).toFixed(0)}s  ${(r.tokens / 1000).toFixed(1)}k tokens  $${r.costUsd.toFixed(4)}  ${r.stopReason}${r.error ? `  (${r.error})` : ""}`,
      );
    }
  }

  const summary = summarize(results);
  console.log(`\n${formatReport(summary, tries)}`);

  const commit = (
    await run(["git", "rev-parse", "--short", "HEAD"], import.meta.dir, 5000)
  ).stdout.trim();
  const resultsDir = join(import.meta.dir, "results"); // gitignored
  mkdirSync(resultsDir, { recursive: true });
  const file = join(
    resultsDir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  writeFileSync(
    file,
    JSON.stringify(
      {
        date: new Date().toISOString(),
        model: CONFIG.loopModel,
        commit,
        tries,
        summary,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\nsaved ${file}`);
}
