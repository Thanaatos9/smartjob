"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload } from "lucide-react";

// Candidature adaptée par le skill « postuler » : ciblage ATS, documents et relance.
// Le dépôt manuel sert quand le skill n'a pas pu envoyer les PDF lui-même.
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
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <a href={cvUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <Download className="size-4" aria-hidden /> CV adapté
          </a>
        )}
        {letterUrl && (
          <a href={letterUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
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
