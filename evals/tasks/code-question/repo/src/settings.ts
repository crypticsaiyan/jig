import { readFileSync } from "node:fs";

export function readSettings(): Record<string, string> {
  return JSON.parse(readFileSync("settings.json", "utf-8"));
}
