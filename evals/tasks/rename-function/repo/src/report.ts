import { calc } from "./math";

export function totalLine(items: number[]): string {
  return "total: " + items.reduce((acc, x) => calc(acc, x), 0);
}
