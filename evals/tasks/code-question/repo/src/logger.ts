import { appendFileSync } from "node:fs";

export const logLevel = "info";

export function appendToLog(line: string): void {
  appendFileSync("app.log", `${new Date().toISOString()} ${line}\n`);
}
