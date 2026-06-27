"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isCandidateStatus, statusLabel } from "@/lib/offer-status";
import { Check, Send } from "lucide-react";

export function MarkAppliedButton({
  offerId,
  status,
}: {
  offerId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyApplied = isCandidateStatus(status);

  async function markApplied() {
    setPending(true);
    setError(null);

    const res = await fetch(`/api/offers/${offerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    setPending(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur lors de l'enregistrement");
      return;
    }
    router.refresh();
  }

  if (alreadyApplied) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-success">
          <Check className="size-4" aria-hidden />
          Candidature enregistrée · {statusLabel(status)}
        </span>
        <Link
          href="/applications"
          className="text-sm font-medium text-primary hover:underline"
        >
          Voir mes candidatures
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={markApplied} disabled={pending} size="lg" className="w-full sm:w-auto">
        <Send aria-hidden />
        {pending ? "Enregistrement..." : "J'ai postulé à cette offre"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
