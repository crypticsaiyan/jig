import type { Result } from "../types";
import { validateUser } from "../validation";

export function signup(input: {
  name: string;
  email: string;
  password: string;
}): Result {
  const user = validateUser(input);
  if (!user.ok) return user;
  if (input.password.length < 8)
    return { ok: false, error: "password must be at least 8 characters" };
  return { ok: true };
}
