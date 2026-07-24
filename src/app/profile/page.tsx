import { createClient } from "@/lib/supabase/server";
import { userDisplayName } from "@/lib/user-display";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";

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
    </AppShell>
  );
}
