import type { SearchOfferResult } from "@/lib/n8n/client";

export type SearchHistoryRow = {
  id: string;
  keyword: string;
  status: string;
  result_count: number;
  duplicate_count: number;
  created_at: string;
};

/**
 * Clé de déduplication d'une offre, indépendante de l'id base.
 * Priorité à l'URL ; sinon titre + entreprise normalisés.
 */
export function offerDedupKey(offer: {
  url?: string | null;
  title?: string | null;
  company?: string | null;
}): string | null {
  const url = offer.url?.trim().toLowerCase();
  if (url) return `url:${url}`;
  const title = offer.title?.trim().toLowerCase();
  const company = offer.company?.trim().toLowerCase();
  if (title || company) return `tc:${title ?? ""}|${company ?? ""}`;
  return null;
}

export function dedupKeyFromResult(offer: SearchOfferResult): string | null {
  // SearchOfferResult ne porte pas d'URL ; on retombe sur titre + entreprise.
  return offerDedupKey({ title: offer.title, company: offer.company });
}
