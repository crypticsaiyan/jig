import type { Result } from "../types";
import { validateUser } from "../validation";

export function invite(input: {
  name: string;
  email: string;
  role: string;
}): Result {
  const user = validateUser(input);
  if (!user.ok) return user;
  if (!["member", "admin"].includes(input.role))
    return { ok: false, error: "role must be member or admin" };
  return { ok: true };
}
