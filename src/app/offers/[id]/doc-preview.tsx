"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Download } from "lucide-react";

// Aperçu du CV et de la lettre adaptés, affichés dans la page, avec
// téléchargement direct du document visible.
export function DocPreview({
  cvUrl,
  letterUrl,
  cvDownload,
  letterDownload,
}: {
  cvUrl: string | null;
  letterUrl: string | null;
  cvDownload: string | null;
  letterDownload: string | null;
}) {
  const [tab, setTab] = useState<"cv" | "letter">(cvUrl ? "cv" : "letter");
  const src = tab === "cv" ? cvUrl : letterUrl;
  const download = tab === "cv" ? cvDownload : letterDownload;

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
    }`;

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          {cvUrl && (
            <button type="button" className={tabClass(tab === "cv")} onClick={() => setTab("cv")}>
              CV adapté
            </button>
          )}
          {letterUrl && (
            <button type="button" className={tabClass(tab === "letter")} onClick={() => setTab("letter")}>
              Lettre adaptée
            </button>
          )}
        </div>
        {download && (
          <a href={download} download className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <Download className="size-4" aria-hidden />
            Télécharger
          </a>
        )}
      </div>
      {src && (
        <iframe
          key={src}
          src={`${src}#toolbar=0&navpanes=0&view=FitH`}
          title={tab === "cv" ? "Aperçu du CV adapté" : "Aperçu de la lettre adaptée"}
          className="h-[80vh] max-h-[1100px] min-h-[600px] w-full rounded-md border border-border bg-white"
        />
      )}
    </Card>
  );
}
