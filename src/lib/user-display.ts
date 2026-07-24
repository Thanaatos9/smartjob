import type { User } from "@supabase/supabase-js";

export function userDisplayName(user: User | null): string | null {
  if (!user) return null;
  const fullName = (user.user_metadata?.full_name as string | undefined)?.trim();
  return fullName || user.email || null;
}
