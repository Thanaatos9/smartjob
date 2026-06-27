"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeleteOfferButton({
  offerId,
  onDeleted,
  redirectTo,
  label,
  iconOnly = false,
}: {
  offerId: string;
  onDeleted?: () => void;
  redirectTo?: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (
      !window.confirm(
        "Supprimer définitivement cette offre et sa lettre ? Cette action est irréversible."
      )
    ) {
      return;
    }

    setPending(true);
    const res = await fetch(`/api/offers/${offerId}`, {
      method: "DELETE",
      redirect: "manual",
    });

    // Une réponse opaque/redirigée = session expirée : on ne fait pas comme si
    // c'était un succès (fetch suivrait sinon la redirection vers /login en 200).
    if (res.type === "opaqueredirect" || res.status === 0) {
      setPending(false);
      window.alert("Session expirée. Reconnecte-toi puis réessaie.");
      return;
    }

    if (!res.ok) {
      setPending(false);
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Erreur lors de la suppression");
      return;
    }

    onDeleted?.();
    if (redirectTo) {
      router.push(redirectTo);
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "sm"}
      onClick={handleDelete}
      disabled={pending}
      aria-label="Supprimer l'offre"
      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 aria-hidden />
      {!iconOnly && (label ?? (pending ? "Suppression..." : "Supprimer"))}
    </Button>
  );
}
