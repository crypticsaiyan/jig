import type { Result } from "../types";
import { validateUser } from "../validation";

export function updateProfile(input: {
  name: string;
  email: string;
  bio: string;
}): Result {
  const user = validateUser(input);
  if (!user.ok) return user;
  if (input.bio.length > 160)
    return { ok: false, error: "bio must be at most 160 characters" };
  return { ok: true };
}
