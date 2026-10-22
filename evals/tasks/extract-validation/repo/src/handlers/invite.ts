import type { Result } from "../types";

export function invite(input: {
  name: string;
  email: string;
  role: string;
}): Result {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 50)
    return { ok: false, error: "name must be 2-50 characters" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    return { ok: false, error: "invalid email" };
  if (!["member", "admin"].includes(input.role))
    return { ok: false, error: "role must be member or admin" };
  return { ok: true };
}
