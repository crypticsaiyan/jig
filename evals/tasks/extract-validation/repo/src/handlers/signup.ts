import type { Result } from "../types";

export function signup(input: {
  name: string;
  email: string;
  password: string;
}): Result {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 50)
    return { ok: false, error: "name must be 2-50 characters" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    return { ok: false, error: "invalid email" };
  if (input.password.length < 8)
    return { ok: false, error: "password must be at least 8 characters" };
  return { ok: true };
}
