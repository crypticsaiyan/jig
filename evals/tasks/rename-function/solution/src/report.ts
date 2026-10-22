import { addNumbers } from "./math";

export function totalLine(items: number[]): string {
  return "total: " + items.reduce((acc, x) => addNumbers(acc, x), 0);
}
