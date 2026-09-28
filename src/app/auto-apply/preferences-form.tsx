"use client";

import { useActionState } from "react";
import { savePreferences } from "./actions";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import type { ApplyPreferences } from "@/lib/auto-apply/preferences";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function PreferencesForm({ preferences }: { preferences: ApplyPreferences }) {
  const [state, formAction, pending] = useActionState(savePreferences, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">Mode d&apos;envoi</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
          <input
            type="radio"
            name="mode"
            value="semi"
            defaultChecked={preferences.mode === "semi"}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Semi-automatique (recommandé)</span>
            <span className="block text-xs text-muted-foreground">
              L&apos;extension remplit tout le formulaire, puis s&apos;arrête : tu vérifies et tu
              cliques toi-même sur Envoyer.
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
          <input
            type="radio"
            name="mode"
            value="auto"
            defaultChecked={preferences.mode === "auto"}
            className="mt-1 size-4 accent-primary"
          />
          <span>
            <span className="block text-sm font-medium">Automatique</span>
            <span className="block text-xs text-muted-foreground">
              L&apos;extension envoie aussi la candidature. Elle abandonne l&apos;offre si une
              question obligatoire n&apos;a pas de réponse fiable. Les sites tiers interdisent
              généralement l&apos;automatisation : ton compte peut être restreint.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="minScore"
          label="Score minimum (0-10)"
          hint="Les offres sous ce score de correspondance avec ton CV sont ignorées. 0 = postuler à tout."
        >
          <Input
            id="minScore"
            name="minScore"
            type="number"
            min={0}
            max={10}
            defaultValue={preferences.min_score}
          />
        </Field>
        <Field
          id="dailyLimit"
          label="Plafond sur 24 h"
          hint="Nombre maximum de candidatures envoyées sur une période glissante de 24 h."
        >
          <Input
            id="dailyLimit"
            name="dailyLimit"
            type="number"
            min={1}
            max={100}
            defaultValue={preferences.daily_limit}
          />
        </Field>
      </div>

      <Field
        id="blacklist"
        label="Entreprises à éviter"
        hint="Une par ligne. Le nom est comparé sans tenir compte des majuscules."
      >
        <Textarea
          id="blacklist"
          name="blacklist"
          rows={3}
          defaultValue={preferences.blacklist.join("\n")}
        />
      </Field>

      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          name="acceptConsents"
          defaultChecked={preferences.accept_consents}
          className="mt-1 size-4 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">
            Cocher les cases de consentement à ma place
          </span>
          <span className="block text-xs text-muted-foreground">
            Conditions d&apos;utilisation, politique de confidentialité, RGPD. Désactivé par
            défaut : tu donnes ton consentement toi-même.
          </span>
        </span>
      </label>

      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-semibold">Informations pour les formulaires</h2>
        <p className="mb-4 mt-1 text-xs text-muted-foreground">
          Ces réponses ne sont jamais devinées : si un champ est vide ici et absent de ton CV,
          la question reste sans réponse.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="linkedinUrl" label="Profil LinkedIn">
            <Input
              id="linkedinUrl"
              name="linkedinUrl"
              type="url"
              placeholder="https://www.linkedin.com/in/..."
              defaultValue={preferences.linkedin_url}
            />
          </Field>
          <Field id="githubUrl" label="GitHub">
            <Input
              id="githubUrl"
              name="githubUrl"
              type="url"
              placeholder="https://github.com/..."
              defaultValue={preferences.github_url}
            />
          </Field>
          <Field id="salaryExpectation" label="Prétentions salariales">
            <Input
              id="salaryExpectation"
              name="salaryExpectation"
              placeholder="Ex : 45 000 € brut / an"
              defaultValue={preferences.salary_expectation}
            />
          </Field>
          <Field id="noticePeriod" label="Préavis">
            <Input
              id="noticePeriod"
              name="noticePeriod"
              placeholder="Ex : 1 mois"
              defaultValue={preferences.notice_period}
            />
          </Field>
          <Field id="availability" label="Disponibilité">
            <Input
              id="availability"
              name="availability"
              placeholder="Ex : immédiate, ou à partir du 01/09"
              defaultValue={preferences.availability}
            />
          </Field>
          <Field id="workAuthorization" label="Autorisation de travail">
            <Input
              id="workAuthorization"
              name="workAuthorization"
              placeholder="Ex : Oui, citoyen de l'Union européenne"
              defaultValue={preferences.work_authorization}
            />
          </Field>
          <Field id="needsSponsorship" label="Besoin de sponsoring / visa">
            <Input
              id="needsSponsorship"
              name="needsSponsorship"
              placeholder="Ex : Non"
              defaultValue={preferences.needs_sponsorship}
            />
          </Field>
        </div>
        <div className="mt-4">
          <Field
            id="notes"
            label="Autres informations"
            hint="Transmises à l'IA pour répondre aux questions : permis, mobilité, langues, etc."
          >
            <Textarea id="notes" name="notes" rows={3} defaultValue={preferences.notes} />
          </Field>
        </div>
      </div>

      <div aria-live="polite">
        {state?.error && (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        )}
        {state?.success && (
          <p className="text-sm font-medium text-success">Préférences enregistrées.</p>
        )}
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Enregistrement..." : "Enregistrer"}
      </Button>
    </form>
  );
}
