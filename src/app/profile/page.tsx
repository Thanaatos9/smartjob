import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { CvProfileForm } from "./cv-profile-form";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user!.id)
    .maybeSingle();

  return (
    <AppShell
      title="Mon profil"
      subtitle="Ce CV sert à générer automatiquement tes lettres de motivation."
      userName={userDisplayName(user)}
    >
      <Card className="max-w-2xl p-6">
        <ProfileForm profile={profile} email={user!.email!} />
      </Card>
      <Card className="mt-6 max-w-2xl p-6">
        <h2 className="mb-1 text-base font-semibold">CV adapté à chaque offre</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Avec ce profil, smartjob rédige un CV et une lettre d&apos;une page pour chaque offre, et l&apos;extension
          les joint à la candidature à la place de ton CV générique.
        </p>
        <CvProfileForm initial={profile?.cv_profile ?? null} hasPhoto={!!profile?.cv_profile?.photo_path} />
      </Card>
    </AppShell>
  );
}
