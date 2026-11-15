import { jsPDF } from "jspdf";
import type { CvProfile, Lang, TailoredContent } from "./types";

// Rendu PDF du CV et de la lettre adaptés (jsPDF côté serveur : texte réel,
// lisible par les ATS, une seule colonne pour les expériences).
// Tenue sur une page : marges puis police (jamais sous 10 pt ni 15 mm), puis
// coupes dans l'ordre autorisé, sans jamais retirer une expérience entière.

const MOIS: Record<Lang, string[]> = {
  fr: ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};
const LIB = {
  fr: { exp: "EXPÉRIENCES PROFESSIONNELLES", comp: "COMPÉTENCES", form: "FORMATION", autre: "AUTRE", now: "Aujourd'hui", objet: "Objet : Candidature au poste de" },
  en: { exp: "PROFESSIONAL EXPERIENCE", comp: "SKILLS", form: "EDUCATION", autre: "OTHER", now: "Present", objet: "Re: Application for the position of" },
};

const PAGE_W = 210;
const PAGE_H = 297;
const PT = 0.3528; // mm par point
const INK: [number, number, number] = [29, 29, 31];
const GREY: [number, number, number] = [72, 72, 74];

// Polices standard du PDF (WinAnsi) : on remplace ce qu'elles ne savent pas afficher.
export function pdfSafe(s: string): string {
  return s
    .replace(/—/g, ", ")
    .replace(/[→⇒]/g, "->")
    .replace(/[  ]/g, " ")
    .replace(/[^\x20-\x7E -ÿŒœ–‘’“”•…€]/g, "");
}

const i18n = (v: { fr: string; en?: string } | null | undefined, lang: Lang) => (v ? (lang === "en" && v.en) || v.fr : "");
const ym = (d: [number, number] | null, lang: Lang) => (d ? `${MOIS[lang][d[1] - 1]} ${d[0]}` : LIB[lang].now);

type Settings = { fs: number; margin: number };

// ---------------------------------------------------------------- CV

function layoutCv(
  doc: jsPDF,
  p: CvProfile,
  c: TailoredContent,
  photo: Uint8Array | null,
  s: Settings,
  draw: boolean
): number {
  const m = s.margin;
  const W = PAGE_W - 2 * m;
  const lh = (fs: number, k = 1.28) => fs * PT * k;
  let y = m;

  const text = (t: string | string[], x: number, yy: number, opts?: Parameters<jsPDF["text"]>[3]) => {
    if (draw) doc.text(t, x, yy, opts);
  };
  const font = (style: "normal" | "bold" | "italic", fs: number, color = INK) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fs);
    doc.setTextColor(...color);
  };
  const wrap = (t: string, width: number) => doc.splitTextToSize(pdfSafe(t), width) as string[];
  const rule = (yy: number, weight: number, color = INK) => {
    if (!draw) return;
    doc.setDrawColor(...color);
    doc.setLineWidth(weight);
    doc.line(m, yy, PAGE_W - m, yy);
  };

  // Bandeau : photo ronde, nom, titre, contacts.
  const id = p.identite;
  const withPhoto = !!photo && c.photo;
  const tx = withPhoto ? m + 30 : m;
  const tw = PAGE_W - m - tx;
  if (withPhoto && draw) doc.addImage(photo!, photo![0] === 0x89 ? "PNG" : "JPEG", m, y, 25, 25);
  let by = y;
  font("bold", 20);
  by += lh(20, 1);
  text(pdfSafe(id.nom.toUpperCase()), tx, by);
  font("bold", 12);
  const titre = wrap(c.titre, tw);
  by += 1.5 + lh(12, 1.1) * titre.length;
  text(titre, tx, by - lh(12, 1.1) * (titre.length - 1));
  font("normal", 9);
  const phone = c.lang === "en" && id.telephone_intl ? id.telephone_intl : id.telephone;
  const contacts = wrap([id.email, phone, id.ville, id.portfolio, id.linkedin].filter(Boolean).join(" | "), tw);
  by += 2 + lh(9) * contacts.length;
  text(contacts, tx, by - lh(9) * (contacts.length - 1));
  y = Math.max(withPhoto ? y + 25 : 0, by) + 3;
  rule(y, 0.4);
  y += 3.5;

  // Accroche.
  if (c.accroche) {
    font("normal", s.fs);
    const lines = wrap(c.accroche, W);
    y += lh(s.fs, 1);
    text(lines, m, y, { lineHeightFactor: 1.28 });
    y += lh(s.fs) * (lines.length - 1) + 2.5;
  }

  const heading = (label: string) => {
    y += 2.5;
    font("bold", 10.5);
    y += lh(10.5, 1);
    if (draw) doc.text(label, m, y, { charSpace: 0.4 });
    y += 1.2;
    rule(y, 0.25, GREY);
    y += 2;
  };

  // Ligne intitulé (gras, à gauche) + dates (à droite).
  const row = (left: string, right: string) => {
    font("normal", 9.5);
    const rw = doc.getTextWidth(pdfSafe(right));
    font("bold", s.fs);
    const lines = wrap(left, W - rw - 4);
    y += lh(s.fs, 1);
    text(lines, m, y, { lineHeightFactor: 1.28 });
    font("normal", 9.5);
    text(pdfSafe(right), PAGE_W - m, y, { align: "right" });
    y += lh(s.fs) * (lines.length - 1);
  };
  const italic = (t: string) => {
    font("italic", s.fs - 0.5, GREY);
    const lines = wrap(t, W);
    y += lh(s.fs);
    text(lines, m, y, { lineHeightFactor: 1.28 });
    y += lh(s.fs) * (lines.length - 1);
  };

  heading(LIB[c.lang].exp);
  for (const e of p.experiences) {
    row(`${i18n(e.poste, c.lang)}, ${e.entreprise}`, `${ym(e.debut, c.lang)} – ${ym(e.fin, c.lang)}`);
    if (e.contrat) italic(i18n(e.contrat, c.lang));
    font("normal", s.fs);
    for (const puce of c.puces[e.id] ?? []) {
      const lines = wrap(puce, W - 5);
      y += 0.6 + lh(s.fs);
      text("•", m + 1, y);
      text(lines, m + 5, y, { lineHeightFactor: 1.28 });
      y += lh(s.fs) * (lines.length - 1);
    }
    y += 2;
  }

  heading(LIB[c.lang].comp);
  for (const comp of c.competences) {
    font("bold", s.fs);
    const label = wrap(comp.label, 36);
    font("normal", s.fs);
    const items = wrap(comp.items, W - 39);
    y += lh(s.fs, 1);
    font("bold", s.fs);
    text(label, m, y, { lineHeightFactor: 1.28 });
    font("normal", s.fs);
    text(items, m + 39, y, { lineHeightFactor: 1.28 });
    y += lh(s.fs) * (Math.max(label.length, items.length) - 1) + 1;
  }

  heading(LIB[c.lang].form);
  for (const f of p.formation) {
    if (!c.formation.includes(f.id) && !f.toujours) continue;
    row(`${i18n(f.titre, c.lang)}${f.ecole ? `, ${f.ecole}` : ""}`, i18n(f.dates, c.lang));
    if (f.detail) italic(i18n(f.detail, c.lang));
    y += 1;
  }

  if (c.autre) {
    heading(LIB[c.lang].autre);
    font("normal", s.fs);
    const lines = wrap(c.autre, W);
    y += lh(s.fs, 1);
    text(lines, m, y, { lineHeightFactor: 1.28 });
    y += lh(s.fs) * (lines.length - 1);
  }

  return y + m;
}

// Coupes autorisées, dans l'ordre : « Autre », formations facultatives (les plus
// anciennes d'abord), puis puces sans chiffre des expériences secondaires (la
// plus ancienne d'abord), chaque expérience gardant au moins une puce.
function* cuts(p: CvProfile, start: TailoredContent): Generator<TailoredContent> {
  let c = structuredClone(start);
  if (c.autre) {
    c = { ...c, autre: "" };
    yield c;
  }
  for (const f of [...p.formation].reverse()) {
    if (f.toujours || !c.formation.includes(f.id)) continue;
    c = { ...c, formation: c.formation.filter((id) => id !== f.id) };
    yield c;
  }
  for (const e of [...p.experiences].reverse()) {
    if (e.id === c.developpee || e.id === c.appui) continue;
    for (;;) {
      const list = c.puces[e.id] ?? [];
      const idx = list.map((t, i) => (/\d/.test(t) ? -1 : i)).filter((i) => i >= 0);
      if (list.length <= 1 || idx.length === 0) break;
      const next = [...list];
      next.splice(idx[idx.length - 1], 1);
      c = { ...c, puces: { ...c.puces, [e.id]: next } };
      yield c;
    }
  }
}

export function renderCv(
  p: CvProfile,
  content: TailoredContent,
  photo: Uint8Array | null
): { pdf: Uint8Array; onePage: boolean; content: TailoredContent; steps: string[] } {
  const measure = new jsPDF({ unit: "mm", format: "a4" });
  const fits = (c: TailoredContent, s: Settings) => layoutCv(measure, p, c, photo, s, false) <= PAGE_H;

  const steps: string[] = [];
  let c = content;
  let s: Settings = { fs: 10.5, margin: 18 };
  let ok = fits(c, s);
  for (const next of [{ fs: 10.5, margin: 15 }, { fs: 10, margin: 15 }]) {
    if (ok) break;
    s = next;
    steps.push(`police ${next.fs} pt, marges ${next.margin} mm`);
    ok = fits(c, s);
  }
  if (!ok) {
    for (const cut of cuts(p, c)) {
      c = cut;
      steps.push("coupe");
      if ((ok = fits(c, s))) break;
    }
  }

  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `CV ${p.identite.nom}`, author: p.identite.nom });
  layoutCv(doc, p, c, photo, s, true);
  return { pdf: new Uint8Array(doc.output("arraybuffer")), onePage: ok, content: c, steps };
}

// ---------------------------------------------------------------- lettre

export function renderLetter(
  p: CvProfile,
  input: { lang: Lang; entreprise: string; villeEntreprise: string; poste: string; appel: string | null; paragraphes: string[] }
): { pdf: Uint8Array; onePage: boolean } {
  const id = p.identite;
  const today = new Date();
  const date =
    input.lang === "fr"
      ? `${id.ville_courte ?? id.ville}, le ${today.getDate()} ${MOIS.fr[today.getMonth()].toLowerCase()} ${today.getFullYear()}`
      : `${id.ville_courte ?? id.ville}, ${today.getDate()} ${MOIS.en[today.getMonth()]} ${today.getFullYear()}`;
  const appel = input.appel;
  const closing =
    appel === null
      ? null
      : input.lang === "fr"
        ? `Je vous prie d'agréer, ${appel.replace(/[,\s]+$/, "")}, l'expression de mes salutations distinguées.`
        : "Kind regards,";

  const layout = (doc: jsPDF, fs: number, m: number, draw: boolean) => {
    const W = PAGE_W - 2 * m;
    const lh = fs * PT * 1.38;
    const t = (s: string | string[], x: number, y: number, o?: Parameters<jsPDF["text"]>[3]) => draw && doc.text(s, x, y, o);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fs);
    doc.setTextColor(...INK);
    let y = m + fs * PT;
    const sender = [id.nom, id.telephone_intl ?? id.telephone, id.email, id.ville_courte ?? id.ville].map(pdfSafe);
    t(sender, m, y, { lineHeightFactor: 1.38 });
    t(pdfSafe(date), PAGE_W - m, y, { align: "right" });
    y += lh * sender.length + 5;
    const dest = [input.entreprise, input.villeEntreprise].filter(Boolean).map(pdfSafe);
    t(dest, PAGE_W - m, y, { align: "right", lineHeightFactor: 1.38 });
    y += lh * dest.length + 6;
    doc.setFont("helvetica", "bold");
    const obj = doc.splitTextToSize(pdfSafe(`${LIB[input.lang].objet} ${input.poste}`), W) as string[];
    t(obj, m, y, { lineHeightFactor: 1.38 });
    y += lh * obj.length + 4;
    doc.setFont("helvetica", "normal");
    const blocks = [...(appel ? [appel] : []), ...input.paragraphes, ...(closing ? [closing] : [])];
    for (const b of blocks) {
      const lines = doc.splitTextToSize(pdfSafe(b), W) as string[];
      t(lines, m, y, { lineHeightFactor: 1.38, maxWidth: W, align: lines.length > 1 ? "justify" : "left" });
      y += lh * lines.length + 2.5;
    }
    y += 4;
    t(pdfSafe(id.nom), m, y);
    return y + m;
  };

  const measure = new jsPDF({ unit: "mm", format: "a4" });
  let chosen: [number, number] = [10, 15];
  let ok = false;
  for (const [fs, m] of [[11, 22], [10.5, 18], [10, 15]] as [number, number][]) {
    if (layout(measure, fs, m, false) <= PAGE_H) {
      chosen = [fs, m];
      ok = true;
      break;
    }
  }
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setProperties({ title: `Lettre de motivation ${id.nom}`, author: id.nom });
  layout(doc, chosen[0], chosen[1], true);
  return { pdf: new Uint8Array(doc.output("arraybuffer")), onePage: ok };
}

// ---------------------------------------------------------------- couverture ATS

export function atsCoverage(c: TailoredContent): number | null {
  const kws = c.mots_cles.obligatoires;
  if (!kws.length) return null;
  const hay = [c.titre, c.accroche, ...Object.values(c.puces).flat(), ...c.competences.map((x) => `${x.label} ${x.items}`)]
    .join(" ")
    .toLowerCase();
  const found = kws.filter((k) => hay.includes(k.toLowerCase())).length;
  return Math.round((100 * found) / kws.length);
}
