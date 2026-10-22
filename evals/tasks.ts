// eval tasks: one folder each under evals/tasks/
//   task.md   the instruction, sent to jig as written
//   repo/     the starting project, copied into a fresh folder for every try
//   setup.sh  optional, run in that folder before jig (e.g. generates big files)
//   tests/    optional hidden checks, copied in only after jig finishes
//   check.sh  run in that folder afterwards; exit 0 = solved
//   solution/ optional reference files laid over repo/; evals/validate.ts uses it

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type Task = {
  name: string;
  instruction: string;
  repoDir: string;
  testsDir: string | undefined;
  setupScript: string | undefined;
  checkScript: string;
  solutionDir: string | undefined;
};

function loadTask(dir: string): Task {
  const name = basename(dir);
  const need = (file: string): string => {
    const path = join(dir, file);
    if (!existsSync(path))
      throw new Error(`eval task "${name}" is missing ${file}`);
    return path;
  };
  const optional = (file: string) =>
    existsSync(join(dir, file)) ? join(dir, file) : undefined;
  return {
    name,
    instruction: readFileSync(need("task.md"), "utf-8").trim(),
    repoDir: need("repo"),
    testsDir: optional("tests"),
    setupScript: optional("setup.sh"),
    checkScript: need("check.sh"),
    solutionDir: optional("solution"),
  };
}

export function loadTasks(tasksDir: string): Task[] {
  return readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadTask(join(tasksDir, entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}
