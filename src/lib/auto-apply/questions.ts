import { createHash } from "node:crypto";

// Questions d'un formulaire de candidature, telles que l'extension les décrit.

export const QUESTION_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export type FormQuestion = {
  id: string;
  label: string;
  type: QuestionType;
  options: string[];
  required: boolean;
};

const MAX_QUESTIONS = 25;
const MAX_LABEL = 400;
const MAX_OPTIONS = 80;
const MAX_OPTION = 160;

export function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Valide et nettoie le corps envoyé par l'extension : on ne fait pas confiance
// à la forme des données, elles finissent dans un prompt et dans la base.
export function parseQuestions(raw: unknown): FormQuestion[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_QUESTIONS) {
    return null;
  }

  const questions: FormQuestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const q = item as Record<string, unknown>;

    if (typeof q.id !== "string" || !q.id || q.id.length > 64) return null;
    if (typeof q.label !== "string" || !q.label.trim()) return null;
    if (!QUESTION_TYPES.includes(q.type as QuestionType)) return null;

    const options = Array.isArray(q.options)
      ? q.options
          .filter((o): o is string => typeof o === "string" && o.trim() !== "")
          .slice(0, MAX_OPTIONS)
          .map((o) => o.trim().slice(0, MAX_OPTION))
      : [];

    questions.push({
      id: q.id,
      label: q.label.trim().slice(0, MAX_LABEL),
      type: q.type as QuestionType,
      options,
      required: q.required === true,
    });
  }
  return questions;
}

export function questionKey(q: Pick<FormQuestion, "label" | "type" | "options">) {
  const options = q.options.map(normalizeText).sort().join("¦");
  return createHash("sha1")
    .update(`${q.type}|${normalizeText(q.label)}|${options}`)
    .digest("hex");
}

// Questions dont la bonne réponse dépend de l'offre (motivation, lettre…) :
// on ne les met jamais en cache, sinon la réponse d'une entreprise serait
// recopiée telle quelle chez une autre.
const JOB_SPECIFIC =
  /pourquoi|why|motivation|motiv|cette (offre|entreprise|societe|poste)|ce poste|this (role|position|company|job)|notre (entreprise|societe)|our company|rejoindre|join us|lettre|cover letter|parlez|tell us|decri|describe/;

export function isCacheable(q: Pick<FormQuestion, "label" | "type">) {
  if (q.type === "textarea") return false;
  return !JOB_SPECIFIC.test(normalizeText(q.label));
}

// Retrouve, parmi les options proposées, celle qui correspond à la réponse
// donnée (exacte, puis approchée). null si aucune ne colle : on ne force jamais
// un choix au hasard.
export function matchOption(answer: string, options: string[]): string | null {
  const target = normalizeText(answer);
  if (!target) return null;

  const normalized = options.map((o) => ({ option: o, norm: normalizeText(o) }));
  const exact = normalized.find((o) => o.norm === target);
  if (exact) return exact.option;

  const starts = normalized.filter((o) => o.norm.startsWith(target));
  if (starts.length === 1) return starts[0].option;

  const contains = normalized.filter(
    (o) => o.norm.includes(target) || (o.norm.length >= 3 && target.includes(o.norm)),
  );
  if (contains.length === 1) return contains[0].option;

  return null;
}
