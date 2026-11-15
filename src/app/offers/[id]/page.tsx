import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusSelect } from "@/components/status-select";
import { offerSource } from "@/lib/offer-source";
import { matchScoreBadge } from "@/lib/offer-score";
import { MarkAppliedButton } from "@/components/mark-applied-button";
import { DeleteOfferButton } from "@/components/delete-offer-button";
import { ScoreOfferButton } from "@/components/score-offer-button";
import {
  ArrowLeft,
  Building2,
  MapPin,
  FileSignature,
  ExternalLink,
  Target,
} from "lucide-react";
import { LetterPanel } from "./letter-panel";
import { TailoredPanel } from "./tailored-panel";
import { DocPreview } from "./doc-preview";

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: offer } = await supabase
    .from("offers")
    .select("*")
    .eq("id", id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!offer) {
    notFound();
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, phone, location")
    .eq("user_id", user!.id)
    .maybeSingle();

  // Liens temporaires vers le CV et la lettre adaptés : une version affichée
  // dans la page (aperçu) et une version qui force le téléchargement.
  const fileSlug = (v: string | null | undefined) =>
    (v ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
  const nameParts = [fileSlug(profile?.full_name), fileSlug(offer.company), fileSlug(offer.title)].filter(Boolean).join("_");
  const signed = async (path: string | null | undefined, download?: string) => {
    if (!path) return null;
    const { data } = await supabase.storage
      .from("cvs")
      .createSignedUrl(path, 3600, download ? { download } : undefined);
    return data?.signedUrl ?? null;
  };
  const [cvUrl, letterUrl, cvDownload, letterDownload] = await Promise.all([
    signed(offer.tailored_cv_path),
    signed(offer.tailored_letter_path),
    signed(offer.tailored_cv_path, `CV_${nameParts || "adapte"}.pdf`),
    signed(offer.tailored_letter_path, `LM_${nameParts || "adaptee"}.pdf`),
  ]);

  const meta = [
    { label: "Type de contrat", value: offer.contract_type ?? "—" },
    { label: "Salaire", value: offer.salary ?? "—" },
    {
      label: "Télétravail",
      value: offer.remote === null ? "—" : offer.remote ? "Oui" : "Non",
    },
    { label: "Expérience", value: offer.experience_years ?? "—" },
  ];

  return (
    <AppShell
      title={offer.title ?? "Offre"}
      userName={userDisplayName(user)}
      actions={
        <StatusSelect key={offer.status} offerId={offer.id} status={offer.status} />
      }
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux offres
        </Link>
        <DeleteOfferButton offerId={offer.id} redirectTo="/applications" label="Supprimer l'offre" />
      </div>

      <p className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <Building2 className="size-4" aria-hidden />
          {offer.company ?? "Entreprise inconnue"}
        </span>
        {offer.location && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-4" aria-hidden />
            {offer.location}
          </span>
        )}
        {(() => {
          const source = offerSource(offer);
          return source ? (
            <Badge variant="outline" className={source.className}>
              {source.label}
            </Badge>
          ) : null;
        })()}
      </p>

      <div className="mb-8">
        <MarkAppliedButton offerId={offer.id} status={offer.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {(cvUrl || letterUrl) && (
            <DocPreview cvUrl={cvUrl} letterUrl={letterUrl} cvDownload={cvDownload} letterDownload={letterDownload} />
          )}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Correspondance avec ton profil</h2>
              {offer.match_score === null ? (
                <ScoreOfferButton offerId={offer.id} />
              ) : (
                <Badge variant={matchScoreBadge(offer.match_score).variant}>
                  {matchScoreBadge(offer.match_score).label}
                </Badge>
              )}
            </div>
            {offer.match_reason && (
              <p className="text-sm text-muted-foreground">{offer.match_reason}</p>
            )}
          </Card>

          <Card className="p-5">
            <dl className="grid grid-cols-2 gap-4 text-sm">
              {meta.map((m) => (
                <div key={m.label}>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {m.label}
                  </dt>
                  <dd className="mt-0.5 font-medium">{m.value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {offer.skills?.length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold">Compétences</h2>
              <div className="flex flex-wrap gap-2">
                {offer.skills.map((skill: string) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {offer.summary && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold">Résumé</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {offer.summary}
              </p>
            </Card>
          )}

          {offer.raw_text && (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold">Fiche de poste complète</h2>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {offer.raw_text}
              </p>
            </Card>
          )}

          {offer.url && (
            <a
              href={offer.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <ExternalLink className="size-4" aria-hidden />
              Voir l&apos;offre originale
            </a>
          )}

          <div className="border-t border-border pt-6">
            <MarkAppliedButton offerId={offer.id} status={offer.status} />
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-1">
          <Card className="p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Target className="size-4 text-primary" aria-hidden />
              Candidature adaptée
            </h2>
            <TailoredPanel
              offerId={offer.id}
              axis={offer.axis ?? null}
              coverage={offer.ats_coverage ?? null}
              keywords={offer.ats_keywords ?? []}
              gaps={offer.gaps ?? null}
              recruiter={offer.recruiter ?? null}
              followUpDue={offer.follow_up_due ?? null}
              followUpSentAt={offer.follow_up_sent_at ?? null}
              cvUrl={cvDownload}
              letterUrl={letterDownload}
              fitScore={offer.fit_score ?? null}
              cvPhoto={offer.cv_photo ?? null}
              cvPhotoReason={offer.cv_photo_reason ?? null}
            />
          </Card>
          <Card className="p-5 lg:sticky lg:top-6">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <FileSignature className="size-4 text-primary" aria-hidden />
              Lettre de motivation
            </h2>
            <LetterPanel
              offerId={offer.id}
              letterText={offer.cover_letter_text}
              fileBaseName={offer.company ?? offer.title ?? "candidature"}
              senderName={profile?.full_name ?? null}
              senderPhone={profile?.phone ?? null}
              senderLocation={profile?.location ?? null}
              recipientCompany={offer.company ?? null}
              recipientLocation={offer.location ?? null}
              offerTitle={offer.title ?? null}
            />
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
