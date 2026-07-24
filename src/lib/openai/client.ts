export type MatchScoreResult = { score: number; reason: string };

export async function computeMatchScore(input: {
  cvText: string;
  additionalSkills?: string | null;
  offerText: string;
}): Promise<MatchScoreResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY n'est pas configuré");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Tu évalues à quel point le profil d\'un candidat correspond à une offre d\'emploi. ' +
            'Réponds uniquement avec un JSON de la forme {"score": <entier entre 0 et 10>, "reason": "<1-2 phrases en français>"}. ' +
            "0 = aucun rapport avec l'offre, 10 = correspondance quasi parfaite. Base-toi sur les compétences, l'expérience et le secteur d'activité.",
        },
        {
          role: "user",
          content: [
            "### CV du candidat",
            input.cvText,
            input.additionalSkills
              ? `\n### Qualités et compétences supplémentaires du candidat\n${input.additionalSkills}`
              : "",
            "\n### Offre d'emploi",
            input.offerText,
          ].join("\n"),
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API a échoué (${res.status})`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Réponse OpenAI vide");
  }

  const parsed = JSON.parse(content) as { score?: unknown; reason?: unknown };
  const score = Math.round(Number(parsed.score));
  if (!Number.isFinite(score)) {
    throw new Error("Score invalide renvoyé par OpenAI");
  }

  return {
    score: Math.max(0, Math.min(10, score)),
    reason: typeof parsed.reason === "string" ? parsed.reason : "",
  };
}
