import { createClient as createTokenClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "./server";

// Résout l'utilisateur d'une requête API en supportant deux modes d'auth :
//  - Bearer token (extension Chrome) : `Authorization: Bearer <access_token>`
//  - Cookies Supabase (app web / dashboard)
// Renvoie un client Supabase déjà contextualisé (RLS) + l'utilisateur.
export async function supabaseFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    const supabase = createTokenClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );
    const { data: { user } } = await supabase.auth.getUser(token);
    return { supabase, user };
  }

  const supabase = await createCookieClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
