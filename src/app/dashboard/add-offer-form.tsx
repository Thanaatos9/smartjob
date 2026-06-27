"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function AddOfferForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    const res = await fetch("/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "url" ? { url: value } : { text: value }),
    });

    const data = await res.json();
    setPending(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de l'ajout de l'offre");
      return;
    }

    setValue("");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="inline-flex w-fit rounded-lg bg-muted p-1 text-sm">
        {(["url", "text"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 font-medium transition-colors",
              mode === m
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "url" ? "URL de l'offre" : "Texte collé"}
          </button>
        ))}
      </div>
      {mode === "url" ? (
        <Input
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://..."
          required
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Colle ici le texte de l'offre..."
          rows={6}
          required
        />
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
