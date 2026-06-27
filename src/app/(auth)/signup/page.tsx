"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signup } from "../actions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, null);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            C
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Créer un compte</h1>
          <p className="text-sm text-muted-foreground">
            Commence à suivre tes candidatures.
          </p>
        </div>
        <Card className="p-6">
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="fullName" className="text-sm font-medium">
                Nom complet
              </label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Mot de passe
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                aria-describedby="password-hint"
              />
              <p id="password-hint" className="text-xs text-muted-foreground">
                Au moins 6 caractères.
              </p>
            </div>
            {state?.error && (
              <p role="alert" className="text-sm text-destructive">
                {state.error}
              </p>
            )}
            <Button type="submit" disabled={pending} size="lg">
              {pending ? "Création..." : "Créer mon compte"}
            </Button>
          </form>
        </Card>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
