// Repère les liens d'offres dans un email d'alerte et les ramène à une forme
// canonique : une clé stable par offre (ex. linkedin:4012345678) qui sert à
// dédoublonner, quelle que soit l'URL de suivi utilisée par la plateforme.

import { gunzipSync } from "node:zlib";

export type VeilleSource = "linkedin" | "wttj" | "jobteaser" | "indeed" | "hellowork" | "vie";

export type JobLink = {
  source: VeilleSource;
  key: string;
  url: string;
  hint: string | null;
  /** Texte de l'alerte autour du lien (intitulé, entreprise, lieu, contrat…). */
  context: string | null;
};

// Garde le pays de l'offre (fr.indeed.com, nl.indeed.com…) : une offre néerlandaise
// n'existe pas sur fr.indeed.com.
function indeedJob(host: string, jk: string) {
  const h = host.toLowerCase().replace(/^www\./, "");
  const site = /^[a-z]{2}\.indeed\./.test(h) ? h : "fr.indeed.com";
  return { key: `indeed:${jk.toLowerCase()}`, url: `https://${site}/viewjob?jk=${jk.toLowerCase()}` };
}

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
    match: /((?:[a-z]{2}\.)?indeed\.[a-z.]+)\/[^\s"'<>]*?[?&](?:jk|vjk)=([0-9a-f]{16})/i,
    build: (m) => indeedJob(m[1], m[2]),
  },
  {
    // Alertes « match » : lien publicitaire pagead/clk sans jk ; l'identifiant
    // de l'offre termine le paramètre jrtk (5-xxx-1-<jeton>-<jk>).
    source: "indeed",
    match: /((?:[a-z]{2}\.)?indeed\.[a-z.]+)\/[^\s"'<>]*?[?&]jrtk=[0-9a-z-]*?-([0-9a-f]{16})(?=[&"'\s]|$)/i,
    build: (m) => indeedJob(m[1], m[2]),
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

/**
 * Liens de suivi Indeed (cts.indeed.com/v3/<gzip base64>/…) : la cible est écrite
 * dans le lien lui-même. On la lit en local, sans requête, et on repère les liens
 * d'action (notation « Oui / Non / Peut-être », profil) pour ne jamais les suivre.
 */
function decodeIndeedCts(raw: string): { url: string | null; action: boolean } | null {
  const m = raw.match(/cts\.indeed\.com\/v\d+\/(H4sI[A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const payload = m[1] + "=".repeat((4 - (m[1].length % 4)) % 4);
    const data = JSON.parse(gunzipSync(Buffer.from(payload, "base64url")).toString("utf8")) as {
      u?: unknown;
      m?: { clickType?: unknown };
    };
    const url = typeof data.u === "string" ? data.u : null;
    const clickType = typeof data.m?.clickType === "string" ? data.m.clickType : "";
    const action = /feedback|rating|profile|settings/i.test(clickType) || /match-rating|\/profile|subscriptions\./i.test(url ?? "");
    return { url, action };
  } catch {
    return { url: null, action: true };
  }
}

/** Variantes décodées d'une URL (paramètres de redirection encodés une ou deux fois). */
function decodedVariants(raw: string): string[] {
  const out = [raw.replace(/&amp;/gi, "&")];
  const cts = decodeIndeedCts(out[0]);
  if (cts?.url) out.push(cts.url);
  for (const base of [...out]) {
    let cur = base;
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
  }
  return out;
}

/** Applique les règles à une URL ; null si ce n'est pas un lien d'offre reconnu. */
export function canonicalJob(raw: string | null | undefined): Omit<JobLink, "hint" | "context"> | null {
  if (!raw) return null;
  if (decodeIndeedCts(raw)?.action) return null;
  for (const variant of decodedVariants(raw)) {
    for (const rule of RULES) {
      const m = variant.match(rule.match);
      if (m) return { source: rule.source, ...rule.build(m) };
    }
  }
  return null;
}

const SKIP_LINK = /unsubscribe|desinscri|désinscri|desabonn|désabonn|preferences|préférences|settings|parametres|paramètres|privacy|confidentialit|cgu|terms|help|aide|mailto:|tel:|\.(png|jpe?g|gif|svg)(\?|$)/i;

/** Texte d'un lien d'action : il ne faut jamais le suivre (il noterait l'offre, modifierait le profil…). */
const ACTION_TEXT =
  /^(oui|non|peut[- ]?[eê]tre|yes|no|maybe|ja|nee|misschien)$|modifier|profil|profile|salaire de base|param[eè]tre|settings|aide|help|politique|privacy|conditions|terms|d[ée]sabonn|unsubscribe|int[ée]ress|interested|similaire|similar|j'aime|feedback|signaler|report/i;

/** Textes de bouton qui ne disent rien de l'offre. */
const GENERIC_TEXT = /^(voir|postuler|candidater|apply|view|see|d[ée]couvrir|consulter|en savoir plus|learn more|bekijk|solliciteer)\b/i;

const ENTITIES: Record<string, string> = { nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function cleanText(s: string) {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (all, n) => ENTITIES[n.toLowerCase()] ?? all)
    .replace(/[\u200b-\u200f\u2060\ufeff\u034f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const INTRO_LINE = /^(bonjour|hello|hi|beste|hallo|votre parcours|it looks|jobs are|op basis|voici|here are|nouvelles? offres?|new jobs?)/i;

/** Intitulé probable d'un bloc d'alerte : première ligne courte qui n'est pas une formule d'introduction. */
function titleFromContext(context: string | null) {
  if (!context) return null;
  for (const line of context.split("\n").map((l) => l.trim())) {
    if (line.length < 4 || line.length > 140) continue;
    if (INTRO_LINE.test(line) || GENERIC_TEXT.test(line) || /[.!?:]$/.test(line)) continue;
    return line;
  }
  return null;
}

export type RawAnchor = { href: string; text: string; context: string | null };

/** Liens d'un email (HTML d'abord, puis URL nues du texte brut avec le texte qui les précède). */
export function anchorsFromEmail(html: string | null | undefined, text: string | null | undefined): RawAnchor[] {
  const anchors: RawAnchor[] = [];
  if (html) {
    const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) anchors.push({ href: m[1].trim(), text: cleanText(m[2]), context: null });
  }
  if (text) {
    const re = /https?:\/\/[^\s<>"')\]]+/gi;
    let prevEnd = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const before = text.slice(prevEnd, m.index);
      prevEnd = m.index + m[0].length;
      // « Voir l'emploi: <lien> » : le libellé collé au lien n'est pas du contexte.
      const label = (before.match(/([^\n]*?)\s*:?\s*$/)?.[1] ?? "").trim();
      const context = before.replace(/[^\n]*$/, "").trim().slice(-1500) || null;
      anchors.push({ href: m[0], text: label, context });
    }
  }
  return anchors.filter((a) => /^https?:\/\//i.test(a.href) && !SKIP_LINK.test(a.href));
}

/**
 * Liens d'offres d'un email. Les liens de suivi opaques (clic SendGrid, etc.)
 * sont résolus par `resolve` (redirections HTTP), dans la limite de `maxResolve`.
 * Les liens d'action (notation, profil, désinscription) ne sont jamais suivis.
 */
export async function jobLinksFromEmail(
  html: string | null | undefined,
  text: string | null | undefined,
  resolve: (url: string) => Promise<string | null>,
  maxResolve = 40
): Promise<JobLink[]> {
  const found = new Map<string, JobLink>();
  const pending: RawAnchor[] = [];

  const add = (job: Omit<JobLink, "hint" | "context">, a: RawAnchor) => {
    const label = a.text && a.text.length > 3 && a.text.length < 200 && !GENERIC_TEXT.test(a.text) && !ACTION_TEXT.test(a.text) ? a.text : null;
    const hint = label ?? titleFromContext(a.context);
    const context = a.context && a.context.length >= 40 ? a.context : null;
    const prev = found.get(job.key);
    if (!prev) {
      found.set(job.key, { ...job, hint, context });
      return;
    }
    if (!prev.hint && hint) prev.hint = hint;
    if (!prev.context && context) prev.context = context;
  };

  for (const a of anchorsFromEmail(html, text)) {
    const job = canonicalJob(a.href);
    if (job) add(job, a);
    else pending.push(a);
  }

  // Les plateformes qui masquent tout derrière un lien de suivi : on suit les redirections,
  // sauf pour Indeed (décodé en local) et les liens d'action.
  const seen = new Set<string>();
  let budget = maxResolve;
  for (const a of pending) {
    if (budget <= 0) break;
    if (seen.has(a.href)) continue;
    seen.add(a.href);
    if (/indeed\./i.test(a.href) || ACTION_TEXT.test(a.text)) continue;
    budget--;
    const target = await resolve(a.href).catch(() => null);
    const job = canonicalJob(target);
    if (job) add(job, a);
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
