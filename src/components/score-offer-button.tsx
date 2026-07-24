"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

export function ScoreOfferButton({
  offerId,
  onScored,
}: {
  offerId: string;
  onScored?: (score: number) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScore() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/offers/${offerId}/score`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setPending(false);

    if (!res.ok) {
      setError(data.error ?? "Erreur lors de la notation");
      return;
    }

    if (typeof data.match_score === "number") {
      onScored?.(data.match_score);
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        onClick={handleScore}
        disabled={pending}
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs"
        title={error ?? "Calculer la note de correspondance avec ton profil"}
      >
        <Sparkles className="size-3.5" aria-hidden />
        {pending ? "Notation..." : "Noter"}
      </Button>
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
