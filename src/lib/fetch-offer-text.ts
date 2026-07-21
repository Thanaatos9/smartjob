// Récupère et extrait le contenu LISIBLE d'une page d'offre, côté serveur.
//
// Pourquoi : jusqu'ici la plateforme n'envoyait que l'URL à n8n, qui faisait un
// simple GET. Sur les sites rendus en JavaScript (VIE/VIA = Angular, LinkedIn…),
// un GET ne renvoie que la coquille (« Loading... ») avant que le navigateur
// n'injecte le contenu. n8n extrayait donc du vide → offre « Inconnu ».
//
// Ici on capture le texte réel côté serveur (JSON-LD JobPosting → balises meta
// → corps de page), puis on l'envoie à n8n comme `text` : n8n extrait alors sur
// du vrai contenu, exactement comme le mode « Texte collé » qui fonctionne déjà.
//
// La fonction ne jette jamais : en cas d'échec elle renvoie null, et l'appelant
// retombe sur l'ancien comportement (envoi de l'URL seule).

export type OfferContent = {
  /** Texte exploitable par l'extraction n8n. */
  text: string;
  title?: string;
  company?: string;
  location?: string;
};

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
};

// Marqueurs typiques d'une coquille SPA non rendue : si le texte extrait se
// réduit à ça, c'est qu'on n'a pas récupéré la vraie fiche.
const SHELL_MARKERS =
  /you need to enable javascript|please enable javascript|enable javascript to run this app|loading\.{0,3}\s*$|^chargement/i;

// En dessous de ce nombre de caractères utiles, on considère l'extraction ratée.
const MIN_USEFUL_LENGTH = 180;

const FETCH_TIMEOUT_MS = 15_000;

// --- Décodage / nettoyage HTML -------------------------------------------

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

// Transforme un fragment HTML en texte lisible : retire les blocs non textuels
// (script/style/svg/nav/header/footer), convertit les tags en espaces, décode
// les entités et normalise les espaces.
function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ");
  const text = decodeEntities(withoutBlocks.replace(/<[^>]+>/g, " "));
  return text.replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// --- JSON-LD (schema.org JobPosting) -------------------------------------

type JsonLdNode = Record<string, unknown>;

function collectJobPostings(node: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectJobPostings(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as JsonLdNode;

  const type = obj["@type"];
  const isJobPosting = Array.isArray(type)
    ? type.some((t) => String(t).toLowerCase() === "jobposting")
    : String(type ?? "").toLowerCase() === "jobposting";
  if (isJobPosting) out.push(obj);

  // Descend dans @graph et autres conteneurs imbriqués.
  if (obj["@graph"]) collectJobPostings(obj["@graph"], out);
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function jobPostingFromJsonLd(html: string): OfferContent | null {
  const scripts = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ),
  ];

  const postings: JsonLdNode[] = [];
  for (const m of scripts) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      collectJobPostings(JSON.parse(raw), postings);
    } catch {
      // JSON-LD malformé (fréquent) : on ignore ce bloc.
    }
  }

  const job = postings[0];
  if (!job) return null;

  const title = firstString(job["title"], job["name"]);

  const org = job["hiringOrganization"];
  const company =
    org && typeof org === "object"
      ? firstString((org as JsonLdNode)["name"])
      : firstString(org);

  const loc = job["jobLocation"];
  const address =
    Array.isArray(loc) ? loc[0] : loc;
  const locality =
    address && typeof address === "object"
      ? firstString(
          ((address as JsonLdNode)["address"] as JsonLdNode | undefined)?.[
            "addressLocality"
          ],
          (address as JsonLdNode)["name"]
        )
      : undefined;

  const description = firstString(job["description"]);
  const descText = description ? htmlToText(description) : "";

  const parts = [
    title && `Intitulé : ${title}`,
    company && `Entreprise : ${company}`,
    locality && `Lieu : ${locality}`,
    firstString(job["employmentType"]) && `Contrat : ${firstString(job["employmentType"])}`,
    firstString(job["baseSalary"]) && `Salaire : ${firstString(job["baseSalary"])}`,
    descText && `\n${descText}`,
  ].filter(Boolean);

  const text = parts.join("\n").trim();
  if (text.length < MIN_USEFUL_LENGTH && !descText) return null;

  return { text, title, company, location: locality };
}

// --- Balises meta / OpenGraph (fallback) ---------------------------------

function metaContent(html: string, key: string, attr: "property" | "name"): string | undefined {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const m = html.match(re) ?? html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`, "i")
  );
  return m ? decodeEntities(m[1]).trim() : undefined;
}

function fromMeta(html: string): OfferContent | null {
  const title =
    metaContent(html, "og:title", "property") ??
    metaContent(html, "twitter:title", "name") ??
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ? decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)![1]).trim()
      : undefined);
  const description =
    metaContent(html, "og:description", "property") ??
    metaContent(html, "description", "name");

  const parts = [title && `Intitulé : ${title}`, description].filter(Boolean);
  const text = parts.join("\n\n").trim();
  if (text.length < MIN_USEFUL_LENGTH) return null;
  return { text, title };
}

// --- Cas spécial VIE/VIA (Business France) -------------------------------
//
// mon-vie-via.businessfrance.fr est une app Angular : le HTML ne contient pas
// la fiche. Le front consomme une API JSON. On tente cette API à partir de l'id
// numérique présent dans l'URL. Les endpoints candidats ci-dessous sont un
// best-effort — À VÉRIFIER via l'onglet Réseau (DevTools) sur une fiche : le
// vrai endpoint apparaît lors du chargement. Si aucun ne répond, on retombe sur
// l'extraction générique (qui échouera proprement → null).

function vieViaOfferId(url: URL): string | null {
  const m = url.pathname.match(/(\d{3,})/);
  return m ? m[1] : null;
}

async function fetchVieVia(url: URL): Promise<OfferContent | null> {
  const id = vieViaOfferId(url);
  if (!id) return null;

  const candidates = [
    `https://mon-vie-via.businessfrance.fr/api/Offers/details/${id}`,
    `https://civiweb-api-prd.azurewebsites.net/api/Offers/details/${id}`,
  ];

  for (const api of candidates) {
    try {
      const res = await fetchWithTimeout(api, { Accept: "application/json" });
      if (!res.ok) continue;
      const data = (await res.json()) as JsonLdNode;
      const title = firstString(data["intitulePoste"], data["title"], data["missionTitle"]);
      const company = firstString(data["nomEntreprise"], data["organisation"], data["company"]);
      const locality = firstString(data["ville"], data["pays"], data["location"]);
      const description = firstString(
        data["descriptif"],
        data["missionDescription"],
        data["description"]
      );
      const descText = description ? htmlToText(description) : "";
      const text = [
        title && `Intitulé : ${title}`,
        company && `Entreprise : ${company}`,
        locality && `Lieu : ${locality}`,
        descText && `\n${descText}`,
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text.length >= MIN_USEFUL_LENGTH || descText) {
        return { text, title, company, location: locality };
      }
    } catch {
      // endpoint injoignable / réponse inattendue : on essaie le suivant.
    }
  }
  return null;
}

// --- Fetch ---------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  extraHeaders: Record<string, string> = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { ...BROWSER_HEADERS, ...extraHeaders },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeShell(text: string): boolean {
  return text.length < MIN_USEFUL_LENGTH || SHELL_MARKERS.test(text);
}

/**
 * Capture le contenu d'une page d'offre. Renvoie null si la page n'a pas pu
 * être lue utilement (site rendu en JS sans contenu SEO, blocage anti-bot…),
 * auquel cas l'appelant doit retomber sur l'envoi de l'URL seule.
 */
export async function fetchOfferContent(rawUrl: string): Promise<OfferContent | null> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // Cas spécial : VIE/VIA (Angular) → API JSON.
  if (/(?:^|\.)businessfrance\.fr$|civiweb\.com$/i.test(url.hostname)) {
    const viaApi = await fetchVieVia(url);
    if (viaApi) return viaApi;
    // sinon on tente quand même le générique (au cas où une fiche serait SSR).
  }

  let html: string;
  try {
    const res = await fetchWithTimeout(rawUrl);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml|text/i.test(type)) return null;
    html = await res.text();
  } catch {
    return null;
  }

  // 1) JSON-LD JobPosting (le plus fiable, présent sur WTTJ, Indeed, etc.).
  const fromJsonLd = jobPostingFromJsonLd(html);
  if (fromJsonLd && !looksLikeShell(fromJsonLd.text)) return fromJsonLd;

  // 2) Corps de page nettoyé.
  const bodyText = htmlToText(html);
  const meta = fromMeta(html);
  if (!looksLikeShell(bodyText)) {
    // On préfixe avec le titre meta si dispo pour aider l'extraction.
    const combined = meta?.title && !bodyText.startsWith(meta.title)
      ? `Intitulé : ${meta.title}\n\n${bodyText}`
      : bodyText;
    return { text: combined, title: meta?.title };
  }

  // 3) Dernier recours : balises meta seules.
  if (meta && !looksLikeShell(meta.text)) return meta;

  return null;
}
