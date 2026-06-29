export type OfferWebhookPayload = {
  userId: string;
  cvText: string;
  fullName?: string;
  phone?: string;
  location?: string;
  url?: string;
  text?: string;
};

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
    throw new Error(`Webhook n8n a échoué (${res.status})`);
  }

  return res.json();
}

export type GenerateLetterPayload = {
  offerId: string;
  userId: string;
  cvText: string;
  fullName?: string;
  phone?: string;
  location?: string;
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

export type SearchPayload = {
  userId: string;
  keyword: string;
  // L'app est la source de vérité pour la table `searches` : elle a déjà
  // créé/réutilisé la ligne avant d'appeler le webhook. n8n doit référencer
  // ce searchId plutôt que de recréer une ligne (sinon doublon -> 23505).
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
