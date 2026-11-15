"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ImagePlus, UserRound } from "lucide-react";

// Profil CV structuré : matière unique des CV et lettres adaptés générés pour
// chaque offre (expériences et dates figées, faits chiffrés, axes), et photo.
export function CvProfileForm({
  initial,
  photoUrl,
  photoMode,
}: {
  initial: unknown;
  photoUrl: string | null;
  photoMode: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Aperçu local de la photo choisie, avant même l'enregistrement.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

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
    setMessage({ ok: true, text: data.photo ? "Profil et photo enregistrés" : "Profil enregistré, sans photo" });
    setPreview(null);
    const input = form.elements.namedItem("photo") as HTMLInputElement | null;
    if (input) input.value = "";
    router.refresh();
  }

  const shown = preview ?? photoUrl;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
    >
      <div>
        <p className="mb-2 text-sm font-medium">Photo du CV</p>
        <div className="flex items-center gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt="Photo du CV" className="size-full object-cover" />
            ) : (
              <UserRound className="size-10 text-muted-foreground" aria-hidden />
            )}
          </div>
          <div className="flex flex-col gap-2 text-sm">
            <p className={shown ? "text-success" : "text-muted-foreground"}>
              {preview ? "Nouvelle photo choisie : clique sur Enregistrer" : photoUrl ? "Photo enregistrée" : "Aucune photo enregistrée"}
            </p>
            <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-medium hover:bg-muted">
              <ImagePlus className="size-4" aria-hidden />
              {photoUrl ? "Changer la photo" : "Choisir une photo"}
              <input
                name="photo"
                type="file"
                accept="image/jpeg,image/png"
                className="sr-only"
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  setPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
            </label>
            <p className="text-xs text-muted-foreground">JPEG ou PNG, carrée de préférence, 2 Mo maximum.</p>
          </div>
        </div>
        <label htmlFor="photoMode" className="mt-3 block text-xs font-medium text-muted-foreground">
          Mettre la photo sur les CV
        </label>
        <select
          id="photoMode"
          name="photoMode"
          defaultValue={photoMode}
          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="toujours">Toujours</option>
          <option value="auto">Automatique (retirée pour le Royaume-Uni, l&apos;Irlande, l&apos;Amérique du Nord, l&apos;Australie, Workday et Taleo)</option>
          <option value="jamais">Jamais</option>
        </select>
      </div>

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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {message && <p className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</p>}
      </div>
    </form>
  );
}
