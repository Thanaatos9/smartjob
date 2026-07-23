"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Check } from "lucide-react";

function formatPhoneIntl(phone?: string | null) {
  if (!phone) return phone;
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.replace(/^(\+\d{2})/, "$1 ");
  if (cleaned.startsWith("0")) return `+33 ${cleaned.slice(1)}`;
  return phone;
}

function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "candidature"
  );
}

export function LetterPanel({
  offerId,
  letterText,
  fileBaseName,
  senderName,
  senderPhone,
  senderLocation,
  recipientCompany,
  recipientLocation,
  offerTitle,
}: {
  offerId: string;
  letterText: string | null;
  fileBaseName?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  senderLocation?: string | null;
  recipientCompany?: string | null;
  recipientLocation?: string | null;
  offerTitle?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [text, setText] = useState(letterText ?? "");
  const [savedText, setSavedText] = useState(letterText ?? "");
  const [language, setLanguage] = useState<"fr" | "en">("fr");

  const isDirty = text !== savedText;

  const languageToggle = (
    <div
      role="radiogroup"
      aria-label="Langue de la lettre"
      className="inline-flex items-center rounded-md border border-border p-0.5"
    >
      {(["fr", "en"] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          role="radio"
          aria-checked={language === lang}
          onClick={() => setLanguage(lang)}
          className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
            language === lang
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {lang === "fr" ? "Français" : "English"}
        </button>
      ))}
    </div>
  );

  async function handleGenerate() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/offers/${offerId}/generate-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language }),
    });
    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de la génération de la lettre");
      return;
    }

    if (typeof data.letterText === "string") {
      setText(data.letterText);
      setSavedText(data.letterText);
    }
    router.refresh();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/offers/${offerId}/letter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'enregistrement");
      return;
    }

    setSavedText(text);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
    router.refresh();
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    setError(null);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "mm", format: "a4" });

      const marginX = 22;
      const marginTop = 24;
      const marginBottom = 22;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const maxWidth = pageWidth - marginX * 2;
      const lineHeight = 6.2; // mm

      // --- En-tête courrier ---
      // Colonne gauche : expéditeur. Colonne droite : date + destinataire.
      const rightX = pageWidth - marginX;
      let yLeft = marginTop;
      let yRight = marginTop;

      // Expéditeur (gauche)
      if (senderName) {
        doc.setFont("times", "bold");
        doc.setFontSize(12);
        doc.text(senderName, marginX, yLeft);
        yLeft += lineHeight;
      }
      doc.setFont("times", "normal");
      doc.setFontSize(11);
      for (const info of [formatPhoneIntl(senderPhone), senderLocation]) {
        if (info) {
          doc.text(info, marginX, yLeft);
          yLeft += lineHeight * 0.9;
        }
      }

      // Date (droite)
      const dateStr = new Intl.DateTimeFormat(
        language === "en" ? "en-GB" : "fr-FR",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      ).format(new Date());
      const cityDate =
        language === "en"
          ? senderLocation
            ? `${senderLocation}, ${dateStr}`
            : dateStr
          : senderLocation
            ? `${senderLocation}, le ${dateStr}`
            : `Le ${dateStr}`;
      doc.setFontSize(11);
      doc.text(cityDate, rightX, yRight, { align: "right" });
      yRight += lineHeight;

      // Destinataire (droite, sous la date)
      if (recipientCompany || recipientLocation) {
        yRight += lineHeight * 1.4;
        if (recipientCompany) {
          doc.setFont("times", "bold");
          doc.text(recipientCompany, rightX, yRight, { align: "right" });
          yRight += lineHeight * 0.9;
        }
        if (recipientLocation) {
          doc.setFont("times", "normal");
          doc.text(recipientLocation, rightX, yRight, { align: "right" });
          yRight += lineHeight * 0.9;
        }
      }

      // Le corps démarre sous le plus bas des deux blocs.
      let y = Math.max(yLeft, yRight, marginTop + lineHeight) + lineHeight * 2;
      const newPageIfNeeded = () => {
        if (y > pageHeight - marginBottom) {
          doc.addPage();
          y = marginTop;
        }
      };

      doc.setFontSize(12);

      // Objet (gras), au-dessus du corps.
      if (offerTitle) {
        doc.setFont("times", "bold");
        const objet =
          language === "en"
            ? `Subject: Application for the position of ${offerTitle}`
            : `Objet : Candidature au poste de ${offerTitle}`;
        const objetLines = doc.splitTextToSize(objet, maxWidth) as string[];
        for (const line of objetLines) {
          newPageIfNeeded();
          doc.text(line, marginX, y);
          y += lineHeight;
        }
        y += lineHeight; // espace avant le corps
      }

      doc.setFont("times", "normal");
      doc.setFontSize(12);

      // Une entrée par retour à la ligne ; les lignes vides créent un espace.
      for (const paragraph of text.split("\n")) {
        if (paragraph.trim() === "") {
          y += lineHeight;
          newPageIfNeeded();
          continue;
        }
        const wrapped = doc.splitTextToSize(paragraph, maxWidth) as string[];
        for (const line of wrapped) {
          newPageIfNeeded();
          doc.text(line, marginX, y);
          y += lineHeight;
        }
      }

      doc.save(`lettre-${slugify(fileBaseName ?? "candidature")}.pdf`);
    } catch {
      setError("Impossible de générer le PDF");
    }
  }

  if (!letterText) {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">Langue de la lettre</span>
          {languageToggle}
        </div>
        <Button onClick={handleGenerate} disabled={pending} className="w-full">
          {pending ? "Génération en cours..." : "Générer la lettre"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="letter-editor" className="sr-only">
        Lettre de motivation
      </label>
      <Textarea
        id="letter-editor"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck
        rows={16}
        className="max-h-[60vh] min-h-72 font-sans leading-relaxed"
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleSave} disabled={!isDirty || saving} size="sm">
          {saving ? "Enregistrement..." : justSaved ? "Enregistré" : "Enregistrer"}
        </Button>
        {justSaved && !isDirty && (
          <span className="flex items-center gap-1 text-xs font-medium text-success">
            <Check className="size-3.5" aria-hidden />
            À jour
          </span>
        )}
        {isDirty && (
          <span className="text-xs text-muted-foreground">Modifications non enregistrées</span>
        )}

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <Button onClick={handleCopy} variant="outline" size="sm">
          {copied ? "Copié !" : "Copier"}
        </Button>
        <Button onClick={handleDownload} variant="outline" size="sm">
          Télécharger en PDF
        </Button>
        {languageToggle}
        <Button onClick={handleGenerate} disabled={pending} variant="ghost" size="sm">
          {pending ? "Régénération..." : "Régénérer"}
        </Button>
      </div>
    </div>
  );
}
