import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Accès réservé au skill Claude « postuler » : un jeton fixe (SKILL_API_TOKEN),
// rattaché à un seul utilisateur (SKILL_USER_ID). Les routes /api/skill/* ne
// touchent que les offres de cet utilisateur, via le client service-role.
export function skillAuth(request: Request) {
  const expected = process.env.SKILL_API_TOKEN ?? "";
  const userId = process.env.SKILL_USER_ID ?? "";
  if (expected.length < 32 || !userId) {
    return {
      error: NextResponse.json({ error: "API skill non configurée" }, { status: 503 }),
    } as const;
  }

  const header = request.headers.get("authorization") ?? "";
  const given = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { error: NextResponse.json({ error: "Jeton invalide" }, { status: 401 }) } as const;
  }

  return { supabase: createServiceClient(), userId } as const;
}

export const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
