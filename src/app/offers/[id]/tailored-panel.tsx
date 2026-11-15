"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Sparkles, Upload } from "lucide-react";

// CV et lettre adaptés à l'offre : génération (ou régénération) dans l'app,
// ciblage ATS, documents, relance, et dépôt manuel de PDF faits ailleurs.
export function TailoredPanel({
  offerId,
  axis,
  coverage,
  keywords,
  gaps,
  recruiter,
  followUpDue,
  followUpSentAt,
  cvUrl,
  letterUrl,
  fitScore,
}: {
  offerId: string;
  axis: string | null;
  coverage: number | null;
  keywords: string[];
  gaps: string | null;
  recruiter: string | null;
  followUpDue: string | null;
  followUpSentAt: string | null;
  cvUrl: string | null;
  letterUrl: string | null;
  fitScore: number | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/offers/${offerId}/tailor`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: !!cvUrl }),
    });
    setGenerating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Échec de la génération");
      return;
    }
    router.refresh();
  }

  async function upload(form: HTMLFormElement) {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/offers/${offerId}/documents`, {
      method: "POST",
      body: new FormData(form),
    });
    setPending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Échec du dépôt");
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <Button type="button" size="sm" onClick={generate} disabled={generating}>
        <Sparkles className="size-4" aria-hidden />
        {generating ? "Rédaction en cours (30 s environ)…" : cvUrl ? "Régénérer CV + lettre" : "Générer CV + lettre"}
      </Button>

      {fitScore !== null && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Adéquation : </span>
          {fitScore}/100{fitScore < 70 ? " (sous le seuil de 70 : en mode auto, l'extension ne postule pas)" : ""}
        </p>
      )}

      {(axis || coverage !== null) && (
        <dl className="grid grid-cols-2 gap-3">
          {axis && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Axe</dt>
              <dd className="mt-0.5 font-medium">{axis}</dd>
            </div>
          )}
          {coverage !== null && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Couverture ATS</dt>
              <dd className="mt-0.5 font-medium">{coverage} %</dd>
            </div>
          )}
        </dl>
      )}

      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((k) => (
            <Badge key={k} variant="outline">{k}</Badge>
          ))}
        </div>
      )}

      {gaps && <p className="text-muted-foreground"><span className="font-medium text-foreground">Écarts : </span>{gaps}</p>}
      {recruiter && <p className="text-muted-foreground"><span className="font-medium text-foreground">Recruteur : </span>{recruiter}</p>}
      {followUpDue && (
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Relance : </span>
          {followUpSentAt ? "envoyée" : `prévue le ${new Date(followUpDue).toLocaleDateString("fr-FR")}`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {cvUrl && (
          <a href={cvUrl} download className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <Download className="size-4" aria-hidden /> CV adapté
          </a>
        )}
        {letterUrl && (
          <a href={letterUrl} download className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <Download className="size-4" aria-hidden /> Lettre adaptée
          </a>
        )}
      </div>
      {cvUrl && (
        <p className="text-xs text-muted-foreground">
          L&apos;extension téléversera ce CV, et cette lettre si le formulaire demande un fichier, à la place de ceux du profil.
        </p>
      )}

      <form
        className="flex flex-col gap-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          upload(e.currentTarget);
        }}
      >
        <p className="text-xs text-muted-foreground">Ou dépose des PDF faits ailleurs :</p>
        <label className="text-xs font-medium text-muted-foreground">
          CV adapté (PDF)
          <input name="cv" type="file" accept="application/pdf" className="mt-1 block w-full text-xs" />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Lettre adaptée (PDF)
          <input name="letter" type="file" accept="application/pdf" className="mt-1 block w-full text-xs" />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          <Upload className="size-4" aria-hidden />
          {pending ? "Envoi…" : "Déposer"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>
    </div>
  );
}
