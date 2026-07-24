"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { DeleteOfferButton } from "@/components/delete-offer-button";
import { statusLabel, statusVariant, STATUS_LABELS } from "@/lib/offer-status";
import { offerSource } from "@/lib/offer-source";
import { matchScoreBadge } from "@/lib/offer-score";
import { MapPin, ListFilter, X, Trash2 } from "lucide-react";

export type ExplorerOffer = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  contract_type: string | null;
  remote: boolean | null;
  status: string;
  search_id: string | null;
  url: string | null;
  domain: string | null;
  match_score: number | null;
};

export type SearchOption = { id: string; keyword: string };

type Filters = {
  search: string;
  ville: string;
  contrat: string;
  remote: string;
  statut: string;
};

const EMPTY: Filters = { search: "", ville: "", contrat: "", remote: "", statut: "" };

export function OffersExplorer({
  offers,
  searches,
  initialSearchId = "",
}: {
  offers: ExplorerOffer[];
  searches: SearchOption[];
  initialSearchId?: string;
}) {
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, search: initialSearchId });
  const [list, setList] = useState(offers);

  const villes = useMemo(
    () =>
      Array.from(new Set(list.map((o) => o.location).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b, "fr")
      ),
    [list]
  );
  const contrats = useMemo(
    () =>
      Array.from(
        new Set(list.map((o) => o.contract_type).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [list]
  );
  const statuts = useMemo(
    () => Array.from(new Set(list.map((o) => o.status))),
    [list]
  );

  // N'affiche dans le filtre que les recherches ayant encore au moins une offre.
  const availableSearches = useMemo(() => {
    const ids = new Set(list.map((o) => o.search_id).filter(Boolean));
    return searches.filter((s) => ids.has(s.id));
  }, [list, searches]);

  const filtered = useMemo(
    () =>
      list.filter((o) => {
        if (filters.search && o.search_id !== filters.search) return false;
        if (filters.ville && o.location !== filters.ville) return false;
        if (filters.contrat && o.contract_type !== filters.contrat) return false;
        if (filters.remote === "yes" && o.remote !== true) return false;
        if (filters.remote === "no" && o.remote !== false) return false;
        if (filters.statut && o.status !== filters.statut) return false;
        return true;
      }),
    [list, filters]
  );

  const set = (key: keyof Filters) => (v: string) =>
    setFilters((f) => ({ ...f, [key]: v }));
  const activeCount = Object.values(filters).filter(Boolean).length;

  const [deleting, setDeleting] = useState(false);
  const selectedSearch = searches.find((s) => s.id === filters.search);
  const searchCount = useMemo(
    () => (filters.search ? list.filter((o) => o.search_id === filters.search).length : 0),
    [list, filters.search]
  );

  async function deleteSearch() {
    if (!selectedSearch) return;
    if (
      !window.confirm(
        `Supprimer définitivement les ${searchCount} offre${searchCount > 1 ? "s" : ""} de la recherche « ${selectedSearch.keyword} » et leurs lettres ? Cette action est irréversible.`
      )
    ) {
      return;
    }

    setDeleting(true);
    const res = await fetch(`/api/searches/${selectedSearch.id}/offers`, {
      method: "DELETE",
      redirect: "manual",
    });

    if (res.type === "opaqueredirect" || res.status === 0) {
      setDeleting(false);
      window.alert("Session expirée. Reconnecte-toi puis réessaie.");
      return;
    }

    if (!res.ok) {
      setDeleting(false);
      const data = await res.json().catch(() => ({}));
      window.alert(data.error ?? "Erreur lors de la suppression");
      return;
    }

    setList((l) => l.filter((o) => o.search_id !== selectedSearch.id));
    setFilters((f) => ({ ...f, search: "" }));
    setDeleting(false);
  }

  return (
    <>
      <Card className="mb-6 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <ListFilter className="size-4 text-primary" aria-hidden />
            Filtres
          </span>
          {activeCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFilters(EMPTY)}
            >
              <X aria-hidden />
              Réinitialiser ({activeCount})
            </Button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <FilterSelect label="Ville" value={filters.ville} onChange={set("ville")}>
            <option value="">Toutes</option>
            {villes.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Contrat" value={filters.contrat} onChange={set("contrat")}>
            <option value="">Tous</option>
            {contrats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Télétravail" value={filters.remote} onChange={set("remote")}>
            <option value="">Tous</option>
            <option value="yes">Oui</option>
            <option value="no">Non</option>
          </FilterSelect>

          <FilterSelect label="Statut" value={filters.statut} onChange={set("statut")}>
            <option value="">Tous</option>
            {statuts.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] ?? s}
              </option>
            ))}
          </FilterSelect>

          <FilterSelect label="Recherche" value={filters.search} onChange={set("search")}>
            <option value="">Toutes</option>
            {availableSearches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.keyword}
              </option>
            ))}
          </FilterSelect>
        </div>
      </Card>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {filtered.length} offre{filtered.length > 1 ? "s" : ""}
          {activeCount > 0 ? " (filtrées)" : ""}
        </h2>
        {selectedSearch && searchCount > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={deleteSearch}
            disabled={deleting}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden />
            {deleting
              ? "Suppression..."
              : `Supprimer toute cette recherche (${searchCount})`}
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {list.length === 0
              ? "Aucune offre pour le moment. Ajoute une URL ou colle le texte d'une offre ci-dessus."
              : "Aucune offre ne correspond à ces filtres."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((offer) => (
            <li key={offer.id}>
              <Card className="group relative flex h-full flex-col gap-3 p-5 transition-all hover:border-primary/40 hover:shadow-md">
                <Link
                  href={`/offers/${offer.id}`}
                  className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={offer.title ?? "Voir l'offre"}
                />
                <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-snug group-hover:text-primary">
                    {offer.title ?? "Sans titre"}
                  </h3>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={matchScoreBadge(offer.match_score).variant}>
                      {matchScoreBadge(offer.match_score).label}
                    </Badge>
                    <Badge variant={statusVariant(offer.status)}>
                      {statusLabel(offer.status)}
                    </Badge>
                    {(() => {
                      const source = offerSource(offer);
                      return source ? (
                        <Badge variant="outline" className={source.className}>
                          {source.label}
                        </Badge>
                      ) : null;
                    })()}
                  </div>
                </div>
                <p className="pointer-events-none relative z-10 text-sm font-medium text-foreground">
                  {offer.company ?? "Entreprise inconnue"}
                </p>
                <div className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-2">
                  {offer.location ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {offer.location}
                      {offer.remote ? " · Télétravail" : ""}
                    </p>
                  ) : (
                    <span />
                  )}
                  <span className="pointer-events-auto">
                    <DeleteOfferButton
                      offerId={offer.id}
                      onDeleted={() => setList((l) => l.filter((o) => o.id !== offer.id))}
                      iconOnly
                    />
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
