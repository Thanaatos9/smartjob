"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

// Profil CV structuré : matière unique des CV et lettres adaptés générés pour
// chaque offre (expériences et dates figées, faits chiffrés, axes, photo).
export function CvProfileForm({ initial, hasPhoto }: { initial: unknown; hasPhoto: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(form: HTMLFormElement) {
    setPending(true);
    setMessage(null);
    const res = await fetch("/api/profile/cv-profile", { method: "POST", body: new FormData(form) });
    const data = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? "Échec de l'enregistrement" });
      return;
    }
    setMessage({ ok: true, text: data.photo ? "Profil et photo enregistrés" : "Profil enregistré (sans photo)" });
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <div>
        <label htmlFor="cvProfile" className="mb-1.5 block text-sm font-medium">
          Profil CV structuré (JSON)
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          Expériences dans l&apos;ordre antichronologique, avec leurs dates et leurs faits chiffrés. Les CV adaptés
          ne reprennent que ce qui est écrit ici : rien n&apos;est inventé.
        </p>
        <Textarea
          id="cvProfile"
          name="cvProfile"
          rows={12}
          className="font-mono text-xs"
          defaultValue={initial ? JSON.stringify(initial, null, 2) : ""}
          placeholder='{"identite": {...}, "experiences": [...], "formation": [...], "competences": [...]}'
        />
      </div>
      <div>
        <label htmlFor="photo" className="mb-1.5 block text-sm font-medium">
          Photo du CV (JPEG, carrée) {hasPhoto && <span className="text-success">· enregistrée</span>}
        </label>
        <input id="photo" name="photo" type="file" accept="image/jpeg" className="block w-full text-sm" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer le profil CV"}
        </Button>
        {message && (
          <p className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</p>
        )}
      </div>
    </form>
  );
}
