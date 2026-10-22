// per-task and overall numbers for one eval run

export type RunResult = {
  task: string;
  attempt: number;
  passed: boolean;
  stopReason: string; // jig's, or "timeout" / "crash" when it didn't finish
  tokens: number; // includes sub-agents (budgetUsed)
  iterations: number;
  toolCalls: number;
  durationMs: number;
  error?: string; // why jig or the check couldn't run
  checkOutput: string; // tail of check.sh output
  jigLog?: string; // tail of jig's tool log (stderr), kept for failed or timed-out runs
  workDir?: string; // kept for failed runs, to look at what jig left
};

export type TaskSummary = {
  task: string;
  tries: number;
  passes: number;
  passAt1: number; // share of tries that passed
  passAll: boolean; // pass^k: every try passed
  avgTokens: number;
  avgSeconds: number;
  avgIterations: number;
};

export type Summary = {
  tasks: TaskSummary[];
  passAt1: number; // average over tasks
  passAny: number; // pass@k: share of tasks solved at least once
  passAll: number; // pass^k: share of tasks solved on every try
  totalTokens: number;
};

const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function summarize(results: RunResult[]): Summary {
  const names = [...new Set(results.map((r) => r.task))];
  const tasks = names.map((task): TaskSummary => {
    const runs = results.filter((r) => r.task === task);
    const passes = runs.filter((r) => r.passed).length;
    return {
      task,
      tries: runs.length,
      passes,
      passAt1: passes / runs.length,
      passAll: passes === runs.length,
      avgTokens: avg(runs.map((r) => r.tokens)),
      avgSeconds: avg(runs.map((r) => r.durationMs / 1000)),
      avgIterations: avg(runs.map((r) => r.iterations)),
    };
  });
  return {
    tasks,
    passAt1: avg(tasks.map((t) => t.passAt1)),
    passAny: avg(tasks.map((t) => (t.passes > 0 ? 1 : 0))),
    passAll: avg(tasks.map((t) => (t.passAll ? 1 : 0))),
    totalTokens: results.reduce((sum, r) => sum + r.tokens, 0),
  };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const k = (n: number) => `${(n / 1000).toFixed(1)}k`;

export function formatReport(summary: Summary, tries: number): string {
  const rows = summary.tasks.map((t) =>
    [
      t.task.padEnd(22),
      `${t.passes}/${t.tries}`.padStart(5),
      k(t.avgTokens).padStart(8),
      `${t.avgSeconds.toFixed(0)}s`.padStart(6),
      t.avgIterations.toFixed(1).padStart(6),
    ].join("  "),
  );
  const header = [
    "task".padEnd(22),
    "pass",
    "  tokens",
    "  time",
    " iters",
  ].join("  ");
  return [
    header,
    ...rows,
    "-".repeat(header.length),
    `pass@1 ${pct(summary.passAt1)}   pass@${tries} ${pct(summary.passAny)}   pass^${tries} ${pct(summary.passAll)}   total tokens ${k(summary.totalTokens)}`,
  ].join("\n");
}
