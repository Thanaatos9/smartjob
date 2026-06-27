"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/ui/filter-select";
import { statusLabel, statusVariant, STATUS_LABELS } from "@/lib/offer-status";
import { MapPin, ListFilter, X } from "lucide-react";

export type ExplorerOffer = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  contract_type: string | null;
  remote: boolean | null;
  status: string;
  search_id: string | null;
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

  const villes = useMemo(
    () =>
      Array.from(new Set(offers.map((o) => o.location).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b, "fr")
      ),
    [offers]
  );
  const contrats = useMemo(
    () =>
      Array.from(
        new Set(offers.map((o) => o.contract_type).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [offers]
  );
  const statuts = useMemo(
    () => Array.from(new Set(offers.map((o) => o.status))),
    [offers]
  );

  const filtered = useMemo(
    () =>
      offers.filter((o) => {
        if (filters.search && o.search_id !== filters.search) return false;
        if (filters.ville && o.location !== filters.ville) return false;
        if (filters.contrat && o.contract_type !== filters.contrat) return false;
        if (filters.remote === "yes" && o.remote !== true) return false;
        if (filters.remote === "no" && o.remote !== false) return false;
        if (filters.statut && o.status !== filters.statut) return false;
        return true;
      }),
    [offers, filters]
  );

  const set = (key: keyof Filters) => (v: string) =>
    setFilters((f) => ({ ...f, [key]: v }));
  const activeCount = Object.values(filters).filter(Boolean).length;

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
            {searches.map((s) => (
              <option key={s.id} value={s.id}>
                {s.keyword}
              </option>
            ))}
          </FilterSelect>
        </div>
      </Card>

      <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
        {filtered.length} offre{filtered.length > 1 ? "s" : ""}
        {activeCount > 0 ? " (filtrées)" : ""}
      </h2>

      {filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {offers.length === 0
              ? "Aucune offre pour le moment. Ajoute une URL ou colle le texte d'une offre ci-dessus."
              : "Aucune offre ne correspond à ces filtres."}
          </p>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((offer) => (
            <li key={offer.id}>
              <Link href={`/offers/${offer.id}`} className="group block h-full">
                <Card className="flex h-full flex-col gap-3 p-5 transition-all group-hover:border-primary/40 group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold leading-snug group-hover:text-primary">
                      {offer.title ?? "Sans titre"}
                    </h3>
                    <Badge variant={statusVariant(offer.status)} className="shrink-0">
                      {statusLabel(offer.status)}
                    </Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {offer.company ?? "Entreprise inconnue"}
                  </p>
                  {offer.location && (
                    <p className="mt-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {offer.location}
                      {offer.remote ? " · Télétravail" : ""}
                    </p>
                  )}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
