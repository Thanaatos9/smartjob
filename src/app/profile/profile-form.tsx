"use client";

import { useActionState } from "react";
import { updateProfile } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";

type Profile = {
  full_name: string | null;
  phone: string | null;
  location: string | null;
  cv_text: string | null;
  cv_pdf_path: string | null;
  additional_skills: string | null;
} | null;

export function ProfileForm({ profile, email }: { profile: Profile; email: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, null);

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
          CV (PDF)
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
          Format PDF, 10 Mo maximum. Le texte est extrait automatiquement.
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
