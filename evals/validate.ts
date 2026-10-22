// checks the eval tasks themselves, without calling any model:
// the untouched repo must fail its check, and repo + solution/ must pass it
// usage: bun evals/validate.ts

import { join } from "node:path";
import { prepare, runCheck } from "./run";
import { loadTasks } from "./tasks";

let broken = 0;
for (const task of loadTasks(join(import.meta.dir, "tasks"))) {
  const untouched = await runCheck(task, await prepare(task));
  const solved = task.solutionDir
    ? await runCheck(task, await prepare(task, task.solutionDir))
    : undefined;

  const problems = [
    untouched.code === 0 && "passes without any change",
    !solved && "has no solution/",
    solved &&
      solved.code !== 0 &&
      `solution fails:\n${solved.stdout}${solved.stderr}`,
  ].filter(Boolean);
  if (problems.length) broken++;
  console.log(
    `${problems.length ? "BROKEN" : "ok    "} ${task.name}${problems.map((p) => `\n       ${p}`).join("")}`,
  );
}
process.exit(broken ? 1 : 0);
