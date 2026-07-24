import { createClient } from "@supabase/supabase-js";

// Client Supabase service-role (contourne la RLS) : réservé au travail serveur
// interne (ex. calcul du score de correspondance) qui n'a pas de contexte de
// requête (cookies) à réutiliser.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
