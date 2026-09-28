"use client";

import { useActionState } from "react";
import { updateProfile, fetchPortfolio } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

type Profile = {
  full_name: string | null;
  phone: string | null;
  location: string | null;
  cv_text: string | null;
  cv_pdf_path: string | null;
  cv_pdf_path_en?: string | null;
  additional_skills: string | null;
  portfolio_url: string | null;
  portfolio_text: string | null;
  portfolio_fetched_at: string | null;
} | null;

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, null);
  const [portfolioState, portfolioAction, portfolioPending] = useActionState(
    fetchPortfolio,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
          Email
        </label>
        <Input
          id="email"
          value={email}
          disabled
          readOnly
          className="bg-muted text-muted-foreground"
        />
      </div>
      <div>
        <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium">
          Nom complet
        </label>
        <Input
          id="fullName"
          name="fullName"
          autoComplete="name"
          defaultValue={profile?.full_name ?? ""}
        />
      </div>
      <div>
        <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
          Téléphone
        </label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={profile?.phone ?? ""}
        />
      </div>
      <div>
        <label htmlFor="location" className="mb-1.5 block text-sm font-medium">
          Localisation
        </label>
        <Input
          id="location"
          name="location"
          autoComplete="address-level2"
          defaultValue={profile?.location ?? ""}
        />
      </div>
      <div>
        <label htmlFor="cvFile" className="mb-1.5 block text-sm font-medium">
          CV français (PDF)
        </label>
        {profile?.cv_pdf_path && (
          <p className="mb-2 text-sm text-muted-foreground">
            CV actuel : {profile.cv_pdf_path.split("/").pop()}
          </p>
        )}
        <Input
          id="cvFile"
          type="file"
          name="cvFile"
          accept="application/pdf"
          aria-describedby="cv-hint"
        />
        <p id="cv-hint" className="mt-1.5 text-xs text-muted-foreground">
          Format PDF, 10 Mo maximum. Le texte est extrait automatiquement. Ce CV sert
          par défaut, et pour les offres en français.
        </p>
      </div>
      <div>
        <label htmlFor="cvFileEn" className="mb-1.5 block text-sm font-medium">
          CV anglais (PDF)
        </label>
        <p className="mb-2 text-sm text-muted-foreground">
          {profile?.cv_pdf_path_en
            ? `CV actuel : ${profile.cv_pdf_path_en.split("/").pop()}`
            : "Aucun CV anglais enregistré."}
        </p>
        <Input
          id="cvFileEn"
          type="file"
          name="cvFileEn"
          accept="application/pdf"
          aria-describedby="cv-en-hint"
        />
        <p id="cv-en-hint" className="mt-1.5 text-xs text-muted-foreground">
          Utilisé pour les lettres en anglais et par l&apos;extension quand l&apos;offre est en
          anglais. Déposer un nouveau fichier remplace le précédent ; sans CV anglais, le CV
          français est utilisé.
        </p>
      </div>
      <div>
        <label htmlFor="additionalSkills" className="mb-1.5 block text-sm font-medium">
          Qualités et compétences supplémentaires
        </label>
        <Textarea
          id="additionalSkills"
          name="additionalSkills"
          rows={5}
          placeholder="Ex : anglais courant, gestion de projet, autonomie, esprit d'équipe, certifications, soft skills..."
          defaultValue={profile?.additional_skills ?? ""}
          aria-describedby="additional-skills-hint"
        />
        <p id="additional-skills-hint" className="mt-1.5 text-xs text-muted-foreground">
          Ce que ton CV ne dit pas encore : utilisé pour enrichir la note de correspondance
          et tes lettres de motivation.
        </p>
      </div>
      <div>
        <label htmlFor="portfolioUrl" className="mb-1.5 block text-sm font-medium">
          Portfolio (URL)
        </label>
        <Input
          id="portfolioUrl"
          name="portfolioUrl"
          type="url"
          autoComplete="url"
          placeholder="https://mon-portfolio.com"
          defaultValue={profile?.portfolio_url ?? ""}
          aria-describedby="portfolio-hint"
        />
        <p id="portfolio-hint" className="mt-1.5 text-xs text-muted-foreground">
          {profile?.portfolio_fetched_at
            ? `Dernière synchronisation : ${new Date(profile.portfolio_fetched_at).toLocaleString("fr-FR")}`
            : "Pas encore synchronisé."}{" "}
          Le contenu est récupéré une seule fois puis mis en cache, pour ne pas
          re-scraper le site à chaque lettre ou scoring.
        </p>
        <div aria-live="polite">
          {portfolioState?.error && (
            <p role="alert" className="mt-1.5 text-sm text-destructive">
              {portfolioState.error}
            </p>
          )}
          {portfolioState?.success && (
            <p className="mt-1.5 text-sm font-medium text-success">
              Portfolio synchronisé.
            </p>
          )}
        </div>
        <Button
          type="submit"
          formAction={portfolioAction}
          disabled={portfolioPending}
          variant="secondary"
          className="mt-2"
        >
          {portfolioPending ? "Téléchargement..." : "Télécharger le portfolio"}
        </Button>
      </div>
      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-sm font-medium text-success">Profil enregistré.</p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );
}
