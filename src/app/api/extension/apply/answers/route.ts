import { NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase/from-request";
import { answerFormQuestions } from "@/lib/openai/answers";
import { loadPreferences } from "@/lib/auto-apply/preferences";
import {
  isCacheable,
  matchOption,
  normalizeText,
  parseQuestions,
  questionKey,
  type FormQuestion,
} from "@/lib/auto-apply/questions";
import { parseLanguage, pickCv } from "@/lib/auto-apply/cv";

// Répond aux questions d'une étape de formulaire. Ordre de résolution :
//  1. la banque de réponses (réponses déjà données ou corrigées par l'utilisateur) ;
//  2. la lettre de motivation déjà rédigée sur le site pour cette offre ;
//  3. l'IA, à partir du CV (dans la langue demandée) et des préférences.
// Toute réponse qui ne colle pas aux options proposées est renvoyée à null :
// l'extension laisse alors le champ à l'utilisateur.

type Answer = { id: string; answer: string | null; source: "bank" | "letter" | "ai" | null };

const COVER_LETTER = /lettre|cover letter|motivation/;

// Ramène une réponse brute à une valeur exploitable pour le type de champ.
function coerce(question: FormQuestion, raw: string): string | null {
  switch (question.type) {
    case "select":
    case "radio":
      return matchOption(raw, question.options);
    case "checkbox": {
      const v = raw.trim().toLowerCase();
      if (["yes", "oui", "true", "1"].includes(v)) return "yes";
      if (["no", "non", "false", "0"].includes(v)) return "no";
      return null;
    }
    case "number": {
      const m = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
      return m ? m[0] : null;
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? raw.trim() : null;
    default:
      return raw.trim() || null;
  }
}

export async function POST(request: Request) {
  const { supabase, user } = await supabaseFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Non connecté. Connecte-toi depuis l'extension." },
      { status: 401 }
    );
  }

  let body: { offerId?: unknown; questions?: unknown; context?: unknown; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const questions = parseQuestions(body.questions);
  if (!questions) {
    return NextResponse.json({ error: "Questions invalides" }, { status: 400 });
  }

  const offerId = typeof body.offerId === "string" ? body.offerId : null;
  const language = parseLanguage(body.language);

  const [{ data: profile }, preferences, offerResult] = await Promise.all([
    // "*" : tolère un déploiement qui précède la migration du CV anglais.
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    loadPreferences(supabase, user.id),
    offerId
      ? supabase
          .from("offers")
          .select("title, company, raw_text, summary, cover_letter_text")
          .eq("id", offerId)
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  // Le CV de la langue demandée, sinon l'autre : voir pickCv.
  const cv = profile ? pickCv(profile, language, "text") : null;
  if (!profile || !cv?.text) {
    return NextResponse.json(
      { error: "Renseigne d'abord ton CV dans ton profil" },
      { status: 400 }
    );
  }

  const keyed = questions.map((q) => ({ q, key: questionKey(q) }));
  const results = new Map<string, Answer>();

  // 1. Banque de réponses.
  const { data: bank } = await supabase
    .from("answer_bank")
    .select("question_key, answer")
    .eq("user_id", user.id)
    .in("question_key", keyed.map((k) => k.key));

  const bankAnswers = new Map((bank ?? []).map((b) => [b.question_key, b.answer as string]));
  for (const { q, key } of keyed) {
    const stored = bankAnswers.get(key);
    const value = stored !== undefined ? coerce(q, stored) : null;
    if (value !== null) results.set(q.id, { id: q.id, answer: value, source: "bank" });
  }

  // 2. Lettre de motivation déjà écrite (et relue) sur le site pour cette offre :
  // on la colle telle quelle plutôt que d'en faire générer une autre.
  const savedLetter = offerResult.data?.cover_letter_text?.trim();
  if (savedLetter) {
    for (const { q } of keyed) {
      if (!results.has(q.id) && q.type === "textarea" && COVER_LETTER.test(normalizeText(q.label))) {
        results.set(q.id, { id: q.id, answer: savedLetter, source: "letter" });
      }
    }
  }

  // 3. IA pour le reste.
  const pending = keyed.filter(({ q }) => !results.has(q.id));
  if (pending.length > 0) {
    // Pour une page hors offre (bouton « Remplir ce formulaire »), l'extension
    // n'a pas d'offre enregistrée mais peut donner le titre de la page.
    const offer = offerResult.data
      ? {
          title: offerResult.data.title,
          company: offerResult.data.company,
          text: offerResult.data.raw_text || offerResult.data.summary,
        }
      : typeof body.context === "string"
        ? { title: body.context.slice(0, 300) }
        : null;

    let generated: Map<string, string | null>;
    try {
      generated = await answerFormQuestions(
        {
          cvText: cv.text,
          additionalSkills: profile.additional_skills,
          preferences,
          offer,
          language,
        },
        pending.map((p) => p.q)
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Erreur IA inconnue" },
        { status: 502 }
      );
    }

    const toStore: {
      user_id: string;
      question_key: string;
      question: string;
      type: string;
      options: string[];
      answer: string;
      source: "ai";
    }[] = [];

    for (const { q, key } of pending) {
      const raw = generated.get(q.id);
      const value = raw ? coerce(q, raw) : null;
      results.set(q.id, { id: q.id, answer: value, source: value === null ? null : "ai" });

      if (value !== null && isCacheable(q)) {
        toStore.push({
          user_id: user.id,
          question_key: key,
          question: q.label,
          type: q.type,
          options: q.options,
          answer: value,
          source: "ai",
        });
      }
    }

    if (toStore.length > 0) {
      // ignoreDuplicates : une réponse corrigée à la main ne doit jamais être
      // écrasée par une nouvelle réponse de l'IA.
      await supabase
        .from("answer_bank")
        .upsert(toStore, { onConflict: "user_id,question_key", ignoreDuplicates: true });
    }
  }

  return NextResponse.json({
    answers: questions.map((q) => results.get(q.id) ?? { id: q.id, answer: null, source: null }),
  });
}
