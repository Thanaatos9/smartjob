"use client";

import { useState } from "react";
import Link from "next/link";
import { StatusSelect } from "@/components/status-select";
import { DeleteOfferButton } from "@/components/delete-offer-button";
import { Card } from "@/components/ui/card";
import { isCandidateStatus } from "@/lib/offer-status";
import { ExternalLink } from "lucide-react";

export type ApplicationRow = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  status: string;
  notes: string | null;
  updated_at: string;
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function NotesCell({ id, value }: { id: string; value: string | null }) {
  const [note, setNote] = useState(value ?? "");
  const [saved, setSaved] = useState(value ?? "");
  const [saving, setSaving] = useState(false);

  async function persist() {
    if (note === saved) return;
    setSaving(true);
    const res = await fetch(`/api/offers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: note }),
    });
    setSaving(false);
    if (res.ok) setSaved(note);
  }

  return (
    <div className="relative">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={persist}
        rows={2}
        placeholder="Ajouter une note…"
        className="min-h-16 w-full min-w-52 resize-y rounded-md border border-input bg-card px-2 py-1.5 text-sm text-foreground transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      />
      {saving && (
        <span className="absolute right-2 top-1.5 text-[10px] font-medium text-muted-foreground">
          …
        </span>
      )}
      {!saving && note !== saved && (
        <span className="absolute right-2 top-1.5 text-[10px] font-medium text-warning">
          non enregistré
        </span>
      )}
    </div>
  );
}

export function ApplicationsTable({ rows }: { rows: ApplicationRow[] }) {
  const [list, setList] = useState(rows);

  function onStatusChanged(id: string, next: string) {
    if (!isCandidateStatus(next)) {
      // L'offre n'est plus une candidature : on la retire du tableau.
      setList((l) => l.filter((r) => r.id !== id));
    } else {
      setList((l) => l.map((r) => (r.id === id ? { ...r, status: next } : r)));
    }
  }

  function onDeleted(id: string) {
    setList((l) => l.filter((r) => r.id !== id));
  }

  if (list.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-muted-foreground">
          Aucune candidature pour l&apos;instant. Passe une offre au statut{" "}
          <span className="font-medium text-foreground">Postulé</span> depuis sa fiche
          pour la retrouver ici.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-4 py-3 font-semibold">Poste</th>
              <th className="px-4 py-3 font-semibold">Ville</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold">Notes</th>
              <th className="px-4 py-3 font-semibold">Maj</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium leading-snug">{row.title ?? "Sans titre"}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.company ?? "Entreprise inconnue"}
                  </p>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.location ?? "—"}</td>
                <td className="px-4 py-3">
                  <StatusSelect
                    offerId={row.id}
                    status={row.status}
                    onChanged={(next) => onStatusChanged(row.id, next)}
                  />
                </td>
                <td className="px-4 py-3">
                  <NotesCell id={row.id} value={row.notes} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(row.updated_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/offers/${row.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                    >
                      <ExternalLink className="size-3.5" aria-hidden />
                      Fiche
                    </Link>
                    <DeleteOfferButton
                      offerId={row.id}
                      onDeleted={() => onDeleted(row.id)}
                      iconOnly
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
