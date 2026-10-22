import type { Result } from "../types";

export function updateProfile(input: {
  name: string;
  email: string;
  bio: string;
}): Result {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 50)
    return { ok: false, error: "name must be 2-50 characters" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    return { ok: false, error: "invalid email" };
  if (input.bio.length > 160)
    return { ok: false, error: "bio must be at most 160 characters" };
  return { ok: true };
}
