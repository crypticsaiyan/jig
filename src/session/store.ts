import type { Session } from "./types";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";

const SESSION_DIR = `${process.cwd()}/.jig/sessions`;

export function createSession(title: string): Session {
  return {
    id: new Date().toISOString(),
    createdAt: Date.now().toString(),
    updatedAt: Date.now().toString(),
    title,
    state: undefined,
  };
}

export async function saveSession(session: Session): Promise<void> {
  await mkdir(SESSION_DIR, { recursive: true });

  const savePath = `${SESSION_DIR}/${session.id.replace(/[:.]/g, "-")}.json`;
  const tmpPath = `${savePath}.tmp`; // atomic write

  try {
    await writeFile(tmpPath, JSON.stringify(session));
    await rename(tmpPath, savePath);
  } catch (error) {
    await rm(tmpPath, { force: true });
    throw new Error(
      `unable to save session: ${error instanceof Error ? error.message : error}`,
    );
  }
}

// newest saved session, or undefined if there is none or it can't be read
export async function loadLatestSession(): Promise<Session | undefined> {
  let files: string[];
  try {
    files = await readdir(SESSION_DIR);
  } catch {
    return undefined; // folder doesn't exist yet
  }

  // alphabetical order
  const latest = files
    .filter((f) => f.endsWith(".json"))
    .sort()
    .at(-1);
  if (!latest) return undefined;

  try {
    const raw = await readFile(`${SESSION_DIR}/${latest}`, "utf-8");
    return JSON.parse(raw) as Session;
  } catch {
    return undefined; // unreadable or broken JSON
  }
}
