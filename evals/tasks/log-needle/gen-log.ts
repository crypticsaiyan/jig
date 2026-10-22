// deterministic fake request log: many 500s that are fast, many slow 200s,
// and exactly one request that is both a 500 and slower than 2000 ms
import { mkdirSync, writeFileSync } from "node:fs";

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
const hex = () =>
  Math.floor(rand() * 2 ** 32)
    .toString(16)
    .padStart(8, "0");

const paths = [
  "/api/items",
  "/api/users",
  "/api/orders",
  "/health",
  "/api/cart",
];
const lines: string[] = [];
const start = Date.UTC(2024, 4, 1, 12, 0, 0);
for (let i = 0; i < 20000; i++) {
  const ts = new Date(start + i * 137).toISOString();
  let status = rand() < 0.02 ? 500 : pick([200, 200, 200, 201, 204, 404]);
  let duration = Math.floor(rand() * 400) + 5;
  if (rand() < 0.03) duration = 2001 + Math.floor(rand() * 3000); // slow ones
  if (status === 500 && duration > 2000) status = 200; // keep the needle unique
  if (i === 13377) [status, duration] = [500, 2843];
  const id = i === 13377 ? "c0ffee42" : hex();
  lines.push(
    `${ts} req=${id} method=${pick(["GET", "POST"])} path=${pick(paths)} status=${status} duration_ms=${duration}`,
  );
}
mkdirSync("logs", { recursive: true });
writeFileSync("logs/app.log", lines.join("\n") + "\n");
