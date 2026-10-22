import { appendToLog } from "./logger";
import { writeReport } from "./report";

export function handle(path: string): void {
  appendToLog(`GET ${path}`);
  writeReport([`served ${path}`]);
}
