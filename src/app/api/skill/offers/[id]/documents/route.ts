import { NextResponse } from "next/server";
import { skillAuth, UUID_RX } from "@/lib/skill-auth";
import { storeTailoredDocs } from "@/lib/tailored-docs";

// POST multipart { cv?: PDF, letter?: PDF } : dépose le CV et/ou la lettre adaptés
// de l'offre. L'extension les utilise ensuite à la place du CV générique du profil.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = skillAuth(request);
  if ("error" in auth) return auth.error;
  const { id } = await params;
  if (!UUID_RX.test(id)) return NextResponse.json({ error: "id invalide" }, { status: 400 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data attendu" }, { status: 400 });
  }

  const res = await storeTailoredDocs(auth.supabase, auth.userId, id, form);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ id, ...res.update });
}
