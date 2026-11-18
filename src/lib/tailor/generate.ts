import type { CvProfile, Lang, TailoredContent } from "./types";

// Rédaction du CV et de la lettre adaptés à une offre, par l'API OpenAI.
// Le modèle ne renvoie que du contenu (puces, accroche, lettre…) : l'ordre, les
// dates et la mise en page viennent du profil structuré et du rendu PDF.

const SYSTEM = `Tu rédiges le CV et la lettre de motivation d'un candidat pour UNE offre d'emploi précise.
Tu reçois son profil structuré (seule source de vérité) et le texte de l'offre. Réponds UNIQUEMENT avec un objet JSON.

RÈGLES INVIOLABLES
1. Aucune invention. Chaque affirmation est traçable aux "faits", "competences" ou "extras" du profil. Reformuler dans le vocabulaire de l'offre : oui. Ajouter une compétence, un chiffre, un outil, une mission ou un secteur absents du profil : jamais. Les chiffres sont recopiés tels quels depuis les faits (ou "duree_mois" pour une durée) : jamais de chiffre calculé ou estimé.
2. Tu ne choisis jamais l'ordre ni les dates des expériences : tu écris seulement les puces de chacune.
3. Pas de tiret cadratin. Ponctuation française classique : virgules, deux-points, parenthèses, point médian pour les listes.
4. Ton sobre et factuel. À bannir : "votre entreprise leader", "passionné depuis toujours", "mettre mes compétences au service de".

ÉTAPES
0. "entreprise", "intitule" (intitulé exact du poste) et "lieu" : lus dans l'offre (le texte peut contenir le menu et le pied de page du site, ignore-les). "" si introuvable.
A. Mots-clés ATS de l'offre, dans sa graphie exacte : "obligatoires" (bloc profil recherché, répétés, présents dans l'intitulé, 5 à 10), "souhaites" (cités une fois), "absents" (demandés mais absents du profil : ils n'apparaissent JAMAIS dans le CV ni la lettre).
B. "score" sur 100 : couverture des exigences réelles (60), mots-clés présents dans le profil (25), séniorité et contrat (15). Sois honnête, ne gonfle pas.
C. Axe : si le profil contient des "axes", en choisir UN (par l'intitulé, vérifié sur les exigences réelles) et reprendre son "developpee", son "appui" et son ordre de compétences. Sinon, choisir toi-même l'expérience la plus pertinente (developpee) et la deuxième (appui).
D. "titre" : tombe sur l'intitulé de l'offre sans le recopier mot pour mot s'il ne correspond pas au profil.
E. "accroche" : 3 lignes maximum, ce que fait le candidat, sa formation, sa stack, avec 3 à 5 mots-clés obligatoires dans des phrases. Si l'expérience développée n'est pas la plus récente, la nommer ici.
F. "puces" : un tableau par id d'expérience, pour TOUTES les expériences. 4 puces pour developpee, 3 pour appui, 2 pour les autres. Chacune réécrit un ou plusieurs faits sous l'angle de l'axe, en remplaçant les mots du candidat par ceux de l'offre quand ils désignent la même réalité (ex. "n8n, Make" → "automatisation des processus" ; "onboarding de clients" → "account management" ; "Power BI" → "reporting, tableaux de bord"). Chaque puce garde le chiffre de son fait. Une puce fait 1 à 2 lignes.
G. "competences" : 4 lignes {label, items}, dans l'ordre de l'axe, items séparés par " · ". Retirer les outils hors sujet plutôt qu'en ajouter.
H. Placement des obligatoires : titre, accroche, puces, puis compétences. Chacun 2 fois maximum dans le CV. Cible : 100 % des obligatoires présents dans le profil, 60 % des souhaités.
I. "formation" : ids à afficher (toutes par défaut). "autre" : une ligne tirée des extras si elle parle à l'offre, sinon "".
J. "photo" : false seulement si le poste est basé au Royaume-Uni, en Irlande, aux États-Unis, au Canada, en Australie, dans le secteur public allemand, ou si l'offre indique explicitement une candidature via Workday ou Taleo. Une offre rédigée en anglais pour un poste en France garde la photo. Sinon true. "photo_raison" : la raison en une courte phrase si false, sinon "".
K. "lang" : "en" si l'offre est rédigée en anglais (CV et lettre alors en anglais), sinon "fr".
L. "recruteur" et "contact_recruteur" : seulement s'ils sont écrits dans l'offre, sinon null. Ne jamais deviner.
M. "lettre" : "appel" ("Madame, Monsieur," ou "Madame X," / "Monsieur X," si le recruteur est connu ; en anglais "Dear Hiring Manager,") et 5 "paragraphes", 300 à 380 mots au total :
   §1 un constat sur l'enjeu du secteur ou du métier (2 phrases), puis "C'est pourquoi le poste de [intitulé] chez [entreprise] m'a immédiatement interpellé."
   §2 l'expérience développée, un résultat chiffré, les compétences dans les mots de l'offre.
   §3 l'expérience en appui, rattachée à une exigence précise.
   §4 un seul différenciateur tiré des extras, celui qui parle à cette entreprise.
   §5 disponibilité, puis demande d'échange.
   Pas d'en-tête, pas de formule de politesse finale (ajoutées automatiquement). Test : si la lettre marche encore en changeant le nom de l'entreprise, réécris §1 et §4.
N. "ecarts" : une phrase sur ce que l'offre demande et que le profil n'a pas.

FORMAT
{"entreprise":"","intitule":"","lieu":"","score":0,"lang":"fr","photo":true,"photo_raison":"","axe":"","titre":"","accroche":"","developpee":"<id>","appui":"<id>",
 "puces":{"<id>":["",""]},"competences":[{"label":"","items":""}],"formation":["<id>"],"autre":"",
 "mots_cles":{"obligatoires":[],"souhaites":[],"absents":[]},"ecarts":"","recruteur":null,"contact_recruteur":null,
 "lettre":{"appel":"","paragraphes":["","","","",""]}}`;

export async function generateTailoredContent(input: {
  profile: CvProfile;
  offer: { title: string | null; company: string | null; location: string | null; text: string };
  // Langue imposée par l'utilisateur ; sinon déduite de l'offre (étape K).
  lang?: Lang;
}): Promise<TailoredContent> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY n'est pas configuré");

  // La photo et les coordonnées ne servent pas à la rédaction.
  const { photo_path: _photo, photo_mode: _mode, identite, ...rest } = input.profile;
  void _photo;
  void _mode;
  // Durées calculées une fois ici : le modèle peut écrire « 18 mois » sans l'inventer.
  const profileForModel = {
    nom: identite.nom,
    ville: identite.ville,
    ...rest,
    experiences: rest.experiences.map((e) => ({ ...e, duree_mois: durationMonths(e.debut, e.fin) })),
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: process.env.OPENAI_TAILOR_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            "### Profil du candidat (JSON)",
            JSON.stringify(profileForModel),
            "\n### Offre",
            `Intitulé : ${input.offer.title ?? ""}`,
            `Entreprise : ${input.offer.company ?? ""}`,
            `Lieu : ${input.offer.location ?? ""}`,
            input.offer.text.slice(0, 15000),
            ...(input.lang
              ? [
                  "\n### Langue imposée",
                  input.lang === "en"
                    ? `"lang" vaut "en" : rédige titre, accroche, puces, compétences, autre et toute la lettre en anglais, quelle que soit la langue de l'offre. Les mots-clés ATS restent dans la graphie de l'offre.`
                    : `"lang" vaut "fr" : rédige titre, accroche, puces, compétences, autre et toute la lettre en français, quelle que soit la langue de l'offre. Les mots-clés ATS restent dans la graphie de l'offre.`,
                ]
              : []),
          ].join("\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) throw new Error(`OpenAI API a échoué (${res.status})`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Réponse OpenAI vide");
  const parsed = JSON.parse(raw);
  if (input.lang && parsed && typeof parsed === "object") parsed.lang = input.lang;
  return normalize(parsed, input.profile, input.offer.text);
}

// ---------------------------------------------------------------- garde-fous

// Durée en mois, bornes incluses (avril 2025 à septembre 2026 = 18 mois).
function durationMonths(debut: [number, number], fin: [number, number] | null): number {
  const now = new Date();
  const [fy, fm] = fin ?? [now.getFullYear(), now.getMonth() + 1];
  return Math.max(1, (fy - debut[0]) * 12 + (fm - debut[1]) + 1);
}

// Chiffres autorisés en plus du texte du profil : durées en mois et en années.
function durationNumbers(profile: CvProfile): string {
  return profile.experiences
    .map((e) => {
      const m = durationMonths(e.debut, e.fin);
      return `${m} ${Math.floor(m / 12)} ${Math.round(m / 12)}`;
    })
    .join(" ");
}

const strs = (v: unknown, max = 40): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()).slice(0, max) : [];
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// Tiret cadratin interdit : remplacé par une virgule.
export const noEmDash = (s: string) => s.replace(/\s*—\s*/g, ", ").replace(/,\s*,/g, ",");

const numbersIn = (s: string) => s.match(/\d+(?:[.,]\d+)?/g) ?? [];

// Une phrase dont un chiffre n'existe pas dans la source est une invention : retirée.
function keepTraceableNumbers(text: string, source: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.filter((s) => numbersIn(s).every((n) => source.includes(n))).join(" ");
}

function normalize(o: Record<string, unknown>, profile: CvProfile, offerText: string): TailoredContent {
  const allText = `${JSON.stringify(profile)} ${durationNumbers(profile)}`;
  // La lettre peut citer un chiffre de l'offre (taille d'équipe, ancienneté de l'entreprise).
  const letterSource = `${allText} ${offerText}`;
  const lang: Lang = o.lang === "en" ? "en" : "fr";
  const expIds = profile.experiences.map((e) => e.id);
  const pick = (v: unknown, fallback: string) => (typeof v === "string" && expIds.includes(v) ? v : fallback);
  const developpee = pick(o.developpee, expIds[0]);
  const appui = pick(o.appui, expIds.find((id) => id !== developpee) ?? developpee);

  const rawPuces = (o.puces && typeof o.puces === "object" ? o.puces : {}) as Record<string, unknown>;
  const puces: Record<string, string[]> = {};
  for (const e of profile.experiences) {
    const source = e.faits.join(" ");
    const kept = strs(rawPuces[e.id], 5)
      .map(noEmDash)
      .filter((p) => numbersIn(p).every((n) => source.includes(n)));
    // Une expérience garde toujours au moins une puce : à défaut, son premier fait.
    puces[e.id] = kept.length ? kept : e.faits.slice(0, 1).map(noEmDash);
  }

  const competences = Array.isArray(o.competences)
    ? (o.competences as unknown[])
        .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
        .map((c) => ({ label: noEmDash(str(c.label)), items: noEmDash(str(c.items)) }))
        .filter((c) => c.label && c.items)
        .slice(0, 6)
    : [];

  const formIds = profile.formation.map((f) => f.id);
  const formation = strs(o.formation).filter((id) => formIds.includes(id));

  const lettre = (o.lettre && typeof o.lettre === "object" ? o.lettre : {}) as Record<string, unknown>;
  const mk = (o.mots_cles && typeof o.mots_cles === "object" ? o.mots_cles : {}) as Record<string, unknown>;
  const score = Math.max(0, Math.min(100, Math.round(Number(o.score))));

  return {
    entreprise: str(o.entreprise).slice(0, 200),
    intitule: str(o.intitule).slice(0, 300),
    lieu: str(o.lieu).slice(0, 200),
    score: Number.isFinite(score) ? score : 0,
    lang,
    photo: o.photo !== false,
    photo_raison: o.photo === false ? noEmDash(str(o.photo_raison)) : "",
    axe: noEmDash(str(o.axe)),
    titre: noEmDash(str(o.titre)) || profile.experiences[0].poste[lang] || profile.experiences[0].poste.fr,
    accroche: keepTraceableNumbers(noEmDash(str(o.accroche)), allText),
    developpee,
    appui,
    puces,
    competences: competences.length ? competences : profile.competences,
    formation: formation.length ? formation : formIds,
    autre: noEmDash(str(o.autre)),
    mots_cles: { obligatoires: strs(mk.obligatoires, 15), souhaites: strs(mk.souhaites, 20), absents: strs(mk.absents, 20) },
    ecarts: noEmDash(str(o.ecarts)),
    recruteur: str(o.recruteur) || null,
    contact_recruteur: str(o.contact_recruteur) || null,
    lettre: {
      appel: str(lettre.appel) || (lang === "en" ? "Dear Hiring Manager," : "Madame, Monsieur,"),
      paragraphes: strs(lettre.paragraphes, 6).map((p) => keepTraceableNumbers(noEmDash(p), letterSource)).filter(Boolean),
    },
  };
}
