import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storeTailoredDocs } from "@/lib/tailored-docs";

// Dépôt manuel, depuis la fiche offre, du CV et de la lettre générés par le skill
// « postuler » (quand le skill ne peut pas joindre l'API lui-même).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const res = await storeTailoredDocs(supabase, user.id, id, form);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ id, ...res.update });
}
