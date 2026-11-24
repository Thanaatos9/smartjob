// Repère les liens d'offres dans un email d'alerte et les ramène à une forme
// canonique : une clé stable par offre (ex. linkedin:4012345678) qui sert à
// dédoublonner, quelle que soit l'URL de suivi utilisée par la plateforme.

export type VeilleSource = "linkedin" | "wttj" | "jobteaser" | "indeed" | "hellowork" | "vie";

export type JobLink = {
  source: VeilleSource;
  key: string;
  url: string;
  hint: string | null;
};

type Rule = {
  source: VeilleSource;
  match: RegExp;
  build: (m: RegExpMatchArray) => { key: string; url: string };
};

const RULES: Rule[] = [
  {
    source: "linkedin",
    match: /linkedin\.com\/(?:comm\/)?jobs\/view\/(?:[^/?#\s"']*?-)?(\d{6,})/i,
    build: (m) => ({ key: `linkedin:${m[1]}`, url: `https://www.linkedin.com/jobs/view/${m[1]}/` }),
  },
  {
    source: "linkedin",
    match: /linkedin\.com\/.*?(?:currentJobId=|jobPosting[:/]|jobs\/view\/)(\d{6,})/i,
    build: (m) => ({ key: `linkedin:${m[1]}`, url: `https://www.linkedin.com/jobs/view/${m[1]}/` }),
  },
  {
    source: "indeed",
    match: /indeed\.[a-z.]+\/[^\s"'<>]*?[?&](?:jk|vjk)=([0-9a-f]{16})/i,
    build: (m) => ({ key: `indeed:${m[1].toLowerCase()}`, url: `https://fr.indeed.com/viewjob?jk=${m[1].toLowerCase()}` }),
  },
  {
    source: "wttj",
    match: /welcometothejungle\.com\/[a-z]{2}\/companies\/([a-z0-9-]+)\/jobs\/([a-z0-9_-]+)/i,
    build: (m) => ({
      key: `wttj:${m[1].toLowerCase()}/${m[2].toLowerCase()}`,
      url: `https://www.welcometothejungle.com/fr/companies/${m[1]}/jobs/${m[2]}`,
    }),
  },
  {
    source: "hellowork",
    match: /hellowork\.com\/[a-z]{2}-[a-z]{2}\/emplois\/(\d+)\.html/i,
    build: (m) => ({ key: `hellowork:${m[1]}`, url: `https://www.hellowork.com/fr-fr/emplois/${m[1]}.html` }),
  },
  {
    source: "jobteaser",
    match: /jobteaser\.com\/(?:[a-z]{2}\/)?job-offers\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    build: (m) => ({ key: `jobteaser:${m[1].toLowerCase()}`, url: `https://www.jobteaser.com/fr/job-offers/${m[1].toLowerCase()}` }),
  },
  {
    source: "vie",
    match: /mon-vie-via\.businessfrance\.fr\/(?:[a-z]{2}\/)?offres\/(\d+)/i,
    build: (m) => ({ key: `vie:${m[1]}`, url: `https://mon-vie-via.businessfrance.fr/offres/${m[1]}` }),
  },
];

/** Expéditeurs reconnus : seuls leurs emails sont lus et rangés par la veille. */
export const SENDER_DOMAINS = [
  "linkedin.com",
  "welcometothejungle.com",
  "wttj.co",
  "jobteaser.com",
  "indeed.com",
  "indeed.fr",
  "indeedemail.com",
  "hellowork.com",
  "businessfrance.fr",
  "civiweb.com",
];

export function isKnownSender(address: string | null | undefined) {
  const domain = (address ?? "").toLowerCase().split("@")[1] ?? "";
  return SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Variantes décodées d'une URL (paramètres de redirection encodés une ou deux fois). */
function decodedVariants(raw: string): string[] {
  const out = [raw.replace(/&amp;/gi, "&")];
  let cur = out[0];
  for (let i = 0; i < 3; i++) {
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      break;
    }
    if (next === cur) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/** Applique les règles à une URL ; null si ce n'est pas un lien d'offre reconnu. */
export function canonicalJob(raw: string | null | undefined): Omit<JobLink, "hint"> | null {
  if (!raw) return null;
  for (const variant of decodedVariants(raw)) {
    for (const rule of RULES) {
      const m = variant.match(rule.match);
      if (m) return { source: rule.source, ...rule.build(m) };
    }
  }
  return null;
}

const SKIP_LINK = /unsubscribe|desinscri|désinscri|desabonn|désabonn|preferences|préférences|settings|parametres|paramètres|privacy|confidentialit|cgu|terms|help|aide|mailto:|tel:|\.(png|jpe?g|gif|svg)(\?|$)/i;

function cleanText(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export type RawAnchor = { href: string; text: string };

/** Liens d'un email (HTML d'abord, puis URL nues du texte brut). */
export function anchorsFromEmail(html: string | null | undefined, text: string | null | undefined): RawAnchor[] {
  const anchors: RawAnchor[] = [];
  if (html) {
    const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) anchors.push({ href: m[1].trim(), text: cleanText(m[2]) });
  }
  if (text) {
    for (const url of text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? []) anchors.push({ href: url, text: "" });
  }
  return anchors.filter((a) => /^https?:\/\//i.test(a.href) && !SKIP_LINK.test(a.href));
}

/**
 * Liens d'offres d'un email. Les liens de suivi opaques (clic SendGrid, etc.)
 * sont résolus par `resolve` (redirections HTTP), dans la limite de `maxResolve`.
 */
export async function jobLinksFromEmail(
  html: string | null | undefined,
  text: string | null | undefined,
  resolve: (url: string) => Promise<string | null>,
  maxResolve = 40
): Promise<JobLink[]> {
  const found = new Map<string, JobLink>();
  const pending: RawAnchor[] = [];

  const add = (job: Omit<JobLink, "hint">, hint: string) => {
    const prev = found.get(job.key);
    const h = hint && hint.length > 3 && hint.length < 200 ? hint : null;
    if (!prev) found.set(job.key, { ...job, hint: h });
    else if (!prev.hint && h) prev.hint = h;
  };

  for (const a of anchorsFromEmail(html, text)) {
    const job = canonicalJob(a.href);
    if (job) add(job, a.text);
    else pending.push(a);
  }

  // Les plateformes qui masquent tout derrière un lien de suivi : on suit les redirections.
  const seen = new Set<string>();
  let budget = maxResolve;
  for (const a of pending) {
    if (budget <= 0) break;
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    budget--;
    const target = await resolve(a.href).catch(() => null);
    const job = canonicalJob(target);
    if (job) add(job, a.text);
  }

  return [...found.values()];
}

/** Suit les redirections d'un lien de suivi (5 sauts maximum) et renvoie l'URL finale. */
export async function resolveRedirect(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; smartjob-veille/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const location = res.headers.get("location");
    await res.body?.cancel().catch(() => undefined);
    if (!location || res.status < 300 || res.status >= 400) return current;
    current = new URL(location, current).toString();
    if (canonicalJob(current)) return current;
  }
  return current;
}
