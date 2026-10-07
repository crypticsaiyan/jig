import type { Session } from "./types";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";

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
  const dir = `${process.cwd()}/.jig/sessions`;
  await mkdir(dir, { recursive: true });

  const savePath = `${dir}/${session.id.replace(/[:.]/g, "-")}.json`;
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
