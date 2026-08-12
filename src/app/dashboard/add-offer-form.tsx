"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Mode = "url" | "text" | "pdf";

const MODE_LABELS: Record<Mode, string> = {
  url: "URL de l'offre",
  text: "Texte collé",
  pdf: "Fichier PDF",
};

export function AddOfferForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("url");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    let res: Response;
    if (mode === "pdf") {
      if (!file) {
        setPending(false);
        setError("Sélectionne un fichier PDF");
        return;
      }
      // Le PDF part en multipart : c'est la route /api/offers/pdf qui le relaie
      // au workflow n8n dédié.
      const body = new FormData();
      body.append("pdf", file);
      res = await fetch("/api/offers/pdf", { method: "POST", body });
    } else {
      res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "url" ? { url: value } : { text: value }),
      });
    }

    const data = await res.json().catch(() => ({}));
    setPending(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'ajout de l'offre");
      return;
    }

    setValue("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1 text-sm">
        {(["url", "text", "pdf"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors",
              mode === m
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {mode === "url" && (
        <Input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://..."
          required
        />
      )}
      {mode === "text" && (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Colle ici le texte de l'offre..."
          rows={6}
          required
        />
      )}
      {mode === "pdf" && (
        <div className="flex flex-col gap-1.5">
          <Input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Le PDF doit contenir du texte sélectionnable (10 Mo max). Les scans
            d&apos;images ne sont pas lisibles.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Analyse en cours..." : "Ajouter et générer la lettre"}
      </Button>
    </form>
  );
}
