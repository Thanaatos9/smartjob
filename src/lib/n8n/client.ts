export type OfferWebhookPayload = {
  userId: string;
  cvText: string;
  fullName?: string;
  phone?: string;
  location?: string;
  additionalSkills?: string;
  url?: string;
  text?: string;
};

// Le workflow renvoie un message explicite sur ses erreurs métier (422 quand
// l'offre est illisible) : on le remonte tel quel plutôt qu'un code HTTP nu.
async function webhookError(res: Response) {
  const raw = await res.text().catch(() => "");
  let message = "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === "string") message = parsed.error;
  } catch {
    // corps non-JSON : on garde le message générique
  }
  return new Error(message || `Webhook n8n a échoué (${res.status})`);
}

export async function triggerOfferExtraction(payload: OfferWebhookPayload) {
  const webhookUrl = process.env.N8N_OFFER_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("N8N_OFFER_WEBHOOK_URL n'est pas configuré");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Secret": process.env.N8N_WEBHOOK_SECRET ?? "",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await webhookError(res);
  }

  return res.json();
}

export type PortfolioFetchPayload = {
  userId: string;
  portfolioUrl: string;
};

export async function triggerPortfolioFetch(payload: PortfolioFetchPayload) {
  const webhookUrl = process.env.N8N_PORTFOLIO_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("N8N_PORTFOLIO_WEBHOOK_URL n'est pas configuré");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook n8n a échoué (${res.status})`);
  }

  return res.json() as Promise<{ text: string }>;
}

export type GenerateLetterPayload = {
  offerId: string;
  userId: string;
  cvText: string;
  fullName?: string;
  phone?: string;
  location?: string;
  additionalSkills?: string;
  portfolioText?: string;
  language?: "fr" | "en";
};

export async function triggerLetterGeneration(payload: GenerateLetterPayload) {
  const webhookUrl = process.env.N8N_GENERATE_LETTER_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("N8N_GENERATE_LETTER_WEBHOOK_URL n'est pas configuré");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook n8n a échoué (${res.status})`);
  }

  return res.json() as Promise<{ id: string; status: string; letterText: string }>;
}

export type ScoreOfferPayload = {
  offerId: string;
  userId: string;
  cvText: string;
  additionalSkills?: string;
  portfolioText?: string;
};

export async function triggerOfferScoring(payload: ScoreOfferPayload) {
  const webhookUrl = process.env.N8N_SCORE_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("N8N_SCORE_WEBHOOK_URL n'est pas configuré");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook n8n a échoué (${res.status})`);
  }

  return res.json() as Promise<{
    offerId: string;
    match_score: number;
    match_reason: string;
  }>;
}

export type SearchPayload = {
  userId: string;
  keyword: string;
  searchId: string;
};

export type SearchOfferResult = {
  id: string;
  title: string | null;
  company: string | null;
  salary: string | null;
  location: string | null;
  contract_type: string | null;
};

export async function triggerJobSearch(payload: SearchPayload) {
  const webhookUrl = process.env.N8N_SEARCH_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("N8N_SEARCH_WEBHOOK_URL n'est pas configuré");
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Webhook n8n a échoué (${res.status})`);
  }

  return res.json() as Promise<{ searchId: string; offers: SearchOfferResult[] }>;
}
