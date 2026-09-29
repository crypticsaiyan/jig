import { truncate } from "../util";

// recursively truncate the string output
export function truncateStrings(value: unknown, max: number): unknown {
  if (typeof value === "string") return truncate(value, max);
  if (Array.isArray(value))
    return value.map((item) => truncateStrings(item, max));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        truncateStrings(val, max),
      ]),
    );
  }
  return value;
}
