"use client";

import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterSelect } from "@/components/ui/filter-select";
import { Search, MapPin, Wallet, Building2, History, EyeOff, ListFilter, X } from "lucide-react";
import type { SearchOfferResult } from "@/lib/n8n/client";
import type { SearchHistoryRow } from "@/lib/searches";

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const replayed = useRef(false);
  const [keyword, setKeyword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offers, setOffers] = useState<SearchOfferResult[] | null>(null);
  const [duplicateIds, setDuplicateIds] = useState<Set<string>>(new Set());
  const [hideDuplicates, setHideDuplicates] = useState(false);
  const [villeFilter, setVilleFilter] = useState("");
  const [contratFilter, setContratFilter] = useState("");
  const [history, setHistory] = useState<SearchHistoryRow[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/searches");
    if (res.ok) {
      const data = await res.json();
      setHistory(data.searches ?? []);
    }
  }, []);

  useEffect(() => {
    // Chargement initial de l'historique (fetch réseau, setState après await).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHistory();
  }, [loadHistory]);

  const runSearch = useCallback(
    async (term: string) => {
      const q = term.trim();
      if (!q) return;
      setPending(true);
      setError(null);

      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q }),
      });
      const data = await res.json();
      setPending(false);

      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la recherche");
        return;
      }

      setOffers(data.offers ?? []);
      setDuplicateIds(new Set<string>(data.duplicateIds ?? []));
      setVilleFilter("");
      setContratFilter("");
      setHideDuplicates(false);
      loadHistory();
    },
    [loadHistory]
  );

  // Relance depuis l'historique : /search?q=mot-clé
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && !replayed.current) {
      replayed.current = true;
      setKeyword(q);
      runSearch(q);
    }
  }, [searchParams, runSearch]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(keyword);
  }

  function replaySearch(term: string) {
    setKeyword(term);
    runSearch(term);
  }

  const duplicateCount = duplicateIds.size;

  // Dédoublonne les recherches récentes par mot-clé (garde la plus récente).
  // L'historique arrive trié par date décroissante depuis l'API.
  const recentSearches = useMemo(() => {
    const seen = new Set<string>();
    const out: SearchHistoryRow[] = [];
    for (const h of history) {
      const key = h.keyword.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(h);
    }
    return out;
  }, [history]);

  const villes = useMemo(
    () =>
      Array.from(
        new Set((offers ?? []).map((o) => o.location).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [offers]
  );
  const contrats = useMemo(
    () =>
      Array.from(
        new Set((offers ?? []).map((o) => o.contract_type).filter(Boolean) as string[])
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [offers]
  );

  const visibleOffers = (offers ?? []).filter((o) => {
    if (hideDuplicates && duplicateIds.has(o.id)) return false;
    if (villeFilter && o.location !== villeFilter) return false;
    if (contratFilter && o.contract_type !== contratFilter) return false;
    return true;
  });

  const activeFilters =
    (villeFilter ? 1 : 0) + (contratFilter ? 1 : 0) + (hideDuplicates ? 1 : 0);
  function resetFilters() {
    setVilleFilter("");
    setContratFilter("");
    setHideDuplicates(false);
  }

  return (
    <AppShell
      title="Rechercher des offres"
      subtitle="Trouve des offres et ajoute-les à ton suivi en un clic."
    >
      <Card className="mb-6 p-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <label htmlFor="keyword" className="sr-only">
              Mot-clé de recherche
            </label>
            <Input
              id="keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="ex: développeur backend, chef de projet..."
              required
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={pending} size="lg" className="sm:w-auto">
            {pending ? "Recherche..." : "Rechercher"}
          </Button>
        </form>
      </Card>

      {recentSearches.length > 0 && (
        <div className="mb-8">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <History className="size-3.5" aria-hidden />
            Recherches récentes
          </p>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => replaySearch(h.keyword)}
                disabled={pending}
                className="group inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-muted disabled:opacity-50 cursor-pointer"
                title={`Relancer « ${h.keyword} »`}
              >
                <span className="font-medium">{h.keyword}</span>
                <span className="text-xs text-muted-foreground">
                  {h.result_count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div aria-live="polite">
        {offers !== null && offers.length === 0 && (
          <Card className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Aucune offre trouvée pour ce mot-clé.
            </p>
          </Card>
        )}

        {offers && offers.length > 0 && (
          <>
            <Card className="mb-6 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <ListFilter className="size-4 text-primary" aria-hidden />
                  Filtres
                </span>
                {activeFilters > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                    <X aria-hidden />
                    Réinitialiser ({activeFilters})
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <FilterSelect label="Ville" value={villeFilter} onChange={setVilleFilter}>
                  <option value="">Toutes</option>
                  {villes.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
                <FilterSelect label="Contrat" value={contratFilter} onChange={setContratFilter}>
                  <option value="">Tous</option>
                  {contrats.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </FilterSelect>
                {duplicateCount > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted-foreground">
                      Doublons
                    </span>
                    <Button
                      type="button"
                      variant={hideDuplicates ? "default" : "outline"}
                      onClick={() => setHideDuplicates((v) => !v)}
                      className="justify-start"
                    >
                      <EyeOff aria-hidden />
                      {hideDuplicates ? "Masqués" : `Masquer (${duplicateCount})`}
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            <p className="mb-4 text-sm text-muted-foreground">
              {visibleOffers.length} résultat{visibleOffers.length > 1 ? "s" : ""}
              {activeFilters > 0 ? ` sur ${offers.length}` : ""}
              {duplicateCount > 0 && (
                <span> · {duplicateCount} déjà vue{duplicateCount > 1 ? "s" : ""}</span>
              )}
            </p>

            {visibleOffers.length === 0 ? (
              <Card className="p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  Aucun résultat ne correspond à ces filtres.
                </p>
              </Card>
            ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleOffers.map((offer) => {
                const isDup = duplicateIds.has(offer.id);
                return (
                  <li key={offer.id}>
                    <Link href={`/offers/${offer.id}`} className="group block h-full">
                      <Card className="flex h-full flex-col gap-3 p-5 transition-all group-hover:border-primary/40 group-hover:shadow-md">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-semibold leading-snug group-hover:text-primary">
                            {offer.title ?? "Sans titre"}
                          </h3>
                          {isDup ? (
                            <Badge variant="muted" className="shrink-0">
                              Déjà vue
                            </Badge>
                          ) : (
                            offer.contract_type && (
                              <Badge variant="secondary" className="shrink-0">
                                {offer.contract_type}
                              </Badge>
                            )
                          )}
                        </div>
                        <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <Building2 className="size-3.5 text-muted-foreground" aria-hidden />
                          {offer.company ?? "Entreprise non précisée"}
                        </p>
                        <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {offer.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3.5" aria-hidden />
                              {offer.location}
                            </span>
                          )}
                          {offer.salary && (
                            <span className="flex items-center gap-1">
                              <Wallet className="size-3.5" aria-hidden />
                              {offer.salary}
                            </span>
                          )}
                        </div>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
